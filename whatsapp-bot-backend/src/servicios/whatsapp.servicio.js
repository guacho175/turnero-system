import axios from "axios";
import { logWhatsAppEvent } from "../metrics/whatsappLogger.js";
import logger from "./logger.servicio.js";
import { logOutgoingMessage } from "./DBlogger.servicio.js";

export function normalizePhoneE164(raw) {
  if (raw === undefined || raw === null) return null;
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

function ensurePhoneForSend(raw) {
  const normalized = normalizePhoneE164(raw);

  if (!normalized) {
    logger.warn("WARN: No se pudo normalizar el número 'to'", { raw });
    return { toSend: String(raw || "").trim(), normalized: null, adjusted: false };
  }

  let toSend = normalized;
  let adjusted = false;

  // Caso especial Argentina: algunos paneles no aceptan el 9 móvil
  if (normalized.startsWith("549") && normalized.length >= 11) {
    const withoutNine = "54" + normalized.slice(3);
    if (withoutNine.length >= 8 && withoutNine.length <= 15) {
      toSend = withoutNine;
      adjusted = true;
    }
  }

  if (normalized !== raw) {
    logger.info("INFO: Número 'to' normalizado", { raw, normalized });
  }

  if (adjusted) {
    logger.info("INFO: Ajuste Argentina: enviando sin el 9 móvil", { original: normalized, toSend });
  }

  return { toSend, normalized, adjusted };
}

function metaConfig() {
  const phoneId = process.env.META_WA_PHONE_NUMBER_ID;
  const token = process.env.META_WA_ACCESS_TOKEN;

  if (!phoneId) throw new Error("Falta META_WA_PHONE_NUMBER_ID en .env");
  if (!token) throw new Error("Falta META_WA_ACCESS_TOKEN en .env");

  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  return { url, token };
}

function detectCategoryForCost(payload) {
  if (payload?.type === "template") return "utility";
  return "service";
}

async function postMeta({ url, token, payload, meta = {} }) {
  const category_for_cost = meta.category_for_cost || detectCategoryForCost(payload);
  const to = payload?.to ? String(payload.to) : null;
  const type = payload?.type ? String(payload.type) : "unknown";

  try {
    const resp = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      timeout: 15000
    });

    logWhatsAppEvent({
      direction: "out",
      to,
      type,
      status: "sent",
      category_for_cost,
      message_id: resp?.data?.messages?.[0]?.id || null,
      wa_payload_kind: meta.wa_payload_kind || null
    });

    return resp.data;
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    const errorCode = data?.error?.code || null;

    logger.error("ERROR: WhatsApp Cloud API error", {
      status,
      responseData: data,
      url,
      payload
    });

    logWhatsAppEvent({
      direction: "out",
      to,
      type,
      status: "error",
      category_for_cost,
      http_status: status ?? null,
      error_code: errorCode,
      error_message: data?.error?.message || err?.message || "unknown_error",
      wa_payload_kind: meta.wa_payload_kind || null
    });

    if (errorCode === 131030) {
      logger.warn("WARN: Meta respondió 131030 (Recipient phone number not in allowed list). Se registra y se sigue el flujo.", { errorCode, to });
      return { error: data?.error || { code: 131030, message: "recipient_not_allowed" }, handled: true };
    }

    throw err;
  }
}

/* =========================
   ✅ Helpers de normalización
   ========================= */

function cortarTexto(s, max) {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

/**
 * Reglas típicas para LIST:
 * - action.button: <= 20
 * - section.title: <= 24
 * - row.title: <= 24
 * - row.description: <= 72
 */
function normalizarLista({ buttonText, sectionTitle, rows }) {
  const safeButton = cortarTexto(buttonText || "Ver opciones", 20);
  const safeSection = cortarTexto(sectionTitle || "Opciones", 24);

  const safeRows = (rows || []).map((r) => ({
    id: String(r?.id ?? "").trim(),
    title: cortarTexto(r?.title || "Opción", 24),
    ...(r?.description ? { description: cortarTexto(r.description, 72) } : {})
  }));

  return { safeButton, safeSection, safeRows };
}

/**
 * Reglas para BOTONES:
 * - reply.title: <= 20  ✅ (este era tu error)
 */
function normalizarBotones(buttons) {
  return (buttons || []).map((b) => ({
    id: String(b?.id ?? "").trim(),
    title: cortarTexto(String(b?.title ?? ""), 20) // 👈 CLAVE
  }));
}

/* =========================
   ✅ Envíos WhatsApp
   ========================= */

// 1) Texto
export async function enviarMensajeWhatsApp({
  to,
  body,
  category_for_cost,
  wa_payload_kind
}) {
  const { url, token } = metaConfig();
  const { toSend: finalTo } = ensurePhoneForSend(to);

  const payload = {
    messaging_product: "whatsapp",
    to: finalTo,
    type: "text",
    text: { body }
  };

  const result = await postMeta({
    url,
    token,
    payload,
    meta: { category_for_cost, wa_payload_kind }
  });

  // ✅ Logging automático a BD
  logOutgoingMessage({
    phoneRaw: to,
    messageType: "text",
    content: body,
    payload: { to, body },
    waMessageId: result?.messages?.[0]?.id,
    waStatus: "sent"
  }).catch(err => logger.error("Error en logOutgoingMessage", { err }));

  return result;
}

/**
 * 2) Botones (máx 3)
 */
export async function enviarBotonesWhatsApp({
  to,
  body,
  buttons,
  category_for_cost,
  wa_payload_kind
}) {
  const { url, token } = metaConfig();
  const { toSend: finalTo } = ensurePhoneForSend(to);

  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) {
    throw new Error("buttons debe tener entre 1 y 3 opciones");
  }

  const safeButtons = normalizarBotones(buttons);

  const payload = {
    messaging_product: "whatsapp",
    to: finalTo,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: safeButtons.map((b) => ({
          type: "reply",
          reply: {
            id: b.id,
            title: b.title // 👈 ya viene <= 20
          }
        }))
      }
    }
  };

  const result = await postMeta({
    url,
    token,
    payload,
    meta: { category_for_cost, wa_payload_kind }
  });

  // ✅ Logging automático a BD
  logOutgoingMessage({
    phoneRaw: to,
    messageType: "button",
    content: body,
    payload: { to, body, buttons },
    waMessageId: result?.messages?.[0]?.id,
    waStatus: "sent"
  }).catch(err => logger.error("Error en logOutgoingMessage", { err }));

  return result;
}

/**
 * 3) Lista
 */
export async function enviarListaWhatsApp({
  to,
  body,
  buttonText = "Ver opciones",
  sectionTitle = "Opciones",
  rows,
  category_for_cost,
  wa_payload_kind
}) {
  const { url, token } = metaConfig();
  const { toSend: finalTo } = ensurePhoneForSend(to);

  if (!Array.isArray(rows) || rows.length < 1) {
    throw new Error("rows debe tener al menos 1 opción");
  }

  const { safeButton, safeSection, safeRows } = normalizarLista({
    buttonText,
    sectionTitle,
    rows
  });

  const finalRows = safeRows.filter((r) => r.id && r.title);

  if (finalRows.length < 1) {
    throw new Error("rows inválidas (id/title vacíos) después de normalizar");
  }

  const payload = {
    messaging_product: "whatsapp",
    to: finalTo,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: safeButton,
        sections: [
          {
            title: safeSection,
            rows: finalRows.map((r) => ({
              id: r.id,
              title: r.title,
              ...(r.description ? { description: r.description } : {})
            }))
          }
        ]
      }
    }
  };

  const result = await postMeta({
    url,
    token,
    payload,
    meta: { category_for_cost, wa_payload_kind }
  });

  // ✅ Logging automático a BD
  logOutgoingMessage({
    phoneRaw: to,
    messageType: "list",
    content: body,
    payload: { to, body, rows },
    waMessageId: result?.messages?.[0]?.id,
    waStatus: "sent"
  }).catch(err => logger.error("Error en logOutgoingMessage", { err }));

  return result;
}

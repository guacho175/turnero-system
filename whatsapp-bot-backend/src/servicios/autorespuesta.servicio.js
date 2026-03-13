// src/servicios/autorespuesta.servicio.js
// ========================================
// Router principal de mensajes entrantes
// Refactorizado: usa módulos separados para UI, steps y utilidades
// ========================================

import { enviarMensajeWhatsApp } from "./whatsapp.servicio.js";
import {
  cargarRespuestasCalendario,
  normalizarTexto,
  detectarIntent
} from "../base_conocimiento/respuestascalendario.servicio.js";
import {
  leerEstado,
  guardarEstado,
  patchEstado,
  limpiarEstado
} from "./estadoAgenda.servicio.js";
import { parseId } from "./flujoGuard.servicio.js";
import { manejarNavegacion } from "./enrutadorConversacion.servicio.js";
import logger from "./logger.servicio.js";
import { logIncomingMessage, logMenuEvent } from "./DBlogger.servicio.js";

// ✅ Nuevos módulos refactorizados
import { whatsappAdapter } from "./whatsappAdapter.servicio.js";
import { renderBuckets, renderPickWeek } from "./flujoAgenda.servicio.js";
import { normalizeIncomingId } from "../utils/string.utils.js";
import { validarNombre, validarEmail, validarFechaManual } from "../utils/validadores.utils.js";
import {
  inferKindFromPrefix,
  handleAskConfirm,
  handleAwaitBucket,
  handleAwaitName,
  handleAwaitDate,
  handleAwaitSlotChoice,
  handleAwaitEmail,
  handleAfterConfirm
} from "./stepsAgenda.servicio.js";

// ========================================
// Configuración y cola de usuarios
// ========================================

const cfg = cargarRespuestasCalendario();
const userQueue = new Map();

/**
 * Encola procesamiento por usuario (evita race conditions)
 * @param {string} from - Número de teléfono
 * @param {Function} fn - Función a ejecutar
 */
function enqueueUser(from, fn) {
  const prev = userQueue.get(from) || Promise.resolve();
  const next = prev
    .catch((e) => logger.error("[enqueueUser] error previo", { from, error: e?.message || e, stack: e?.stack }))
    .then(fn)
    .catch((e) => logger.error("[enqueueUser] error en handler", { from, error: e?.message || e, stack: e?.stack }))
    .finally(() => {
      if (userQueue.get(from) === next) userQueue.delete(from);
    });

  userQueue.set(from, next);
  return next;
}

// ========================================
// Detectores de tipo de mensaje
// ========================================

/**
 * Detecta si es un comando modular (botón/lista)
 */
function esComandoModular(raw) {
  return (
    raw.startsWith("MENU|") ||
    raw.startsWith("CAT|") ||
    raw.startsWith("SERV|") ||
    raw.startsWith("FAQ|") ||
    raw.startsWith("AGENDAR|")
  );
}

/**
 * Detecta si el texto podría ser una consulta modular
 */
function esTextoModular(msgNormalizado) {
  const t = (msgNormalizado || "").toLowerCase();
  return (
    t.includes("servicio") ||
    t.includes("pregunta") ||
    t.includes("faq") ||
    t.includes("contacto") ||
    t.includes("horario") ||
    t.includes("direccion") ||
    t.includes("dirección") ||
    t.includes("menu") ||
    t.includes("menú")
  );
}

// ========================================
// Handlers de comandos modulares
// ========================================

/**
 * Procesa comandos modulares (MENU|, CAT|, etc.)
 */
async function procesarComandoModular(from, raw, ts) {
  limpiarEstado(from);

  const [tipo, a, b] = raw.split("|");
  
  logMenuEvent({
    phoneRaw: from,
    optionCode: raw,
    optionTitle: a || tipo,
    optionDescription: b || "",
    menuLevel: tipo === "MENU" ? 0 : tipo === "CAT" ? 1 : tipo === "SERV" ? 2 : 3,
    actionTaken: "view",
    rawPayload: { buttonId: raw, timestamp: ts }
  }).catch(err => logger.error("Error en logMenuEvent", { err }));

  const r = await manejarNavegacion({
    whatsapp: whatsappAdapter,
    to: from,
    buttonId: raw,
    texto: ""
  });

  if (r?.accion === "DELEGAR_AGENDAMIENTO") {
    if (r.payload?.bucket_key) {
      guardarEstado(from, {
        step: "AWAIT_NAME",
        bucket: String(r.payload.bucket_key).trim(),
        servicioId: String(r.payload.servicio_id || "").trim(),
        expected: null
      });
      await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_nombre });
      return;
    }
    await renderBuckets(from, cfg);
  }
}

/**
 * Procesa intents globales (saludo, agenda)
 */
async function procesarIntentGlobal(from, intent) {
  if (intent === "SALUDO") {
    limpiarEstado(from);
    await manejarNavegacion({ whatsapp: whatsappAdapter, to: from, buttonId: "", texto: "hola" });
    return true;
  }

  if (intent === "AGENDA") {
    limpiarEstado(from);
    await renderBuckets(from, cfg);
    return true;
  }

  return false;
}

// ========================================
// Router de steps
// ========================================

/**
 * Mapa de handlers por step
 */
const stepHandlers = {
  ASK_CONFIRM: handleAskConfirm,
  AWAIT_BUCKET: handleAwaitBucket,
  AWAIT_NAME: handleAwaitName,
  AWAIT_DATE: handleAwaitDate,
  AWAIT_SLOT_CHOICE: handleAwaitSlotChoice,
  AWAIT_EMAIL: handleAwaitEmail,
  AFTER_CONFIRM: handleAfterConfirm
};

/**
 * Procesa el step actual del usuario
 */
async function procesarStep({ from, raw, parsed, kind, intent, estado }) {
  const handler = stepHandlers[estado.step];
  
  if (!handler) {
    return false;
  }

  return await handler({
    from,
    raw,
    parsed,
    kind,
    intent,
    estado,
    cfg,
    whatsappAdapter
  });
}

// ========================================
// Función principal exportada
// ========================================

/**
 * Punto de entrada principal para procesar mensajes entrantes
 * @param {Object} params - { from, texto, ts }
 */
export async function procesarMensajeEntrante({ from, texto, ts }) {
  if (!from) return;

  return enqueueUser(from, async () => {
    const raw = normalizeIncomingId(texto);
    const msg = normalizarTexto(raw);
    const estado = leerEstado(from) || {};

    // Log mensaje entrante
    logIncomingMessage({
      phoneRaw: from,
      messageType: raw.includes("|") ? "interactive" : "text",
      content: raw,
      payload: { from, texto: raw, ts },
      waMessageId: null
    }).catch(err => logger.error("Error en logIncomingMessage", { err }));

    // Evitar procesar mensajes duplicados
    if (typeof ts === "number" && typeof estado.last_ts === "number" && ts <= estado.last_ts) {
      return;
    }
    if (typeof ts === "number") {
      patchEstado(from, { last_ts: ts });
    }

    // 1) Comandos modulares (MENU|, CAT|, etc.)
    if (esComandoModular(raw)) {
      await procesarComandoModular(from, raw, ts);
      return;
    }

    // 2) Texto modular si NO hay agenda activa
    if (!estado.step && esTextoModular(msg)) {
      await manejarNavegacion({ whatsapp: whatsappAdapter, to: from, buttonId: "", texto: raw });
      return;
    }

    // Parsear ID si viene de botón/lista
    const parsed = raw.includes("|") ? parseId(raw) : null;
    const kind = parsed ? inferKindFromPrefix(parsed.prefix) : null;

    // Detectar intent del mensaje
    const intent = detectarIntent(msg, cfg.intents);

    // 3) Intents globales (saludo, agenda)
    if (await procesarIntentGlobal(from, intent)) {
      return;
    }

    // 4) Procesar step actual
    if (estado.step) {
      const handled = await procesarStep({ from, raw, parsed, kind, intent, estado });
      if (handled) return;
    }

    // 5) Fallback
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.fallback });
  });
}

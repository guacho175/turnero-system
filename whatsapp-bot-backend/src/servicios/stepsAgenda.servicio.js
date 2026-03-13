// src/servicios/stepsAgenda.servicio.js
// Handlers para cada step del flujo de agendamiento

import { enviarMensajeWhatsApp } from "./whatsapp.servicio.js";
import { reservarSlotDjango } from "./djangoAgenda.servicio.js";
import {
  leerEstado,
  guardarEstado,
  patchEstado,
  limpiarEstado
} from "./estadoAgenda.servicio.js";
import { isExpectedInteraction, parseId } from "./flujoGuard.servicio.js";
import { manejarNavegacion } from "./enrutadorConversacion.servicio.js";

import { validarNombre, validarEmail, validarFechaManual } from "../utils/validadores.utils.js";
import { STEPS, INTERACTION_KINDS, ID_PREFIXES } from "../utils/constants.js";

import {
  renderBuckets,
  renderPickWeek,
  renderAfterConfirmMenu,
  buscarYMostrarSlots
} from "./flujoAgenda.servicio.js";

import { updateConversationOutcome } from "./DBlogger.servicio.js";
import logger from "./logger.servicio.js";

/**
 * Infiere el kind esperado desde el prefijo del ID parseado
 * @param {string} prefix - Prefijo del ID
 * @returns {string|null} Kind esperado
 */
export function inferKindFromPrefix(prefix) {
  if (prefix === ID_PREFIXES.WELCOME) return INTERACTION_KINDS.WELCOME;
  if (prefix === ID_PREFIXES.BUCKET) return INTERACTION_KINDS.BUCKET;
  if (prefix === ID_PREFIXES.DATE) return INTERACTION_KINDS.DATE_PICK;
  if (prefix === ID_PREFIXES.SLOT) return INTERACTION_KINDS.SLOT_PICK;
  if (prefix === ID_PREFIXES.MENU) return INTERACTION_KINDS.AFTER_MENU;
  return null;
}

/**
 * Handler para step ASK_CONFIRM
 */
export async function handleAskConfirm({ from, parsed, kind, estado, cfg, whatsappAdapter }) {
  if (!parsed || kind !== "welcome") return false;
  if (!isExpectedInteraction(estado, parsed, "welcome")) return false;

  if (parsed.value === "SI") {
    await renderBuckets(from, cfg);
    return true;
  }
  if (parsed.value === "NO") {
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.rechazo });
    limpiarEstado(from);
    return true;
  }
  return false;
}

/**
 * Handler para step AWAIT_BUCKET
 */
export async function handleAwaitBucket({ from, parsed, kind, estado, cfg, whatsappAdapter }) {
  if (!parsed || kind !== "bucket") return false;
  if (!isExpectedInteraction(estado, parsed, "bucket")) return false;

  const bucket = String(parsed.value || "").trim();
  const buckets = Array.isArray(estado.buckets) ? estado.buckets : [];

  if (!bucket || !buckets.includes(bucket)) {
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.bucket_invalido });
    await renderBuckets(from, cfg);
    return true;
  }

  guardarEstado(from, {
    step: "AWAIT_NAME",
    bucket,
    expected: null
  });

  await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_nombre });
  return true;
}

/**
 * Handler para step AWAIT_NAME
 */
export async function handleAwaitName({ from, raw, estado, cfg }) {
  const nombre = validarNombre(raw);
  if (!nombre) {
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.nombre_invalido });
    return true;
  }

  patchEstado(from, { step: "AWAIT_DATE", nombre });
  await renderPickWeek(from, cfg);
  return true;
}

/**
 * Handler para step AWAIT_DATE
 */
export async function handleAwaitDate({ from, raw, parsed, kind, estado, cfg }) {
  if (parsed) {
    if (kind === "date_pick") {
      if (!isExpectedInteraction(estado, parsed, "date_pick")) return false;

      if (parsed.value === "OTRA_FECHA") {
        await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_fecha_manual });
        patchEstado(from, { expected: null });
        return true;
      }

      await buscarYMostrarSlots(from, leerEstado(from) || estado, parsed.value, cfg);
      return true;
    }
    return false;
  }

  // Fecha manual ingresada
  const { valid, ymd } = validarFechaManual(raw);
  if (!valid) {
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.fecha_invalida });
    return true;
  }
  
  await buscarYMostrarSlots(from, leerEstado(from) || estado, ymd, cfg);
  return true;
}

/**
 * Handler para step AWAIT_SLOT_CHOICE
 */
export async function handleAwaitSlotChoice({ from, parsed, kind, estado, cfg }) {
  if (!parsed || kind !== "slot_pick") return false;
  if (!isExpectedInteraction(estado, parsed, "slot_pick")) return false;

  const eventId = String(parsed.value || "").trim();
  if (!eventId) {
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.fallback });
    return true;
  }

  // Buscar el slot seleccionado para obtener professional_key y professional_name
  const slotsGuardados = Array.isArray(estado.slots) ? estado.slots : [];
  const slotSeleccionado = slotsGuardados.find((s) => s.id === eventId);
  const professionalKey = slotSeleccionado?.professional_key || "";
  const professionalName = slotSeleccionado?.professional_name || "";

  patchEstado(from, { step: "AWAIT_EMAIL", eventId, professionalKey, professionalName, expected: null });
  await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.pedir_email });
  return true;
}

/**
 * Handler para step AWAIT_EMAIL
 */
export async function handleAwaitEmail({ from, raw, intent, estado, cfg }) {
  if (intent === "NO") {
    await confirmarReserva(from, estado, "", cfg);
    return true;
  }

  const email = validarEmail(raw);
  if (!email) {
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.email_invalido });
    return true;
  }

  await confirmarReserva(from, estado, email, cfg);
  return true;
}

/**
 * Handler para step AFTER_CONFIRM
 */
export async function handleAfterConfirm({ from, parsed, kind, estado, cfg, whatsappAdapter }) {
  if (!parsed || kind !== "after_menu") return false;
  if (!isExpectedInteraction(estado, parsed, "after_menu")) return false;

  if (parsed.value === "VOLVER_MENU") {
    limpiarEstado(from);
    await manejarNavegacion({ whatsapp: whatsappAdapter, to: from, buttonId: "", texto: "hola" });
    return true;
  }
  if (parsed.value === "SALIR") {
    await enviarMensajeWhatsApp({ to: from, body: cfg.mensajes.despedida });
    limpiarEstado(from);
    return true;
  }

  await renderAfterConfirmMenu(from, cfg);
  return true;
}

/**
 * Confirma la reserva con Django y envía mensaje de confirmación
 * @param {string} to - Número de teléfono
 * @param {Object} estado - Estado actual
 * @param {string} email - Email del cliente (puede ser vacío)
 * @param {Object} cfg - Configuración de mensajes
 */
export async function confirmarReserva(to, estado, email, cfg) {
  await enviarMensajeWhatsApp({ to, body: cfg.mensajes.confirmando });

  await reservarSlotDjango({
    bucket: estado.bucket,
    eventId: estado.eventId,
    customer_name: estado.nombre,
    professional_key: estado.professionalKey || "",
    customer_phone: to,
    notes: "Reserva desde WhatsApp",
    attendee_email: email || ""
  });

  // Buscar la hora del slot seleccionado en el estado guardado
  const slotsGuardados = Array.isArray(estado.slots) ? estado.slots : [];
  const slotSeleccionado = slotsGuardados.find((s) => s.id === estado.eventId);
  const startDateTime = slotSeleccionado?.start?.dateTime || "";
  const [fechaSlot, horaSlot] = startDateTime.split("T");
  const hhmm = (horaSlot || "").substring(0, 5);

  // Construir mensaje de confirmación detallado
  const servicio = estado.bucket || "No especificado";
  const profesional = estado.professionalName || "Por asignar";
  const correo = email || "No proporcionado";
  const fecha = fechaSlot || estado.fecha || "";

  const mensajeConfirmacion = `✅ *Reserva confirmada*

📅 *Fecha:* ${fecha}
🕐 *Hora:* ${hhmm}
💇 *Servicio:* ${servicio}
👤 *Profesional:* ${profesional}
🧑 *Cliente:* ${estado.nombre}
📧 *Correo:* ${correo}

⏰ *Recuerda llegar 15 minutos antes de tu hora.*`;

  await enviarMensajeWhatsApp({ to, body: mensajeConfirmacion });

  await renderAfterConfirmMenu(to, cfg);

  updateConversationOutcome(to, "agendamiento_exitoso")
    .catch(err => logger.error("Error en updateConversationOutcome", { err }));
}

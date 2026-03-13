// src/servicios/flujoAgenda.servicio.js
// Funciones de renderizado y UI para el flujo de agendamiento

import {
  enviarMensajeWhatsApp,
  enviarBotonesWhatsApp,
  enviarListaWhatsApp
} from "./whatsapp.servicio.js";

import {
  leerEstado,
  guardarEstado,
  patchEstado,
  limpiarEstado
} from "./estadoAgenda.servicio.js";

import {
  listarSlotsDisponiblesDjango,
  listarBucketsDjango
} from "./djangoAgenda.servicio.js";

import {
  newPromptToken,
  makeId
} from "./flujoGuard.servicio.js";

import { pad2, addDays, toYMD, weekdayShortEs } from "../utils/fecha.utils.js";
import { tpl } from "../utils/string.utils.js";
import logger from "./logger.servicio.js";

/**
 * Construye filas de fechas a partir de slots disponibles
 * @param {Array} slots - Slots disponibles de Django
 * @param {string} token - Token de sesión
 * @returns {Array} Filas para lista interactiva
 */
export function buildDateRowsFromSlots(slots, token) {
  const fechasSet = new Set();
  
  for (const s of slots) {
    const dt = s?.start?.dateTime || "";
    const fecha = dt.split("T")[0]; // YYYY-MM-DD
    if (fecha) fechasSet.add(fecha);
  }

  const fechas = [...fechasSet].sort();
  const rows = [];

  for (const ymd of fechas.slice(0, 10)) { // máx 10 fechas
    const [y, m, d] = ymd.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const title = `${weekdayShortEs(dateObj)} ${pad2(d)}-${pad2(m)}`;
    rows.push({ id: makeId("DATE", token, ymd), title, description: ymd });
  }

  return rows;
}

/**
 * Convierte slots a filas de lista
 * @param {Array} slots - Slots disponibles
 * @param {string} token - Token de sesión
 * @returns {Array} Filas para lista interactiva
 */
export function slotsToListRows(slots, token) {
  return slots.map((s) => {
    const dt = s?.start?.dateTime || "";
    const [fecha, hora] = dt.split("T");
    const hhmm = (hora || "").substring(0, 5);
    return {
      id: makeId("SLOT", token, s.id),
      title: hhmm,
      description: fecha
    };
  });
}

/**
 * Renderiza selector de buckets (agendas)
 * @param {string} to - Número de teléfono
 * @param {Object} cfg - Configuración de mensajes
 */
export async function renderBuckets(to, cfg) {
  let resp;
  try {
    resp = await listarBucketsDjango();
  } catch (e) {
    logger.error("[renderBuckets] error al listar buckets", { to, error: e?.message || e, stack: e?.stack });
    await enviarMensajeWhatsApp({ to, body: cfg.mensajes.error_conexion_django || "No puedo conectar al servicio de agendas." });
    limpiarEstado(to);
    return;
  }
  
  const buckets = Array.isArray(resp?.buckets) ? resp.buckets : [];
  const uniq = [...new Set(buckets.map((b) => String(b || "").trim()).filter(Boolean))];

  if (uniq.length === 0) {
    await enviarMensajeWhatsApp({ to, body: cfg.mensajes.sin_agendas || "No hay agendas disponibles." });
    limpiarEstado(to);
    return;
  }

  const token = newPromptToken();
  const expected = { kind: "bucket", token, expiresAt: Date.now() + 2 * 60 * 1000 };

  const rows = uniq.slice(0, 10).map((b) => ({ 
    id: makeId("BUCKET", token, b), 
    title: b,
    description: ""
  }));

  await enviarListaWhatsApp({
    to,
    body: cfg.mensajes.elegir_agenda || "Elige una agenda:",
    buttonText: "Ver agendas",
    sectionTitle: "Agendas disponibles",
    rows,
    wa_payload_kind: "pick_bucket"
  });

  patchEstado(to, { step: "AWAIT_BUCKET", buckets: uniq, expected });
}

/**
 * Renderiza selector de semana/fechas
 * @param {string} to - Número de teléfono
 * @param {Object} cfg - Configuración de mensajes
 */
export async function renderPickWeek(to, cfg) {
  const estado = leerEstado(to) || {};
  const bucket = String(estado.bucket || "").trim();

  if (!bucket) {
    await enviarMensajeWhatsApp({ to, body: cfg.mensajes.error_sin_servicio || "Error: no hay servicio seleccionado." });
    limpiarEstado(to);
    return;
  }

  // Consultar slots disponibles de los próximos 30 días
  const today = new Date();
  const desde = toYMD(today);
  const hasta = toYMD(addDays(today, 30));

  let resp;
  try {
    resp = await listarSlotsDisponiblesDjango({
      bucket,
      desde,
      hasta,
      limit: 250
    });
  } catch (e) {
    logger.error("[renderPickWeek] error al listar slots", { to, bucket, error: e?.message || e });
    await enviarMensajeWhatsApp({ to, body: cfg.mensajes.error_conexion_django || "No puedo conectar al servicio de agendas." });
    limpiarEstado(to);
    return;
  }

  const slots = Array.isArray(resp?.slots) ? resp.slots : [];

  if (slots.length === 0) {
    await enviarMensajeWhatsApp({ to, body: cfg.mensajes.sin_horarios_disponibles || "No hay horarios disponibles en este momento." });
    limpiarEstado(to);
    return;
  }

  const token = newPromptToken();
  const expected = { kind: "date_pick", token, expiresAt: Date.now() + 2 * 60 * 1000 };

  const rows = buildDateRowsFromSlots(slots, token);

  await enviarListaWhatsApp({
    to,
    body: cfg.mensajes.pedir_fecha_lista || "Selecciona un día de los próximos 7 días:",
    buttonText: cfg.mensajes.fecha_lista_boton || "Ver días",
    sectionTitle: cfg.mensajes.fecha_lista_section || "Días disponibles",
    rows,
    wa_payload_kind: "pick_date_week_list"
  });

  // Guardar todos los slots para usarlos después
  patchEstado(to, { expected, allSlots: slots });
}

/**
 * Renderiza lista de horarios disponibles
 * @param {string} to - Número de teléfono
 * @param {string} fechaYmd - Fecha en formato YYYY-MM-DD
 * @param {Array} slots - Slots disponibles
 * @param {Object} cfg - Configuración de mensajes
 */
export async function renderSlots(to, fechaYmd, slots, cfg) {
  const token = newPromptToken();
  const expected = { kind: "slot_pick", token, expiresAt: Date.now() + 2 * 60 * 1000 };

  await enviarListaWhatsApp({
    to,
    body: tpl(cfg.mensajes.slots_title, { fecha: fechaYmd }),
    buttonText: cfg.mensajes.slots_button,
    sectionTitle: cfg.mensajes.slots_section,
    rows: slotsToListRows(slots, token),
    wa_payload_kind: "slots_list"
  });

  patchEstado(to, { expected, slots });
}

/**
 * Renderiza menú post-confirmación
 * @param {string} to - Número de teléfono
 * @param {Object} cfg - Configuración de mensajes
 */
export async function renderAfterConfirmMenu(to, cfg) {
  const token = newPromptToken();
  const expected = { kind: "after_menu", token, expiresAt: Date.now() + 3 * 60 * 1000 };

  await enviarBotonesWhatsApp({
    to,
    body: cfg.mensajes.necesitas_algo_mas || "¿Necesitas algo más?",
    buttons: [
      { id: makeId("MENU", token, "VOLVER_MENU"), title: "Volver al menú" },
      { id: makeId("MENU", token, "SALIR"), title: cfg.mensajes.boton_salir || "Salir" }
    ],
    wa_payload_kind: "after_confirm_menu"
  });

  patchEstado(to, { expected, step: "AFTER_CONFIRM" });
}

/**
 * Busca slots para una fecha y los muestra
 * @param {string} to - Número de teléfono
 * @param {Object} estado - Estado actual del usuario
 * @param {string} ymd - Fecha en formato YYYY-MM-DD
 * @param {Object} cfg - Configuración de mensajes
 */
export async function buscarYMostrarSlots(to, estado, ymd, cfg) {
  const bucket = String(estado.bucket || "").trim();
  if (!bucket) {
    await enviarMensajeWhatsApp({ to, body: cfg.mensajes.error_sin_servicio || "Error: no hay servicio seleccionado." });
    limpiarEstado(to);
    return;
  }

  // Usar slots ya cargados si existen, sino consultar API
  let slots = [];
  
  if (Array.isArray(estado.allSlots) && estado.allSlots.length > 0) {
    // Filtrar slots por la fecha seleccionada
    slots = estado.allSlots.filter((s) => {
      const dt = s?.start?.dateTime || "";
      return dt.startsWith(ymd);
    });
  } else {
    // Fallback: consultar API directamente
    await enviarMensajeWhatsApp({ to, body: tpl(cfg.mensajes.buscando, { fecha: ymd }) });

    const resp = await listarSlotsDisponiblesDjango({
      bucket,
      desde: ymd,
      hasta: ymd,
      limit: 100
    });

    slots = Array.isArray(resp?.slots) ? resp.slots : [];
  }

  if (slots.length === 0) {
    await enviarMensajeWhatsApp({ to, body: tpl(cfg.mensajes.sin_horarios, { fecha: ymd }) });
    patchEstado(to, { step: "AWAIT_DATE", fecha: ymd });
    await renderPickWeek(to, cfg);
    return;
  }

  const top = slots.slice(0, 12);

  guardarEstado(to, {
    ...(leerEstado(to) || {}),
    step: "AWAIT_SLOT_CHOICE",
    fecha: ymd,
    slots: top
  });

  await renderSlots(to, ymd, top, cfg);
}

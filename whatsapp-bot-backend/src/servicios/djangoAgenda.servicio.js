// src/servicios/djangoAgenda.servicio.js
// Actualizado para nueva API: /calendar/buckets/...
import axios from "axios";
import logger from "./logger.servicio.js";

function baseUrl() {
  const raw = process.env.DJANGO_API_BASE_URL || "https://175galindez.pythonanywhere.com";
  return String(raw).replace(/\/$/, "");
}

function normalizarBucket(bucket) {
  if (bucket === undefined || bucket === null) {
    throw new Error("[djangoAgenda] Falta bucket");
  }
  const b = String(bucket).trim();
  if (!b) throw new Error("[djangoAgenda] Bucket vacío");
  return b;
}

function normalizarEventId(eventId) {
  if (eventId === undefined || eventId === null) {
    throw new Error("[djangoAgenda] Falta eventId");
  }
  const id = String(eventId).trim();
  if (!id) throw new Error("[djangoAgenda] eventId vacío");
  return id;
}

function normalizarFecha(fecha, campo) {
  if (fecha === undefined || fecha === null) {
    throw new Error(`[djangoAgenda] Falta ${campo}`);
  }
  const s = String(fecha).trim();
  if (!s) throw new Error(`[djangoAgenda] ${campo} vacío`);
  // Si viene ISO, extraer solo YYYY-MM-DD
  return s.split("T")[0];
}

/**
 * ✅ Listar buckets disponibles
 * GET /calendar/buckets/google
 * Retorna: { buckets: ["bucket1", "bucket2", ...] }
 */
export async function listarBucketsDjango() {
  const url = `${baseUrl()}/calendar/buckets/google`;

  logger.debug("[listarBucketsDjango] GET", { url });

  const resp = await axios.get(url, { timeout: 20000 });
  return resp.data;
}

/**
 * ✅ Listar slots disponibles de un bucket
 * GET /calendar/buckets/{bucket}/slots/libres
 * Params: desde (YYYY-MM-DD), hasta (YYYY-MM-DD), limit, professional_key
 * Retorna: { bucket, desde, hasta, count, slots: [...] }
 */
export async function listarSlotsDisponiblesDjango({
  bucket,
  desde,
  hasta,
  limit = 100,
  professionalKey = ""
}) {
  const bucketOk = normalizarBucket(bucket);
  const desdeOk = normalizarFecha(desde, "desde");

  const url = `${baseUrl()}/calendar/buckets/${encodeURIComponent(bucketOk)}/slots/libres`;

  const params = {
    desde: desdeOk,
    limit: Number(limit) || 100
  };

  // hasta es opcional
  if (hasta) {
    params.hasta = normalizarFecha(hasta, "hasta");
  }

  // professional_key es obligatorio para el bot según la API
  if (professionalKey) {
    params.professional_key = String(professionalKey).trim();
  }

  logger.debug("[listarSlotsDisponiblesDjango] GET", { url, params });

  const resp = await axios.get(url, { params, timeout: 20000 });
  return resp.data;
}

/**
 * ✅ Reservar un slot
 * POST /calendar/buckets/{bucket}/slots/{event_id}/reservar
 * Body: customer_name (req), professional_key (req), customer_phone, notes, attendee_email
 */
export async function reservarSlotDjango({
  bucket,
  eventId,
  customer_name,
  professional_key,
  customer_phone = "",
  notes = "",
  attendee_email = ""
}) {
  const bucketOk = normalizarBucket(bucket);
  const eventIdOk = normalizarEventId(eventId);

  const url = `${baseUrl()}/calendar/buckets/${encodeURIComponent(bucketOk)}/slots/${encodeURIComponent(
    eventIdOk
  )}/reservar`;

  const body = {
    customer_name: String(customer_name || "").trim(),
    professional_key: String(professional_key || "").trim(),
    customer_phone: String(customer_phone || "").trim(),
    notes: String(notes || "").trim(),
    attendee_email: String(attendee_email || "").trim()
  };

  if (!body.customer_name) {
    throw new Error("[reservarSlotDjango] Falta customer_name");
  }
  if (!body.professional_key) {
    throw new Error("[reservarSlotDjango] Falta professional_key");
  }

  logger.debug("[reservarSlotDjango] POST", { url, body });

  const resp = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 20000
  });

  return resp.data;
}

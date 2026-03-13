// slot_payload.js
// Lee el formulario y construye el payload que consume el backend. Mantiene el estado de ventanas/bloqueos.

const state = {
  windows: [],
  blocks: [],
};

const WEEKDAY_SELECTOR = "#weekdays input[type=checkbox]";

function parseMinutes(timeStr) {
  if (!timeStr) return 0;
  const raw = String(timeStr).trim();
  if (raw.includes(":")) {
    const [h, m = "0"] = raw.split(":");
    const hh = parseInt(h, 10) || 0;
    const mm = parseInt(m, 10) || 0;
    return hh * 60 + mm;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTime(str) {
  if (!str) return "";
  const raw = String(str).trim();
  const parts = raw.split(":");
  let h = parts[0] || "";
  let m = parts[1] || "00";
  if (h.length === 1) h = "0" + h;
  if (m.length === 1) m = "0" + m;
  return `${h}:${m}`;
}

export function addWindowEntry(start, end) {
  const s = normalizeTime(start);
  const e = normalizeTime(end);
  if (!s || !e) return { ok: false, message: "Completa Inicio y Fin de la ventana." };
  const dup = state.windows.some((w) => w.start === s && w.end === e);
  if (dup) return { ok: false, message: `Ya existe la ventana ${s}–${e}.` };
  state.windows.push({ start: s, end: e });
  return { ok: true };
}

export function deleteWindowEntry(idx) {
  state.windows.splice(idx, 1);
}

export function addBlockEntry(start, end) {
  const s = normalizeTime(start);
  const e = normalizeTime(end);
  if (!s || !e) return { ok: false, message: "Completa Inicio y Fin del bloqueo." };
  const dup = state.blocks.some((b) => b.start === s && b.end === e);
  if (dup) return { ok: false, message: `Ya existe el bloqueo ${s}–${e}.` };
  state.blocks.push({ start: s, end: e });
  return { ok: true };
}

export function deleteBlockEntry(idx) {
  state.blocks.splice(idx, 1);
}

export function clearWindowsBlocks() {
  state.windows.splice(0, state.windows.length);
  state.blocks.splice(0, state.blocks.length);
}

export function getWindows() {
  return state.windows.slice();
}

export function getBlocks() {
  return state.blocks.slice();
}

export function getSelectedBucket() {
  const sel = document.getElementById("bucketSelect");
  const newInput = document.getElementById("bucketNew");
  if (!sel) return "";
  const val = (sel.value || "").trim();
  if (val === "__new__") {
    return (newInput?.value || "").trim();
  }
  return val;
}

function readWeekdays() {
  const checks = document.querySelectorAll(WEEKDAY_SELECTOR);
  const out = [];
  checks.forEach((c) => { if (c.checked) out.push(Number(c.value)); });
  return out;
}

export function buildGenerateSlotsPayload() {
  const range_start_date = document.getElementById("range_start_date")?.value || "";
  const range_end_date = document.getElementById("range_end_date")?.value || "";
  const slot_minutes = parseMinutes(document.getElementById("slot_minutes")?.value);
  const weekdays = readWeekdays();
  const windows = getWindows();
  const blocks = getBlocks();

  const professionalInput = document.getElementById("professional_name");
  const professional = (professionalInput?.value || "").trim();

  const payload = {
    range_start_date,
    range_end_date,
    slot_minutes,
    weekdays,
    windows,
    blocks,
    professional_name: professional,
  };

  return payload;
}

export function validatePayload(payload) {
  if (!payload.professional_name) {
    return { ok: false, message: "El profesional es obligatorio." };
  }
  if (!payload.range_start_date || !payload.range_end_date) {
    return { ok: false, message: "Completa rango de fechas." };
  }
  if (!payload.slot_minutes || payload.slot_minutes <= 0) {
    return { ok: false, message: "Duración inválida." };
  }
  if (!payload.windows || payload.windows.length === 0) {
    return { ok: false, message: "Agrega al menos una ventana." };
  }
  return { ok: true };
}

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "agenda_state.json");

function asegurarArchivo() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify({}, null, 2), "utf-8");
}

function readAll() {
  asegurarArchivo();
  const raw = fs.readFileSync(STATE_FILE, "utf-8");
  return JSON.parse(raw || "{}");
}

function writeAll(data) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function leerEstado(from) {
  const data = readAll();
  return data[from] || { step: "NEW" };
}

export function guardarEstado(from, estado) {
  const data = readAll();
  data[from] = { ...(estado || {}), updatedAt: Date.now() };
  writeAll(data);
}

/**
 * ✅ Merge parcial (no pisa todo el objeto)
 */
export function patchEstado(from, patch) {
  const data = readAll();
  const prev = data[from] || { step: "NEW" };
  data[from] = { ...prev, ...(patch || {}), updatedAt: Date.now() };
  writeAll(data);
  return data[from];
}

export function limpiarEstado(from) {
  const data = readAll();
  delete data[from];
  writeAll(data);
}

/**
 * ✅ Lock simple por usuario (evita doble procesamiento)
 * TTL recomendado: 2500ms
 */
export function tryLock(from, ttlMs = 2500) {
  const data = readAll();
  const st = data[from] || { step: "NEW" };

  const now = Date.now();
  const lockUntil = st.lockUntil || 0;

  if (now < lockUntil) return false;

  st.lockUntil = now + ttlMs;
  data[from] = { ...st, updatedAt: now };
  writeAll(data);
  return true;
}

export function unlock(from) {
  const data = readAll();
  const st = data[from];
  if (!st) return;

  delete st.lockUntil;
  st.updatedAt = Date.now();
  data[from] = st;
  writeAll(data);
}

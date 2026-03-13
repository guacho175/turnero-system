// src/servicios/flujoGuard.servicio.js
import crypto from "crypto";

/**
 * Token corto para identificar “pantalla” interactiva.
 * Mantenerlo corto evita ids enormes.
 */
export function newPromptToken() {
  return crypto.randomBytes(3).toString("hex"); // 6 chars
}

/**
 * Encapsula un id con token:
 *   makeId("BUCKET", token, "uñas") => "BUCKET|a1b2c3|uñas"
 */
export function makeId(prefix, token, value) {
  return `${prefix}|${token}|${String(value ?? "").trim()}`;
}

/**
 * Extrae prefix/token/value desde id:
 *   parseId("BUCKET|a1b2c3|uñas") => { prefix:"BUCKET", token:"a1b2c3", value:"uñas" }
 */
export function parseId(raw) {
  const t = String(raw || "").trim();
  const parts = t.split("|");
  if (parts.length < 3) return null;
  const [prefix, token, ...rest] = parts;
  return { prefix, token, value: rest.join("|") };
}

/**
 * Valida si una interacción corresponde a la última pantalla enviada.
 */
export function isExpectedInteraction(state, parsed, expectedKind) {
  if (!state?.expected) return false;
  if (!parsed?.token) return false;

  const { token, kind, expiresAt } = state.expected;

  if (kind !== expectedKind) return false;
  if (token !== parsed.token) return false;

  // TTL opcional (si expira, se ignora)
  if (expiresAt && Date.now() > expiresAt) return false;

  return true;
}

// src/utils/string.utils.js
// Utilidades de strings reutilizables

/**
 * Reemplaza placeholders {key} en un texto con valores de un objeto
 * @param {string} texto - Texto con placeholders
 * @param {Object} vars - Objeto con valores a reemplazar
 * @returns {string} Texto con valores reemplazados
 * @example tpl("Hola {nombre}", { nombre: "Juan" }) => "Hola Juan"
 */
export function tpl(texto, vars = {}) {
  let out = texto || "";
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return out;
}

/**
 * Normaliza un bucket/categoría para comparación:
 * - Baja a minúsculas
 * - Elimina tildes/diacríticos
 * @param {string} valor - Valor a normalizar
 * @returns {string} Valor normalizado
 * @example normalizarBucket("Aparatología") => "aparatologia"
 */
export function normalizarBucket(valor) {
  const t = String(valor || "").trim().toLowerCase();
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normaliza texto para comparaciones (lowercase + trim)
 * @param {string} texto - Texto a normalizar
 * @returns {string} Texto normalizado
 */
export function normalizarTextoSimple(texto) {
  return (texto || "").toLowerCase().trim();
}

/**
 * Normaliza un ID entrante (trim)
 * @param {string} texto - ID a normalizar
 * @returns {string} ID normalizado
 */
export function normalizeIncomingId(texto) {
  return String(texto || "").trim();
}

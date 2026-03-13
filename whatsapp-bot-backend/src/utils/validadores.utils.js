// src/utils/validadores.utils.js
// Funciones de validación reutilizables

/**
 * Valida un nombre (solo letras, espacios, guiones, apóstrofes)
 * @param {string} texto - Texto a validar
 * @returns {string|null} Nombre validado o null si inválido
 */
export function validarNombre(texto) {
  const t = (texto || "").trim();
  if (t.length < 2) return null;
  if (!/^[a-zA-ZÀ-ÿ\u00f1\u00d1\s'-]+$/.test(t)) return null;
  return t;
}

/**
 * Valida un email
 * @param {string} texto - Texto a validar
 * @returns {string|null} Email validado (lowercase) o null si inválido
 */
export function validarEmail(texto) {
  const t = (texto || "").trim().toLowerCase();
  if (t.length < 6) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return null;
  return t;
}

/**
 * Valida y parsea una fecha en formato DD-MM-YYYY
 * @param {string} texto - Texto a validar
 * @returns {{valid: boolean, ymd: string|null}} Resultado de validación
 */
export function validarFechaManual(texto) {
  const f = (texto || "").trim().replace(/[\/.\s]+/g, "-").replace(/-+/g, "-");
  const m = f.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  
  if (!m) {
    return { valid: false, ymd: null };
  }
  
  const dia = m[1].padStart(2, "0");
  const mes = m[2].padStart(2, "0");
  const anio = m[3];
  
  return { valid: true, ymd: `${anio}-${mes}-${dia}` };
}

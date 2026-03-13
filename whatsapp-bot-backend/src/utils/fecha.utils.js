// src/utils/fecha.utils.js
// Utilidades de fecha reutilizables

/**
 * Rellena con cero a la izquierda
 * @param {number} n - Número a formatear
 * @returns {string} Número con 2 dígitos
 */
export function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Suma días a una fecha
 * @param {Date} dateObj - Fecha base
 * @param {number} days - Días a sumar
 * @returns {Date} Nueva fecha
 */
export function addDays(dateObj, days) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Convierte Date a formato YYYY-MM-DD
 * @param {Date} dateObj - Fecha
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function toYMD(dateObj) {
  const y = dateObj.getFullYear();
  const m = pad2(dateObj.getMonth() + 1);
  const d = pad2(dateObj.getDate());
  return `${y}-${m}-${d}`;
}

/**
 * Obtiene nombre corto del día de la semana en español
 * @param {Date} dateObj - Fecha
 * @returns {string} Día abreviado (Lun, Mar, etc.)
 */
export function weekdayShortEs(dateObj) {
  const map = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return map[dateObj.getDay()];
}

import fs from "fs";
import { normalizarTextoSimple } from "../utils/string.utils.js";

const ruta = new URL("./respuestascalendario.json", import.meta.url);

export function cargarRespuestasCalendario() {
  return JSON.parse(fs.readFileSync(ruta, "utf-8"));
}

// Re-exportar para compatibilidad (usa la función de utils)
export const normalizarTexto = normalizarTextoSimple;

export function contieneAlgunaPalabra(msg, palabras) {
  if (!Array.isArray(palabras) || palabras.length === 0) return false;
  return palabras.some((p) => msg.includes(p));
}

export function detectarIntent(msg, intents) {
  if (contieneAlgunaPalabra(msg, intents.saludo)) return "SALUDO";
  if (contieneAlgunaPalabra(msg, intents.agenda)) return "AGENDA";
  if (contieneAlgunaPalabra(msg, intents.si)) return "SI";
  if (contieneAlgunaPalabra(msg, intents.no)) return "NO";
  if (intents.ack && contieneAlgunaPalabra(msg, intents.ack)) return "ACK";

  // ✅ Legacy (opcional). No rompe si no existen.
  if (intents.agenda_1 && contieneAlgunaPalabra(msg, intents.agenda_1)) return "AGENDA_1";
  if (intents.agenda_2 && contieneAlgunaPalabra(msg, intents.agenda_2)) return "AGENDA_2";
  if (intents.agenda_3 && contieneAlgunaPalabra(msg, intents.agenda_3)) return "AGENDA_3";

  if (intents.otra_fecha && contieneAlgunaPalabra(msg, intents.otra_fecha)) return "OTRA_FECHA";
  if (intents.salir && contieneAlgunaPalabra(msg, intents.salir)) return "SALIR";
  return "DESCONOCIDO";
}

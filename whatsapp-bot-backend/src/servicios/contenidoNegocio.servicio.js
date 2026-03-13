//Lee JSON y entrega data tipada (sin WhatsApp, sin lógica de conversación).

import fs from "fs";
import path from "path";

function leerJson(rutaRelativa) {
  const rutaAbs = path.join(process.cwd(), rutaRelativa);
  const raw = fs.readFileSync(rutaAbs, "utf8");
  return JSON.parse(raw);
}

export function obtenerNegocio() {
  return leerJson("data_config/negocio.json");
}

export function obtenerServicios() {
  return leerJson("data_config/servicios.json");
}

export function obtenerPreguntasFrecuentes() {
  return leerJson("data_config/preguntas_frecuentes.json");
}

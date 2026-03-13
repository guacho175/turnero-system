import logger from "../servicios/logger.servicio.js";
import path from "path";

export function logWhatsAppEvent(event) {
  logger.info("WhatsApp Event", {
    ts: new Date().toISOString(),
    ...event,
  });
}

export const WHATSAPP_LOG_PATH = path.join(process.cwd(), "logs", "app.log");

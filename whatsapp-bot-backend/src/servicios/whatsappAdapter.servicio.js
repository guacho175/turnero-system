// src/servicios/whatsappAdapter.servicio.js
// Adapter de WhatsApp con interfaz simplificada
// NOTA: El logging ahora está integrado en whatsapp.servicio.js

import {
  enviarMensajeWhatsApp,
  enviarBotonesWhatsApp,
  enviarListaWhatsApp
} from "./whatsapp.servicio.js";

/**
 * Adapter de WhatsApp con interfaz simplificada
 * El logging ya está integrado en las funciones base de whatsapp.servicio.js
 */
export function createWhatsAppAdapter() {
  return {
    /**
     * Envía un mensaje de texto
     * @param {string} to - Número destino
     * @param {string} body - Texto del mensaje
     */
    enviarTexto: async (to, body) => {
      return enviarMensajeWhatsApp({ to, body });
    },

    /**
     * Envía mensaje con botones interactivos (máx 3)
     * @param {string} to - Número destino
     * @param {string} body - Texto del mensaje
     * @param {Array} buttons - Array de botones [{id, title}]
     */
    enviarBotones: async (to, body, buttons) => {
      return enviarBotonesWhatsApp({
        to,
        body,
        buttons,
        wa_payload_kind: "menu_modular"
      });
    },

    /**
     * Envía una lista interactiva
     * @param {string} to - Número destino
     * @param {string} body - Texto del mensaje
     * @param {string} buttonText - Texto del botón para abrir lista
     * @param {string} sectionTitle - Título de la sección
     * @param {Array} rows - Filas de la lista [{id, title, description}]
     */
    enviarLista: async (to, body, buttonText, sectionTitle, rows) => {
      return enviarListaWhatsApp({
        to,
        body,
        buttonText,
        sectionTitle,
        rows,
        wa_payload_kind: "menu_modular_lista"
      });
    }
  };
}

/**
 * Instancia singleton del adapter (para compatibilidad)
 */
export const whatsappAdapter = createWhatsAppAdapter();

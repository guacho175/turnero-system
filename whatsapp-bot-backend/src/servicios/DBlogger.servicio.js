// src/servicios/dbLogger.servicio.js
import db from "./db.servicio.js";
import logger from "./logger.servicio.js";
import { yamlLogIncoming, yamlLogOutgoing, yamlMarkSuccess } from "./yamlLogger.servicio.js";

/**
 * Wrapper para logging en DB que NO bloquea el flujo del bot
 * Si hay errores en la DB, se registran en logs pero el bot continúa
 */

// Cache de usuarios activos (evita consultas repetidas)
const userCache = new Map(); // phone -> { userId, conversationId, lastActivity }
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Obtiene o crea un usuario y su conversación activa
 * @param {string} phoneRaw - Número de teléfono
 * @returns {Promise<{userId: string, conversationId: string}>}
 */
export async function ensureUserAndConversation(phoneRaw) {
  if (!phoneRaw) return null;
  
  try {
    // Revisar cache primero
    const cached = userCache.get(phoneRaw);
    if (cached && (Date.now() - cached.lastActivity) < CACHE_TTL) {
      // Actualizar timestamp de actividad
      cached.lastActivity = Date.now();
      return { userId: cached.userId, conversationId: cached.conversationId };
    }
    
    // Crear o actualizar usuario
    const user = await db.upsertUser(phoneRaw);
    
    // Obtener conversación activa o crear una nueva
    let conversation = await db.getActiveConversation(user.id);
    
    if (!conversation) {
      // Crear nueva conversación
      conversation = await db.createConversation(user.id);
      logger.debug("Nueva conversación creada", { 
        userId: user.id, 
        conversationId: conversation.id 
      });
    } else {
      // Verificar si la conversación es muy antigua (> 24h)
      const hoursSinceStart = (Date.now() - new Date(conversation.started_at).getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceStart > 24) {
        // Cerrar conversación antigua y crear nueva
        await db.closeConversation(conversation.id, "completed", "timeout_24h");
        conversation = await db.createConversation(user.id);
        logger.debug("Conversación antigua cerrada, nueva creada", {
          oldConversationId: conversation.id,
          newConversationId: conversation.id
        });
      }
    }
    
    // Actualizar cache
    userCache.set(phoneRaw, {
      userId: user.id,
      conversationId: conversation.id,
      lastActivity: Date.now()
    });
    
    return {
      userId: user.id,
      conversationId: conversation.id
    };
    
  } catch (error) {
    logger.error("Error en ensureUserAndConversation (DB logging disabled)", {
      error: error?.message || error,
      phone: phoneRaw
    });
    return null;
  }
}

/**
 * Registra un mensaje entrante
 * @param {Object} params
 */
export async function logIncomingMessage({ phoneRaw, messageType, content, payload, waMessageId }) {
  try {
    const context = await ensureUserAndConversation(phoneRaw);
    if (!context) return;
    
    await db.insertMessage({
      conversationId: context.conversationId,
      userId: context.userId,
      direction: "incoming",
      messageType,
      content: content?.substring(0, 500) || "", // Máx 500 chars
      payload,
      waMessageId,
      waStatus: "received"
    });
    
    logger.debug("Mensaje entrante registrado en DB", {
      conversationId: context.conversationId,
      messageType
    });

    yamlLogIncoming({
      phoneRaw,
      conversationId: context.conversationId,
      messageType,
      content
    });
    
  } catch (error) {
    logger.error("Error registrando mensaje entrante en DB", {
      error: error?.message || error,
      phone: phoneRaw
    });
  }
}

/**
 * Registra un mensaje saliente
 * @param {Object} params
 */
export async function logOutgoingMessage({ phoneRaw, messageType, content, payload, waMessageId, waStatus }) {
  try {
    const context = await ensureUserAndConversation(phoneRaw);
    if (!context) return;
    
    await db.insertMessage({
      conversationId: context.conversationId,
      userId: context.userId,
      direction: "outgoing",
      messageType,
      content: content?.substring(0, 500) || "",
      payload,
      waMessageId,
      waStatus: waStatus || "sent"
    });
    
    logger.debug("Mensaje saliente registrado en DB", {
      conversationId: context.conversationId,
      messageType
    });

    yamlLogOutgoing({
      phoneRaw,
      conversationId: context.conversationId,
      messageType,
      content
    });
    
  } catch (error) {
    logger.error("Error registrando mensaje saliente en DB", {
      error: error?.message || error,
      phone: phoneRaw
    });
  }
}

/**
 * Registra un evento de menú
 * @param {Object} params
 */
export async function logMenuEvent({ 
  phoneRaw, 
  optionCode, 
  optionTitle, 
  optionDescription = "",
  menuLevel,
  actionTaken = "view",
  rawPayload = {}
}) {
  try {
    const context = await ensureUserAndConversation(phoneRaw);
    if (!context) return;
    
    // Determinar categoría del menú basándose en el código
    let menuCategory = "navegacion";
    if (optionCode.startsWith("SERV|")) menuCategory = "servicio";
    else if (optionCode.startsWith("FAQ|")) menuCategory = "faq";
    else if (optionCode.startsWith("AGENDAR|")) menuCategory = "accion";
    
    await db.insertMenuEvent({
      conversationId: context.conversationId,
      userId: context.userId,
      optionCode,
      optionTitle,
      optionDescription,
      menuLevel,
      menuCategory,
      actionTaken,
      rawPayload
    });
    
    logger.debug("Evento de menú registrado en DB", {
      conversationId: context.conversationId,
      optionCode,
      menuLevel
    });
    
    // Actualizar intent de la conversación basándose en la interacción
    if (optionCode.startsWith("MENU|AGENDAR") || optionCode.startsWith("AGENDAR|")) {
      await db.query(
        "UPDATE conversations SET intent = $1 WHERE id = $2",
        ["agendar", context.conversationId]
      );
    } else if (optionCode.startsWith("MENU|SERVICIOS") || optionCode.startsWith("SERV|")) {
      await db.query(
        "UPDATE conversations SET intent = $1 WHERE id = $2 AND intent IS NULL",
        ["info_servicios", context.conversationId]
      );
    } else if (optionCode.startsWith("MENU|FAQ") || optionCode.startsWith("FAQ|")) {
      await db.query(
        "UPDATE conversations SET intent = $1 WHERE id = $2 AND intent IS NULL",
        ["faq", context.conversationId]
      );
    } else if (optionCode.startsWith("MENU|CONTACTO")) {
      await db.query(
        "UPDATE conversations SET intent = $1 WHERE id = $2 AND intent IS NULL",
        ["contacto", context.conversationId]
      );
    } else if (optionCode.startsWith("MENU|HUMANO")) {
      await db.query(
        "UPDATE conversations SET intent = $1, outcome = $2 WHERE id = $3",
        ["humano", "derivado_humano", context.conversationId]
      );
    }
    
  } catch (error) {
    logger.error("Error registrando evento de menú en DB", {
      error: error?.message || error,
      phone: phoneRaw,
      optionCode
    });
  }
}

/**
 * Actualiza el outcome de una conversación
 * @param {string} phoneRaw
 * @param {string} outcome - 'agendamiento_exitoso' | 'solo_consulta' | 'error'
 */
export async function updateConversationOutcome(phoneRaw, outcome) {
  try {
    const context = await ensureUserAndConversation(phoneRaw);
    if (!context) return;
    
    await db.query(
      "UPDATE conversations SET outcome = $1 WHERE id = $2",
      [outcome, context.conversationId]
    );

    if (outcome === "agendamiento_exitoso") {
      yamlMarkSuccess(context.conversationId);
    }
    
    logger.debug("Outcome de conversación actualizado", {
      conversationId: context.conversationId,
      outcome
    });
    
  } catch (error) {
    logger.error("Error actualizando outcome de conversación", {
      error: error?.message || error,
      phone: phoneRaw
    });
  }
}

/**
 * Limpia el cache (útil para testing)
 */
export function clearCache() {
  userCache.clear();
  logger.debug("Cache de usuarios limpiado");
}

export default {
  ensureUserAndConversation,
  logIncomingMessage,
  logOutgoingMessage,
  logMenuEvent,
  updateConversationOutcome,
  clearCache
};




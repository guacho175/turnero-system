// src/servicios/db.servicio.js
import dotenv from "dotenv";
dotenv.config(); // ← CARGAR PRIMERO

import pg from "pg";
import logger from "./logger.servicio.js";

const { Pool } = pg;

// ============================================================================
// CONFIGURACIÓN DEL POOL DE CONEXIONES
// ============================================================================

/**
 * Pool de conexiones a PostgreSQL
 * - Reutiliza conexiones en lugar de crear una nueva cada vez
 * - Maneja automáticamente el cierre de conexiones inactivas
 * - Thread-safe para múltiples requests concurrentes
 */

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "whatsapp_bot_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD?.replace(/^["']|["']$/g, ''), // Elimina comillas si existen
  
  // Configuración del pool
  max: 20,                    // Máximo 20 conexiones simultáneas
  idleTimeoutMillis: 30000,   // Cerrar conexiones inactivas después de 30s
  connectionTimeoutMillis: 5000, // Timeout al intentar conectar: 5s
});

// Logs de eventos del pool
pool.on("connect", () => {
  logger.info("Nueva conexión establecida con PostgreSQL");
});

pool.on("error", (err) => {
  logger.error("Error inesperado en el pool de PostgreSQL", { 
    error: err?.message || err, 
    stack: err?.stack 
  });
});

// ============================================================================
// FUNCIONES HELPER GENERALES
// ============================================================================

/**
 * Ejecuta una query SQL genérica
 * @param {string} text - Query SQL (puede usar $1, $2, etc. para parámetros)
 * @param {Array} params - Parámetros para la query
 * @returns {Promise<Object>} Resultado de la query
 */
export async function query(text, params = []) {
  const start = Date.now();
  
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug("Query ejecutada", { 
      duration_ms: duration,
      rows: result.rowCount,
      query: text.substring(0, 100) // Solo primeros 100 chars para no saturar logs
    });
    
    return result;
  } catch (err) {
    logger.error("Error ejecutando query", {
      error: err?.message || err,
      stack: err?.stack,
      query: text,
      params
    });
    throw err;
  }
}

/**
 * Obtiene una conexión del pool (para transacciones)
 * Recuerda liberar la conexión con client.release() al terminar
 */
export async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Hash de número de teléfono usando la función de PostgreSQL
 * @param {string} phoneNumber - Número de teléfono
 * @returns {Promise<string>} Hash SHA256
 */
export async function hashPhone(phoneNumber) {
  const result = await query("SELECT hash_phone($1) as hash", [phoneNumber]);
  return result.rows[0]?.hash || null;
}

/**
 * Verifica la conexión a la base de datos
 * @returns {Promise<boolean>}
 */
export async function testConnection() {
  try {
    const result = await query("SELECT NOW() as current_time, version()");
    logger.info("Conexión a PostgreSQL verificada", {
      server_time: result.rows[0]?.current_time,
      version: result.rows[0]?.version?.substring(0, 50)
    });
    return true;
  } catch (err) {
    logger.error("Fallo al conectar con PostgreSQL", { 
      error: err?.message || err 
    });
    return false;
  }
}

/**
 * Cierra todas las conexiones del pool
 * (Usar solo al apagar el servidor)
 */
export async function closePool() {
  await pool.end();
  logger.info("Pool de PostgreSQL cerrado");
}

// ============================================================================
// FUNCIONES ESPECÍFICAS DE NEGOCIO
// ============================================================================

/**
 * Crea o actualiza un usuario basado en su teléfono
 * @param {string} phoneRaw - Número de teléfono sin procesar
 * @returns {Promise<Object>} Usuario creado o actualizado
 */
export async function upsertUser(phoneRaw) {
  if (!phoneRaw) throw new Error("phoneRaw es requerido");
  
  const phoneHash = await hashPhone(phoneRaw);
  
  const result = await query(
    `INSERT INTO users (phone_hash, phone_raw, first_seen, last_seen)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (phone_hash) 
     DO UPDATE SET 
       last_seen = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [phoneHash, phoneRaw]
  );
  
  return result.rows[0];
}

/**
 * Obtiene un usuario por su hash de teléfono
 * @param {string} phoneRaw - Número de teléfono
 * @returns {Promise<Object|null>}
 */
export async function getUserByPhone(phoneRaw) {
  if (!phoneRaw) return null;
  
  const phoneHash = await hashPhone(phoneRaw);
  
  const result = await query(
    "SELECT * FROM users WHERE phone_hash = $1",
    [phoneHash]
  );
  
  return result.rows[0] || null;
}

/**
 * Crea una nueva conversación
 * @param {string} userId - UUID del usuario
 * @param {string} intent - Intención inicial (opcional)
 * @returns {Promise<Object>}
 */
export async function createConversation(userId, intent = null) {
  if (!userId) throw new Error("userId es requerido");
  
  const result = await query(
    `INSERT INTO conversations (user_id, started_at, status, intent)
     VALUES ($1, NOW(), 'active', $2)
     RETURNING *`,
    [userId, intent]
  );
  
  // Incrementar contador en users
  await query(
    "UPDATE users SET total_conversations = total_conversations + 1 WHERE id = $1",
    [userId]
  );
  
  return result.rows[0];
}

/**
 * Obtiene la conversación activa de un usuario
 * @param {string} userId - UUID del usuario
 * @returns {Promise<Object|null>}
 */
export async function getActiveConversation(userId) {
  if (!userId) return null;
  
  const result = await query(
    `SELECT * FROM conversations 
     WHERE user_id = $1 AND status = 'active' 
     ORDER BY started_at DESC 
     LIMIT 1`,
    [userId]
  );
  
  return result.rows[0] || null;
}

/**
 * Cierra una conversación
 * @param {string} conversationId - UUID de la conversación
 * @param {string} status - Estado final ('completed' | 'abandoned')
 * @param {string} outcome - Resultado (opcional)
 * @returns {Promise<Object>}
 */
export async function closeConversation(conversationId, status = "completed", outcome = null) {
  if (!conversationId) throw new Error("conversationId es requerido");
  
  const result = await query(
    `UPDATE conversations 
     SET ended_at = NOW(), status = $2, outcome = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [conversationId, status, outcome]
  );
  
  return result.rows[0];
}

/**
 * Registra un mensaje
 * @param {Object} params
 * @param {string} params.conversationId - UUID de la conversación
 * @param {string} params.userId - UUID del usuario
 * @param {string} params.direction - 'incoming' | 'outgoing'
 * @param {string} params.messageType - 'text' | 'button' | 'list' | etc.
 * @param {string} params.content - Contenido legible
 * @param {Object} params.payload - Payload completo (JSON)
 * @param {string} params.waMessageId - ID de WhatsApp (opcional)
 * @param {string} params.waStatus - Estado de WhatsApp (opcional)
 * @returns {Promise<Object>}
 */
export async function insertMessage({
  conversationId,
  userId,
  direction,
  messageType,
  content = "",
  payload = {},
  waMessageId = null,
  waStatus = null
}) {
  if (!conversationId || !userId || !direction || !messageType) {
    throw new Error("conversationId, userId, direction y messageType son requeridos");
  }
  
  const result = await query(
    `INSERT INTO messages 
     (conversation_id, user_id, direction, message_type, content, payload, wa_message_id, wa_status, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING *`,
    [conversationId, userId, direction, messageType, content, JSON.stringify(payload), waMessageId, waStatus]
  );
  
  // Incrementar contadores
  await query(
    "UPDATE users SET total_messages = total_messages + 1 WHERE id = $1",
    [userId]
  );
  
  await query(
    "UPDATE conversations SET total_messages = total_messages + 1 WHERE id = $1",
    [conversationId]
  );
  
  return result.rows[0];
}

/**
 * Registra un evento de menú
 * @param {Object} params
 * @param {string} params.conversationId - UUID de la conversación
 * @param {string} params.userId - UUID del usuario
 * @param {string} params.optionCode - Código de la opción (ej: 'SERV|hilos_faciales')
 * @param {string} params.optionTitle - Título de la opción
 * @param {string} params.optionDescription - Descripción (opcional)
 * @param {number} params.menuLevel - Nivel del menú (0, 1, 2, etc.)
 * @param {string} params.menuCategory - Categoría ('navegacion' | 'servicio' | 'faq' | 'accion')
 * @param {string} params.actionTaken - Acción ('view' | 'agendar' | 'back' | 'exit')
 * @param {Object} params.rawPayload - Payload completo (JSON)
 * @returns {Promise<Object>}
 */
export async function insertMenuEvent({
  conversationId,
  userId,
  optionCode,
  optionTitle,
  optionDescription = "",
  menuLevel,
  menuCategory = "navegacion",
  actionTaken = "view",
  rawPayload = {}
}) {
  if (!conversationId || !userId || !optionCode || !optionTitle || menuLevel === undefined) {
    throw new Error("conversationId, userId, optionCode, optionTitle y menuLevel son requeridos");
  }
  
  const result = await query(
    `INSERT INTO menu_events 
     (conversation_id, user_id, option_code, option_title, option_description, 
      menu_level, menu_category, action_taken, raw_payload, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     RETURNING *`,
    [
      conversationId, 
      userId, 
      optionCode, 
      optionTitle, 
      optionDescription,
      menuLevel, 
      menuCategory, 
      actionTaken, 
      JSON.stringify(rawPayload)
    ]
  );
  
  // Incrementar contador en users
  await query(
    "UPDATE users SET total_menu_interactions = total_menu_interactions + 1 WHERE id = $1",
    [userId]
  );
  
  return result.rows[0];
}

/**
 * Registra un evento crudo (para debugging)
 * @param {string} rawLine - Línea de log cruda
 * @param {string} source - Origen ('webhook' | 'log_file' | 'manual')
 * @returns {Promise<Object>}
 */
export async function insertRawEvent(rawLine, source = "webhook") {
  if (!rawLine) throw new Error("rawLine es requerido");
  
  const result = await query(
    `INSERT INTO raw_events (raw_line, source, received_at)
     VALUES ($1, $2, NOW())
     RETURNING *`,
    [rawLine, source]
  );
  
  return result.rows[0];
}

/**
 * Marca un evento crudo como parseado
 * @param {string} rawEventId - UUID del raw_event
 * @param {boolean} success - Si el parseo fue exitoso
 * @param {string} error - Mensaje de error (si hubo)
 * @returns {Promise<Object>}
 */
export async function markRawEventParsed(rawEventId, success = true, error = null) {
  if (!rawEventId) throw new Error("rawEventId es requerido");
  
  const result = await query(
    `UPDATE raw_events 
     SET parsed = $2, parse_error = $3, processed_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [rawEventId, success, error]
  );
  
  return result.rows[0];
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
  query,
  getClient,
  hashPhone,
  testConnection,
  closePool,
  
  // User operations
  upsertUser,
  getUserByPhone,
  
  // Conversation operations
  createConversation,
  getActiveConversation,
  closeConversation,
  
  // Message operations
  insertMessage,
  
  // Menu event operations
  insertMenuEvent,
  
  // Raw event operations
  insertRawEvent,
  markRawEventParsed
};

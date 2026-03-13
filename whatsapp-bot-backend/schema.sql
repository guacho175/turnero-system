-- ============================================================================
-- ESQUEMA DE BASE DE DATOS PARA WHATSAPP BOT - DR. BEAUTY MENDOZA
-- ============================================================================
-- Versión: 1.0
-- Descripción: Base de datos para almacenar interacciones del chatbot y 
--              generar insights para decisiones de negocio
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONES
-- -----------------------------------------------------------------------------

-- UUID para identificadores únicos
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto para hashing de teléfonos (privacidad)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- -----------------------------------------------------------------------------
-- 2. TABLA: users
-- -----------------------------------------------------------------------------
-- Propósito: Identificación única de cada cliente que interactúa con el bot
-- Métricas: Total de clientes únicos, clientes activos, recurrencia

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identificación (privacidad)
  phone_hash TEXT UNIQUE NOT NULL,           -- SHA256 del número, para identificar sin exponer
  phone_raw TEXT,                            -- Opcional: número real (considerar cifrado en producción)
  
  -- Metadatos
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Contadores (desnormalizados para performance)
  total_conversations INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  total_menu_interactions INTEGER DEFAULT 0,
  
  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para users
CREATE INDEX idx_users_phone_hash ON users(phone_hash);
CREATE INDEX idx_users_last_seen ON users(last_seen DESC);
CREATE INDEX idx_users_first_seen ON users(first_seen DESC);

-- Comentarios
COMMENT ON TABLE users IS 'Clientes únicos del chatbot';
COMMENT ON COLUMN users.phone_hash IS 'Hash SHA256 del número de teléfono para privacidad';
COMMENT ON COLUMN users.phone_raw IS 'Número real (opcional, considerar cifrado)';


-- -----------------------------------------------------------------------------
-- 3. TABLA: conversations
-- -----------------------------------------------------------------------------
-- Propósito: Agrupar mensajes en sesiones lógicas de interacción
-- Métricas: Duración promedio, tasa de conversión, puntos de abandono

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Tiempos
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,                      -- NULL = conversación activa
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'active',     -- 'active' | 'completed' | 'abandoned'
  
  -- Intención detectada (se actualiza durante la conversación)
  intent TEXT,                                -- 'info_servicios' | 'agendar' | 'faq' | 'contacto' | 'humano'
  
  -- Resultado
  outcome TEXT,                               -- 'agendamiento_exitoso' | 'solo_consulta' | 'error' | 'derivado_humano'
  
  -- Métricas calculadas
  total_messages INTEGER DEFAULT 0,
  duration_seconds INTEGER,                   -- calculado: ended_at - started_at
  
  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para conversations
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_started_at ON conversations(started_at DESC);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_intent ON conversations(intent);
CREATE INDEX idx_conversations_outcome ON conversations(outcome);

-- Índice compuesto para queries de análisis
CREATE INDEX idx_conversations_user_status ON conversations(user_id, status);

-- Comentarios
COMMENT ON TABLE conversations IS 'Sesiones de interacción agrupadas temporalmente';
COMMENT ON COLUMN conversations.intent IS 'Intención principal detectada en la conversación';
COMMENT ON COLUMN conversations.outcome IS 'Resultado final de la conversación';


-- -----------------------------------------------------------------------------
-- 4. TABLA: messages
-- -----------------------------------------------------------------------------
-- Propósito: Registro detallado de todos los mensajes intercambiados
-- Métricas: Tiempo de respuesta, volumen por hora, errores

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- Desnormalizado para queries rápidas
  
  -- Timestamp
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Dirección
  direction TEXT NOT NULL,                    -- 'incoming' | 'outgoing'
  
  -- Tipo de mensaje
  message_type TEXT NOT NULL,                 -- 'text' | 'button' | 'list' | 'interactive' | 'image' | 'document'
  
  -- Contenido
  content TEXT,                               -- Texto legible (máx 500 chars para resumen)
  payload JSONB,                              -- Datos crudos del webhook de WhatsApp
  
  -- Metadata de WhatsApp
  wa_message_id TEXT,                         -- ID único de WhatsApp (para deduplicación)
  wa_status TEXT,                             -- 'sent' | 'delivered' | 'read' | 'failed'
  
  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para messages
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_messages_direction ON messages(direction);
CREATE INDEX idx_messages_wa_message_id ON messages(wa_message_id);

-- Índice compuesto para análisis temporal
CREATE INDEX idx_messages_timestamp_direction ON messages(timestamp DESC, direction);

-- Índice GIN para búsqueda en JSONB
CREATE INDEX idx_messages_payload ON messages USING GIN(payload);

-- Comentarios
COMMENT ON TABLE messages IS 'Todos los mensajes intercambiados (entrantes y salientes)';
COMMENT ON COLUMN messages.payload IS 'Datos crudos del webhook de WhatsApp en formato JSON';
COMMENT ON COLUMN messages.wa_message_id IS 'ID de WhatsApp para deduplicación';


-- -----------------------------------------------------------------------------
-- 5. TABLA: menu_events
-- -----------------------------------------------------------------------------
-- Propósito: Análisis específico de navegación por menús (CLAVE PARA NEGOCIO)
-- Métricas: Servicios más consultados, funnel de conversión, puntos de fricción

CREATE TABLE menu_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- Desnormalizado
  
  -- Timestamp
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Identificación del elemento de menú
  option_code TEXT NOT NULL,                  -- 'MENU|SERVICIOS', 'CAT|faciales', 'SERV|hilos_faciales_ovalo'
  option_title TEXT NOT NULL,                 -- 'Servicios', 'Tratamientos Faciales', 'Hilos Tensores'
  option_description TEXT,                    -- Descripción si existe
  
  -- Clasificación
  menu_level INTEGER NOT NULL,                -- 0=principal, 1=categoría, 2=servicio, 3=acción
  menu_category TEXT,                         -- 'navegacion' | 'servicio' | 'faq' | 'accion'
  
  -- Acción tomada
  action_taken TEXT,                          -- 'view' | 'agendar' | 'back' | 'exit'
  
  -- Metadata adicional
  raw_payload JSONB,                          -- Payload completo del evento
  
  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para menu_events
CREATE INDEX idx_menu_events_conversation_id ON menu_events(conversation_id);
CREATE INDEX idx_menu_events_user_id ON menu_events(user_id);
CREATE INDEX idx_menu_events_timestamp ON menu_events(timestamp DESC);
CREATE INDEX idx_menu_events_option_code ON menu_events(option_code);
CREATE INDEX idx_menu_events_menu_level ON menu_events(menu_level);
CREATE INDEX idx_menu_events_menu_category ON menu_events(menu_category);

-- Índice compuesto para ranking de opciones
CREATE INDEX idx_menu_events_code_timestamp ON menu_events(option_code, timestamp DESC);

-- Índice GIN para búsqueda en JSONB
CREATE INDEX idx_menu_events_payload ON menu_events USING GIN(raw_payload);

-- Comentarios
COMMENT ON TABLE menu_events IS 'Eventos de navegación por menús para análisis de negocio';
COMMENT ON COLUMN menu_events.option_code IS 'Código único de la opción (ej: SERV|hilos_faciales_ovalo)';
COMMENT ON COLUMN menu_events.menu_level IS 'Nivel de profundidad: 0=principal, 1=categoría, 2=servicio';


-- -----------------------------------------------------------------------------
-- 6. TABLA: raw_events (opcional - para debugging)
-- -----------------------------------------------------------------------------
-- Propósito: Almacenar eventos crudos antes de parsear (auditoría y troubleshooting)

CREATE TABLE raw_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Contenido crudo
  raw_line TEXT NOT NULL,
  source TEXT,                                -- 'webhook' | 'log_file' | 'manual'
  
  -- Estado de procesamiento
  parsed BOOLEAN DEFAULT FALSE,
  parse_error TEXT,
  
  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para raw_events
CREATE INDEX idx_raw_events_parsed ON raw_events(parsed);
CREATE INDEX idx_raw_events_received_at ON raw_events(received_at DESC);

COMMENT ON TABLE raw_events IS 'Eventos crudos para auditoría y troubleshooting';


-- -----------------------------------------------------------------------------
-- 7. FUNCIONES HELPER
-- -----------------------------------------------------------------------------

-- Función para actualizar el campo updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- Función para calcular duración de conversación al cerrarla
CREATE OR REPLACE FUNCTION calculate_conversation_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_duration BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION calculate_conversation_duration();


-- Función para crear hash de teléfono
CREATE OR REPLACE FUNCTION hash_phone(phone_number TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(digest(phone_number, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION hash_phone IS 'Genera hash SHA256 de un número de teléfono para privacidad';


-- -----------------------------------------------------------------------------
-- 8. VISTAS ÚTILES PARA ANÁLISIS
-- -----------------------------------------------------------------------------

-- Vista: Resumen de usuarios activos
CREATE OR REPLACE VIEW v_active_users AS
SELECT 
  u.id,
  u.phone_hash,
  u.first_seen,
  u.last_seen,
  u.total_conversations,
  u.total_messages,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active') as active_conversations,
  MAX(c.started_at) as last_conversation_start
FROM users u
LEFT JOIN conversations c ON u.id = c.user_id
GROUP BY u.id;

COMMENT ON VIEW v_active_users IS 'Resumen de actividad por usuario';


-- Vista: Top servicios consultados
CREATE OR REPLACE VIEW v_top_services AS
SELECT 
  option_code,
  option_title,
  COUNT(*) as total_views,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT conversation_id) as unique_conversations,
  MAX(timestamp) as last_viewed
FROM menu_events
WHERE option_code LIKE 'SERV|%'
GROUP BY option_code, option_title
ORDER BY total_views DESC;

COMMENT ON VIEW v_top_services IS 'Ranking de servicios más consultados';


-- -----------------------------------------------------------------------------
-- 9. DATOS INICIALES (SEED)
-- -----------------------------------------------------------------------------

-- Insertar tipos de intent válidos (opcional, para validación)
-- CREATE TABLE intent_types (
--   code TEXT PRIMARY KEY,
--   description TEXT
-- );
-- INSERT INTO intent_types VALUES 
--   ('info_servicios', 'Usuario consultando información de servicios'),
--   ('agendar', 'Usuario intentando agendar una cita'),
--   ('faq', 'Usuario consultando preguntas frecuentes'),
--   ('contacto', 'Usuario solicitando información de contacto'),
--   ('humano', 'Usuario pidiendo hablar con una persona');


-- -----------------------------------------------------------------------------
-- FIN DEL SCHEMA
-- -----------------------------------------------------------------------------

-- Resumen de tablas creadas:
-- ✅ users (clientes únicos)
-- ✅ conversations (sesiones de interacción)
-- ✅ messages (todos los mensajes)
-- ✅ menu_events (navegación por menús)
-- ✅ raw_events (eventos crudos para auditoría)
-- ✅ Funciones helper (triggers automáticos)
-- ✅ Vistas de análisis

-- Para aplicar este schema:
-- psql -U postgres -d whatsapp_bot_db -f schema.sql

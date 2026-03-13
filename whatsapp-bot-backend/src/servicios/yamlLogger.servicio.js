// src/servicios/yamlLogger.servicio.js
import fs from "fs";                        // Leer/escribir archivos en el disco
import path from "path";                    // Construir rutas de carpetas/archivos
import yaml from "js-yaml";                 // Convertir objetos JS a formato YAML
import logger from "./logger.servicio.js";  // Logs de sistema

// Carpeta donde se guardan los YAMLs
const CONV_DIR = path.resolve("YAMLs");

// Timestamp de inicio del servidor para separadar instancias de la conversacion
const SERVER_START = Date.now();

// Cache en memoria: phone -> { filePath, data }
const convCache = new Map();

/**
 * Asegura que la carpeta YAMLs/ existe
 */
function ensureDir() {
  if (!fs.existsSync(CONV_DIR)) {
    fs.mkdirSync(CONV_DIR, { recursive: true });
  }
}

/**
 * Genera el nombre del archivo YAML
 */
function buildFileName(phoneRaw, conversationId) {
  const fecha = new Date().toISOString().split("T")[0];
  const serverTime = new Date(SERVER_START).toTimeString().split(" ")[0].replace(/:/g, "-");
  const shortId = conversationId.substring(0, 6);
  const phone = phoneRaw.replace(/\D/g, "");
  return path.join(CONV_DIR, `${fecha}_${serverTime}_${phone}_${shortId}.yaml`);
}

/**
 * Lee o crea la estructura de datos de una conversación
 */
function getOrCreateConvData(phoneRaw, conversationId) {
  // 1. Busca en el cache
  const cached = convCache.get(conversationId);
  if (cached) return cached;
  
  // Si el archivo ya existe, cargarlo
  const filePath = buildFileName(phoneRaw, conversationId);
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const data = yaml.load(content);
      convCache.set(conversationId, { filePath, data });
      return { filePath, data };
    } catch (e) {
      logger.error("[yamlLogger] Error leyendo YAML existente", { error: e?.message });
    }
  }

  // Crear estructura nueva
  const data = {
    conversacion: {
      id: conversationId,
      fecha_inicio: new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Mendoza" }),
      fecha_fin: null,
      estado: "activa",
      intent: null,
      outcome: null,
    },
    usuario: {
      telefono: phoneRaw,
    },
    mensajes: [],
    resumen: {
      total_mensajes: 0,
      servicios_vistos: [],
      intento_agendar: false,
      agendamiento_exitoso: false,
    },
  };

  convCache.set(conversationId, { filePath, data });
  return { filePath, data };
}

/**
 * Escribe el YAML en disco
 */
function writeYaml(filePath, data) {
  try {
    ensureDir();
    const content = yaml.dump(data, {
      allowUnicode: true,
      lineWidth: 120,
      indent: 2,
    });
    fs.writeFileSync(filePath, content, "utf8");
  } catch (e) {
    logger.error("[yamlLogger] Error escribiendo YAML", { error: e?.message, filePath });
  }
}

/**
 * Obtiene hora actual en formato HH:MM:SS (Argentina)
 */
function horaActual() {
  return new Date().toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Mendoza" });
}


/**
 * Registra un mensaje entrante en el YAML
 */
export function yamlLogIncoming({ phoneRaw, conversationId, messageType, content }) {
  try {
    const { filePath, data } = getOrCreateConvData(phoneRaw, conversationId);

    const entrada = {
      ts: horaActual(),
      direccion: "entrante",
      tipo: messageType,
      contenido: content || "",
    };

    // Si es un comando de menú, agregar info extra
    if (content?.includes("|")) {
      const [tipo, a, b] = content.split("|");
      entrada.menu = {
        codigo: content,
        titulo: a || tipo,
        nivel: tipo === "MENU" ? 0 : tipo === "CAT" ? 1 : tipo === "SERV" ? 2 : 3,
      };
      if (b) entrada.menu.descripcion = b;

      // Actualizar resumen
      if (tipo === "SERV") {
        if (!data.resumen.servicios_vistos.includes(content)) {
          data.resumen.servicios_vistos.push(content);
        }
      }
      if (tipo === "AGENDAR" || content.startsWith("AGENDAR|")) {
        data.resumen.intento_agendar = true;
      }
    }

    data.mensajes.push(entrada);
    data.resumen.total_mensajes++;

    writeYaml(filePath, data);
  } catch (e) {
    logger.error("[yamlLogger] Error en yamlLogIncoming", { error: e?.message });
  }
}

/**
 * Registra un mensaje saliente en el YAML
 */
export function yamlLogOutgoing({ phoneRaw, conversationId, messageType, content }) {
  try {
    const { filePath, data } = getOrCreateConvData(phoneRaw, conversationId);

    data.mensajes.push({
      ts: horaActual(),
      direccion: "saliente",
      tipo: messageType,
      // contenido: content?.substring(0, 200) || "",
      contenido: content || ""
    });

    data.resumen.total_mensajes++;

    writeYaml(filePath, data);
  } catch (e) {
    logger.error("[yamlLogger] Error en yamlLogOutgoing", { error: e?.message });
  }
}

/**
 * Actualiza el intent de la conversación en el YAML
 */
export function yamlUpdateIntent(conversationId, intent) {
  try {
    const cached = convCache.get(conversationId);
    if (!cached) return;

    cached.data.conversacion.intent = intent;
    writeYaml(cached.filePath, cached.data);
  } catch (e) {
    logger.error("[yamlLogger] Error en yamlUpdateIntent", { error: e?.message });
  }
}

/**
 * Marca la conversación como completada con outcome exitoso
 */
export function yamlMarkSuccess(conversationId) {
  try {
    const cached = convCache.get(conversationId);
    if (!cached) return;

    cached.data.conversacion.estado = "completada";
    cached.data.conversacion.outcome = "agendamiento_exitoso";
    cached.data.conversacion.fecha_fin = new Date().toLocaleString("es-AR", {
      timeZone: "America/Argentina/Mendoza",
    });
    cached.data.resumen.agendamiento_exitoso = true;

    writeYaml(cached.filePath, cached.data);

    // Limpiar cache de memoria
    convCache.delete(conversationId);
  } catch (e) {
    logger.error("[yamlLogger] Error en yamlMarkSuccess", { error: e?.message });
  }
}

/**
 * Limpia el cache de memoria 
 */
export function yamlClearCache() {
  convCache.clear();
}

export default {
  yamlLogIncoming,
  yamlLogOutgoing,
  yamlUpdateIntent,
  yamlMarkSuccess,
  yamlClearCache,
};
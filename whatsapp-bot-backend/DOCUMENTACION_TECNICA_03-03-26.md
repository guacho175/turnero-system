# Documentación Técnica - WhatsApp Bot Backend
## Dr. Beauty Mendoza

**Fecha de última actualización:** 3 de marzo de 2026  
**Versión:** 1.0.0  
**Estado del proyecto:** ✅ Operativo

---

## 📋 Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Stack Tecnológico](#3-stack-tecnológico)
4. [Estructura del Proyecto](#4-estructura-del-proyecto)
5. [Flujo de Datos](#5-flujo-de-datos)
6. [Módulos y Servicios](#6-módulos-y-servicios)
7. [Base de Datos](#7-base-de-datos)
8. [Integración con APIs Externas](#8-integración-con-apis-externas)
9. [Sistema de Logging](#9-sistema-de-logging)
10. [Flujos de Conversación](#10-flujos-de-conversación)
11. [Configuración de Datos](#11-configuración-de-datos)
12. [Estado Actual del Proyecto](#12-estado-actual-del-proyecto)
13. [Consideraciones de Seguridad](#13-consideraciones-de-seguridad)
14. [Próximos Pasos](#14-próximos-pasos)

---

## 1. Resumen Ejecutivo

### Descripción General

Este proyecto es un **backend de chatbot para WhatsApp** desarrollado para **Dr. Beauty Mendoza**, una clínica de estética. El bot gestiona conversaciones automatizadas con clientes, proporciona información sobre servicios y permite el agendamiento de citas.

### Capacidades Principales

| Funcionalidad | Estado |
|---------------|--------|
| Recepción de mensajes WhatsApp (Meta Cloud API) | ✅ Operativo |
| Menú de navegación interactivo | ✅ Operativo |
| Catálogo de servicios por categorías | ✅ Operativo |
| Preguntas frecuentes (FAQ) | ✅ Operativo |
| Información de contacto | ✅ Operativo |
| Agendamiento de citas con Django API | ✅ Operativo |
| Registro de conversaciones en YAML | ✅ Operativo |
| Almacenamiento en PostgreSQL | ✅ Operativo |
| Logging con rotación diaria | ✅ Operativo |
| Métricas de costos WhatsApp | ✅ Operativo |

---

## 2. Arquitectura del Sistema

### Diagrama de Arquitectura de Alto Nivel

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              USUARIOS                                       │
│                          (WhatsApp App)                                      │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        META WHATSAPP CLOUD API                              │
│                     (graph.facebook.com/v20.0)                              │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
             GET /webhook     POST /webhook    POST /messages
           (Verificación)   (Recibe eventos)   (Envía msgs)
                    │               │               ▲
                    └───────────────┼───────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                       WHATSAPP BOT BACKEND                                  │
│                         (Node.js + Express)                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        servidor.js (Entry Point)                      │  │
│  │  ├── webhook.rutas.js → webhook.controlador.js                       │  │
│  │  └── metrics.rutas.js                                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                   CAPA DE SERVICIOS                                    │  │
│  │ ┌────────────────────┐ ┌─────────────────────┐ ┌──────────────────┐   │  │
│  │ │ autorespuesta      │ │ enrutadorConv       │ │ flujoAgenda      │   │  │
│  │ │ (Router principal) │ │ (Navegación menú)   │ │ (Agendamiento)   │   │  │
│  │ └────────────────────┘ └─────────────────────┘ └──────────────────┘   │  │
│  │ ┌────────────────────┐ ┌─────────────────────┐ ┌──────────────────┐   │  │
│  │ │ whatsapp.servicio  │ │ djangoAgenda        │ │ stepsAgenda      │   │  │
│  │ │ (API WhatsApp)     │ │ (API Django)        │ │ (Estado flujo)   │   │  │
│  │ └────────────────────┘ └─────────────────────┘ └──────────────────┘   │  │
│  │ ┌────────────────────┐ ┌─────────────────────┐ ┌──────────────────┐   │  │
│  │ │ DBlogger           │ │ yamlLogger          │ │ logger           │   │  │
│  │ │ (PostgreSQL)       │ │ (Archivos YAML)     │ │ (Winston)        │   │  │
│  │ └────────────────────┘ └─────────────────────┘ └──────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
         │                           │                          │
         ▼                           ▼                          ▼
┌─────────────────┐      ┌──────────────────────┐     ┌──────────────────┐
│   PostgreSQL    │      │   Django API         │     │  Sistema de      │
│   Database      │      │   (Agendas)          │     │  Archivos        │
│                 │      │                      │     │  (YAMLs/Logs)    │
│ • users         │      │ /calendar/buckets/   │     │                  │
│ • conversations │      │ /calendar/slots/     │     │ • YAMLs/         │
│ • messages      │      │ /calendar/reservar/  │     │ • logs/          │
│ • menu_events   │      │                      │     │ • data/          │
└─────────────────┘      └──────────────────────┘     └──────────────────┘
```

### Patrón de Arquitectura

El sistema sigue una **arquitectura modular basada en servicios**:

- **Controladores**: Manejan las peticiones HTTP (webhook)
- **Rutas**: Definen los endpoints de la API
- **Servicios**: Contienen la lógica de negocio
- **Utilidades**: Funciones auxiliares reutilizables

---

## 3. Stack Tecnológico

### Tecnologías Core

| Componente | Tecnología | Versión | Propósito |
|------------|------------|---------|-----------|
| Runtime | Node.js | 18.0.0+ | Ejecutor JavaScript |
| Framework Web | Express | 4.19.2 | Servidor HTTP |
| Base de Datos | PostgreSQL | 14.0+ | Persistencia |
| Cliente HTTP | Axios | 1.13.2 | Llamadas a APIs |
| Configuración | dotenv | 16.4.5 | Variables de entorno |
| Logging | Winston | 3.19.0 | Sistema de logs |
| Rotación Logs | winston-daily-rotate-file | 5.0.0 | Archivos diarios |
| YAML | js-yaml | 4.1.1 | Serialización YAML |
| PostgreSQL Client | pg | 8.18.0 | Driver PostgreSQL |

### APIs Externas

| API | Propósito | Endpoint Base |
|-----|-----------|---------------|
| Meta WhatsApp Cloud API | Envío/recepción de mensajes | `https://graph.facebook.com/v20.0` |
| Django API (Agendas) | Gestión de citas | `https://175galindez.pythonanywhere.com` |

---

## 4. Estructura del Proyecto

```
whatsapp-bot-backend/
├── 📄 package.json              # Dependencias y scripts
├── 📄 schema.sql                # Esquema de base de datos
├── 📄 README.md                 # Documentación de uso
├── 📄 DOCUMENTACION_TECNICA.md  # Este documento
│
├── 📁 src/                      # Código fuente principal
│   ├── 📄 index.js              # Entry point
│   ├── 📄 servidor.js           # Configuración Express
│   │
│   ├── 📁 controladores/
│   │   └── 📄 webhook.controlador.js    # Maneja webhooks de Meta
│   │
│   ├── 📁 rutas/
│   │   ├── 📄 webhook.rutas.js          # Rutas /webhook
│   │   └── 📄 metrics.rutas.js          # Rutas /metrics
│   │
│   ├── 📁 servicios/
│   │   ├── 📄 autorespuesta.servicio.js      # Router principal
│   │   ├── 📄 enrutadorConversacion.servicio.js  # Navegación menú
│   │   ├── 📄 flujoAgenda.servicio.js        # UI agendamiento
│   │   ├── 📄 stepsAgenda.servicio.js        # Handlers de pasos
│   │   ├── 📄 whatsapp.servicio.js           # API WhatsApp
│   │   ├── 📄 whatsappAdapter.servicio.js    # Adaptador simplificado
│   │   ├── 📄 djangoAgenda.servicio.js       # API Django agendas
│   │   ├── 📄 estadoAgenda.servicio.js       # Estado por usuario
│   │   ├── 📄 flujoGuard.servicio.js         # Validación tokens
│   │   ├── 📄 menuPrincipal.servicio.js      # Menú principal
│   │   ├── 📄 catalogoServicios.servicio.js  # Servicios
│   │   ├── 📄 faq.servicio.js                # FAQ
│   │   ├── 📄 contenidoNegocio.servicio.js   # Carga JSONs
│   │   ├── 📄 db.servicio.js                 # Cliente PostgreSQL
│   │   ├── 📄 DBlogger.servicio.js           # Logging a DB
│   │   ├── 📄 yamlLogger.servicio.js         # Logging a YAML
│   │   └── 📄 logger.servicio.js             # Winston logger
│   │
│   ├── 📁 utils/
│   │   ├── 📄 constants.js        # Constantes centralizadas
│   │   ├── 📄 fecha.utils.js      # Utilidades de fecha
│   │   ├── 📄 string.utils.js     # Utilidades de texto
│   │   └── 📄 validadores.utils.js # Validaciones
│   │
│   ├── 📁 base_conocimiento/
│   │   ├── 📄 respuestascalendario.json      # Mensajes del bot
│   │   └── 📄 respuestascalendario.servicio.js
│   │
│   └── 📁 metrics/
│       ├── 📄 whatsappLogger.js         # Log eventos WhatsApp
│       └── 📄 conversationEstimator.js  # Estimador costos
│
├── 📁 data_config/              # Configuración del negocio
│   ├── 📄 negocio.json          # Info del negocio
│   ├── 📄 servicios.json        # Catálogo de servicios
│   └── 📄 preguntas_frecuentes.json  # FAQ
│
├── 📁 data/
│   └── 📄 agenda_state.json     # Estado de conversaciones
│
├── 📁 logs/                     # Logs diarios Winston
│   └── 📄 app-YYYY-MM-DD.log
│
├── 📁 YAMLs/                    # Conversaciones históricas
│   └── 📄 FECHA_HORA_PHONE_ID.yaml
│
└── 📁 scripts/                  # Scripts de utilidad
    ├── 📄 test-db-connection.js
    ├── 📄 test-logger.js
    └── 📄 test-normalize-phone.js
```

---

## 5. Flujo de Datos

### Flujo de Mensaje Entrante

```
1. Usuario envía mensaje en WhatsApp
        │
        ▼
2. Meta Cloud API envía POST /webhook
        │
        ▼
3. webhook.controlador.js responde 200 inmediatamente
        │
        ▼
4. Se extrae: from, texto, timestamp, tipo (text/button/list)
        │
        ▼
5. autorespuesta.servicio.js → procesarMensajeEntrante()
        │
        ├── ¿Es comando modular (MENU|, CAT|, SERV|, FAQ|)?
        │       │
        │       ▼
        │   enrutadorConversacion.servicio.js → manejarNavegacion()
        │       │
        │       └── Envía respuesta apropiada (lista/botones)
        │
        ├── ¿Usuario en flujo de agendamiento?
        │       │
        │       ▼
        │   stepsAgenda.servicio.js → handler del step actual
        │       │
        │       └── Avanza el flujo o solicita más datos
        │
        └── ¿Intent global (saludo, agenda)?
                │
                ▼
            Muestra menú principal o inicia agendamiento
```

### Flujo de Mensaje Saliente

```
1. Se construye el mensaje (texto/botones/lista)
        │
        ▼
2. whatsapp.servicio.js → enviarMensajeWhatsApp()
        │
        ▼
3. Se normaliza el número telefónico
        │
        ▼
4. POST a Meta Cloud API
        │
        ▼
5. Se registra en:
   ├── DBlogger → PostgreSQL (messages table)
   ├── yamlLogger → Archivo YAML de la conversación
   └── whatsappLogger → Log de costos (whatsapp_messages.jsonl)
```

---

## 6. Módulos y Servicios

### 6.1 autorespuesta.servicio.js
**Rol:** Router principal de mensajes entrantes

**Responsabilidades:**
- Encolar procesamiento por usuario (evita race conditions)
- Detectar tipo de mensaje (comando modular, texto libre, interactivo)
- Delegar a handlers especializados
- Gestionar el flujo de agendamiento

**Flujo interno:**
```javascript
procesarMensajeEntrante({ from, texto, ts })
  ├── esComandoModular(texto)? → procesarComandoModular()
  ├── estadoActivo(from)? → procesarStep()
  ├── detectarIntentGlobal() → procesarIntentGlobal()
  └── default → mostrarMenuPrincipal()
```

### 6.2 enrutadorConversacion.servicio.js
**Rol:** Navegación del menú interactivo

**Comandos soportados:**
| Prefijo | Acción |
|---------|--------|
| `MENU|VOLVER` | Volver al menú principal |
| `MENU|AGENDAR` | Iniciar agendamiento |
| `MENU|SERVICIOS` | Mostrar categorías |
| `MENU|FAQ` | Mostrar preguntas frecuentes |
| `MENU|CONTACTO` | Mostrar información de contacto |
| `MENU|HUMANO` | Derivar a humano |
| `CAT|{id}` | Mostrar servicios de categoría |
| `SERV|{id}` | Mostrar detalle de servicio |
| `FAQ|{id}` | Mostrar respuesta a pregunta |
| `AGENDAR|{bucket}|{servicio}` | Agendar servicio específico |

### 6.3 flujoAgenda.servicio.js
**Rol:** Renderizado de UI para agendamiento

**Funciones principales:**
- `renderBuckets()` - Selector de agendas disponibles
- `renderPickWeek()` - Selector de fechas
- `renderSlots()` - Lista de horarios disponibles
- `buildDateRowsFromSlots()` - Construir filas de fechas
- `slotsToListRows()` - Convertir slots a filas de lista

### 6.4 stepsAgenda.servicio.js
**Rol:** Handlers para cada paso del flujo de agendamiento

**Estados (steps):**
| Step | Descripción | Siguiente |
|------|-------------|-----------|
| `ASK_CONFIRM` | Confirmación inicial | AWAIT_BUCKET |
| `AWAIT_BUCKET` | Selección de agenda | AWAIT_NAME |
| `AWAIT_NAME` | Captura de nombre | AWAIT_DATE |
| `AWAIT_DATE` | Selección de fecha | AWAIT_SLOT_CHOICE |
| `AWAIT_SLOT_CHOICE` | Selección de horario | AWAIT_EMAIL |
| `AWAIT_EMAIL` | Captura de email (opcional) | Reserva |
| `AFTER_CONFIRM` | Menú post-reserva | - |

### 6.5 whatsapp.servicio.js
**Rol:** Comunicación con Meta WhatsApp Cloud API

**Funciones:**
- `enviarMensajeWhatsApp({ to, body })` - Mensaje de texto
- `enviarBotonesWhatsApp({ to, body, buttons })` - Mensaje con botones
- `enviarListaWhatsApp({ to, body, buttonText, sectionTitle, rows })` - Mensaje con lista
- `normalizePhoneE164(raw)` - Normalizar número telefónico

### 6.6 djangoAgenda.servicio.js
**Rol:** Integración con API Django para agendas

**Endpoints consumidos:**
| Método | Endpoint | Función |
|--------|----------|---------|
| GET | `/calendar/buckets/google` | `listarBucketsDjango()` |
| GET | `/calendar/buckets/{bucket}/slots/libres` | `listarSlotsDisponiblesDjango()` |
| POST | `/calendar/buckets/{bucket}/slots/{id}/reservar` | `reservarSlotDjango()` |

### 6.7 DBlogger.servicio.js
**Rol:** Registro de eventos en PostgreSQL

**Funciones:**
- `ensureUserAndConversation(phoneRaw)` - Crear/obtener usuario y conversación
- `logIncomingMessage()` - Registrar mensaje entrante
- `logOutgoingMessage()` - Registrar mensaje saliente
- `logMenuEvent()` - Registrar navegación de menú
- `updateConversationOutcome()` - Actualizar resultado de conversación

### 6.8 yamlLogger.servicio.js
**Rol:** Registro de conversaciones en archivos YAML

**Formato de archivo:**
```yaml
conversacion:
  id: UUID
  fecha_inicio: DD/MM/YYYY, HH:MM:SS
  fecha_fin: DD/MM/YYYY, HH:MM:SS
  estado: activa | completada
  intent: null | agendar | ...
  outcome: null | agendamiento_exitoso | ...
usuario:
  telefono: "XXXXXXXXX"
mensajes:
  - ts: "HH:MM:SS"
    direccion: entrante | saliente
    tipo: text | interactive | list | button
    contenido: "..."
resumen:
  total_mensajes: N
  servicios_vistos: []
  intento_agendar: true/false
  agendamiento_exitoso: true/false
```

---

## 7. Base de Datos

### Diagrama Entidad-Relación

```
┌─────────────────┐       ┌──────────────────────┐
│     users       │       │    conversations     │
├─────────────────┤       ├──────────────────────┤
│ id (PK)         │◄──────│ user_id (FK)         │
│ phone_hash      │       │ id (PK)              │
│ phone_raw       │       │ started_at           │
│ first_seen      │       │ ended_at             │
│ last_seen       │       │ status               │
│ total_msgs      │       │ intent               │
│ total_convs     │       │ outcome              │
└─────────────────┘       │ total_messages       │
         │                │ duration_seconds     │
         │                └──────────────────────┘
         │                          │
         │                          │
         │                ┌─────────┴─────────┐
         │                │                   │
         ▼                ▼                   ▼
┌─────────────────┐  ┌────────────────┐  ┌───────────────────┐
│    messages     │  │  menu_events   │  │    raw_events     │
├─────────────────┤  ├────────────────┤  ├───────────────────┤
│ id (PK)         │  │ id (PK)        │  │ id (PK)           │
│ conversation_id │  │ conversation_id│  │ raw_line          │
│ user_id (FK)    │  │ user_id (FK)   │  │ source            │
│ timestamp       │  │ timestamp      │  │ parsed            │
│ direction       │  │ option_code    │  │ parse_error       │
│ message_type    │  │ option_title   │  │ received_at       │
│ content         │  │ menu_level     │  └───────────────────┘
│ payload (JSONB) │  │ action_taken   │
│ wa_message_id   │  │ raw_payload    │
│ wa_status       │  └────────────────┘
└─────────────────┘
```

### Tablas Principales

#### users
Almacena clientes únicos del chatbot.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `phone_hash` | TEXT | SHA256 del teléfono (privacidad) |
| `phone_raw` | TEXT | Número real (opcional) |
| `first_seen` | TIMESTAMPTZ | Primera interacción |
| `last_seen` | TIMESTAMPTZ | Última interacción |
| `total_conversations` | INTEGER | Contador de conversaciones |
| `total_messages` | INTEGER | Contador de mensajes |

#### conversations
Sesiones de interacción agrupadas temporalmente.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `user_id` | UUID | FK a users |
| `started_at` | TIMESTAMPTZ | Inicio de conversación |
| `ended_at` | TIMESTAMPTZ | Fin (NULL = activa) |
| `status` | TEXT | active / completed / abandoned |
| `intent` | TEXT | Intención detectada |
| `outcome` | TEXT | Resultado final |

#### messages
Todos los mensajes intercambiados.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `conversation_id` | UUID | FK a conversations |
| `direction` | TEXT | incoming / outgoing |
| `message_type` | TEXT | text / button / list / interactive |
| `content` | TEXT | Texto resumido (máx 500 chars) |
| `payload` | JSONB | Payload crudo de WhatsApp |

#### menu_events
Análisis de navegación por menús.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `option_code` | TEXT | Ej: MENU\|SERVICIOS, SERV\|botox |
| `option_title` | TEXT | Título visible |
| `menu_level` | INTEGER | 0=principal, 1=categoría, 2=servicio |
| `action_taken` | TEXT | view / agendar / back / exit |

### Vistas Útiles

```sql
-- Usuarios activos
SELECT * FROM v_active_users;

-- Top servicios consultados
SELECT * FROM v_top_services;
```

---

## 8. Integración con APIs Externas

### 8.1 Meta WhatsApp Cloud API

**Base URL:** `https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages`

**Autenticación:** Bearer Token (META_WA_ACCESS_TOKEN)

**Variables de entorno requeridas:**
```env
META_WA_PHONE_NUMBER_ID=123456789
META_WA_ACCESS_TOKEN=EAAxxxxxxx
META_VERIFY_TOKEN=mi_token_verificacion
```

**Tipos de mensaje soportados:**

1. **Texto simple:**
```json
{
  "messaging_product": "whatsapp",
  "to": "549261XXXXXXX",
  "type": "text",
  "text": { "body": "Hola!" }
}
```

2. **Botones (máx 3):**
```json
{
  "messaging_product": "whatsapp",
  "to": "549261XXXXXXX",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "Elige una opción" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "BTN1", "title": "Opción 1" } }
      ]
    }
  }
}
```

3. **Lista (máx 10 items):**
```json
{
  "messaging_product": "whatsapp",
  "to": "549261XXXXXXX",
  "type": "interactive",
  "interactive": {
    "type": "list",
    "body": { "text": "Selecciona:" },
    "action": {
      "button": "Ver opciones",
      "sections": [{
        "title": "Sección",
        "rows": [
          { "id": "ROW1", "title": "Item 1", "description": "Detalle" }
        ]
      }]
    }
  }
}
```

### 8.2 Django API (Agendas)

**Base URL:** `https://175galindez.pythonanywhere.com`

**Endpoints:**

#### Listar buckets disponibles
```
GET /calendar/buckets/google
Response: { "buckets": ["faciales", "corporales", "aparatologia"] }
```

#### Listar slots libres
```
GET /calendar/buckets/{bucket}/slots/libres?desde=2026-03-03&hasta=2026-03-10&limit=100
Response: {
  "bucket": "faciales",
  "count": 15,
  "slots": [
    { "id": "event123", "start": { "dateTime": "2026-03-05T10:00:00" }, ... }
  ]
}
```

#### Reservar slot
```
POST /calendar/buckets/{bucket}/slots/{event_id}/reservar
Body: {
  "customer_name": "Juan Pérez",
  "professional_key": "dra_martinez",
  "customer_phone": "549261XXXXXXX",
  "attendee_email": "juan@email.com",
  "notes": "Primera consulta"
}
Response: { "success": true, "reservation": {...} }
```

---

## 9. Sistema de Logging

### 9.1 Winston Logger

**Ubicación:** `logs/app-YYYY-MM-DD.log`

**Rotación:** Diaria, máximo 14 días, máximo 20MB por archivo

**Formato:**
```
[2026-03-03 13:45:22] INFO: Mensaje recibido {"from":"549261XXXXXXX","tipo":"text"}
[2026-03-03 13:45:23] ERROR: Error en API {"error":"timeout","stack":"..."}
```

### 9.2 YAML Logger

**Ubicación:** `YAMLs/FECHA_HORA_PHONE_ID.yaml`

**Propósito:** Registro humanamente legible de cada conversación completa.

**Ejemplo real:**
```yaml
conversacion:
  id: 10c4c865-3595-455d-89d0-8432dd6f4da7
  fecha_inicio: 3/3/2026, 01:38:40
  fecha_fin: 3/3/2026, 01:39:29
  estado: completada
  outcome: agendamiento_exitoso
usuario:
  telefono: '56973410397'
mensajes:
  - ts: '01:38:40'
    direccion: entrante
    tipo: text
    contenido: hola
  - ts: '01:38:41'
    direccion: saliente
    tipo: list
    contenido: "Hola 👋 Soy el asistente de *Dr. Beauty Mendoza*..."
  # ... más mensajes
```

### 9.3 WhatsApp Event Logger

**Ubicación:** `logs/whatsapp_messages.jsonl`

**Propósito:** Tracking de costos y uso de la API de WhatsApp

**Formato (JSON Lines):**
```json
{"ts":"2026-03-03T13:45:22.123Z","direction":"out","to":"549261XXX","type":"text","status":"sent","category_for_cost":"service"}
```

### 9.4 PostgreSQL Logging

**Propósito:** Análisis de negocio, métricas, reportes

**Tablas involucradas:** `users`, `conversations`, `messages`, `menu_events`

---

## 10. Flujos de Conversación

### 10.1 Flujo Principal (Menú)

```
Usuario: "hola"
    │
    ▼
Bot muestra menú principal con lista:
    ├── 📋 Agendar turno
    ├── 💆 Ver servicios  
    ├── ❓ Preguntas frecuentes
    ├── 📍 Contacto
    └── 👤 Hablar con humano
```

### 10.2 Flujo de Agendamiento Completo

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. INICIO                                                         │
│    Usuario: "quiero agendar" o selecciona "Agendar turno"        │
└────────────────────────────────────┬─────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. SELECCIÓN DE AGENDA (AWAIT_BUCKET)                            │
│    Bot: Lista de agendas disponibles (faciales, corporales, etc) │
│    Usuario: Selecciona una agenda                                │
└────────────────────────────────────┬─────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. CAPTURA DE NOMBRE (AWAIT_NAME)                                │
│    Bot: "Perfecto ✅. ¿Cuál es tu *nombre*?"                     │
│    Usuario: "María García"                                        │
└────────────────────────────────────┬─────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. SELECCIÓN DE FECHA (AWAIT_DATE)                               │
│    Bot: Lista de fechas disponibles (próximos 30 días)           │
│    Usuario: Selecciona fecha (ej: "Mié 05-03")                   │
└────────────────────────────────────┬─────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. SELECCIÓN DE HORARIO (AWAIT_SLOT_CHOICE)                      │
│    Bot: Lista de horarios disponibles para esa fecha             │
│    Usuario: Selecciona horario (ej: "10:00")                     │
└────────────────────────────────────┬─────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 6. EMAIL OPCIONAL (AWAIT_EMAIL)                                  │
│    Bot: "Para enviarte la invitación, escribe tu *email*"        │
│    Usuario: "maria@email.com" o "no"                             │
└────────────────────────────────────┬─────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 7. CONFIRMACIÓN                                                   │
│    Bot: "Un momento… estoy reservando tu hora 📅"                │
│    [Llamada a Django API para reservar]                          │
│    Bot: "✅ *Reserva confirmada*                                  │
│          📅 Fecha: 2026-03-05                                     │
│          🕐 Hora: 10:00                                           │
│          💇 Servicio: faciales                                    │
│          👤 Profesional: Dra. Martinez"                          │
└──────────────────────────────────────────────────────────────────┘
```

### 10.3 Flujo de Navegación de Servicios

```
Usuario: Selecciona "Ver servicios"
    │
    ▼
Bot: Lista de categorías
    ├── Tratamientos Faciales
    ├── Tratamientos Corporales
    ├── Aparatología
    └── ↩️ Volver al menú
    │
    ▼
Usuario: Selecciona "Tratamientos Faciales"
    │
    ▼
Bot: Lista de servicios faciales
    ├── Botox – Frente y Ojos (30 min)
    ├── Ácido Hialurónico Facial (45 min)
    ├── Hilos Tensores – Lifting (60 min)
    ├── FoxEyes (45 min)
    └── ↩️ Volver al menú
    │
    ▼
Usuario: Selecciona "Botox – Frente y Ojos"
    │
    ▼
Bot: Detalle del servicio con descripción completa
     + Botón "Volver al menú"
```

---

## 11. Configuración de Datos

### 11.1 negocio.json
Información general del negocio.

```json
{
  "nombre": "Dr. Beauty Mendoza",
  "descripcion_corta": "Estética facial, corporal y aparatología.",
  "contacto": {
    "whatsapp": "+54 9 261 000-0000",
    "telefono": "+54 261 000-0000",
    "instagram": "@drbeautymendoza",
    "direccion": "Av. Ejemplo 123, Mendoza, Argentina",
    "horario": {
      "lunes_a_viernes": "10:00 a 19:00",
      "sabado": "10:00 a 14:00"
    }
  },
  "politicas": {
    "sena": "Se solicita una seña para asegurar prioridad...",
    "reprogramacion": "Puedes reprogramar con 24h de anticipación..."
  }
}
```

### 11.2 servicios.json
Catálogo completo de servicios organizados por categorías.

```json
{
  "categorias": [
    {
      "id": "faciales",
      "titulo": "Tratamientos Faciales",
      "bucket_key": "faciales",
      "servicios": [
        {
          "id": "botox_tercio_superior",
          "nombre": "Botox – Frente y Ojos",
          "indicador": "Aplicación en tercio superior...",
          "objetivo": "Atenuar y prevenir arrugas...",
          "duracion_min": 30
        }
        // ... más servicios
      ]
    }
    // ... más categorías
  ]
}
```

### 11.3 preguntas_frecuentes.json
Base de conocimiento para el FAQ.

---

## 12. Estado Actual del Proyecto

### Fecha de Evaluación: 3 de marzo de 2026

### Funcionalidades Completadas ✅

| Módulo | Estado | Notas |
|--------|--------|-------|
| Servidor Express | ✅ Completo | Puerto 3000 por defecto |
| Webhook Meta | ✅ Completo | Verificación y recepción |
| Menú principal | ✅ Completo | 5 opciones |
| Catálogo de servicios | ✅ Completo | 3 categorías, 12 servicios |
| FAQ | ✅ Completo | Dinámico desde JSON |
| Contacto | ✅ Completo | Horarios, dirección, redes |
| Agendamiento | ✅ Completo | Flujo completo con Django |
| Logger Winston | ✅ Completo | Rotación diaria |
| Logger YAML | ✅ Completo | Una conversación por archivo |
| PostgreSQL | ✅ Completo | 5 tablas, vistas, triggers |
| Métricas | ✅ Completo | Endpoint /metrics/whatsapp |

### Archivos de Conversación Existentes
```
YAMLs/
├── 2026-02-17_16-48-18_5492604814785_bd692b.yaml
├── 2026-02-17_16-48-18_56973410397_6e40e3.yaml
├── 2026-03-02_18-17-30_56973410397_10c4c8.yaml
├── 2026-03-02_18-31-05_56973410397_10c4c8.yaml
├── 2026-03-02_18-36-00_56973410397_10c4c8.yaml
├── 2026-03-02_18-52-28_56973410397_10c4c8.yaml
├── 2026-03-03_11-27-05_56973410397_10c4c8.yaml
├── 2026-03-03_11-33-02_56973410397_10c4c8.yaml
├── 2026-03-03_11-39-40_56973410397_10c4c8.yaml
├── 2026-03-03_11-47-31_56973410397_10c4c8.yaml
├── 2026-03-03_11-53-49_56973410397_10c4c8.yaml
├── 2026-03-03_11-58-06_56973410397_10c4c8.yaml
├── 2026-03-03_12-04-12_56973410397_10c4c8.yaml
├── 2026-03-03_12-09-08_56973410397_10c4c8.yaml
├── 2026-03-03_12-43-31_56973410397_10c4c8.yaml
├── 2026-03-03_12-43-31_56976038305_8d2019.yaml
└── 2026-03-03_13-38-26_56973410397_10c4c8.yaml  ← Más reciente
```

### Métricas de Uso (al 3/3/2026)
- **Total de archivos YAML:** 17
- **Usuarios únicos identificados:** 3
- **Agendamientos exitosos registrados:** Múltiples (ver outcome en YAMLs)

---

## 13. Consideraciones de Seguridad

### Implementadas ✅

| Aspecto | Implementación |
|---------|----------------|
| Tokens de sesión | Expiración de 2 minutos para IDs interactivos |
| Hash de teléfonos | SHA256 en PostgreSQL (phone_hash) |
| Validación de entrada | Límites en nombres, emails, fechas |
| Timeouts de API | 15-20 segundos en llamadas externas |
| Logging seguro | Sin imprimir credenciales |

### Variables de Entorno Sensibles

```env
# WhatsApp API
META_WA_PHONE_NUMBER_ID=xxxxx
META_WA_ACCESS_TOKEN=xxxxx
META_VERIFY_TOKEN=xxxxx

# PostgreSQL
DATABASE_URL=postgresql://user:pass@host:port/db

# Django API
DJANGO_API_BASE_URL=https://xxxxx.pythonanywhere.com
```

### Recomendaciones Pendientes

1. **Cifrado de phone_raw en DB** - Actualmente se guarda en texto plano
2. **Rate limiting** - Implementar límites por IP/usuario
3. **HTTPS enforcement** - Asegurar que ngrok/producción use SSL
4. **Audit log** - Log de accesos administrativos

---

## 14. Próximos Pasos

### Corto Plazo (1-2 semanas)
- [ ] Dashboard de métricas visual
- [ ] Notificaciones de error por email/Telegram
- [ ] Pruebas automatizadas (Jest)

### Mediano Plazo (1-2 meses)
- [ ] Integración con Google Gemini AI para respuestas inteligentes
- [ ] Soporte multi-idioma
- [ ] Panel de administración web

### Largo Plazo
- [ ] App móvil para administradores
- [ ] Integración con sistemas de pago
- [ ] Analytics avanzados con dashboards

---

## Apéndice A: Comandos Útiles

```bash
# Iniciar servidor
npm start

# Verificar conexión a DB
npm run test:db

# Probar normalización de teléfonos
npm run test:normalize-phone

# Ver logs del día
Get-Content logs/app-$(Get-Date -Format "yyyy-MM-dd").log -Tail 50

# Ver últimas conversaciones YAML
Get-ChildItem YAMLs/*.yaml | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

---

## Apéndice B: Diagrama de Secuencia - Agendamiento

```
Usuario          Bot              Django API       PostgreSQL
   │               │                   │               │
   │─── "agendar" ─►│                   │               │
   │               │                   │               │
   │               │──── GET /buckets ─►│               │
   │               │◄──── buckets[] ────│               │
   │               │                   │               │
   │◄─ Lista agendas│                   │               │
   │─── "faciales" ─►│                   │               │
   │               │                   │               │
   │◄─ "¿Tu nombre?"│                   │               │
   │─── "María" ────►│                   │               │
   │               │                   │               │
   │               │─── GET /slots ────►│               │
   │               │◄─── slots[] ───────│               │
   │               │                   │               │
   │◄─ Lista fechas─│                   │               │
   │─── "05-03" ────►│                   │               │
   │               │                   │               │
   │◄─ Lista horas ─│                   │               │
   │─── "10:00" ────►│                   │               │
   │               │                   │               │
   │◄─ "¿Tu email?"─│                   │               │
   │─── "no" ───────►│                   │               │
   │               │                   │               │
   │               │── POST /reservar ──►│               │
   │               │◄── confirmation ───│               │
   │               │                   │               │
   │               │───────────────────────── INSERT ───►│
   │               │                   │               │
   │◄─ "✅ Reserva" │                   │               │
   │               │                   │               │
```

---

*Documento generado el 3 de marzo de 2026*  
*Versión del sistema: 1.0.0*

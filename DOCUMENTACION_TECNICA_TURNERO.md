# DOCUMENTACIÓN TÉCNICA DEL SISTEMA: Turnero & WhatsApp Bot

**Fecha de generación:** 12 de marzo de 2026
**Estado:** Operativo

---

## 1. Resumen Ejecutivo

El sistema es una solución integral para "Dr. Beauty Mendoza" que automatiza la atención al cliente y el agendamiento de citas médicas mediante WhatsApp. Resuelve el problema de la sobrecarga administrativa y la atención fuera de horario, permitiendo a los pacientes consultar servicios, resolver dudas y reservar turnos de forma autónoma 24/7. Esta automatización reduce tiempos de espera y optimiza la ocupación de la clínica al integrarse en tiempo real con la disponibilidad real del personal. La plataforma está compuesta por tres partes: un **Bot de WhatsApp** (Node.js) que actúa como motor conversacional, una **API de Turnero** (Django) que gestiona la lógica de disponibilidad y reservas directamente en Google Calendar, y un **Dashboard Analítico** (Next.js) que proporciona métricas de uso y conversión en base a las interacciones registradas.

---

## 2. Arquitectura general

El sistema sigue una arquitectura orientada a servicios, compuesta por tres nodos principales y dos bases de datos:

```mermaid
flowchart TD
    %% Definición de actores
    User((Usuario\nWhatsApp))
    Admin((Administrador))

    %% Sistemas externos
    Meta[Meta WhatsApp Cloud API]
    GoogleCal[Google Calendar API]

    %% Componentes del sistema
    subgraph Sistema Local
        Bot[whatsapp-bot-backend\nNode.js]
        Turnero[turnero API\nDjango]
        Dashboard[bot-dashboard\nNext.js]
        DB[(PostgreSQL)]
        SQLite[(SQLite)]
    end

    %% Flujos de interacción
    User <-->|Mensajes| Meta
    Meta <-->|Webhooks / API| Bot
    Admin <-->|UI Analytics| Dashboard
    Admin <-->|UI Gestión Slots| Turnero
    
    %% Comunicación interna
    Bot -->|Lee/Escribe Analytics| DB
    Dashboard -->|Lee Analytics| DB
    
    Bot <-->|REST API (Slots/Reservas)| Turnero
    Turnero -->|Mapeo Buckets| SQLite
    
    %% Integración con Google
    Turnero <-->|OAuth 2.0 / API v3| GoogleCal
```

**Explicación del diagrama:**
- El **Usuario** interactúa con el sistema a través de WhatsApp, cuyos mensajes son ruteados mediante la **API Cloud de Meta** hacia el **whatsapp-bot-backend**.
- El bot (Node.js) procesa la intención del usuario y lee/escribe en la **base de datos PostgreSQL** compartida para registrar métricas y logs.
- Cuando se requiere listar horarios o agendar una cita, el bot se comunica vía REST con la API de **turnero** (Django).
- **turnero** utiliza su base de datos interna **SQLite** para traducir la agenda solicitada y se conecta con la **API de Google Calendar** para verificar disponibilidad real y bloquear los turnos.
- Por último, los **administradores** pueden acceder al **bot-dashboard** (Next.js) que lee directamente de PostgreSQL para generar analíticas, y pueden usar la interfaz web de **turnero** para gestionar la creación masiva de slots o su limpieza en el calendario.

1.  **WhatsApp Bot Backend (Node.js):** Actúa como el motor conversacional y Webhook público para Meta. Se comunica con la base de datos PostgreSQL para registrar analíticas y mantener el estado de la sesión del usuario.
2.  **Turnero API (Django):** Funciona como un microservicio dedicado a la integración con Google Calendar. Gestiona la lógica de slots de tiempo, agendas (buckets) y autenticación OAuth.
3.  **Bot Dashboard (Next.js):** Aplicación administrativa (SSR/CSR) que se conecta directamente a la base de datos PostgreSQL para generar reportes analíticos y gráficos en tiempo real.

**Bases de Datos:**
*   **PostgreSQL:** Compartida entre `whatsapp-bot-backend` y `bot-dashboard`. Almacena usuarios, conversaciones, mensajes, eventos del menú y logs crudos.
*   **SQLite (`db.sqlite3`):** Base de datos interna de `turnero` (Django) utilizada para mapear nombres lógicos de agendas (Buckets) con IDs reales de calendarios de Google y manejar sesiones OAuth de administradores.

---

## 3. Descripción de cada repositorio

### `@whatsapp-bot-backend`
*   **Rol:** Núcleo conversacional y de enrutamiento.
*   **Responsabilidades:** 
    *   Recibir y responder webhooks de la Meta Cloud API.
    *   Procesar entradas de texto, botones y listas.
    *   Manejar el estado temporal de la conversación del usuario.
    *   Consultar la información de negocio y catálogo de servicios (basado en archivos JSON estáticos).
    *   Orquestar el flujo de agendamiento consumiendo la API de `@turnero`.
    *   Registrar analíticas y logs detallados en PostgreSQL y archivos YAML.

### `@turnero`
*   **Rol:** Integrador y gestor de Calendarios.
*   **Responsabilidades:** 
    *   Abstraer la complejidad de la Google Calendar API (v3).
    *   Exponer endpoints REST para consulta de disponibilidad (slots) y creación de reservas.
    *   Proveer una interfaz web interna (Vanilla JS/HTML/CSS + FullCalendar) para que los administradores generen disponibilidad (bloques de tiempo y bloqueos) y limpien eventos obsoletos.

### `@bot-dashboard`
*   **Rol:** Panel de Control y Analíticas.
*   **Responsabilidades:** 
    *   Proveer una interfaz gráfica segura (autenticación vía JWT y bcrypt) para el personal administrativo.
    *   Consumir métricas de la base de datos PostgreSQL.
    *   Visualizar embudos de conversión (funnel del menú), servicios más visitados, franjas horarias pico y duración de las conversaciones.
    *   Permitir la exportación de registros a formato CSV.

---

## 4. Stack tecnológico

**Bot de WhatsApp (`@whatsapp-bot-backend`)**
*   **Runtime:** Node.js (v18+)
*   **Framework Web:** Express.js
*   **Base de Datos:** PostgreSQL (driver `pg` nativo)
*   **Utilidades:** Axios (cliente HTTP), Winston (Logging con rotación diaria), js-yaml (Serialización de auditorías).

**API de Agendamiento (`@turnero`)**
*   **Runtime:** Python 3
*   **Framework:** Django (v6.0.1) + Django REST Framework
*   **Integraciones:** `google-api-python-client`, `google-auth-oauthlib`
*   **Base de Datos:** SQLite
*   **Documentación API:** drf-spectacular (Swagger UI / ReDoc)
*   **Frontend UI:** Vanilla JS, HTML, CSS, FullCalendar v6.

**Dashboard Analytics (`@bot-dashboard`)**
*   **Framework:** Next.js (v16.1.6, App Router)
*   **Librerías UI:** React (v19), Tailwind CSS v4, Recharts (Visualización de datos)
*   **Seguridad:** `bcryptjs`, `jsonwebtoken`
*   **Base de Datos:** PostgreSQL (driver `pg`).

---

## 5. Comunicación entre componentes

### Comunicación entre Servicios

El ecosistema está compuesto por tres servicios principales que interactúan entre sí para proveer la funcionalidad completa. La arquitectura favorece la asincronía y el bajo acoplamiento cuando es posible, y peticiones REST síncronas cuando se requiere inmediatez (ej: agendar un turno).

A continuación se detalla cómo se comunican:

#### 1. `@whatsapp-bot-backend` ➡️ `@turnero` (API de Django)
El bot de WhatsApp actúa como **cliente HTTP** de la API de Django para todo lo relacionado con la agenda y disponibilidad de turnos. No se conecta a la base de datos SQLite interna de Django ni interactúa con Google Calendar directamente.

*   **Librería utilizada:** `axios` (desde `src/servicios/djangoAgenda.servicio.js`)
*   **Endpoints consumidos:**
    *   `GET /calendar/buckets/google`: Obtiene la lista de "buckets" (agendas o categorías de servicios) disponibles.
    *   `GET /calendar/buckets/{bucket}/slots/libres`: Consulta los horarios (slots) disponibles para un servicio específico en un rango de fechas.
    *   `POST /calendar/buckets/{bucket}/slots/{event_id}/reservar`: Confirma la reserva de un horario, enviando los datos del paciente.
*   **Datos intercambiados:** JSON. El bot envía datos del paciente (nombre, teléfono, email, profesional requerido) y recibe confirmaciones de reserva o listas de horarios disponibles (formato ISO 8601).

#### 2. `@whatsapp-bot-backend` ↔️ `Meta WhatsApp Cloud API`
El bot es la única pieza del sistema expuesta a internet público para la interacción con Meta.

*   **Webhooks (Entrante):** Meta hace un `POST` al endpoint `/webhook` del bot cada vez que un usuario envía un mensaje.
*   **API Graph (Saliente):** El bot hace peticiones `POST` a `https://graph.facebook.com/v20.0/{PHONE_ID}/messages` para responder al usuario con texto, botones o listas interactivas.

#### 3. `@bot-dashboard` ↔️ `Base de Datos PostgreSQL` ↔️ `@whatsapp-bot-backend`
El dashboard analítico (Next.js) **nunca realiza peticiones HTTP directas al bot ni a Django**. La comunicación es puramente a través del intercambio de datos en la **base de datos PostgreSQL**.

*   **Flujo de Escritura (Bot):** A medida que el bot procesa webhooks y envía respuestas, utiliza el módulo `DBlogger.servicio.js` (con el driver `pg`) para insertar registros en tiempo real en las tablas `users`, `conversations`, `messages` y `menu_events`.
*   **Flujo de Lectura (Dashboard):** El frontend administrativo consume su propia API interna de Next.js (`src/app/api/...`), la cual ejecuta sentencias `SELECT` de agregación (COUNT, AVG, GROUP BY) sobre la base de datos PostgreSQL para renderizar los gráficos de Recharts.
*   **Datos intercambiados:** Filas de base de datos relacional. El dashboard lee los historiales de conversación, estados (completada, activa, abandonada), intenciones (intent) y los "action_taken" de los menús para construir el funnel.

---

## 6. Flujo funcional del sistema

**Ejemplo representativo: Flujo de Agendamiento**

1.  **Interacción inicial:** El usuario envía la palabra "Agendar" o selecciona la opción en el menú de WhatsApp.
2.  **Recepción:** Meta Cloud API envía un Webhook al `@whatsapp-bot-backend`.
3.  **Procesamiento:** El Bot identifica la intención, registra la acción en PostgreSQL (`menu_events`) y hace un `GET` a `@turnero` para obtener los "buckets" (agendas/servicios) configurados.
4.  **Selección de agenda:** El Bot envía al usuario una lista interactiva. El usuario elige, por ejemplo, "Faciales".
5.  **Consulta de disponibilidad:** El usuario elige una fecha. El Bot hace un `GET` de slots libres a `@turnero` para esa fecha.
6.  **Interacción con Google:** `@turnero` consulta la API de Google Calendar y devuelve los bloques de tiempo libres.
7.  **Captura de datos:** El usuario selecciona el horario de las "10:00". El Bot le solicita su nombre y, opcionalmente, su correo electrónico.
8.  **Confirmación:** El Bot realiza un `POST` a `@turnero` enviando los datos del usuario para concretar la reserva.
9.  **Actualización de Calendario:** `@turnero` actualiza el evento en el Google Calendar "fuente de verdad" a estado "RESERVADO" y crea una copia del evento final en el calendario específico del servicio.
10. **Reporte:** El administrador inicia sesión en `@bot-dashboard` y puede visualizar la nueva métrica de "Agendamiento Exitoso" en el embudo de conversión del dashboard.

---

## 7. Despliegue y ejecución del sistema

Para levantar el entorno de desarrollo o producción, es necesario cumplir con ciertos requisitos previos y seguir un orden específico para asegurar que los servicios dependientes estén disponibles.

**Dependencias globales necesarias:**
*   Node.js (v18 o superior)
*   Python 3 y `pip`
*   PostgreSQL (v14 o superior)
*   Git

**Orden recomendado de ejecución:**
1.  Base de datos PostgreSQL.
2.  API de Turnero (Django) - *Provee las agendas al bot.*
3.  Bot de WhatsApp (Node.js) - *Depende de la BD y de Turnero.*
4.  Dashboard Analytics (Next.js) - *Depende de la BD poblada por el bot.*

A continuación se detalla cómo levantar cada repositorio:

### 7.1. Base de Datos Compartida
*   **Dependencias:** Servidor de base de datos PostgreSQL activo.
1.  Asegúrese de tener el motor de PostgreSQL en ejecución.
2.  Cree una base de datos vacía llamada `whatsapp_bot_db`.
3.  Ejecute el script SQL provisto para inicializar el esquema y las tablas:
    ```bash
    psql -U postgres -d whatsapp_bot_db -f whatsapp-bot-backend/schema.sql
    ```

### 7.2. API de Calendario (`@turnero`)
*   **Dependencias:** Python 3, `pip`, `venv`.
1.  Navegue al directorio del proyecto: `cd turnero`
2.  Cree y active un entorno virtual:
    ```bash
    python -m venv env
    # En Linux/macOS:
    source env/bin/activate  
    # En Windows (PowerShell):
    .\env\Scripts\Activate.ps1
    ```
3.  Instale las dependencias:
    ```bash
    pip install -r requirements.txt
    ```
4.  Asegúrese de tener el archivo de credenciales de Google (`credentials.json`) dentro de la carpeta `credentials/`.
5.  **Comandos principales:**
    ```bash
    python manage.py migrate     # Crear esquema en la BD SQLite interna
    python manage.py runserver   # Iniciar el servidor (por defecto en el puerto 8000)
    ```
6.  *Primer inicio:* Abra `http://127.0.0.1:8000/calendar/oauth2/start` en el navegador para autorizar la cuenta de Google y generar el `token.json`.

### 7.3. Bot de WhatsApp (`@whatsapp-bot-backend`)
*   **Dependencias:** Node.js, `npm`.
1.  Navegue al directorio: `cd whatsapp-bot-backend`
2.  Instale las dependencias de Node:
    ```bash
    npm install
    ```
3.  Configure sus credenciales en el archivo `.env` de la raíz del microservicio.
4.  **Comandos principales:**
    ```bash
    npm run test:db              # Verificar que haya conexión correcta con PostgreSQL
    npm start                    # Iniciar el servicio (por defecto puerto 3000)
    ```
5.  *Desarrollo local:* Para exponer el puerto 3000 y recibir webhooks de Meta, levante un túnel inverso:
    ```bash
    ngrok http 3000
    ```

### 7.4. Panel Administrativo (`@bot-dashboard`)
*   **Dependencias:** Node.js, `npm`.
1.  Navegue al directorio: `cd bot-dashboard`
2.  Instale las dependencias de Node:
    ```bash
    npm install
    ```
3.  Genere el hash criptográfico para la contraseña del usuario administrador:
    ```bash
    node scripts/generate-admin-hash.js "tu_password_segura"
    ```
4.  Guarde las variables (incluyendo el hash) en un archivo `.env.local`.
5.  **Comandos principales:**
    ```bash
    npm run dev -- -p 3001       # Iniciar servidor de desarrollo en puerto 3001
    npm run build                # Compilar el sitio para entorno de producción
    npm start                    # Ejecutar el sitio de producción compilado
    ```

---

## 8. Configuración del Entorno

El sistema se basa en variables de entorno (`.env`) para manejar credenciales, conexiones y configuraciones sensibles sin exponerlas en el código fuente.

A continuación se detallan todas las variables de entorno utilizadas a lo largo de los tres repositorios:

| Variable | Descripción | Repositorio | Obligatoria | Ejemplo |
| :--- | :--- | :--- | :--- | :--- |
| `DB_HOST` | Host de la base de datos PostgreSQL | `@whatsapp-bot-backend`<br>`@bot-dashboard` | Sí | `localhost` |
| `DB_PORT` | Puerto de PostgreSQL | `@whatsapp-bot-backend`<br>`@bot-dashboard` | Sí | `5432` |
| `DB_NAME` | Nombre de la base de datos | `@whatsapp-bot-backend`<br>`@bot-dashboard` | Sí | `whatsapp_bot_db` |
| `DB_USER` | Usuario de PostgreSQL | `@whatsapp-bot-backend`<br>`@bot-dashboard` | Sí | `postgres` |
| `DB_PASSWORD` | Contraseña de PostgreSQL | `@whatsapp-bot-backend`<br>`@bot-dashboard` | Sí | `tu_password` |
| `PORT` | Puerto donde corre el servidor de Node | `@whatsapp-bot-backend` | No (default `3000`) | `3000` |
| `META_VERIFY_TOKEN` | Token secreto para la validación del Webhook de Meta | `@whatsapp-bot-backend` | Sí | `mi_token_secreto_webhook` |
| `META_WA_ACCESS_TOKEN` | Token de acceso (permanente o temporal) de la Graph API de Meta | `@whatsapp-bot-backend` | Sí | `EAAxxxxxxx...` |
| `META_WA_PHONE_NUMBER_ID` | ID único del número de teléfono en Meta | `@whatsapp-bot-backend` | Sí | `1012820511906792` |
| `DJANGO_API_BASE_URL` | URL base donde responde la API de Turnero (Django) | `@whatsapp-bot-backend` | Sí | `http://127.0.0.1:8000` |
| `LOG_LEVEL` | Nivel de detalle de los logs generados con Winston | `@whatsapp-bot-backend` | No (default `info`) | `info` o `debug` |
| `ADMIN_USERNAME` | Nombre de usuario para iniciar sesión en el Dashboard | `@bot-dashboard` | Sí | `admin` |
| `ADMIN_PASSWORD_HASH` | Contraseña hasheada (bcrypt) para el Dashboard (los `$` deben escaparse con `\`) | `@bot-dashboard` | Sí | `\$2b\$10\$hash_completo...` |
| `JWT_SECRET` | Llave secreta para firmar los tokens JWT de sesión | `@bot-dashboard` | Sí | `dev_secret_jwt` |
| `SECRET_KEY` | Clave secreta criptográfica de la aplicación Django | `@turnero` | Sí | `django-insecure-...` |
| `DEBUG` | Modo debug en Django (`True` o `False`) | `@turnero` | No (default `False`) | `True` |
| `ALLOWED_HOST` | Hostnames permitidos para la API de Django (separados por comas) | `@turnero` | Sí | `127.0.0.1,localhost` |
| `GOOGLE_OAUTH_REDIRECT_URI` | URL de redirección (callback) luego del flujo OAuth de Google | `@turnero` | Sí | `http://127.0.0.1:8000/calendar/oauth2/callback` |
| `GOOGLE_CALENDAR_BD_ID` | ID del calendario "maestro" de Google que actúa como fuente de verdad | `@turnero` | Sí | `c5f2...group.calendar.google.com` |

> **Nota:** Para el correcto funcionamiento en desarrollo, deben crearse los archivos `.env` respectivos en la raíz de cada repositorio (para el `@bot-dashboard` se suele utilizar `.env.local`).

---

## 9. API y endpoints

### En `@whatsapp-bot-backend` (Públicos y Locales)
*   `GET /webhook`: Endpoint para la validación inicial requerida por Meta.
*   `POST /webhook`: Webhook principal que recibe los eventos y mensajes entrantes de WhatsApp.
*   `GET /metrics/whatsapp/costs`: Retorna una estimación de costos asociados a la mensajería.
*   `GET /metrics/whatsapp/log`: Permite visualizar los logs más recientes en crudo.

### En `@bot-dashboard` (API Next.js Interna)
*   `POST /api/auth/login`: Autenticación y expedición del token JWT.
*   `GET /api/conversations/summary`: Agregaciones analíticas de los chats.
*   `GET /api/conversations/user/[id]`: Desglose del historial de conversación de un usuario específico.
*   `GET /api/export/csv`: Exportación tabulada de usuarios, conversaciones o eventos de menú.
*   `GET /api/menu/funnel`: Generación de datos para el embudo de navegación del bot.
*   `GET /api/messages/peak-hours`: Cálculo de franjas de máxima actividad (horarios pico).
*   `GET /api/services/top`: Ranking de los servicios médicos con mayor interés.

### En `@turnero` (Microservicio REST)

A continuación se detallan los endpoints expuestos por la API de Django (aplicación `calendar_app`):

#### 1. Obtener Agendas (Buckets) desde Google Calendar
| Campo | Detalle |
| :--- | :--- |
| **Método** | `GET` |
| **Ruta** | `/calendar/buckets/google` |
| **Descripción** | Escanea eventos del calendario BD en un rango razonable y extrae los nombres lógicos de los buckets únicos directamente desde Google Calendar. |
| **Parámetros** | Ninguno. |
| **Respuesta Esperada** | `200 OK`: `{"buckets": ["medico", "peluqueria", ...]}` |
| **Consumido por** | `@whatsapp-bot-backend` (UI del Bot), UI de `@turnero`. |

#### 2. Obtener Agendas (Buckets) desde Tabla Local
| Campo | Detalle |
| :--- | :--- |
| **Método** | `GET` |
| **Ruta** | `/calendar/buckets/tabla` |
| **Descripción** | Lista las agendas (buckets) almacenadas en la base de datos local (SQLite). |
| **Parámetros** | Ninguno. |
| **Respuesta Esperada** | `200 OK`: `{"buckets": ["medico", "peluqueria", ...]}` |
| **Consumido por** | UI web interna de `@turnero`. |

#### 3. Sincronizar Agendas (Buckets)
| Campo | Detalle |
| :--- | :--- |
| **Método** | `POST` |
| **Ruta** | `/calendar/buckets/sincronizar` |
| **Descripción** | Fuerza la sincronización entre la BD local (SQLite) y Google Calendar BD. Lee todos los eventos, extrae los buckets presentes y elimina los registros locales que ya no tienen eventos (buckets fantasma). |
| **Parámetros (Body)** | `silent` (boolean, opcional, default: `false`). |
| **Respuesta Esperada** | `200 OK`: Objeto JSON con `synced_at`, `buckets_in_google`, `deleted_from_table`, `deleted_count` y un `message`. |
| **Consumido por** | Interfaz UI de limpieza de `@turnero`. |

#### 4. Consultar Horarios (Slots) Libres
| Campo | Detalle |
| :--- | :--- |
| **Método** | `GET` |
| **Ruta** | `/calendar/buckets/{bucket}/slots/libres` |
| **Descripción** | Consulta los horarios disponibles dentro de una agenda específica. Se puede solicitar incluir tanto los disponibles como los reservados (para la vista de calendario). |
| **Parámetros (Path)** | `bucket` (string, requerido). |
| **Parámetros (Query)** | `desde` (date, YYYY-MM-DD, requerido), `hasta` (date, YYYY-MM-DD, opcional), `limit` (int, opcional, default: 100), `include_all` (string, opcional, `1` o `true`), `professional_key` (string, opcional), `professional_name` (string, opcional). |
| **Respuesta Esperada** | `200 OK`: Objeto JSON con el `bucket`, `desde`, `hasta`, `count` y una lista de `slots` (ID, summary, start, end, slot_status, etc.). |
| **Consumido por** | `@whatsapp-bot-backend` (para mostrar turnos al cliente), UI de `@turnero`. |

#### 5. Generar Horarios (Slots)
| Campo | Detalle |
| :--- | :--- |
| **Método** | `POST` |
| **Ruta** | `/calendar/buckets/{bucket}/slots/generar` |
| **Descripción** | Genera bloques de tiempo de disponibilidad basados en la configuración solicitada en el calendario maestro (BD). Crea un calendario FINAL y un registro local si el bucket es nuevo. |
| **Parámetros (Path)** | `bucket` (string, requerido). |
| **Parámetros (Body)** | `professional_name` (string, requerido). Puede recibir slot único (`start`, `end`) o rango masivo (`range_start_date`, `range_end_date`, `slot_minutes`, `weekdays`, `windows`, `blocks`). |
| **Respuesta Esperada** | `201 Created`: `{"bucket": "...", "created_count": X, "created_ids": [...]}`. `400/409` si hay choques. |
| **Consumido por** | UI de generación de slots de `@turnero`. |

#### 6. Reservar un Turno
| Campo | Detalle |
| :--- | :--- |
| **Método** | `POST` |
| **Ruta** | `/calendar/buckets/{bucket}/slots/{event_id}/reservar` |
| **Descripción** | Consolida y confirma una cita médica. Valida el profesional, cambia el estado del slot en el calendario BD a "RESERVADO" y crea un evento firme en el calendario FINAL del bucket. |
| **Parámetros (Path)** | `bucket` (string, requerido), `event_id` (string, requerido). |
| **Parámetros (Body)** | `customer_name` (string, requerido), `professional_key` (string, requerido), `customer_phone` (string, opcional), `notes` (string, opcional), `attendee_email` (string, opcional), `attendees` (lista, opcional). |
| **Respuesta Esperada** | `200 OK`: `bd_updated`, `bucket`, `bd_event_id`, `final_calendar_id`, `final_event_id`, `final_htmlLink`. |
| **Consumido por** | `@whatsapp-bot-backend`. |

#### 7. Limpiar Calendario Completo
| Campo | Detalle |
| :--- | :--- |
| **Método** | `POST` |
| **Ruta** | `/calendar/calendars/limpiar` |
| **Descripción** | Acción destructiva para limpiar por completo un calendario específico por su ID. |
| **Parámetros (Body)** | `calendar_id` (string, requerido), `range_start_date` (date, opcional), `range_end_date` (date, opcional). |
| **Respuesta Esperada** | `200 OK`: Detalle de los eventos borrados (`deleted_count`, `sample_deleted_ids`). |
| **Consumido por** | UI web interna de `@turnero`. |

#### 8. Limpiar Calendario por Bucket
| Campo | Detalle |
| :--- | :--- |
| **Método** | `POST` |
| **Ruta** | `/calendar/calendars/limpiar-bucket` |
| **Descripción** | Acción destructiva segmentada. Elimina solo los eventos pertenecientes a un bucket (agenda) en particular dentro de un calendario. |
| **Parámetros (Body)** | `calendar_id` (string, requerido), `bucket` (string, requerido), `range_start_date` (date, opcional), `range_end_date` (date, opcional). |
| **Respuesta Esperada** | `200 OK`: Detalle de los eventos borrados (`deleted_count`, `sample_deleted_ids`). |
| **Consumido por** | UI web interna de `@turnero`. |

---

## 10. Integraciones externas

1.  **Meta WhatsApp Cloud API (Graph API v20.0):** 
    Utilizada por el bot para enviar plantillas, textos libres, y mensajes interactivos (botones y listas), así como para recibir los webhooks de interacciones del usuario.
2.  **Google Calendar API (v3):** 
    Integrada mediante el protocolo OAuth 2.0 en `@turnero`. Se usa para leer disponibilidad, registrar y actualizar eventos (Citas/Slots), y generar invitaciones de calendario en tiempo real.

---

## 11. Modelo de datos

### PostgreSQL (Compartida: Bot y Dashboard)
Las tablas principales se encuentran en el script `schema.sql`:
*   **`users`**: Entidad del cliente. Mantiene `id` (UUID), `phone_hash` (para privacidad), `phone_raw` (opcional), `first_seen`, `last_seen` y totalizadores de interacción.
*   **`conversations`**: Sesiones lógicas de un usuario. Almacena `id`, `user_id`, timestamps de inicio/fin, `status` (activa, abandonada, completada), `intent` y el `outcome` (ej. agendamiento_exitoso).
*   **`messages`**: Registro atómico de mensajería bidireccional. Incluye `conversation_id`, `direction`, `message_type`, contenido truncado y el `payload` JSON completo (metadata de WhatsApp).
*   **`menu_events`**: Trazabilidad del usuario en el menú interactivo para analítica. Incluye `option_code`, `action_taken`, `menu_level` y `menu_category`.
*   **`raw_events`**: Tabla opcional utilizada para debugging, guarda el dump del webhook tal como llega.

### SQLite (`db.sqlite3` - Interna Turnero)
*   **`Bucket`**: Mapea el nombre semántico de una agenda (ej. "faciales") con su respectivo identificador final en Google Calendar (`final_calendar_id`), para mantener un enrutamiento correcto y abstraer los IDs complejos de Google.

---

## 12. Riesgos técnicos

1.  **Almacenamiento de Estado Volátil:** El bot de WhatsApp utiliza un archivo de texto local (`data/agenda_state.json`) para mantener la sesión y el estado del agendamiento del usuario. Esta decisión impide la escalabilidad horizontal segura (múltiples réplicas de Node.js se desincronizarían).
2.  **Manejo de Caché en Django:** La vista de generación de slots en `@turnero` implementa el backend `LocMemCache` para locks, previniendo la duplicación de slots. Similar al punto anterior, este diseño previene escalar Django en múltiples contenedores.
3.  **Límites de Tasa de Google (Quotas):** La generación de slots programáticos crea eventos iterativamente. Procesar periodos de tiempo muy amplios (meses o años) en una sola llamada, o concurrencias muy altas, puede provocar bloqueos temporales por políticas de Rate Limiting de la API de Google Calendar.
4.  **Sensibilidad a Metadatos Manuales (Legacy Regex):** El backend de Django busca metadatos ocultos en la descripción de los eventos en el calendario (ej. `bucket=...`) como método de respaldo. Alteraciones manuales por humanos directamente sobre los eventos de Google Calendar podrían corromper esta información y desestabilizar el filtrado de turnos.
5.  **Exposición de Datos Personales:** Aunque existe un `phone_hash`, el sistema actualmente guarda el `phone_raw` en formato de texto plano dentro de la base de datos PostgreSQL, representando una consideración pendiente en las políticas de seguridad y privacidad.
6.  **Conflicto de Puertos Locales:** Por defecto, los repositorios `@whatsapp-bot-backend` y `@bot-dashboard` configuran y reclaman el puerto `3000`, provocando colisiones si se inician de forma estándar en el mismo entorno de desarrollo.

---

## 13. Recomendaciones de mejora

*   **Migrar Manejo de Estado a Redis/PostgreSQL:** 
    Es imperativo reemplazar el archivo `agenda_state.json` del bot de Node y el `LocMemCache` de Django por un almacenamiento en memoria distribuida como Redis, o utilizar la base de datos PostgreSQL existente para permitir alta disponibilidad y balanceo de carga.
*   **Cifrado a Nivel de Aplicación:** 
    Se debe implementar una estrategia de cifrado (ej. AES-256) al momento de almacenar información sensible como `phone_raw` o nombres, asegurando cumplimiento de estándares de privacidad de datos personales.
*   **Gestión Asíncrona de Calendarios:** 
    Para evitar penalizaciones en la API de Google, se recomienda implementar una cola de mensajes (RabbitMQ, Celery o Bull) que maneje la creación/eliminación masiva de slots de Google Calendar en segundo plano.
*   **Centralización de Puertos / Dockerización:** 
    Incluir archivos `docker-compose.yml` en la raíz del ecosistema facilitaría el arranque simultáneo de todos los microservicios sin conflicto de puertos y encapsulando las variables de entorno.

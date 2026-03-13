## 1. Estructura del proyecto

El proyecto **whatsapp-bot-backend** queda organizado de la siguiente forma:

```
whatsapp-bot-backend/
├── src/
│   ├──index.js
│   ├── servidor.js
│   ├── rutas/
│   │   └── webhook.rutas.js
│   ├── controladores/
│   │   └── webhook.controlador.js
│   ├── servicios/
│   │   ├── autorespuesta.servicio.js
│   │   └── whatsapp.servicio.js
│   └── base_conocimiento/
│       ├── respuestas.json
│       └── respuestas.servicio.js
├── .env
├── .env.example
├── package.json
└── package-lock.json

```

### Descripción general de carpetas

- `src/` → código fuente del backend
- `rutas/` → definición de endpoints HTTP
- `controladores/` → interpretación de requests y extracción de datos
- `servicios/` → lógica de negocio y comunicación externa
- `base_conocimiento/` → reglas y respuestas configurables
- `.env` → variables de entorno (tokens, puertos, IDs)

### Descripción general de archivos del proyecto

- **`package.json`** → define la configuración del proyecto Node.js, incluyendo:
    - nombre y versión del proyecto
    - dependencias utilizadas (Express, Axios, dotenv)
    - scripts de ejecución (`npm start`)
- **`package-lock.json`** → archivo generado automáticamente por npm que asegura:
    - versiones exactas de las dependencias
    - consistencia del entorno entre instalaciones

📌 Estos archivos son fundamentales para la correcta instalación y ejecución del backend, pero **no contienen lógica de negocio**.

---

## 2. Punto de entrada de la aplicación

### `src/index.js`

Archivo mínimo que actúa como **punto de entrada del backend**.

**Responsabilidad:**

- Iniciar la aplicación importando la configuración del servidor

```jsx
import"./servidor.js";

```

📌 No contiene lógica HTTP ni lógica de negocio.

---

## 3. Configuración del servidor HTTP

### `src/servidor.js`

Encargado de levantar el servidor **Express**.

**Responsabilidades:**

- Cargar variables de entorno (`dotenv`)
- Inicializar Express
- Registrar middlewares
- Registrar rutas
- Levantar el servidor con `listen()`

Este archivo define el entorno de ejecución del backend.

---

## 4. Definición de rutas

### `src/rutas/webhook.rutas.js`

Define los endpoints expuestos por el backend:

- `GET /webhook` → verificación del webhook con Meta
- `POST /webhook` → recepción de eventos de WhatsApp

**Responsabilidad:**

- Enrutamiento
- Delegar la lógica al controlador correspondiente

---

## 5. Controlador del webhook

### `src/controladores/webhook.controlador.js`

Interpreta los datos recibidos desde WhatsApp Cloud API.

**Responsabilidades:**

- Validar la verificación del webhook
- Responder `200 OK` inmediatamente al recibir eventos
- Extraer el número del usuario (`from`)
- Extraer el texto del mensaje
- Delegar el procesamiento al servicio de autorespuesta

📌 Este archivo **no decide respuestas**, solo gestiona el flujo.

---

## 6. Servicios de la aplicación

### 6.1 Servicio de autorespuesta

### `src/servicios/autorespuesta.servicio.js`

Es el **núcleo de la lógica de negocio**.

**Responsabilidades:**

- Recibir el mensaje normalizado
- Consultar la base de conocimiento
- Determinar la respuesta adecuada
- Solicitar el envío del mensaje

No depende de Express ni de la estructura HTTP.

---

### 6.2 Servicio de WhatsApp

### `src/servicios/whatsapp.servicio.js`

Encapsula la comunicación con **WhatsApp Cloud API (Graph API)**.

**Responsabilidades:**

- Enviar mensajes usando el endpoint `/messages`
- Utilizar `phone_number_id` y `access_token`
- Manejar errores de autenticación y envío

Esto permite aislar la API externa del resto del sistema.

---

## 7. Base de conocimiento

### 7.1 Archivo de respuestas

### `src/base_conocimiento/respuestas.json`

Archivo declarativo que contiene las reglas de conversación.

**Características:**

- Define palabras clave
- Define respuestas automáticas

<aside>
🚨

> Puede ampliarse sin modificar código
> 
</aside>

Ejemplo de estructura:

```json
{
"palabras_clave":["horario","atienden"],
"respuesta":"Nuestro horario es de Lunes a Viernes, 09:00 a 18:00."
}

```

---

### 7.2 Servicio de búsqueda de respuestas

### `src/base_conocimiento/respuestas.servicio.js`

Encargado de:

- Normalizar el texto de entrada
- Comparar contra las palabras clave
- Retornar la respuesta correspondiente
- Aplicar un mensaje de fallback si no hay coincidencias

---

## 8. Flujo general de funcionamiento

1. El usuario envía un mensaje por WhatsApp
2. Meta envía un evento `POST /webhook`
3. El backend responde `200 OK` inmediatamente
4. El controlador procesa el evento
5. El servicio de autorespuesta decide la respuesta
6. El servicio de WhatsApp envía el mensaje
7. El usuario recibe la respuesta

📌 El webhook y el envío de mensajes son **flujos HTTP independientes**.

---

## 9. Diagramas de arquitectura y flujo HTTP

### 9.1 Diagrama de flujo HTTP (Webhook y envío de mensajes)

https://drive.google.com/file/d/1BJFfbg67D4KxLxXBGDItECQBokyEc3YC/view?usp=drive_web

### 9.2 Diagrama de arquitectura interna (comunicación entre archivos)

https://drive.google.com/file/d/1Iju86HYUdWTL48KjQiubSp_9IP1BjRB4/view?usp=drive_web

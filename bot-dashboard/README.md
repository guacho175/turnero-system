# WhatsApp Bot Dashboard API

Guía para probar los endpoints (Sprint 2)

------------------------------------------------------------------------

## Requisitos

-   Node.js instalado

-   Proyecto corriendo en:

    http://localhost:3000

-   curl instalado

------------------------------------------------------------------------

## 1. Iniciar el servidor

``` bash
npm install
npm run dev
```

Verificar que el servidor esté escuchando en:

http://localhost:3000

------------------------------------------------------------------------

## 2. Autenticación

Todos los endpoints (excepto login) requieren un token JWT.

### Login

``` bash
curl -X POST http://localhost:3000/api/auth/login   -H "Content-Type: application/json"   -d '{"username":"admin","password":"Joako2004@"}'
```

Respuesta esperada:

``` json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "8h",
  "user": {
    "username": "admin",
    "role": "admin"
  }
}
```

### Guardar el token

``` bash
TOKEN="pegar_aqui_el_token"
```

Usar en todos los requests:

``` bash
-H "Authorization: Bearer $TOKEN"
```

------------------------------------------------------------------------

## 3. Probar los endpoints

### 3.1 Resumen de Usuarios

``` bash
curl http://localhost:3000/api/users/summary   -H "Authorization: Bearer $TOKEN"
```

Con filtros:

``` bash
curl "http://localhost:3000/api/users/summary?from=2026-02-01&to=2026-02-28"   -H "Authorization: Bearer $TOKEN"
```

------------------------------------------------------------------------

### 3.2 Resumen de Conversaciones

``` bash
curl http://localhost:3000/api/conversations/summary   -H "Authorization: Bearer $TOKEN"
```

------------------------------------------------------------------------

### 3.3 Historial de Usuario

``` bash
curl http://localhost:3000/api/conversations/user/1d1785b6-a99e-4ca6-9932-4d36f2d18082 \-H "Authorization: Bearer $TOKEN"
```

------------------------------------------------------------------------

### 3.4 Top Servicios

``` bash
curl http://localhost:3000/api/services/top   -H "Authorization: Bearer $TOKEN"
```

------------------------------------------------------------------------

### 3.5 Funnel del Menú

``` bash
curl http://localhost:3000/api/menu/funnel   -H "Authorization: Bearer $TOKEN"
```

------------------------------------------------------------------------

### 3.6 Horarios Pico

``` bash
curl http://localhost:3000/api/messages/peak-hours   -H "Authorization: Bearer $TOKEN"
```

------------------------------------------------------------------------

### 3.7 Exportación CSV

Exportar usuarios:

``` bash
curl -OJ http://localhost:3000/api/export/csv?type=users   -H "Authorization: Bearer $TOKEN"
```

Exportar conversaciones con rango de fecha:

``` bash
curl -OJ "http://localhost:3000/api/export/csv?type=conversations&from=2026-02-01&to=2026-02-28"   -H "Authorization: Bearer $TOKEN"
```

Tipos disponibles:

-   users
-   conversations
-   messages
-   menu_events

El archivo descargado tendrá formato:

tipo_YYYY-MM-DD.csv

------------------------------------------------------------------------

## Flujo recomendado

1.  Login
2.  Guardar TOKEN
3.  Probar endpoints principales
4.  Obtener userId
5.  Probar historial
6.  Exportar CSV

------------------------------------------------------------------------

## Errores comunes

401 Unauthorized\
Token inválido o expirado.

500 Server Error\
Revisar variables de entorno (ej: ADMIN_PASSWORD_HASH).

ADMIN_PASSWORD_HASH no funciona
Los `$` del hash bcrypt deben escaparse con `\` en `.env.local`:
```env
ADMIN_PASSWORD_HASH=\$2b\$10\$hash_completo_aqui
```
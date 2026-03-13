import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_cambiar_en_produccion";

/**
 * Verifica el token JWT de la request
 * Uso: const user = verifyToken(request)
 */
export function verifyToken(request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  
  const token = authHeader.split(" ")[1];

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Genera un token JWT para el admin
 */
export function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
}

/**
 * MiddleWare para proteger rutas de la API
 * Retorna Response de error si no está autenticado, null si está ok
 */
export function requireAuth(request) {
    const user = verifyToken(request);
    if (!user) {
        return Response.json(
            { error: "No está autorizado. Token inválido o expirado" },
            { status: 401 }
        );
    }
    return null; // OK
}

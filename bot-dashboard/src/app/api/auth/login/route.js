/**
 * Este endpoint permite al administrador iniciar sesión y obtener un token JWT váñido por 8h
 * El token es necesari para acceder a los demás endpoints
 */
import bcrypt from "bcryptjs";
import { generateToken } from "@/lib/auth";

export async function POST(request) {
    try {
        const { username, password } = await request.json();

        const adminUsername = process.env.ADMIN_USERNAME || "admin";
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH

        if (!adminPasswordHash) {
            return Response.json(
                { error: "Servidor no configurado correctamente. Falta ADMIN_PASSWORD_HASH" },
                { status: 500 }
            );
        }

        if (username !== adminUsername) {
            return Response.json(
                { error: "Credenciales inválidas" },
                { status: 401 }
            );
        }

        const valid = await bcrypt.compare(password, adminPasswordHash);
        if (!valid) {
            return Response.json(
                { error: "Credenciales inválidas" },
                { status: 401 }   
            );
        }

        const token = generateToken({ username, role: "admin" });

        return Response.json({
            token,
            expiresIn: "8h",
            user: { username, role: "admin" },
        });
    } catch (error) {
        return Response.json(
            { error: "Error interno del servidor" },
            { status: 500 }
        );
    }
}

/**
 * Devuelve el historial completo de conversaciones de un usuario específico, incluyendo mensajes y eventos del menú de cada sesión
 */
import { query } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(request, { params }) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const resolvedParams = await params; 
  const { id: userId } = resolvedParams;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20"), 100);
  const offset = (page - 1) * pageSize;

  if (!userId) {
    return Response.json({ error: "userId es requerido" }, { status: 400 });
  }

  try {
    // Verificar que el usuario existe
    const userResult = await query(
      `SELECT id, phone_hash, first_seen, last_seen, 
              total_conversations, total_messages, total_menu_interactions
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const user = userResult.rows[0];

    // Conversaciones del usuario con paginación
    const conversationsResult = await query(
      `SELECT 
         c.id,
         c.started_at,
         c.ended_at,
         c.status,
         c.intent,
         c.outcome,
         c.total_messages,
         c.duration_seconds
       FROM conversations c
       WHERE c.user_id = $1
       ORDER BY c.started_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset]
    );

    // Total de conversaciones para paginación
    const totalResult = await query(
      `SELECT COUNT(*) as total FROM conversations WHERE user_id = $1`,
      [userId]
    );

    const total = parseInt(totalResult.rows[0]?.total || 0);

    // Para cada conversación, obtener sus mensajes
    const conversationsWithMessages = await Promise.all(
      conversationsResult.rows.map(async (conv) => {
        const messagesResult = await query(
          `SELECT 
             id,
             direction,
             message_type,
             content,
             timestamp,
             wa_status
           FROM messages
           WHERE conversation_id = $1
           ORDER BY timestamp ASC`,
          [conv.id]
        );

        const menuEventsResult = await query(
          `SELECT 
             option_code,
             option_title,
             menu_level,
             menu_category,
             action_taken,
             timestamp
           FROM menu_events
           WHERE conversation_id = $1
           ORDER BY timestamp ASC`,
          [conv.id]
        );

        return {
          ...conv,
          messages: messagesResult.rows,
          menu_events: menuEventsResult.rows,
        };
      })
    );

    return Response.json({
      user,
      conversations: conversationsWithMessages,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error en /api/conversations/[userId]:", error);
    return Response.json({ error: "Error al obtener conversaciones del usuario" }, { status: 500 });
  }
}
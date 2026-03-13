/**
 * Devuelve métricas agregadas sobre todos los usuarios que interactuaron con el bot
 * Permite detectar cuántos son nuevos, cuántos son activos y cuántos son recurrentes
 */
import { query } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("from");
  const dateTo = searchParams.get("to");

  try {
    const params = [];
    let dateFilter = "";

    if (dateFrom) {
      params.push(dateFrom);
      dateFilter += ` AND u.first_seen >= $${params.length}`;
    }
    if (dateTo) {
      params.push(dateTo);
      dateFilter += ` AND u.first_seen <= $${params.length}`;
    }

    // Total de usuarios
    const totalResult = await query(
      `SELECT COUNT(*) as total FROM users u WHERE 1=1 ${dateFilter}`,
      params
    );

    // Usuarios con conversación activa
    const activeParams = [];
    let activeDateFilter = "";
    if (dateFrom) {
      activeParams.push(dateFrom);
      activeDateFilter += ` AND c.started_at >= $${activeParams.length}`;
    }
    if (dateTo) {
      activeParams.push(dateTo);
      activeDateFilter += ` AND c.started_at <= $${activeParams.length}`;
    }

    const activeResult = await query(
      `SELECT COUNT(DISTINCT u.id) as active
       FROM users u
       INNER JOIN conversations c ON u.id = c.user_id
       WHERE c.status = 'active' ${activeDateFilter}`,
      activeParams
    );

    // Usuarios recurrentes (más de 1 conversación)
    const recurrentResult = await query(
      `SELECT COUNT(*) as recurrent
       FROM users u
       WHERE u.total_conversations > 1 ${dateFilter}`,
      params
    );

    // Últimos 10 usuarios más recientes
    const recentResult = await query(
      `SELECT 
         u.id,
         u.phone_hash,
         u.first_seen,
         u.last_seen,
         u.total_conversations,
         u.total_messages,
         u.total_menu_interactions
       FROM users u
       WHERE 1=1 ${dateFilter}
       ORDER BY u.last_seen DESC
       LIMIT 10`,
      params
    );

    return Response.json({
      total_users: parseInt(totalResult.rows[0]?.total || 0),
      active_users: parseInt(activeResult.rows[0]?.active || 0),
      recurrent_users: parseInt(recurrentResult.rows[0]?.recurrent || 0),
      recent_users: recentResult.rows,
      filters: { from: dateFrom, to: dateTo },
    });

  } catch (error) {
    console.error("Error en /api/users/summary:", error);
    return Response.json(
      { error: "Error al obtener resumen de usuarios" },
      { status: 500 }
    );
  }
}
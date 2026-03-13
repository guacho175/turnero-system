/**
 * Analiza el movimiento de los usuarios por los menues del bot, cuántos llegan all menú principal, cuántos preguntan por categorías etc
 * Útil para identificar puntos de fricción y abandono
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
      dateFilter += ` AND timestamp >= $${params.length}`;
    }
    if (dateTo) {
      params.push(dateTo);
      dateFilter += ` AND timestamp <= $${params.length}`;
    }

    // Estadísticas por nivel de menú
    const levelStats = await query(
      `SELECT 
         menu_level,
         COUNT(*) as total_interactions,
         COUNT(DISTINCT user_id) as unique_users,
         COUNT(DISTINCT conversation_id) as unique_conversations
       FROM menu_events
       WHERE 1=1 ${dateFilter}
       GROUP BY menu_level
       ORDER BY menu_level ASC`,
      params
    );

    // Estadísticas por categoría
    const categoryStats = await query(
      `SELECT 
         COALESCE(menu_category, 'sin_categoria') as category,
         COUNT(*) as total,
         COUNT(DISTINCT user_id) as unique_users
       FROM menu_events
       WHERE 1=1 ${dateFilter}
       GROUP BY menu_category
       ORDER BY total DESC`,
      params
    );

    // Top opciones del menú principal (nivel 0)
    const level0Options = await query(
      `SELECT 
         option_code,
         option_title,
         COUNT(*) as selections,
         COUNT(DISTINCT user_id) as unique_users
       FROM menu_events
       WHERE menu_level = 0 ${dateFilter}
       GROUP BY option_code, option_title
       ORDER BY selections DESC`,
      params
    );

    // Top opciones del nivel 1 (categorías)
    const level1Options = await query(
      `SELECT 
         option_code,
         option_title,
         COUNT(*) as selections,
         COUNT(DISTINCT user_id) as unique_users
       FROM menu_events
       WHERE menu_level = 1 ${dateFilter}
       GROUP BY option_code, option_title
       ORDER BY selections DESC
       LIMIT 15`,
      params
    );

    // Acciones tomadas (view, agendar, back, exit)
    const actionStats = await query(
      `SELECT 
         COALESCE(action_taken, 'view') as action,
         COUNT(*) as total,
         COUNT(DISTINCT user_id) as unique_users
       FROM menu_events
       WHERE 1=1 ${dateFilter}
       GROUP BY action_taken
       ORDER BY total DESC`,
      params
    );

    // Tasa de llegada a acción de agendar
    const funnelConversion = await query(
      `SELECT
         COUNT(DISTINCT CASE WHEN menu_level >= 0 THEN conversation_id END) as reached_menu,
         COUNT(DISTINCT CASE WHEN menu_level >= 1 THEN conversation_id END) as reached_category,
         COUNT(DISTINCT CASE WHEN menu_level >= 2 THEN conversation_id END) as reached_service,
         COUNT(DISTINCT CASE WHEN action_taken = 'agendar' THEN conversation_id END) as reached_booking
       FROM menu_events
       WHERE 1=1 ${dateFilter}`,
      params
    );

    return Response.json({
      by_level: levelStats.rows,
      by_category: categoryStats.rows,
      by_action: actionStats.rows,
      level_0_options: level0Options.rows,
      level_1_options: level1Options.rows,
      funnel: funnelConversion.rows[0],
      filters: { from: dateFrom, to: dateTo },
    });
  } catch (error) {
    console.error("Error en /api/menu/funnel:", error);
    return Response.json({ error: "Error al obtener funnel de menú" }, { status: 500 });
  }
}
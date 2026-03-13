/**
 * Devuelve el top de serivicios más consultados por clientes, usando los eventos del menú
 */
import { query } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("from");
  const dateTo = searchParams.get("to");
  const limit = parseInt(searchParams.get("limit") || "10");

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

    params.push(Math.min(limit, 50)); // máx 50
    const limitParam = `$${params.length}`;

    // Top servicios (usa la lógica de v_top_services pero con filtros de fecha)
    const servicesResult = await query(
      `SELECT 
         option_code,
         option_title,
         COUNT(*) as total_views,
         COUNT(DISTINCT user_id) as unique_users,
         COUNT(DISTINCT conversation_id) as unique_conversations,
         MAX(timestamp) as last_viewed
       FROM menu_events
       WHERE option_code LIKE 'SERV|%' ${dateFilter}
       GROUP BY option_code, option_title
       ORDER BY total_views DESC
       LIMIT ${limitParam}`,
      params
    );

    // Top categorías
    const categoriesResult = await query(
      `SELECT 
         option_code,
         option_title,
         COUNT(*) as total_views,
         COUNT(DISTINCT user_id) as unique_users
       FROM menu_events
       WHERE option_code LIKE 'CAT|%' ${dateFilter}
       GROUP BY option_code, option_title
       ORDER BY total_views DESC
       LIMIT 10`,
      params.slice(0, -1) // sin el limit param
    );

    // Tasa de conversión: cuántos que vieron un servicio luego agendaron
    const conversionResult = await query(
      `SELECT 
         me.option_code,
         me.option_title,
         COUNT(DISTINCT me.conversation_id) as viewed,
         COUNT(DISTINCT c.id) FILTER (WHERE c.outcome = 'agendamiento_exitoso') as converted
       FROM menu_events me
       LEFT JOIN conversations c ON me.conversation_id = c.id
       WHERE me.option_code LIKE 'SERV|%' ${dateFilter}
       GROUP BY me.option_code, me.option_title
       ORDER BY viewed DESC
       LIMIT 10`,
      params.slice(0, -1)
    );

    return Response.json({
      top_services: servicesResult.rows,
      top_categories: categoriesResult.rows,
      conversion_by_service: conversionResult.rows,
      filters: { from: dateFrom, to: dateTo, limit },
    });
  } catch (error) {
    console.error("Error en /api/services/top:", error);
    return Response.json({ error: "Error al obtener top servicios" }, { status: 500 });
  }
}

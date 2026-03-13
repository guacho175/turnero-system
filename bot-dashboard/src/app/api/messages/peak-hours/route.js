/**
 * Analiza el volumen de mensajes por hora del día, día de la semana y del mes
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

    // Mensajes por hora del día (0-23)
    const byHour = await query(
      `SELECT 
         EXTRACT(HOUR FROM timestamp)::INTEGER as hour,
         COUNT(*) as total_messages,
         COUNT(*) FILTER (WHERE direction = 'incoming') as incoming,
         COUNT(*) FILTER (WHERE direction = 'outgoing') as outgoing,
         COUNT(DISTINCT user_id) as unique_users
       FROM messages
       WHERE 1=1 ${dateFilter}
       GROUP BY EXTRACT(HOUR FROM timestamp)
       ORDER BY hour ASC`,
      params
    );

    // Mensajes por día de la semana (0=domingo, 6=sábado)
    const byDayOfWeek = await query(
      `SELECT 
         EXTRACT(DOW FROM timestamp)::INTEGER as day_of_week,
         TO_CHAR(timestamp, 'Day') as day_name,
         COUNT(*) as total_messages,
         COUNT(DISTINCT user_id) as unique_users
       FROM messages
       WHERE 1=1 ${dateFilter}
       GROUP BY EXTRACT(DOW FROM timestamp), TO_CHAR(timestamp, 'Day')
       ORDER BY day_of_week ASC`,
      params
    );

    // Mensajes por día (últimos 30 días)
    const byDay = await query(
      `SELECT 
         DATE(timestamp) as date,
         COUNT(*) as total_messages,
         COUNT(*) FILTER (WHERE direction = 'incoming') as incoming,
         COUNT(*) FILTER (WHERE direction = 'outgoing') as outgoing,
         COUNT(DISTINCT user_id) as unique_users
       FROM messages
       WHERE timestamp >= NOW() - INTERVAL '30 days' ${dateFilter}
       GROUP BY DATE(timestamp)
       ORDER BY date ASC`,
      params
    );

    // Hora pico (la hora con más mensajes)
    const peakHour = byHour.rows.reduce(
      (max, row) => (parseInt(row.total_messages) > parseInt(max.total_messages || 0) ? row : max),
      {}
    );

    // Estadísticas generales
    const statsResult = await query(
      `SELECT 
         COUNT(*) as total_messages,
         COUNT(*) FILTER (WHERE direction = 'incoming') as total_incoming,
         COUNT(*) FILTER (WHERE direction = 'outgoing') as total_outgoing,
         COUNT(DISTINCT user_id) as unique_users,
         COUNT(DISTINCT conversation_id) as unique_conversations
       FROM messages
       WHERE 1=1 ${dateFilter}`,
      params
    );

    return Response.json({
      by_hour: byHour.rows,
      by_day_of_week: byDayOfWeek.rows,
      by_day_last_30: byDay.rows,
      peak_hour: peakHour,
      stats: statsResult.rows[0],
      filters: { from: dateFrom, to: dateTo },
    });
  } catch (error) {
    console.error("Error en /api/messages/peak-hours:", error);
    return Response.json({ error: "Error al obtener horarios pico" }, { status: 500 });
  }
}
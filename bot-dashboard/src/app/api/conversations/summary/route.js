/**
 * Devuelve estadísticas completas de todas las conversaciones: cuántas hay por estado, duración promedio, etc
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
      dateFilter += ` AND started_at >= $${params.length}`;
    }
    if (dateTo) {
      params.push(dateTo);
      dateFilter += ` AND started_at <= $${params.length}`;
    }

    // Resumen por estado
    const statusResult = await query(
      `SELECT
         status,
         COUNT(*) as total
       FROM conversations
       WHERE 1=1 ${dateFilter}
       GROUP BY status`,
      params
    );

    // Duración promedio
    const durationResult = await query(
      `SELECT
         ROUND(AVG(duration_seconds)) as avg_duration_seconds,
         ROUND(MIN(duration_seconds)) as min_duration_seconds,
         ROUND(MAX(duration_seconds)) as max_duration_seconds
       FROM conversations
       WHERE duration_seconds IS NOT NULL ${dateFilter}`,
      params
    );

    // Resumen por intent
    const intentResult = await query(
      `SELECT
         COALESCE(intent, 'sin_intent') as intent,
         COUNT(*) as total
       FROM conversations
       WHERE 1=1 ${dateFilter}
       GROUP BY intent
       ORDER BY total DESC`,
      params
    );

    // Resumen por outcome
    const outcomeResult = await query(
      `SELECT
         COALESCE(outcome, 'sin_outcome') as outcome,
         COUNT(*) as total
       FROM conversations
       WHERE 1=1 ${dateFilter}
       GROUP BY outcome
       ORDER BY total DESC`,
      params
    );

    // Conversaciones por día (últimos 30 días)
    const dailyResult = await query(
      `SELECT
         DATE(started_at) as date,
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'abandoned') as abandoned,
         COUNT(*) FILTER (WHERE status = 'active') as active
       FROM conversations
       WHERE started_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(started_at)
       ORDER BY date ASC`,
      []
    );

    const byStatus = {};
    for (const row of statusResult.rows) {
      byStatus[row.status] = parseInt(row.total);
    }

    return Response.json({
      by_status: byStatus,
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      duration: {
        avg_seconds: parseInt(durationResult.rows[0]?.avg_duration_seconds || 0),
        min_seconds: parseInt(durationResult.rows[0]?.min_duration_seconds || 0),
        max_seconds: parseInt(durationResult.rows[0]?.max_duration_seconds || 0),
      },
      by_intent: intentResult.rows,
      by_outcome: outcomeResult.rows,
      daily_last_30_days: dailyResult.rows,
      filters: { from: dateFrom, to: dateTo },
    });

  } catch (error) {
    console.error("Error en /api/conversations/summary:", error);
    return Response.json(
      { error: "Error al obtener resumen de conversaciones" },
      { status: 500 }
    );
  }
}
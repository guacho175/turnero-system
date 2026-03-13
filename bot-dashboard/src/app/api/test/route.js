import { query, testConnection } from "@/lib/db";

export async function GET() {
  try {
    // Test de conexión
    const connectionTest = await testConnection();
    
    if (!connectionTest.success) {
      return Response.json(
        { error: "No se pudo conectar a la DB", details: connectionTest.error },
        { status: 500 }
      );
    }

    // Métricas básicas
    const totalUsers = await query("SELECT COUNT(*) as count FROM users");
    const activeConversations = await query(
      "SELECT COUNT(*) as count FROM conversations WHERE status = 'active'"
    );
    const topServices = await query(`
      SELECT option_code, option_title, COUNT(*) as views 
      FROM menu_events 
      WHERE option_code LIKE 'SERV|%' 
      GROUP BY option_code, option_title 
      ORDER BY views DESC 
      LIMIT 5
    `);

    return Response.json({
      status: "ok",
      db_connected: true,
      server_time: connectionTest.time,
      metrics: {
        total_users: parseInt(totalUsers.rows[0]?.count || 0),
        active_conversations: parseInt(activeConversations.rows[0]?.count || 0),
        top_services: topServices.rows,
      },
    });
  } catch (error) {
    console.error("Error en /api/test:", error);
    return Response.json(
      { error: "Error interno", details: error.message },
      { status: 500 }
    );
  }
}
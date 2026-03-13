/**
 * Genera y descarga un archivo CSV con los datos del tipo solicitado
 * Máximo de 10.000 filas para usuarios/conversaciones y 50.000 para mensajes/eventos
 */
import { query } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * Convierte array de objetos a string CSV
 */
function toCSV(rows) {
  if (!rows || rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const csvHeaders = headers.join(",");

  const csvRows = rows.map((row) =>
    headers
      .map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        const str = String(val).replace(/"/g, '""');
        // Envolver en comillas si contiene coma, salto de línea o comillas
        return str.includes(",") || str.includes("\n") || str.includes('"')
          ? `"${str}"`
          : str;
      })
      .join(",")
  );

  return [csvHeaders, ...csvRows].join("\n");
}

export async function GET(request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "users"; // users | conversations | messages | menu_events
  const dateFrom = searchParams.get("from");
  const dateTo = searchParams.get("to");

  try {
    const params = [];
    let dateFilter = "";

    if (dateFrom) {
      params.push(dateFrom);
      dateFilter += ` AND created_at >= $${params.length}`;
    }
    if (dateTo) {
      params.push(dateTo);
      dateFilter += ` AND created_at <= $${params.length}`;
    }

    let rows = [];
    let filename = "";

    switch (type) {
      case "users":
        filename = "usuarios";
        const usersResult = await query(
          `SELECT 
             id,
             phone_hash,
             first_seen,
             last_seen,
             total_conversations,
             total_messages,
             total_menu_interactions,
             created_at
           FROM users
           WHERE 1=1 ${dateFilter}
           ORDER BY last_seen DESC
           LIMIT 10000`,
          params
        );
        rows = usersResult.rows;
        break;

      case "conversations":
        filename = "conversaciones";
        const convsResult = await query(
          `SELECT 
             c.id,
             c.user_id,
             u.phone_hash,
             c.started_at,
             c.ended_at,
             c.status,
             c.intent,
             c.outcome,
             c.total_messages,
             c.duration_seconds
           FROM conversations c
           LEFT JOIN users u ON c.user_id = u.id
           WHERE 1=1 ${dateFilter.replace(/created_at/g, "c.created_at")}
           ORDER BY c.started_at DESC
           LIMIT 10000`,
          params
        );
        rows = convsResult.rows;
        break;

      case "messages":
        filename = "mensajes";
        const msgsResult = await query(
          `SELECT 
             m.id,
             m.conversation_id,
             m.user_id,
             u.phone_hash,
             m.direction,
             m.message_type,
             m.content,
             m.wa_status,
             m.timestamp
           FROM messages m
           LEFT JOIN users u ON m.user_id = u.id
           WHERE 1=1 ${dateFilter.replace(/created_at/g, "m.created_at")}
           ORDER BY m.timestamp DESC
           LIMIT 50000`,
          params
        );
        rows = msgsResult.rows;
        break;

      case "menu_events":
        filename = "eventos_menu";
        const menuResult = await query(
          `SELECT 
             me.id,
             me.conversation_id,
             me.user_id,
             u.phone_hash,
             me.option_code,
             me.option_title,
             me.menu_level,
             me.menu_category,
             me.action_taken,
             me.timestamp
           FROM menu_events me
           LEFT JOIN users u ON me.user_id = u.id
           WHERE 1=1 ${dateFilter.replace(/created_at/g, "me.created_at")}
           ORDER BY me.timestamp DESC
           LIMIT 50000`,
          params
        );
        rows = menuResult.rows;
        break;

      default:
        return Response.json(
          { error: "Tipo inválido. Usa: users | conversations | messages | menu_events" },
          { status: 400 }
        );
    }

    const csv = toCSV(rows);
    const dateStr = new Date().toISOString().split("T")[0];

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}_${dateStr}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error en /api/export/csv:", error);
    return Response.json({ error: "Error al exportar datos" }, { status: 500 });
  }
}
import pg from "pg";

const { Pool } = pg;

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432", 10),
      database: process.env.DB_NAME || "whatsapp_bot_db",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err) => {
      console.error("Error inesperado en el pool de PostgreSQL", err);
    });
  }

  return pool;
}

/**
 * Ejecuta una query SQL
 */
export async function query(text, params = []) {
  const pool = getPool();
  const result = await pool.query(text, params);
  return result;
}

/**
 * Test de conexión
 */
export async function testConnection() {
  try {
    const result = await query("SELECT NOW() as current_time");
    return { success: true, time: result.rows[0]?.current_time };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export default { query, testConnection };
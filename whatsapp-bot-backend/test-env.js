// test-env.js
import dotenv from "dotenv";

console.log("\n=== DIAGNÓSTICO DE VARIABLES DE ENTORNO ===\n");

// 1. Cargar .env
const result = dotenv.config();

if (result.error) {
  console.error("ERROR al cargar .env:", result.error);
  process.exit(1);
} else {
  console.log("✅ Archivo .env cargado correctamente");
  console.log("📁 Ruta del .env:", result.parsed ? "encontrado" : "no encontrado");
}

console.log("\n--- Variables de PostgreSQL ---");
console.log("DB_HOST:", process.env.DB_HOST || "NO DEFINIDA");
console.log("DB_PORT:", process.env.DB_PORT || "NO DEFINIDA");
console.log("DB_NAME:", process.env.DB_NAME || "NO DEFINIDA");
console.log("DB_USER:", process.env.DB_USER || "NO DEFINIDA");
console.log("DB_PASSWORD:", process.env.DB_PASSWORD ? `✅ SET (longitud: ${process.env.DB_PASSWORD.length})` : "NO DEFINIDA");

console.log("\n--- Valor RAW de DB_PASSWORD ---");
console.log("Tipo:", typeof process.env.DB_PASSWORD);
console.log("Valor:", process.env.DB_PASSWORD);
console.log("Con comillas eliminadas:", process.env.DB_PASSWORD?.replace(/^["']|["']$/g, ''));

console.log("\n--- Otras variables (para verificar que .env funciona) ---");
console.log("PORT:", process.env.PORT || "NO DEFINIDA");
console.log("META_VERIFY_TOKEN:", process.env.META_VERIFY_TOKEN ? "✅ SET" : "NO DEFINIDA");

console.log("\n===========================================\n");

// scripts/test-db-connection.js
import dotenv from "dotenv";
import db from "../src/servicios/db.servicio.js";
import logger from "../src/servicios/logger.servicio.js";

dotenv.config();

async function testDatabaseConnection() {
  logger.info("=".repeat(50));
  logger.info("INICIO DE PRUEBAS DE BASE DE DATOS");
  logger.info("=".repeat(50));
  
  try {
    // Test 1: Verificar conexión
    logger.info("\n📡 Test 1: Verificando conexión a PostgreSQL...");
    const isConnected = await db.testConnection();
    
    if (!isConnected) {
      logger.error("No se pudo conectar a PostgreSQL. Verifica las credenciales en .env");
      process.exit(1);
    }
    
    logger.info("Conexión exitosa\n");
    
    // Test 2: Crear/actualizar usuario
    logger.info("Test 2: Creando usuario de prueba...");
    const testPhone = "5492604814785";
    const user = await db.upsertUser(testPhone);
    
    logger.info("Usuario creado/actualizado", {
      id: user.id,
      phone_hash: user.phone_hash.substring(0, 16) + "...",
      first_seen: user.first_seen
    });
    
    // Test 3: Obtener usuario por teléfono
    logger.info("\nTest 3: Buscando usuario por teléfono...");
    const foundUser = await db.getUserByPhone(testPhone);
    
    if (foundUser) {
      logger.info("Usuario encontrado", {
        id: foundUser.id,
        total_conversations: foundUser.total_conversations
      });
    } else {
      logger.error("Usuario no encontrado");
    }
    
    // Test 4: Crear conversación
    logger.info("\nTest 4: Creando conversación...");
    const conversation = await db.createConversation(user.id, "info_servicios");
    
    logger.info("Conversación creada", {
      id: conversation.id,
      status: conversation.status,
      intent: conversation.intent
    });
    
    // Test 5: Registrar mensaje
    logger.info("\nTest 5: Registrando mensaje...");
    const message = await db.insertMessage({
      conversationId: conversation.id,
      userId: user.id,
      direction: "incoming",
      messageType: "text",
      content: "hola",
      payload: { from: testPhone, text: "hola" }
    });
    
    logger.info("Mensaje registrado", {
      id: message.id,
      direction: message.direction,
      content: message.content
    });
    
    // Test 6: Registrar evento de menú
    logger.info("\nTest 6: Registrando evento de menú...");
    const menuEvent = await db.insertMenuEvent({
      conversationId: conversation.id,
      userId: user.id,
      optionCode: "MENU|SERVICIOS",
      optionTitle: "Servicios",
      optionDescription: "Ver tratamientos y detalles",
      menuLevel: 0,
      menuCategory: "navegacion",
      actionTaken: "view",
      rawPayload: { listId: "MENU|SERVICIOS", listTitle: "Servicios" }
    });
    
    logger.info("Evento de menú registrado", {
      id: menuEvent.id,
      option_code: menuEvent.option_code,
      menu_level: menuEvent.menu_level
    });
    
    // Test 7: Cerrar conversación
    logger.info("\nTest 7: Cerrando conversación...");
    const closedConv = await db.closeConversation(
      conversation.id, 
      "completed", 
      "solo_consulta"
    );
    
    logger.info("Conversación cerrada", {
      id: closedConv.id,
      status: closedConv.status,
      outcome: closedConv.outcome,
      duration_seconds: closedConv.duration_seconds
    });
    
    // Test 8: Verificar contadores actualizados
    logger.info("\nTest 8: Verificando contadores actualizados...");
    const updatedUser = await db.getUserByPhone(testPhone);
    
    logger.info("Contadores actualizados", {
      total_conversations: updatedUser.total_conversations,
      total_messages: updatedUser.total_messages,
      total_menu_interactions: updatedUser.total_menu_interactions
    });
    
    // Resumen final
    logger.info("\n" + "=".repeat(50));
    logger.info("TODAS LAS PRUEBAS PASARON EXITOSAMENTE");
    logger.info("=".repeat(50));
    
    logger.info("\n Datos de prueba creados:");
    logger.info(`   - Usuario ID: ${user.id}`);
    logger.info(`   - Conversación ID: ${conversation.id}`);
    logger.info(`   - Mensaje ID: ${message.id}`);
    logger.info(`   - Menu Event ID: ${menuEvent.id}`);
    
    logger.info("\n Puedes verificar en pgAdmin o ejecutar:");
    logger.info(`   psql -U postgres -d whatsapp_bot_db -c "SELECT * FROM users WHERE id='${user.id}'"`);
    
  } catch (error) {
    logger.error("\n ERROR EN PRUEBAS", {
      error: error?.message || error,
      stack: error?.stack
    });
    process.exit(1);
  } finally {
    // Cerrar pool de conexiones
    await db.closePool();
    logger.info("\n Pool de conexiones cerrado");
  }
}

// Ejecutar pruebas
testDatabaseConnection();

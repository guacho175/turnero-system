import logger from '../src/servicios/logger.servicio.js';

// Simular separación de sesión
logger.info('='.repeat(50));
logger.info('INICIO DE PRUEBA DE LOGGING');
logger.info('='.repeat(50));

logger.info('Test del sistema de logging');
logger.warn('Mensaje de advertencia de prueba');
logger.error('Mensaje de error de prueba', { extra: 'datos' });

console.log('Logs generados en carpeta logs/');
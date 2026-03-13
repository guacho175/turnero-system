import express from "express";
import dotenv from "dotenv";
import webhookRutas from "./rutas/webhook.rutas.js";
import metricsRutas from "./rutas/metrics.rutas.js";
import logger from "./servicios/logger.servicio.js";


dotenv.config();

const app = express();
app.use(express.json());

// Log de inicio para separar sesiones
logger.info('='.repeat(50));
logger.info('INICIO DEL SERVIDOR - WhatsApp Bot Backend');
logger.info('='.repeat(50));

app.get("/", (req, res) => res.json({ ok: true, servicio: "WhatsApp Bot Backend" }));
app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/", webhookRutas);
app.use("/", metricsRutas);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`Servidor escuchando en http://localhost:${PORT}`));

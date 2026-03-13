import { Router } from "express";
import { verificarWebhook, recibirWebhook } from "../controladores/webhook.controlador.js";

const router = Router();

router.get("/webhook", verificarWebhook);
router.post("/webhook", recibirWebhook);

export default router;

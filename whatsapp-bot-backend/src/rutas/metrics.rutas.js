import { Router } from "express";
import fs from "fs";
import { estimateConversations } from "../metrics/conversationEstimator.js";
import { WHATSAPP_LOG_PATH } from "../metrics/whatsappLogger.js";

const router = Router();

router.get("/metrics/whatsapp/costs", (req, res) => {
  const { start, end } = req.query;

  const prices = {
    marketing: 0,
    utility: 0,
    authentication: 0,
    service: 0,
    unknown: 0
  };

  const result = estimateConversations({
    startISO: start,
    endISO: end,
    prices
  });

  res.json(result);
});

router.get("/metrics/whatsapp/log", (req, res) => {
  const tail = Math.min(parseInt(req.query.tail || "50", 10), 500);

  if (!fs.existsSync(WHATSAPP_LOG_PATH)) {
    return res.json({ count: 0, lines: [] });
  }

  const lines = fs.readFileSync(WHATSAPP_LOG_PATH, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);

  res.json({
    count: lines.length,
    lines: lines.slice(-tail).map(l => {
      try { return JSON.parse(l); } catch { return { raw: l }; }
    })
  });
});

export default router; // 👈 ESTO ES LO CLAVE

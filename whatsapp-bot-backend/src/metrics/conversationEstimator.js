import fs from "fs";
import { WHATSAPP_LOG_PATH } from "./whatsappLogger.js";

/**
 * Estimación simple:
 * - Una conversación “se cobra” cuando es el primer evento en una ventana de 24h
 *   para un (to + category).
 * - Esto es una aproximación útil para budgeting.
 */
export function estimateConversations({ startISO, endISO, prices = {} }) {
  const start = startISO ? new Date(startISO).getTime() : -Infinity;
  const end = endISO ? new Date(endISO).getTime() : Infinity;

  if (!fs.existsSync(WHATSAPP_LOG_PATH)) {
    return { totals: { conversations: 0, cost: 0 }, byCategory: {} };
  }

  const lines = fs.readFileSync(WHATSAPP_LOG_PATH, "utf8").trim().split("\n").filter(Boolean);

  // key -> lastConversationStartTs
  const lastStartByKey = new Map();

  const byCategory = {}; // category -> { conversations, cost }
  let totalConversations = 0;
  let totalCost = 0;

  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }

    const ts = new Date(e.ts).getTime();
    if (ts < start || ts > end) continue;

    // Solo cuenta envíos exitosos salientes (según tu criterio)
    if (e.direction !== "out") continue;
    if (e.status !== "sent") continue;

    const category = e.category_for_cost || "unknown";
    const key = `${e.to}|${category}`;

    const lastStart = lastStartByKey.get(key);

    // si nunca existió o ya pasaron 24h (86,400,000 ms), nueva conversación
    if (!lastStart || (ts - lastStart) >= 86400000) {
      lastStartByKey.set(key, ts);

      totalConversations += 1;
      const price = Number(prices[category] ?? prices.unknown ?? 0);
      totalCost += price;

      if (!byCategory[category]) byCategory[category] = { conversations: 0, cost: 0 };
      byCategory[category].conversations += 1;
      byCategory[category].cost += price;
    }
  }

  return {
    totals: { conversations: totalConversations, cost: totalCost },
    byCategory,
    window: { startISO, endISO }
  };
}

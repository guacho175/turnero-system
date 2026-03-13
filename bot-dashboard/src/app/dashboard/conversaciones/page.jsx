/**
 * Pantalla conversaciones
 * Muestra métricas sobre las conversaciones
 */
"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/useApi";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from "recharts";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#16161f", border: "1px solid #252535",
      borderRadius: 8, padding: "10px 14px"
    }}>
      <div style={{ color: "#8888a8", fontSize: 11, fontFamily: "DM Mono", marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontSize: 13, fontFamily: "DM Mono" }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

export default function FunnelPage() {
  const { apiFetch } = useApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/menu/funnel")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">cargando funnel...</div>;
  if (error) return <div className="error-msg">{error}</div>;

  const funnel = data?.funnel || {};
  const funnelSteps = [
    { label: "Entraron al menú", value: parseInt(funnel.reached_menu || 0), color: "#7c6aff" },
    { label: "Llegaron a categoría", value: parseInt(funnel.reached_category || 0), color: "#a855f7" },
    { label: "Llegaron a servicio", value: parseInt(funnel.reached_service || 0), color: "#06b6d4" },
    { label: "Agendaron", value: parseInt(funnel.reached_booking || 0), color: "#10b981" },
  ];

  const maxVal = Math.max(...funnelSteps.map((s) => s.value), 1);

  const levelData = (data?.by_level || []).map((l) => ({
    nivel: `Nivel ${l.menu_level}`,
    interacciones: parseInt(l.total_interactions),
    usuarios: parseInt(l.unique_users),
  }));

  const actionData = (data?.by_action || []).map((a) => ({
    acción: a.action,
    total: parseInt(a.total),
    usuarios: parseInt(a.unique_users),
  }));

  const level0 = (data?.level_0_options || []).map((o) => ({
    opción: o.option_title?.substring(0, 18),
    selecciones: parseInt(o.selections),
  }));

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Funnel del Menú</div>
        <div className="page-sub">Análisis de navegación y conversión</div>
      </div>

      {/* Funnel visual */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">Embudo de conversión</div>
        {parseInt(funnel.reached_menu || 0) > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
            {funnelSteps.map((step, i) => {
              const pct = Math.round((step.value / maxVal) * 100);
              const convPct = i > 0 && funnelSteps[i - 1].value > 0
                ? Math.round((step.value / funnelSteps[i - 1].value) * 100)
                : null;
              return (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "#8888a8" }}>{step.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {convPct !== null && (
                        <span style={{ fontSize: 11, color: "#55556a", fontFamily: "DM Mono" }}>
                          ↓ {convPct}% del paso anterior
                        </span>
                      )}
                      <span style={{ fontSize: 18, fontWeight: 600, color: step.color, fontFamily: "DM Mono" }}>
                        {step.value}
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 8, background: "#1e1e2e", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${pct}%`,
                      background: step.color, borderRadius: 4,
                      transition: "width 0.5s ease"
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="loading" style={{ height: 120 }}>
            sin datos de navegación — el bot aún no registró eventos de menú
          </div>
        )}
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Interacciones por nivel */}
        <div className="card">
          <div className="card-title">Interacciones por nivel</div>
          {levelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={levelData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="nivel" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="interacciones" fill="#7c6aff" radius={[3, 3, 0, 0]} name="Interacciones" />
                <Bar dataKey="usuarios" fill="#06b6d4" radius={[3, 3, 0, 0]} name="Usuarios únicos" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="loading" style={{ height: 220 }}>sin datos</div>
          )}
        </div>

        {/* Acciones tomadas */}
        <div className="card">
          <div className="card-title">Acciones tomadas</div>
          {actionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={actionData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="acción" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" fill="#a855f7" radius={[3, 3, 0, 0]} name="Total" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="loading" style={{ height: 220 }}>sin datos</div>
          )}
        </div>
      </div>

      {/* Opciones menú principal */}
      {level0.length > 0 && (
        <div className="card">
          <div className="card-title">Opciones del menú principal</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={level0} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="opción" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="selecciones" fill="#10b981" radius={[3, 3, 0, 0]} name="Selecciones" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
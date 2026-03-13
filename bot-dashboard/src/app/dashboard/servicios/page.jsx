/**
 * Pantalla de top servicios
 * Muestra una tabla con el ranking completo de servicios
 */
"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/useApi";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
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

const COLORS = ["#7c6aff", "#a855f7", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

export default function ServiciosPage() {
  const { apiFetch } = useApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/services/top?limit=10")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">cargando servicios...</div>;
  if (error) return <div className="error-msg">{error}</div>;

  const services = (data?.top_services || []).map((s) => ({
    ...s,
    nombre: s.option_title?.substring(0, 22),
    vistas: parseInt(s.total_views),
    usuarios: parseInt(s.unique_users),
    conversaciones: parseInt(s.unique_conversations),
  }));

  const categories = (data?.top_categories || []).map((c) => ({
    ...c,
    nombre: c.option_title?.substring(0, 22),
    vistas: parseInt(c.total_views),
    usuarios: parseInt(c.unique_users),
  }));

  const conversion = (data?.conversion_by_service || []).map((c) => ({
    nombre: c.option_title?.substring(0, 22),
    vistas: parseInt(c.viewed),
    agendaron: parseInt(c.converted),
    tasa: c.viewed > 0 ? Math.round((c.converted / c.viewed) * 100) : 0,
  }));

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Top Servicios</div>
        <div className="page-sub">Servicios más consultados por los clientes</div>
      </div>

      {/* Ranking tabla */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">Ranking de servicios</div>
        {services.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e1e2e" }}>
                {["#", "Servicio", "Vistas", "Usuarios únicos", "Conversaciones"].map((h) => (
                  <th key={h} style={{
                    padding: "8px 12px", textAlign: "left",
                    fontSize: 11, color: "#55556a", fontFamily: "DM Mono",
                    fontWeight: 500, letterSpacing: "0.5px"
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map((s, i) => (
                <tr key={s.option_code} style={{
                  borderBottom: "1px solid #1e1e2e",
                  transition: "background 0.1s"
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#16161f"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "12px", fontSize: 12, color: "#55556a", fontFamily: "DM Mono" }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontSize: 13, color: "#e8e8f0" }}>{s.option_title}</div>
                    <div style={{ fontSize: 11, color: "#55556a", fontFamily: "DM Mono", marginTop: 2 }}>
                      {s.option_code}
                    </div>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span style={{
                      fontSize: 16, fontWeight: 600, color: COLORS[i % COLORS.length],
                      fontFamily: "DM Mono"
                    }}>{s.vistas}</span>
                  </td>
                  <td style={{ padding: "12px", fontSize: 13, color: "#8888a8", fontFamily: "DM Mono" }}>
                    {s.usuarios}
                  </td>
                  <td style={{ padding: "12px", fontSize: 13, color: "#8888a8", fontFamily: "DM Mono" }}>
                    {s.conversaciones}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="loading" style={{ height: 120 }}>
            sin datos de servicios — el bot aún no registró eventos de menú
          </div>
        )}
      </div>

      <div className="grid-2">
        {/* Gráfico barras servicios */}
        <div className="card">
          <div className="card-title">Vistas por servicio</div>
          {services.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={services} layout="vertical" barSize={10}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={110} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="vistas" radius={[0, 3, 3, 0]} name="Vistas">
                  {services.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="loading" style={{ height: 260 }}>sin datos</div>
          )}
        </div>

        {/* Categorías */}
        <div className="card">
          <div className="card-title">Top categorías</div>
          {categories.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categories} layout="vertical" barSize={10}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={110} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="vistas" fill="#06b6d4" radius={[0, 3, 3, 0]} name="Vistas" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="loading" style={{ height: 260 }}>sin datos de categorías</div>
          )}
        </div>
      </div>

      {/* Conversión */}
      {conversion.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-title">Tasa de conversión por servicio</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e1e2e" }}>
                {["Servicio", "Vistas", "Agendaron", "Tasa"].map((h) => (
                  <th key={h} style={{
                    padding: "8px 12px", textAlign: "left",
                    fontSize: 11, color: "#55556a", fontFamily: "DM Mono", fontWeight: 500
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conversion.map((c, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #1e1e2e" }}>
                  <td style={{ padding: "12px", fontSize: 13, color: "#e8e8f0" }}>{c.nombre}</td>
                  <td style={{ padding: "12px", fontSize: 13, color: "#8888a8", fontFamily: "DM Mono" }}>{c.vistas}</td>
                  <td style={{ padding: "12px", fontSize: 13, color: "#10b981", fontFamily: "DM Mono" }}>{c.agendaron}</td>
                  <td style={{ padding: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        height: 4, width: 80, background: "#1e1e2e", borderRadius: 2, overflow: "hidden"
                      }}>
                        <div style={{
                          height: "100%", width: `${c.tasa}%`,
                          background: c.tasa > 30 ? "#10b981" : c.tasa > 10 ? "#f59e0b" : "#7c6aff",
                          borderRadius: 2
                        }} />
                      </div>
                      <span style={{ fontSize: 12, color: "#8888a8", fontFamily: "DM Mono" }}>{c.tasa}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
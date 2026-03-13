/**
 * Pantalla principal del dashboard
 * Carga los endpoints principales
 * Muestra cards con las métricas
 */
"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/useApi";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

const COLORS = ["#7c6aff", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

function MetricCard({ label, value, sub, accent }) {
  return (
    <div className="card">
      <div className="card-title">{label}</div>
      <div className="metric-value" style={accent ? { color: accent } : {}}>
        {value ?? "—"}
      </div>
      {sub && <div className="metric-label">{sub}</div>}
    </div>
  );
}

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

export default function DashboardPage() {
  const { apiFetch } = useApi();
  const [users, setUsers] = useState(null);
  const [convs, setConvs] = useState(null);
  const [services, setServices] = useState(null);
  const [hours, setHours] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [u, c, s, h] = await Promise.all([
          apiFetch("/api/users/summary"),
          apiFetch("/api/conversations/summary"),
          apiFetch("/api/services/top"),
          apiFetch("/api/messages/peak-hours"),
        ]);
        setUsers(u);
        setConvs(c);
        setServices(s);
        setHours(h);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="loading">cargando datos...</div>;
  if (error) return <div className="error-msg">{error}</div>;

  // Preparar datos para gráficos
  const dailyData = (convs?.daily_last_30_days || []).map((d) => ({
    fecha: new Date(d.date).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }),
    total: parseInt(d.total),
    completadas: parseInt(d.completed),
    abandonadas: parseInt(d.abandoned),
  }));

  const pieData = Object.entries(convs?.by_status || {}).map(([name, value]) => ({
    name: name === "active" ? "Activas" : name === "completed" ? "Completadas" : "Abandonadas",
    value,
  }));

  const hoursData = (hours?.by_hour || []).map((h) => ({
    hora: `${h.hour}h`,
    mensajes: parseInt(h.total_messages),
    entrantes: parseInt(h.incoming),
  }));

  const servicesData = (services?.top_services || []).slice(0, 6).map((s) => ({
    nombre: s.option_title?.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, "").trim().substring(0, 18),
    vistas: parseInt(s.total_views),
    usuarios: parseInt(s.unique_users),
  }));

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-sub">Métricas generales · Dr. Beauty Mendoza</div>
      </div>

      {/* Métricas principales */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <MetricCard
          label="Usuarios totales"
          value={users?.total_users}
          sub="registrados"
        />
        <MetricCard
          label="Usuarios activos"
          value={users?.active_users}
          sub="con sesión activa"
          accent="#7c6aff"
        />
        <MetricCard
          label="Recurrentes"
          value={users?.recurrent_users}
          sub="más de 1 conversación"
          accent="#06b6d4"
        />
        <MetricCard
          label="Total mensajes"
          value={hours?.stats?.total_messages}
          sub={`↑ ${hours?.stats?.total_incoming} entrantes`}
          accent="#10b981"
        />
      </div>

      {/* Gráficos fila 1 */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Línea: conversaciones por día */}
        <div className="card">
          <div className="card-title">Conversaciones — últimos 30 días</div>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="total" stroke="#7c6aff" strokeWidth={2} dot={false} name="Total" />
                <Line type="monotone" dataKey="completadas" stroke="#10b981" strokeWidth={1.5} dot={false} name="Completadas" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="loading" style={{ height: 220 }}>sin datos suficientes</div>
          )}
        </div>

        {/* Torta: estados */}
        <div className="card">
          <div className="card-title">Estados de conversaciones</div>
          {pieData.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <ResponsiveContainer width="60%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pieData.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: COLORS[i % COLORS.length], flexShrink: 0
                    }} />
                    <span style={{ fontSize: 12, color: "#8888a8" }}>{d.name}</span>
                    <span style={{ fontSize: 13, color: "#e8e8f0", marginLeft: "auto", fontFamily: "DM Mono" }}>
                      {d.value}
                    </span>
                  </div>
                ))}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1e1e2e" }}>
                  <span style={{ fontSize: 11, color: "#55556a", fontFamily: "DM Mono" }}>
                    total: {convs?.total}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="loading" style={{ height: 220 }}>sin datos</div>
          )}
        </div>
      </div>

      {/* Gráficos fila 2 */}
      <div className="grid-2">
        {/* Barras: horarios pico */}
        <div className="card">
          <div className="card-title">Horarios pico de mensajes</div>
          {hoursData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hoursData} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hora" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="mensajes" fill="#7c6aff" radius={[3, 3, 0, 0]} name="Mensajes" />
                <Bar dataKey="entrantes" fill="#06b6d4" radius={[3, 3, 0, 0]} name="Entrantes" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="loading" style={{ height: 220 }}>sin datos</div>
          )}
          {hours?.peak_hour && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#55556a", fontFamily: "DM Mono" }}>
              pico: {hours.peak_hour.hour}hs · {hours.peak_hour.total_messages} mensajes
            </div>
          )}
        </div>

        {/* Barras: top servicios */}
        <div className="card">
          <div className="card-title">Top servicios consultados</div>
          {servicesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={servicesData} layout="vertical" barSize={12}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="vistas" fill="#a855f7" radius={[0, 3, 3, 0]} name="Vistas" />
                <Bar dataKey="usuarios" fill="#10b981" radius={[0, 3, 3, 0]} name="Usuarios únicos" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="loading" style={{ height: 220 }}>sin datos de servicios aún</div>
          )}
        </div>
      </div>
    </div>
  );
}
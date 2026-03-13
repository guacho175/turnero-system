/**
 * Pantalla de horarios pico
 * Muestra métricas sobre los usuarios en las horas pico
 */
"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/useApi";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
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

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function HorariosPage() {
  const { apiFetch } = useApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/messages/peak-hours")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">cargando horarios...</div>;
  if (error) return <div className="error-msg">{error}</div>;

  const hoursData = (data?.by_hour || []).map((h) => ({
    hora: `${h.hour}h`,
    mensajes: parseInt(h.total_messages),
    entrantes: parseInt(h.incoming),
    salientes: parseInt(h.outgoing),
    usuarios: parseInt(h.unique_users),
  }));

  const dayData = (data?.by_day_of_week || []).map((d) => ({
    día: DAYS[d.day_of_week] || d.day_name?.trim(),
    mensajes: parseInt(d.total_messages),
    usuarios: parseInt(d.unique_users),
  }));

  const dailyData = (data?.by_day_last_30 || []).map((d) => ({
    fecha: new Date(d.date).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }),
    total: parseInt(d.total_messages),
    entrantes: parseInt(d.incoming),
  }));

  const stats = data?.stats || {};
  const peak = data?.peak_hour || {};

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Horarios Pico</div>
        <div className="page-sub">Análisis de volumen de mensajes por tiempo</div>
      </div>

      {/* Métricas */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">Total mensajes</div>
          <div className="metric-value">{stats.total_messages ?? "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">Entrantes</div>
          <div className="metric-value" style={{ color: "#7c6aff" }}>{stats.total_incoming ?? "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">Salientes</div>
          <div className="metric-value" style={{ color: "#06b6d4" }}>{stats.total_outgoing ?? "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">Hora pico</div>
          <div className="metric-value" style={{ color: "#f59e0b" }}>
            {peak.hour !== undefined ? `${peak.hour}hs` : "—"}
          </div>
          <div className="metric-label">{peak.total_messages} mensajes</div>
        </div>
      </div>

      {/* Barras por hora */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">Mensajes por hora del día</div>
        {hoursData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hoursData} barSize={16}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="hora" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="mensajes" fill="#7c6aff" radius={[3, 3, 0, 0]} name="Total" />
              <Bar dataKey="entrantes" fill="#06b6d4" radius={[3, 3, 0, 0]} name="Entrantes" />
              <Bar dataKey="salientes" fill="#10b981" radius={[3, 3, 0, 0]} name="Salientes" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="loading" style={{ height: 240 }}>sin datos</div>
        )}
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Por día de semana */}
        <div className="card">
          <div className="card-title">Mensajes por día de la semana</div>
          {dayData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dayData} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="día" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="mensajes" fill="#a855f7" radius={[3, 3, 0, 0]} name="Mensajes" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="loading" style={{ height: 220 }}>sin datos</div>
          )}
        </div>

        {/* Línea últimos 30 días */}
        <div className="card">
          <div className="card-title">Volumen últimos 30 días</div>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="fecha" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="total" stroke="#7c6aff" strokeWidth={2} dot={false} name="Total" />
                <Line type="monotone" dataKey="entrantes" stroke="#06b6d4" strokeWidth={1.5} dot={false} name="Entrantes" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="loading" style={{ height: 220 }}>sin datos</div>
          )}
        </div>
      </div>
    </div>
  );
}
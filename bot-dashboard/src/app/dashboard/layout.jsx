/**
 * "Envuelve" las pantallas del dashboard
 * Dibuja el sidebar izquiero con la navegación, boton de logout y área de contenido principal
 */
"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "⬡" },
  { href: "/dashboard/servicios", label: "Top Servicios", icon: "◈" },
  { href: "/dashboard/conversaciones", label: "Resumen Conversaciones", icon: "◎" },
  { href: "/dashboard/horarios", label: "Horarios Pico", icon: "◉" },
];

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();

  function handleLogout() {
    localStorage.removeItem("token");
    router.push("/login");
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">✦</span>
          <div>
            <div className="brand-name">Dr. Beauty</div>
            <div className="brand-sub">Analytics</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${pathname === item.href ? "active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {pathname === item.href && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>

        <button className="logout-btn" onClick={handleLogout}>
          <span>⊗</span> Cerrar sesión
        </button>
      </aside>

      <main className="main-content">
        {children}
      </main>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #0a0a0f;
          --surface: #111118;
          --surface2: #16161f;
          --border: #1e1e2e;
          --border2: #252535;
          --text: #e8e8f0;
          --text2: #8888a8;
          --text3: #55556a;
          --accent: #7c6aff;
          --accent2: #a855f7;
          --accent3: #06b6d4;
          --green: #10b981;
          --amber: #f59e0b;
          --red: #ef4444;
          --font: 'DM Sans', sans-serif;
          --mono: 'DM Mono', monospace;
        }

        html, body { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font); }

        .dashboard-shell {
          display: flex;
          min-height: 100vh;
        }

        /* ── SIDEBAR ── */
        .sidebar {
          width: 220px;
          min-height: 100vh;
          background: var(--surface);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          padding: 28px 16px;
          position: fixed;
          top: 0; left: 0;
          z-index: 100;
        }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 8px 32px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 24px;
        }

        .brand-icon {
          font-size: 24px;
          color: var(--accent);
          line-height: 1;
        }

        .brand-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--text);
          letter-spacing: -0.3px;
        }

        .brand-sub {
          font-size: 11px;
          color: var(--text3);
          letter-spacing: 0.5px;
          text-transform: uppercase;
          font-family: var(--mono);
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          text-decoration: none;
          color: var(--text2);
          font-size: 13.5px;
          font-weight: 400;
          transition: all 0.15s ease;
          position: relative;
        }

        .nav-item:hover {
          background: var(--surface2);
          color: var(--text);
        }

        .nav-item.active {
          background: rgba(124, 106, 255, 0.12);
          color: var(--accent);
          font-weight: 500;
        }

        .nav-icon {
          font-size: 14px;
          width: 18px;
          text-align: center;
          flex-shrink: 0;
        }

        .nav-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--accent);
          margin-left: auto;
        }

        .logout-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: none;
          border: 1px solid var(--border2);
          border-radius: 8px;
          color: var(--text3);
          font-size: 13px;
          font-family: var(--font);
          cursor: pointer;
          transition: all 0.15s;
          margin-top: 12px;
        }

        .logout-btn:hover {
          border-color: var(--red);
          color: var(--red);
        }

        /* ── MAIN ── */
        .main-content {
          margin-left: 220px;
          flex: 1;
          padding: 40px;
          min-height: 100vh;
        }

        /* ── SHARED COMPONENTS ── */
        .page-header {
          margin-bottom: 32px;
        }

        .page-title {
          font-size: 22px;
          font-weight: 600;
          color: var(--text);
          letter-spacing: -0.5px;
        }

        .page-sub {
          font-size: 13px;
          color: var(--text3);
          margin-top: 4px;
          font-family: var(--mono);
        }

        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 24px;
        }

        .card-title {
          font-size: 12px;
          font-weight: 500;
          color: var(--text3);
          letter-spacing: 0.8px;
          text-transform: uppercase;
          font-family: var(--mono);
          margin-bottom: 16px;
        }

        .metric-value {
          font-size: 36px;
          font-weight: 600;
          color: var(--text);
          letter-spacing: -1px;
          line-height: 1;
        }

        .metric-label {
          font-size: 12px;
          color: var(--text3);
          margin-top: 6px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-family: var(--mono);
          font-weight: 500;
        }

        .badge-green { background: rgba(16,185,129,0.12); color: var(--green); }
        .badge-amber { background: rgba(245,158,11,0.12); color: var(--amber); }
        .badge-red { background: rgba(239,68,68,0.12); color: var(--red); }
        .badge-purple { background: rgba(124,106,255,0.12); color: var(--accent); }

        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
        .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }

        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: var(--text3);
          font-family: var(--mono);
          font-size: 13px;
        }

        .error-msg {
          color: var(--red);
          font-family: var(--mono);
          font-size: 12px;
          padding: 12px;
          background: rgba(239,68,68,0.08);
          border-radius: 6px;
          border: 1px solid rgba(239,68,68,0.2);
        }

        /* recharts overrides */
        .recharts-cartesian-grid-horizontal line,
        .recharts-cartesian-grid-vertical line {
          stroke: var(--border) !important;
        }
        .recharts-text { fill: var(--text3) !important; font-size: 11px !important; font-family: var(--mono) !important; }
        .recharts-tooltip-wrapper .recharts-default-tooltip {
          background: var(--surface2) !important;
          border: 1px solid var(--border2) !important;
          border-radius: 8px !important;
        }
        .recharts-default-tooltip .recharts-tooltip-label {
          color: var(--text2) !important;
          font-family: var(--mono) !important;
          font-size: 11px !important;
        }
      `}</style>
    </div>
  );
}
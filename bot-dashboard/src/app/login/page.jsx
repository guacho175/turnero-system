/**
 * Pantalla de login
 * Muestra el formulario de usuario y contraseña
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al iniciar sesión");
        return;
      }

      localStorage.setItem("token", data.token);
      router.push("/dashboard");
    } catch (err) {
      setError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-icon">✦</span>
          <h1>Dr. Beauty</h1>
          <p>Panel de Analytics</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="field">
            <label>Usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

        .login-page {
          min-height: 100vh;
          background: #0a0a0f;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'DM Sans', sans-serif;
        }

        .login-card {
          width: 360px;
          background: #111118;
          border: 1px solid #1e1e2e;
          border-radius: 16px;
          padding: 40px;
        }

        .login-brand {
          text-align: center;
          margin-bottom: 36px;
        }

        .login-icon {
          font-size: 28px;
          color: #7c6aff;
          display: block;
          margin-bottom: 12px;
        }

        .login-brand h1 {
          font-size: 20px;
          font-weight: 600;
          color: #e8e8f0;
          letter-spacing: -0.4px;
        }

        .login-brand p {
          font-size: 12px;
          color: #55556a;
          margin-top: 4px;
          font-family: 'DM Mono', monospace;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field label {
          font-size: 12px;
          font-weight: 500;
          color: #8888a8;
          letter-spacing: 0.3px;
        }

        .field input {
          background: #16161f;
          border: 1px solid #1e1e2e;
          border-radius: 8px;
          padding: 11px 14px;
          color: #e8e8f0;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.15s;
        }

        .field input:focus {
          border-color: #7c6aff;
        }

        .field input::placeholder {
          color: #55556a;
        }

        .login-error {
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          border-radius: 6px;
          padding: 10px 12px;
          color: #ef4444;
          font-size: 12px;
          font-family: 'DM Mono', monospace;
        }

        .login-btn {
          background: #7c6aff;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 12px;
          font-size: 14px;
          font-weight: 500;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: all 0.15s;
          margin-top: 4px;
        }

        .login-btn:hover:not(:disabled) {
          background: #6b5ae8;
        }

        .login-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha no login");
      router.replace("/equipe");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-card glass" onSubmit={submit}>
      <p className="eyebrow">ACESSO DA EQUIPE</p>
      <h1>Central de cancelamentos</h1>
      <p className="lead compact">Acesso exclusivo de Gerrard e Ruy. Não depende de e-mail, SMTP ou código de confirmação.</p>
      {error && <div className="error-box" role="alert">{error}</div>}
      <label>Usuário<input type="text" autoComplete="username" value={username} onChange={e => setUsername(e.target.value.replace(/[^A-Za-z0-9._-]/g, ""))} placeholder="gerrard ou ruy" required /></label>
      <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} minLength={14} required /></label>
      <button className="btn primary" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
      <a className="back-link inline-back" href="/">← Voltar</a>
    </form>
  );
}

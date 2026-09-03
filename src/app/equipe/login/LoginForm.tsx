"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
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
        body: JSON.stringify({ email, password, totp })
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
      <p className="eyebrow">ÁREA RESTRITA</p>
      <h1>Central da equipe</h1>
      <p className="lead compact">Sessão administrativa de curta duração. Em produção, ative TOTP e mantenha a senha fora do repositório.</p>
      {error && <div className="error-box" role="alert">{error}</div>}
      <label>E-mail<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} minLength={14} required /></label>
      <label>Código autenticador (TOTP)<input inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 dígitos quando habilitado" /></label>
      <button className="btn primary" disabled={loading}>{loading ? "Validando..." : "Entrar com segurança"}</button>
      <a className="back-link inline-back" href="/">← Voltar</a>
    </form>
  );
}

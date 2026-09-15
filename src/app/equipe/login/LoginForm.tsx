"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
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
        body: JSON.stringify({ username, password, code: code || undefined })
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 428 && data.mfaRequired) {
        setMfaRequired(true);
        setError("Digite o código de 6 dígitos do autenticador para concluir o acesso.");
        return;
      }
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
      <p className="eyebrow">ACESSO RESTRITO</p>
      <h1>Central de cancelamentos</h1>
      <p className="lead compact">Acesso individual e auditável. O proprietário controla quem pode entrar.</p>
      {error && <div className="error-box" role="alert">{error}</div>}
      <label>Usuário<input type="text" autoComplete="username" value={username} onChange={e => setUsername(e.target.value.replace(/[^A-Za-z0-9._-]/g, ""))} required /></label>
      <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} minLength={14} required /></label>
      {mfaRequired && <label>Código do autenticador<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required /></label>}
      <button className="btn primary" disabled={loading || (mfaRequired && code.length !== 6)}>{loading ? "Validando..." : mfaRequired ? "Confirmar código" : "Entrar"}</button>
      <a className="back-link inline-back" href="/">← Voltar</a>
    </form>
  );
}

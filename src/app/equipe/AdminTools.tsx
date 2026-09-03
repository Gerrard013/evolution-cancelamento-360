"use client";

import { useEffect, useState } from "react";

type SyncedContract = { id: string; unit: string; planName: string; status: string; endDate?: string | null };

export default function AdminTools() {
  const [memberId, setMemberId] = useState("");
  const [contracts, setContracts] = useState<SyncedContract[]>([]);
  const [accessId, setAccessId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<{ hitCount: number; softLimit: number; hardLimit: number } | null>(null);

  useEffect(() => {
    fetch("/api/admin/evo/usage", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(setUsage).catch(() => null);
  }, []);

  async function sync() {
    setMessage(""); setAccessId(""); setLoading(true);
    try {
      const r = await fetch("/api/admin/evo/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha na sincronização");
      setContracts(data.contracts || []);
      setMessage(`Sincronizado: ${data.customer.displayName}. Selecione o contrato para gerar o ID temporário.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(false); }
  }

  async function issue(contractId: string) {
    setMessage(""); setAccessId(""); setLoading(true);
    try {
      const r = await fetch("/api/admin/access-grants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contractId, validDays: 7 }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao gerar ID");
      setAccessId(data.accessId);
      setMessage("ID gerado. Entregue ao cliente correto por canal confiável. O código não fica armazenado em texto puro.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(false); }
  }

  async function logout() {
    await fetch("/api/auth/admin/logout", { method: "POST" });
    location.href = "/equipe/login";
  }

  return (
    <section className="admin-tools glass">
      <div className="section-title"><div><p className="eyebrow">OPERAÇÃO SEGURA</p><h2>Sincronizar pelo ID EVO</h2></div><button onClick={logout}>Sair</button></div>
      <div className="tool-row">
        <input value={memberId} onChange={e => setMemberId(e.target.value)} placeholder="ID / matrícula no EVO" autoComplete="off" />
        <button className="btn primary" disabled={loading || !memberId.trim()} onClick={sync}>{loading ? "Processando..." : "Sincronizar"}</button>
      </div>
      {usage && <div className="usage-line"><span>Consumo API no mês</span><b>{usage.hitCount} / {usage.hardLimit}</b><small>Alerta interno em {usage.softLimit}</small></div>}
      {contracts.length > 0 && <div className="synced-contracts">{contracts.map(c => <div key={c.id}><span><b>{c.planName}</b><small>{c.unit} • {c.status}</small></span><button onClick={() => issue(c.id)} disabled={loading}>Gerar ID de acesso</button></div>)}</div>}
      {accessId && <div className="access-output"><span>ID temporário</span><b>{accessId}</b></div>}
      {message && <div className="info-box">{message}</div>}
    </section>
  );
}

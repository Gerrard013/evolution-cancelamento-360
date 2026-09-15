"use client";

import { useState } from "react";

type SyncedContract = {
  id:string; unit:string; planName:string; planType?:string; status:string; startDate?:string; endDate?:string|null;
  amountPaid?:number; recurring?:boolean; syncedAt?:string|null; metadata?:unknown;
};

function money(value?:number){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));}
function date(value?:string|null){if(!value)return "—";const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("pt-BR");}

export default function AdminTools() {
  const [memberId, setMemberId] = useState("");
  const [customerName,setCustomerName]=useState("");
  const [contracts, setContracts] = useState<SyncedContract[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function sync() {
    setMessage(""); setContracts([]); setLoading(true);
    try {
      const r = await fetch("/api/admin/evo/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId }) });
      const data = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(data.code ? `${data.error} (${data.code})` : data.error || "Não foi possível localizar o aluno");
      setCustomerName(data.customer.displayName);
      setContracts(data.contracts || []);
      setMessage("Consulta concluída diretamente no EVO/W12. Esta ferramenta é somente de conferência; ela não cria identidade nem inicia cancelamento.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha na consulta EVO"); }
    finally { setLoading(false); }
  }

  async function logout() { await fetch("/api/auth/admin/logout", { method: "POST" }); location.href = "/equipe/login"; }

  return (
    <section className="admin-tools glass operational-card">
      <div className="section-title"><div><p className="eyebrow">CONFERÊNCIA EVO / W12</p><h2>Consultar cadastro oficial</h2><p className="section-help">Ferramenta administrativa somente para conferência. O cliente sempre inicia o cancelamento pelo canal oficial usando CPF + mesmo e-mail do EVO + código de confirmação.</p></div><button onClick={logout}>Sair</button></div>
      <div className="tool-row"><input value={memberId} onChange={e=>setMemberId(e.target.value.replace(/[^0-9A-Za-z._-]/g,""))} placeholder="ID / matrícula EVO" autoComplete="off"/><button className="btn primary" disabled={loading||!memberId.trim()} onClick={sync}>{loading?"Consultando EVO...":"Consultar no EVO"}</button></div>

      {customerName&&contracts.length>0&&<div className="customer-found"><span>Cadastro oficial localizado</span><h3>{customerName}</h3><small>ID EVO consultado: {memberId}</small></div>}
      {contracts.length>0&&<div className="synced-contracts clean-contracts">{contracts.map(c=><div key={c.id} className="evo-contract-card"><div className="evo-contract-main"><span className="refund-status paid">{c.status==="ACTIVE"?"ATIVO":c.status}</span><h3>{c.planName}</h3><p>{c.unit} • {c.planType||"Plano"} {c.recurring?"• Recorrente":""}</p></div><div className="evo-contract-data"><span><small>Início</small><b>{date(c.startDate)}</b></span><span><small>Fim</small><b>{date(c.endDate)}</b></span><span><small>Valor registrado</small><b>{money(c.amountPaid)}</b></span><span><small>Última sincronização</small><b>{c.syncedAt?date(c.syncedAt):"Agora"}</b></span></div></div>)}</div>}
      {message&&<div className="info-box">{message}</div>}
    </section>
  );
}

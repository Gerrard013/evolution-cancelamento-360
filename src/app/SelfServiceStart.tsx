"use client";

import { useState } from "react";

type ContractOption = { id:string; unit:string; planName:string; startDate:string; recurring:boolean; planType:string };
type ProtocolResult = { protocol:string; status:string; statusLabel:string; createdAt:string; unit:string; planName:string; cancellationFee:number; cancellationFeePaid:boolean; estimatedRefund:number };

export default function SelfServiceStart() {
  const [mode,setMode]=useState<"new"|"status">("new");
  const [memberId,setMemberId]=useState("");
  const [birthDate,setBirthDate]=useState("");
  const [name,setName]=useState("");
  const [contracts,setContracts]=useState<ContractOption[]>([]);
  const [protocol,setProtocol]=useState("");
  const [protocolResult,setProtocolResult]=useState<ProtocolResult|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const money = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});

  function switchMode(next:"new"|"status") {
    setMode(next); setError(""); setProtocolResult(null); setContracts([]); setName("");
  }

  async function start(e:React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const r=await fetch("/api/public/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberId,birthDate})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||"Não foi possível confirmar seus dados.");
      setName(d.customerName||""); setContracts(d.contracts||[]);
      if((d.contracts||[]).length===1) await choose(d.contracts[0].id);
    } catch(e) { setError(e instanceof Error?e.message:"Não foi possível iniciar o cancelamento."); }
    finally { setLoading(false); }
  }

  async function choose(contractId:string) {
    setError(""); setLoading(true);
    try {
      const r=await fetch("/api/public/select-contract",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contractId})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||"Não foi possível abrir o contrato.");
      location.href="/cliente";
    } catch(e) { setError(e instanceof Error?e.message:"Não foi possível abrir o contrato."); setLoading(false); }
  }

  async function checkProtocol(e:React.FormEvent) {
    e.preventDefault(); setError(""); setProtocolResult(null); setLoading(true);
    try {
      const r=await fetch("/api/public/protocol-status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({protocol:protocol.replace(/^#/,'').trim(),memberId,birthDate})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||"Não foi possível consultar o protocolo.");
      setProtocolResult(d);
    } catch(e) { setError(e instanceof Error?e.message:"Não foi possível consultar o protocolo."); }
    finally { setLoading(false); }
  }

  return <div className="self-service-card">
    <div className="service-tabs" role="tablist" aria-label="Opções do portal">
      <button type="button" className={mode==="new"?"active":""} onClick={()=>switchMode("new")}>Solicitar cancelamento</button>
      <button type="button" className={mode==="status"?"active":""} onClick={()=>switchMode("status")}>Consultar protocolo</button>
    </div>

    {mode==="new" ? (!contracts.length ? <form onSubmit={start}>
      <div className="self-service-title"><span>CANAL OFICIAL</span><h2>Solicite seu cancelamento</h2><p>Informe sua matrícula EVO e data de nascimento para localizar seus contratos ativos.</p></div>
      <label>Matrícula EVO<input value={memberId} onChange={e=>setMemberId(e.target.value.replace(/[^0-9A-Za-z._-]/g,""))} placeholder="Ex.: 29965" autoComplete="off" required/></label>
      <label>Data de nascimento<input type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)} required/></label>
      {error&&<div className="error-box">{error}</div>}
      <button className="btn primary full" disabled={loading||!memberId||!birthDate}>{loading?"Localizando contrato...":"Continuar"}</button>
      <small className="privacy-note">Não usamos CPF neste portal. Os dados informados servem apenas para confirmar sua identidade e localizar o contrato.</small>
    </form> : <div>
      <div className="self-service-title"><span>CONTRATOS ATIVOS</span><h2>{name ? `Olá, ${name.split(" ")[0]}` : "Escolha o contrato"}</h2><p>Selecione o contrato que deseja cancelar.</p></div>
      <div className="public-contract-list">{contracts.map(c=><button key={c.id} onClick={()=>choose(c.id)} disabled={loading}><b>{c.planName}</b><span>{c.unit} • Início {new Date(c.startDate).toLocaleDateString("pt-BR")}</span></button>)}</div>
      {error&&<div className="error-box">{error}</div>}
    </div>) : <form onSubmit={checkProtocol}>
      <div className="self-service-title"><span>ACOMPANHAMENTO</span><h2>Consulte seu protocolo</h2><p>Use os mesmos dados de identificação para acompanhar o andamento do pedido.</p></div>
      <label>Protocolo<input value={protocol} onChange={e=>setProtocol(e.target.value.toUpperCase())} placeholder="Ex.: EV-..." autoComplete="off" required/></label>
      <label>Matrícula EVO<input value={memberId} onChange={e=>setMemberId(e.target.value.replace(/[^0-9A-Za-z._-]/g,""))} placeholder="Ex.: 29965" autoComplete="off" required/></label>
      <label>Data de nascimento<input type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)} required/></label>
      {error&&<div className="error-box">{error}</div>}
      <button className="btn primary full" disabled={loading||!protocol||!memberId||!birthDate}>{loading?"Consultando...":"Consultar"}</button>
      {protocolResult&&<div className="protocol-result">
        <span>Protocolo #{protocolResult.protocol}</span>
        <h3>{protocolResult.statusLabel}</h3>
        <p>{protocolResult.unit} • {protocolResult.planName}</p>
        {protocolResult.cancellationFee>0&&<p>Taxa: <b>{money.format(protocolResult.cancellationFee)}</b> {protocolResult.cancellationFeePaid?"• pagamento confirmado":"• aguardando confirmação"}</p>}
        {protocolResult.estimatedRefund>0&&<p>Estorno previsto: <b>{money.format(protocolResult.estimatedRefund)}</b></p>}
        <small>Solicitação registrada em {new Date(protocolResult.createdAt).toLocaleDateString("pt-BR")}.</small>
      </div>}
    </form>}
  </div>;
}

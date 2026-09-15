"use client";

import { useState } from "react";

type ContractOption = { id:string; unit:string; planName:string; startDate:string; recurring:boolean; planType:string };
type ProtocolResult = { protocol:string; status:string; statusLabel:string; createdAt:string; unit:string; planName:string; cancellationFee:number; cancellationFeePaid:boolean; estimatedRefund:number; refundDueAt?:string|null };

function formatCpf(value:string){
  const d=value.replace(/\D/g,"").slice(0,11);
  return d.replace(/^(\d{3})(\d)/,"$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d)/,".$1-$2");
}

export default function SelfServiceStart() {
  const [mode,setMode]=useState<"new"|"status">("new");
  const [phase,setPhase]=useState<"identity"|"otp"|"ready">("identity");
  const [cpf,setCpf]=useState("");
  const [email,setEmail]=useState("");
  const [lgpdAccepted,setLgpdAccepted]=useState(false);
  const [challengeId,setChallengeId]=useState("");
  const [emailMask,setEmailMask]=useState("");
  const [otp,setOtp]=useState("");
  const [name,setName]=useState("");
  const [contracts,setContracts]=useState<ContractOption[]>([]);
  const [protocol,setProtocol]=useState("");
  const [protocolResult,setProtocolResult]=useState<ProtocolResult|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const money = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});

  function reset(next:"new"|"status") {
    setMode(next); setPhase("identity"); setError(""); setProtocolResult(null); setContracts([]); setName(""); setChallengeId(""); setOtp(""); setEmailMask("");
  }

  async function beginIdentity(e:React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const r=await fetch("/api/public/identity/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cpf,email,lgpdAccepted,purpose:mode==="new"?"CANCELLATION":"PROTOCOL_STATUS"})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||"Não foi possível confirmar os dados no EVO.");
      setChallengeId(d.challengeId); setEmailMask(d.emailMask||""); setPhase("otp");
    } catch(e) { setError(e instanceof Error?e.message:"Não foi possível iniciar a validação."); }
    finally { setLoading(false); }
  }

  async function verifyOtp(e:React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const r=await fetch("/api/public/identity/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({challengeId,code:otp})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||"Código inválido.");
      setName(d.customerName||""); setContracts(d.contracts||[]); setPhase("ready");
      if(mode==="new"&&(d.contracts||[]).length===1) await choose(d.contracts[0].id);
    } catch(e) { setError(e instanceof Error?e.message:"Não foi possível validar o código."); }
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
      const r=await fetch("/api/public/protocol-status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({protocol:protocol.replace(/^#/,'').trim()})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||"Não foi possível consultar o protocolo.");
      setProtocolResult(d);
    } catch(e) { setError(e instanceof Error?e.message:"Não foi possível consultar o protocolo."); }
    finally { setLoading(false); }
  }

  const identityForm=<form onSubmit={beginIdentity}>
    <div className="self-service-title"><span>VALIDAÇÃO DE IDENTIDADE</span><h2>{mode==="new"?"Solicite seu cancelamento":"Consulte seu protocolo"}</h2><p>Use o CPF e o mesmo e-mail cadastrados no EVO/W12. Enviaremos um código de confirmação para esse endereço.</p></div>
    <label>CPF<input inputMode="numeric" value={cpf} onChange={e=>setCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" autoComplete="off" required/></label>
    <label>E-mail cadastrado no EVO<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seuemail@exemplo.com" autoComplete="email" required/></label>
    <label className="check"><input type="checkbox" checked={lgpdAccepted} onChange={e=>setLgpdAccepted(e.target.checked)}/><span>Autorizo e declaro ciência do tratamento dos meus dados pessoais exclusivamente para identificação, consulta do meu contrato no EVO/W12 e processamento desta solicitação/consulta, conforme a política de privacidade da Evolution Academia.</span></label>
    {error&&<div className="error-box">{error}</div>}
    <button className="btn primary full" disabled={loading||cpf.replace(/\D/g,"").length!==11||!email||!lgpdAccepted}>{loading?"Confirmando no EVO...":"Enviar código de confirmação"}</button>
    <small className="privacy-note">O código só é enviado se CPF e e-mail corresponderem ao cadastro oficial do EVO/W12.</small>
  </form>;

  const otpForm=<form onSubmit={verifyOtp}>
    <div className="self-service-title"><span>CÓDIGO DE CONFIRMAÇÃO</span><h2>Confira seu e-mail</h2><p>Enviamos um código de 6 dígitos para <b>{emailMask||"o e-mail cadastrado no EVO"}</b>.</p></div>
    <label>Código<input inputMode="numeric" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="000000" autoComplete="one-time-code" required/></label>
    {error&&<div className="error-box">{error}</div>}
    <button className="btn primary full" disabled={loading||otp.length!==6}>{loading?"Validando...":"Confirmar identidade"}</button>
    <button type="button" className="btn secondary full" onClick={()=>{setPhase("identity");setOtp("");setError("")}}>Usar outro e-mail/CPF</button>
  </form>;

  return <div className="self-service-card">
    <div className="service-tabs" role="tablist" aria-label="Opções do portal">
      <button type="button" className={mode==="new"?"active":""} onClick={()=>reset("new")}>Solicitar cancelamento</button>
      <button type="button" className={mode==="status"?"active":""} onClick={()=>reset("status")}>Consultar protocolo</button>
    </div>

    {phase==="identity"?identityForm:phase==="otp"?otpForm:mode==="new"?<div>
      <div className="self-service-title"><span>IDENTIDADE CONFIRMADA</span><h2>{name ? `Olá, ${name.split(" ")[0]}` : "Escolha o contrato"}</h2><p>Selecione o contrato ativo que deseja cancelar.</p></div>
      <div className="public-contract-list">{contracts.map(c=><button key={c.id} onClick={()=>choose(c.id)} disabled={loading}><b>{c.planName}</b><span>{c.unit} • Início {new Date(c.startDate).toLocaleDateString("pt-BR")}</span></button>)}</div>
      {error&&<div className="error-box">{error}</div>}
    </div>:<form onSubmit={checkProtocol}>
      <div className="self-service-title"><span>IDENTIDADE CONFIRMADA</span><h2>Consultar protocolo</h2><p>Informe o protocolo que deseja acompanhar.</p></div>
      <label>Protocolo<input value={protocol} onChange={e=>setProtocol(e.target.value.toUpperCase())} placeholder="Ex.: EV-..." autoComplete="off" required/></label>
      {error&&<div className="error-box">{error}</div>}
      <button className="btn primary full" disabled={loading||!protocol}>{loading?"Consultando...":"Consultar"}</button>
      {protocolResult&&<div className="protocol-result">
        <span>Protocolo #{protocolResult.protocol}</span>
        <h3>{protocolResult.statusLabel}</h3>
        <p>{protocolResult.unit} • {protocolResult.planName}</p>
        {protocolResult.cancellationFee>0&&<p>Taxa: <b>{money.format(protocolResult.cancellationFee)}</b> {protocolResult.cancellationFeePaid?"• pagamento confirmado":"• aguardando confirmação"}</p>}
        {protocolResult.estimatedRefund>0&&<p>Estorno previsto: <b>{money.format(protocolResult.estimatedRefund)}</b>{protocolResult.refundDueAt?` • prazo operacional até ${new Date(protocolResult.refundDueAt).toLocaleDateString("pt-BR")}`:""}</p>}
        <small>Solicitação registrada em {new Date(protocolResult.createdAt).toLocaleDateString("pt-BR")}.</small>
      </div>}
    </form>}
  </div>;
}

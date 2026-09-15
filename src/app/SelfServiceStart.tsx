"use client";

import { useState } from "react";

type ContractOption = { id:string; unit:string; planName:string; startDate:string; recurring:boolean; planType:string };
type ProtocolResult = { protocol:string; status:string; statusLabel:string; createdAt:string; unit:string; planName:string; cancellationFee:number; cancellationFeePaid:boolean; estimatedRefund:number };
type AuthStage = "credentials"|"otp"|"verified";

function formatCpf(value:string) {
  const digits=value.replace(/\D/g,"").slice(0,11);
  return digits
    .replace(/^(\d{3})(\d)/,"$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/,"$1.$2.$3")
    .replace(/\.(\d{3})(\d)/,".$1-$2");
}

export default function SelfServiceStart() {
  const [mode,setMode]=useState<"new"|"status">("new");
  const [authStage,setAuthStage]=useState<AuthStage>("credentials");
  const [cpf,setCpf]=useState("");
  const [birthDate,setBirthDate]=useState("");
  const [challengeId,setChallengeId]=useState("");
  const [emailHint,setEmailHint]=useState("");
  const [code,setCode]=useState("");
  const [name,setName]=useState("");
  const [contracts,setContracts]=useState<ContractOption[]>([]);
  const [protocol,setProtocol]=useState("");
  const [protocolResult,setProtocolResult]=useState<ProtocolResult|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const money = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});

  function resetAuth() {
    setAuthStage("credentials");
    setChallengeId("");
    setEmailHint("");
    setCode("");
    setName("");
    setContracts([]);
    setProtocolResult(null);
    setError("");
  }

  function switchMode(next:"new"|"status") {
    setMode(next);
    resetAuth();
  }

  async function startIdentity(e:React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const r=await fetch("/api/public/start",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({cpf:cpf.replace(/\D/g,""),birthDate})
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||"Não foi possível confirmar seus dados.");
      setChallengeId(d.challengeId||"");
      setEmailHint(d.emailHint||"e-mail cadastrado");
      setAuthStage("otp");
    } catch(e) {
      setError(e instanceof Error?e.message:"Não foi possível iniciar a validação.");
    } finally { setLoading(false); }
  }

  async function verifyIdentity(e:React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const r=await fetch("/api/public/verify-identity",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({challengeId,code})
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||"Código inválido.");
      setName(d.customerName||"Cliente");
      setContracts(d.contracts||[]);
      setAuthStage("verified");
    } catch(e) {
      setError(e instanceof Error?e.message:"Não foi possível confirmar o código.");
    } finally { setLoading(false); }
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
      const r=await fetch("/api/public/protocol-status",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({protocol:protocol.replace(/^#/,'').trim()})
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||"Não foi possível consultar o protocolo.");
      setProtocolResult(d);
    } catch(e) { setError(e instanceof Error?e.message:"Não foi possível consultar o protocolo."); }
    finally { setLoading(false); }
  }

  const identityCard = authStage==="credentials" ? <form onSubmit={startIdentity}>
    <div className="self-service-title">
      <span>ACESSO SEGURO</span>
      <h2>Confirme sua identidade</h2>
      <p>Informe seu CPF e sua data de nascimento exatamente como estão cadastrados na Evolution.</p>
    </div>
    <label>CPF<input value={formatCpf(cpf)} onChange={e=>setCpf(e.target.value.replace(/\D/g,"").slice(0,11))} placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" required/></label>
    <label>Data de nascimento<input type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)} autoComplete="bday" required/></label>
    {error&&<div className="error-box">{error}</div>}
    <button className="btn primary full" disabled={loading||cpf.length!==11||!birthDate}>{loading?"Validando no EVO...":"Receber código por e-mail"}</button>
    <small className="privacy-note">O sistema consulta o cadastro no EVO/W12. Se CPF e nascimento coincidirem, o código será enviado somente para o e-mail já cadastrado no EVO. O e-mail não precisa ser digitado.</small>
  </form> : authStage==="otp" ? <form onSubmit={verifyIdentity}>
    <div className="self-service-title">
      <span>VERIFICAÇÃO EM 2 ETAPAS</span>
      <h2>Digite o código recebido</h2>
      <p>Enviamos um código de 6 dígitos para <b>{emailHint}</b>.</p>
    </div>
    <label>Código de confirmação<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="000000" autoComplete="one-time-code" required/></label>
    {error&&<div className="error-box">{error}</div>}
    <button className="btn primary full" disabled={loading||code.length!==6}>{loading?"Confirmando...":"Confirmar identidade"}</button>
    <button type="button" className="btn secondary full" disabled={loading} onClick={resetAuth}>Corrigir meus dados</button>
    <small className="privacy-note">O código é temporário, de uso único e possui limite de tentativas.</small>
  </form> : null;

  return <div className="self-service-card">
    <div className="service-tabs" role="tablist" aria-label="Opções do portal">
      <button type="button" className={mode==="new"?"active":""} onClick={()=>switchMode("new")}>Solicitar cancelamento</button>
      <button type="button" className={mode==="status"?"active":""} onClick={()=>switchMode("status")}>Consultar protocolo</button>
    </div>

    {authStage!=="verified" ? identityCard : mode==="new" ? <div>
      <div className="self-service-title"><span>IDENTIDADE CONFIRMADA</span><h2>{name ? `Olá, ${name.split(" ")[0]}` : "Contratos encontrados"}</h2><p>Selecione o contrato que deseja cancelar.</p></div>
      <div className="public-contract-list">{contracts.map(c=><button key={c.id} onClick={()=>choose(c.id)} disabled={loading}><b>{c.planName}</b><span>{c.unit} • Início {new Date(c.startDate).toLocaleDateString("pt-BR")}</span></button>)}</div>
      {error&&<div className="error-box">{error}</div>}
      <small className="privacy-note">A matrícula e o e-mail são obtidos internamente pelo EVO/W12 e não precisam ser digitados pelo cliente.</small>
    </div> : <form onSubmit={checkProtocol}>
      <div className="self-service-title"><span>IDENTIDADE CONFIRMADA</span><h2>Consulte seu protocolo</h2><p>Informe somente o protocolo. Sua identidade já foi validada com CPF, nascimento e código enviado ao e-mail cadastrado.</p></div>
      <label>Protocolo<input value={protocol} onChange={e=>setProtocol(e.target.value.toUpperCase())} placeholder="Ex.: EV-..." autoComplete="off" required/></label>
      {error&&<div className="error-box">{error}</div>}
      <button className="btn primary full" disabled={loading||!protocol}>{loading?"Consultando...":"Consultar"}</button>
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

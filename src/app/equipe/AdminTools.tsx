"use client";

import { useState } from "react";

type SyncedContract = {
  id:string; unit:string; planName:string; planType?:string; status:string; startDate?:string; endDate?:string|null;
  amountPaid?:number; recurring?:boolean; syncedAt?:string|null; metadata?:unknown;
};

type ManualForm = {
  displayName:string;unit:"Condor"|"Umarizal";planName:string;planType:"ANUAL"|"RECORRENTE"|"MENSAL"|"OUTRO";
  startDate:string;endDate:string;amountPaid:string;recurring:boolean;
};

const initialManual:ManualForm={displayName:"",unit:"Condor",planName:"",planType:"RECORRENTE",startDate:"",endDate:"",amountPaid:"",recurring:true};

function money(value?:number){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));}
function date(value?:string|null){if(!value)return "—";const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("pt-BR");}

export default function AdminTools() {
  const [memberId, setMemberId] = useState("");
  const [searchUnit,setSearchUnit]=useState<"Condor"|"Umarizal">("Condor");
  const [customerName,setCustomerName]=useState("");
  const [contracts, setContracts] = useState<SyncedContract[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [manualMode,setManualMode]=useState(false);
  const [manual,setManual]=useState<ManualForm>(initialManual);
  const [accessCode,setAccessCode]=useState("");
  const [accessExpiresAt,setAccessExpiresAt]=useState("");

  async function sync() {
    setMessage(""); setContracts([]); setManualMode(false); setAccessCode(""); setAccessExpiresAt(""); setLoading(true);
    try {
      const r = await fetch("/api/admin/evo/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId, unit: searchUnit }) });
      const data = await r.json();
      if (r.status===409) {
        setManualMode(true);
        setManual(current=>({...current,unit:searchUnit}));
        setMessage("Integração EVO ainda não está em leitura. Cadastre os dados abaixo somente como contingência.");
        return;
      }
      if (!r.ok) throw new Error(data.error || "Não foi possível localizar o aluno");
      setCustomerName(data.customer.displayName);
      setContracts(data.contracts || []);
      setMessage(`Aluno localizado no EVO (${searchUnit}): ${data.customer.displayName}. Confira o contrato antes de continuar.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(false); }
  }

  async function saveManual() {
    setLoading(true);setMessage("");setAccessCode("");setAccessExpiresAt("");
    try{
      const payload={memberId,displayName:manual.displayName,unit:manual.unit,planName:manual.planName,planType:manual.planType,startDate:manual.startDate,endDate:manual.endDate||null,amountPaid:Number(manual.amountPaid||0),recurring:manual.recurring};
      const r=await fetch("/api/admin/manual/customer-contract",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||"Não foi possível salvar o contrato");
      setCustomerName(data.customer.displayName);setContracts([data.contract]);setManualMode(false);setMessage("Cadastro pronto. Agora gere um código de atendimento para o aluno.");
    }catch(e){setMessage(e instanceof Error?e.message:"Falha");}finally{setLoading(false);}
  }

  async function issue(contractId: string) {
    setMessage(""); setAccessCode(""); setAccessExpiresAt(""); setLoading(true);
    try {
      const r = await fetch("/api/admin/access-grants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contractId, validDays: 1 }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao gerar código de atendimento");
      setAccessCode(String(data.accessId||""));
      setAccessExpiresAt(String(data.expiresAt||""));
      setMessage("Código gerado. Entregue-o somente ao aluno correto. Ele será inutilizado no primeiro acesso.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(false); }
  }

  async function copyAccessCode() {
    if (!accessCode) return;
    try { await navigator.clipboard.writeText(accessCode); setMessage("Código copiado."); }
    catch { setMessage("Copie o código exibido abaixo."); }
  }

  async function logout() { await fetch("/api/auth/admin/logout", { method: "POST" }); location.href = "/equipe/login"; }

  return (
    <section className="admin-tools glass operational-card">
      <div className="section-title"><div><p className="eyebrow">CONSULTA EVO / W12</p><h2>Localizar aluno pela matrícula EVO</h2><p className="section-help">Selecione a unidade correta antes da consulta para usar somente a credencial EVO daquela unidade.</p></div><button onClick={logout}>Sair</button></div>
      <div className="tool-row"><select value={searchUnit} onChange={e=>setSearchUnit(e.target.value as "Condor"|"Umarizal")} aria-label="Unidade EVO"><option value="Condor">Condor</option><option value="Umarizal">Umarizal</option></select><input inputMode="numeric" value={memberId} onChange={e=>setMemberId(e.target.value.replace(/[^0-9A-Za-z._-]/g,""))} placeholder="Matrícula EVO" autoComplete="off"/><button className="btn primary" disabled={loading||!memberId.trim()} onClick={sync}>{loading?"Consultando EVO...":"Buscar no EVO"}</button></div>

      {manualMode&&<div className="manual-entry"><div className="manual-head"><b>Contingência manual</b><span>Use somente se a integração estiver indisponível.</span></div><div className="form-grid">
        <label>Nome do aluno<input value={manual.displayName} onChange={e=>setManual({...manual,displayName:e.target.value})} placeholder="Nome completo"/></label>
        <label>Unidade<select value={manual.unit} onChange={e=>setManual({...manual,unit:e.target.value as ManualForm["unit"]})}><option>Condor</option><option>Umarizal</option></select></label>
        <label>Plano<input value={manual.planName} onChange={e=>setManual({...manual,planName:e.target.value})} placeholder="Nome do plano"/></label>
        <label>Tipo<select value={manual.planType} onChange={e=>{const v=e.target.value as ManualForm["planType"];setManual({...manual,planType:v,recurring:v==="RECORRENTE"})}}><option value="RECORRENTE">Recorrente</option><option value="ANUAL">Anual</option><option value="MENSAL">Mensal</option><option value="OUTRO">Outro</option></select></label>
        <label>Início do contrato<input type="date" value={manual.startDate} onChange={e=>setManual({...manual,startDate:e.target.value})}/></label>
        <label>Fim do contrato<input type="date" value={manual.endDate} onChange={e=>setManual({...manual,endDate:e.target.value})}/></label>
        <label>Valor pago/registrado<input inputMode="decimal" value={manual.amountPaid} onChange={e=>setManual({...manual,amountPaid:e.target.value.replace(",",".")})} placeholder="0,00"/></label>
      </div><button className="btn primary" disabled={loading||!manual.displayName.trim()||!manual.planName.trim()||!manual.startDate} onClick={saveManual}>Salvar e continuar</button></div>}

      {customerName&&contracts.length>0&&<div className="customer-found"><span>Aluno localizado</span><h3>{customerName}</h3><small>Matrícula EVO: {memberId}</small></div>}
      {contracts.length>0&&<div className="synced-contracts clean-contracts">{contracts.map(c=><div key={c.id} className="evo-contract-card"><div className="evo-contract-main"><span className="refund-status paid">{c.status==="ACTIVE"?"ATIVO":c.status}</span><h3>{c.planName}</h3><p>{c.unit} • {c.planType||"Plano"} {c.recurring?"• Recorrente":""}</p></div><div className="evo-contract-data"><span><small>Início</small><b>{date(c.startDate)}</b></span><span><small>Fim</small><b>{date(c.endDate)}</b></span><span><small>Valor registrado</small><b>{money(c.amountPaid)}</b></span><span><small>Última sincronização</small><b>{c.syncedAt?date(c.syncedAt):"Agora"}</b></span></div><button onClick={()=>issue(c.id)} disabled={loading||c.status!=="ACTIVE"}>{loading?"Gerando...":"Gerar código de atendimento"}</button></div>)}</div>}

      {accessCode&&<div className="info-box"><strong>Código de atendimento</strong><div style={{fontSize:"1.35rem",fontWeight:800,letterSpacing:".08em",margin:"8px 0"}}>{accessCode}</div><small>{accessExpiresAt?`Válido até ${new Date(accessExpiresAt).toLocaleString("pt-BR")}. `:""}Uso único. Não envie para terceiros.</small><div><button type="button" className="btn secondary" onClick={copyAccessCode}>Copiar código</button></div></div>}
      {message&&<div className="info-box">{message}</div>}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";

type SyncedContract = { id: string; unit: string; planName: string; status: string; endDate?: string | null };

type ManualForm = {
  displayName:string;unit:"Condor"|"Umarizal";planName:string;planType:"ANUAL"|"RECORRENTE"|"MENSAL"|"OUTRO";
  startDate:string;endDate:string;amountPaid:string;recurring:boolean;
};

const initialManual:ManualForm={displayName:"",unit:"Condor",planName:"",planType:"RECORRENTE",startDate:"",endDate:"",amountPaid:"",recurring:true};

export default function AdminTools() {
  const [memberId, setMemberId] = useState("");
  const [customerName,setCustomerName]=useState("");
  const [contracts, setContracts] = useState<SyncedContract[]>([]);
  const [accessLink, setAccessLink] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [manualMode,setManualMode]=useState(false);
  const [manual,setManual]=useState<ManualForm>(initialManual);
  const [usage, setUsage] = useState<{ hitCount: number; softLimit: number; hardLimit: number } | null>(null);

  useEffect(() => {
    fetch("/api/admin/evo/usage", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(setUsage).catch(() => null);
  }, []);

  async function sync() {
    setMessage(""); setAccessLink(""); setContracts([]); setManualMode(false); setLoading(true);
    try {
      const r = await fetch("/api/admin/evo/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId }) });
      const data = await r.json();
      if (r.status===409) {
        setManualMode(true);
        setMessage("A API do EVO ainda não está conectada. Você pode cadastrar os dados do contrato agora e começar a usar o sistema; depois a integração substituirá esta etapa manual.");
        return;
      }
      if (!r.ok) throw new Error(data.error || "Não foi possível localizar o aluno");
      setCustomerName(data.customer.displayName);
      setContracts(data.contracts || []);
      setMessage(`Aluno encontrado: ${data.customer.displayName}. Escolha o contrato correto.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(false); }
  }

  async function saveManual() {
    setLoading(true);setMessage("");setAccessLink("");
    try{
      const payload={
        memberId,displayName:manual.displayName,unit:manual.unit,planName:manual.planName,planType:manual.planType,
        startDate:manual.startDate,endDate:manual.endDate||null,amountPaid:Number(manual.amountPaid||0),recurring:manual.recurring
      };
      const r=await fetch("/api/admin/manual/customer-contract",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||"Não foi possível salvar o contrato");
      setCustomerName(data.customer.displayName);
      setContracts([data.contract]);
      setManualMode(false);
      setMessage("Cadastro pronto. Agora gere o link seguro para o aluno.");
    }catch(e){setMessage(e instanceof Error?e.message:"Falha");}
    finally{setLoading(false);}
  }

  async function issue(contractId: string) {
    setMessage(""); setAccessLink(""); setLoading(true);
    try {
      const r = await fetch("/api/admin/access-grants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contractId, validDays: 1 }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao criar o acesso");
      const link=`${window.location.origin}/cliente#acesso=${encodeURIComponent(data.accessId)}`;
      setAccessLink(link);
      setMessage("Link seguro criado. Envie ao aluno pelo WhatsApp ou abra neste aparelho para continuar o atendimento.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(false); }
  }

  async function copyLink(){
    if(!accessLink)return;
    try{await navigator.clipboard.writeText(accessLink);setMessage("Link copiado. Agora é só enviar ao aluno.");}
    catch{setMessage("Não foi possível copiar automaticamente. Abra o portal pelo botão ao lado.");}
  }

  async function logout() {
    await fetch("/api/auth/admin/logout", { method: "POST" });
    location.href = "/equipe/login";
  }

  return (
    <section className="admin-tools glass operational-card">
      <div className="section-title"><div><p className="eyebrow">INICIAR ATENDIMENTO</p><h2>Localizar aluno pela matrícula EVO</h2><p className="section-help">Digite apenas a matrícula usada no EVO, como 29965.</p></div><button onClick={logout}>Sair</button></div>
      <div className="tool-row">
        <input inputMode="numeric" value={memberId} onChange={e => setMemberId(e.target.value.replace(/[^0-9A-Za-z._-]/g,""))} placeholder="Matrícula EVO" autoComplete="off" />
        <button className="btn primary" disabled={loading || !memberId.trim()} onClick={sync}>{loading ? "Localizando..." : "Buscar aluno"}</button>
      </div>

      {manualMode&&<div className="manual-entry">
        <div className="manual-head"><b>Cadastro rápido enquanto a API não está conectada</b><span>Use os dados que já aparecem no EVO/W12.</span></div>
        <div className="form-grid">
          <label>Nome do aluno<input value={manual.displayName} onChange={e=>setManual({...manual,displayName:e.target.value})} placeholder="Nome completo"/></label>
          <label>Unidade<select value={manual.unit} onChange={e=>setManual({...manual,unit:e.target.value as ManualForm["unit"]})}><option>Condor</option><option>Umarizal</option></select></label>
          <label>Plano<input value={manual.planName} onChange={e=>setManual({...manual,planName:e.target.value})} placeholder="Nome do plano"/></label>
          <label>Tipo<select value={manual.planType} onChange={e=>{const v=e.target.value as ManualForm["planType"];setManual({...manual,planType:v,recurring:v==="RECORRENTE"})}}><option value="RECORRENTE">Recorrente</option><option value="ANUAL">Anual</option><option value="MENSAL">Mensal</option><option value="OUTRO">Outro</option></select></label>
          <label>Início do contrato<input type="date" value={manual.startDate} onChange={e=>setManual({...manual,startDate:e.target.value})}/></label>
          <label>Fim do contrato<input type="date" value={manual.endDate} onChange={e=>setManual({...manual,endDate:e.target.value})}/></label>
          <label>Valor pago/registrado<input inputMode="decimal" value={manual.amountPaid} onChange={e=>setManual({...manual,amountPaid:e.target.value.replace(",",".")})} placeholder="0,00"/></label>
        </div>
        <button className="btn primary" disabled={loading||!manual.displayName.trim()||!manual.planName.trim()||!manual.startDate} onClick={saveManual}>Salvar e continuar</button>
      </div>}

      {customerName&&contracts.length>0&&<div className="customer-found"><span>Aluno</span><h3>{customerName}</h3></div>}
      {contracts.length > 0 && <div className="synced-contracts clean-contracts">{contracts.map(c => <div key={c.id}><span><b>{c.planName}</b><small>{c.unit} • {c.status==="ACTIVE"?"Ativo":c.status}</small></span><button onClick={() => issue(c.id)} disabled={loading||c.status!=="ACTIVE"}>Iniciar cancelamento</button></div>)}</div>}

      {accessLink && <div className="access-output clean-link"><span>Portal do aluno pronto</span><b>Link seguro criado por 24 horas</b><div className="link-actions"><button className="btn secondary" onClick={copyLink}>Copiar link</button><a className="btn primary" href={accessLink} target="_blank" rel="noreferrer">Abrir portal do aluno</a></div></div>}
      {message && <div className="info-box">{message}</div>}
      {usage && <details className="api-usage"><summary>Consumo da API EVO</summary><div><span>Requisições neste mês</span><b>{usage.hitCount} de {usage.hardLimit}</b><small>Alerta interno em {usage.softLimit}.</small></div></details>}
    </section>
  );
}

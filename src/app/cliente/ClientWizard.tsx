"use client";

import { useEffect, useMemo, useState } from "react";

type ContractView = { id:string; unit:string; planName:string; planType:string; startDate:string; endDate?:string|null; amountPaid:number; recurring:boolean; status:string };
type Preview = { eligible:boolean; reason?:string; feeReference?:number; noticeDays?:number; rule?:{version:string;name:string;percentage:number}; calculation?:{unusedBalance:number;deduction:number;estimatedRefund:number} };
const steps=["Contrato","Solicitação","Prévia","Termo","Assinatura"];
const reasonMap:Record<string,string>={Mudança:"MUDANCA",Financeiro:"FINANCEIRO",Saúde:"SAUDE",Horário:"HORARIO",Atendimento:"ATENDIMENTO",Outro:"OUTRO"};

function friendlyStatus(status:string){
  const labels:Record<string,string>={
    AWAITING_SIGNATURE:"Aguardando assinatura",SIGNED_RECEIVED:"Termo recebido",UNDER_REVIEW:"Em análise",APPROVED:"Aprovado",
    MANUAL_REVIEW:"Conferência da equipe",EVO_CANCEL_REQUESTED:"Enviado ao EVO",EVO_CANCELLED:"Cancelado no EVO",
    CANCELLED_CONFIRMED:"Cancelamento confirmado",REFUND_PENDING:"Estorno pendente",REFUND_REGISTERED:"Estorno registrado",
    COMPLETED:"Concluído",REJECTED:"Não aprovado",CANCELLED_BY_CUSTOMER:"Encerrado"
  };
  return labels[status] || status;
}

export default function ClientWizard(){
  const [step,setStep]=useState(0),[customerName,setCustomerName]=useState("");
  const [contract,setContract]=useState<ContractView|null>(null),[reason,setReason]=useState("Mudança"),[reasonDetails,setReasonDetails]=useState("");
  const [desiredDate,setDesiredDate]=useState(()=>new Date().toISOString().slice(0,10)),[preview,setPreview]=useState<Preview|null>(null);
  const [address,setAddress]=useState(""),[email,setEmail]=useState(""),[pixKey,setPixKey]=useState(""),[accepted,setAccepted]=useState(false);
  const [protocol,setProtocol]=useState(""),[termUrl,setTermUrl]=useState(""),[signedFile,setSignedFile]=useState<File|null>(null),[alreadySigned,setAlreadySigned]=useState(false);
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[noSession,setNoSession]=useState(false),[result,setResult]=useState<{protocol:string;status:string;message:string}|null>(null);
  const money=useMemo(()=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}),[]);
  const req=async(url:string,options?:RequestInit)=>{const r=await fetch(url,options);const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Não foi possível concluir a operação");return data};

  useEffect(()=>{
    let active=true;
    (async()=>{
      try{
        const hash=window.location.hash;
        if(hash.startsWith("#acesso=")){
          const accessId=decodeURIComponent(hash.slice("#acesso=".length));
          window.history.replaceState(null,"",window.location.pathname);
          const accessResponse=await fetch("/api/public/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accessId})});
          const accessData=await accessResponse.json().catch(()=>({}));
          if(!accessResponse.ok)throw new Error(accessData.error||"Este link de acesso é inválido ou expirou.");
        }
        const meResponse=await fetch("/api/public/me",{cache:"no-store"});
        if(meResponse.status===401){if(active)setNoSession(true);return;}
        const me=await meResponse.json();
        if(!meResponse.ok)throw new Error(me.error||"Não foi possível abrir seu pedido");
        if(!active)return;
        setCustomerName(me.customer.displayName);setContract(me.contract);
        const st=await req("/api/public/status",{cache:"no-store"});
        const latest=st.items?.[0];
        if(latest&&["AWAITING_SIGNATURE","SIGNED_RECEIVED"].includes(latest.status)){
          setProtocol(latest.protocol);setTermUrl(latest.termUrl);setAlreadySigned(latest.status==="SIGNED_RECEIVED");setStep(latest.status==="SIGNED_RECEIVED"?4:3);
        }else if(latest&&!["COMPLETED","REJECTED","EVO_CANCELLED","CANCELLED_CONFIRMED","CANCELLED_BY_CUSTOMER"].includes(latest.status)){
          setResult({protocol:latest.protocol,status:latest.status,message:"Sua solicitação já está em andamento. A equipe continuará o atendimento por este protocolo."});
        }
      }catch(e){if(active)setError(e instanceof Error?e.message:"Falha ao carregar o pedido");}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false};
  },[]);

  async function loadPreview(){setLoading(true);setError("");try{setPreview(await req("/api/public/refund-preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({desiredDate})}));setStep(2)}catch(e){setError(e instanceof Error?e.message:"Falha na prévia")}finally{setLoading(false)}}
  async function generateTerm(){setLoading(true);setError("");try{const d=await req("/api/public/cancel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reasonCode:reasonMap[reason],reasonDetails:reason==="Outro"?reasonDetails:undefined,desiredDate,termVersion:"EV-CAN-2026.09-v4",accepted:true,requesterAddress:address,contactEmail:email,pixKey:contract?.recurring?undefined:pixKey})});setProtocol(d.protocol);setTermUrl(d.termUrl);setStep(3)}catch(e){setError(e instanceof Error?e.message:"Falha ao gerar termo")}finally{setLoading(false)}}
  async function uploadAndFinalize(){if(!signedFile||!protocol)return;setLoading(true);setError("");try{const fd=new FormData();fd.append("protocol",protocol);fd.append("file",signedFile);await req("/api/public/signed-term",{method:"POST",body:fd});const d=await req("/api/public/finalize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({protocol})});setResult(d)}catch(e){setError(e instanceof Error?e.message:"Falha ao enviar termo")}finally{setLoading(false)}}
  async function finalizeExisting(){if(!protocol)return;setLoading(true);setError("");try{const d=await req("/api/public/finalize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({protocol})});setResult(d)}catch(e){setError(e instanceof Error?e.message:"Falha ao concluir")}finally{setLoading(false)}}

  if(loading && !contract && !result)return <div className="wizard-card glass centered-state"><div className="spinner"/><h2>Abrindo seu atendimento...</h2><p>Estamos carregando os dados do contrato.</p></div>;

  if(noSession)return <div className="wizard-card glass access-help"><p className="eyebrow">PORTAL DO ALUNO</p><h1>Acesse pelo link seguro enviado pela equipe</h1><p>Você não precisa digitar códigos longos. A equipe localiza seu cadastro pela sua matrícula EVO e envia um link para abrir seu contrato diretamente.</p><div className="help-steps"><div><b>Tenha sua matrícula EVO em mãos</b><span>Exemplo: 29965.</span></div><div><b>A equipe localiza seu cadastro</b><span>Condor ou Umarizal e o plano correto.</span></div><div><b>Abra o link recebido</b><span>Você verá o contrato, a prévia e o termo para assinatura.</span></div></div><a className="btn secondary" href="/">Voltar ao início</a></div>;

  if(result)return <div className="wizard-card glass"><div className="wizard-head"><div><p className="eyebrow">PEDIDO REGISTRADO</p><h1>Solicitação enviada</h1></div></div><div className="wizard-body"><div className="protocol-preview success-panel"><span>Protocolo</span><b>#{result.protocol}</b><span>{friendlyStatus(result.status)}</span></div><div className="info-box">{result.message} Guarde o protocolo para acompanhamento.</div></div><div className="wizard-actions"><a className="btn primary" href="/">Concluir</a></div></div>;

  return <div className="wizard-card glass">
    <div className="wizard-head"><div><p className="eyebrow">PORTAL DO ALUNO</p><h1>Cancelamento de contrato</h1></div><span className="simple-progress-label">{steps[step]}</span></div>
    <div className="stepper clean-stepper" style={{gridTemplateColumns:`repeat(${steps.length},1fr)`}}>{steps.map((s,i)=><div className={i<=step?"active":""} key={s}><i/><span>{s}</span></div>)}</div>
    <div className="wizard-body">{error&&<div className="error-box">{error}</div>}
      {step===0&&contract&&<><div className="welcome-line">Olá, <b>{customerName.split(" ")[0]}</b>. Confira seu contrato antes de continuar.</div><div className="contract-card selected"><span>CONTRATO ATIVO</span><h3>{contract.planName}</h3><p><b>Unidade:</b> {contract.unit}</p><p><b>Início:</b> {new Date(contract.startDate).toLocaleDateString("pt-BR")}</p><p><b>Tipo:</b> {contract.recurring?"Recorrente":contract.planType}</p>{contract.amountPaid>0&&<strong>Valor registrado: {money.format(contract.amountPaid)}</strong>}</div></>}
      {step===1&&<><label>Por que você deseja cancelar?</label><div className="choice-grid">{Object.keys(reasonMap).map(r=><button type="button" className={reason===r?"selected":""} onClick={()=>setReason(r)} key={r}>{r}</button>)}</div>{reason==="Outro"&&<label>Conte o motivo<textarea value={reasonDetails} maxLength={1000} onChange={e=>setReasonDetails(e.target.value)}/></label>}<label>Data desejada para o cancelamento<input type="date" value={desiredDate} onChange={e=>setDesiredDate(e.target.value)}/></label></>}
      {step===2&&<>{preview?.eligible&&preview.calculation?<div className="calc-panel"><p className="eyebrow">PRÉVIA DE ESTORNO</p><div><span>Saldo não utilizado</span><b>{money.format(preview.calculation.unusedBalance)}</b></div><div><span>Descontos previstos</span><b>- {money.format(preview.calculation.deduction)}</b></div><hr/><div className="total"><span>Valor estimado</span><b>{money.format(preview.calculation.estimatedRefund)}</b></div><small>Esta é uma prévia. O valor final depende da conferência do contrato e do financeiro.</small></div>:<div className="info-box">{preview?.reason||"Seu contrato seguirá para conferência da equipe antes da definição de qualquer estorno."}</div>}</>}
      {step===3&&<>{!protocol?<><div className="term-box"><h3>Dados do termo</h3><p>Preencha somente o necessário. O sistema já vincula seu nome, matrícula, unidade, plano, motivo e data ao pedido.</p></div><label>Endereço<input value={address} maxLength={240} onChange={e=>setAddress(e.target.value)} placeholder="Endereço completo"/></label><label>E-mail para contato<input type="email" value={email} maxLength={200} onChange={e=>setEmail(e.target.value)} placeholder="seuemail@exemplo.com"/></label>{contract&&!contract.recurring&&<label>Chave PIX para eventual estorno<input value={pixKey} maxLength={180} onChange={e=>setPixKey(e.target.value)} placeholder="Somente se houver estorno"/></label>}<label className="check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Revisei os dados e confirmo que desejo solicitar o cancelamento.</span></label></>:<div className="download-panel"><h3>Termo pronto para assinatura</h3><b>Protocolo #{protocol}</b><a className="btn primary" href={termUrl}>Baixar termo em PDF</a><span>Assine o documento e depois envie o arquivo assinado na próxima etapa.</span></div>}</>}
      {step===4&&<>{alreadySigned?<div className="upload-zone"><p className="eyebrow">DOCUMENTO RECEBIDO</p><h3>Seu termo assinado já está no sistema</h3><p>Agora basta concluir a solicitação.</p></div>:<div className="upload-zone"><p className="eyebrow">ENVIAR TERMO ASSINADO</p><h3>Selecione o arquivo assinado</h3><p>PDF, JPG ou PNG. Limite de 8 MB.</p><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setSignedFile(e.target.files?.[0]||null)}/>{signedFile&&<b>{signedFile.name}</b>}</div>}</>}
    </div>
    <div className="wizard-actions"><button className="btn secondary" disabled={step===0||loading} onClick={()=>setStep(Math.max(0,step-1))}>Voltar</button>
      {step===0&&<button className="btn primary" disabled={contract?.status!=="ACTIVE"} onClick={()=>setStep(1)}>Este é meu contrato</button>}
      {step===1&&<button className="btn primary" disabled={!desiredDate||loading} onClick={loadPreview}>{loading?"Calculando...":"Ver prévia"}</button>}
      {step===2&&<button className="btn primary" onClick={()=>setStep(3)}>Continuar</button>}
      {step===3&&!protocol&&<button className="btn primary" disabled={!accepted||!address.trim()||!email.trim()||loading} onClick={generateTerm}>{loading?"Gerando...":"Gerar termo"}</button>}
      {step===3&&protocol&&<button className="btn primary" onClick={()=>setStep(4)}>Enviar termo assinado</button>}
      {step===4&&!alreadySigned&&signedFile&&<button className="btn primary" disabled={loading} onClick={uploadAndFinalize}>{loading?"Enviando...":"Enviar e concluir"}</button>}{step===4&&alreadySigned&&protocol&&<button className="btn primary" disabled={loading} onClick={finalizeExisting}>{loading?"Concluindo...":"Concluir pedido"}</button>}
    </div>
  </div>
}

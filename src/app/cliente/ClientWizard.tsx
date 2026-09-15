"use client";

import { useEffect, useMemo, useState } from "react";

type ContractView = { id:string; unit:string; planName:string; planType:string; startDate:string; endDate?:string|null; amountPaid:number; recurring:boolean; status:string };
type Preview = {
  kind?:"ANNUAL"|"RECURRING";
  eligible:boolean;
  reason?:string;
  refund?:number;
  feeRequired?:boolean;
  feeAmount?:number;
  oneYearDate?:string;
  calculation?:{
    totalContractValue:number;
    monthlyReference:number;
    monthsUsed:number;
    monthsRemaining:number;
    unusedBalance:number;
    advanceDeduction:number;
    contractFee:number;
    deduction:number;
    estimatedRefund:number;
  }
};

type FinalResult={protocol:string;status:string;message:string;refundDueAt?:string|null;feePayment?:{amount:number;pixKey:string;pixName:string}};
const steps=["Contrato","Motivo","Valores","Termo","Assinatura"];
const reasonMap:Record<string,string>={Mudança:"MUDANCA",Financeiro:"FINANCEIRO",Saúde:"SAUDE",Horário:"HORARIO",Atendimento:"ATENDIMENTO",Outro:"OUTRO"};

function friendlyStatus(status:string){
  const labels:Record<string,string>={
    AWAITING_SIGNATURE:"Aguardando assinatura",SIGNED_RECEIVED:"Termo recebido",FEE_PENDING:"Aguardando pagamento da taxa",READY_TO_CANCEL:"Pronto para cancelamento",
    UNDER_REVIEW:"Em conferência",APPROVED:"Aprovado",MANUAL_REVIEW:"Em conferência",EVO_CANCEL_REQUESTED:"Cancelamento enviado ao EVO",
    EVO_CANCELLED:"Contrato cancelado no EVO",CANCELLED_CONFIRMED:"Contrato cancelado",REFUND_PENDING:"Estorno pendente",REFUND_REGISTERED:"Estorno registrado",
    COMPLETED:"Concluído",REJECTED:"Não aprovado",CANCELLED_BY_CUSTOMER:"Encerrado"
  };
  return labels[status]||status;
}

export default function ClientWizard(){
  const [step,setStep]=useState(0),[customerName,setCustomerName]=useState("");
  const [contract,setContract]=useState<ContractView|null>(null),[reason,setReason]=useState("Mudança"),[reasonDetails,setReasonDetails]=useState("");
  const [desiredDate,setDesiredDate]=useState(()=>new Date().toISOString().slice(0,10)),[preview,setPreview]=useState<Preview|null>(null);
  const [address,setAddress]=useState(""),[rg,setRg]=useState(""),[pixKey,setPixKey]=useState(""),[accepted,setAccepted]=useState(false);
  const [protocol,setProtocol]=useState(""),[termUrl,setTermUrl]=useState(""),[refundDueAt,setRefundDueAt]=useState<string|null>(null),[signedFile,setSignedFile]=useState<File|null>(null),[alreadySigned,setAlreadySigned]=useState(false);
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[noSession,setNoSession]=useState(false),[result,setResult]=useState<FinalResult|null>(null);
  const [feeReceipt,setFeeReceipt]=useState<File|null>(null),[feeReceiptMessage,setFeeReceiptMessage]=useState("");
  const money=useMemo(()=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}),[]);
  const req=async(url:string,options?:RequestInit)=>{const r=await fetch(url,options);const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Não foi possível concluir esta etapa.");return data};

  useEffect(()=>{
    let active=true;
    (async()=>{
      try{
        const meResponse=await fetch("/api/public/me",{cache:"no-store"});
        if(meResponse.status===401){if(active)setNoSession(true);return;}
        const me=await meResponse.json();
        if(!meResponse.ok)throw new Error(me.error||"Não foi possível abrir seu contrato.");
        if(!active)return;
        setCustomerName(me.customer.displayName);setContract(me.contract);
        const st=await req("/api/public/status",{cache:"no-store"});
        const latest=st.items?.[0];
        if(latest&&["AWAITING_SIGNATURE","SIGNED_RECEIVED"].includes(latest.status)){
          setProtocol(latest.protocol);setTermUrl(latest.termUrl);setRefundDueAt(latest.refundDueAt||null);setAlreadySigned(latest.status==="SIGNED_RECEIVED");setStep(latest.status==="SIGNED_RECEIVED"?4:3);
        }else if(latest&&!["COMPLETED","REJECTED","EVO_CANCELLED","CANCELLED_CONFIRMED","CANCELLED_BY_CUSTOMER"].includes(latest.status)){
          setResult({protocol:latest.protocol,status:latest.status,message:"Sua solicitação já foi registrada e está em andamento.",refundDueAt:latest.refundDueAt||null});
        }
      }catch(e){if(active)setError(e instanceof Error?e.message:"Não foi possível carregar seu pedido.");}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false};
  },[]);

  async function loadPreview(){setLoading(true);setError("");try{setPreview(await req("/api/public/refund-preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({desiredDate})}));setStep(2)}catch(e){setError(e instanceof Error?e.message:"Não foi possível calcular os valores.")}finally{setLoading(false)}}
  async function generateTerm(){setLoading(true);setError("");try{const d=await req("/api/public/cancel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reasonCode:reasonMap[reason],reasonDetails:reason==="Outro"?reasonDetails:undefined,desiredDate,accepted:true,requesterAddress:address,rg,pixKey:contract?.recurring?undefined:pixKey})});setProtocol(d.protocol);setTermUrl(d.termUrl);setRefundDueAt(d.refundDueAt||null);setStep(3)}catch(e){setError(e instanceof Error?e.message:"Não foi possível gerar o termo.")}finally{setLoading(false)}}
  async function uploadAndFinalize(){if(!signedFile||!protocol)return;setLoading(true);setError("");try{const fd=new FormData();fd.append("protocol",protocol);fd.append("file",signedFile);await req("/api/public/signed-term",{method:"POST",body:fd});const d=await req("/api/public/finalize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({protocol})});setResult(d)}catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar o termo.")}finally{setLoading(false)}}
  async function finalizeExisting(){if(!protocol)return;setLoading(true);setError("");try{const d=await req("/api/public/finalize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({protocol})});setResult(d)}catch(e){setError(e instanceof Error?e.message:"Não foi possível concluir o pedido.")}finally{setLoading(false)}}
  async function uploadFeeReceipt(){if(!feeReceipt||!result?.protocol)return;setLoading(true);setFeeReceiptMessage("");try{const fd=new FormData();fd.append("protocol",result.protocol);fd.append("file",feeReceipt);const d=await req("/api/public/fee-receipt",{method:"POST",body:fd});setFeeReceiptMessage(d.message||"Comprovante recebido.")}catch(e){setFeeReceiptMessage(e instanceof Error?e.message:"Não foi possível enviar o comprovante.")}finally{setLoading(false)}}

  if(loading&&!contract&&!result)return <div className="wizard-card glass centered-state"><div className="spinner"/><h2>Abrindo seu contrato...</h2></div>;
  if(noSession)return <div className="wizard-card glass access-help"><p className="eyebrow">CANCELAMENTO ONLINE</p><h1>Sua sessão terminou</h1><p>Volte ao início e confirme novamente CPF, e-mail cadastrado no EVO e o código de segurança.</p><a className="btn primary" href="/">Voltar ao início</a></div>;
  if(result)return <div className="wizard-card glass"><div className="wizard-head"><div><p className="eyebrow">SOLICITAÇÃO REGISTRADA</p><h1>Pedido recebido</h1></div></div><div className="wizard-body"><div className="protocol-preview success-panel"><span>Protocolo</span><b>#{result.protocol}</b><span>{friendlyStatus(result.status)}</span></div><div className="info-box">{result.message}</div>{result.refundDueAt&&<div className="info-box"><b>Prazo operacional do estorno:</b> até {new Date(result.refundDueAt).toLocaleDateString("pt-BR")}. O prazo reproduz a regra operacional informada pela Evolution Academia.</div>}{result.status==="FEE_PENDING"&&result.feePayment&&<div className="fee-payment-box"><h3>Pagamento da taxa</h3><div><span>Valor</span><b>{money.format(result.feePayment.amount)}</b></div>{result.feePayment.pixKey?<><div><span>PIX</span><b>{result.feePayment.pixKey}</b></div><small>Favorecido: {result.feePayment.pixName}</small></>:<small>A equipe informará a forma de pagamento cadastrada para a taxa.</small>}<label>Enviar comprovante<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setFeeReceipt(e.target.files?.[0]||null)}/></label>{feeReceipt&&<button className="btn primary" disabled={loading} onClick={uploadFeeReceipt}>{loading?"Enviando...":"Enviar comprovante"}</button>}{feeReceiptMessage&&<div className="info-box">{feeReceiptMessage}</div>}</div>}</div><div className="wizard-actions"><a className="btn primary" href="/">Concluir</a></div></div>;

  const pixRequired=Boolean(contract&&!contract.recurring&&(preview?.calculation?.estimatedRefund||0)>0);
  return <div className="wizard-card glass">
    <div className="wizard-head"><div><p className="eyebrow">CANCELAMENTO ONLINE</p><h1>Cancelar contrato</h1><small>Identidade confirmada por e-mail cadastrado no EVO + código de uso único.</small></div><span className="simple-progress-label">{steps[step]}</span></div>
    <div className="stepper clean-stepper" style={{gridTemplateColumns:`repeat(${steps.length},1fr)`}}>{steps.map((s,i)=><div className={i<=step?"active":""} key={s}><i/><span>{s}</span></div>)}</div>
    <div className="wizard-body">{error&&<div className="error-box">{error}</div>}
      {step===0&&contract&&<><div className="welcome-line">Olá, <b>{customerName.split(" ")[0]}</b>. Confira os dados do contrato vindos do EVO/W12.</div><div className="contract-card selected"><span>CONTRATO ATIVO</span><h3>{contract.planName}</h3><p><b>Unidade:</b> {contract.unit}</p><p><b>Início:</b> {new Date(contract.startDate).toLocaleDateString("pt-BR")}</p><p><b>Tipo:</b> {contract.recurring?"Recorrente":"Anual"}</p>{contract.amountPaid>0&&<strong>Valor do plano: {money.format(contract.amountPaid)}</strong>}</div></>}
      {step===1&&<><label>Motivo do cancelamento</label><div className="choice-grid">{Object.keys(reasonMap).map(r=><button type="button" className={reason===r?"selected":""} onClick={()=>setReason(r)} key={r}>{r}</button>)}</div>{reason==="Outro"&&<label>Descreva o motivo<textarea value={reasonDetails} maxLength={1000} onChange={e=>setReasonDetails(e.target.value)} required/></label>}<label>Data solicitada para o cancelamento<input type="date" value={desiredDate} onChange={e=>setDesiredDate(e.target.value)}/></label></>}
      {step===2&&<>{preview?.kind==="ANNUAL"&&preview.eligible&&preview.calculation?<div className="calc-panel"><p className="eyebrow">CÁLCULO DO PLANO ANUAL</p><div><span>Valor total do plano</span><b>{money.format(preview.calculation.totalContractValue)}</b></div><div><span>Valor mensal de referência</span><b>{money.format(preview.calculation.monthlyReference)}</b></div><div><span>Meses utilizados</span><b>{preview.calculation.monthsUsed}</b></div><div><span>Meses restantes</span><b>{preview.calculation.monthsRemaining}</b></div><div><span>Saldo dos meses restantes</span><b>{money.format(preview.calculation.unusedBalance)}</b></div><div><span>14,4% sobre o valor total</span><b>- {money.format(preview.calculation.advanceDeduction)}</b></div><div><span>10% sobre o valor total</span><b>- {money.format(preview.calculation.contractFee)}</b></div><hr/><div className="total"><span>Estorno previsto</span><b>{money.format(preview.calculation.estimatedRefund)}</b></div><small>Cálculo com base nos dados do contrato consultados no EVO. A equipe confere eventuais divergências antes do pagamento.</small></div>:preview?.kind==="RECURRING"?<div className="calc-panel"><p className="eyebrow">PLANO RECORRENTE</p><div><span>Estorno</span><b>Não se aplica</b></div><div><span>Taxa de cancelamento</span><b>{money.format(preview.feeAmount||0)}</b></div><hr/><p>{preview.reason}</p></div>:<div className="info-box">{preview?.reason||"Os valores serão conferidos antes da conclusão."}</div>}</>}
      {step===3&&<>{!protocol?<><div className="term-box"><h3>Dados obrigatórios do termo oficial</h3><p>O CPF já foi validado no EVO. Informe RG, endereço e PIX quando houver estorno.</p></div><label>RG<input value={rg} maxLength={40} onChange={e=>setRg(e.target.value)} placeholder="RG do contratante" required/></label><label>Endereço completo<input value={address} maxLength={240} onChange={e=>setAddress(e.target.value)} placeholder="Logradouro, número, complemento, bairro, cidade/UF" required/></label>{pixRequired&&<label>Chave PIX para receber o estorno<input value={pixKey} maxLength={180} onChange={e=>setPixKey(e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" required/></label>}<label className="check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Li as condições apresentadas e confirmo que desejo solicitar o cancelamento. Estou ciente de que o termo assinado ficará vinculado ao protocolo e à trilha de auditoria.</span></label></>:<div className="download-panel"><h3>Termo oficial pronto</h3><b>Protocolo #{protocol}</b><a className="btn primary" href={termUrl}>Baixar termo em PDF</a><span>Assine o documento e envie o arquivo assinado na próxima etapa.</span>{refundDueAt&&<small>Estorno, quando aplicável: prazo operacional registrado até {new Date(refundDueAt).toLocaleDateString("pt-BR")}.</small>}</div>}</>}
      {step===4&&<>{alreadySigned?<div className="upload-zone"><p className="eyebrow">DOCUMENTO RECEBIDO</p><h3>Termo assinado recebido</h3><p>Finalize para registrar sua solicitação.</p></div>:<div className="upload-zone"><p className="eyebrow">ENVIAR TERMO ASSINADO</p><h3>Selecione o arquivo</h3><p>PDF, JPG ou PNG • até 8 MB</p><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setSignedFile(e.target.files?.[0]||null)}/>{signedFile&&<b>{signedFile.name}</b>}</div>}</>}
    </div>
    <div className="wizard-actions"><button className="btn secondary" disabled={step===0||loading} onClick={()=>setStep(Math.max(0,step-1))}>Voltar</button>
      {step===0&&<button className="btn primary" disabled={contract?.status!=="ACTIVE"} onClick={()=>setStep(1)}>Continuar</button>}
      {step===1&&<button className="btn primary" disabled={!desiredDate||loading||(reason==="Outro"&&!reasonDetails.trim())} onClick={loadPreview}>{loading?"Calculando...":"Ver valores"}</button>}
      {step===2&&<button className="btn primary" onClick={()=>setStep(3)}>Continuar</button>}
      {step===3&&!protocol&&<button className="btn primary" disabled={!accepted||!address.trim()||!rg.trim()||(pixRequired&&!pixKey.trim())||loading} onClick={generateTerm}>{loading?"Gerando...":"Gerar termo oficial"}</button>}
      {step===3&&protocol&&<button className="btn primary" onClick={()=>setStep(4)}>Enviar termo assinado</button>}
      {step===4&&!alreadySigned&&signedFile&&<button className="btn primary" disabled={loading} onClick={uploadAndFinalize}>{loading?"Enviando...":"Enviar e finalizar"}</button>}{step===4&&alreadySigned&&protocol&&<button className="btn primary" disabled={loading} onClick={finalizeExisting}>{loading?"Finalizando...":"Finalizar solicitação"}</button>}
    </div>
  </div>;
}

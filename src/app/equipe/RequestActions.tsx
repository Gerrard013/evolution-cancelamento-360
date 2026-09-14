"use client";

import { useState } from "react";

export default function RequestActions({id,status,fee,estimatedRefund}:{id:string;status:string;fee:number;estimatedRefund:number}){
  const [loading,setLoading]=useState(false); const [message,setMessage]=useState("");
  async function decision(decision:string){
    setLoading(true);setMessage("");
    try{const r=await fetch(`/api/admin/requests/${id}/decision`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Não foi possível concluir.");setMessage(d.message||"Ação concluída.");setTimeout(()=>location.reload(),700)}catch(e){setMessage(e instanceof Error?e.message:"Falha")}finally{setLoading(false)}
  }
  async function refund(){
    if(estimatedRefund<=0)return;
    setLoading(true);setMessage("");
    try{const r=await fetch(`/api/admin/requests/${id}/refund`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({approvedAmount:estimatedRefund,executedAmount:estimatedRefund,method:"PIX",transactionRef:""})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Não foi possível registrar.");setMessage("Estorno registrado.");setTimeout(()=>location.reload(),700)}catch(e){setMessage(e instanceof Error?e.message:"Falha")}finally{setLoading(false)}
  }
  return <div className="request-actions">
    {status==="FEE_PENDING"&&<button disabled={loading} onClick={()=>decision("CONFIRM_FEE_PAID")}>Confirmar taxa paga {fee>0?`(R$ ${fee.toFixed(2).replace(".",",")})`:""}</button>}
    {["READY_TO_CANCEL","MANUAL_REVIEW","UNDER_REVIEW","SIGNED_RECEIVED"].includes(status)&&<button className="primary-mini" disabled={loading} onClick={()=>decision("EXECUTE_CANCEL")}>Cancelar contrato</button>}
    {status==="MANUAL_REVIEW"&&<button disabled={loading} onClick={()=>decision("CONFIRM_MANUAL_CANCELLED")}>Confirmar cancelado no EVO</button>}
    {status==="REFUND_PENDING"&&estimatedRefund>0&&<button className="primary-mini" disabled={loading} onClick={refund}>Registrar estorno pago</button>}
    {message&&<small>{message}</small>}
  </div>
}

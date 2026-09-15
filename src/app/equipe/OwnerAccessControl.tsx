"use client";

import { useEffect, useState } from "react";

type StaffRole="ADMIN"|"MANAGER"|"FINANCE"|"ANALYST"|"ATTENDANCE"|"AUDITOR"|"OWNER";
type UserRow={id:string;name:string;username:string|null;email:string;role:StaffRole;unit:string|null;active:boolean;lastLoginAt:string|null;createdAt:string};
const roleLabels:Record<StaffRole,string>={OWNER:"Proprietário",ADMIN:"Administrador",MANAGER:"Gestor",FINANCE:"Financeiro",ANALYST:"Analista",ATTENDANCE:"Atendimento",AUDITOR:"Auditoria"};

export default function OwnerAccessControl(){
  const [users,setUsers]=useState<UserRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [form,setForm]=useState({name:"",username:"",email:"",password:"",role:"ATTENDANCE" as Exclude<StaffRole,"OWNER">,unit:""});

  async function load(){
    setLoading(true);setError("");
    try{const r=await fetch("/api/admin/users",{cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Falha ao listar acessos.");setUsers(d.users||[])}catch(e){setError(e instanceof Error?e.message:"Falha ao listar acessos.")}finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[]);

  async function createUser(e:React.FormEvent){
    e.preventDefault();setError("");setMessage("");
    try{const r=await fetch("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Falha ao criar acesso.");setMessage(`Acesso de ${form.name} criado.`);setForm({name:"",username:"",email:"",password:"",role:"ATTENDANCE",unit:""});await load()}catch(e){setError(e instanceof Error?e.message:"Falha ao criar acesso.")}
  }

  async function revoke(user:UserRow){
    if(user.role==="OWNER")return;
    if(!confirm(`Revogar imediatamente o acesso de ${user.name}?`))return;
    setError("");setMessage("");
    try{const r=await fetch("/api/admin/users",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:user.id,active:false})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Falha ao revogar acesso.");setMessage(`Acesso de ${user.name} revogado.`);await load()}catch(e){setError(e instanceof Error?e.message:"Falha ao revogar acesso.")}
  }

  async function reactivate(user:UserRow){
    if(user.role==="OWNER")return;
    setError("");setMessage("");
    try{const r=await fetch("/api/admin/users",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:user.id,active:true})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Falha ao reativar acesso.");setMessage(`Acesso de ${user.name} reativado.`);await load()}catch(e){setError(e instanceof Error?e.message:"Falha ao reativar acesso.")}
  }

  return <section className="finance-zone" id="acessos">
    <div className="finance-card">
      <p className="eyebrow">ÁREA EXCLUSIVA DO PROPRIETÁRIO</p>
      <h2>Controle de acessos</h2>
      <p>Somente o perfil OWNER pode criar, reativar ou revogar usuários. O acesso proprietário não pode ser removido por esta tela.</p>
      {error&&<div className="error-box">{error}</div>}{message&&<div className="info-box">{message}</div>}
      <div className="refund-list">
        {loading?<div className="finance-empty">Carregando acessos...</div>:users.map(user=><div className="refund-row" key={user.id}>
          <div><strong>{user.name}</strong><small>{user.username||"sem usuário"} • {user.email} • {roleLabels[user.role]}</small>{user.lastLoginAt&&<small>Último acesso: {new Date(user.lastLoginAt).toLocaleString("pt-BR")}</small>}</div>
          <span className={`refund-status ${user.active?"paid":"pending"}`}>{user.active?"ATIVO":"REVOGADO"}</span>
          {user.role!=="OWNER"&&(user.active?<button className="btn secondary" type="button" onClick={()=>revoke(user)}>Revogar</button>:<button className="btn primary" type="button" onClick={()=>reactivate(user)}>Reativar</button>)}
        </div>)}
      </div>
    </div>
    <form className="finance-card" onSubmit={createUser}>
      <p className="eyebrow">NOVO ACESSO</p><h3>Criar usuário autorizado</h3>
      <label>Nome<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></label>
      <label>Usuário<input value={form.username} onChange={e=>setForm({...form,username:e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,"")})} required/></label>
      <label>E-mail<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/></label>
      <label>Senha inicial (mín. 14 caracteres)<input type="password" minLength={14} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required autoComplete="new-password"/></label>
      <label>Perfil<select value={form.role} onChange={e=>setForm({...form,role:e.target.value as Exclude<StaffRole,"OWNER">})}><option value="ATTENDANCE">Atendimento</option><option value="FINANCE">Financeiro</option><option value="ANALYST">Analista</option><option value="MANAGER">Gestor</option><option value="AUDITOR">Auditoria</option><option value="ADMIN">Administrador</option></select></label>
      <label>Unidade (opcional)<input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} placeholder="Condor, Umarizal ou ambas"/></label>
      <button className="btn primary" type="submit">Criar acesso</button>
    </form>
  </section>;
}

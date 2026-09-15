"use client";

import { useState } from "react";

type Staff = { id:string; name:string; email:string; username:string|null; role:string; unit:string|null; active:boolean; lastLoginAt:string|null; createdAt:string };
const roles = ["ATTENDANCE","ANALYST","FINANCE","MANAGER","ADMIN","AUDITOR"] as const;
const labels:Record<string,string>={ATTENDANCE:"Atendimento",ANALYST:"Analista",FINANCE:"Financeiro",MANAGER:"Gestor",ADMIN:"Administrador",AUDITOR:"Auditor"};

export default function StaffManager({initialUsers}:{initialUsers:Staff[]}) {
  const [users,setUsers]=useState(initialUsers);
  const [form,setForm]=useState({name:"",email:"",username:"",password:"",role:"ATTENDANCE",unit:""});
  const [error,setError]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(false);

  async function call(method:string,body:unknown){
    const r=await fetch("/api/owner/staff",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||"Operação não concluída.");
    return d;
  }

  async function create(e:React.FormEvent){
    e.preventDefault();setError("");setMessage("");setLoading(true);
    try{
      const d=await call("POST",form);
      setUsers(prev=>[d.user,...prev]);
      setForm({name:"",email:"",username:"",password:"",role:"ATTENDANCE",unit:""});
      setMessage("Acesso criado. O proprietário poderá revogá-lo a qualquer momento.");
    }catch(e){setError(e instanceof Error?e.message:"Falha ao criar acesso.")}finally{setLoading(false)}
  }

  async function toggle(user:Staff){
    if(user.active&&!confirm(`Revogar agora o acesso de ${user.name}? A sessão atual também será invalidada.`))return;
    setError("");setMessage("");setLoading(true);
    try{
      const d=await call("PATCH",{id:user.id,active:!user.active});
      setUsers(prev=>prev.map(x=>x.id===user.id?d.user:x));
      setMessage(user.active?"Acesso revogado imediatamente.":"Acesso reativado.");
    }catch(e){setError(e instanceof Error?e.message:"Falha ao alterar acesso.")}finally{setLoading(false)}
  }

  async function resetPassword(user:Staff){
    const password=prompt(`Nova senha de ${user.name} (mínimo 14 caracteres):`);
    if(!password)return;
    if(password.length<14){setError("A nova senha precisa ter pelo menos 14 caracteres.");return;}
    setError("");setMessage("");setLoading(true);
    try{
      const d=await call("PATCH",{id:user.id,password});
      setUsers(prev=>prev.map(x=>x.id===user.id?d.user:x));
      setMessage("Senha alterada e todas as sessões anteriores foram invalidadas.");
    }catch(e){setError(e instanceof Error?e.message:"Falha ao trocar senha.")}finally{setLoading(false)}
  }

  return <div className="ops-main">
    <header className="ops-header"><div><p className="eyebrow">ÁREA EXCLUSIVA DO PROPRIETÁRIO</p><h1>Segurança e acessos</h1><p className="header-help">Somente o proprietário pode criar, reativar, revogar ou redefinir acessos da equipe.</p></div></header>
    {error&&<div className="error-box">{error}</div>}{message&&<div className="info-box">{message}</div>}

    <section className="finance-card">
      <p className="eyebrow">NOVO ACESSO</p><h2>Autorizar uma pessoa</h2>
      <form onSubmit={create} className="admin-form-grid">
        <label>Nome<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></label>
        <label>E-mail<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/></label>
        <label>Usuário<input value={form.username} onChange={e=>setForm({...form,username:e.target.value.replace(/[^A-Za-z0-9._-]/g,"")})} required/></label>
        <label>Senha inicial<input type="password" minLength={14} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/></label>
        <label>Permissão<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{roles.map(r=><option value={r} key={r}>{labels[r]}</option>)}</select></label>
        <label>Unidade<input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} placeholder="Condor, Umarizal ou ambas"/></label>
        <button className="btn primary" disabled={loading}>{loading?"Salvando...":"Criar acesso"}</button>
      </form>
    </section>

    <section className="queue glass full-queue">
      <div className="section-title"><div><p className="eyebrow">ACESSOS DA EQUIPE</p><h2>Quem pode entrar</h2></div></div>
      <div className="queue-table friendly-table">
        <div className="tr th"><span>Pessoa</span><span>Usuário</span><span>Permissão</span><span>Unidade</span><span>Status</span><span>Ações</span></div>
        {users.length===0?<div className="empty-state">Nenhum acesso de equipe criado. O proprietário continua com acesso exclusivo.</div>:users.map(u=><div className="tr" key={u.id}>
          <span><b>{u.name}</b><small>{u.email}</small></span>
          <span>{u.username||"—"}<small>{u.lastLoginAt?`Último acesso ${new Date(u.lastLoginAt).toLocaleString("pt-BR")}`:"Nunca acessou"}</small></span>
          <span>{labels[u.role]||u.role}</span><span>{u.unit||"Todas"}</span>
          <span><i className="badge">{u.active?"ATIVO":"REVOGADO"}</i></span>
          <span><button className="btn secondary" type="button" disabled={loading} onClick={()=>toggle(u)}>{u.active?"Revogar":"Reativar"}</button> <button className="btn secondary" type="button" disabled={loading||!u.active} onClick={()=>resetPassword(u)}>Trocar senha</button></span>
        </div>)}
      </div>
    </section>
  </div>;
}

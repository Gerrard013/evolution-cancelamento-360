import { prisma } from "@/lib/db/prisma";
import { requireOwnerPage } from "@/lib/auth/require-admin";
import StaffManager from "./StaffManager";

export default async function SegurancaPage(){
  await requireOwnerPage();
  const rows=await prisma.user.findMany({where:{role:{not:"OWNER"}},orderBy:[{active:"desc"},{name:"asc"}],select:{id:true,name:true,email:true,username:true,role:true,unit:true,active:true,lastLoginAt:true,createdAt:true}});
  const users=rows.map(u=>({...u,role:String(u.role),lastLoginAt:u.lastLoginAt?.toISOString()||null,createdAt:u.createdAt.toISOString()}));
  return <main className="ops-shell simple-ops">
    <aside className="sidebar glass-dark simple-sidebar">
      <a href="/" className="ops-brand"><span className="brand-dot"/><b>EVOLUTION 360</b></a>
      <div className="side-summary"><span>Controle do proprietário</span><b>Segurança e acessos</b><small>Somente o proprietário pode administrar quem entra no sistema.</small></div>
      <nav><a href="/equipe">← Painel da equipe</a><a className="active">Segurança e acessos</a></nav>
      <div className="sidebar-foot"><small>NÍVEL DE ACESSO</small><b>PROPRIETÁRIO</b><span>Controle máximo</span></div>
    </aside>
    <StaffManager initialUsers={users}/>
  </main>;
}

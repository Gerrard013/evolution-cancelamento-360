import { prisma } from "@/lib/db/prisma";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { friendlyStatus } from "@/lib/ui/status";
import AdminTools from "./AdminTools";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default async function EquipePage() {
  const admin = await requireAdminPage();
  const rows = await prisma.cancellationRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      customer: { select: { displayName: true } },
      contract: { select: { planName: true } },
      calculations: { orderBy: { createdAt: "desc" }, take: 1 },
      attachments: { where: { type: "SIGNED_CANCELLATION_TERM" }, orderBy: { createdAt: "desc" }, take: 1 }
    }
  }).catch(() => []);

  const open = rows.filter(r => !["COMPLETED", "REJECTED", "EVO_CANCELLED", "CANCELLED_BY_CUSTOMER"].includes(r.status)).length;
  const waitingSignature = rows.filter(r => r.status === "AWAITING_SIGNATURE").length;
  const estimated = rows.reduce((sum, r) => sum + Number(r.calculations[0]?.estimatedRefund || 0), 0);

  return (
    <main className="ops-shell simple-ops">
      <aside className="sidebar glass-dark simple-sidebar">
        <a href="/" className="ops-brand"><span className="brand-dot"/><b>EVOLUTION 360</b></a>
        <div className="side-summary"><span>Central de cancelamentos</span><b>Condor • Umarizal</b><small>Atendimento, termos, análise e estorno.</small></div>
        <nav><a className="active">Painel da equipe</a></nav>
        <div className="sidebar-foot"><small>ACESSO DA EQUIPE</small><b>Administrador</b><span>{admin.sub}</span></div>
      </aside>

      <section className="ops-main">
        <header className="ops-header"><div><p className="eyebrow">CENTRAL DA EQUIPE</p><h1>Cancelamentos</h1><p className="header-help">Comece pesquisando o aluno pela matrícula EVO. O restante do fluxo é guiado.</p></div><div className="ops-user"><span>EV</span></div></header>

        <div className="metric-grid compact-metrics">
          <article><small>EM ANDAMENTO</small><b>{open}</b><span>solicitações abertas</span></article>
          <article><small>AGUARDANDO ASSINATURA</small><b>{waitingSignature}</b><span>termos ainda não enviados</span></article>
          <article><small>ESTORNO EM PRÉVIA</small><b>{money(estimated)}</b><span>valor estimado, sujeito à conferência</span></article>
        </div>

        <AdminTools />

        <section className="queue glass full-queue">
          <div className="section-title"><div><p className="eyebrow">SOLICITAÇÕES RECENTES</p><h2>Acompanhar pedidos</h2><p className="section-help">Status em linguagem operacional, sem códigos internos.</p></div></div>
          <div className="queue-table friendly-table">
            <div className="tr th"><span>Protocolo</span><span>Aluno</span><span>Unidade / Plano</span><span>Status</span><span>Estorno</span></div>
            {rows.length === 0 ? <div className="empty-state">Nenhuma solicitação registrada ainda.</div> : rows.map((r) => {
              const amount = r.calculations[0]?.estimatedRefund ? Number(r.calculations[0].estimatedRefund) : null;
              return <div className="tr" key={r.protocol}><span><b>#{r.protocol}</b><small>{r.createdAt.toLocaleDateString("pt-BR")}</small></span><span>{r.customer.displayName}</span><span><b>{r.unit}</b><small>{r.contract.planName}</small></span><span><i className="badge">{friendlyStatus(r.status)}</i></span><span>{amount === null ? "—" : money(amount)}{r.attachments[0] ? <a className="doc-link" href={`/api/admin/documents/${r.attachments[0].id}`}>Baixar termo assinado</a> : null}</span></div>;
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

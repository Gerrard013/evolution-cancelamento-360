import { prisma } from "@/lib/db/prisma";
import { requireAdminPage } from "@/lib/auth/require-admin";
import AdminTools from "./AdminTools";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default async function EquipePage() {
  const admin = await requireAdminPage();
  const rows = await prisma.cancellationRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      customer: { select: { displayName: true } },
      contract: { select: { planName: true } },
      calculations: { orderBy: { createdAt: "desc" }, take: 1 },
      attachments: { where: { type: "SIGNED_CANCELLATION_TERM" }, orderBy: { createdAt: "desc" }, take: 1 }
    }
  }).catch(() => []);

  const open = rows.filter(r => !["COMPLETED", "REJECTED", "EVO_CANCELLED", "CANCELLED_BY_CUSTOMER"].includes(r.status)).length;
  const critical = rows.filter(r => r.slaDueAt && r.slaDueAt <= new Date(Date.now() + 24 * 60 * 60 * 1000) && !["COMPLETED", "REJECTED", "EVO_CANCELLED"].includes(r.status)).length;
  const estimated = rows.reduce((sum, r) => sum + Number(r.calculations[0]?.estimatedRefund || 0), 0);

  return (
    <main className="ops-shell">
      <aside className="sidebar glass-dark">
        <a href="/" className="ops-brand"><span className="brand-dot"/><b>EVOLUTION 360</b></a>
        <nav>
          <a className="active">◫ Visão geral</a><a>⇄ Solicitações</a><a>◉ SLA & Pendências</a><a>◈ Regras</a><a>▤ Relatórios</a><a>⌁ Auditoria</a><a>⚙ Configurações</a>
        </nav>
        <div className="sidebar-foot"><small>SEGURANÇA</small><b>Admin autenticado</b><span className="status-line"><i/> Sessão curta + cookie HttpOnly</span></div>
      </aside>

      <section className="ops-main">
        <header className="ops-header"><div><p className="eyebrow">CENTRAL DA EQUIPE</p><h1>Painel de cancelamentos</h1></div><div className="ops-user"><span>AD</span><div><b>Administrador</b><small>{admin.sub}</small></div></div></header>

        <div className="metric-grid">
          <article><small>EM ABERTO</small><b>{open}</b><span>fila atual</span></article>
          <article><small>SLA &lt; 24H</small><b>{critical}</b><span className={critical ? "danger" : ""}>prioridade operacional</span></article>
          <article><small>ESTORNO ESTIMADO</small><b>{money(estimated)}</b><span>somente prévias registradas</span></article>
          <article><small>PRIVACIDADE</small><b>ID</b><span>sem CPF no portal público</span></article>
        </div>

        <AdminTools />

        <div className="ops-grid">
          <section className="queue glass">
            <div className="section-title"><div><p className="eyebrow">FILA OPERACIONAL</p><h2>Solicitações</h2></div><button disabled>Últimas 20</button></div>
            <div className="queue-table">
              <div className="tr th"><span>Protocolo</span><span>Cliente</span><span>Status</span><span>SLA</span><span>Valor</span></div>
              {rows.length === 0 ? <div className="empty-state">Nenhuma solicitação registrada ainda.</div> : rows.map((r, idx) => {
                const amount = r.calculations[0]?.estimatedRefund ? Number(r.calculations[0].estimatedRefund) : null;
                const priority = r.slaDueAt && r.slaDueAt <= new Date(Date.now() + 24 * 60 * 60 * 1000) ? "critical" : "normal";
                return <div className={`tr ${idx === 0 ? "selected" : ""}`} key={r.protocol}><span><b>#{r.protocol}</b><small>{r.unit} • {r.contract.planName}</small></span><span>{r.customer.displayName}</span><span><i className={`badge ${priority}`}>{r.status}</i></span><span>{r.slaDueAt ? r.slaDueAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</span><span>{amount === null ? "—" : money(amount)}{r.attachments[0] ? <a className="doc-link" href={`/api/admin/documents/${r.attachments[0].id}`}>Termo assinado</a> : null}</span></div>;
              })}
            </div>
          </section>

          <aside className="case-detail glass-dark">
            <div className="detail-top"><div><p className="eyebrow">CONTROLES ATIVOS</p><h2>Hardening</h2></div><span className="badge">v2</span></div>
            <div className="person-card"><b>API EVO somente no backend</b><span>Token em variável secreta do Railway</span><small>Nenhuma chave usa prefixo NEXT_PUBLIC_</small></div>
            <div className="timeline-mini"><div className="done"><i/>ID público pseudônimo<span>LGPD</span></div><div className="done"><i/>Rate limit + origem confiável<span>API</span></div><div className="done"><i/>PDF/JPG/PNG privado + hash SHA-256<span>DOC</span></div><div className="done"><i/>CSP + HSTS + anti-clickjacking<span>WEB</span></div><div className="active"><i/>Escrita EVO somente por feature flag<span>SAFE</span></div></div>
            <div className="calc-mini"><div><span>Upload do termo</span><b>Protegido</b></div><div><span>Estorno automático</span><b>Bloqueado</b></div><hr/><div><span>Cancelamento direto</span><strong>Homologável</strong></div><small>Somente ativa quando endpoint e regra do EVO estiverem confirmados.</small></div>
          </aside>
        </div>
      </section>
    </main>
  );
}

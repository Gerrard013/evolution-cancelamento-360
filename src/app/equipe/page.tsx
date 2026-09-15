import { prisma } from "@/lib/db/prisma";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { friendlyStatus } from "@/lib/ui/status";
import AdminTools from "./AdminTools";
import RequestActions from "./RequestActions";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Belem" }).format(value);
}

function actorFrom(events: Array<{ action: string; after: unknown }>) {
  const event = events.find(e => e.action === "REFUND_REGISTERED");
  const after = event?.after;
  if (after && typeof after === "object" && !Array.isArray(after)) {
    const by = (after as Record<string, unknown>).by;
    if (typeof by === "string" && by.trim()) return by;
  }
  return "Equipe Evolution";
}

export default async function EquipePage() {
  const admin = await requireAdminPage();
  const isOwner = admin.role === "OWNER";
  const rows = await prisma.cancellationRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      customer: { select: { displayName: true } },
      contract: { select: { planName: true } },
      calculations: { orderBy: { createdAt: "desc" }, take: 1 },
      refund: true,
      events: { where: { action: { in: ["REFUND_REGISTERED", "REFUND_RECEIPT_UPLOADED"] } }, orderBy: { createdAt: "desc" }, take: 6 },
      attachments: { where: { type: { in: ["SIGNED_CANCELLATION_TERM", "CANCELLATION_FEE_RECEIPT", "REFUND_RECEIPT"] } }, orderBy: { createdAt: "desc" } }
    }
  }).catch(() => []);

  const open = rows.filter(r => !["COMPLETED", "REJECTED", "EVO_CANCELLED", "CANCELLED_BY_CUSTOMER"].includes(r.status)).length;
  const waitingSignature = rows.filter(r => r.status === "AWAITING_SIGNATURE").length;
  const readyForOwner = rows.filter(r => ["READY_TO_CANCEL", "MANUAL_REVIEW", "UNDER_REVIEW", "SIGNED_RECEIVED"].includes(r.status)).length;
  const estimated = rows.reduce((sum, r) => sum + Number(r.calculations[0]?.estimatedRefund || 0), 0);
  const pendingRefundRows = rows.filter(r => r.status === "REFUND_PENDING" && Number(r.calculations[0]?.estimatedRefund || 0) > 0);
  const paidRefundRows = rows.filter(r => Boolean(r.refund));
  const pendingRefundTotal = pendingRefundRows.reduce((sum, r) => sum + Number(r.calculations[0]?.estimatedRefund || 0), 0);
  const paidRefundTotal = paidRefundRows.reduce((sum, r) => sum + Number(r.refund?.executedAmount || 0), 0);

  return (
    <main className="ops-shell simple-ops">
      <aside className="sidebar glass-dark simple-sidebar">
        <a href="/" className="ops-brand"><span className="brand-dot"/><b>EVOLUTION 360</b></a>
        <div className="side-summary"><span>Central de cancelamentos</span><b>Condor • Umarizal</b><small>Protocolos, termos, taxas, validação final e estornos.</small></div>
        <nav>
          <a className="active">Painel da equipe</a>
          <a href="#financeiro">Financeiro / Estornos</a>
          <a href="#solicitacoes">Solicitações</a>
          {isOwner ? <a href="/equipe/seguranca">Segurança e acessos</a> : null}
        </nav>
        <div className="sidebar-foot"><small>{isOwner ? "ACESSO DO PROPRIETÁRIO" : "ACESSO DA EQUIPE"}</small><b>{isOwner ? "Ruy • OWNER" : admin.role}</b><span>{admin.sub}</span></div>
      </aside>

      <section className="ops-main">
        <header className="ops-header"><div><p className="eyebrow">CENTRAL DA EQUIPE</p><h1>Cancelamentos</h1><p className="header-help">O pedido só é cancelado no EVO depois da validação final do proprietário.</p></div><div className="ops-user"><span>EV</span></div></header>

        <div className="metric-grid compact-metrics">
          <article><small>EM ANDAMENTO</small><b>{open}</b><span>solicitações abertas</span></article>
          <article><small>AGUARDANDO ASSINATURA</small><b>{waitingSignature}</b><span>termos ainda não enviados</span></article>
          <article><small>VALIDAÇÃO FINAL</small><b>{readyForOwner}</b><span>aguardando conferência do Ruy</span></article>
          <article><small>ESTORNO EM PRÉVIA</small><b>{money(estimated)}</b><span>valor estimado, sujeito à conferência</span></article>
        </div>

        <AdminTools />

        <section className="finance-zone" id="financeiro">
          <div className="finance-card">
            <p className="eyebrow">CONTROLE FINANCEIRO</p>
            <h2>Estornos com rastreabilidade</h2>
            <p>O painel registra quem confirmou o pagamento, quando foi feito, valor, forma, referência e comprovante vinculado ao protocolo.</p>
            <div className="finance-kpis">
              <div className="finance-kpi warn"><small>A PAGAR</small><b>{money(pendingRefundTotal)}</b><span>{pendingRefundRows.length} estorno(s) pendente(s)</span></div>
              <div className="finance-kpi good"><small>JÁ PAGO</small><b>{money(paidRefundTotal)}</b><span>{paidRefundRows.length} estorno(s) registrado(s)</span></div>
              <div className="finance-kpi info"><small>RASTREABILIDADE</small><b>100%</b><span>data + responsável + histórico</span></div>
            </div>
          </div>

          <div className="finance-board">
            <article className="finance-card">
              <p className="eyebrow">PENDENTES</p><h3>Estornos a pagar</h3>
              <div className="refund-list">
                {pendingRefundRows.length === 0 ? <div className="finance-empty">Nenhum estorno pendente.</div> : pendingRefundRows.map(r => {
                  const amount = Number(r.calculations[0]?.estimatedRefund || 0);
                  return <div className="refund-row" key={`pending-${r.id}`}><div><strong>{r.customer.displayName}</strong><small>#{r.protocol} • {r.unit} • {r.contract.planName}</small></div><div className="refund-amount">{money(amount)}</div><span className="refund-status pending">AGUARDANDO PAGAMENTO</span></div>;
                })}
              </div>
            </article>

            <article className="finance-card">
              <p className="eyebrow">REALIZADOS</p><h3>Estornos já pagos</h3>
              <div className="refund-list">
                {paidRefundRows.length === 0 ? <div className="finance-empty">Nenhum estorno pago registrado ainda.</div> : paidRefundRows.slice(0, 8).map(r => {
                  const receipt = r.attachments.find(a => a.type === "REFUND_RECEIPT");
                  return <div className="refund-row" key={`paid-${r.id}`}><div><strong>{r.customer.displayName}</strong><small>#{r.protocol} • {dateTime(r.refund!.executedAt)} • por {actorFrom(r.events)}</small>{receipt ? <a className="finance-proof" href={`/api/admin/documents/${receipt.id}`}>↗ Ver comprovante</a> : <small>Comprovante ainda não anexado</small>}</div><div className="refund-amount">{money(Number(r.refund!.executedAmount))}<small>{r.refund!.method}{r.refund!.transactionRef ? ` • ${r.refund!.transactionRef}` : ""}</small></div><span className="refund-status paid">PAGO</span></div>;
                })}
              </div>
            </article>
          </div>
        </section>

        <section className="queue glass full-queue" id="solicitacoes">
          <div className="section-title"><div><p className="eyebrow">SOLICITAÇÕES RECENTES</p><h2>Acompanhar pedidos</h2><p className="section-help">O botão de cancelamento final aparece somente no acesso do proprietário.</p></div></div>
          <div className="queue-table friendly-table">
            <div className="tr th"><span>Protocolo</span><span>Aluno</span><span>Unidade / Plano</span><span>Status</span><span>Financeiro / Documentos</span><span>Ações</span></div>
            {rows.length === 0 ? <div className="empty-state">Nenhuma solicitação registrada ainda.</div> : rows.map((r) => {
              const amount = r.calculations[0]?.estimatedRefund ? Number(r.calculations[0].estimatedRefund) : null;
              const signed = r.attachments.find(a => a.type === "SIGNED_CANCELLATION_TERM");
              const feeReceipt = r.attachments.find(a => a.type === "CANCELLATION_FEE_RECEIPT");
              const refundReceipt = r.attachments.find(a => a.type === "REFUND_RECEIPT");
              return <div className="tr" key={r.protocol}>
                <span><b>#{r.protocol}</b><small>{r.createdAt.toLocaleDateString("pt-BR")}</small></span>
                <span>{r.customer.displayName}</span>
                <span><b>{r.unit}</b><small>{r.contract.planName}</small></span>
                <span><i className="badge">{friendlyStatus(r.status)}</i></span>
                <span>
                  {Number(r.cancellationFee) > 0 ? <small>Taxa: {money(Number(r.cancellationFee))}</small> : null}
                  {amount === null ? null : <b>Estorno previsto: {money(amount)}</b>}
                  {r.refund ? <div className="finance-paid-box"><b>✓ ESTORNO PAGO</b><span>{money(Number(r.refund.executedAmount))} • {dateTime(r.refund.executedAt)}</span><span>Responsável: {actorFrom(r.events)}</span><span>{r.refund.method}{r.refund.transactionRef ? ` • ${r.refund.transactionRef}` : ""}</span></div> : null}
                  {signed ? <a className="doc-link" href={`/api/admin/documents/${signed.id}`}>Termo assinado</a> : null}
                  {feeReceipt ? <a className="doc-link" href={`/api/admin/documents/${feeReceipt.id}`}>Comprovante da taxa</a> : null}
                  {refundReceipt ? <a className="doc-link" href={`/api/admin/documents/${refundReceipt.id}`}>Comprovante do estorno</a> : null}
                </span>
                <span><RequestActions id={r.id} status={r.status} fee={Number(r.cancellationFee)} estimatedRefund={amount || 0} refundRecorded={Boolean(r.refund)} hasRefundReceipt={Boolean(refundReceipt)} canFinalCancel={isOwner} /></span>
              </div>;
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

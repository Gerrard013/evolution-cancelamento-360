"use client";

import { useState } from "react";

function localDateTimeValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

type Props = {
  id: string;
  status: string;
  fee: number;
  estimatedRefund: number;
  refundRecorded?: boolean;
  hasRefundReceipt?: boolean;
  canFinalCancel?: boolean;
};

export default function RequestActions({ id, status, fee, estimatedRefund, refundRecorded = false, hasRefundReceipt = false, canFinalCancel = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showRefund, setShowRefund] = useState(false);
  const [showFinalValidation, setShowFinalValidation] = useState(false);
  const [noPendingDebtConfirmed, setNoPendingDebtConfirmed] = useState(false);
  const [dataConfirmed, setDataConfirmed] = useState(false);
  const [signedTermConfirmed, setSignedTermConfirmed] = useState(false);
  const [finalNote, setFinalNote] = useState("");
  const [amount, setAmount] = useState(String(estimatedRefund || 0));
  const [method, setMethod] = useState("PIX");
  const [reference, setReference] = useState("");
  const [executedAt, setExecutedAt] = useState(localDateTimeValue());
  const [receipt, setReceipt] = useState<File | null>(null);

  const finalChecksOk = noPendingDebtConfirmed && dataConfirmed && signedTermConfirmed;

  async function decision(decision: string, includeFinalChecks = false) {
    setLoading(true); setMessage("");
    try {
      const r = await fetch(`/api/admin/requests/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          note: includeFinalChecks ? finalNote.trim() : undefined,
          noPendingDebtConfirmed: includeFinalChecks ? noPendingDebtConfirmed : undefined,
          dataConfirmed: includeFinalChecks ? dataConfirmed : undefined,
          signedTermConfirmed: includeFinalChecks ? signedTermConfirmed : undefined
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Não foi possível concluir.");
      setMessage(d.message || "Ação concluída.");
      setTimeout(() => location.reload(), 900);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(false); }
  }

  async function uploadRefundReceipt(file: File) {
    const form = new FormData();
    form.append("file", file);
    const r = await fetch(`/api/admin/requests/${id}/refund-receipt`, { method: "POST", body: form });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Estorno registrado, mas o comprovante não foi anexado.");
  }

  async function refund() {
    const numericAmount = Number(String(amount).replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount < 0) { setMessage("Informe um valor válido."); return; }
    if (!executedAt) { setMessage("Informe a data do estorno."); return; }

    setLoading(true); setMessage("");
    try {
      const r = await fetch(`/api/admin/requests/${id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvedAmount: estimatedRefund,
          executedAmount: numericAmount,
          method,
          transactionRef: reference.trim(),
          executedAt: new Date(executedAt).toISOString()
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Não foi possível registrar o estorno.");
      if (receipt) await uploadRefundReceipt(receipt);
      setMessage("Estorno pago e registrado com responsável, data e histórico.");
      setTimeout(() => location.reload(), 900);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(false); }
  }

  async function receiptOnly() {
    if (!receipt) { setMessage("Selecione o comprovante."); return; }
    setLoading(true); setMessage("");
    try {
      await uploadRefundReceipt(receipt);
      setMessage("Comprovante anexado ao protocolo.");
      setTimeout(() => location.reload(), 700);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(false); }
  }

  const cancellableStatus = ["READY_TO_CANCEL", "MANUAL_REVIEW", "UNDER_REVIEW", "SIGNED_RECEIVED"].includes(status);

  return <div className="request-actions">
    {status === "FEE_PENDING" && <button disabled={loading} onClick={() => decision("CONFIRM_FEE_PAID")}>Confirmar taxa paga {fee > 0 ? `(R$ ${fee.toFixed(2).replace(".", ",")})` : ""}</button>}

    {cancellableStatus && canFinalCancel && !showFinalValidation &&
      <button className="primary-mini" disabled={loading} onClick={() => setShowFinalValidation(true)}>Validação final do Ruy</button>}

    {cancellableStatus && !canFinalCancel &&
      <small>Aguardando validação final do proprietário.</small>}

    {cancellableStatus && canFinalCancel && showFinalValidation && <div className="refund-editor final-validation-box">
      <strong>Última validação antes do cancelamento</strong>
      <small>O cancelamento só será executado depois que o proprietário confirmar os três itens abaixo.</small>
      <label className="check"><input type="checkbox" checked={noPendingDebtConfirmed} onChange={e=>setNoPendingDebtConfirmed(e.target.checked)}/><span>Conferi no EVO/W12 e não há pendência financeira que impeça a rescisão.</span></label>
      <label className="check"><input type="checkbox" checked={dataConfirmed} onChange={e=>setDataConfirmed(e.target.checked)}/><span>Conferi aluno, contrato, plano, unidade, valores e regra aplicável.</span></label>
      <label className="check"><input type="checkbox" checked={signedTermConfirmed} onChange={e=>setSignedTermConfirmed(e.target.checked)}/><span>Conferi o termo assinado e autorizo a conclusão deste protocolo.</span></label>
      <label>Observação final<textarea value={finalNote} maxLength={1000} onChange={e=>setFinalNote(e.target.value)} placeholder="Opcional: registre alguma observação da conferência"/></label>
      <div className="refund-editor-actions">
        <button onClick={()=>setShowFinalValidation(false)} disabled={loading}>Voltar</button>
        {status === "MANUAL_REVIEW" && <button disabled={loading || !finalChecksOk} onClick={()=>decision("CONFIRM_MANUAL_CANCELLED", true)}>Confirmar cancelado manualmente no EVO</button>}
        <button className="primary-mini" disabled={loading || !finalChecksOk} onClick={()=>decision("EXECUTE_CANCEL", true)}>{loading?"Processando...":"Autorizar cancelamento no EVO"}</button>
      </div>
    </div>}

    {status === "REFUND_PENDING" && estimatedRefund > 0 && !showRefund &&
      <button className="primary-mini" disabled={loading} onClick={() => setShowRefund(true)}>Registrar estorno pago</button>}

    {status === "REFUND_PENDING" && estimatedRefund > 0 && showRefund && <div className="refund-editor">
      <label>Valor previsto<input value={`R$ ${estimatedRefund.toFixed(2).replace(".", ",")}`} disabled /></label>
      <label>Valor realmente pago<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))} /></label>
      <label>Data e hora do estorno<input type="datetime-local" value={executedAt} onChange={e => setExecutedAt(e.target.value)} /></label>
      <label>Forma de pagamento<select value={method} onChange={e => setMethod(e.target.value)}><option>PIX</option><option>Cartão</option><option>Transferência</option><option>Dinheiro</option><option>Outro</option></select></label>
      <label>Referência / NSU / ID<input value={reference} onChange={e => setReference(e.target.value)} placeholder="Opcional" /></label>
      <label>Comprovante (PDF, JPG ou PNG)<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setReceipt(e.target.files?.[0] || null)} /></label>
      <div className="refund-editor-actions"><button onClick={() => setShowRefund(false)} disabled={loading}>Voltar</button><button className="primary-mini" onClick={refund} disabled={loading}>{loading ? "Registrando..." : "Confirmar pagamento"}</button></div>
    </div>}

    {refundRecorded && !hasRefundReceipt && <div className="refund-editor">
      <label>Adicionar comprovante do estorno<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setReceipt(e.target.files?.[0] || null)} /></label>
      <button className="primary-mini" disabled={loading || !receipt} onClick={receiptOnly}>{loading ? "Enviando..." : "Anexar comprovante"}</button>
    </div>}

    {message && <small>{message}</small>}
  </div>;
}

"use client";

import { useEffect, useMemo, useState } from "react";

type ContractView = {
  id: string;
  unit: string;
  planName: string;
  planType: string;
  startDate: string;
  endDate?: string | null;
  amountPaid: number;
  recurring: boolean;
  status: string;
};

type Preview = {
  eligible: boolean;
  reason?: string;
  rule?: { version: string; name: string; percentage: number };
  calculation?: { unusedBalance: number; deduction: number; estimatedRefund: number };
};

const steps = ["Acesso", "Contrato", "Motivo", "Termo", "Prévia"];
const reasonMap: Record<string, string> = {
  Mudança: "MUDANCA",
  Financeiro: "FINANCEIRO",
  Saúde: "SAUDE",
  Horário: "HORARIO",
  Atendimento: "ATENDIMENTO",
  Outro: "OUTRO"
};

export default function ClientWizard() {
  const [step, setStep] = useState(0);
  const [accessId, setAccessId] = useState("");
  const [contract, setContract] = useState<ContractView | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [reason, setReason] = useState("Mudança");
  const [reasonDetails, setReasonDetails] = useState("");
  const [desiredDate, setDesiredDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [accepted, setAccepted] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<Array<{ protocol: string; status: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ protocol: string; status: string; message: string } | null>(null);
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  const money = useMemo(() => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }), []);

  async function openAccess() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/public/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Acesso inválido");
      const me = await fetch("/api/public/me", { cache: "no-store" });
      const meData = await me.json();
      if (!me.ok) throw new Error(meData.error || "Contrato não encontrado");
      setCustomerName(meData.customer.displayName);
      setContract(meData.contract);
      const statusResponse = await fetch("/api/public/status", { cache: "no-store" });
      if (statusResponse.ok) { const statusData = await statusResponse.json(); setHistory(statusData.items || []); }
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível validar o acesso");
    } finally {
      setLoading(false);
    }
  }

  async function loadPreview() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/public/refund-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desiredDate })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível calcular a prévia");
      setPreview(data);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na prévia");
    } finally {
      setLoading(false);
    }
  }

  async function submitCancellation() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/public/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reasonCode: reasonMap[reason],
          reasonDetails: reason === "Outro" ? reasonDetails : undefined,
          desiredDate,
          termVersion: "EV-CAN-2026.09-v1",
          accepted: true
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar o pedido");
      setResult({ protocol: data.protocol, status: data.status, message: data.message });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar o pedido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (step < 4) setPreview(null);
  }, [step, desiredDate]);

  if (result) {
    return (
      <div className="wizard-card glass">
        <div className="wizard-head">
          <div><p className="eyebrow">PROTOCOLO GERADO</p><h1>Pedido registrado</h1></div>
          <span className="system-chip">{result.status}</span>
        </div>
        <div className="wizard-body">
          <div className="protocol-preview success-panel">
            <span>Seu protocolo</span>
            <b>#{result.protocol}</b>
            <span>{result.message}</span>
          </div>
          <div className="info-box">Guarde este protocolo. O sistema não exibirá CPF e não pede dados de cartão. O estorno exibido é uma prévia; a execução financeira continua sob controles de aprovação.</div>
        </div>
        <div className="wizard-actions"><a className="btn primary" href="/">Concluir</a></div>
      </div>
    );
  }

  return (
    <div className="wizard-card glass">
      <div className="wizard-head">
        <div><p className="eyebrow">PORTAL DO CLIENTE</p><h1>Cancelar contrato</h1></div>
        <span className="system-chip">Etapa {step + 1} de {steps.length}</span>
      </div>
      <div className="stepper">{steps.map((s, i) => <div className={i <= step ? "active" : ""} key={s}><i /> <span>{s}</span></div>)}</div>

      <div className="wizard-body">
        {error && <div className="error-box" role="alert">{error}</div>}
        {step === 0 && <>
          <label>ID de acesso<input autoComplete="off" value={accessId} onChange={e => setAccessId(e.target.value.toUpperCase())} placeholder="Ex.: EV-ABCD-EFGH-JKLM-NPQR" /></label>
          <div className="info-box">Por privacidade, este portal não solicita CPF. Use o ID de acesso temporário fornecido pela equipe. Ele é pseudônimo, expira e é protegido contra tentativas repetidas.</div>
          {demo && <div className="connector-note"><b>Modo demonstração</b><span>Use <strong>EV-DEMO-2026</strong> apenas em ambiente local de demonstração.</span></div>}
        </>}
        {step === 1 && contract && <>
          <div className="contract-card selected"><span>CONTRATO {contract.status}</span><h3>{contract.planName}</h3><p>{contract.unit} • {contract.endDate ? `Vigência até ${new Date(contract.endDate).toLocaleDateString("pt-BR")}` : "Vigência em conferência"}</p><strong>{money.format(contract.amountPaid)} pagos</strong></div>
          <div className="connector-note"><b>Olá, {customerName.split(" ")[0]}</b><span>Somente os dados mínimos do contrato são exibidos. A chave da API EVO permanece apenas no servidor.</span></div>
          {history.length > 0 && <div className="history-box"><b>Última solicitação</b><span>#{history[0].protocol} • {history[0].status}</span><small>{new Date(history[0].createdAt).toLocaleString("pt-BR")}</small></div>}
        </>}
        {step === 2 && <>
          <label>Qual o principal motivo?</label>
          <div className="choice-grid">{Object.keys(reasonMap).map(r => <button type="button" onClick={() => setReason(r)} className={reason === r ? "selected" : ""} key={r}>{r}</button>)}</div>
          {reason === "Outro" && <label>Detalhe opcional<textarea maxLength={1000} value={reasonDetails} onChange={e => setReasonDetails(e.target.value)} placeholder="Descreva apenas o necessário" /></label>}
          <label>Data desejada<input type="date" value={desiredDate} onChange={e => setDesiredDate(e.target.value)} /></label>
        </>}
        {step === 3 && <>
          <div className="term-box"><h3>Termo de solicitação de cancelamento</h3><p>Versão EV-CAN-2026.09-v1. O aceite fica ligado ao protocolo e à data/hora da solicitação.</p><p>Ao prosseguir, você confirma a intenção de cancelar o contrato selecionado e autoriza a análise das condições financeiras aplicáveis. A prévia de estorno não é promessa de pagamento até a validação final.</p></div>
          <label className="check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>Li e aceito o termo acima.</span></label>
        </>}
        {step === 4 && <>
          {preview?.eligible && preview.calculation ? <div className="calc-panel"><p className="eyebrow">PRÉVIA EXPLICÁVEL</p><div><span>Saldo não utilizado</span><b>{money.format(preview.calculation.unusedBalance)}</b></div><div><span>Dedução prevista na regra</span><b>- {money.format(preview.calculation.deduction)}</b></div><hr/><div className="total"><span>Estorno estimado</span><b>{money.format(preview.calculation.estimatedRefund)}</b></div><small>Regra {preview.rule?.version}. Valor sujeito à validação financeira e ao contrato vigente.</small></div> : <div className="info-box">{preview?.reason || "A prévia automática não está disponível para este contrato. O cancelamento pode ser solicitado e seguirá para conferência."}</div>}
          <div className="protocol-preview"><span>Ao confirmar, o sistema gera</span><b>Protocolo único + auditoria</b><span>Se a escrita EVO estiver homologada e habilitada, o cancelamento pode ser enviado automaticamente; caso contrário, cai em revisão manual.</span></div>
        </>}
      </div>

      <div className="wizard-actions">
        <button className="btn secondary" disabled={step === 0 || loading} onClick={() => setStep(Math.max(0, step - 1))}>Voltar</button>
        {step === 0 && <button className="btn primary" disabled={loading || accessId.trim().length < 8} onClick={openAccess}>{loading ? "Validando..." : "Acessar contrato"}</button>}
        {step === 1 && <button className="btn primary" disabled={loading || contract?.status !== "ACTIVE" || history.some(h => !["COMPLETED", "REJECTED", "EVO_CANCELLED", "CANCELLED_CONFIRMED", "CANCELLED_BY_CUSTOMER"].includes(h.status))} onClick={() => setStep(2)}>{contract?.status !== "ACTIVE" ? "Contrato não ativo" : history.some(h => !["COMPLETED", "REJECTED", "EVO_CANCELLED", "CANCELLED_CONFIRMED", "CANCELLED_BY_CUSTOMER"].includes(h.status)) ? "Solicitação já em andamento" : "Continuar"}</button>}
        {step === 2 && <button className="btn primary" disabled={loading || !desiredDate} onClick={() => setStep(3)}>Continuar</button>}
        {step === 3 && <button className="btn primary" disabled={loading || !accepted} onClick={loadPreview}>{loading ? "Calculando..." : "Ver prévia"}</button>}
        {step === 4 && <button className="btn primary" disabled={loading || !accepted} onClick={submitCancellation}>{loading ? "Enviando..." : "Confirmar cancelamento"}</button>}
      </div>
    </div>
  );
}

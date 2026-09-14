export const requestStatusLabel: Record<string, string> = {
  DRAFT: "Rascunho",
  SENT: "Recebido",
  AWAITING_SIGNATURE: "Aguardando assinatura",
  SIGNED_RECEIVED: "Termo assinado recebido",
  FEE_PENDING: "Aguardando pagamento da taxa",
  READY_TO_CANCEL: "Pronto para cancelamento",
  UNDER_REVIEW: "Em conferência",
  APPROVED: "Aprovado",
  MANUAL_REVIEW: "Ação da equipe necessária",
  EVO_CANCEL_REQUESTED: "Cancelamento em processamento",
  EVO_CANCELLED: "Contrato cancelado",
  CANCELLED_CONFIRMED: "Contrato cancelado",
  REFUND_PENDING: "Estorno pendente",
  REFUND_REGISTERED: "Estorno registrado",
  COMPLETED: "Concluído",
  REJECTED: "Não aprovado",
  CANCELLED_BY_CUSTOMER: "Solicitação encerrada",
};

export function friendlyStatus(status: string) {
  return requestStatusLabel[status] || "Em andamento";
}

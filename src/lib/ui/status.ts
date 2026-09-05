export const requestStatusLabel: Record<string, string> = {
  DRAFT: "Rascunho",
  SENT: "Recebido",
  AWAITING_SIGNATURE: "Aguardando assinatura",
  SIGNED_RECEIVED: "Termo assinado recebido",
  UNDER_REVIEW: "Em análise",
  APPROVED: "Aprovado",
  MANUAL_REVIEW: "Conferência da equipe",
  EVO_CANCEL_REQUESTED: "Cancelamento enviado ao EVO",
  EVO_CANCELLED: "Cancelado no EVO",
  CANCELLED_CONFIRMED: "Cancelamento confirmado",
  REFUND_PENDING: "Estorno pendente",
  REFUND_REGISTERED: "Estorno registrado",
  COMPLETED: "Concluído",
  REJECTED: "Não aprovado",
  CANCELLED_BY_CUSTOMER: "Solicitação encerrada",
};

export function friendlyStatus(status: string) {
  return requestStatusLabel[status] || status.replaceAll("_", " ").toLowerCase();
}

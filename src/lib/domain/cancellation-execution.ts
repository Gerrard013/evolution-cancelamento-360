import { prisma } from "@/lib/db/prisma";
import { decryptText } from "@/lib/security/crypto";
import { evoAdapter } from "@/lib/evo";

export async function executeCancellationInEvo(requestId: string) {
  const item = await prisma.cancellationRequest.findUnique({
    where: { id: requestId },
    include: {
      contract: { include: { customer: true } },
      calculations: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
  if (!item) throw new Error("REQUEST_NOT_FOUND");
  if (!item.identityVerifiedAt) throw new Error("IDENTITY_NOT_VERIFIED");
  if (item.cancellationFee.gt(0) && !item.cancellationFeePaidAt) throw new Error("FEE_NOT_PAID");
  if (!item.contract.externalIdCiphertext) throw new Error("CONTRACT_EXTERNAL_ID_MISSING");
  if (process.env.EVO_INTEGRATION_MODE !== "write" || process.env.EVO_WRITE_ENABLED !== "true" || process.env.EVO_WRITE_HOMOLOGATED !== "true") throw new Error("EVO_WRITE_DISABLED");

  const externalContractId = decryptText(item.contract.externalIdCiphertext);
  const externalCustomerId = item.contract.customer.externalIdCiphertext ? decryptText(item.contract.customer.externalIdCiphertext) : "";
  if (!externalCustomerId) throw new Error("CUSTOMER_EXTERNAL_ID_MISSING");
  const evo=evoAdapter();

  // Cláusula 21: a checagem financeira é repetida imediatamente antes da escrita no EVO,
  // evitando cancelar um contrato cuja situação tenha mudado depois da geração do termo.
  if (process.env.EVO_INVOICES_BY_MEMBER_PATH?.trim()) {
    const invoices=await evo.listInvoices(externalCustomerId);
    const open=invoices.filter(i=>i.open&&(!i.contractExternalId||i.contractExternalId===externalContractId));
    if(open.length){
      await prisma.auditEvent.create({data:{requestId:item.id,action:"EVO_CANCELLATION_BLOCKED_OPEN_DEBT",entity:"CancellationRequest",entityId:item.id,after:{openInvoiceCount:open.length,openInvoiceAmount:open.reduce((sum,i)=>sum+i.amount,0)}}});
      throw new Error("EVO_OPEN_DEBT");
    }
  } else {
    throw new Error("EVO_INVOICES_NOT_CONFIGURED");
  }

  const result = await evo.cancelContract(externalContractId, item.protocol);
  if (result.status !== "cancelled") {
    await prisma.cancellationRequest.update({ where: { id: item.id }, data: { status: "UNDER_REVIEW", evoOperationId: result.operationId || null, evoLastAttemptAt: new Date() } });
    return { status: "UNDER_REVIEW" as const, operationId: result.operationId || null, paymentMethodRemoved: false };
  }

  let paymentMethodRemovalStatus: string | null = null;
  let paymentMethodRemoved = false;
  if (item.contract.recurring && process.env.EVO_REMOVE_PAYMENT_METHOD_ENABLED === "true") {
    try {
      await evo.removeStoredPaymentMethod(externalContractId, externalCustomerId, item.protocol);
      paymentMethodRemovalStatus = "REMOVED";
      paymentMethodRemoved = true;
    } catch {
      paymentMethodRemovalStatus = "FAILED_REQUIRES_REVIEW";
    }
  } else if (item.contract.recurring) {
    paymentMethodRemovalStatus = "NOT_CONFIGURED";
  }

  const refundAmount = Number(item.calculations[0]?.estimatedRefund || 0);
  const recurringNeedsPaymentMethodReview = item.contract.recurring && paymentMethodRemovalStatus !== "REMOVED";
  const finalStatus = recurringNeedsPaymentMethodReview ? "MANUAL_REVIEW" : refundAmount > 0 ? "REFUND_PENDING" : "COMPLETED";
  await prisma.$transaction([
    prisma.cancellationRequest.update({
      where: { id: item.id },
      data: {
        status: finalStatus,
        activeKey: null,
        submittedAt: item.submittedAt || new Date(),
        evoOperationId: result.operationId || null,
        evoLastAttemptAt: new Date(),
        paymentMethodRemovalStatus
      }
    }),
    prisma.contract.update({ where: { id: item.contractId }, data: { status: "CANCELLED" } }),
    prisma.auditEvent.create({
      data: {
        requestId: item.id,
        action: "EVO_CANCELLATION_CONFIRMED",
        entity: "CancellationRequest",
        entityId: item.id,
        after: { status: finalStatus, operationId: result.operationId || null, paymentMethodRemovalStatus, refundAmount, financialCheck:"NO_OPEN_INVOICES" }
      }
    })
  ]);
  return { status: finalStatus, operationId: result.operationId || null, paymentMethodRemoved };
}

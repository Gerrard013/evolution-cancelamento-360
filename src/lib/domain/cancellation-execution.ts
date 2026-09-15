import { prisma } from "@/lib/db/prisma";
import { decryptText } from "@/lib/security/crypto";
import { evoAdapter } from "@/lib/evo";

const EXECUTABLE_STATUSES = ["READY_TO_CANCEL", "APPROVED", "MANUAL_REVIEW", "UNDER_REVIEW"] as const;

export async function executeCancellationInEvo(requestId: string) {
  const item = await prisma.cancellationRequest.findUnique({
    where: { id: requestId },
    include: {
      contract: { include: { customer: true } },
      calculations: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
  if (!item) throw new Error("REQUEST_NOT_FOUND");
  if (item.contract.status === "CANCELLED" || ["COMPLETED", "EVO_CANCELLED", "CANCELLED_CONFIRMED"].includes(item.status)) throw new Error("ALREADY_CANCELLED");
  if (!EXECUTABLE_STATUSES.includes(item.status as typeof EXECUTABLE_STATUSES[number])) throw new Error("REQUEST_STATUS_NOT_EXECUTABLE");
  if (item.cancellationFee.gt(0) && !item.cancellationFeePaidAt) throw new Error("FEE_NOT_PAID");
  if (!item.contract.externalIdCiphertext) throw new Error("CONTRACT_EXTERNAL_ID_MISSING");
  if (process.env.EVO_INTEGRATION_MODE !== "write" || process.env.EVO_WRITE_ENABLED !== "true") throw new Error("EVO_WRITE_DISABLED");

  const locked = await prisma.cancellationRequest.updateMany({
    where: { id: item.id, status: { in: [...EXECUTABLE_STATUSES] } },
    data: { status: "EVO_CANCEL_REQUESTED", evoLastAttemptAt: new Date(), evoLastErrorCode: null }
  });
  if (locked.count !== 1) throw new Error("EVO_CANCELLATION_ALREADY_IN_PROGRESS");

  await prisma.auditEvent.create({
    data: {
      requestId: item.id,
      action: "EVO_CANCELLATION_REQUESTED",
      entity: "CancellationRequest",
      entityId: item.id,
      before: { status: item.status },
      after: { status: "EVO_CANCEL_REQUESTED", unit: item.contract.unit }
    }
  });

  const externalContractId = decryptText(item.contract.externalIdCiphertext);
  const externalCustomerId = item.contract.customer.externalIdCiphertext ? decryptText(item.contract.customer.externalIdCiphertext) : "";
  const evo = evoAdapter(item.contract.unit);
  const result = await evo.cancelContract(externalContractId, item.protocol);
  if (result.status !== "cancelled") {
    await prisma.cancellationRequest.update({ where: { id: item.id }, data: { status: "UNDER_REVIEW", evoOperationId: result.operationId || null, evoLastAttemptAt: new Date() } });
    return { status: "UNDER_REVIEW" as const, operationId: result.operationId || null, paymentMethodRemoved: false };
  }

  let paymentMethodRemovalStatus: string | null = null;
  let paymentMethodRemoved = false;
  if (item.contract.recurring && process.env.EVO_REMOVE_PAYMENT_METHOD_ENABLED === "true") {
    try {
      if (!externalCustomerId) throw new Error("CUSTOMER_EXTERNAL_ID_MISSING");
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
        after: { status: finalStatus, operationId: result.operationId || null, paymentMethodRemovalStatus, refundAmount, unit: item.contract.unit }
      }
    })
  ]);
  return { status: finalStatus, operationId: result.operationId || null, paymentMethodRemoved };
}

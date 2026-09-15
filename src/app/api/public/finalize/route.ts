import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { executeCancellationInEvo } from "@/lib/domain/cancellation-execution";
import { decryptText } from "@/lib/security/crypto";
import { sendProtocolConfirmation } from "@/lib/email/smtp";

const schema = z.object({ protocol: z.string().trim().min(6).max(80) });

type NotifyInput = {
  id:string;
  protocol:string;
  refundDueAt:Date|null;
  customer:{displayName:string;emailCiphertext:string|null;emailMask:string|null};
};

async function notifyOnce(item:NotifyInput) {
  const already = await prisma.auditEvent.findFirst({ where: { requestId: item.id, action: "PROTOCOL_EMAIL_SENT" } });
  if (already || !item.customer.emailCiphertext) return;
  let email="";
  try { email=decryptText(item.customer.emailCiphertext); } catch { return; }
  try {
    await sendProtocolConfirmation({ to:email, protocol:item.protocol, customerName:item.customer.displayName, refundDueAt:item.refundDueAt });
    await prisma.auditEvent.create({ data:{ requestId:item.id, action:"PROTOCOL_EMAIL_SENT", entity:"CancellationRequest", entityId:item.id, after:{ emailMask:item.customer.emailMask || "confirmado" } } });
  } catch (error) {
    console.error("[PROTOCOL_EMAIL]", error instanceof Error ? error.message : "SEND_FAILED");
    await prisma.auditEvent.create({ data:{ requestId:item.id, action:"PROTOCOL_EMAIL_FAILED", entity:"CancellationRequest", entityId:item.id, after:{ retryable:true } } }).catch(()=>null);
  }
}

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    const session = await getCustomerSession();
    if (!session || !session.grantId) return Response.json({ error: "Sua sessão expirou." }, { status: 401 });
    const { protocol } = schema.parse(await readJsonLimited(req, 4096));
    const cancellation = await prisma.cancellationRequest.findUnique({
      where: { protocol },
      include: { customer:{select:{displayName:true,emailCiphertext:true,emailMask:true}}, contract: true, attachments: true, calculations: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
    if (!cancellation || cancellation.contractId !== session.sub || !cancellation.identityVerifiedAt) return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
    if (!cancellation.attachments.some(a => a.type === "SIGNED_CANCELLATION_TERM" && a.malwareStatus === "VALIDATED")) return Response.json({ error: "Envie o termo assinado antes de finalizar." }, { status: 409 });

    const fingerprint = requestFingerprint(req);
    if (cancellation.cancellationFee.gt(0) && !cancellation.cancellationFeePaidAt) {
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id: cancellation.id }, data: { status: "FEE_PENDING", submittedAt: new Date() } }),
        prisma.auditEvent.create({ data: { requestId: cancellation.id, action: "CANCELLATION_WAITING_FEE", entity: "CancellationRequest", entityId: cancellation.id, after: { status: "FEE_PENDING", fee: Number(cancellation.cancellationFee) }, ...fingerprint } })
      ]);
      await notifyOnce(cancellation);
      const pixKey = process.env.CANCELLATION_FEE_PIX_KEY?.trim() || "";
      const pixName = process.env.CANCELLATION_FEE_PIX_NAME?.trim() || "Evolution Academia";
      return Response.json({ protocol, status: "FEE_PENDING", refundDueAt:cancellation.refundDueAt?.toISOString()||null, message: `O termo foi recebido. Para concluir o cancelamento, é necessário quitar a taxa de ${new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(cancellation.cancellationFee))}.`, feePayment: { amount: Number(cancellation.cancellationFee), pixKey, pixName } });
    }

    const directEnabled = process.env.CUSTOMER_DIRECT_CANCELLATION === "true" && process.env.EVO_INTEGRATION_MODE === "write" && process.env.EVO_WRITE_ENABLED === "true";
    if (!directEnabled) {
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id: cancellation.id }, data: { status: "READY_TO_CANCEL", submittedAt: new Date() } }),
        prisma.auditEvent.create({ data: { requestId: cancellation.id, action: "CANCELLATION_READY", entity: "CancellationRequest", entityId: cancellation.id, after: { status: "READY_TO_CANCEL" }, ...fingerprint } })
      ]);
      await notifyOnce(cancellation);
      return Response.json({ protocol, status: "READY_TO_CANCEL", refundDueAt:cancellation.refundDueAt?.toISOString()||null, message: "Seu pedido e o termo assinado foram recebidos. O cancelamento está pronto para conclusão pela equipe autorizada." });
    }

    try {
      const result = await executeCancellationInEvo(cancellation.id);
      await notifyOnce(cancellation);
      const message = result.status === "REFUND_PENDING"
        ? "Contrato cancelado no EVO. O estorno calculado seguirá para pagamento."
        : result.status === "COMPLETED"
          ? "Cancelamento concluído no EVO."
          : "Pedido enviado ao EVO para confirmação do cancelamento.";
      return Response.json({ protocol, status: result.status, refundDueAt:cancellation.refundDueAt?.toISOString()||null, message });
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0,80) : "EVO_WRITE_ERROR";
      await prisma.cancellationRequest.update({ where: { id: cancellation.id }, data: { status: "MANUAL_REVIEW", submittedAt: new Date(), evoLastErrorCode: code, evoLastAttemptAt: new Date() } });
      await notifyOnce(cancellation);
      return Response.json({ protocol, status: "MANUAL_REVIEW", refundDueAt:cancellation.refundDueAt?.toISOString()||null, message: "Seu pedido foi recebido. A equipe autorizada concluirá a última etapa no EVO." });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Protocolo inválido." }, { status: 400 });
    return Response.json({ error: "Não foi possível finalizar sua solicitação." }, { status: 500 });
  }
}

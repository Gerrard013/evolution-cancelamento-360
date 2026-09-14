import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { executeCancellationInEvo } from "@/lib/domain/cancellation-execution";

const schema = z.object({ protocol: z.string().trim().min(6).max(80) });

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    const session = await getCustomerSession();
    if (!session) return Response.json({ error: "Sua sessão expirou." }, { status: 401 });
    const { protocol } = schema.parse(await readJsonLimited(req, 4096));
    const cancellation = await prisma.cancellationRequest.findUnique({ where: { protocol }, include: { contract: true, attachments: true, calculations: { orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!cancellation || cancellation.contractId !== session.sub) return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
    if (!cancellation.attachments.some(a => a.type === "SIGNED_CANCELLATION_TERM" && a.malwareStatus === "VALIDATED")) return Response.json({ error: "Envie o termo assinado antes de finalizar." }, { status: 409 });

    const fingerprint = requestFingerprint(req);
    if (cancellation.cancellationFee.gt(0) && !cancellation.cancellationFeePaidAt) {
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id: cancellation.id }, data: { status: "FEE_PENDING", submittedAt: new Date() } }),
        prisma.auditEvent.create({ data: { requestId: cancellation.id, action: "CANCELLATION_WAITING_FEE", entity: "CancellationRequest", entityId: cancellation.id, after: { status: "FEE_PENDING", fee: Number(cancellation.cancellationFee) }, ...fingerprint } })
      ]);
      const pixKey = process.env.CANCELLATION_FEE_PIX_KEY?.trim() || "";
      const pixName = process.env.CANCELLATION_FEE_PIX_NAME?.trim() || "Evolution Academia";
      return Response.json({ protocol, status: "FEE_PENDING", message: `O termo foi recebido. Para concluir o cancelamento, é necessário quitar a taxa de ${new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(cancellation.cancellationFee))}.`, feePayment: { amount: Number(cancellation.cancellationFee), pixKey, pixName } });
    }

    const directEnabled = process.env.CUSTOMER_DIRECT_CANCELLATION === "true" && process.env.EVO_INTEGRATION_MODE === "write" && process.env.EVO_WRITE_ENABLED === "true";
    if (!directEnabled) {
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id: cancellation.id }, data: { status: "READY_TO_CANCEL", submittedAt: new Date() } }),
        prisma.auditEvent.create({ data: { requestId: cancellation.id, action: "CANCELLATION_READY", entity: "CancellationRequest", entityId: cancellation.id, after: { status: "READY_TO_CANCEL" }, ...fingerprint } })
      ]);
      return Response.json({ protocol, status: "READY_TO_CANCEL", message: "Seu pedido e o termo assinado foram recebidos. O cancelamento está pronto para conclusão." });
    }

    try {
      const result = await executeCancellationInEvo(cancellation.id);
      const message = result.status === "REFUND_PENDING"
        ? "Contrato cancelado. O estorno calculado seguirá para pagamento."
        : result.status === "COMPLETED"
          ? "Cancelamento concluído."
          : "Pedido enviado para confirmação do cancelamento.";
      return Response.json({ protocol, status: result.status, message });
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0,80) : "EVO_WRITE_ERROR";
      await prisma.cancellationRequest.update({ where: { id: cancellation.id }, data: { status: "MANUAL_REVIEW", submittedAt: new Date(), evoLastErrorCode: code, evoLastAttemptAt: new Date() } });
      return Response.json({ protocol, status: "MANUAL_REVIEW", message: "Seu pedido foi recebido. A equipe concluirá a última etapa do cancelamento." });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Protocolo inválido." }, { status: 400 });
    return Response.json({ error: "Não foi possível finalizar sua solicitação." }, { status: 500 });
  }
}

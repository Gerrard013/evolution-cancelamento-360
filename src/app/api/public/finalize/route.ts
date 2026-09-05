import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { decryptText } from "@/lib/security/crypto";
import { evoAdapter } from "@/lib/evo";

const schema = z.object({ protocol: z.string().trim().min(6).max(80) });

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    const session = await getCustomerSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { protocol } = schema.parse(await readJsonLimited(req, 4096));
    if (session.sub === "demo-contract") return Response.json({ protocol, status: "UNDER_REVIEW", message: "Demonstração finalizada." });
    const cancellation = await prisma.cancellationRequest.findUnique({ where: { protocol }, include: { contract: true, attachments: true } });
    if (!cancellation || cancellation.contractId !== session.sub) return Response.json({ error: "Solicitação não encontrada" }, { status: 404 });
    if (!cancellation.attachments.some(a => a.type === "SIGNED_CANCELLATION_TERM" && a.malwareStatus === "VALIDATED")) return Response.json({ error: "Envie o termo assinado antes de concluir" }, { status: 409 });

    const fingerprint = requestFingerprint(req);
    const directEnabled = process.env.CUSTOMER_DIRECT_CANCELLATION === "true" && process.env.EVO_INTEGRATION_MODE === "write" && process.env.EVO_WRITE_ENABLED === "true";
    if (!directEnabled || !cancellation.contract.externalIdCiphertext) {
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id: cancellation.id }, data: { status: "UNDER_REVIEW", submittedAt: new Date() } }),
        prisma.auditEvent.create({ data: { requestId: cancellation.id, action: "CANCELLATION_FINALIZED_FOR_REVIEW", entity: "CancellationRequest", entityId: cancellation.id, after: { status: "UNDER_REVIEW" }, ...fingerprint } })
      ]);
      return Response.json({ protocol, status: "UNDER_REVIEW", message: "Pedido completo e termo assinado recebido. A equipe fará a conferência final." });
    }

    try {
      const externalContractId = decryptText(cancellation.contract.externalIdCiphertext);
      const result = await evoAdapter().cancelContract(externalContractId, protocol);
      const status = result.status === "cancelled" ? "EVO_CANCELLED" : "UNDER_REVIEW";
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id: cancellation.id }, data: { status, submittedAt: new Date(), evoOperationId: result.operationId || null, evoLastAttemptAt: new Date(), ...(status === "EVO_CANCELLED" ? { activeKey: null } : {}) } }),
        ...(status === "EVO_CANCELLED" ? [prisma.contract.update({ where: { id: cancellation.contractId }, data: { status: "CANCELLED" } })] : []),
        prisma.auditEvent.create({ data: { requestId: cancellation.id, action: "EVO_CANCELLATION_AFTER_SIGNATURE", entity: "CancellationRequest", entityId: cancellation.id, after: { status, operationId: result.operationId || null }, ...fingerprint } })
      ]);
      return Response.json({ protocol, status, message: status === "EVO_CANCELLED" ? "Cancelamento confirmado pelo EVO." : "Pedido enviado e aguardando confirmação." });
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0,80) : "EVO_WRITE_ERROR";
      await prisma.cancellationRequest.update({ where: { id: cancellation.id }, data: { status: "MANUAL_REVIEW", submittedAt: new Date(), evoLastErrorCode: code, evoLastAttemptAt: new Date() } });
      return Response.json({ protocol, status: "MANUAL_REVIEW", message: "Pedido completo. A integração não confirmou o cancelamento e a equipe fará a conferência manual." });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Protocolo inválido" }, { status: 400 });
    return Response.json({ error: "Não foi possível concluir o pedido" }, { status: 500 });
  }
}

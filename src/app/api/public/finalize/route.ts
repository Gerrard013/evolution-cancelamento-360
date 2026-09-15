import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";

const schema = z.object({ protocol: z.string().trim().min(6).max(80) });

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    const session = await getCustomerSession();
    if (!session) return Response.json({ error: "Sua sessão expirou." }, { status: 401 });
    const { protocol } = schema.parse(await readJsonLimited(req, 4096));
    const cancellation = await prisma.cancellationRequest.findUnique({ where: { protocol }, include: { contract: true, attachments: true } });
    if (!cancellation || cancellation.contractId !== session.sub) return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
    if (!cancellation.attachments.some(a => a.type === "SIGNED_CANCELLATION_TERM" && a.malwareStatus === "VALIDATED")) {
      return Response.json({ error: "Envie o termo assinado antes de finalizar." }, { status: 409 });
    }

    const fingerprint = requestFingerprint(req);
    if (cancellation.cancellationFee.gt(0) && !cancellation.cancellationFeePaidAt) {
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id: cancellation.id }, data: { status: "FEE_PENDING", submittedAt: new Date() } }),
        prisma.auditEvent.create({ data: { requestId: cancellation.id, action: "CANCELLATION_WAITING_FEE", entity: "CancellationRequest", entityId: cancellation.id, after: { status: "FEE_PENDING", fee: Number(cancellation.cancellationFee) }, ...fingerprint } })
      ]);
      const pixKey = process.env.CANCELLATION_FEE_PIX_KEY?.trim() || "";
      const pixName = process.env.CANCELLATION_FEE_PIX_NAME?.trim() || "Evolution Academia";
      return Response.json({
        protocol,
        status: "FEE_PENDING",
        message: `O termo foi recebido. Para seguir à validação final, é necessário quitar a taxa de ${new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(cancellation.cancellationFee))}.`,
        feePayment: { amount: Number(cancellation.cancellationFee), pixKey, pixName }
      });
    }

    await prisma.$transaction([
      prisma.cancellationRequest.update({ where: { id: cancellation.id }, data: { status: "READY_TO_CANCEL", submittedAt: new Date() } }),
      prisma.auditEvent.create({ data: { requestId: cancellation.id, action: "CANCELLATION_READY_FOR_OWNER_VALIDATION", entity: "CancellationRequest", entityId: cancellation.id, after: { status: "READY_TO_CANCEL", requiresOwnerApproval: true }, ...fingerprint } })
    ]);

    return Response.json({
      protocol,
      status: "READY_TO_CANCEL",
      message: "Seu pedido, termo assinado e documentos foram recebidos. A Evolution fará a conferência final de pendências e dados antes de efetivar o cancelamento."
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Protocolo inválido." }, { status: 400 });
    return Response.json({ error: "Não foi possível finalizar sua solicitação." }, { status: 500 });
  }
}

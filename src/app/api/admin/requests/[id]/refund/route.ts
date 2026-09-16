import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";

const schema = z.object({
  executedAmount: z.number().nonnegative().max(1_000_000),
  method: z.string().trim().min(2).max(80),
  transactionRef: z.string().trim().max(160).optional(),
  executedAt: z.string().datetime().optional()
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(req);
    const admin = await requireAdminApi();
    const { id } = await context.params;
    const input = schema.parse(await readJsonLimited(req, 16_384));

    const executedAt = input.executedAt ? new Date(input.executedAt) : new Date();
    if (executedAt.getTime() > Date.now() + 5 * 60_000) return Response.json({ error: "A data do estorno não pode estar no futuro" }, { status: 400 });

    const item = await prisma.cancellationRequest.findUnique({
      where: { id },
      include: { calculations: { orderBy: { createdAt: "desc" }, take: 1 }, refund: true }
    });
    if (!item) return Response.json({ error: "Solicitação não encontrada" }, { status: 404 });
    if (!["EVO_CANCELLED", "CANCELLED_CONFIRMED", "REFUND_PENDING"].includes(item.status)) {
      return Response.json({ error: "O cancelamento precisa estar confirmado antes de registrar estorno" }, { status: 409 });
    }
    if (item.refund) return Response.json({ error: "Estorno já registrado" }, { status: 409 });

    const approvedAmount = Number(item.calculations[0]?.estimatedRefund || 0);
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
      return Response.json({ error: "Não há valor de estorno aprovado para este protocolo" }, { status: 409 });
    }
    if (input.executedAmount > approvedAmount) {
      return Response.json({ error: "Valor executado não pode superar o valor calculado pelo sistema" }, { status: 400 });
    }

    const fingerprint = requestFingerprint(req);
    const refund = await prisma.$transaction(async tx => {
      const created = await tx.refund.create({
        data: {
          requestId: id,
          approvedAmount,
          executedAmount: input.executedAmount,
          executedAt,
          method: input.method,
          transactionRef: input.transactionRef || null
        }
      });
      await tx.cancellationRequest.update({ where: { id }, data: { status: "COMPLETED", activeKey: null } });
      await tx.auditEvent.create({
        data: {
          requestId: id,
          action: "REFUND_REGISTERED",
          entity: "Refund",
          entityId: created.id,
          after: {
            approvedAmount,
            executedAmount: input.executedAmount,
            executedAt: executedAt.toISOString(),
            method: input.method,
            transactionRef: input.transactionRef || null,
            by: admin.sub
          },
          ...fingerprint
        }
      });
      return created;
    });

    return Response.json({
      ok: true,
      refundId: refund.id,
      approvedAmount,
      executedAt: refund.executedAt.toISOString(),
      registeredBy: admin.sub,
      status: "COMPLETED",
      fiscalNote: "Se a opção do EVO para cancelar a nota fiscal no estorno estiver habilitada, evite duplicar a operação fiscal por outro endpoint."
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Dados de estorno inválidos" }, { status: 400 });
    return Response.json({ error: "Falha ao registrar estorno" }, { status: 500 });
  }
}

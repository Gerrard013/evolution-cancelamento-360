import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { executeCancellationInEvo } from "@/lib/domain/cancellation-execution";

const schema = z.object({
  decision: z.enum(["EXECUTE_CANCEL", "CONFIRM_FEE_PAID", "REJECT", "CONFIRM_MANUAL_CANCELLED"]),
  note: z.string().trim().max(1000).optional()
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(req);
    const admin = await requireAdminApi();
    const { id } = await context.params;
    const input = schema.parse(await readJsonLimited(req, 16_384));
    const item = await prisma.cancellationRequest.findUnique({ where: { id }, include: { contract: true } });
    if (!item) return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
    const fingerprint = requestFingerprint(req);

    if (input.decision === "REJECT") {
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id }, data: { status: "REJECTED", activeKey: null } }),
        prisma.auditEvent.create({ data: { requestId: id, action: "ADMIN_REJECTED", entity: "CancellationRequest", entityId: id, before: { status: item.status }, after: { status: "REJECTED", note: input.note || null, by: admin.sub }, ...fingerprint } })
      ]);
      return Response.json({ ok: true, status: "REJECTED" });
    }

    if (input.decision === "CONFIRM_FEE_PAID") {
      if (item.cancellationFee.lte(0)) return Response.json({ error: "Esta solicitação não possui taxa pendente." }, { status: 409 });
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id }, data: { cancellationFeePaidAt: new Date(), status: "READY_TO_CANCEL" } }),
        prisma.auditEvent.create({ data: { requestId: id, action: "CANCELLATION_FEE_CONFIRMED", entity: "CancellationRequest", entityId: id, before: { status: item.status }, after: { status: "READY_TO_CANCEL", fee: Number(item.cancellationFee), by: admin.sub }, ...fingerprint } })
      ]);
      if (process.env.EVO_INTEGRATION_MODE === "write" && process.env.EVO_WRITE_ENABLED === "true") {
        try {
          const result = await executeCancellationInEvo(id);
          return Response.json({ ok: true, status: result.status, message: "Pagamento confirmado e cancelamento processado.", paymentMethodRemoved: result.paymentMethodRemoved });
        } catch {}
      }
      return Response.json({ ok: true, status: "READY_TO_CANCEL", message: "Pagamento confirmado. O contrato está pronto para cancelamento." });
    }

    if (input.decision === "CONFIRM_MANUAL_CANCELLED") {
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id }, data: { status: "COMPLETED", activeKey: null } }),
        prisma.contract.update({ where: { id: item.contractId }, data: { status: "CANCELLED" } }),
        prisma.auditEvent.create({ data: { requestId: id, action: "ADMIN_CONFIRMED_MANUAL_CANCELLATION", entity: "CancellationRequest", entityId: id, before: { status: item.status }, after: { status: "COMPLETED", note: input.note || null, by: admin.sub }, ...fingerprint } })
      ]);
      return Response.json({ ok: true, status: "COMPLETED" });
    }

    try {
      const result = await executeCancellationInEvo(id);
      return Response.json({ ok: true, status: result.status, operationId: result.operationId || null, paymentMethodRemoved: result.paymentMethodRemoved });
    } catch (error) {
      const code = error instanceof Error ? error.message : "CANCEL_ERROR";
      if (code === "FEE_NOT_PAID") return Response.json({ error: "Confirme o pagamento da taxa antes de cancelar." }, { status: 409 });
      if (["EVO_WRITE_DISABLED","CONTRACT_EXTERNAL_ID_MISSING"].includes(code)) {
        await prisma.cancellationRequest.update({ where: { id }, data: { status: "MANUAL_REVIEW" } });
        return Response.json({ ok: true, status: "MANUAL_REVIEW", message: "A integração de cancelamento ainda não está habilitada. Conclua no EVO/W12 e confirme aqui." });
      }
      await prisma.cancellationRequest.update({ where: { id }, data: { status: "MANUAL_REVIEW", evoLastErrorCode: code.slice(0,80), evoLastAttemptAt: new Date() } });
      return Response.json({ ok: true, status: "MANUAL_REVIEW", message: "O cancelamento precisa de conferência da equipe." });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Ação inválida." }, { status: 400 });
    return Response.json({ error: "Não foi possível concluir a ação." }, { status: 500 });
  }
}

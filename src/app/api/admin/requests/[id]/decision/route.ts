import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi, requireOwnerApi } from "@/lib/auth/require-admin";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { executeCancellationInEvo } from "@/lib/domain/cancellation-execution";

const schema = z.object({
  decision: z.enum(["EXECUTE_CANCEL", "CONFIRM_FEE_PAID", "REJECT", "CONFIRM_MANUAL_CANCELLED"]),
  note: z.string().trim().max(1000).optional(),
  noPendingDebtConfirmed: z.boolean().optional(),
  dataConfirmed: z.boolean().optional(),
  signedTermConfirmed: z.boolean().optional()
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(req);
    const admin = await requireAdminApi();
    const { id } = await context.params;
    const input = schema.parse(await readJsonLimited(req, 16_384));
    const item = await prisma.cancellationRequest.findUnique({
      where: { id },
      include: { contract: true, attachments: true }
    });
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
        prisma.auditEvent.create({ data: { requestId: id, action: "CANCELLATION_FEE_CONFIRMED", entity: "CancellationRequest", entityId: id, before: { status: item.status }, after: { status: "READY_TO_CANCEL", fee: Number(item.cancellationFee), by: admin.sub, requiresOwnerApproval: true }, ...fingerprint } })
      ]);
      return Response.json({ ok: true, status: "READY_TO_CANCEL", message: "Pagamento confirmado. O pedido aguarda a validação final do proprietário antes do cancelamento." });
    }

    if (input.decision === "EXECUTE_CANCEL" || input.decision === "CONFIRM_MANUAL_CANCELLED") {
      const owner = await requireOwnerApi();
      const hasSignedTerm = item.attachments.some(a => a.type === "SIGNED_CANCELLATION_TERM" && a.malwareStatus === "VALIDATED");
      if (!hasSignedTerm) return Response.json({ error: "O termo assinado validado é obrigatório antes do cancelamento." }, { status: 409 });
      if (item.cancellationFee.gt(0) && !item.cancellationFeePaidAt) return Response.json({ error: "A taxa ainda não foi confirmada como paga." }, { status: 409 });
      if (!input.noPendingDebtConfirmed || !input.dataConfirmed || !input.signedTermConfirmed) {
        return Response.json({ error: "Conclua as três validações finais: pendências financeiras, dados e termo assinado." }, { status: 409 });
      }

      await prisma.auditEvent.create({
        data: {
          requestId: id,
          action: "OWNER_FINAL_VALIDATION",
          entity: "CancellationRequest",
          entityId: id,
          before: { status: item.status },
          after: {
            by: owner.sub,
            noPendingDebtConfirmed: true,
            dataConfirmed: true,
            signedTermConfirmed: true,
            note: input.note || null
          },
          ...fingerprint
        }
      });

      if (input.decision === "CONFIRM_MANUAL_CANCELLED") {
        await prisma.$transaction([
          prisma.cancellationRequest.update({ where: { id }, data: { status: "COMPLETED", activeKey: null } }),
          prisma.contract.update({ where: { id: item.contractId }, data: { status: "CANCELLED" } }),
          prisma.auditEvent.create({ data: { requestId: id, action: "OWNER_CONFIRMED_MANUAL_CANCELLATION", entity: "CancellationRequest", entityId: id, before: { status: item.status }, after: { status: "COMPLETED", note: input.note || null, by: owner.sub }, ...fingerprint } })
        ]);
        return Response.json({ ok: true, status: "COMPLETED" });
      }

      try {
        const result = await executeCancellationInEvo(id);
        return Response.json({ ok: true, status: result.status, operationId: result.operationId || null, paymentMethodRemoved: result.paymentMethodRemoved });
      } catch (error) {
        const code = error instanceof Error ? error.message : "CANCEL_ERROR";
        if (["EVO_WRITE_DISABLED","CONTRACT_EXTERNAL_ID_MISSING"].includes(code)) {
          await prisma.cancellationRequest.update({ where: { id }, data: { status: "MANUAL_REVIEW" } });
          return Response.json({ ok: true, status: "MANUAL_REVIEW", message: "Validação final registrada. Conclua o cancelamento no EVO/W12 e confirme aqui." });
        }
        await prisma.cancellationRequest.update({ where: { id }, data: { status: "MANUAL_REVIEW", evoLastErrorCode: code.slice(0,80), evoLastAttemptAt: new Date() } });
        return Response.json({ ok: true, status: "MANUAL_REVIEW", message: "A tentativa no EVO precisa de conferência manual do proprietário." });
      }
    }

    return Response.json({ error: "Ação não suportada." }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Ação inválida." }, { status: 400 });
    return Response.json({ error: "Não foi possível concluir a ação." }, { status: 500 });
  }
}

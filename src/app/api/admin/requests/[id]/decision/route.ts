import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { decryptText } from "@/lib/security/crypto";
import { evoAdapter } from "@/lib/evo";

const schema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "CONFIRM_MANUAL_CANCELLED"]),
  note: z.string().trim().max(1000).optional()
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(req);
    const admin = await requireAdminApi();
    const { id } = await context.params;
    const input = schema.parse(await readJsonLimited(req, 16_384));
    const item = await prisma.cancellationRequest.findUnique({ where: { id }, include: { contract: true } });
    if (!item) return Response.json({ error: "Solicitação não encontrada" }, { status: 404 });
    const fingerprint = requestFingerprint(req);

    if (input.decision === "REJECT") {
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id }, data: { status: "REJECTED", activeKey: null } }),
        prisma.auditEvent.create({ data: { requestId: id, action: "ADMIN_REJECTED", entity: "CancellationRequest", entityId: id, before: { status: item.status }, after: { status: "REJECTED", note: input.note || null, by: admin.sub }, ...fingerprint } })
      ]);
      return Response.json({ ok: true, status: "REJECTED" });
    }

    if (input.decision === "CONFIRM_MANUAL_CANCELLED") {
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id }, data: { status: "CANCELLED_CONFIRMED", activeKey: null } }),
        prisma.contract.update({ where: { id: item.contractId }, data: { status: "CANCELLED" } }),
        prisma.auditEvent.create({ data: { requestId: id, action: "ADMIN_CONFIRMED_MANUAL_CANCELLATION", entity: "CancellationRequest", entityId: id, before: { status: item.status }, after: { status: "CANCELLED_CONFIRMED", note: input.note || null, by: admin.sub }, ...fingerprint } })
      ]);
      return Response.json({ ok: true, status: "CANCELLED_CONFIRMED" });
    }

    const canWrite = process.env.EVO_INTEGRATION_MODE === "write" && process.env.EVO_WRITE_ENABLED === "true" && item.contract.externalIdCiphertext;
    if (!canWrite) {
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id }, data: { status: "MANUAL_REVIEW" } }),
        prisma.auditEvent.create({ data: { requestId: id, action: "ADMIN_APPROVED_MANUAL_EXECUTION", entity: "CancellationRequest", entityId: id, before: { status: item.status }, after: { status: "MANUAL_REVIEW", note: input.note || null, by: admin.sub }, ...fingerprint } })
      ]);
      return Response.json({ ok: true, status: "MANUAL_REVIEW", message: "Aprovado. Execute o cancelamento no EVO e confirme depois no sistema." });
    }

    try {
      const externalId = decryptText(item.contract.externalIdCiphertext!);
      const result = await evoAdapter().cancelContract(externalId, item.protocol);
      const status = result.status === "cancelled" ? "EVO_CANCELLED" : "UNDER_REVIEW";
      await prisma.$transaction([
        prisma.cancellationRequest.update({ where: { id }, data: { status, evoOperationId: result.operationId || null, evoLastAttemptAt: new Date(), ...(status === "EVO_CANCELLED" ? { activeKey: null } : {}) } }),
        ...(status === "EVO_CANCELLED" ? [prisma.contract.update({ where: { id: item.contractId }, data: { status: "CANCELLED" } })] : []),
        prisma.auditEvent.create({ data: { requestId: id, action: "ADMIN_APPROVED_EVO_WRITE", entity: "CancellationRequest", entityId: id, before: { status: item.status }, after: { status, operationId: result.operationId || null, by: admin.sub }, ...fingerprint } })
      ]);
      return Response.json({ ok: true, status, operationId: result.operationId || null });
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 80) : "EVO_WRITE_ERROR";
      await prisma.cancellationRequest.update({ where: { id }, data: { status: "MANUAL_REVIEW", evoLastErrorCode: code, evoLastAttemptAt: new Date() } });
      return Response.json({ ok: true, status: "MANUAL_REVIEW", message: "Aprovado, mas a escrita EVO não confirmou. Faça a conferência manual." });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Decisão inválida" }, { status: 400 });
    return Response.json({ error: "Falha ao processar decisão" }, { status: 500 });
  }
}

import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";
import { assertTrustedOrigin, requestFingerprint } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { validateSignedDocument } from "@/lib/documents/file-security";

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "signed-term-upload", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 6), 10 * 60_000);
    const session = await getCustomerSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (session.sub === "demo-contract") return Response.json({ ok: true, status: "SIGNED_RECEIVED" });

    const form = await req.formData();
    const protocol = String(form.get("protocol") || "").trim();
    const file = form.get("file");
    if (!protocol || !(file instanceof File)) return Response.json({ error: "Protocolo e arquivo são obrigatórios" }, { status: 400 });

    const cancellation = await prisma.cancellationRequest.findUnique({ where: { protocol } });
    if (!cancellation || cancellation.contractId !== session.sub) return Response.json({ error: "Solicitação não encontrada" }, { status: 404 });
    if (!["AWAITING_SIGNATURE", "SIGNED_RECEIVED"].includes(cancellation.status)) return Response.json({ error: "Esta solicitação não aceita novo termo neste status" }, { status: 409 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const meta = validateSignedDocument(file, bytes);
    const fingerprint = requestFingerprint(req);
    const now = new Date();
    const att = await prisma.$transaction(async tx => {
      const attachment = await tx.attachment.create({ data: { requestId: cancellation.id, type: "SIGNED_CANCELLATION_TERM", ...meta, malwareStatus: "VALIDATED", content: bytes, storageMode: "DATABASE", uploadedBy: "CUSTOMER" } });
      await tx.cancellationRequest.update({ where: { id: cancellation.id }, data: { status: "SIGNED_RECEIVED", signedTermReceivedAt: now } });
      await tx.auditEvent.create({ data: { requestId: cancellation.id, action: "SIGNED_TERM_UPLOADED", entity: "Attachment", entityId: attachment.id, after: { sha256: meta.sha256, mimeType: meta.mimeType, sizeBytes: meta.sizeBytes }, ...fingerprint } });
      return attachment;
    });
    return Response.json({ ok: true, attachmentId: att.id, status: "SIGNED_RECEIVED", message: "Termo assinado recebido e protegido no sistema." });
  } catch (error) {
    if (error instanceof Response) return error;
    const code = error instanceof Error ? error.message : "UPLOAD_ERROR";
    if (["FILE_SIZE_INVALID", "FILE_TYPE_NOT_ALLOWED", "MIME_MISMATCH", "PDF_ACTIVE_CONTENT_BLOCKED"].includes(code)) return Response.json({ error: "Arquivo inválido. Envie PDF, JPG ou PNG com até 8 MB." }, { status: 400 });
    return Response.json({ error: "Não foi possível receber o termo assinado" }, { status: 500 });
  }
}

import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";
import { assertTrustedOrigin, requestFingerprint } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { validateSignedDocument } from "@/lib/documents/file-security";
import { encryptBytes } from "@/lib/security/crypto";

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "fee-receipt-upload", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 6), 10 * 60_000);
    const session = await getCustomerSession();
    if (!session) return Response.json({ error: "Sua sessão expirou." }, { status: 401 });
    const form = await req.formData();
    const protocol = String(form.get("protocol") || "").trim();
    const file = form.get("file");
    if (!protocol || !(file instanceof File)) return Response.json({ error: "Selecione o comprovante." }, { status: 400 });
    const item = await prisma.cancellationRequest.findUnique({ where: { protocol } });
    if (!item || item.contractId !== session.sub) return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
    if (item.status !== "FEE_PENDING" || item.cancellationFee.lte(0)) return Response.json({ error: "Não há taxa pendente neste pedido." }, { status: 409 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const meta = validateSignedDocument(file, bytes);
    const encryptedContent = encryptBytes(bytes);
    const fingerprint = requestFingerprint(req);
    const att = await prisma.$transaction(async tx => {
      const attachment = await tx.attachment.create({
        data: {
          requestId: item.id,
          type: "CANCELLATION_FEE_RECEIPT",
          ...meta,
          malwareStatus: "VALIDATED",
          content: encryptedContent,
          storageMode: "DATABASE_ENCRYPTED_V1",
          uploadedBy: "CUSTOMER"
        }
      });
      await tx.auditEvent.create({ data: { requestId: item.id, action: "CANCELLATION_FEE_RECEIPT_UPLOADED", entity: "Attachment", entityId: attachment.id, after: { sha256: meta.sha256, mimeType: meta.mimeType, sizeBytes: meta.sizeBytes, storageMode: "DATABASE_ENCRYPTED_V1" }, ...fingerprint } });
      return attachment;
    });
    return Response.json({ ok: true, attachmentId: att.id, message: "Comprovante recebido. A equipe fará a confirmação do pagamento." });
  } catch (error) {
    if (error instanceof Response) return error;
    const code = error instanceof Error ? error.message : "UPLOAD_ERROR";
    if (["FILE_SIZE_INVALID","FILE_TYPE_NOT_ALLOWED","MIME_MISMATCH","PDF_ACTIVE_CONTENT_BLOCKED"].includes(code)) return Response.json({ error: "Arquivo inválido. Envie PDF, JPG ou PNG com até 8 MB." }, { status: 400 });
    return Response.json({ error: "Não foi possível receber o comprovante." }, { status: 500 });
  }
}

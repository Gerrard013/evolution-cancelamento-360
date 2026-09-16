import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { assertTrustedOrigin, requestFingerprint } from "@/lib/security/request";
import { validateSignedDocument } from "@/lib/documents/file-security";
import { encryptBytes } from "@/lib/security/crypto";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(req);
    const admin = await requireAdminApi();
    const { id } = await context.params;
    const item = await prisma.cancellationRequest.findUnique({ where: { id }, include: { refund: true } });
    if (!item) return Response.json({ error: "Solicitação não encontrada" }, { status: 404 });
    if (!item.refund) return Response.json({ error: "Registre o estorno antes de anexar o comprovante" }, { status: 409 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Selecione o comprovante" }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const meta = validateSignedDocument(file, bytes);
    const encryptedContent = encryptBytes(bytes);
    const fingerprint = requestFingerprint(req);

    const att = await prisma.$transaction(async tx => {
      const attachment = await tx.attachment.create({
        data: {
          requestId: id,
          type: "REFUND_RECEIPT",
          ...meta,
          malwareStatus: "VALIDATED",
          content: encryptedContent,
          storageMode: "DATABASE_ENCRYPTED_V1",
          uploadedBy: admin.sub
        }
      });
      await tx.auditEvent.create({
        data: {
          requestId: id,
          action: "REFUND_RECEIPT_UPLOADED",
          entity: "Attachment",
          entityId: attachment.id,
          after: { sha256: meta.sha256, mimeType: meta.mimeType, sizeBytes: meta.sizeBytes, storageMode: "DATABASE_ENCRYPTED_V1", by: admin.sub },
          ...fingerprint
        }
      });
      return attachment;
    });

    return Response.json({ ok: true, attachmentId: att.id, message: "Comprovante do estorno anexado" }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    const code = error instanceof Error ? error.message : "UPLOAD_ERROR";
    if (["FILE_SIZE_INVALID", "FILE_TYPE_NOT_ALLOWED", "MIME_MISMATCH", "PDF_ACTIVE_CONTENT_BLOCKED"].includes(code)) {
      return Response.json({ error: "Arquivo inválido. Envie PDF, JPG ou PNG com até 8 MB." }, { status: 400 });
    }
    return Response.json({ error: "Não foi possível anexar o comprovante do estorno" }, { status: 500 });
  }
}

import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { decryptBytes } from "@/lib/security/crypto";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  await requireAdminApi();
  const { id } = await context.params;
  const doc = await prisma.attachment.findUnique({ where: { id } });
  if (!doc || !doc.content) return Response.json({ error: "Documento não encontrado" }, { status: 404 });

  let content: Uint8Array<ArrayBuffer> = new Uint8Array(doc.content);
  if (doc.storageMode === "DATABASE_ENCRYPTED_V1") {
    try {
      content = decryptBytes(content);
    } catch {
      return Response.json({ error: "Documento protegido indisponível. Procure o administrador." }, { status: 500 });
    }
  }

  return new Response(content.buffer, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${doc.originalName.replace(/[\"\\]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

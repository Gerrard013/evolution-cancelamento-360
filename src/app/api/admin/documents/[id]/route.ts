import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/require-admin";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  await requireAdminApi();
  const { id } = await context.params;
  const doc = await prisma.attachment.findUnique({ where: { id } });
  if (!doc || !doc.content) return Response.json({ error: "Documento não encontrado" }, { status: 404 });
  return new Response(new Uint8Array(doc.content), { headers: { "Content-Type": doc.mimeType, "Content-Disposition": `attachment; filename="${doc.originalName.replace(/[\"\\]/g, "_")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

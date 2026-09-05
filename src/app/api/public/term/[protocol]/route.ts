import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";
import { buildCancellationTerm } from "@/lib/documents/term";

export async function GET(_: Request, context: { params: Promise<{ protocol: string }> }) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { protocol } = await context.params;
  if (session.sub === "demo-contract") return Response.json({ error: "Termo indisponível no modo demonstração" }, { status: 404 });
  const request = await prisma.cancellationRequest.findUnique({ where: { protocol }, include: { contract: true, customer: true } });
  if (!request || request.contractId !== session.sub) return Response.json({ error: "Documento não encontrado" }, { status: 404 });
  const bytes = await buildCancellationTerm({ request, contract: request.contract, customer: request.customer });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cancelamento-${request.protocol}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

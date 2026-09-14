import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";
import { buildCancellationTerm } from "@/lib/documents/term";

export async function GET(_: Request, context: { params: Promise<{ protocol: string }> }) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Sua sessão expirou. Volte ao início e confirme seus dados novamente." }, { status: 401 });
  const { protocol } = await context.params;
  if (session.sub === "demo-contract") return Response.json({ error: "Documento indisponível neste atendimento." }, { status: 404 });
  const request = await prisma.cancellationRequest.findUnique({
    where: { protocol },
    include: { contract: true, customer: true, calculations: { orderBy: { createdAt: "desc" }, take: 1 } }
  });
  if (!request || request.contractId !== session.sub) return Response.json({ error: "Documento não encontrado." }, { status: 404 });
  const bytes = await buildCancellationTerm({ request, contract: request.contract, customer: request.customer, calculation: request.calculations[0] || null });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cancelamento-${request.protocol}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

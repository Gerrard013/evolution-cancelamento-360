import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.sub === "demo-contract") return Response.json({ items: [] });
  const rows = await prisma.cancellationRequest.findMany({
    where: { contractId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { attachments: { where: { type: "SIGNED_CANCELLATION_TERM" }, select: { id: true }, take: 1 } }
  });
  return Response.json({ items: rows.map(r => ({
    protocol: r.protocol,
    status: r.status,
    desiredDate: r.desiredDate,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    hasSignedTerm: r.attachments.length > 0,
    termUrl: `/api/public/term/${encodeURIComponent(r.protocol)}`
  })) });
}

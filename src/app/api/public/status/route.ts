import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.sub === "demo-contract") return Response.json({ items: [] });
  const items = await prisma.cancellationRequest.findMany({
    where: { contractId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { protocol: true, status: true, desiredDate: true, createdAt: true, updatedAt: true }
  });
  return Response.json({ items });
}

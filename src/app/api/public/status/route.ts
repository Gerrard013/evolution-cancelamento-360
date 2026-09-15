import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";

export async function GET() {
  const session = await getCustomerSession();
  if (!session || !session.grantId) return Response.json({ error: "Sua sessão expirou." }, { status: 401 });
  if (session.sub === "demo-contract" && process.env.NEXT_PUBLIC_DEMO_MODE === "true") return Response.json({ items: [] });
  const challenge=await prisma.identityChallenge.findUnique({where:{id:session.grantId}});
  if(!challenge?.verifiedAt)return Response.json({error:"Confirmação de identidade inválida."},{status:401});
  const contract=await prisma.contract.findUnique({where:{id:session.sub},select:{customerId:true}});
  if(!contract||contract.customerId!==challenge.customerId)return Response.json({error:"Contrato não encontrado."},{status:404});
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
    refundDueAt:r.refundDueAt,
    hasSignedTerm: r.attachments.length > 0,
    termUrl: `/api/public/term/${encodeURIComponent(r.protocol)}`
  })) });
}

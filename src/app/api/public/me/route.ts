import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Sua sessão expirou." }, { status: 401 });
  if (session.sub === "demo-contract" && process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return Response.json({
      customer: { displayName: "Cliente Demonstração" },
      contract: { id: "demo-contract", unit: "Umarizal", planName: "Plano Anual Evolution", planType: "ANUAL", startDate: "2026-01-01", endDate: "2026-12-31", amountPaid: 1200, recurring: false, status: "ACTIVE" }
    });
  }
  if (!session.grantId) return Response.json({ error: "Confirmação de identidade ausente." }, { status: 401 });
  const challenge=await prisma.identityChallenge.findUnique({where:{id:session.grantId}});
  if(!challenge?.verifiedAt)return Response.json({error:"Confirmação de identidade inválida."},{status:401});
  const contract = await prisma.contract.findUnique({ where: { id: session.sub }, include: { customer: true } });
  if (!contract || contract.customerId!==challenge.customerId) return Response.json({ error: "Contrato não encontrado" }, { status: 404 });
  return Response.json({
    customer: { displayName: contract.customer.displayName, verifiedEmailMask: challenge.emailMask },
    contract: {
      id: contract.id,
      unit: contract.unit,
      planName: contract.planName,
      planType: contract.planType,
      startDate: contract.startDate,
      endDate: contract.endDate,
      amountPaid: Number(contract.amountPaid),
      recurring: contract.recurring,
      status: contract.status
    }
  });
}

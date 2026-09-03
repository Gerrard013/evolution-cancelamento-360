import { prisma } from "@/lib/db/prisma";
import { calculateRefund } from "@/lib/calc/refund";

const DAY_MS = 86_400_000;

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / DAY_MS));
}

export async function activeCalculationRule(at = new Date()) {
  return prisma.calculationRule.findFirst({
    where: {
      active: true,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }]
    },
    orderBy: { effectiveFrom: "desc" }
  });
}

export async function previewForContract(contractId: string, desiredDate: Date) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw new Error("CONTRACT_NOT_FOUND");
  if (!contract.endDate) {
    return {
      eligible: false as const,
      reason: "O contrato não possui data final suficiente para uma prévia automática segura. A equipe fará a conferência."
    };
  }

  const rule = await activeCalculationRule(desiredDate);
  if (!rule || rule.percentage === null) throw new Error("CALCULATION_RULE_NOT_CONFIGURED");

  const contractedDays = Math.max(1, daysBetween(contract.startDate, contract.endDate));
  const effectiveCancelDate = desiredDate < contract.startDate ? contract.startDate : desiredDate;
  const unusedDays = Math.min(contractedDays, daysBetween(effectiveCancelDate, contract.endDate));
  const calculation = calculateRefund({
    amountPaid: Number(contract.amountPaid),
    contractedDays,
    unusedDays,
    deductionRate: Number(rule.percentage),
    priorRefunds: 0
  });

  return {
    eligible: true as const,
    rule: { id: rule.id, version: rule.version, name: rule.name, percentage: Number(rule.percentage) },
    calculation
  };
}

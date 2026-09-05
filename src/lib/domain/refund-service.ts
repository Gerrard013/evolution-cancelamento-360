import { prisma } from "@/lib/db/prisma";
import { calculateRefund } from "@/lib/calc/refund";

const DAY_MS = 86_400_000;
const SOURCE_ANNUAL_RATE = 0.244; // 14,4% + 10% conforme modelo fornecido
const SOURCE_RECURRING_FEE = 258;

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / DAY_MS));
}

export async function activeCalculationRule(at = new Date()) {
  return prisma.calculationRule.findFirst({
    where: { active: true, effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] },
    orderBy: { effectiveFrom: "desc" }
  });
}

async function sourceAnnualReferenceRule() {
  return prisma.calculationRule.upsert({
    where: { version: "SOURCE-ANUAL-2026-v1" },
    create: {
      version: "SOURCE-ANUAL-2026-v1",
      name: "Referência do termo anual: 14,4% + 10%",
      percentage: SOURCE_ANNUAL_RATE,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      criteria: { formula: "daily-proration", source: "PEDIDO_CANCELAMENTO_PLANO_ANUAL", breakdown: [{ label: "antecipacao_parcelas", rate: 0.144 }, { label: "multa_taxa_sistema", rate: 0.10 }], requiresFinancialValidation: true },
      active: false,
      approvedBy: "SYSTEM_SOURCE_REFERENCE",
      approvedAt: null
    },
    update: {}
  });
}

export async function previewForContract(contractId: string, desiredDate: Date) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw new Error("CONTRACT_NOT_FOUND");
  const looksRecurring = contract.recurring || /recorr/i.test(`${contract.planType} ${contract.planName}`);

  if (looksRecurring) {
    return {
      eligible: false as const,
      reason: "O modelo recorrente fornecido não define fórmula automática de estorno. Ele informa multa de R$ 258,00 e antecedência de 30 dias da próxima mensalidade; o financeiro deve validar a aplicação ao contrato.",
      feeReference: SOURCE_RECURRING_FEE,
      noticeDays: 30
    };
  }

  if (!contract.endDate) {
    return { eligible: false as const, reason: "O contrato não possui data final suficiente para uma prévia automática segura. A equipe fará a conferência." };
  }

  let rule = await activeCalculationRule(desiredDate);
  if (!rule || rule.percentage === null) rule = await sourceAnnualReferenceRule();

  const contractedDays = Math.max(1, daysBetween(contract.startDate, contract.endDate));
  const effectiveCancelDate = desiredDate < contract.startDate ? contract.startDate : desiredDate;
  const unusedDays = Math.min(contractedDays, daysBetween(effectiveCancelDate, contract.endDate));
  const calculation = calculateRefund({ amountPaid: Number(contract.amountPaid), contractedDays, unusedDays, deductionRate: Number(rule.percentage), priorRefunds: 0 });

  return {
    eligible: true as const,
    rule: { id: rule.id, version: rule.version, name: rule.name, percentage: Number(rule.percentage) },
    calculation: { ...calculation, memory: { ...calculation.memory, legalReference: rule.version === "SOURCE-ANUAL-2026-v1" ? "14,4% + 10% do modelo anual fornecido" : "regra administrativa ativa", requiresFinancialValidation: true } }
  };
}

import { prisma } from "@/lib/db/prisma";

const ANNUAL_ADVANCE_RATE = 0.144;
const ANNUAL_CONTRACT_RATE = 0.10;
export const RECURRING_CANCEL_FEE = 258;

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calendarMonthsUsedInclusive(start: Date, at: Date) {
  if (at < start) return 0;
  const diff = (at.getUTCFullYear() - start.getUTCFullYear()) * 12 + (at.getUTCMonth() - start.getUTCMonth());
  return Math.min(12, Math.max(1, diff + 1));
}

export async function ensureAnnualOperationalRule() {
  return prisma.calculationRule.upsert({
    where: { version: "EVOLUTION-ANUAL-14.4-10-v2" },
    create: {
      version: "EVOLUTION-ANUAL-14.4-10-v2",
      name: "Plano anual — meses restantes menos 14,4% e 10% do valor total",
      percentage: ANNUAL_ADVANCE_RATE + ANNUAL_CONTRACT_RATE,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      criteria: {
        formula: "(valor_total/12*meses_restantes)-(valor_total*0.144)-(valor_total*0.10)",
        annualMonths: 12,
        advanceRate: ANNUAL_ADVANCE_RATE,
        contractRate: ANNUAL_CONTRACT_RATE
      },
      active: true,
      approvedBy: "EVOLUTION_OPERATIONAL_RULE",
      approvedAt: new Date()
    },
    update: {
      percentage: ANNUAL_ADVANCE_RATE + ANNUAL_CONTRACT_RATE,
      criteria: {
        formula: "(valor_total/12*meses_restantes)-(valor_total*0.144)-(valor_total*0.10)",
        annualMonths: 12,
        advanceRate: ANNUAL_ADVANCE_RATE,
        contractRate: ANNUAL_CONTRACT_RATE
      }
    }
  });
}

export async function previewForContract(contractId: string, desiredDate: Date) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw new Error("CONTRACT_NOT_FOUND");

  const looksRecurring = contract.recurring || /recorr/i.test(`${contract.planType} ${contract.planName}`);
  if (looksRecurring) {
    return {
      kind: "RECURRING" as const,
      eligible: false as const,
      refund: 0,
      feeRequired: true,
      feeAmount: RECURRING_CANCEL_FEE,
      noticeDays: 30,
      reason: "Plano anual recorrente: o termo oficial prevê multa fixa de R$ 258,00 e solicitação com 30 dias de antecedência da próxima mensalidade. A equipe fará a validação final no EVO antes do cancelamento."
    };
  }

  const total = Number(contract.amountPaid);
  if (!Number.isFinite(total) || total <= 0) {
    return { kind: "ANNUAL" as const, eligible: false as const, reason: "O valor total do plano precisa ser conferido antes do cálculo." };
  }

  const monthsUsed = calendarMonthsUsedInclusive(contract.startDate, desiredDate);
  const monthsRemaining = Math.max(0, 12 - monthsUsed);
  const monthlyReference = round(total / 12);
  const unusedBalance = round(monthlyReference * monthsRemaining);
  const advanceDeduction = round(total * ANNUAL_ADVANCE_RATE);
  const contractFee = round(total * ANNUAL_CONTRACT_RATE);
  const deduction = round(advanceDeduction + contractFee);
  const estimatedRefund = round(Math.max(0, unusedBalance - deduction));
  const rule = await ensureAnnualOperationalRule();

  return {
    kind: "ANNUAL" as const,
    eligible: true as const,
    rule: { id: rule.id, version: rule.version, name: rule.name, percentage: Number(rule.percentage) },
    calculation: {
      amountPaid: total,
      totalContractValue: total,
      monthlyReference,
      monthsUsed,
      monthsRemaining,
      unusedBalance,
      advanceDeduction,
      contractFee,
      deduction,
      priorRefunds: 0,
      estimatedRefund,
      memory: {
        formula: "(valor total ÷ 12 × meses restantes) − 14,4% do valor total − 10% do valor total",
        annualMonths: 12,
        advanceRate: ANNUAL_ADVANCE_RATE,
        contractRate: ANNUAL_CONTRACT_RATE,
        monthsUsed,
        monthsRemaining,
        monthlyReference,
        unusedBalance,
        advanceDeduction,
        contractFee,
        deduction,
        estimatedRefund
      }
    }
  };
}

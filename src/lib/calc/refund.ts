import { z } from "zod";

export const refundInputSchema = z.object({
  amountPaid: z.number().nonnegative(),
  contractedDays: z.number().int().positive(),
  unusedDays: z.number().int().min(0),
  deductionRate: z.number().min(0).max(1),
  priorRefunds: z.number().min(0).default(0)
});

export type RefundInput = z.infer<typeof refundInputSchema>;

export function calculateRefund(raw: RefundInput) {
  const input = refundInputSchema.parse(raw);
  const unusedBalance = (input.amountPaid * input.unusedDays) / input.contractedDays;
  const deduction = unusedBalance * input.deductionRate;
  const estimatedRefund = Math.max(0, unusedBalance - deduction - input.priorRefunds);
  return {
    ...input,
    unusedBalance: round(unusedBalance),
    deduction: round(deduction),
    estimatedRefund: round(estimatedRefund),
    memory: {
      formula: "amountPaid × unusedDays ÷ contractedDays − deduction − priorRefunds",
      rate: input.deductionRate,
      mode: "daily-proration"
    }
  };
}

function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }

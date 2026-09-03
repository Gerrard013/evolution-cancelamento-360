import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";

const schema = z.object({
  version: z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().trim().min(3).max(120),
  deductionRate: z.number().min(0).max(1),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  activate: z.boolean().default(false)
});

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    const admin = await requireAdminApi();
    const input = schema.parse(await readJsonLimited(req, 16_384));
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) return Response.json({ error: "effectiveTo inválido" }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      if (input.activate) await tx.calculationRule.updateMany({ where: { active: true }, data: { active: false } });
      return tx.calculationRule.create({
        data: {
          version: input.version,
          name: input.name,
          percentage: input.deductionRate,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo || null,
          criteria: { formula: "daily-proration", deductionAppliesTo: "unusedBalance" },
          active: input.activate,
          approvedBy: admin.sub,
          approvedAt: input.activate ? new Date() : null
        }
      });
    });
    return Response.json({ id: result.id, version: result.version, active: result.active }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Regra inválida" }, { status: 400 });
    return Response.json({ error: "Falha ao salvar regra" }, { status: 500 });
  }
}

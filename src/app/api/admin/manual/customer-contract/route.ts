import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { encryptText, hmac } from "@/lib/security/crypto";

const schema = z.object({
  memberId: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/),
  displayName: z.string().trim().min(2).max(160),
  unit: z.enum(["Condor", "Umarizal"]),
  planName: z.string().trim().min(2).max(160),
  planType: z.enum(["ANUAL", "RECORRENTE", "MENSAL", "OUTRO"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  amountPaid: z.number().nonnegative().max(1_000_000),
  recurring: z.boolean(),
});

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    await requireAdminApi();
    const input = schema.parse(await readJsonLimited(req, 24_000));

    const memberHash = hmac(input.memberId, "EXTERNAL_ID_PEPPER");
    const customer = await prisma.customer.upsert({
      where: { externalIdHash: memberHash },
      create: {
        externalIdHash: memberHash,
        externalIdCiphertext: encryptText(input.memberId),
        displayName: input.displayName,
      },
      update: {
        externalIdCiphertext: encryptText(input.memberId),
        displayName: input.displayName,
      },
    });

    const existing = await prisma.contract.findFirst({
      where: {
        customerId: customer.id,
        unit: input.unit,
        planName: input.planName,
        startDate: input.startDate,
        status: "ACTIVE",
      },
      orderBy: { syncedAt: "desc" },
    });

    const contract = existing
      ? await prisma.contract.update({
          where: { id: existing.id },
          data: {
            planType: input.planType,
            endDate: input.endDate ?? null,
            amountPaid: input.amountPaid,
            recurring: input.recurring,
            status: "ACTIVE",
            metadata: { source: "MANUAL_OPERATIONAL", evoMemberIdPresent: true },
            syncedAt: new Date(),
          },
        })
      : await prisma.contract.create({
          data: {
            customerId: customer.id,
            unit: input.unit,
            planName: input.planName,
            planType: input.planType,
            startDate: input.startDate,
            endDate: input.endDate ?? null,
            amountPaid: input.amountPaid,
            recurring: input.recurring,
            status: "ACTIVE",
            metadata: { source: "MANUAL_OPERATIONAL", evoMemberIdPresent: true },
            syncedAt: new Date(),
          },
        });

    return Response.json({
      customer: { id: customer.id, displayName: customer.displayName },
      contract: {
        id: contract.id,
        unit: contract.unit,
        planName: contract.planName,
        status: contract.status,
        endDate: contract.endDate,
      },
      message: "Aluno preparado para iniciar o cancelamento.",
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Confira os dados obrigatórios." }, { status: 400 });
    return Response.json({ error: "Não foi possível preparar o aluno para cancelamento." }, { status: 500 });
  }
}

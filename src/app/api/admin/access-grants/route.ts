import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { generatePublicAccessCode, hashPublicAccessCode } from "@/lib/security/crypto";

const schema = z.object({
  contractId: z.string().cuid(),
  validDays: z.number().int().min(1).max(90).default(7)
});

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    const admin = await requireAdminApi();
    const input = schema.parse(await readJsonLimited(req, 8_192));
    const contract = await prisma.contract.findUnique({ where: { id: input.contractId } });
    if (!contract) return Response.json({ error: "Contrato não encontrado" }, { status: 404 });

    const code = generatePublicAccessCode();
    const grant = await prisma.publicAccessGrant.create({
      data: {
        codeHash: hashPublicAccessCode(code),
        customerId: contract.customerId,
        contractId: contract.id,
        expiresAt: new Date(Date.now() + input.validDays * 86_400_000),
        createdBy: admin.sub
      }
    });
    return Response.json({ id: grant.id, accessId: code, expiresAt: grant.expiresAt, warning: "Exiba o ID somente ao cliente correto. O sistema armazena apenas o hash." }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Dados inválidos" }, { status: 400 });
    return Response.json({ error: "Falha ao gerar ID" }, { status: 500 });
  }
}

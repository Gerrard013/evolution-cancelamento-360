import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { generatePublicAccessCode, hashPublicAccessCode } from "@/lib/security/crypto";

const schema = z.object({
  contractId: z.string().cuid(),
  validDays: z.number().int().min(1).max(1).default(1)
});

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    const admin = await requireAdminApi();
    if (!admin.role || !["OWNER", "ADMIN", "MANAGER"].includes(admin.role)) {
      return Response.json({ error: "Este perfil não pode gerar código de atendimento." }, { status: 403 });
    }
    const input = schema.parse(await readJsonLimited(req, 8_192));
    const contract = await prisma.contract.findUnique({ where: { id: input.contractId } });
    if (!contract || contract.status !== "ACTIVE") {
      return Response.json({ error: "Contrato ativo não encontrado." }, { status: 404 });
    }

    // Invalidate any older unused attendance code for the same contract before
    // issuing a new one. This prevents multiple live bypass codes for one member.
    await prisma.publicAccessGrant.updateMany({
      where: { contractId: contract.id, active: true },
      data: { active: false }
    });

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
    const fp = requestFingerprint(req);
    await prisma.auditEvent.create({
      data: {
        action: "PUBLIC_ACCESS_GRANT_CREATED",
        entity: "PublicAccessGrant",
        entityId: grant.id,
        after: { contractId: contract.id, expiresAt: grant.expiresAt.toISOString(), by: admin.sub },
        ...fp
      }
    });
    return Response.json({ id: grant.id, accessId: code, expiresAt: grant.expiresAt, warning: "Exiba o ID somente ao cliente correto. O sistema armazena apenas o hash e invalida códigos anteriores." }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Dados inválidos" }, { status: 400 });
    return Response.json({ error: "Falha ao gerar ID" }, { status: 500 });
  }
}

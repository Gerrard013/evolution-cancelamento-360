import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { verifyIdentityCode } from "@/lib/identity/challenge";
import { createSessionToken, PREAUTH_COOKIE, secureCookieOptions } from "@/lib/security/session";

const schema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/)
});

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "identity-verify", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 10), 10 * 60_000);
    const input = schema.parse(await readJsonLimited(req, 4_096));
    const result = await verifyIdentityCode(input.challengeId, input.code);
    if (!result.ok) {
      const status = result.reason === "LOCKED" ? 429 : 401;
      const message = result.reason === "EXPIRED" ? "O código expirou. Solicite um novo código." : result.reason === "LOCKED" ? "Limite de tentativas atingido. Solicite um novo código." : "Código inválido ou já utilizado.";
      return Response.json({ error: message }, { status });
    }

    const challenge = result.challenge;
    const customer = await prisma.customer.findUnique({ where: { id: challenge.customerId } });
    if (!customer) return Response.json({ error: "Não foi possível concluir a identificação." }, { status: 404 });
    const contracts = await prisma.contract.findMany({ where: { customerId: customer.id, status: "ACTIVE" }, orderBy: { startDate: "desc" } });
    if (!contracts.length) return Response.json({ error: "Não encontramos contrato ativo para cancelamento." }, { status: 404 });

    const ttl = 10 * 60;
    const token = createSessionToken({ kind: "preauth", sub: customer.id, grantId: challenge.id }, ttl);
    const jar = await cookies();
    jar.set(PREAUTH_COOKIE, token, secureCookieOptions(ttl));

    const fingerprint = requestFingerprint(req);
    await prisma.auditEvent.create({
      data: {
        action: "IDENTITY_VERIFIED_EVO_EMAIL_OTP",
        entity: "IdentityChallenge",
        entityId: challenge.id,
        after: { purpose: challenge.purpose, emailMask: challenge.emailMask, consentVersion: challenge.consentVersion },
        ...fingerprint
      }
    });

    return Response.json({
      customerName: customer.displayName,
      emailMask: challenge.emailMask,
      contracts: contracts.map(c => ({
        id: c.id,
        unit: c.unit,
        planName: c.planName,
        startDate: c.startDate,
        recurring: c.recurring,
        planType: c.planType
      }))
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Código ou identificação inválidos." }, { status: 400 });
    return Response.json({ error: "Não foi possível validar o código agora." }, { status: 500 });
  }
}

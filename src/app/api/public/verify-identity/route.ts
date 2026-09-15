import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { constantTimeEqual, decryptText, hmac } from "@/lib/security/crypto";
import { createSessionToken, PREAUTH_COOKIE, secureCookieOptions } from "@/lib/security/session";
import { syncMemberFromEvo } from "@/lib/evo/sync-service";

const schema = z.object({
  challengeId: z.string().cuid(),
  code: z.string().trim().regex(/^\d{6}$/)
});

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "identity-verify", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 8), 10 * 60_000);
    const input = schema.parse(await readJsonLimited(req, 4096));

    const challenge = await prisma.identityChallenge.findUnique({ where: { id: input.challengeId } });
    const maxAttempts = Math.min(10, Math.max(3, Number(process.env.OTP_MAX_ATTEMPTS || 5)));

    if (!challenge || challenge.verifiedAt || challenge.expiresAt <= new Date() || challenge.attempts >= maxAttempts) {
      return Response.json({ error: "Código inválido ou expirado. Inicie a validação novamente." }, { status: 401 });
    }

    const expected = challenge.codeHash;
    const received = hmac(`otp:${input.code}`, "IDENTITY_CODE_PEPPER");
    const valid = constantTimeEqual(expected, received);

    await prisma.identityChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } }
    });

    if (!valid) {
      return Response.json({ error: "Código inválido. Confira o e-mail recebido e tente novamente." }, { status: 401 });
    }

    const memberId = decryptText(challenge.externalMemberIdCiphertext);
    const synced = await syncMemberFromEvo(memberId);
    if (!synced) return Response.json({ error: "Não foi possível carregar seu cadastro no EVO." }, { status: 502 });

    const activeContracts = synced.contracts.filter(contract => contract.status === "ACTIVE");
    if (!activeContracts.length) {
      return Response.json({ error: "Não encontramos contrato ativo para cancelamento." }, { status: 404 });
    }

    await prisma.identityChallenge.update({ where: { id: challenge.id }, data: { verifiedAt: new Date() } });

    const ttl = 10 * 60;
    const token = createSessionToken({ kind: "preauth", sub: synced.customer.id }, ttl);
    const jar = await cookies();
    jar.set(PREAUTH_COOKIE, token, secureCookieOptions(ttl));

    return Response.json({
      verified: true,
      customerName: synced.customer.displayName,
      contracts: activeContracts.map(contract => ({
        id: contract.id,
        unit: contract.unit,
        planName: contract.planName,
        startDate: contract.startDate,
        recurring: contract.recurring,
        planType: contract.planType
      }))
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Código de confirmação inválido." }, { status: 400 });
    console.error("[VERIFY_IDENTITY]", error);
    return Response.json({ error: "Não foi possível concluir a validação agora." }, { status: 500 });
  }
}

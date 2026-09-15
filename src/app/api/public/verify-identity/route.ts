import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { enforcePersistentRateLimit } from "@/lib/security/persistent-rate-limit";
import { constantTimeEqual, decryptText, hmac } from "@/lib/security/crypto";
import { createSessionToken, PREAUTH_COOKIE, secureCookieOptions } from "@/lib/security/session";
import { syncMemberFromEvo } from "@/lib/evo/sync-service";

const schema = z.object({
  challengeId: z.string().cuid(),
  code: z.string().trim().regex(/^\d{6}$/)
});

function parseMemberRef(value: string) {
  try {
    const parsed = JSON.parse(value) as { memberId?: unknown; profileKey?: unknown };
    if (typeof parsed.memberId === "string" && parsed.memberId.trim()) {
      return {
        memberId: parsed.memberId.trim(),
        profileKey: typeof parsed.profileKey === "string" ? parsed.profileKey.trim() : undefined
      };
    }
  } catch {
    // Compatibilidade com desafios anteriores ao suporte por unidade.
  }
  return { memberId: value, profileKey: undefined };
}

function withHardTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("EVO_SYNC_TIMEOUT")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "identity-verify", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 8), 10 * 60_000);
    const input = schema.parse(await readJsonLimited(req, 4096));
    const maxAttempts = Math.min(10, Math.max(3, Number(process.env.OTP_MAX_ATTEMPTS || 5)));
    await enforcePersistentRateLimit("identity-verify", input.challengeId, maxAttempts + 2, 10 * 60_000);

    const challenge = await prisma.identityChallenge.findUnique({ where: { id: input.challengeId } });
    const now = new Date();
    if (!challenge || challenge.verifiedAt || challenge.expiresAt <= now || challenge.attempts >= maxAttempts) {
      return Response.json({ error: "Código inválido ou expirado. Inicie a validação novamente." }, { status: 401 });
    }

    const consumed = await prisma.identityChallenge.updateMany({
      where: {
        id: challenge.id,
        verifiedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: maxAttempts }
      },
      data: { attempts: { increment: 1 } }
    });
    if (consumed.count !== 1) {
      return Response.json({ error: "Código inválido ou expirado. Inicie a validação novamente." }, { status: 401 });
    }

    const expected = challenge.codeHash;
    const received = hmac(`otp:${input.code}`, "IDENTITY_CODE_PEPPER");
    if (!constantTimeEqual(expected, received)) {
      return Response.json({ error: "Código inválido. Confira o e-mail recebido e tente novamente." }, { status: 401 });
    }

    const memberRef = parseMemberRef(decryptText(challenge.externalMemberIdCiphertext));
    const synced = await withHardTimeout(syncMemberFromEvo(memberRef.memberId, memberRef.profileKey), 15_000);
    if (!synced) return Response.json({ error: "Não foi possível carregar seu cadastro no EVO." }, { status: 502 });

    const activeContracts = synced.contracts.filter(contract => contract.status === "ACTIVE");
    if (!activeContracts.length) {
      return Response.json({ error: "Não encontramos contrato ativo para cancelamento." }, { status: 404 });
    }

    const verified = await prisma.identityChallenge.updateMany({
      where: { id: challenge.id, verifiedAt: null },
      data: { verifiedAt: new Date() }
    });
    if (verified.count !== 1) {
      return Response.json({ error: "Este código já foi utilizado. Inicie a validação novamente." }, { status: 409 });
    }

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
    const code = error instanceof Error ? error.message : "VERIFY_ERROR";
    console.error("[VERIFY_IDENTITY]", code);
    if (code === "EVO_SYNC_TIMEOUT") return Response.json({ error: "O EVO demorou para carregar os contratos. Tente novamente." }, { status: 504 });
    if (code.startsWith("EVO_HTTP_")) return Response.json({ error: "Não foi possível carregar os contratos no EVO agora." }, { status: 502 });
    return Response.json({ error: "Não foi possível concluir a validação agora." }, { status: 500 });
  }
}

import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { encryptText, hmac } from "@/lib/security/crypto";
import { findEvoMemberByEmail } from "@/lib/evo/member-lookup";
import { sendIdentityCode } from "@/lib/security/mailer";

const schema = z.object({
  fullName: z.string().trim().min(5).max(160),
  birthDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().trim().email().max(200)
});

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "e-mail cadastrado";
  const left = local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}${"*".repeat(Math.min(6, local.length - 2))}`;
  return `${left}@${domain}`;
}

function publicIntegrationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "UNKNOWN");
  console.error("[EVO_IDENTITY_START]", message);

  if (message.includes("EVO_HTTP_401")) return { status: 502, error: "A integração com o EVO não foi autorizada. Código EVO-401." };
  if (message.includes("EVO_HTTP_403")) return { status: 502, error: "A integração com o EVO não tem permissão suficiente. Código EVO-403." };
  if (message.includes("EVO_HTTP_429")) return { status: 503, error: "A validação está temporariamente indisponível. Tente novamente em alguns minutos." };
  if (message.includes("SMTP_NOT_CONFIGURED") || message.includes("SMTP_FROM_NOT_CONFIGURED")) return { status: 503, error: "O envio do código de confirmação ainda não está configurado." };
  if (message.includes("EVO_")) return { status: 502, error: "Não foi possível validar os dados no EVO agora. Tente novamente em instantes." };
  return { status: 500, error: "Não foi possível iniciar a validação agora." };
}

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "identity-start", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 6), 10 * 60_000);

    if ((process.env.EVO_INTEGRATION_MODE || "manual") === "manual") {
      return Response.json({ error: "O cancelamento online ainda não está disponível. Procure a equipe Evolution." }, { status: 503 });
    }

    const input = schema.parse(await readJsonLimited(req, 4096));
    const email = normalizeEmail(input.email);
    const suppliedName = normalizeName(input.fullName);
    const member = await findEvoMemberByEmail(email);

    const nameMatches = Boolean(member && normalizeName(member.name) === suppliedName);
    const birthMatches = Boolean(member?.birthDate && member.birthDate === input.birthDate);
    const emailMatches = Boolean(member && normalizeEmail(member.email) === email);

    if (!member || !nameMatches || !birthMatches || !emailMatches) {
      return Response.json({ error: "Não foi possível confirmar nome, data de nascimento e e-mail com o cadastro da Evolution." }, { status: 401 });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const ttlMinutes = Math.min(20, Math.max(3, Number(process.env.OTP_TTL_MINUTES || 10)));

    await prisma.identityChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);

    const challenge = await prisma.identityChallenge.create({
      data: {
        externalMemberIdCiphertext: encryptText(member.externalId),
        nameHash: hmac(`name:${suppliedName}`, "IDENTITY_CODE_PEPPER"),
        birthDateHash: hmac(`birth:${input.birthDate}`, "IDENTITY_CODE_PEPPER"),
        emailHash: hmac(`email:${email}`, "IDENTITY_CODE_PEPPER"),
        codeHash: hmac(`otp:${code}`, "IDENTITY_CODE_PEPPER"),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000)
      }
    });

    try {
      await sendIdentityCode(email, code);
    } catch (error) {
      await prisma.identityChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
      throw error;
    }

    return Response.json({
      challengeId: challenge.id,
      emailHint: maskEmail(email),
      expiresInMinutes: ttlMinutes,
      message: "Código de confirmação enviado para o e-mail cadastrado no EVO."
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Confira nome completo, data de nascimento e e-mail." }, { status: 400 });
    const mapped = publicIntegrationError(error);
    return Response.json({ error: mapped.error }, { status: mapped.status });
  }
}

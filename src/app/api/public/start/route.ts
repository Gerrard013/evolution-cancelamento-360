import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { enforcePersistentRateLimit } from "@/lib/security/persistent-rate-limit";
import { encryptText, hmac } from "@/lib/security/crypto";
import { findEvoMemberByCpf } from "@/lib/evo/member-lookup";
import { sendIdentityCode } from "@/lib/security/mailer";

const schema = z.object({
  cpf: z.string().trim().min(11).max(18),
  birthDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/)
});

function normalizeCpf(value: string) {
  return value.replace(/\D/g, "");
}

function validCpf(value: string) {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

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
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, local.length - visible.length)))}@${domain}`;
}

function publicIntegrationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "UNKNOWN");
  console.error("[EVO_IDENTITY_START]", message);

  if (message.includes("EVO_HTTP_401")) return { status: 502, error: "A integração com o EVO não foi autorizada. Código EVO-401." };
  if (message.includes("EVO_HTTP_403")) return { status: 502, error: "A integração com o EVO não tem permissão suficiente. Código EVO-403." };
  if (message.includes("EVO_HTTP_429")) return { status: 503, error: "A validação está temporariamente indisponível. Tente novamente em alguns minutos." };
  if (message.includes("EVO_FETCH_TIMEOUT") || message.includes("EVO_BODY_TIMEOUT") || message.includes("EVO_USAGE_TIMEOUT")) return { status: 504, error: "O EVO demorou mais que o esperado para responder. Tente novamente." };
  if (message.includes("RESEND_HTTP_403")) return { status: 503, error: "A identidade foi localizada no EVO, mas o domínio de e-mail da Evolution ainda não está autorizado para enviar o código." };
  if (message.includes("RESEND_HTTP_401")) return { status: 503, error: "O serviço de envio do código precisa ser reautorizado." };
  if (message.includes("RESEND_TIMEOUT")) return { status: 503, error: "O serviço de envio do código demorou para responder. Tente novamente." };
  if (message.includes("SMTP_NOT_CONFIGURED") || message.includes("SMTP_FROM_NOT_CONFIGURED") || message.includes("RESEND_API_KEY_NOT_CONFIGURED")) return { status: 503, error: "O envio do código de confirmação ainda não está configurado." };
  if (message.includes("EVO_")) return { status: 502, error: "Não foi possível validar os dados no EVO agora. Tente novamente em instantes." };
  return { status: 500, error: "Não foi possível iniciar a validação agora." };
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "identity-start", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 6), 10 * 60_000);

    if ((process.env.EVO_INTEGRATION_MODE || "manual") === "manual") {
      return Response.json({ error: "O cancelamento online ainda não está disponível. Procure a equipe Evolution." }, { status: 503 });
    }

    const input = schema.parse(await readJsonLimited(req, 4096));
    const cpf = normalizeCpf(input.cpf);
    if (!validCpf(cpf)) return Response.json({ error: "Informe um CPF válido." }, { status: 400 });

    await enforcePersistentRateLimit("identity-start", cpf, 6, 10 * 60_000);
    console.info("[IDENTITY_STAGE]", JSON.stringify({ stage: "evo_lookup_begin" }));
    const member = await findEvoMemberByCpf(cpf, input.birthDate);
    console.info("[IDENTITY_STAGE]", JSON.stringify({ stage: "evo_lookup_end", found: Boolean(member), ms: Date.now() - startedAt }));

    const cpfMatches = Boolean(member?.cpf && normalizeCpf(member.cpf) === cpf);
    const birthMatches = Boolean(member?.birthDate && member.birthDate === input.birthDate);

    if (!member || !cpfMatches || !birthMatches) {
      return Response.json({ error: "Não foi possível confirmar CPF e data de nascimento com o cadastro da Evolution." }, { status: 401 });
    }

    const email = normalizeEmail(member.email);
    if (!email) {
      return Response.json({ error: "Seu cadastro no EVO não possui um e-mail válido para confirmação. Procure a equipe Evolution." }, { status: 409 });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const ttlMinutes = Math.min(20, Math.max(3, Number(process.env.OTP_TTL_MINUTES || 10)));
    const normalizedMemberName = normalizeName(member.name || "CLIENTE");
    const memberRef = JSON.stringify({ memberId: member.externalId, profileKey: member.profileKey });

    await prisma.identityChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);

    console.info("[IDENTITY_STAGE]", JSON.stringify({ stage: "challenge_write_begin", ms: Date.now() - startedAt }));
    const challenge = await prisma.identityChallenge.create({
      data: {
        externalMemberIdCiphertext: encryptText(memberRef),
        nameHash: hmac(`name:${normalizedMemberName}`, "IDENTITY_CODE_PEPPER"),
        birthDateHash: hmac(`birth:${input.birthDate}`, "IDENTITY_CODE_PEPPER"),
        emailHash: hmac(`email:${email}`, "IDENTITY_CODE_PEPPER"),
        codeHash: hmac(`otp:${code}`, "IDENTITY_CODE_PEPPER"),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000)
      }
    });
    console.info("[IDENTITY_STAGE]", JSON.stringify({ stage: "challenge_write_end", ms: Date.now() - startedAt }));

    try {
      console.info("[IDENTITY_STAGE]", JSON.stringify({ stage: "mail_send_begin", ms: Date.now() - startedAt }));
      await sendIdentityCode(email, code, ttlMinutes);
      console.info("[IDENTITY_STAGE]", JSON.stringify({ stage: "mail_send_end", ms: Date.now() - startedAt }));
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
    if (error instanceof z.ZodError) return Response.json({ error: "Confira CPF e data de nascimento." }, { status: 400 });
    const mapped = publicIntegrationError(error);
    return Response.json({ error: mapped.error }, { status: mapped.status });
  }
}

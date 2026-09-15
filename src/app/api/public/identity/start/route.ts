import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { isValidCpf, normalizeCpf } from "@/lib/identity/cpf";
import { syncMemberFromEvoByCpf } from "@/lib/evo/sync-service";
import { createIdentityChallenge } from "@/lib/identity/challenge";
import { constantTimeEqual, hmac } from "@/lib/security/crypto";
import { sendIdentityCode } from "@/lib/email/smtp";

const schema = z.object({
  cpf: z.string().trim().min(11).max(18),
  email: z.string().trim().email().max(200),
  lgpdAccepted: z.literal(true),
  purpose: z.enum(["CANCELLATION", "PROTOCOL_STATUS"]).default("CANCELLATION")
});

function mappedEvoError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "UNKNOWN");
  console.error("[IDENTITY_START]", message);
  if (message.includes("EVO_HTTP_401")) return { status: 502, error: "A integração com o EVO não foi autorizada. Código EVO-401." };
  if (message.includes("EVO_HTTP_403")) return { status: 502, error: "A integração com o EVO não possui permissão suficiente. Código EVO-403." };
  if (message.includes("EVO_HTTP_429") || message.includes("EVO_API_BUDGET")) return { status: 503, error: "A consulta ao EVO está temporariamente limitada. Tente novamente em alguns minutos." };
  if (message.includes("SMTP_")) return { status: 503, error: "O envio do código de confirmação ainda não está configurado." };
  return { status: 502, error: "Não foi possível confirmar os dados no EVO agora. Tente novamente em instantes." };
}

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "identity-start", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 5), 10 * 60_000);
    if ((process.env.EVO_INTEGRATION_MODE || "manual") === "manual") {
      return Response.json({ error: "O canal online ainda não está disponível." }, { status: 503 });
    }

    const input = schema.parse(await readJsonLimited(req, 8_192));
    const cpf = normalizeCpf(input.cpf);
    const email = input.email.trim().toLowerCase();
    if (!isValidCpf(cpf)) return Response.json({ error: "CPF inválido." }, { status: 400 });

    const synced = await syncMemberFromEvoByCpf(cpf);
    const evoEmail = synced?.evoCustomer.email?.trim().toLowerCase();
    if (!synced || !evoEmail) {
      return Response.json({ error: "Não foi possível confirmar CPF e e-mail no cadastro do EVO." }, { status: 401 });
    }

    const informedHash = hmac(email, "EXTERNAL_ID_PEPPER");
    const evoHash = hmac(evoEmail, "EXTERNAL_ID_PEPPER");
    if (!constantTimeEqual(informedHash, evoHash)) {
      return Response.json({ error: "Não foi possível confirmar CPF e e-mail no cadastro do EVO." }, { status: 401 });
    }

    if (input.purpose === "CANCELLATION" && !synced.contracts.some(c => c.status === "ACTIVE")) {
      return Response.json({ error: "Não encontramos contrato ativo para cancelamento." }, { status: 404 });
    }

    const consentVersion = process.env.LGPD_CONSENT_VERSION?.trim() || "EV-LGPD-CANCELAMENTO-2026.09-v1";
    const { challenge, code, ttlMinutes } = await createIdentityChallenge({
      customerId: synced.customer.id,
      cpf,
      email: evoEmail,
      consentVersion,
      purpose: input.purpose
    });

    try {
      await sendIdentityCode({ to: evoEmail, code, challengeId: challenge.id, customerName: synced.customer.displayName });
    } catch (emailError) {
      await prisma.identityChallenge.delete({ where: { id: challenge.id } }).catch(() => null);
      throw emailError;
    }

    const fingerprint = requestFingerprint(req);
    await prisma.auditEvent.create({
      data: {
        action: "IDENTITY_CODE_SENT",
        entity: "IdentityChallenge",
        entityId: challenge.id,
        after: { purpose: challenge.purpose, emailMask: challenge.emailMask, expiresAt: challenge.expiresAt.toISOString(), consentVersion },
        ...fingerprint
      }
    });

    return Response.json({
      challengeId: challenge.id,
      emailMask: challenge.emailMask,
      expiresInMinutes: ttlMinutes,
      message: "Código enviado para o e-mail cadastrado no EVO."
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Confira CPF, e-mail e autorização de dados." }, { status: 400 });
    const mapped = mappedEvoError(error);
    return Response.json({ error: mapped.error }, { status: mapped.status });
  }
}

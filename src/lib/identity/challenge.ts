import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { hmac, constantTimeEqual } from "@/lib/security/crypto";
import { normalizeCpf } from "./cpf";
import { maskEmail } from "@/lib/email/smtp";
import type { IdentityPurpose } from "@prisma/client";

function ttlMinutes() {
  const n = Number(process.env.OTP_TTL_MINUTES || 10);
  return Math.max(3, Math.min(30, Number.isFinite(n) ? n : 10));
}

function maxAttempts() {
  const n = Number(process.env.OTP_MAX_ATTEMPTS || 5);
  return Math.max(3, Math.min(10, Number.isFinite(n) ? Math.floor(n) : 5));
}

function hashCode(challengeId: string, code: string) {
  return hmac(`${challengeId}:${code}`, "OTP_PEPPER");
}

export async function createIdentityChallenge(input: {
  customerId: string;
  cpf: string;
  email: string;
  consentVersion: string;
  purpose?: IdentityPurpose;
}) {
  const cpf = normalizeCpf(input.cpf);
  const email = input.email.trim().toLowerCase();
  const id = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1_000_000));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes() * 60_000);

  await prisma.identityChallenge.updateMany({
    where: { customerId: input.customerId, purpose: input.purpose || "CANCELLATION", verifiedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now }
  });

  const challenge = await prisma.identityChallenge.create({
    data: {
      id,
      purpose: input.purpose || "CANCELLATION",
      customerId: input.customerId,
      cpfHash: hmac(cpf, "EXTERNAL_ID_PEPPER"),
      emailHash: hmac(email, "EXTERNAL_ID_PEPPER"),
      emailMask: maskEmail(email),
      codeHash: hashCode(id, code),
      maxAttempts: maxAttempts(),
      expiresAt,
      consentAcceptedAt: now,
      consentVersion: input.consentVersion
    }
  });

  return { challenge, code, ttlMinutes: ttlMinutes() };
}

export async function verifyIdentityCode(challengeId: string, code: string) {
  const challenge = await prisma.identityChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge) return { ok: false as const, reason: "NOT_FOUND" as const };
  const now = new Date();
  if (challenge.verifiedAt) return { ok: false as const, reason: "ALREADY_USED" as const };
  if (challenge.expiresAt <= now) return { ok: false as const, reason: "EXPIRED" as const };
  if (challenge.attempts >= challenge.maxAttempts) return { ok: false as const, reason: "LOCKED" as const };

  const expected = hashCode(challenge.id, code);
  const valid = constantTimeEqual(expected, challenge.codeHash);
  if (!valid) {
    await prisma.identityChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return { ok: false as const, reason: "INVALID" as const };
  }

  const verified = await prisma.identityChallenge.update({
    where: { id: challenge.id },
    data: { verifiedAt: now, attempts: { increment: 1 } }
  });
  return { ok: true as const, challenge: verified };
}

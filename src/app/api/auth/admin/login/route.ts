import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ADMIN_COOKIE, createSessionToken, secureCookieOptions } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { enforcePersistentRateLimit } from "@/lib/security/persistent-rate-limit";
import { decryptText } from "@/lib/security/crypto";
import { verifyPassword, verifyTotp } from "@/lib/security/password";

const schema = z.object({
  username: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._-]+$/),
  password: z.string().min(14).max(200),
  code: z.string().trim().regex(/^\d{6}$/).optional().or(z.literal(""))
});

function ownerSessionVersion() {
  const value = Number(process.env.OWNER_SESSION_VERSION || 1);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function ownerAccount() {
  const username = process.env.OWNER_USERNAME?.trim().toLowerCase();
  const passwordHash = process.env.OWNER_PASSWORD_HASH?.trim();
  if (!username || !passwordHash) return null;
  return {
    username,
    passwordHash,
    name: process.env.OWNER_NAME?.trim() || "Ruy",
    totpSecret: process.env.OWNER_TOTP_SECRET?.trim() || ""
  };
}

function mfaNeeded(code: string | undefined, secret: string) {
  if (!secret) return false;
  return !code || !verifyTotp(code, secret);
}

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "admin-login", configuredLimit("RATE_LIMIT_ADMIN_LOGIN_PER_15_MIN", 8), 15 * 60_000);
    const input = schema.parse(await readJsonLimited(req, 8_192));
    const username = input.username.trim().toLowerCase();
    await enforcePersistentRateLimit("admin-login", username, 8, 15 * 60_000);

    const owner = ownerAccount();
    if (owner && owner.username === username && verifyPassword(input.password, owner.passwordHash)) {
      if (mfaNeeded(input.code, owner.totpSecret)) {
        return Response.json({ error: "Informe o código de autenticação.", mfaRequired: true }, { status: 428 });
      }
      const ttl = 4 * 60 * 60;
      const token = createSessionToken({ kind: "admin", sub: `owner:${owner.username}`, role: "OWNER", sv: ownerSessionVersion() }, ttl);
      const jar = await cookies();
      jar.set(ADMIN_COOKIE, token, secureCookieOptions(ttl));
      return Response.json({ ok: true, name: owner.name, role: "OWNER" });
    }

    const users = await prisma.user.findMany({ where: { username }, take: 2 });
    if (users.length !== 1) {
      return Response.json({ error: "Usuário ou senha inválidos" }, { status: 401 });
    }
    const user = users[0];
    if (!user.active || !user.passwordHash || user.role === "OWNER" || !verifyPassword(input.password, user.passwordHash)) {
      return Response.json({ error: "Usuário ou senha inválidos" }, { status: 401 });
    }

    if (user.totpSecretCiphertext) {
      const secret = decryptText(user.totpSecretCiphertext);
      if (mfaNeeded(input.code, secret)) {
        return Response.json({ error: "Informe o código de autenticação.", mfaRequired: true }, { status: 428 });
      }
    }

    const ttl = 4 * 60 * 60;
    const token = createSessionToken({ kind: "admin", sub: `user:${user.id}`, role: user.role, sv: user.sessionVersion }, ttl);
    const jar = await cookies();
    jar.set(ADMIN_COOKIE, token, secureCookieOptions(ttl));
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return Response.json({ ok: true, name: user.name, role: user.role });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Dados inválidos" }, { status: 400 });
    console.error("[ADMIN_LOGIN]", error instanceof Error ? error.message : "LOGIN_ERROR");
    return Response.json({ error: "Falha de autenticação" }, { status: 500 });
  }
}

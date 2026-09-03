import { cookies } from "next/headers";
import { z } from "zod";
import { ADMIN_COOKIE, createSessionToken, secureCookieOptions } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { verifyPassword, verifyTotp } from "@/lib/security/password";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(14).max(200),
  totp: z.string().regex(/^\d{6}$/).optional().or(z.literal(""))
});

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "admin-login", configuredLimit("RATE_LIMIT_ADMIN_LOGIN_PER_15_MIN", 8), 15 * 60_000);
    const input = schema.parse(await readJsonLimited(req, 8_192));
    const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
    if (!expectedEmail || !passwordHash) return Response.json({ error: "Admin authentication is not configured" }, { status: 503 });

    const emailOk = input.email.trim().toLowerCase() === expectedEmail;
    const passwordOk = verifyPassword(input.password, passwordHash);
    const totpSecret = process.env.ADMIN_TOTP_SECRET?.trim();
    const totpOk = !totpSecret || Boolean(input.totp && verifyTotp(input.totp, totpSecret));
    if (!emailOk || !passwordOk || !totpOk) return Response.json({ error: "Credenciais inválidas" }, { status: 401 });

    const ttl = 15 * 60;
    const token = createSessionToken({ kind: "admin", sub: expectedEmail, role: "ADMIN" }, ttl);
    const jar = await cookies();
    jar.set(ADMIN_COOKIE, token, secureCookieOptions(ttl));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Dados inválidos" }, { status: 400 });
    return Response.json({ error: "Falha de autenticação" }, { status: 500 });
  }
}

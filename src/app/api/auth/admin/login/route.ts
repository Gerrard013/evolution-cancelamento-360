import { cookies } from "next/headers";
import { z } from "zod";
import { ADMIN_COOKIE, createSessionToken, secureCookieOptions } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { verifyPassword } from "@/lib/security/password";

const schema = z.object({
  username: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._-]+$/),
  password: z.string().min(14).max(200)
});

type AdminAccount = { username: string; passwordHash: string; name: string };

function configuredAdmins(): AdminAccount[] {
  const accounts: AdminAccount[] = [];
  for (const n of [1, 2]) {
    const username = process.env[`ADMIN_${n}_USERNAME`]?.trim().toLowerCase();
    const passwordHash = process.env[`ADMIN_${n}_PASSWORD_HASH`]?.trim();
    const name = process.env[`ADMIN_${n}_NAME`]?.trim() || (n === 1 ? "Gerrard" : "Ruy");
    if (username && passwordHash) accounts.push({ username, passwordHash, name });
  }

  // Compatibilidade temporária com a configuração antiga baseada em e-mail.
  const legacyEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const legacyHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (legacyEmail && legacyHash && !accounts.some(a => a.username === legacyEmail)) {
    accounts.push({ username: legacyEmail, passwordHash: legacyHash, name: "Administrador" });
  }
  return accounts;
}

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "admin-login", configuredLimit("RATE_LIMIT_ADMIN_LOGIN_PER_15_MIN", 8), 15 * 60_000);
    const input = schema.parse(await readJsonLimited(req, 8_192));
    const admins = configuredAdmins();
    if (!admins.length) return Response.json({ error: "Acesso da equipe ainda não foi configurado no Railway" }, { status: 503 });

    const username = input.username.trim().toLowerCase();
    const account = admins.find(a => a.username === username);
    if (!account || !verifyPassword(input.password, account.passwordHash)) {
      return Response.json({ error: "Usuário ou senha inválidos" }, { status: 401 });
    }

    const ttl = 8 * 60 * 60;
    const token = createSessionToken({ kind: "admin", sub: account.username, role: "ADMIN" }, ttl);
    const jar = await cookies();
    jar.set(ADMIN_COOKIE, token, secureCookieOptions(ttl));
    return Response.json({ ok: true, name: account.name });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Dados inválidos" }, { status: 400 });
    return Response.json({ error: "Falha de autenticação" }, { status: 500 });
  }
}

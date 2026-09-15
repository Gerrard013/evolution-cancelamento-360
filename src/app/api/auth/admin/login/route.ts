import { cookies } from "next/headers";
import { z } from "zod";
import { ADMIN_COOKIE, createSessionToken, secureCookieOptions } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { verifyPassword } from "@/lib/security/password";
import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@prisma/client";

const schema = z.object({
  username: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._@-]+$/),
  password: z.string().min(14).max(200)
});

type AdminAccount = { username: string; passwordHash: string; name: string; email:string; role:UserRole };
const allowedRoles = new Set<UserRole>(["OWNER","ADMIN","MANAGER","FINANCE","ANALYST","ATTENDANCE","AUDITOR"]);

function configuredAdmins(): AdminAccount[] {
  const accounts: AdminAccount[] = [];
  for (const n of [1, 2]) {
    const username = process.env[`ADMIN_${n}_USERNAME`]?.trim().toLowerCase();
    const passwordHash = process.env[`ADMIN_${n}_PASSWORD_HASH`]?.trim();
    const name = process.env[`ADMIN_${n}_NAME`]?.trim() || (n === 1 ? "Gerrard" : "Ruy");
    const email = process.env[`ADMIN_${n}_EMAIL`]?.trim().toLowerCase() || `${username || `admin${n}`}@local.invalid`;
    const requested = (process.env[`ADMIN_${n}_ROLE`]?.trim().toUpperCase() || (n === 2 ? "OWNER" : "ADMIN")) as UserRole;
    const role:UserRole = allowedRoles.has(requested) ? requested : "ADMIN";
    if (username && passwordHash) accounts.push({ username, passwordHash, name, email, role });
  }
  return accounts;
}

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "admin-login", configuredLimit("RATE_LIMIT_ADMIN_LOGIN_PER_15_MIN", 8), 15 * 60_000);
    const input = schema.parse(await readJsonLimited(req, 8_192));
    const username = input.username.trim().toLowerCase();

    const databaseAccount = await prisma.user.findFirst({ where: { username, active: true } });
    let account:{username:string;name:string;role:UserRole}|null=null;
    if (databaseAccount?.passwordHash && verifyPassword(input.password, databaseAccount.passwordHash) && allowedRoles.has(databaseAccount.role)) {
      account={username:databaseAccount.username || username,name:databaseAccount.name,role:databaseAccount.role};
      await prisma.user.update({where:{id:databaseAccount.id},data:{lastLoginAt:new Date()}});
    } else {
      const envAccount = configuredAdmins().find(a => a.username === username);
      if (envAccount && verifyPassword(input.password, envAccount.passwordHash)) {
        const persisted=await prisma.user.upsert({
          where:{email:envAccount.email},
          create:{name:envAccount.name,email:envAccount.email,username:envAccount.username,passwordHash:envAccount.passwordHash,role:envAccount.role,active:true,lastLoginAt:new Date()},
          update:{name:envAccount.name,username:envAccount.username,passwordHash:envAccount.passwordHash,role:envAccount.role,active:true,lastLoginAt:new Date()}
        });
        account={username:persisted.username || envAccount.username,name:persisted.name,role:persisted.role};
      }
    }

    if (!account) return Response.json({ error: "Usuário ou senha inválidos" }, { status: 401 });

    const ttl = 8 * 60 * 60;
    const token = createSessionToken({ kind: "admin", sub: account.username, role: account.role }, ttl);
    const jar = await cookies();
    jar.set(ADMIN_COOKIE, token, secureCookieOptions(ttl));
    return Response.json({ ok: true, name: account.name, role:account.role });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Dados inválidos" }, { status: 400 });
    console.error("[ADMIN_LOGIN]", error instanceof Error ? error.message : "UNKNOWN");
    return Response.json({ error: "Falha de autenticação" }, { status: 500 });
  }
}

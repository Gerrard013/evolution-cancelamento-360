import { prisma } from "@/lib/db/prisma";
import { hmac } from "@/lib/security/crypto";

export async function enforcePersistentRateLimit(scope: string, identity: string, limit: number, windowMs: number) {
  const keyHash = hmac(`${scope}|${identity.trim().toLowerCase()}`, "IP_HASH_PEPPER");
  const now = new Date();
  const resetAt = new Date(Date.now() + windowMs);

  const current = await prisma.securityThrottle.findUnique({ where: { keyHash } });
  if (!current) {
    await prisma.securityThrottle.create({ data: { keyHash, count: 1, resetAt } });
    return;
  }

  if (current.resetAt <= now) {
    await prisma.securityThrottle.update({ where: { keyHash }, data: { count: 1, resetAt } });
    return;
  }

  if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt.getTime() - Date.now()) / 1000));
    throw new Response(JSON.stringify({ error: "Muitas tentativas. Aguarde e tente novamente." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) }
    });
  }

  await prisma.securityThrottle.update({ where: { keyHash }, data: { count: { increment: 1 } } });
}

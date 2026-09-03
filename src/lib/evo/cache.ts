import { prisma } from "@/lib/db/prisma";

export async function getCached<T>(cacheKey: string): Promise<T | null> {
  const row = await prisma.evoCache.findUnique({ where: { cacheKey } });
  if (!row || row.expiresAt <= new Date()) return null;
  return row.payload as T;
}

export async function setCached(cacheKey: string, payload: unknown, ttlSeconds: number) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await prisma.evoCache.upsert({
    where: { cacheKey },
    create: { cacheKey, payload: payload as never, expiresAt },
    update: { payload: payload as never, expiresAt }
  });
}

export async function invalidateCachePrefix(prefix: string) {
  await prisma.evoCache.deleteMany({ where: { cacheKey: { startsWith: prefix } } });
}

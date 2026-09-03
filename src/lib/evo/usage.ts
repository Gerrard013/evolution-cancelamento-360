import { prisma } from "@/lib/db/prisma";

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function recordEvoHit() {
  const key = monthKey();
  const row = await prisma.evoApiUsage.upsert({
    where: { monthKey: key },
    create: { monthKey: key, hitCount: 1 },
    update: { hitCount: { increment: 1 } }
  });
  const soft = Number(process.env.EVO_MONTHLY_REQUEST_SOFT_LIMIT || 900);
  const hard = Number(process.env.EVO_MONTHLY_REQUEST_HARD_LIMIT || 990);
  return { monthKey: key, hitCount: row.hitCount, softLimit: soft, hardLimit: hard, softExceeded: row.hitCount >= soft, hardExceeded: row.hitCount >= hard };
}

export async function currentEvoUsage() {
  const key = monthKey();
  const row = await prisma.evoApiUsage.findUnique({ where: { monthKey: key } });
  const soft = Number(process.env.EVO_MONTHLY_REQUEST_SOFT_LIMIT || 900);
  const hard = Number(process.env.EVO_MONTHLY_REQUEST_HARD_LIMIT || 990);
  return { monthKey: key, hitCount: row?.hitCount || 0, softLimit: soft, hardLimit: hard };
}

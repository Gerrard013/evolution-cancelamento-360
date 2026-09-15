import { prisma } from "@/lib/db/prisma";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("DB_HEALTH_TIMEOUT")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function GET() {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 2500);
    return Response.json({ ok: true, service: "evolution-cancelamento-360", database: "ok" }, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch {
    return Response.json({ ok: false, service: "evolution-cancelamento-360", database: "unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  }
}

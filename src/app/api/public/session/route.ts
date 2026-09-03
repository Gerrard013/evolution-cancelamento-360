import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashPublicAccessCode } from "@/lib/security/crypto";
import { CUSTOMER_COOKIE, createSessionToken, secureCookieOptions } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";

const schema = z.object({ accessId: z.string().trim().min(8).max(64) });

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "public-access", configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 10 * 60_000);
    const { accessId } = schema.parse(await readJsonLimited(req, 4_096));

    let contractId: string;
    let grantId: string;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE === "true" && accessId.toUpperCase() === "EV-DEMO-2026") {
      contractId = "demo-contract";
      grantId = "demo-grant";
    } else {
      const grant = await prisma.publicAccessGrant.findUnique({
        where: { codeHash: hashPublicAccessCode(accessId) },
        include: { contract: true }
      });
      if (!grant || !grant.active || grant.expiresAt <= new Date()) {
        return Response.json({ error: "ID de acesso inválido ou expirado" }, { status: 401 });
      }
      contractId = grant.contractId;
      grantId = grant.id;
      await prisma.publicAccessGrant.update({ where: { id: grant.id }, data: { lastUsedAt: new Date() } });
    }

    const ttl = 30 * 60;
    const token = createSessionToken({ kind: "customer", sub: contractId, grantId }, ttl);
    const jar = await cookies();
    jar.set(CUSTOMER_COOKIE, token, secureCookieOptions(ttl));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "ID de acesso inválido" }, { status: 400 });
    return Response.json({ error: "Não foi possível validar o acesso" }, { status: 500 });
  }
}

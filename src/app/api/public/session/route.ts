import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashPublicAccessCode } from "@/lib/security/crypto";
import { CUSTOMER_COOKIE, createSessionToken, secureCookieOptions } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { enforcePersistentRateLimit } from "@/lib/security/persistent-rate-limit";

const schema = z.object({ accessId: z.string().trim().min(8).max(64) });

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "public-access", configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 10 * 60_000);
    const { accessId } = schema.parse(await readJsonLimited(req, 4_096));
    await enforcePersistentRateLimit("public-access", hashPublicAccessCode(accessId), 10, 10 * 60_000);

    let contractId: string;
    let grantId: string;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE === "true" && accessId.toUpperCase() === "EV-DEMO-2026") {
      contractId = "demo-contract";
      grantId = "demo-grant";
    } else {
      const codeHash = hashPublicAccessCode(accessId);
      const grant = await prisma.publicAccessGrant.findUnique({
        where: { codeHash },
        include: { contract: true }
      });
      if (!grant || !grant.active || grant.expiresAt <= new Date() || grant.contract.status !== "ACTIVE") {
        return Response.json({ error: "ID de acesso inválido ou expirado" }, { status: 401 });
      }

      const consumed = await prisma.publicAccessGrant.updateMany({
        where: { id: grant.id, active: true, expiresAt: { gt: new Date() } },
        data: { active: false, lastUsedAt: new Date() }
      });
      if (consumed.count !== 1) return Response.json({ error: "ID de acesso já utilizado ou expirado" }, { status: 401 });

      contractId = grant.contractId;
      grantId = grant.id;
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

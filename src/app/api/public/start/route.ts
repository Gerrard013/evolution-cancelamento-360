import { cookies } from "next/headers";
import { z } from "zod";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { createSessionToken, PREAUTH_COOKIE, secureCookieOptions } from "@/lib/security/session";
import { syncMemberFromEvo } from "@/lib/evo/sync-service";

const schema = z.object({
  memberId: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/),
  birthDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/)
});

function isoDate(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "public-start", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 6), 10 * 60_000);
    if ((process.env.EVO_INTEGRATION_MODE || "manual") === "manual") {
      return Response.json({ error: "O cancelamento online ainda não está disponível. Procure a equipe Evolution." }, { status: 503 });
    }
    const input = schema.parse(await readJsonLimited(req, 4096));
    const synced = await syncMemberFromEvo(input.memberId);
    const suppliedBirth = input.birthDate;
    const actualBirth = isoDate(synced?.evoCustomer.birthDate);
    if (!synced || !actualBirth || actualBirth !== suppliedBirth) {
      return Response.json({ error: "Não foi possível confirmar seus dados. Confira a matrícula e a data de nascimento." }, { status: 401 });
    }

    const activeContracts = synced.contracts.filter(c => c.status === "ACTIVE");
    if (!activeContracts.length) return Response.json({ error: "Não encontramos contrato ativo para cancelamento." }, { status: 404 });

    const ttl = 10 * 60;
    const token = createSessionToken({ kind: "preauth", sub: synced.customer.id }, ttl);
    const jar = await cookies();
    jar.set(PREAUTH_COOKIE, token, secureCookieOptions(ttl));

    return Response.json({
      customerName: synced.customer.displayName,
      contracts: activeContracts.map(c => ({
        id: c.id,
        unit: c.unit,
        planName: c.planName,
        startDate: c.startDate,
        recurring: c.recurring,
        planType: c.planType
      }))
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Confira os dados informados." }, { status: 400 });
    return Response.json({ error: "Não foi possível iniciar o cancelamento agora. Tente novamente em instantes." }, { status: 502 });
  }
}

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

function publicIntegrationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "UNKNOWN");
  console.error("[EVO_PUBLIC_START]", message);

  if (message.includes("EVO_HTTP_401")) {
    return { status: 502, error: "A integração com o EVO não foi autorizada. Código EVO-401." };
  }
  if (message.includes("EVO_HTTP_403")) {
    return { status: 502, error: "A integração com o EVO não tem permissão suficiente. Código EVO-403." };
  }
  if (message.includes("EVO_HTTP_404")) {
    return { status: 502, error: "A rota configurada da API EVO não foi encontrada. Código EVO-404." };
  }
  if (message.includes("EVO_RESPONSE_TOO_LARGE")) {
    return { status: 502, error: "O EVO retornou um volume de dados maior que o limite atual. Código EVO-SIZE." };
  }
  if (message.includes("AbortError") || message.toLowerCase().includes("aborted")) {
    return { status: 504, error: "A API EVO demorou mais que o esperado para responder. Código EVO-TIMEOUT." };
  }
  if (message.includes("EVO_ACTIVE_CLIENTS_NOT_CONFIGURED") || message.includes("EVO_API_")) {
    return { status: 502, error: "A integração EVO ainda precisa de ajuste de configuração. Código EVO-CONFIG." };
  }

  return { status: 502, error: "Não foi possível consultar o EVO agora. Código EVO-502." };
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
    if (!activeContracts.length) {
      return Response.json({ error: "Não encontramos contrato ativo para cancelamento." }, { status: 404 });
    }

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
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Confira os dados informados." }, { status: 400 });
    }
    const mapped = publicIntegrationError(error);
    return Response.json({ error: mapped.error }, { status: mapped.status });
  }
}

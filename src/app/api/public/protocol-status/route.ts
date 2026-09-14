import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { syncMemberFromEvo } from "@/lib/evo/sync-service";
import { friendlyStatus } from "@/lib/ui/status";

const schema = z.object({
  protocol: z.string().trim().min(6).max(80),
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
    enforceRateLimit(req, "public-protocol-status", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 6), 10 * 60_000);
    if ((process.env.EVO_INTEGRATION_MODE || "manual") === "manual") {
      return Response.json({ error: "A consulta online está temporariamente indisponível." }, { status: 503 });
    }

    const input = schema.parse(await readJsonLimited(req, 4096));
    const synced = await syncMemberFromEvo(input.memberId);
    const actualBirth = isoDate(synced?.evoCustomer.birthDate);
    if (!synced || !actualBirth || actualBirth !== input.birthDate) {
      return Response.json({ error: "Não foi possível localizar esse protocolo com os dados informados." }, { status: 404 });
    }

    const item = await prisma.cancellationRequest.findUnique({
      where: { protocol: input.protocol },
      include: {
        contract: { select: { planName: true, unit: true } },
        calculations: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });

    if (!item || item.customerId !== synced.customer.id) {
      return Response.json({ error: "Não foi possível localizar esse protocolo com os dados informados." }, { status: 404 });
    }

    return Response.json({
      protocol: item.protocol,
      status: item.status,
      statusLabel: friendlyStatus(item.status),
      createdAt: item.createdAt.toISOString(),
      unit: item.contract.unit,
      planName: item.contract.planName,
      cancellationFee: Number(item.cancellationFee),
      cancellationFeePaid: Boolean(item.cancellationFeePaidAt),
      estimatedRefund: Number(item.calculations[0]?.estimatedRefund || 0)
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Confira os dados informados." }, { status: 400 });
    return Response.json({ error: "Não foi possível consultar o protocolo agora." }, { status: 502 });
  }
}

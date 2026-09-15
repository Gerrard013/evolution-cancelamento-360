import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { getPreauthSession } from "@/lib/security/session";
import { friendlyStatus } from "@/lib/ui/status";

const schema = z.object({
  protocol: z.string().trim().min(6).max(80)
});

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "public-protocol-status", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 8), 10 * 60_000);
    const preauth = await getPreauthSession();
    if (!preauth || !preauth.grantId) {
      return Response.json({ error: "Confirme sua identidade por CPF, e-mail e código antes de consultar o protocolo." }, { status: 401 });
    }
    const challenge = await prisma.identityChallenge.findUnique({ where: { id: preauth.grantId } });
    if (!challenge || !challenge.verifiedAt || challenge.customerId !== preauth.sub) {
      return Response.json({ error: "Sua validação de identidade expirou. Confirme seus dados novamente." }, { status: 401 });
    }

    const input = schema.parse(await readJsonLimited(req, 4096));
    const item = await prisma.cancellationRequest.findUnique({
      where: { protocol: input.protocol.replace(/^#/, "").trim() },
      include: {
        contract: { select: { planName: true, unit: true } },
        calculations: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });

    if (!item || item.customerId !== preauth.sub) {
      return Response.json({ error: "Não foi possível localizar esse protocolo para a identidade confirmada." }, { status: 404 });
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
      estimatedRefund: Number(item.calculations[0]?.estimatedRefund || 0),
      refundDueAt: item.refundDueAt?.toISOString() || null
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Confira o protocolo informado." }, { status: 400 });
    return Response.json({ error: "Não foi possível consultar o protocolo agora." }, { status: 500 });
  }
}

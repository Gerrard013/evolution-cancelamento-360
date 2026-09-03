import { z } from "zod";
import { getCustomerSession } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { previewForContract } from "@/lib/domain/refund-service";
import { calculateRefund } from "@/lib/calc/refund";

const schema = z.object({ desiredDate: z.coerce.date() });

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "refund-preview", configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 10 * 60_000);
    const session = await getCustomerSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { desiredDate } = schema.parse(await readJsonLimited(req, 4_096));

    if (session.sub === "demo-contract") {
      return Response.json({ eligible: true, rule: { version: "DEMO-v1", name: "Regra demonstrativa", percentage: 0.144 }, calculation: calculateRefund({ amountPaid: 1200, contractedDays: 365, unusedDays: 213, deductionRate: 0.144, priorRefunds: 0 }) });
    }

    const preview = await previewForContract(session.sub, desiredDate);
    return Response.json(preview);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Data inválida" }, { status: 400 });
    if (error instanceof Error && error.message === "CALCULATION_RULE_NOT_CONFIGURED") return Response.json({ eligible: false, reason: "A regra financeira ainda não foi homologada no sistema. Você pode seguir com o pedido; a equipe fará a conferência." });
    return Response.json({ error: "Não foi possível calcular a prévia" }, { status: 500 });
  }
}

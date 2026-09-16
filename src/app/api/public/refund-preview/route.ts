import { z } from "zod";
import { getCustomerSession } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { previewForContract } from "@/lib/domain/refund-service";

const schema = z.object({ desiredDate: z.coerce.date() });

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "refund-preview", configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 10 * 60_000);
    const session = await getCustomerSession();
    if (!session) return Response.json({ error: "Sua sessão expirou." }, { status: 401 });
    const { desiredDate } = schema.parse(await readJsonLimited(req, 4_096));
    const preview = await previewForContract(session.sub, desiredDate);
    return Response.json(preview);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Data inválida." }, { status: 400 });
    const code = error instanceof Error ? error.message : "PREVIEW_ERROR";
    if (["DESIRED_DATE_IN_PAST", "DESIRED_DATE_BEFORE_CONTRACT_START"].includes(code)) {
      return Response.json({ error: "A data pretendida para o cancelamento não pode estar no passado ou antes do início do contrato." }, { status: 400 });
    }
    return Response.json({ error: "Não foi possível calcular os valores agora." }, { status: 500 });
  }
}

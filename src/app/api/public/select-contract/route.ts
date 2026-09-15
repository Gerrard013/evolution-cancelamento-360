import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { CUSTOMER_COOKIE, getPreauthSession, PREAUTH_COOKIE, createSessionToken, secureCookieOptions } from "@/lib/security/session";

const schema = z.object({ contractId: z.string().cuid() });

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    const preauth = await getPreauthSession();
    if (!preauth || !preauth.grantId) return Response.json({ error: "Sua identificação expirou. Comece novamente." }, { status: 401 });
    const { contractId } = schema.parse(await readJsonLimited(req, 4096));
    const challenge = await prisma.identityChallenge.findUnique({ where: { id: preauth.grantId } });
    if (!challenge || !challenge.verifiedAt || challenge.customerId !== preauth.sub) {
      return Response.json({ error: "A validação de identidade não é mais válida." }, { status: 401 });
    }
    const contract = await prisma.contract.findFirst({ where: { id: contractId, customerId: preauth.sub, status: "ACTIVE" } });
    if (!contract) return Response.json({ error: "Contrato não disponível para cancelamento." }, { status: 404 });

    const ttl = 60 * 60;
    const token = createSessionToken({ kind: "customer", sub: contract.id, grantId: challenge.id }, ttl);
    const jar = await cookies();
    jar.set(CUSTOMER_COOKIE, token, secureCookieOptions(ttl));
    jar.set(PREAUTH_COOKIE, "", { ...secureCookieOptions(0), maxAge: 0 });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Contrato inválido." }, { status: 400 });
    return Response.json({ error: "Não foi possível abrir seu contrato." }, { status: 500 });
  }
}

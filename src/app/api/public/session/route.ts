import { assertTrustedOrigin } from "@/lib/security/request";

// Fluxo legado por ID temporário desativado na V7.
// Produção exige CPF + e-mail oficial do EVO + OTP de uso único.
export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    return Response.json({
      error: "Fluxo de acesso legado desativado. Use a validação oficial por CPF, e-mail cadastrado no EVO e código de confirmação.",
      next: "/api/public/identity/start"
    }, { status: 410 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }
}

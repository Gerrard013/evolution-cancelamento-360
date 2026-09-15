import { assertTrustedOrigin } from "@/lib/security/request";

// Fluxo legado removido na V7: matrícula + data de nascimento não é mais aceito
// como validação suficiente. O cancelamento deve começar por CPF + e-mail do EVO + OTP.
export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    return Response.json({
      error: "Fluxo de identificação atualizado. Confirme CPF, e-mail cadastrado no EVO e o código enviado por e-mail.",
      next: "/api/public/identity/start"
    }, { status: 410 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }
}

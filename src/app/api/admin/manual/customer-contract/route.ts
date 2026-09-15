import { assertTrustedOrigin } from "@/lib/security/request";
import { requireAdminApi } from "@/lib/auth/require-admin";

// V7: cadastro manual não entra no fluxo oficial de cancelamento.
// Aluno, CPF, e-mail e contrato devem vir do EVO/W12 para evitar divergência de dados.
export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    await requireAdminApi();
    return Response.json({ error: "Cadastro manual desativado. Consulte e valide os dados diretamente no EVO/W12." }, { status: 410 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }
}

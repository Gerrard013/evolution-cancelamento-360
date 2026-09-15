import { assertTrustedOrigin } from "@/lib/security/request";
import { requireAdminApi } from "@/lib/auth/require-admin";

// V7: links/IDs temporários deixaram de ser fator de autenticação.
// Todo cliente deve provar CPF + e-mail oficial do EVO + OTP.
export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    await requireAdminApi();
    return Response.json({ error: "Recurso legado desativado. O cliente deve usar o canal oficial com CPF + e-mail EVO + código OTP." }, { status: 410 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }
}

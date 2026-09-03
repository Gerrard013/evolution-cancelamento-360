import { requireAdminApi } from "@/lib/auth/require-admin";
import { currentEvoUsage } from "@/lib/evo/usage";

export async function GET() {
  try {
    await requireAdminApi();
    return Response.json(await currentEvoUsage());
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Falha ao consultar consumo" }, { status: 500 });
  }
}

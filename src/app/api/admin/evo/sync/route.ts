import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { syncMemberFromEvo } from "@/lib/evo/sync-service";

const schema = z.object({
  memberId: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/),
  unit: z.enum(["Condor", "Umarizal"])
});

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    await requireAdminApi();
    if ((process.env.EVO_INTEGRATION_MODE || "manual") === "manual") {
      return Response.json({ error: "A busca automática está indisponível neste momento." }, { status: 409 });
    }

    const { memberId, unit } = schema.parse(await readJsonLimited(req, 8_192));
    const synced = await syncMemberFromEvo(memberId, unit);
    if (!synced) return Response.json({ error: "Aluno não encontrado na unidade selecionada." }, { status: 404 });

    return Response.json({
      customer: {
        id: synced.customer.id,
        displayName: synced.customer.displayName,
        contactHint: synced.customer.contactHint
      },
      contracts: synced.contracts.map(contract => ({
        id: contract.id,
        unit: contract.unit,
        planName: contract.planName,
        planType: contract.planType,
        status: contract.status,
        startDate: contract.startDate,
        endDate: contract.endDate,
        amountPaid: Number(contract.amountPaid),
        recurring: contract.recurring,
        syncedAt: contract.syncedAt,
        metadata: contract.metadata
      }))
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Matrícula EVO ou unidade inválida." }, { status: 400 });
    const code = error instanceof Error ? error.message : "EVO_SYNC_ERROR";
    console.error("[ADMIN_EVO_SYNC]", code);
    return Response.json({ error: "Não foi possível localizar o aluno agora." }, { status: 502 });
  }
}

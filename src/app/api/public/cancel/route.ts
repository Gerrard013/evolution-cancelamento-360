import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { previewForContract } from "@/lib/domain/refund-service";
import { newProtocol } from "@/lib/domain/protocol";
import { decryptText } from "@/lib/security/crypto";
import { evoAdapter } from "@/lib/evo";

const schema = z.object({
  reasonCode: z.enum(["MUDANCA", "FINANCEIRO", "SAUDE", "HORARIO", "ATENDIMENTO", "OUTRO"]),
  reasonDetails: z.string().trim().max(1000).optional(),
  desiredDate: z.coerce.date(),
  termVersion: z.string().trim().min(3).max(80),
  accepted: z.literal(true)
});

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "cancel-submit", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 8), 10 * 60_000);
    const session = await getCustomerSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const input = schema.parse(await readJsonLimited(req, 16_384));

    if (session.sub === "demo-contract") {
      return Response.json({
        protocol: newProtocol(),
        status: "UNDER_REVIEW",
        directCancellation: false,
        message: "Demonstração: solicitação criada sem executar alteração no EVO."
      }, { status: 201 });
    }

    const contract = await prisma.contract.findUnique({ where: { id: session.sub }, include: { customer: true } });
    if (!contract || contract.status !== "ACTIVE") return Response.json({ error: "Contrato não está disponível para cancelamento" }, { status: 409 });

    const existing = await prisma.cancellationRequest.findUnique({ where: { activeKey: `${contract.id}:ACTIVE` } });
    if (existing) return Response.json({ error: "Já existe uma solicitação aberta", protocol: existing.protocol, status: existing.status }, { status: 409 });

    const preview = await previewForContract(contract.id, input.desiredDate).catch(() => null);
    const protocol = newProtocol();
    const fingerprint = requestFingerprint(req);
    const slaHours = Math.min(168, Math.max(1, Number(process.env.DEFAULT_SLA_HOURS || 48)));
    const directEnabled = process.env.CUSTOMER_DIRECT_CANCELLATION === "true" && process.env.EVO_INTEGRATION_MODE === "write" && process.env.EVO_WRITE_ENABLED === "true";

    const created = await prisma.$transaction(async (tx) => {
      const request = await tx.cancellationRequest.create({
        data: {
          protocol,
          activeKey: `${contract.id}:ACTIVE`,
          customerId: contract.customerId,
          contractId: contract.id,
          unit: contract.unit,
          reasonCode: input.reasonCode,
          reasonDetails: input.reasonDetails || null,
          desiredDate: input.desiredDate,
          status: directEnabled ? "EVO_CANCEL_REQUESTED" : "UNDER_REVIEW",
          slaDueAt: new Date(Date.now() + slaHours * 60 * 60 * 1000),
          termVersion: input.termVersion,
          termAcceptedAt: new Date()
        }
      });

      if (preview?.eligible) {
        await tx.refundCalculation.create({
          data: {
            requestId: request.id,
            ruleId: preview.rule.id,
            eligibleBase: preview.calculation.amountPaid,
            unusedBalance: preview.calculation.unusedBalance,
            deduction: preview.calculation.deduction,
            priorRefunds: preview.calculation.priorRefunds,
            estimatedRefund: preview.calculation.estimatedRefund,
            memory: preview.calculation.memory
          }
        });
      }

      await tx.auditEvent.create({
        data: {
          requestId: request.id,
          action: "PUBLIC_CANCELLATION_SUBMITTED",
          entity: "CancellationRequest",
          entityId: request.id,
          after: { protocol, status: request.status, reasonCode: input.reasonCode, termVersion: input.termVersion },
          ...fingerprint
        }
      });
      return request;
    });

    if (!directEnabled) {
      return Response.json({ protocol, status: created.status, directCancellation: false, message: "Solicitação registrada. A equipe fará a validação e o processamento no fluxo seguro." }, { status: 201 });
    }

    if (!contract.externalIdCiphertext) {
      await markManualReview(created.id, "MISSING_EVO_CONTRACT_ID");
      return Response.json({ protocol, status: "MANUAL_REVIEW", directCancellation: false, message: "Pedido recebido. A integração não possui identificador suficiente para cancelar automaticamente." }, { status: 201 });
    }

    try {
      const externalContractId = decryptText(contract.externalIdCiphertext);
      const result = await evoAdapter().cancelContract(externalContractId, protocol);
      const status = result.status === "cancelled" ? "EVO_CANCELLED" : "UNDER_REVIEW";
      await prisma.$transaction([
        prisma.cancellationRequest.update({
          where: { id: created.id },
          data: {
            status,
            evoOperationId: result.operationId || null,
            evoLastAttemptAt: new Date(),
            ...(status === "EVO_CANCELLED" ? { activeKey: null } : {})
          }
        }),
        prisma.contract.update({ where: { id: contract.id }, data: status === "EVO_CANCELLED" ? { status: "CANCELLED" } : {} }),
        prisma.auditEvent.create({
          data: {
            requestId: created.id,
            action: "EVO_CANCELLATION_RESULT",
            entity: "CancellationRequest",
            entityId: created.id,
            after: { status, operationId: result.operationId || null, rawStatus: result.rawStatus || null },
            ...fingerprint
          }
        })
      ]);
      return Response.json({ protocol, status, directCancellation: status === "EVO_CANCELLED", message: status === "EVO_CANCELLED" ? "Cancelamento confirmado pelo EVO. A prévia de estorno segue para o fluxo financeiro quando aplicável." : "Pedido aceito pelo EVO e aguardando confirmação final." }, { status: 201 });
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 80) : "EVO_WRITE_ERROR";
      await markManualReview(created.id, code);
      return Response.json({ protocol, status: "MANUAL_REVIEW", directCancellation: false, message: "Pedido registrado com segurança. A integração não confirmou o cancelamento e a equipe fará a conferência manual." }, { status: 201 });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Dados inválidos" }, { status: 400 });
    if (error instanceof Error && error.message === "CALCULATION_RULE_NOT_CONFIGURED") return Response.json({ error: "Regra financeira não configurada" }, { status: 409 });
    return Response.json({ error: "Não foi possível registrar o cancelamento" }, { status: 500 });
  }
}

async function markManualReview(requestId: string, code: string) {
  await prisma.cancellationRequest.update({
    where: { id: requestId },
    data: { status: "MANUAL_REVIEW", evoLastErrorCode: code, evoLastAttemptAt: new Date() }
  });
}

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { previewForContract } from "@/lib/domain/refund-service";
import { newProtocol } from "@/lib/domain/protocol";
import { encryptText } from "@/lib/security/crypto";

const PRIVACY_VERSION = "EVOLUTION-PRIVACIDADE-2026.09-v1";

const schema = z.object({
  reasonCode: z.enum(["MUDANCA", "FINANCEIRO", "SAUDE", "HORARIO", "ATENDIMENTO", "OUTRO"]),
  reasonDetails: z.string().trim().max(1000).optional(),
  desiredDate: z.coerce.date(),
  termVersion: z.string().trim().min(3).max(80),
  accepted: z.literal(true),
  privacyAccepted: z.literal(true),
  requesterAddress: z.string().trim().min(8).max(240),
  requesterRg: z.string().trim().min(3).max(40),
  pixKey: z.string().trim().max(180).optional()
});

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "cancel-draft", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 8), 10 * 60_000);
    const session = await getCustomerSession();
    if (!session) return Response.json({ error: "Sua sessão expirou. Volte ao início e confirme seus dados novamente." }, { status: 401 });
    const input = schema.parse(await readJsonLimited(req, 24_000));

    if (session.sub === "demo-contract") {
      return Response.json({ protocol: newProtocol(), status: "AWAITING_SIGNATURE", message: "Demonstração: termo preparado para assinatura." }, { status: 201 });
    }

    const contract = await prisma.contract.findUnique({ where: { id: session.sub }, include: { customer: true } });
    if (!contract || contract.status !== "ACTIVE") return Response.json({ error: "Contrato não está disponível para cancelamento" }, { status: 409 });

    const existing = await prisma.cancellationRequest.findUnique({ where: { activeKey: `${contract.id}:ACTIVE` } });
    if (existing) return Response.json({ error: `Já existe uma solicitação aberta para este contrato. Protocolo ${existing.protocol}.`, protocol: existing.protocol, status: existing.status }, { status: 409 });

    const preview = await previewForContract(contract.id, input.desiredDate).catch(() => null);
    const protocol = newProtocol();
    const fingerprint = requestFingerprint(req);
    const slaHours = Math.min(168, Math.max(1, Number(process.env.DEFAULT_SLA_HOURS || 48)));
    const now = new Date();

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
          status: "AWAITING_SIGNATURE",
          slaDueAt: new Date(Date.now() + slaHours * 60 * 60 * 1000),
          termVersion: input.termVersion,
          termAcceptedAt: now,
          termGeneratedAt: now,
          requesterAddressCiphertext: encryptText(input.requesterAddress),
          requesterRgCiphertext: encryptText(input.requesterRg),
          contactEmailCiphertext: contract.customer.emailCiphertext || null,
          pixKeyCiphertext: input.pixKey ? encryptText(input.pixKey) : null,
          privacyConsentVersion: PRIVACY_VERSION,
          privacyConsentAt: now,
          cancellationFee: preview?.kind === "RECURRING" && preview.feeRequired ? preview.feeAmount : 0
        }
      });
      if (preview?.kind === "ANNUAL" && preview.eligible) {
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
          action: "PUBLIC_TERM_GENERATED",
          entity: "CancellationRequest",
          entityId: request.id,
          after: { protocol, status: request.status, termVersion: input.termVersion, privacyConsentVersion: PRIVACY_VERSION, privacyAccepted: true },
          ...fingerprint
        }
      });
      return request;
    });

    return Response.json({ protocol, status: created.status, termUrl: `/api/public/term/${encodeURIComponent(protocol)}`, message: "Termo gerado. Baixe, assine e envie o arquivo assinado para concluir." }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Confira os dados do pedido, RG, endereço e aceite de privacidade antes de continuar." }, { status: 400 });
    return Response.json({ error: "Não foi possível gerar o termo de cancelamento" }, { status: 500 });
  }
}

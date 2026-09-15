import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCustomerSession } from "@/lib/security/session";
import { assertTrustedOrigin, readJsonLimited, requestFingerprint } from "@/lib/security/request";
import { configuredLimit, enforceRateLimit } from "@/lib/security/rate-limit";
import { previewForContract } from "@/lib/domain/refund-service";
import { newProtocol } from "@/lib/domain/protocol";
import { refundDeadlineFrom } from "@/lib/domain/deadline";
import { decryptText, encryptText } from "@/lib/security/crypto";

const schema = z.object({
  reasonCode: z.enum(["MUDANCA", "FINANCEIRO", "SAUDE", "HORARIO", "ATENDIMENTO", "OUTRO"]),
  reasonDetails: z.string().trim().max(1000).optional(),
  desiredDate: z.coerce.date(),
  accepted: z.literal(true),
  requesterAddress: z.string().trim().min(5).max(240),
  rg: z.string().trim().min(3).max(40),
  pixKey: z.string().trim().max(180).optional()
});

function financialSnapshot(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return { sourceAvailable: false, openInvoiceCount: 0 };
  const financial = (metadata as Record<string, unknown>).financial;
  if (!financial || typeof financial !== "object" || Array.isArray(financial)) return { sourceAvailable: false, openInvoiceCount: 0 };
  const data = financial as Record<string, unknown>;
  return { sourceAvailable: data.sourceAvailable === true, openInvoiceCount: Number(data.openInvoiceCount || 0) };
}

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    enforceRateLimit(req, "cancel-draft", Math.min(configuredLimit("RATE_LIMIT_PUBLIC_PER_10_MIN", 20), 8), 10 * 60_000);
    const session = await getCustomerSession();
    if (!session || !session.grantId) return Response.json({ error: "Sua sessão expirou. Volte ao início e confirme CPF, e-mail e código novamente." }, { status: 401 });
    const input = schema.parse(await readJsonLimited(req, 24_000));

    if (session.sub === "demo-contract") {
      return Response.json({ protocol: newProtocol(), status: "AWAITING_SIGNATURE", message: "Demonstração: termo preparado para assinatura." }, { status: 201 });
    }

    const contract = await prisma.contract.findUnique({ where: { id: session.sub }, include: { customer: true } });
    if (!contract || contract.status !== "ACTIVE") return Response.json({ error: "Contrato não está disponível para cancelamento" }, { status: 409 });

    const challenge = await prisma.identityChallenge.findUnique({ where: { id: session.grantId } });
    if (!challenge || !challenge.verifiedAt || challenge.purpose !== "CANCELLATION" || challenge.customerId !== contract.customerId) {
      return Response.json({ error: "A validação de identidade não é mais válida. Confirme seu e-mail novamente." }, { status: 401 });
    }

    const existing = await prisma.cancellationRequest.findUnique({ where: { activeKey: `${contract.id}:ACTIVE` } });
    if (existing) return Response.json({ error: `Já existe uma solicitação aberta para este contrato. Protocolo ${existing.protocol}.`, protocol: existing.protocol, status: existing.status }, { status: 409 });

    const financial = financialSnapshot(contract.metadata);
    if (financial.sourceAvailable && financial.openInvoiceCount > 0) {
      return Response.json({ error: "Constam débitos em aberto no EVO/W12. A Cláusula 21 exige que o contrato esteja em dia antes do cancelamento. Procure a equipe Evolution para regularização." }, { status: 409 });
    }

    const preview = await previewForContract(contract.id, input.desiredDate).catch(() => null);
    if (!preview) return Response.json({ error: "Não foi possível calcular as condições do contrato. A equipe precisa conferir os dados do EVO/W12." }, { status: 409 });
    if (preview.kind === "ANNUAL" && preview.eligible && preview.calculation.estimatedRefund > 0 && !input.pixKey?.trim()) {
      return Response.json({ error: "Informe a chave PIX para o recebimento do estorno." }, { status: 400 });
    }

    const protocol = newProtocol();
    const fingerprint = requestFingerprint(req);
    const now = new Date();
    const slaHours = Math.min(168, Math.max(1, Number(process.env.DEFAULT_SLA_HOURS || 48)));
    const termVersion = process.env.CANCELLATION_TERM_VERSION?.trim() || "EV-CAN-2026.09-v7";
    let cpf = "";
    try { if (contract.customer.documentCiphertext) cpf = decryptText(contract.customer.documentCiphertext); } catch {}
    if (!cpf) return Response.json({ error: "O CPF validado não está disponível para emissão do termo. Confirme seus dados novamente." }, { status: 409 });
    const refundDueAt = preview.kind === "ANNUAL" && preview.eligible && preview.calculation.estimatedRefund > 0 ? refundDeadlineFrom(now) : null;

    const created = await prisma.$transaction(async (tx) => {
      const request = await tx.cancellationRequest.create({
        data: {
          protocol,
          activeKey: `${contract.id}:ACTIVE`,
          customerId: contract.customerId,
          contractId: contract.id,
          unit: contract.unit,
          reasonCode: input.reasonCode,
          reasonDetails: null,
          reasonDetailsCiphertext: input.reasonDetails?.trim() ? encryptText(input.reasonDetails.trim()) : null,
          desiredDate: input.desiredDate,
          status: "AWAITING_SIGNATURE",
          slaDueAt: new Date(now.getTime() + slaHours * 60 * 60 * 1000),
          termVersion,
          termAcceptedAt: now,
          termGeneratedAt: now,
          requesterAddress: null,
          requesterAddressCiphertext: encryptText(input.requesterAddress.trim()),
          rgCiphertext: encryptText(input.rg.trim()),
          cpfLast4: cpf.slice(-4),
          verifiedEmailMask: challenge.emailMask,
          identityVerifiedAt: challenge.verifiedAt,
          identityMethod: "EVO_EMAIL_OTP",
          lgpdConsentVersion: challenge.consentVersion,
          lgpdConsentAt: challenge.consentAcceptedAt,
          sourceChannel: "OFFICIAL_PORTAL",
          contactEmail: null,
          pixKey: null,
          pixKeyCiphertext: input.pixKey?.trim() ? encryptText(input.pixKey.trim()) : null,
          refundDueAt,
          cancellationFee: preview.kind === "RECURRING" && preview.feeRequired ? preview.feeAmount : 0
        }
      });
      if (preview.kind === "ANNUAL" && preview.eligible) {
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
          action: "PUBLIC_TERM_GENERATED_VERIFIED",
          entity: "CancellationRequest",
          entityId: request.id,
          after: {
            protocol,
            status: request.status,
            termVersion,
            identityMethod: "EVO_EMAIL_OTP",
            verifiedEmailMask: challenge.emailMask,
            lgpdConsentVersion: challenge.consentVersion,
            refundDueAt: refundDueAt?.toISOString() || null,
            financialCheck: financial.sourceAvailable ? "EVO_CHECKED" : "NOT_CONFIGURED",
            protectedFields: ["cpf", "rg", "email", "address", "pix", "reasonDetails"]
          },
          ...fingerprint
        }
      });
      return request;
    });

    return Response.json({
      protocol,
      status: created.status,
      termUrl: `/api/public/term/${encodeURIComponent(protocol)}`,
      refundDueAt: created.refundDueAt?.toISOString() || null,
      message: "Termo oficial gerado. Confira, assine e envie o arquivo assinado para concluir."
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "Confira os dados do pedido antes de continuar." }, { status: 400 });
    console.error("[PUBLIC_CANCEL]", error instanceof Error ? error.message : "UNKNOWN");
    return Response.json({ error: "Não foi possível gerar o termo de cancelamento" }, { status: 500 });
  }
}

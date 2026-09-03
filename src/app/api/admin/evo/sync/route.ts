import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { assertTrustedOrigin, readJsonLimited } from "@/lib/security/request";
import { encryptText, hmac } from "@/lib/security/crypto";
import { evoAdapter } from "@/lib/evo";

const schema = z.object({ memberId: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/) });

export async function POST(req: Request) {
  try {
    assertTrustedOrigin(req);
    await requireAdminApi();
    if (process.env.EVO_INTEGRATION_MODE === "manual") return Response.json({ error: "Integração EVO está em modo manual" }, { status: 409 });
    const { memberId } = schema.parse(await readJsonLimited(req, 8_192));
    const evo = evoAdapter();
    const customer = await evo.findCustomerById(memberId);
    if (!customer) return Response.json({ error: "Aluno não encontrado pelo ID informado" }, { status: 404 });
    const contracts = await evo.listContracts(customer.externalId);

    const customerHash = hmac(customer.externalId, "EXTERNAL_ID_PEPPER");
    const savedCustomer = await prisma.customer.upsert({
      where: { externalIdHash: customerHash },
      create: {
        externalIdHash: customerHash,
        externalIdCiphertext: encryptText(customer.externalId),
        displayName: customer.name,
        contactHint: customer.contactHint || null
      },
      update: {
        externalIdCiphertext: encryptText(customer.externalId),
        displayName: customer.name,
        contactHint: customer.contactHint || null
      }
    });

    const savedContracts = [];
    for (const contract of contracts) {
      const externalIdHash = hmac(contract.externalId, "EXTERNAL_ID_PEPPER");
      const saved = await prisma.contract.upsert({
        where: { externalIdHash },
        create: {
          externalIdHash,
          externalIdCiphertext: encryptText(contract.externalId),
          customerId: savedCustomer.id,
          unit: contract.unit,
          planName: contract.planName,
          planType: contract.planType,
          startDate: new Date(contract.startDate),
          endDate: contract.endDate ? new Date(contract.endDate) : null,
          amountPaid: contract.amountPaid,
          recurring: contract.recurring,
          status: contract.status,
          syncedAt: new Date()
        },
        update: {
          customerId: savedCustomer.id,
          unit: contract.unit,
          planName: contract.planName,
          planType: contract.planType,
          startDate: new Date(contract.startDate),
          endDate: contract.endDate ? new Date(contract.endDate) : null,
          amountPaid: contract.amountPaid,
          recurring: contract.recurring,
          status: contract.status,
          syncedAt: new Date()
        }
      });
      savedContracts.push({ id: saved.id, unit: saved.unit, planName: saved.planName, status: saved.status, endDate: saved.endDate });
    }

    return Response.json({ customer: { id: savedCustomer.id, displayName: savedCustomer.displayName, contactHint: savedCustomer.contactHint }, contracts: savedContracts });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return Response.json({ error: "ID EVO inválido" }, { status: 400 });
    const code = error instanceof Error ? error.message : "SYNC_ERROR";
    return Response.json({ error: "Não foi possível sincronizar com o EVO", code }, { status: 502 });
  }
}

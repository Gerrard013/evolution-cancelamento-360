import { prisma } from "@/lib/db/prisma";
import { encryptText, hmac } from "@/lib/security/crypto";
import { evoAdapter } from "@/lib/evo";
import type { EvoCustomer } from "./types";

function normalizedUnit(value: string) {
  if (/condor/i.test(value)) return "Condor";
  if (/umarizal/i.test(value)) return "Umarizal";
  return value || "Evolution";
}

function activeLike(status: string) {
  const value = status.toUpperCase();
  const configured = (process.env.EVO_ACTIVE_CONTRACT_STATUSES || "ACTIVE,ATIVO,ATIVA,VIGENTE,OPEN,1").split(",").map(v => v.trim().toUpperCase()).filter(Boolean);
  return configured.some(x => value === x || value.includes(x));
}

export async function syncMemberFromEvo(memberId: string) {
  const evo = evoAdapter();
  const customer: EvoCustomer | null = await evo.findCustomerById(memberId);
  if (!customer) return null;
  const contracts = await evo.listContracts(customer.externalId);

  const customerHash = hmac(customer.externalId, "EXTERNAL_ID_PEPPER");
  const cpfCiphertext = customer.cpf ? encryptText(customer.cpf) : undefined;
  const savedCustomer = await prisma.customer.upsert({
    where: { externalIdHash: customerHash },
    create: {
      externalIdHash: customerHash,
      externalIdCiphertext: encryptText(customer.externalId),
      cpfCiphertext,
      displayName: customer.name,
      contactHint: customer.contactHint || null
    },
    update: {
      externalIdCiphertext: encryptText(customer.externalId),
      ...(cpfCiphertext ? { cpfCiphertext } : {}),
      displayName: customer.name,
      contactHint: customer.contactHint || null
    }
  });

  const savedContracts = [];
  for (const contract of contracts) {
    const externalIdHash = hmac(contract.externalId, "EXTERNAL_ID_PEPPER");
    const metadata = {
      paymentMethodId: contract.paymentMethodId || null,
      hasStoredCard: contract.hasStoredCard ?? null,
      sourceStatus: contract.status
    };
    const saved = await prisma.contract.upsert({
      where: { externalIdHash },
      create: {
        externalIdHash,
        externalIdCiphertext: encryptText(contract.externalId),
        customerId: savedCustomer.id,
        unit: normalizedUnit(contract.unit),
        planName: contract.planName,
        planType: contract.planType,
        startDate: new Date(contract.startDate),
        endDate: contract.endDate ? new Date(contract.endDate) : null,
        amountPaid: contract.amountPaid,
        recurring: contract.recurring || /recorr/i.test(`${contract.planType} ${contract.planName}`),
        status: activeLike(contract.status) ? "ACTIVE" : contract.status,
        metadata,
        syncedAt: new Date()
      },
      update: {
        customerId: savedCustomer.id,
        unit: normalizedUnit(contract.unit),
        planName: contract.planName,
        planType: contract.planType,
        startDate: new Date(contract.startDate),
        endDate: contract.endDate ? new Date(contract.endDate) : null,
        amountPaid: contract.amountPaid,
        recurring: contract.recurring || /recorr/i.test(`${contract.planType} ${contract.planName}`),
        status: activeLike(contract.status) ? "ACTIVE" : contract.status,
        metadata,
        syncedAt: new Date()
      }
    });
    savedContracts.push(saved);
  }

  return { evoCustomer: customer, customer: savedCustomer, contracts: savedContracts };
}

import { prisma } from "@/lib/db/prisma";
import { encryptText, hmac } from "@/lib/security/crypto";
import { evoAdapter } from "@/lib/evo";
import type { EvoCustomer } from "./types";

export function canonicalEvoProfile(value?: string) {
  const profile = (value || "").trim().toUpperCase();
  if (profile.includes("CONDOR")) return "CONDOR";
  if (profile.includes("UMARIZAL") || profile.includes("MARIZAL")) return "UMARIZAL";
  return "DEFAULT";
}

function normalizedUnit(value: string, profileKey?: string) {
  const profile = canonicalEvoProfile(profileKey);
  if (profile === "CONDOR") return "Condor";
  if (profile === "UMARIZAL") return "Umarizal";
  if (/condor/i.test(value)) return "Condor";
  if (/umarizal/i.test(value)) return "Umarizal";
  return value || "Evolution";
}

function activeLike(status: string) {
  const value = status.trim().toUpperCase();
  const configured = (process.env.EVO_ACTIVE_CONTRACT_STATUSES || "ACTIVE,ATIVO,ATIVA,VIGENTE,OPEN,1")
    .split(",")
    .map(v => v.trim().toUpperCase())
    .filter(Boolean);
  // Fail closed: never use substring matching here (e.g. INACTIVE contains ACTIVE).
  return configured.includes(value);
}

export async function syncMemberFromEvo(memberId: string, profileKey?: string) {
  const profile = canonicalEvoProfile(profileKey);
  const evo = evoAdapter(profile);
  const customer: EvoCustomer | null = await evo.findCustomerById(memberId);
  if (!customer) return null;
  const contracts = await evo.listContracts(customer.externalId);

  // Always scope external identities by the canonical EVO unit profile. This keeps
  // public CPF login and staff matrícula lookup on the same Customer/Contract rows.
  const customerHash = hmac(`${profile}:${customer.externalId}`, "EXTERNAL_ID_PEPPER");
  const cpfCiphertext = customer.cpf ? encryptText(customer.cpf) : undefined;
  const emailCiphertext = customer.email ? encryptText(customer.email.toLowerCase()) : undefined;
  const savedCustomer = await prisma.customer.upsert({
    where: { externalIdHash: customerHash },
    create: {
      externalIdHash: customerHash,
      externalIdCiphertext: encryptText(customer.externalId),
      cpfCiphertext,
      emailCiphertext,
      displayName: customer.name,
      contactHint: customer.contactHint || null
    },
    update: {
      externalIdCiphertext: encryptText(customer.externalId),
      ...(cpfCiphertext ? { cpfCiphertext } : {}),
      ...(emailCiphertext ? { emailCiphertext } : {}),
      displayName: customer.name,
      contactHint: customer.contactHint || null
    }
  });

  const savedContracts = [];
  for (const contract of contracts) {
    const unit = normalizedUnit(contract.unit, profile);
    const externalIdHash = hmac(`${profile}:${contract.externalId}`, "EXTERNAL_ID_PEPPER");
    const metadata = {
      paymentMethodId: contract.paymentMethodId || null,
      hasStoredCard: contract.hasStoredCard ?? null,
      sourceStatus: contract.status,
      evoProfile: profile
    };
    const normalizedStatus = activeLike(contract.status) ? "ACTIVE" : contract.status.trim().toUpperCase() || "UNKNOWN";
    const saved = await prisma.contract.upsert({
      where: { externalIdHash },
      create: {
        externalIdHash,
        externalIdCiphertext: encryptText(contract.externalId),
        customerId: savedCustomer.id,
        unit,
        planName: contract.planName,
        planType: contract.planType,
        startDate: new Date(contract.startDate),
        endDate: contract.endDate ? new Date(contract.endDate) : null,
        amountPaid: contract.amountPaid,
        recurring: contract.recurring || /recorr/i.test(`${contract.planType} ${contract.planName}`),
        status: normalizedStatus,
        metadata,
        syncedAt: new Date()
      },
      update: {
        customerId: savedCustomer.id,
        unit,
        planName: contract.planName,
        planType: contract.planType,
        startDate: new Date(contract.startDate),
        endDate: contract.endDate ? new Date(contract.endDate) : null,
        amountPaid: contract.amountPaid,
        recurring: contract.recurring || /recorr/i.test(`${contract.planType} ${contract.planName}`),
        status: normalizedStatus,
        metadata,
        syncedAt: new Date()
      }
    });
    savedContracts.push(saved);
  }

  return { evoCustomer: customer, customer: savedCustomer, contracts: savedContracts };
}

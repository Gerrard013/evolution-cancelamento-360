import { prisma } from "@/lib/db/prisma";
import { encryptText, hmac } from "@/lib/security/crypto";
import { evoAdapter } from "@/lib/evo";
import type { EvoCustomer } from "./types";
import { normalizeCpf } from "@/lib/identity/cpf";
import { maskEmail } from "@/lib/email/smtp";

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

async function saveCustomerAndContracts(customer: EvoCustomer) {
  const evo = evoAdapter();
  const contracts = await evo.listContracts(customer.externalId);
  const customerHash = hmac(customer.externalId, "EXTERNAL_ID_PEPPER");
  const cpf = normalizeCpf(customer.document || "");
  const email = customer.email?.trim().toLowerCase() || "";

  const savedCustomer = await prisma.customer.upsert({
    where: { externalIdHash: customerHash },
    create: {
      externalIdHash: customerHash,
      externalIdCiphertext: encryptText(customer.externalId),
      documentHash: cpf ? hmac(cpf, "EXTERNAL_ID_PEPPER") : null,
      documentCiphertext: cpf ? encryptText(cpf) : null,
      emailHash: email ? hmac(email, "EXTERNAL_ID_PEPPER") : null,
      emailCiphertext: email ? encryptText(email) : null,
      emailMask: email ? maskEmail(email) : null,
      displayName: customer.name,
      contactHint: customer.contactHint || (email ? maskEmail(email) : null)
    },
    update: {
      externalIdCiphertext: encryptText(customer.externalId),
      documentHash: cpf ? hmac(cpf, "EXTERNAL_ID_PEPPER") : undefined,
      documentCiphertext: cpf ? encryptText(cpf) : undefined,
      emailHash: email ? hmac(email, "EXTERNAL_ID_PEPPER") : undefined,
      emailCiphertext: email ? encryptText(email) : undefined,
      emailMask: email ? maskEmail(email) : undefined,
      displayName: customer.name,
      contactHint: customer.contactHint || (email ? maskEmail(email) : null)
    }
  });

  const savedContracts = [];
  for (const contract of contracts) {
    const externalIdHash = hmac(contract.externalId, "EXTERNAL_ID_PEPPER");
    const invoices = await evo.listInvoices(customer.externalId).catch(() => []);
    const contractInvoices = invoices.filter(i => !i.contractExternalId || i.contractExternalId === contract.externalId);
    const openInvoices = contractInvoices.filter(i => i.open);
    const metadata = {
      paymentMethodId: contract.paymentMethodId || null,
      hasStoredCard: contract.hasStoredCard ?? null,
      sourceStatus: contract.status,
      financial: {
        checkedAt: new Date().toISOString(),
        openInvoiceCount: openInvoices.length,
        openInvoiceAmount: openInvoices.reduce((sum, item) => sum + item.amount, 0),
        sourceAvailable: Boolean(process.env.EVO_INVOICES_BY_MEMBER_PATH?.trim())
      }
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

export async function syncMemberFromEvo(memberId: string) {
  const evo = evoAdapter();
  const customer: EvoCustomer | null = await evo.findCustomerById(memberId);
  if (!customer) return null;
  return saveCustomerAndContracts(customer);
}

export async function syncMemberFromEvoByCpf(cpf: string) {
  const evo = evoAdapter();
  const customer = await evo.findCustomerByCpf(cpf);
  if (!customer) return null;
  return saveCustomerAndContracts(customer);
}

export async function syncKnownEvoCustomer(customer: EvoCustomer) {
  return saveCustomerAndContracts(customer);
}

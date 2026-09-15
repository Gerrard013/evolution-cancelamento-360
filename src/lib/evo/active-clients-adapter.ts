import type { EvoAdapter } from "./adapter";
import type { EvoCancelResult, EvoContract, EvoCustomer, EvoPaymentMethodResult } from "./types";
import { HttpEvoAdapter } from "./http-adapter";
import { recordEvoHit } from "./usage";
import { evoAuthHeaders } from "./credentials";

const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const PROFILE_TTL_MS = 30_000;
const profileCache = new Map<string, { at: number; raw: Record<string, unknown> }>();

function maxResponseBytes() {
  const configured = Number(process.env.EVO_MAX_RESPONSE_BYTES || DEFAULT_MAX_RESPONSE_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_RESPONSE_BYTES;
}
function obj(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}
function str(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}
function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function bool(value: unknown) {
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}
function dateOf(value: unknown) {
  const raw = str(value)?.trim();
  if (!raw) return undefined;
  const br = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}T00:00:00.000Z`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}
function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function profilePath(memberId: string) {
  const template = process.env.EVO_MEMBER_PROFILE_PATH || "/api/v1/members/{idMember}";
  return template.replace("{idMember}", encodeURIComponent(memberId));
}

async function memberProfileRaw(memberId: string, profileOrUnit?: string) {
  const cacheKey = `${(profileOrUnit || "DEFAULT").toUpperCase()}:${memberId}`;
  const cached = profileCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PROFILE_TTL_MS) return cached.raw;

  const base = process.env.EVO_API_BASE_URL?.trim();
  if (!base) throw new Error("EVO_API_BASE_URL_NOT_CONFIGURED");
  const baseUrl = new URL(base);
  const target = new URL(profilePath(memberId), baseUrl);
  if (baseUrl.protocol !== "https:" || target.origin !== baseUrl.origin) throw new Error("EVO_MEMBER_PROFILE_INVALID_URL");

  for (let attempt = 1; attempt <= 2; attempt++) {
    const usage = await recordEvoHit();
    if (usage.hitCount > usage.hardLimit) throw new Error("EVO_API_BUDGET_HARD_LIMIT");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.EVO_REQUEST_TIMEOUT_MS || 12000));
    try {
      const response = await fetch(target, {
        headers: { Accept: "application/json, text/json, text/plain", ...evoAuthHeaders(profileOrUnit) },
        redirect: "error",
        cache: "no-store",
        signal: controller.signal
      });
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > maxResponseBytes()) throw new Error("EVO_RESPONSE_TOO_LARGE");

      if (!response.ok) {
        console.error("[EVO_MEMBER_PROFILE_HTTP]", response.status, text.slice(0, 500));
        if ([502, 503, 504].includes(response.status) && attempt < 2) {
          await wait(600 * attempt);
          continue;
        }
        throw new Error(`EVO_HTTP_${response.status}`);
      }

      const parsed = text ? JSON.parse(text) : {};
      const raw = obj(parsed);
      profileCache.set(cacheKey, { at: Date.now(), raw });
      return raw;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("EVO_HTTP_502");
}

function customerFromProfile(data: Record<string, unknown>): EvoCustomer | null {
  const externalId = str(data.idMember ?? data.id_member ?? data.id);
  if (!externalId) return null;

  const firstName = str(data.firstName ?? data.first_name) || "";
  const lastName = str(data.lastName ?? data.last_name) || "";
  const name = `${firstName} ${lastName}`.trim() || str(data.name) || "Cliente";
  const birthDate = dateOf(data.birthDate ?? data.birth_date);
  const email = str(data.email)?.trim().toLowerCase();
  const cpfRaw = str(data.cpf ?? data.CPF ?? data.document ?? data.documentNumber ?? data.cpfCnpj);
  const cpf = cpfRaw?.replace(/\D/g, "") || undefined;

  let phoneLast4: string | undefined;
  const contacts = Array.isArray(data.contacts) ? data.contacts : [];
  for (const contact of contacts) {
    const c = obj(contact);
    const candidate = str(c.description ?? c.contact ?? c.number ?? c.phone ?? c.value);
    const digits = candidate?.replace(/\D/g, "") || "";
    if (digits.length >= 4) {
      phoneLast4 = digits.slice(-4);
      break;
    }
  }

  const contactHint = email ? email.replace(/^(.).+(@.*)$/, "$1•••$2") : phoneLast4 ? `•••• ${phoneLast4}` : undefined;
  return { externalId, name, birthDate, phoneLast4, contactHint, email, cpf };
}

function membershipStatus(value: unknown) {
  const raw = str(value)?.trim() || "ACTIVE";
  const upper = raw.toUpperCase();
  if (upper.includes("ATIV") || upper.includes("ACTIVE") || upper.includes("VIGENT")) return "ACTIVE";
  return raw;
}

function contractsFromProfile(data: Record<string, unknown>, customerExternalId: string): EvoContract[] {
  const branchName = str(data.branchName ?? data.branch_name) || "Evolution";
  const source = Array.isArray(data.memberships)
    ? data.memberships
    : data.membership && typeof data.membership === "object"
      ? [data.membership]
      : [];

  const contracts: EvoContract[] = [];
  for (const entry of source) {
    const membership = obj(entry);
    const externalId = str(
      membership.idMemberMembership ??
      membership.id_member_membership ??
      membership.idMembership ??
      membership.id_membership ??
      membership._IdVenda ??
      membership.idSale ??
      membership.id_sale
    );
    if (!externalId) continue;

    const planName = str(membership.name) || "Plano Evolution";
    const membershipType = str(membership.membershipType ?? membership.membership_type) || "";
    const nextMonthValue = num(membership.valueNextMonth ?? membership.value_next_month);
    const originalValue = num(membership.originalValue ?? membership.original_value);
    const recurring = /recorr/i.test(`${planName} ${membershipType}`) || nextMonthValue > 0;

    contracts.push({
      externalId,
      customerExternalId,
      unit: branchName,
      planName,
      planType: membershipType || (recurring ? "RECORRENTE" : "ANUAL"),
      startDate: dateOf(membership.startDate ?? membership.start_date) || new Date().toISOString(),
      endDate: dateOf(membership.endDate ?? membership.end_date),
      amountPaid: originalValue || nextMonthValue,
      recurring,
      status: membershipStatus(membership.membershipStatus ?? membership.membership_status),
      paymentMethodId: undefined,
      hasStoredCard: false
    });
  }
  return contracts;
}

export class ActiveClientsEvoAdapter implements EvoAdapter {
  private readonly fallback: HttpEvoAdapter;
  private readonly profileOrUnit?: string;

  constructor(profileOrUnit?: string) {
    this.profileOrUnit = profileOrUnit;
    this.fallback = new HttpEvoAdapter(profileOrUnit);
  }

  async findCustomerById(memberId: string) {
    const raw = await memberProfileRaw(memberId, this.profileOrUnit);
    return customerFromProfile(raw);
  }

  async listContracts(customerExternalId: string) {
    const raw = await memberProfileRaw(customerExternalId, this.profileOrUnit);
    return contractsFromProfile(raw, customerExternalId);
  }

  getContract(contractExternalId: string) { return this.fallback.getContract(contractExternalId); }
  cancelContract(contractExternalId: string, protocol: string): Promise<EvoCancelResult> { return this.fallback.cancelContract(contractExternalId, protocol); }
  removeStoredPaymentMethod(contractExternalId: string, customerExternalId: string, protocol: string): Promise<EvoPaymentMethodResult> { return this.fallback.removeStoredPaymentMethod(contractExternalId, customerExternalId, protocol); }
}

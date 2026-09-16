import { getCached, setCached } from "./cache";
import { recordEvoHit } from "./usage";
import { evoAuthHeaders } from "./credentials";
import type { EvoAdapter } from "./adapter";
import type { EvoCancelResult, EvoContract, EvoCustomer, EvoPaymentMethodResult } from "./types";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function baseUrl(): URL {
  const raw = process.env.EVO_API_BASE_URL?.trim();
  if (!raw) throw new Error("EVO_API_BASE_URL_NOT_CONFIGURED");
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("EVO_API_BASE_URL_MUST_USE_HTTPS");
  }
  return url;
}

function pathFromEnv(name: string, params: Record<string, string>): string {
  const template = process.env[name]?.trim();
  if (!template) throw new Error(`${name}_NOT_CONFIGURED`);
  if (!template.startsWith("/") || template.includes("://")) throw new Error(`${name}_INVALID_PATH`);
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined) throw new Error(`${name}_MISSING_PARAM_${key}`);
    return encodeURIComponent(value);
  });
}

function withHardTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(code)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function evoFetch(path: string, init: RequestInit = {}, profileOrUnit?: string) {
  const base = baseUrl();
  const target = new URL(path, base);
  if (target.origin !== base.origin) throw new Error("EVO_SSRF_BLOCKED");

  const usage = await withHardTimeout(recordEvoHit(), 3000, "EVO_USAGE_TIMEOUT");
  if (usage.hitCount > usage.hardLimit) throw new Error("EVO_API_BUDGET_HARD_LIMIT");

  const timeoutMs = Math.min(12000, Math.max(3000, Number(process.env.EVO_REQUEST_TIMEOUT_MS || 8000)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await withHardTimeout(fetch(target, {
      ...init,
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...evoAuthHeaders(profileOrUnit),
        ...(init.headers || {})
      }
    }), timeoutMs + 500, "EVO_FETCH_TIMEOUT");
    const text = await withHardTimeout(response.text(), timeoutMs + 500, "EVO_BODY_TIMEOUT");
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error("EVO_RESPONSE_TOO_LARGE");
    if (!response.ok) throw new Error(`EVO_HTTP_${response.status}`);
    if (!text) return {};
    try { return JSON.parse(text); }
    catch { throw new Error("EVO_INVALID_JSON"); }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("EVO_FETCH_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return undefined;
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

function obj(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

function asEntityName(value: unknown): string | undefined {
  const direct = asString(value);
  if (direct) return direct;
  const data = obj(value);
  return asString(pick(data, "name", "nome", "title", "descricao", "description"));
}

function normalizeDateString(value: unknown): string | undefined {
  const raw = asString(value)?.trim();
  if (!raw) return undefined;
  const br = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}T00:00:00.000Z`;
  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? undefined : iso.toISOString();
}

function firstPayloadObject(raw: unknown): Record<string, unknown> {
  if (Array.isArray(raw)) return obj(raw[0]);
  const root = obj(raw);
  for (const key of ["data", "item", "result", "member", "customer", "cliente", "aluno"]) {
    const value = root[key];
    if (Array.isArray(value) && value.length) return obj(value[0]);
    if (value && typeof value === "object") return obj(value);
  }
  return root;
}

function pick(data: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (data[key] !== undefined && data[key] !== null) return data[key];
  return undefined;
}

function mapCustomer(raw: unknown): EvoCustomer | null {
  const data = firstPayloadObject(raw);
  const id = asString(pick(data, "id", "externalId", "memberId", "idMember", "idCliente"));
  if (!id) return null;
  const firstName = asString(pick(data, "firstName", "first_name")) || "";
  const lastName = asString(pick(data, "lastName", "last_name")) || "";
  const name = asString(pick(data, "name", "nome", "fullName", "nomeCompleto")) || `${firstName} ${lastName}`.trim() || "Cliente";
  const phone = asString(pick(data, "phone", "telefone", "mobile", "celular", "phoneNumber"));
  const email = asString(pick(data, "email", "emailAddress", "memberEmail"))?.trim().toLowerCase();
  const birthDate = normalizeDateString(pick(data, "birthDate", "dateOfBirth", "dataNascimento", "birth_date", "birthday", "data_nascimento"));
  const cpfRaw = asString(pick(data, "cpf", "CPF", "document", "documentNumber", "cpfCnpj"));
  const cpf = cpfRaw?.replace(/\D/g, "") || undefined;
  const digits = phone?.replace(/\D/g, "") || "";
  const phoneLast4 = digits.length >= 4 ? digits.slice(-4) : undefined;
  const hint = email ? email.replace(/^(.).+(@.*)$/, "$1•••$2") : phoneLast4 ? `•••• ${phoneLast4}` : undefined;
  return { externalId: id, name, contactHint: hint, birthDate, phoneLast4, email, cpf };
}

function mapContract(raw: unknown, fallbackCustomerId?: string): EvoContract | null {
  const data = obj(raw);
  const id = asString(pick(data, "id", "externalId", "contractId", "idContract", "idContrato", "idMemberMembership"));
  const customerId = asString(pick(data, "customerExternalId", "memberId", "idMember", "customerId", "idCliente")) || fallbackCustomerId;
  const startDate = normalizeDateString(pick(data, "startDate", "inicio", "dateStart", "start_date", "dataInicio"));
  if (!id || !customerId || !startDate) return null;
  return {
    externalId: id,
    customerExternalId: customerId,
    unit: asEntityName(pick(data, "unit", "unidade", "branch", "branchName", "branchUnit")) || "Evolution",
    planName: asEntityName(pick(data, "planName", "plan", "plano", "membershipName", "membership", "name")) || "Plano",
    planType: asEntityName(pick(data, "planType", "tipoPlano", "type", "membershipType")) || "UNKNOWN",
    startDate,
    endDate: normalizeDateString(pick(data, "endDate", "fim", "dateEnd", "end_date", "dataFim")),
    amountPaid: asNumber(pick(data, "contractValue", "valorContrato", "totalAmount", "totalValue", "valorTotal", "value", "price", "amountPaid", "valorPago", "paidAmount", "totalPaid", "originalValue")),
    recurring: asBoolean(pick(data, "recurring", "recorrente", "isRecurring")),
    status: asEntityName(pick(data, "status", "situacao", "contractStatus", "membershipStatus")) || "UNKNOWN",
    paymentMethodId: asString(pick(data, "paymentMethodId", "idPaymentMethod", "paymentId", "idFormaPagamento")),
    hasStoredCard: asBoolean(pick(data, "hasStoredCard", "cardStored", "cartaoSalvo", "hasCard"))
  };
}

function arrayPayload(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const data = obj(raw);
  for (const key of ["data", "items", "results", "contracts", "contratos", "memberships", "membershipsContracts"]) {
    const value = data[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = obj(value);
      for (const nestedKey of ["items", "results", "contracts", "contratos", "data"]) {
        if (Array.isArray(nested[nestedKey])) return nested[nestedKey] as unknown[];
      }
    }
  }
  return [];
}

export class HttpEvoAdapter implements EvoAdapter {
  private readonly profileOrUnit?: string;
  private readonly cachePrefix: string;

  constructor(profileOrUnit?: string) {
    this.profileOrUnit = profileOrUnit;
    this.cachePrefix = (profileOrUnit || "DEFAULT").trim().toUpperCase();
  }

  async findCustomerById(memberId: string): Promise<EvoCustomer | null> {
    const cacheKey = `${this.cachePrefix}:member:${memberId}`;
    const cached = await getCached<EvoCustomer>(cacheKey);
    if (cached) return cached;
    const raw = await evoFetch(pathFromEnv("EVO_MEMBER_BY_ID_PATH", { id: memberId, memberId, idMember: memberId }), {}, this.profileOrUnit);
    const customer = mapCustomer(raw);
    if (customer) await setCached(cacheKey, customer, 900);
    return customer;
  }

  async listContracts(customerExternalId: string): Promise<EvoContract[]> {
    const cacheKey = `${this.cachePrefix}:contracts:${customerExternalId}`;
    const cached = await getCached<EvoContract[]>(cacheKey);
    if (cached) return cached;
    const raw = await evoFetch(pathFromEnv("EVO_CONTRACTS_BY_MEMBER_PATH", { id: customerExternalId, memberId: customerExternalId, idMember: customerExternalId, customerId: customerExternalId }), {}, this.profileOrUnit);
    const contracts = arrayPayload(raw).map(item => mapContract(item, customerExternalId)).filter((v): v is EvoContract => Boolean(v));
    await setCached(cacheKey, contracts, 600);
    return contracts;
  }

  async getContract(contractExternalId: string): Promise<EvoContract | null> {
    const cacheKey = `${this.cachePrefix}:contract:${contractExternalId}`;
    const cached = await getCached<EvoContract>(cacheKey);
    if (cached) return cached;
    const raw = await evoFetch(pathFromEnv("EVO_CONTRACT_BY_ID_PATH", { id: contractExternalId, contractId: contractExternalId, idContract: contractExternalId, idMemberMembership: contractExternalId }), {}, this.profileOrUnit);
    const contract = mapContract(obj(raw).data || raw);
    if (contract) await setCached(cacheKey, contract, 600);
    return contract;
  }

  async cancelContract(contractExternalId: string, protocol: string): Promise<EvoCancelResult> {
    if (process.env.EVO_INTEGRATION_MODE !== "write" || process.env.EVO_WRITE_ENABLED !== "true") throw new Error("EVO_WRITE_DISABLED");
    const path = pathFromEnv("EVO_CANCEL_CONTRACT_PATH", { id: contractExternalId, contractId: contractExternalId, idContract: contractExternalId, idMemberMembership: contractExternalId });
    const method = (process.env.EVO_CANCEL_METHOD || "POST").toUpperCase();
    if (!["POST", "DELETE", "PUT"].includes(method)) throw new Error("EVO_CANCEL_METHOD_INVALID");

    let body: string | undefined;
    if (method === "POST") {
      const idField = process.env.EVO_CANCEL_ID_FIELD?.trim() || "idMemberMembership";
      if (!/^[A-Za-z0-9_]+$/.test(idField)) throw new Error("EVO_CANCEL_ID_FIELD_INVALID");
      const payload: Record<string, unknown> = { [idField]: contractExternalId };
      const protocolField = process.env.EVO_CANCEL_PROTOCOL_FIELD?.trim();
      if (protocolField) {
        if (!/^[A-Za-z0-9_]+$/.test(protocolField)) throw new Error("EVO_CANCEL_PROTOCOL_FIELD_INVALID");
        payload[protocolField] = protocol;
      }
      body = JSON.stringify(payload);
    } else if (method === "PUT") {
      body = JSON.stringify({ status: "cancelled", protocol });
    }

    const raw = await evoFetch(path, {
      method,
      headers: { "Idempotency-Key": protocol },
      body
    }, this.profileOrUnit);
    const data = firstPayloadObject(raw);
    return {
      operationId: asString(pick(data, "operationId", "id", "requestId", "protocol")),
      status: String(pick(data, "status", "situacao") || "accepted").toLowerCase().includes("cancel") ? "cancelled" : "accepted",
      rawStatus: asString(pick(data, "status", "situacao"))
    };
  }

  async removeStoredPaymentMethod(contractExternalId: string, customerExternalId: string, protocol: string): Promise<EvoPaymentMethodResult> {
    if (process.env.EVO_INTEGRATION_MODE !== "write" || process.env.EVO_WRITE_ENABLED !== "true" || process.env.EVO_REMOVE_PAYMENT_METHOD_ENABLED !== "true") {
      throw new Error("EVO_PAYMENT_METHOD_WRITE_DISABLED");
    }
    const path = pathFromEnv("EVO_REMOVE_PAYMENT_METHOD_PATH", {
      id: contractExternalId,
      contractId: contractExternalId,
      idContract: contractExternalId,
      idMemberMembership: contractExternalId,
      memberId: customerExternalId,
      idMember: customerExternalId,
      customerId: customerExternalId
    });
    const method = (process.env.EVO_REMOVE_PAYMENT_METHOD_METHOD || "DELETE").toUpperCase();
    if (!["DELETE", "PUT"].includes(method)) throw new Error("EVO_REMOVE_PAYMENT_METHOD_METHOD_INVALID");
    const raw = await evoFetch(path, {
      method,
      headers: { "Idempotency-Key": `${protocol}-payment-method` },
      body: method === "PUT" ? JSON.stringify({ active: false, removeCard: true, protocol }) : undefined
    }, this.profileOrUnit);
    const data = firstPayloadObject(raw);
    return { removed: true, operationId: asString(pick(data, "operationId", "id", "requestId")) };
  }
}

import { getCached, setCached } from "./cache";
import { recordEvoHit } from "./usage";
import type { EvoAdapter } from "./adapter";
import type { EvoCancelResult, EvoContract, EvoCustomer } from "./types";

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

function authHeaders(): Record<string, string> {
  const token = process.env.EVO_API_TOKEN?.trim();
  if (!token) throw new Error("EVO_API_TOKEN_NOT_CONFIGURED");
  const mode = process.env.EVO_AUTH_MODE || "bearer";
  if (mode === "basic") {
    const username = process.env.EVO_API_USERNAME?.trim();
    if (!username) throw new Error("EVO_API_USERNAME_NOT_CONFIGURED");
    return { Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}` };
  }
  if (mode === "header") {
    const header = (process.env.EVO_TOKEN_HEADER || "x-api-key").toLowerCase();
    if (!/^[a-z0-9-]+$/.test(header)) throw new Error("EVO_TOKEN_HEADER_INVALID");
    return { [header]: token };
  }
  return { Authorization: `Bearer ${token}` };
}

async function evoFetch(path: string, init: RequestInit = {}) {
  const base = baseUrl();
  const target = new URL(path, base);
  if (target.origin !== base.origin) throw new Error("EVO_SSRF_BLOCKED");

  const usage = await recordEvoHit();
  if (usage.hitCount > usage.hardLimit) throw new Error("EVO_API_BUDGET_HARD_LIMIT");

  const timeoutMs = Number(process.env.EVO_REQUEST_TIMEOUT_MS || 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, {
      ...init,
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(init.headers || {})
      }
    });
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error("EVO_RESPONSE_TOO_LARGE");
    if (!response.ok) throw new Error(`EVO_HTTP_${response.status}`);
    return text ? JSON.parse(text) : {};
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

function pick(data: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (data[key] !== undefined && data[key] !== null) return data[key];
  return undefined;
}

function mapCustomer(raw: unknown): EvoCustomer | null {
  const root = obj(raw);
  const data = obj(root.data && !Array.isArray(root.data) ? root.data : root);
  const id = asString(pick(data, "id", "externalId", "memberId", "idMember", "idCliente"));
  if (!id) return null;
  const name = asString(pick(data, "name", "nome", "fullName", "nomeCompleto")) || "Cliente";
  const phone = asString(pick(data, "phone", "telefone", "mobile", "celular"));
  const email = asString(pick(data, "email"));
  const hint = phone ? `•••• ${phone.replace(/\D/g, "").slice(-4)}` : email ? email.replace(/^(.).+(@.*)$/, "$1•••$2") : undefined;
  return { externalId: id, name, contactHint: hint };
}

function mapContract(raw: unknown): EvoContract | null {
  const data = obj(raw);
  const id = asString(pick(data, "id", "externalId", "contractId", "idContract", "idContrato"));
  const customerId = asString(pick(data, "customerExternalId", "memberId", "idMember", "customerId", "idCliente"));
  if (!id || !customerId) return null;
  return {
    externalId: id,
    customerExternalId: customerId,
    unit: asString(pick(data, "unit", "unidade", "branch", "branchName")) || "Evolution",
    planName: asString(pick(data, "planName", "plan", "plano", "membershipName")) || "Plano",
    planType: asString(pick(data, "planType", "tipoPlano", "type")) || "UNKNOWN",
    startDate: asString(pick(data, "startDate", "inicio", "dateStart")) || new Date().toISOString(),
    endDate: asString(pick(data, "endDate", "fim", "dateEnd")),
    amountPaid: asNumber(pick(data, "amountPaid", "valorPago", "paidAmount", "totalPaid")),
    recurring: asBoolean(pick(data, "recurring", "recorrente", "isRecurring")),
    status: asString(pick(data, "status", "situacao")) || "UNKNOWN"
  };
}

function arrayPayload(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const data = obj(raw);
  for (const key of ["data", "items", "results", "contracts", "contratos"]) {
    if (Array.isArray(data[key])) return data[key] as unknown[];
  }
  return [];
}

export class HttpEvoAdapter implements EvoAdapter {
  async findCustomerById(memberId: string): Promise<EvoCustomer | null> {
    const cacheKey = `member:${memberId}`;
    const cached = await getCached<EvoCustomer>(cacheKey);
    if (cached) return cached;
    const raw = await evoFetch(pathFromEnv("EVO_MEMBER_BY_ID_PATH", { id: memberId, memberId }));
    const customer = mapCustomer(raw);
    if (customer) await setCached(cacheKey, customer, 900);
    return customer;
  }

  async listContracts(customerExternalId: string): Promise<EvoContract[]> {
    const cacheKey = `contracts:${customerExternalId}`;
    const cached = await getCached<EvoContract[]>(cacheKey);
    if (cached) return cached;
    const raw = await evoFetch(pathFromEnv("EVO_CONTRACTS_BY_MEMBER_PATH", { id: customerExternalId, memberId: customerExternalId }));
    const contracts = arrayPayload(raw).map(mapContract).filter((v): v is EvoContract => Boolean(v));
    await setCached(cacheKey, contracts, 600);
    return contracts;
  }

  async getContract(contractExternalId: string): Promise<EvoContract | null> {
    const cacheKey = `contract:${contractExternalId}`;
    const cached = await getCached<EvoContract>(cacheKey);
    if (cached) return cached;
    const raw = await evoFetch(pathFromEnv("EVO_CONTRACT_BY_ID_PATH", { id: contractExternalId, contractId: contractExternalId }));
    const contract = mapContract(obj(raw).data || raw);
    if (contract) await setCached(cacheKey, contract, 600);
    return contract;
  }

  async cancelContract(contractExternalId: string, protocol: string): Promise<EvoCancelResult> {
    if (process.env.EVO_INTEGRATION_MODE !== "write" || process.env.EVO_WRITE_ENABLED !== "true") throw new Error("EVO_WRITE_DISABLED");
    const path = pathFromEnv("EVO_CANCEL_CONTRACT_PATH", { id: contractExternalId, contractId: contractExternalId });
    const method = (process.env.EVO_CANCEL_METHOD || "DELETE").toUpperCase();
    if (!["DELETE", "PUT"].includes(method)) throw new Error("EVO_CANCEL_METHOD_INVALID");
    const raw = await evoFetch(path, {
      method,
      headers: { "Idempotency-Key": protocol },
      body: method === "PUT" ? JSON.stringify({ status: "cancelled", protocol }) : undefined
    });
    const data = obj(raw);
    return {
      operationId: asString(pick(data, "operationId", "id", "requestId", "protocol")),
      status: String(pick(data, "status", "situacao") || "accepted").toLowerCase().includes("cancel") ? "cancelled" : "accepted",
      rawStatus: asString(pick(data, "status", "situacao"))
    };
  }
}

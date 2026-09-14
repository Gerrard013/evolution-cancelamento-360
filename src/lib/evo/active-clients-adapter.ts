import type { EvoAdapter } from "./adapter";
import type { EvoCancelResult, EvoContract, EvoCustomer, EvoPaymentMethodResult } from "./types";
import { HttpEvoAdapter } from "./http-adapter";
import { recordEvoHit } from "./usage";

const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
let snapshot: { at: number; raw: unknown } | null = null;

function maxResponseBytes() {
  const configured = Number(process.env.EVO_MAX_RESPONSE_BYTES || DEFAULT_MAX_RESPONSE_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_RESPONSE_BYTES;
}
function pick(data: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (data[key] !== undefined && data[key] !== null) return data[key];
  return undefined;
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
function nameOf(value: unknown) {
  const direct = str(value);
  if (direct) return direct;
  const data = obj(value);
  return str(pick(data, "name", "nome", "title", "descricao", "description"));
}
function dateOf(value: unknown) {
  const raw = str(value)?.trim();
  if (!raw) return undefined;
  const br = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}T00:00:00.000Z`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}
function idOf(data: Record<string, unknown>) {
  return str(pick(data, "id", "externalId", "memberId", "idMember", "idCliente", "idCustomer", "clientId", "idClient"));
}
function rows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.map(obj);
  const root = obj(raw);
  for (const key of ["data", "items", "results", "clients", "clientes", "activeClients", "activeclients"]) {
    const value = root[key];
    if (Array.isArray(value)) return value.map(obj);
    if (value && typeof value === "object") {
      const nested = obj(value);
      for (const nestedKey of ["data", "items", "results", "clients", "clientes"]) {
        if (Array.isArray(nested[nestedKey])) return (nested[nestedKey] as unknown[]).map(obj);
      }
    }
  }
  return [];
}
function customerFrom(data: Record<string, unknown>): EvoCustomer | null {
  const externalId = idOf(data);
  if (!externalId) return null;
  const name = str(pick(data, "name", "nome", "fullName", "nomeCompleto", "clientName", "customerName")) || "Cliente";
  const phone = str(pick(data, "phone", "telefone", "mobile", "celular", "phoneNumber"));
  const email = str(pick(data, "email"));
  const birthDate = dateOf(pick(data, "birthDate", "dateOfBirth", "dataNascimento", "birth_date", "birthday", "data_nascimento"));
  const digits = phone?.replace(/\D/g, "") || "";
  const phoneLast4 = digits.length >= 4 ? digits.slice(-4) : undefined;
  const contactHint = phoneLast4 ? `•••• ${phoneLast4}` : email ? email.replace(/^(.).+(@.*)$/, "$1•••$2") : undefined;
  return { externalId, name, birthDate, phoneLast4, contactHint };
}
function looksLikeContract(data: Record<string, unknown>) {
  const keys = Object.keys(data).map(k => k.toLowerCase());
  const signals = ["contract", "contrato", "membership", "plan", "plano", "startdate", "datainicio", "dateend", "enddate", "valorcontrato", "contractvalue"];
  return signals.filter(signal => keys.some(k => k.includes(signal))).length >= 2;
}
function collectContracts(value: unknown, fallbackCustomerId: string, out: EvoContract[], depth = 0) {
  if (depth > 5 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) collectContracts(item, fallbackCustomerId, out, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  const data = obj(value);
  if (looksLikeContract(data)) {
    const externalId = str(pick(data, "contractId", "idContract", "idContrato", "externalId", "id"));
    if (externalId) {
      const customerExternalId = str(pick(data, "customerExternalId", "memberId", "idMember", "customerId", "idCliente")) || fallbackCustomerId;
      out.push({
        externalId,
        customerExternalId,
        unit: nameOf(pick(data, "unit", "unidade", "branch", "branchName", "branchUnit", "location")) || "Evolution",
        planName: nameOf(pick(data, "planName", "plan", "plano", "membershipName", "membership", "serviceName", "servico")) || "Plano",
        planType: nameOf(pick(data, "planType", "tipoPlano", "type", "membershipType", "serviceType")) || "UNKNOWN",
        startDate: dateOf(pick(data, "startDate", "inicio", "dateStart", "start_date", "dataInicio", "contractStart")) || new Date().toISOString(),
        endDate: dateOf(pick(data, "endDate", "fim", "dateEnd", "end_date", "dataFim", "contractEnd")),
        amountPaid: num(pick(data, "contractValue", "valorContrato", "totalAmount", "totalValue", "valorTotal", "value", "price", "amountPaid", "valorPago", "paidAmount", "totalPaid")),
        recurring: bool(pick(data, "recurring", "recorrente", "isRecurring")),
        status: nameOf(pick(data, "status", "situacao", "contractStatus")) || "ACTIVE",
        paymentMethodId: str(pick(data, "paymentMethodId", "idPaymentMethod", "paymentId", "idFormaPagamento")),
        hasStoredCard: bool(pick(data, "hasStoredCard", "cardStored", "cartaoSalvo", "hasCard"))
      });
    }
  }
  for (const nested of Object.values(data)) collectContracts(nested, fallbackCustomerId, out, depth + 1);
}
function authHeaders(): Record<string, string> {
  const token = process.env.EVO_API_TOKEN?.trim();
  const username = process.env.EVO_API_USERNAME?.trim();
  if (!token) throw new Error("EVO_API_TOKEN_NOT_CONFIGURED");
  const mode = process.env.EVO_AUTH_MODE || "basic";
  if (mode === "basic") {
    if (!username) throw new Error("EVO_API_USERNAME_NOT_CONFIGURED");
    return { Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}` };
  }
  if (mode === "header") return { [process.env.EVO_TOKEN_HEADER || "x-api-key"]: token };
  return { Authorization: `Bearer ${token}` };
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function activeClientsRaw() {
  if (snapshot && Date.now() - snapshot.at < 30_000) return snapshot.raw;
  const base = process.env.EVO_API_BASE_URL?.trim();
  const path = process.env.EVO_ACTIVE_CLIENTS_PATH?.trim();
  if (!base || !path) throw new Error("EVO_ACTIVE_CLIENTS_NOT_CONFIGURED");
  const baseUrl = new URL(base);
  const target = new URL(path, baseUrl);
  if (baseUrl.protocol !== "https:" || target.origin !== baseUrl.origin) throw new Error("EVO_ACTIVE_CLIENTS_INVALID_URL");

  const attempts = 2;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const usage = await recordEvoHit();
    if (usage.hitCount > usage.hardLimit) throw new Error("EVO_API_BUDGET_HARD_LIMIT");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.EVO_REQUEST_TIMEOUT_MS || 20000));
    try {
      const response = await fetch(target, {
        headers: { Accept: "application/json", ...authHeaders() },
        redirect: "error",
        cache: "no-store",
        signal: controller.signal
      });
      const text = await response.text();
      const bytes = Buffer.byteLength(text, "utf8");
      if (bytes > maxResponseBytes()) throw new Error("EVO_RESPONSE_TOO_LARGE");

      if (!response.ok) {
        const retryable = [502, 503, 504].includes(response.status);
        console.error("[EVO_ACTIVE_CLIENTS_HTTP]", response.status, text.slice(0, 500));
        if (retryable && attempt < attempts) {
          await wait(700 * attempt);
          continue;
        }
        throw new Error(`EVO_HTTP_${response.status}`);
      }

      const raw = text ? JSON.parse(text) : {};
      snapshot = { at: Date.now(), raw };
      return raw;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("EVO_HTTP_502");
}
export class ActiveClientsEvoAdapter implements EvoAdapter {
  private readonly fallback = new HttpEvoAdapter();
  async findCustomerById(memberId: string) {
    const raw = await activeClientsRaw();
    const found = rows(raw).find(item => idOf(item) === memberId);
    return found ? customerFrom(found) : null;
  }
  async listContracts(customerExternalId: string) {
    const raw = await activeClientsRaw();
    const found = rows(raw).find(item => idOf(item) === customerExternalId);
    if (!found) return [];
    const contracts: EvoContract[] = [];
    collectContracts(found, customerExternalId, contracts);
    const unique = new Map(contracts.map(contract => [contract.externalId, contract]));
    return [...unique.values()];
  }
  getContract(contractExternalId: string) { return this.fallback.getContract(contractExternalId); }
  cancelContract(contractExternalId: string, protocol: string): Promise<EvoCancelResult> { return this.fallback.cancelContract(contractExternalId, protocol); }
  removeStoredPaymentMethod(contractExternalId: string, customerExternalId: string, protocol: string): Promise<EvoPaymentMethodResult> { return this.fallback.removeStoredPaymentMethod(contractExternalId, customerExternalId, protocol); }
}

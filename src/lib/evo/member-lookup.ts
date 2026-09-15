import { recordEvoHit } from "./usage";

export type EvoMemberIdentity = {
  externalId: string;
  name: string;
  email: string;
  birthDate?: string;
  cpf?: string;
};

function baseUrl() {
  const raw = process.env.EVO_API_BASE_URL?.trim();
  if (!raw) throw new Error("EVO_API_BASE_URL_NOT_CONFIGURED");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("EVO_API_BASE_URL_MUST_USE_HTTPS");
  return url;
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

function membersPath() {
  const path = process.env.EVO_MEMBERS_PATH?.trim() || "/api/v1/members";
  if (!path.startsWith("/") || path.includes("://")) throw new Error("EVO_MEMBERS_PATH_INVALID");
  return path;
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function str(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function normalizeDate(value: unknown) {
  const raw = str(value);
  if (!raw) return undefined;
  const br = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function memberArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.map(objectOf);
  const root = objectOf(raw);
  for (const key of ["data", "items", "results", "members"]) {
    const value = root[key];
    if (Array.isArray(value)) return value.map(objectOf);
    if (value && typeof value === "object") {
      const nested = objectOf(value);
      for (const nestedKey of ["items", "results", "members", "data"]) {
        const nestedValue = nested[nestedKey];
        if (Array.isArray(nestedValue)) return nestedValue.map(objectOf);
      }
    }
  }
  if (root.member && typeof root.member === "object") return [objectOf(root.member)];
  return Object.keys(root).length ? [root] : [];
}

function mapMember(data: Record<string, unknown>): EvoMemberIdentity | null {
  const externalId = str(data.idMember ?? data.memberId ?? data.id_member ?? data.id);
  const email = str(data.email).toLowerCase();
  const firstName = str(data.firstName ?? data.first_name);
  const lastName = str(data.lastName ?? data.last_name);
  const name = str(data.name ?? data.fullName ?? data.full_name) || `${firstName} ${lastName}`.trim() || "Cliente";
  const birthDate = normalizeDate(data.birthDate ?? data.birth_date ?? data.dateOfBirth ?? data.dataNascimento);
  const cpf = str(data.cpf ?? data.CPF ?? data.document ?? data.documentNumber ?? data.cpfCnpj).replace(/\D/g, "") || undefined;
  if (!externalId || !email) return null;
  return { externalId, email, name, birthDate, cpf };
}

export async function findEvoMemberByEmail(emailInput: string): Promise<EvoMemberIdentity | null> {
  const email = emailInput.trim().toLowerCase();
  if (!email) return null;

  const base = baseUrl();
  const target = new URL(membersPath(), base);
  if (target.origin !== base.origin) throw new Error("EVO_SSRF_BLOCKED");
  const queryParam = process.env.EVO_MEMBER_EMAIL_QUERY_PARAM?.trim() || "email";
  if (!/^[A-Za-z0-9_.-]+$/.test(queryParam)) throw new Error("EVO_MEMBER_EMAIL_QUERY_PARAM_INVALID");
  target.searchParams.set(queryParam, email);

  const usage = await recordEvoHit();
  if (usage.hitCount > usage.hardLimit) throw new Error("EVO_API_BUDGET_HARD_LIMIT");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.EVO_REQUEST_TIMEOUT_MS || 8000));
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: { Accept: "application/json", ...authHeaders() },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`EVO_HTTP_${response.status}`);
    if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) throw new Error("EVO_RESPONSE_TOO_LARGE");

    const candidates = memberArray(text ? JSON.parse(text) : {}).map(mapMember).filter((m): m is EvoMemberIdentity => Boolean(m));
    return candidates.find(member => member.email === email) || null;
  } finally {
    clearTimeout(timer);
  }
}

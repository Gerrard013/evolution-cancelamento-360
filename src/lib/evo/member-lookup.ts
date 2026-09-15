import { recordEvoHit } from "./usage";

export type EvoMemberIdentity = {
  externalId: string;
  name: string;
  email: string;
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

function pathForCpf(cpf: string) {
  const template = process.env.EVO_MEMBER_BY_CPF_PATH?.trim();
  if (!template) throw new Error("EVO_MEMBER_BY_CPF_PATH_NOT_CONFIGURED");
  if (!template.startsWith("/") || template.includes("://")) throw new Error("EVO_MEMBER_BY_CPF_PATH_INVALID");
  return template.replaceAll("{cpf}", encodeURIComponent(cpf));
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstMember(raw: unknown): Record<string, unknown> {
  if (Array.isArray(raw)) return objectOf(raw[0]);
  const root = objectOf(raw);
  for (const key of ["data", "items", "results", "members", "member"]) {
    const value = root[key];
    if (Array.isArray(value) && value.length) return objectOf(value[0]);
    if (value && typeof value === "object") {
      const nested = objectOf(value);
      for (const nestedKey of ["items", "results", "members", "data"]) {
        if (Array.isArray(nested[nestedKey]) && (nested[nestedKey] as unknown[]).length) return objectOf((nested[nestedKey] as unknown[])[0]);
      }
      if (Object.keys(nested).length) return nested;
    }
  }
  return root;
}

function str(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export async function findEvoMemberByCpf(cpfDigits: string): Promise<EvoMemberIdentity | null> {
  const base = baseUrl();
  const target = new URL(pathForCpf(cpfDigits), base);
  if (target.origin !== base.origin) throw new Error("EVO_SSRF_BLOCKED");

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
    const data = firstMember(text ? JSON.parse(text) : {});
    const externalId = str(data.idMember ?? data.memberId ?? data.id_member ?? data.id);
    const email = str(data.email).toLowerCase();
    const firstName = str(data.firstName ?? data.first_name);
    const lastName = str(data.lastName ?? data.last_name);
    const name = str(data.name) || `${firstName} ${lastName}`.trim() || "Cliente";
    if (!externalId || !email) return null;
    return { externalId, email, name };
  } finally {
    clearTimeout(timer);
  }
}

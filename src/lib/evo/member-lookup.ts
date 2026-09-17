import { recordEvoHit } from "./usage";
import { configuredEvoProfiles, evoAuthHeaders, type EvoCredentialProfile } from "./credentials";

export type EvoMemberIdentity = {
  externalId: string;
  name: string;
  email: string;
  birthDate?: string;
  cpf?: string;
  profileKey: "CONDOR" | "UMARIZAL" | "DEFAULT";
};

function baseUrl() {
  const raw = process.env.EVO_API_BASE_URL?.trim();
  if (!raw) throw new Error("EVO_API_BASE_URL_NOT_CONFIGURED");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("EVO_API_BASE_URL_MUST_USE_HTTPS");
  return url;
}

function configuredPath(name: string, fallback: string, params: Record<string, string> = {}) {
  const template = process.env[name]?.trim() || fallback;
  if (!template.startsWith("/") || template.includes("://")) throw new Error(`${name}_INVALID_PATH`);
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined) throw new Error(`${name}_MISSING_PARAM_${key}`);
    return encodeURIComponent(value);
  });
}

function configuredQueryParam(name: string, fallback: string) {
  const value = process.env[name]?.trim() || fallback;
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) throw new Error(`${name}_INVALID`);
  return value;
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstObject(raw: unknown): Record<string, unknown> {
  if (Array.isArray(raw)) return objectOf(raw[0]);
  const root = objectOf(raw);
  for (const key of ["data", "item", "result", "member", "customer", "cliente", "aluno", "list", "lista"]) {
    const value = root[key];
    if (Array.isArray(value)) return objectOf(value[0]);
    if (value && typeof value === "object") return objectOf(value);
  }
  return root;
}

function str(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function normalizeDate(value: unknown) {
  const raw = str(value);
  if (!raw) return undefined;
  const br = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function normalizeCpf(value: unknown): string | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const data = objectOf(value);
    return normalizeCpf(data.value ?? data.number ?? data.document ?? data.cpf);
  }
  const digits = str(value).replace(/\D/g, "");
  return digits.length === 11 ? digits : undefined;
}

function cpfFromRecord(data: Record<string, unknown>) {
  return normalizeCpf(data.cpf ?? data.CPF ?? data.document ?? data.documentNumber ?? data.documentId ?? data.cpfCnpj ?? data.cpf_cnpj ?? data.taxId);
}

function memberArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.map(objectOf);
  const root = objectOf(raw);
  for (const key of ["data", "items", "results", "members", "list", "lista"]) {
    const value = root[key];
    if (Array.isArray(value)) return value.map(objectOf);
    if (value && typeof value === "object") {
      const nested = objectOf(value);
      for (const nestedKey of ["items", "results", "members", "data", "list", "lista"]) {
        if (Array.isArray(nested[nestedKey])) return (nested[nestedKey] as unknown[]).map(objectOf);
      }
    }
  }
  return Object.keys(root).length ? [root] : [];
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

async function evoGet(path: string, profile: EvoCredentialProfile, params?: Record<string, string>) {
  const base = baseUrl();
  const target = new URL(path, base);
  if (target.origin !== base.origin) throw new Error("EVO_SSRF_BLOCKED");
  for (const [key, value] of Object.entries(params || {})) target.searchParams.set(key, value);

  const timeoutMs = Math.min(10_000, Math.max(3_000, Number(process.env.EVO_REQUEST_TIMEOUT_MS || 6_500)));
  console.info("[EVO_GET_BEGIN]", JSON.stringify({ profile: profile.key, path }));

  const usage = await withHardTimeout(recordEvoHit(), 3_000, "EVO_USAGE_TIMEOUT");
  if (usage.hitCount > usage.hardLimit) throw new Error("EVO_API_BUDGET_HARD_LIMIT");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await withHardTimeout(fetch(target, {
      method: "GET",
      headers: { Accept: "application/json, text/json, text/plain", ...evoAuthHeaders(profile.key) },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    }), timeoutMs + 500, "EVO_FETCH_TIMEOUT");

    const text = await withHardTimeout(response.text(), timeoutMs + 500, "EVO_BODY_TIMEOUT");
    console.info("[EVO_GET_END]", JSON.stringify({ profile: profile.key, path, status: response.status }));
    if (!response.ok) throw new Error(`EVO_HTTP_${response.status}`);
    if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) throw new Error("EVO_RESPONSE_TOO_LARGE");
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error("EVO_INVALID_JSON");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("EVO_FETCH_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function mapProfile(raw: unknown, profile: EvoCredentialProfile): EvoMemberIdentity | null {
  const data = firstObject(raw);
  const externalId = deepString(data, ["idMember", "memberId", "id_member", "id", "idCliente", "customerId", "idCustomer"]);
  const email = deepString(data, ["email", "emailAddress", "memberEmail"]).toLowerCase();
  const firstName = str(data.firstName ?? data.first_name);
  const lastName = str(data.lastName ?? data.last_name);
  const name = str(data.name ?? data.fullName ?? data.full_name ?? data.memberName) || `${firstName} ${lastName}`.trim() || "Cliente";
  const birthDate = normalizeDate(data.birthDate ?? data.birth_date ?? data.dateOfBirth ?? data.dataNascimento ?? data.birthday ?? data.birthdate);
  const cpf = cpfFromRecord(data);
  if (!externalId || !email) return null;
  return { externalId, email, name, birthDate, cpf, profileKey: profile.key };
}

function deepString(value: unknown, keys: string[], depth = 0): string {
  if (depth > 4 || !value || typeof value !== "object") return "";
  const data = objectOf(value);
  for (const key of keys) {
    const direct = str(data[key]);
    if (direct) return direct;
  }
  for (const child of Object.values(data)) {
    if (!child || typeof child !== "object") continue;
    if (Array.isArray(child)) {
      for (const item of child.slice(0, 3)) {
        const found = deepString(item, keys, depth + 1);
        if (found) return found;
      }
    } else {
      const found = deepString(child, keys, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function basicCandidateId(data: Record<string, unknown>) {
  return deepString(data, ["idMember", "memberId", "id_member", "idCliente", "customerId", "idCustomer", "idClient", "idPessoa", "id"]);
}

function basicCandidateBirthDate(data: Record<string, unknown>) {
  return normalizeDate(data.birthDate ?? data.birth_date ?? data.dateOfBirth ?? data.dataNascimento ?? data.birthday ?? data.birthdate);
}

async function findProfileFromBasic(profile: EvoCredentialProfile, filter: "document" | "email", value: string, expectedBirthDate?: string) {
  const membersPath = configuredPath("EVO_MEMBERS_PATH", "/api/v1/members/basic");
  const queryParam = filter === "document"
    ? configuredQueryParam("EVO_MEMBER_CPF_QUERY_PARAM", "document")
    : configuredQueryParam("EVO_MEMBER_EMAIL_QUERY_PARAM", "email");
  const raw = await evoGet(membersPath, profile, {
    [queryParam]: value,
    take: "25",
    skip: "0"
  });
  const candidates = memberArray(raw);

  console.info("[EVO_MEMBER_LOOKUP]", JSON.stringify({
    profile: profile.key,
    filter,
    candidateCount: candidates.length,
    hasMemberId: candidates.some(candidate => Boolean(basicCandidateId(candidate))),
    hasBirthDate: candidates.some(candidate => Boolean(basicCandidateBirthDate(candidate))),
    hasEmail: candidates.some(candidate => Boolean(str(candidate.email ?? candidate.emailAddress ?? candidate.memberEmail))),
    hasDocument: candidates.some(candidate => Boolean(cpfFromRecord(candidate)))
  }));

  for (const candidate of candidates) {
    const id = basicCandidateId(candidate);
    if (!id) continue;

    const candidateBirthDate = basicCandidateBirthDate(candidate);
    const candidateCpf = cpfFromRecord(candidate);
    if (expectedBirthDate && candidateBirthDate && candidateBirthDate !== expectedBirthDate) continue;
    if (filter === "document" && candidateCpf && candidateCpf !== value) continue;

    const profilePath = configuredPath("EVO_MEMBER_PROFILE_PATH", "/api/v1/members/{idMember}", {
      id,
      idMember: id,
      memberId: id
    });
    const profileRaw = await evoGet(profilePath, profile);
    const member = mapProfile(profileRaw, profile);
    console.info("[EVO_PROFILE_LOOKUP]", JSON.stringify({
      profile: profile.key,
      mapped: Boolean(member),
      hasBirthDate: Boolean(member?.birthDate || candidateBirthDate),
      hasEmail: Boolean(member?.email),
      hasDocument: Boolean(member?.cpf || candidateCpf)
    }));
    if (!member) continue;

    const verifiedBirthDate = member.birthDate || candidateBirthDate;
    const verifiedCpf = member.cpf || candidateCpf;
    if (expectedBirthDate && verifiedBirthDate !== expectedBirthDate) continue;
    if (filter === "document" && verifiedCpf !== value) continue;
    if (filter === "email" && member.email !== value) continue;
    return { ...member, birthDate: verifiedBirthDate, cpf: verifiedCpf };
  }
  return null;
}

export async function findEvoMemberByCpf(cpfInput: string, expectedBirthDate?: string): Promise<EvoMemberIdentity | null> {
  const cpf = normalizeCpf(cpfInput);
  if (!cpf) return null;
  const profiles = configuredEvoProfiles();
  if (!profiles.length) throw new Error("EVO_API_TOKEN_NOT_CONFIGURED");

  let lastError: unknown;
  for (const profile of profiles) {
    try {
      const match = await findProfileFromBasic(profile, "document", cpf, expectedBirthDate);
      if (match?.cpf === cpf) return match;
    } catch (error) {
      lastError = error;
      console.error(`[EVO_MEMBER_LOOKUP_${profile.key}]`, error instanceof Error ? error.message : error);
    }
  }

  if (lastError) throw lastError;
  return null;
}

export async function findEvoMemberByEmail(emailInput: string): Promise<EvoMemberIdentity | null> {
  const email = emailInput.trim().toLowerCase();
  if (!email) return null;
  const profiles = configuredEvoProfiles();
  if (!profiles.length) throw new Error("EVO_API_TOKEN_NOT_CONFIGURED");

  let lastError: unknown;
  for (const profile of profiles) {
    try {
      const match = await findProfileFromBasic(profile, "email", email);
      if (match && match.email === email) return match;
    } catch (error) {
      lastError = error;
      console.error(`[EVO_MEMBER_LOOKUP_${profile.key}]`, error instanceof Error ? error.message : error);
    }
  }

  if (lastError) throw lastError;
  return null;
}

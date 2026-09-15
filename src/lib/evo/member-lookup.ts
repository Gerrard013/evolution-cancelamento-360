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
  const isoPrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefix) return `${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function normalizeCpf(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const data = objectOf(value);
    return normalizeCpf(data.value ?? data.number ?? data.document ?? data.cpf);
  }
  const digits = str(value).replace(/\D/g, "");
  return digits.length === 11 ? digits : undefined;
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

function mapMember(data: Record<string, unknown>, profile: EvoCredentialProfile): EvoMemberIdentity | null {
  const externalId = str(data.idMember ?? data.memberId ?? data.id_member ?? data.id);
  const email = str(data.email ?? data.emailAddress ?? data.memberEmail).toLowerCase();
  const firstName = str(data.firstName ?? data.first_name);
  const lastName = str(data.lastName ?? data.last_name);
  const name = str(data.name ?? data.fullName ?? data.full_name ?? data.memberName) || `${firstName} ${lastName}`.trim() || "Cliente";
  const birthDate = normalizeDate(
    data.birthDate ?? data.birth_date ?? data.dateOfBirth ?? data.dataNascimento ?? data.birthday ?? data.birthdate ?? data.date_birth
  );
  const cpf = normalizeCpf(
    data.cpf ?? data.CPF ?? data.document ?? data.documentNumber ?? data.documentId ?? data.cpfCnpj ?? data.cpf_cnpj ?? data.taxId
  );
  if (!externalId || !email) return null;
  return { externalId, email, name, birthDate, cpf, profileKey: profile.key };
}

async function queryMember(queryParam: string, queryValue: string, profile: EvoCredentialProfile): Promise<EvoMemberIdentity[]> {
  if (!/^[A-Za-z0-9_.-]+$/.test(queryParam)) throw new Error("EVO_MEMBER_QUERY_PARAM_INVALID");

  const base = baseUrl();
  const target = new URL(membersPath(), base);
  if (target.origin !== base.origin) throw new Error("EVO_SSRF_BLOCKED");
  target.searchParams.set(queryParam, queryValue);
  target.searchParams.set("take", "25");

  const usage = await recordEvoHit();
  if (usage.hitCount > usage.hardLimit) throw new Error("EVO_API_BUDGET_HARD_LIMIT");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.EVO_REQUEST_TIMEOUT_MS || 8000));
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: { Accept: "application/json", ...evoAuthHeaders(profile.key) },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`EVO_HTTP_${response.status}`);
    if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) throw new Error("EVO_RESPONSE_TOO_LARGE");
    return memberArray(text ? JSON.parse(text) : {}).map(item => mapMember(item, profile)).filter((m): m is EvoMemberIdentity => Boolean(m));
  } finally {
    clearTimeout(timer);
  }
}

async function queryAcrossProfiles(queryParam: string, queryValue: string, predicate: (member: EvoMemberIdentity) => boolean) {
  const profiles = configuredEvoProfiles();
  if (!profiles.length) throw new Error("EVO_API_TOKEN_NOT_CONFIGURED");

  let lastIntegrationError: unknown;
  for (const profile of profiles) {
    try {
      const candidates = await queryMember(queryParam, queryValue, profile);
      const match = candidates.find(predicate);
      console.info("[EVO_LOOKUP_DIAGNOSTIC]", JSON.stringify({
        profile: profile.key,
        queryParam,
        candidateCount: candidates.length,
        candidatesWithCpf: candidates.filter(member => Boolean(member.cpf)).length,
        candidatesWithBirthDate: candidates.filter(member => Boolean(member.birthDate)).length,
        matched: Boolean(match)
      }));
      if (match) return match;
    } catch (error) {
      lastIntegrationError = error;
      console.error(`[EVO_MEMBER_LOOKUP_${profile.key}]`, error instanceof Error ? error.message : error);
    }
  }

  if (lastIntegrationError) throw lastIntegrationError;
  return null;
}

export async function findEvoMemberByEmail(emailInput: string): Promise<EvoMemberIdentity | null> {
  const email = emailInput.trim().toLowerCase();
  if (!email) return null;
  const queryParam = process.env.EVO_MEMBER_EMAIL_QUERY_PARAM?.trim() || "email";
  return queryAcrossProfiles(queryParam, email, member => member.email === email);
}

export async function findEvoMemberByCpf(cpfInput: string): Promise<EvoMemberIdentity | null> {
  const cpf = normalizeCpf(cpfInput);
  if (!cpf) return null;

  const configured = process.env.EVO_MEMBER_CPF_QUERY_PARAM?.trim();
  const queryParams = Array.from(new Set([
    configured,
    "cpf",
    "document",
    "documentNumber",
    "documentId",
    "cpfCnpj"
  ].filter((value): value is string => Boolean(value))));

  let lastIntegrationError: unknown;
  for (const queryParam of queryParams) {
    try {
      const match = await queryAcrossProfiles(queryParam, cpf, member => member.cpf === cpf);
      if (match) return match;
    } catch (error) {
      lastIntegrationError = error;
    }
  }

  if (lastIntegrationError) throw lastIntegrationError;
  return null;
}

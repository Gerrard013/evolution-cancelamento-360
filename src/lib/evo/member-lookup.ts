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
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function normalizeCpf(value: unknown) {
  const digits = str(value).replace(/\D/g, "");
  return digits.length === 11 ? digits : undefined;
}

function memberArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.map(objectOf);
  const root = objectOf(raw);
  for (const key of ["data", "items", "results", "members"]) {
    const value = root[key];
    if (Array.isArray(value)) return value.map(objectOf);
  }
  return Object.keys(root).length ? [root] : [];
}

async function evoGet(path: string, profile: EvoCredentialProfile, params?: Record<string, string>) {
  const base = baseUrl();
  const target = new URL(path, base);
  if (target.origin !== base.origin) throw new Error("EVO_SSRF_BLOCKED");
  for (const [key, value] of Object.entries(params || {})) target.searchParams.set(key, value);

  const usage = await recordEvoHit();
  if (usage.hitCount > usage.hardLimit) throw new Error("EVO_API_BUDGET_HARD_LIMIT");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.EVO_REQUEST_TIMEOUT_MS || 8000));
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: { Accept: "application/json, text/json, text/plain", ...evoAuthHeaders(profile.key) },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`EVO_HTTP_${response.status}`);
    if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) throw new Error("EVO_RESPONSE_TOO_LARGE");
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

function mapProfile(raw: unknown, profile: EvoCredentialProfile): EvoMemberIdentity | null {
  const data = objectOf(raw);
  const externalId = str(data.idMember ?? data.memberId ?? data.id_member ?? data.id);
  const email = str(data.email ?? data.emailAddress ?? data.memberEmail).toLowerCase();
  const firstName = str(data.firstName ?? data.first_name);
  const lastName = str(data.lastName ?? data.last_name);
  const name = str(data.name ?? data.fullName ?? data.full_name) || `${firstName} ${lastName}`.trim() || "Cliente";
  const birthDate = normalizeDate(data.birthDate ?? data.birth_date ?? data.dateOfBirth ?? data.dataNascimento);
  const cpf = normalizeCpf(data.cpf ?? data.CPF ?? data.document ?? data.documentNumber ?? data.documentId ?? data.cpfCnpj);
  if (!externalId || !email) return null;
  return { externalId, email, name, birthDate, cpf, profileKey: profile.key };
}

function basicCandidateId(data: Record<string, unknown>) {
  return str(data.idMember ?? data.memberId ?? data.id_member ?? data.id);
}

async function findProfileFromBasic(profile: EvoCredentialProfile, filter: "document" | "email", value: string, expected: (member: EvoMemberIdentity) => boolean) {
  const raw = await evoGet("/api/v1/members/basic", profile, {
    [filter]: value,
    take: "50",
    skip: "0"
  });
  const candidates = memberArray(raw);

  console.info("[EVO_BASIC_LOOKUP]", JSON.stringify({
    profile: profile.key,
    filter,
    candidateCount: candidates.length
  }));

  for (const candidate of candidates) {
    const id = basicCandidateId(candidate);
    if (!id) continue;
    const profileRaw = await evoGet(`/api/v1/members/${encodeURIComponent(id)}`, profile);
    const member = mapProfile(profileRaw, profile);
    if (member && expected(member)) return member;
  }
  return null;
}

export async function findEvoMemberByCpf(cpfInput: string): Promise<EvoMemberIdentity | null> {
  const cpf = normalizeCpf(cpfInput);
  if (!cpf) return null;
  const profiles = configuredEvoProfiles();
  if (!profiles.length) throw new Error("EVO_API_TOKEN_NOT_CONFIGURED");

  let lastError: unknown;
  for (const profile of profiles) {
    try {
      const match = await findProfileFromBasic(profile, "document", cpf, member => member.cpf === cpf);
      if (match) return match;
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
      const match = await findProfileFromBasic(profile, "email", email, member => member.email === email);
      if (match) return match;
    } catch (error) {
      lastError = error;
      console.error(`[EVO_MEMBER_LOOKUP_${profile.key}]`, error instanceof Error ? error.message : error);
    }
  }

  if (lastError) throw lastError;
  return null;
}

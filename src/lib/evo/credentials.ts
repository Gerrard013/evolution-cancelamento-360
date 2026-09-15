export type EvoCredentialProfile = {
  key: "CONDOR" | "UMARIZAL" | "DEFAULT";
  unit: string;
  username?: string;
  token: string;
};

function clean(value: string | undefined) {
  return value?.trim() || undefined;
}

function profileFrom(prefix: "CONDOR" | "UMARIZAL"): EvoCredentialProfile | null {
  const token = clean(process.env[`EVO_${prefix}_API_TOKEN`]);
  if (!token) return null;
  return {
    key: prefix,
    unit: prefix === "CONDOR" ? "Condor" : "Umarizal",
    username: clean(process.env[`EVO_${prefix}_API_USERNAME`]),
    token
  };
}

function defaultProfile(): EvoCredentialProfile | null {
  const token = clean(process.env.EVO_API_TOKEN);
  if (!token) return null;
  return {
    key: "DEFAULT",
    unit: clean(process.env.EVO_UNIT_NAME) || "Evolution",
    username: clean(process.env.EVO_API_USERNAME),
    token
  };
}

export function configuredEvoProfiles(): EvoCredentialProfile[] {
  const unitProfiles = [profileFrom("CONDOR"), profileFrom("UMARIZAL")].filter((profile): profile is EvoCredentialProfile => Boolean(profile));
  if (unitProfiles.length) return unitProfiles;
  const fallback = defaultProfile();
  return fallback ? [fallback] : [];
}

export function resolveEvoProfile(profileOrUnit?: string): EvoCredentialProfile {
  const requested = (profileOrUnit || "").trim().toUpperCase();
  const unitProfiles = [profileFrom("CONDOR"), profileFrom("UMARIZAL")].filter((profile): profile is EvoCredentialProfile => Boolean(profile));

  if (requested.includes("CONDOR")) {
    const profile = unitProfiles.find(item => item.key === "CONDOR");
    if (profile) return profile;
  }
  if (requested.includes("UMARIZAL") || requested.includes("MARIZAL")) {
    const profile = unitProfiles.find(item => item.key === "UMARIZAL");
    if (profile) return profile;
  }
  if (requested === "DEFAULT") {
    const fallback = defaultProfile();
    if (fallback) return fallback;
  }

  if (unitProfiles.length === 1) return unitProfiles[0];
  if (unitProfiles.length > 1 && requested) throw new Error("EVO_PROFILE_NOT_RESOLVED");

  const fallback = defaultProfile();
  if (fallback) return fallback;
  throw new Error("EVO_API_TOKEN_NOT_CONFIGURED");
}

export function evoAuthHeaders(profileOrUnit?: string): Record<string, string> {
  const profile = resolveEvoProfile(profileOrUnit);
  const mode = process.env.EVO_AUTH_MODE || "basic";
  if (mode === "basic") {
    if (!profile.username) throw new Error(`EVO_${profile.key}_API_USERNAME_NOT_CONFIGURED`);
    return { Authorization: `Basic ${Buffer.from(`${profile.username}:${profile.token}`).toString("base64")}` };
  }
  if (mode === "header") {
    const header = (process.env.EVO_TOKEN_HEADER || "x-api-key").toLowerCase();
    if (!/^[a-z0-9-]+$/.test(header)) throw new Error("EVO_TOKEN_HEADER_INVALID");
    return { [header]: profile.token };
  }
  return { Authorization: `Bearer ${profile.token}` };
}

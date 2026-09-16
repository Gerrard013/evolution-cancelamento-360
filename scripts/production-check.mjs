const required = [
  "DATABASE_URL","APP_ORIGIN","SESSION_SECRET","PUBLIC_ID_PEPPER","EXTERNAL_ID_PEPPER",
  "IDENTITY_CODE_PEPPER","APP_DATA_ENCRYPTION_KEY","IP_HASH_PEPPER"
];
const missing = required.filter(k => !process.env[k]?.trim());
const weak = ["SESSION_SECRET","PUBLIC_ID_PEPPER","EXTERNAL_ID_PEPPER","IDENTITY_CODE_PEPPER","IP_HASH_PEPPER"].filter(k => (process.env[k] || "").length < 32);
const errors = [];
if (missing.length) errors.push(`Missing: ${missing.join(", ")}`);
if (weak.length) errors.push(`Weak/short secrets: ${weak.join(", ")}`);

try {
  const key = Buffer.from(process.env.APP_DATA_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) errors.push("APP_DATA_ENCRYPTION_KEY must decode to exactly 32 bytes");
} catch {
  errors.push("APP_DATA_ENCRYPTION_KEY is invalid Base64");
}

const ownerUser = process.env.OWNER_USERNAME?.trim();
const ownerHash = process.env.OWNER_PASSWORD_HASH?.trim();
if (!ownerUser || !ownerHash) errors.push("Configure OWNER_USERNAME + OWNER_PASSWORD_HASH for final owner approval");
if (ownerHash && !/^pbkdf2\$\d+\$[^$]+\$[^$]+$/.test(ownerHash)) errors.push("OWNER_PASSWORD_HASH has an unsupported format");
const ownerTotp = process.env.OWNER_TOTP_SECRET?.replace(/\s+/g, "").replace(/=+$/g, "").toUpperCase();
if (process.env.NODE_ENV === "production" && !ownerTotp) errors.push("OWNER_TOTP_SECRET is required in production");
if (ownerTotp && (!/^[A-Z2-7]+$/.test(ownerTotp) || ownerTotp.length < 16)) errors.push("OWNER_TOTP_SECRET must be a valid Base32 secret");
const ownerSessionVersion = Number(process.env.OWNER_SESSION_VERSION || 1);
if (!Number.isInteger(ownerSessionVersion) || ownerSessionVersion < 1) errors.push("OWNER_SESSION_VERSION must be a positive integer");

const admins = [1,2].filter(n => process.env[`ADMIN_${n}_USERNAME`]?.trim() && process.env[`ADMIN_${n}_PASSWORD_HASH`]?.trim());
const legacyAdmin = Boolean(process.env.ADMIN_EMAIL?.trim() && process.env.ADMIN_PASSWORD_HASH?.trim());
if (!admins.length && !legacyAdmin && !ownerUser) errors.push("Configure at least one administrative account");

if (process.env.APP_ORIGIN && !/^https:\/\//.test(process.env.APP_ORIGIN) && process.env.NODE_ENV === "production") errors.push("APP_ORIGIN must use HTTPS in production");
if (Object.keys(process.env).some(k => k.startsWith("NEXT_PUBLIC_EVO_") || k === "NEXT_PUBLIC_EVO_API_TOKEN")) errors.push("EVO secrets must never use NEXT_PUBLIC_");
if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && process.env.NODE_ENV === "production") errors.push("NEXT_PUBLIC_DEMO_MODE must be false in production");
if (process.env.CUSTOMER_DIRECT_CANCELLATION === "true") errors.push("CUSTOMER_DIRECT_CANCELLATION must remain false; owner approval is mandatory");

const mode = process.env.EVO_INTEGRATION_MODE || "manual";
if (!["manual","read","write"].includes(mode)) errors.push("EVO_INTEGRATION_MODE must be manual, read or write");
if (["read","write"].includes(mode)) {
  if (!process.env.EVO_API_BASE_URL?.trim()) errors.push(`EVO_API_BASE_URL is required in ${mode} mode`);
  const authMode = process.env.EVO_AUTH_MODE || "basic";
  if (!["basic","bearer","header"].includes(authMode)) errors.push("EVO_AUTH_MODE must be basic, bearer or header");

  const unitPrefixes = ["CONDOR","UMARIZAL"];
  const completeUnits = unitPrefixes.filter(prefix => {
    const token = process.env[`EVO_${prefix}_API_TOKEN`]?.trim();
    const username = process.env[`EVO_${prefix}_API_USERNAME`]?.trim();
    return Boolean(token && (authMode !== "basic" || username));
  });
  const fallbackReady = Boolean(process.env.EVO_API_TOKEN?.trim() && (authMode !== "basic" || process.env.EVO_API_USERNAME?.trim()));
  if (completeUnits.length !== unitPrefixes.length && !fallbackReady) {
    errors.push("Configure complete EVO credentials for Condor and Umarizal, or a complete fallback EVO profile");
  }

  for (const pathName of ["EVO_MEMBER_BY_ID_PATH", "EVO_CONTRACTS_BY_MEMBER_PATH"]) {
    const value = process.env[pathName]?.trim();
    if (!value) errors.push(`${pathName} is required in ${mode} mode`);
    else if (!value.startsWith("/") || value.includes("://")) errors.push(`${pathName} must be an API path, not an absolute URL`);
  }

  for (const optionalPath of ["EVO_MEMBERS_PATH", "EVO_MEMBER_PROFILE_PATH"]) {
    const value = process.env[optionalPath]?.trim();
    if (value && (!value.startsWith("/") || value.includes("://"))) errors.push(`${optionalPath} must be an API path, not an absolute URL`);
  }
}

if (mode === "write") {
  if (process.env.EVO_WRITE_ENABLED !== "true") errors.push("write mode requires explicit EVO_WRITE_ENABLED=true");
  if (!process.env.EVO_CANCEL_CONTRACT_PATH?.trim()) errors.push("EVO_CANCEL_CONTRACT_PATH is required in write mode");
} else if (process.env.EVO_WRITE_ENABLED === "true") {
  errors.push("EVO_WRITE_ENABLED cannot be true unless EVO_INTEGRATION_MODE=write");
}

if (process.env.EVO_REMOVE_PAYMENT_METHOD_ENABLED === "true") {
  if (!process.env.EVO_REMOVE_PAYMENT_METHOD_PATH?.trim()) errors.push("EVO_REMOVE_PAYMENT_METHOD_PATH is required when payment-method removal is enabled");
  if (!(mode === "write" && process.env.EVO_WRITE_ENABLED === "true")) errors.push("payment-method removal requires EVO write mode");
}

const smtpHost = process.env.SMTP_HOST?.trim();
if (!smtpHost || !process.env.SMTP_FROM?.trim()) errors.push("SMTP_HOST and SMTP_FROM are required for OTP delivery");
if (smtpHost === "smtp.resend.com" && !process.env.SMTP_PASSWORD?.trim() && !process.env.RESEND_API_KEY?.trim()) {
  errors.push("Resend requires SMTP_PASSWORD or RESEND_API_KEY");
}

if (errors.length) { console.error("Production preflight failed:\n- " + errors.join("\n- ")); process.exit(1); }
console.log("Production preflight passed.");

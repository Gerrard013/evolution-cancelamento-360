const required = [
  "DATABASE_URL","APP_ORIGIN","SESSION_SECRET","PUBLIC_ID_PEPPER","EXTERNAL_ID_PEPPER",
  "APP_DATA_ENCRYPTION_KEY","IP_HASH_PEPPER"
];
const missing = required.filter(k => !process.env[k]?.trim());
const weak = ["SESSION_SECRET","PUBLIC_ID_PEPPER","EXTERNAL_ID_PEPPER","IP_HASH_PEPPER"].filter(k => (process.env[k] || "").length < 32);
const errors = [];
if (missing.length) errors.push(`Missing: ${missing.join(", ")}`);
if (weak.length) errors.push(`Weak/short secrets: ${weak.join(", ")}`);

const admins = [1,2].filter(n => process.env[`ADMIN_${n}_USERNAME`]?.trim() && process.env[`ADMIN_${n}_PASSWORD_HASH`]?.trim());
const legacyAdmin = Boolean(process.env.ADMIN_EMAIL?.trim() && process.env.ADMIN_PASSWORD_HASH?.trim());
if (!admins.length && !legacyAdmin) errors.push("Configure pelo menos um administrador: ADMIN_1_USERNAME + ADMIN_1_PASSWORD_HASH");

if (process.env.APP_ORIGIN && !/^https:\/\//.test(process.env.APP_ORIGIN) && process.env.NODE_ENV === "production") errors.push("APP_ORIGIN must use HTTPS in production");
if (Object.keys(process.env).some(k => k.startsWith("NEXT_PUBLIC_EVO_") || k === "NEXT_PUBLIC_EVO_API_TOKEN")) errors.push("EVO secrets must never use NEXT_PUBLIC_");

const mode = process.env.EVO_INTEGRATION_MODE || "manual";
if (["read","write"].includes(mode)) {
  for (const k of ["EVO_API_BASE_URL","EVO_API_TOKEN","EVO_MEMBER_BY_ID_PATH","EVO_CONTRACTS_BY_MEMBER_PATH"]) if (!process.env[k]?.trim()) errors.push(`${k} is required in ${mode} mode`);
  const authMode = process.env.EVO_AUTH_MODE || "bearer";
  if (authMode === "basic" && !process.env.EVO_API_USERNAME?.trim()) errors.push("EVO_API_USERNAME is required when EVO_AUTH_MODE=basic");
  if (!["basic","bearer","header"].includes(authMode)) errors.push("EVO_AUTH_MODE must be basic, bearer or header");
}
if (mode === "write") {
  if (process.env.EVO_WRITE_ENABLED !== "true") errors.push("write mode requires explicit EVO_WRITE_ENABLED=true");
  if (!process.env.EVO_CANCEL_CONTRACT_PATH?.trim()) errors.push("EVO_CANCEL_CONTRACT_PATH is required in write mode");
}
if (process.env.EVO_REMOVE_PAYMENT_METHOD_ENABLED === "true") {
  if (!process.env.EVO_REMOVE_PAYMENT_METHOD_PATH?.trim()) errors.push("EVO_REMOVE_PAYMENT_METHOD_PATH is required when payment-method removal is enabled");
  if (!(mode === "write" && process.env.EVO_WRITE_ENABLED === "true")) errors.push("payment-method removal requires EVO write mode");
}
if (process.env.CUSTOMER_DIRECT_CANCELLATION === "true" && !(mode === "write" && process.env.EVO_WRITE_ENABLED === "true")) errors.push("direct cancellation requires homologated EVO write mode");
if (errors.length) { console.error("Production preflight failed:\n- " + errors.join("\n- ")); process.exit(1); }
console.log("Production preflight passed.");

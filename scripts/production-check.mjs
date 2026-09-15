const required = [
  "DATABASE_URL","APP_ORIGIN","CANCELLATION_PUBLIC_URL","CANCELLATION_CONTACT_EMAIL",
  "SESSION_SECRET","PUBLIC_ID_PEPPER","EXTERNAL_ID_PEPPER","OTP_PEPPER",
  "APP_DATA_ENCRYPTION_KEY","IP_HASH_PEPPER","LGPD_CONSENT_VERSION","CANCELLATION_TERM_VERSION",
  "SMTP_HOST","SMTP_PORT","SMTP_USER","SMTP_PASSWORD","SMTP_FROM_EMAIL"
];
const missing = required.filter(k => !process.env[k]?.trim());
const weak = ["SESSION_SECRET","PUBLIC_ID_PEPPER","EXTERNAL_ID_PEPPER","OTP_PEPPER","IP_HASH_PEPPER"].filter(k => (process.env[k] || "").length < 32);
const errors = [];
const warnings = [];
if (missing.length) errors.push(`Missing: ${missing.join(", ")}`);
if (weak.length) errors.push(`Weak/short secrets: ${weak.join(", ")}`);

const admins = [1,2].filter(n => process.env[`ADMIN_${n}_USERNAME`]?.trim() && process.env[`ADMIN_${n}_PASSWORD_HASH`]?.trim());
if (!admins.length) errors.push("Configure pelo menos um administrador com usuário + hash de senha");
const owner = [1,2].find(n => process.env[`ADMIN_${n}_USERNAME`]?.trim() && process.env[`ADMIN_${n}_PASSWORD_HASH`]?.trim() && process.env[`ADMIN_${n}_ROLE`]?.trim().toUpperCase() === "OWNER");
if (!owner) errors.push("Configure Ruy/gestor principal com ADMIN_n_ROLE=OWNER");

for (const urlKey of ["APP_ORIGIN","CANCELLATION_PUBLIC_URL"]) {
  if (process.env[urlKey] && !/^https:\/\//.test(process.env[urlKey]) && process.env.NODE_ENV === "production") errors.push(`${urlKey} must use HTTPS in production`);
}
if (Object.keys(process.env).some(k => k.startsWith("NEXT_PUBLIC_EVO_") || k === "NEXT_PUBLIC_EVO_API_TOKEN")) errors.push("EVO secrets must never use NEXT_PUBLIC_");
if (Object.keys(process.env).some(k => /TOKEN|PASSWORD|SECRET|PEPPER|ENCRYPTION_KEY/.test(k) && k.startsWith("NEXT_PUBLIC_"))) errors.push("Secrets must never use NEXT_PUBLIC_");

const smtpPort = Number(process.env.SMTP_PORT || 0);
if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) errors.push("SMTP_PORT inválida");
if (process.env.SMTP_FROM_EMAIL && process.env.CANCELLATION_CONTACT_EMAIL && process.env.SMTP_FROM_EMAIL.split("@")[1] !== process.env.CANCELLATION_CONTACT_EMAIL.split("@")[1]) warnings.push("SMTP_FROM_EMAIL e CANCELLATION_CONTACT_EMAIL usam domínios diferentes; confirme se isso é intencional");

const mode = process.env.EVO_INTEGRATION_MODE || "manual";
if (mode === "manual") errors.push("Produção não pode usar EVO_INTEGRATION_MODE=manual");
if (["read","write"].includes(mode)) {
  for (const k of ["EVO_API_BASE_URL","EVO_API_TOKEN","EVO_API_USERNAME","EVO_MEMBER_BY_CPF_PATH","EVO_CONTRACTS_BY_MEMBER_PATH","EVO_INVOICES_BY_MEMBER_PATH"]) if (!process.env[k]?.trim()) errors.push(`${k} is required in ${mode} mode for the approved cancellation flow`);
  const authMode = process.env.EVO_AUTH_MODE || "basic";
  if (authMode !== "basic") warnings.push("O suporte EVO informou Basic Auth; confirme antes de usar outro modo");
  if (!["basic","bearer","header"].includes(authMode)) errors.push("EVO_AUTH_MODE must be basic, bearer or header");
}
if (mode === "write") {
  if (process.env.EVO_WRITE_ENABLED !== "true") errors.push("write mode requires explicit EVO_WRITE_ENABLED=true");
  if (!process.env.EVO_CANCEL_CONTRACT_PATH?.trim()) errors.push("EVO_CANCEL_CONTRACT_PATH is required in write mode");
  if (!process.env.EVO_CANCEL_BODY_TEMPLATE?.trim()) errors.push("EVO_CANCEL_BODY_TEMPLATE is required in write mode; do not guess the EVO cancellation payload in production");
}
if (process.env.EVO_REMOVE_PAYMENT_METHOD_ENABLED === "true") {
  if (!process.env.EVO_REMOVE_PAYMENT_METHOD_PATH?.trim()) errors.push("EVO_REMOVE_PAYMENT_METHOD_PATH is required when payment-method removal is enabled");
  if (!(mode === "write" && process.env.EVO_WRITE_ENABLED === "true")) errors.push("payment-method removal requires EVO write mode");
}
if (process.env.CUSTOMER_DIRECT_CANCELLATION === "true" && !(mode === "write" && process.env.EVO_WRITE_ENABLED === "true")) errors.push("direct cancellation requires homologated EVO write mode");
if (process.env.CUSTOMER_DIRECT_CANCELLATION === "true" && process.env.EVO_WRITE_HOMOLOGATED !== "true") errors.push("direct cancellation requires EVO_WRITE_HOMOLOGATED=true after a safe homologation test");

if (warnings.length) console.warn("Production preflight warnings:\n- " + warnings.join("\n- "));
if (errors.length) { console.error("Production preflight failed:\n- " + errors.join("\n- ")); process.exit(1); }
console.log("Production preflight passed.");

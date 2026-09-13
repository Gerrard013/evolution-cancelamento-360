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
if (process.env.EVO_INTEGRATION_MODE === "write" && process.env.EVO_WRITE_ENABLED !== "true") errors.push("write mode requires explicit EVO_WRITE_ENABLED=true");
if (process.env.CUSTOMER_DIRECT_CANCELLATION === "true" && !(process.env.EVO_INTEGRATION_MODE === "write" && process.env.EVO_WRITE_ENABLED === "true")) errors.push("direct cancellation requires homologated EVO write mode");
if (errors.length) { console.error("Production preflight failed:\n- " + errors.join("\n- ")); process.exit(1); }
console.log("Production preflight passed.");

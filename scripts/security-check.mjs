import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const failures = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) return ["node_modules", ".next", ".git"].includes(entry.name) ? [] : walk(p);
    return [p];
  });
}

for (const file of walk(path.join(root, "src"))) {
  if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (text.includes('"use client"') || text.includes("'use client'")) {
    const secretRefs = text.match(/process\.env\.([A-Z0-9_]+)/g) || [];
    for (const ref of secretRefs) {
      const key = ref.split(".").pop();
      if (!key?.startsWith("NEXT_PUBLIC_")) failures.push(`${path.relative(root, file)} exposes non-public env reference ${key}`);
    }
    for (const forbidden of ["EVO_API_TOKEN", "SESSION_SECRET", "ADMIN_PASSWORD_HASH", "APP_DATA_ENCRYPTION_KEY", "PUBLIC_ID_PEPPER", "EXTERNAL_ID_PEPPER"]) {
      if (text.includes(forbidden)) failures.push(`${path.relative(root, file)} contains forbidden secret name ${forbidden}`);
    }
  }
}

const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
if (!gitignore.split(/\r?\n/).includes(".env")) failures.push(".gitignore must ignore .env");

try {
  const tracked = execFileSync("git", ["ls-files", ".env", ".env.local"], { cwd: root, encoding: "utf8" }).trim();
  if (tracked) failures.push(`Sensitive env file is tracked: ${tracked}`);
} catch {}

if (failures.length) {
  console.error("Security check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Security check passed.");

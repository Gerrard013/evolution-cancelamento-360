import crypto from "node:crypto";
const password = process.argv[2];
if (!password || password.length < 14) {
  console.error("Use: npm run admin:hash -- \"uma-senha-com-pelo-menos-14-caracteres\"");
  process.exit(1);
}
const iterations = 310000;
const salt = crypto.randomBytes(16);
const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
console.log(`pbkdf2$${iterations}$${salt.toString("base64url")}$${derived.toString("base64url")}`);

import crypto from "node:crypto";

const ITERATIONS = 310_000;
const KEYLEN = 32;
const DIGEST = "sha256";

export function hashPassword(password: string, salt = crypto.randomBytes(16)): string {
  const derived = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST);
  return `pbkdf2$${ITERATIONS}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [scheme, iterRaw, saltRaw, expectedRaw] = encoded.split("$");
  if (scheme !== "pbkdf2" || !iterRaw || !saltRaw || !expectedRaw) return false;
  const iterations = Number(iterRaw);
  if (!Number.isInteger(iterations) || iterations < 200_000 || iterations > 2_000_000) return false;
  const salt = Buffer.from(saltRaw, "base64url");
  const expected = Buffer.from(expectedRaw, "base64url");
  const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, DIGEST);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function decodeBase32(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/\s+/g, "").replace(/=+$/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val < 0) throw new Error("Invalid base32");
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secretBase32: string, counter: number): string {
  const key = decodeBase32(secretBase32);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function verifyTotp(code: string, secretBase32: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (const drift of [-1, 0, 1]) {
    const expected = totp(secretBase32, counter + drift);
    if (crypto.timingSafeEqual(Buffer.from(code), Buffer.from(expected))) return true;
  }
  return false;
}

import crypto from "node:crypto";

const BINARY_MAGIC = Buffer.from("EV360E1", "ascii");

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function ownedBytes(input: Buffer | Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(input.byteLength);
  out.set(input);
  return out;
}

export function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hmac(value: string, secretName: string): string {
  return crypto.createHmac("sha256", required(secretName)).update(value).digest("hex");
}

export function hashPublicAccessCode(code: string): string {
  const normalized = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return hmac(normalized, "PUBLIC_ID_PEPPER");
}

export function hashNetworkValue(value: string): string {
  return hmac(value, "IP_HASH_PEPPER");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function generatePublicAccessCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = crypto.randomBytes(16);
  let out = "";
  for (const b of raw) out += alphabet[b % alphabet.length];
  return `EV-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}`;
}

function encryptionKey(): Buffer {
  const raw = Buffer.from(required("APP_DATA_ENCRYPTION_KEY"), "base64");
  if (raw.length !== 32) throw new Error("APP_DATA_ENCRYPTION_KEY must be a Base64 encoded 32-byte key");
  return raw;
}

export function encryptText(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptText(cipherText: string): string {
  const [version, ivB64, tagB64, dataB64] = cipherText.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Invalid ciphertext");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
}

export function encryptBytes(plainBytes: Buffer | Uint8Array): Uint8Array<ArrayBuffer> {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plainBytes)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ownedBytes(Buffer.concat([BINARY_MAGIC, iv, tag, encrypted]));
}

export function decryptBytes(cipherBytes: Buffer | Uint8Array): Uint8Array<ArrayBuffer> {
  const data = Buffer.from(cipherBytes);
  const minimumLength = BINARY_MAGIC.length + 12 + 16;
  if (data.length < minimumLength || !data.subarray(0, BINARY_MAGIC.length).equals(BINARY_MAGIC)) {
    throw new Error("Invalid encrypted binary payload");
  }
  const ivStart = BINARY_MAGIC.length;
  const tagStart = ivStart + 12;
  const bodyStart = tagStart + 16;
  const iv = data.subarray(ivStart, tagStart);
  const tag = data.subarray(tagStart, bodyStart);
  const encrypted = data.subarray(bodyStart);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return ownedBytes(Buffer.concat([decipher.update(encrypted), decipher.final()]));
}

export function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

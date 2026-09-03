import { cookies } from "next/headers";
import crypto from "node:crypto";

export const ADMIN_COOKIE = "evo360_admin";
export const CUSTOMER_COOKIE = "evo360_customer";

type SessionKind = "admin" | "customer";
export type SessionPayload = {
  kind: SessionKind;
  sub: string;
  grantId?: string;
  role?: string;
  exp: number;
  nonce: string;
};

function secret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must have at least 32 characters");
  return value;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createSessionToken(payload: Omit<SessionPayload, "exp" | "nonce">, ttlSeconds: number): string {
  const full: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds, nonce: crypto.randomBytes(12).toString("base64url") };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined, expectedKind: SessionKind): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.kind !== expectedKind || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getAdminSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(ADMIN_COOKIE)?.value, "admin");
}

export async function getCustomerSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(CUSTOMER_COOKIE)?.value, "customer");
}

export function secureCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge
  };
}

import { clientIp } from "./request";
import { hashNetworkValue } from "./crypto";

type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();

export function enforceRateLimit(req: Request, namespace: string, limit: number, windowMs: number): void {
  const key = `${namespace}:${hashNetworkValue(clientIp(req))}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    throw new Response("Too many requests", { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }
}

export function configuredLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

import { hashNetworkValue } from "./crypto";

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function requestFingerprint(req: Request) {
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "unknown";
  return {
    ipHash: hashNetworkValue(ip),
    userAgentHash: hashNetworkValue(ua)
  };
}

function normalizeOrigin(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const withScheme = raw.includes("://") ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function trustedOrigins(req: Request) {
  const allowed = new Set<string>();
  const candidates = [
    process.env.APP_ORIGIN,
    process.env.RAILWAY_STATIC_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN,
    process.env.RAILWAY_SERVICE_EVOLUTION_CANCELAMENTO_360_URL
  ];

  for (const candidate of candidates) {
    const origin = normalizeOrigin(candidate);
    if (origin) allowed.add(origin);
  }

  // Requests submitted from the same HTTPS origin are valid CSRF-wise even when
  // Railway exposes the app through more than one bound hostname (custom + fallback).
  // This does not trust arbitrary third-party origins: the browser Origin must match
  // the actual request URL origin received by the application.
  const requestOrigin = normalizeOrigin(new URL(req.url).origin);
  if (requestOrigin) allowed.add(requestOrigin);

  if (process.env.NODE_ENV !== "production") {
    allowed.add(new URL(req.url).origin);
  }
  return allowed;
}

export function assertTrustedOrigin(req: Request): void {
  const rawOrigin = req.headers.get("origin");
  if (!rawOrigin) throw new Response("Origin required", { status: 403 });

  const origin = normalizeOrigin(rawOrigin);
  if (!origin) throw new Response("Origin rejected", { status: 403 });

  const allowed = trustedOrigins(req);
  if (process.env.NODE_ENV === "production" && allowed.size === 0) {
    throw new Response("Trusted origin not configured", { status: 503 });
  }
  if (!allowed.has(origin)) throw new Response("Origin rejected", { status: 403 });
}

export async function readJsonLimited(req: Request, maxBytes = 32_768): Promise<unknown> {
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > maxBytes) throw new Response("Payload too large", { status: 413 });
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Response("Payload too large", { status: 413 });
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Response("Invalid JSON", { status: 400 });
  }
}

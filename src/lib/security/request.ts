import { hashNetworkValue } from "./crypto";

const PRODUCTION_ORIGINS = [
  "https://cancelamento.evolutionacademia.com.br",
  "https://evolution-cancelamento-360-production.up.railway.app"
] as const;

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

function normalizeOrigin(value: string | null | undefined): string | null {
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

function configuredTrustedOrigins() {
  const allowed = new Set<string>();
  const candidates = [
    process.env.APP_ORIGIN,
    process.env.RAILWAY_STATIC_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN,
    process.env.RAILWAY_SERVICE_EVOLUTION_CANCELAMENTO_360_URL,
    ...(process.env.TRUSTED_ORIGINS || "").split(",")
  ];

  if (process.env.NODE_ENV === "production") candidates.push(...PRODUCTION_ORIGINS);

  for (const candidate of candidates) {
    const origin = normalizeOrigin(candidate);
    if (origin) allowed.add(origin);
  }
  return allowed;
}

function forwardedOrigin(req: Request): string | null {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.headers.get("host")?.trim();
  if (!host) return null;
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "https";
  return normalizeOrigin(`${proto}://${host}`);
}

function safeHost(origin: string | null) {
  if (!origin) return "none";
  try { return new URL(origin).host; }
  catch { return "invalid"; }
}

export function assertTrustedOrigin(req: Request): void {
  const allowed = configuredTrustedOrigins();
  if (process.env.NODE_ENV === "production" && allowed.size === 0) {
    throw new Response("Trusted origin not configured", { status: 503 });
  }

  // Origin is authoritative for browser POST/fetch requests. Some privacy tools
  // may strip it, so Referer is accepted only as a secondary same-site signal.
  const origin = normalizeOrigin(req.headers.get("origin"));
  const referer = normalizeOrigin(req.headers.get("referer"));
  const browserOrigin = origin || referer;

  if (browserOrigin && allowed.has(browserOrigin)) return;

  // Railway terminates TLS and may expose the generated service hostname to the
  // application while the browser is on the custom hostname. Trust the forwarded
  // host only when it resolves to one of our explicit allow-listed origins.
  const proxyOrigin = forwardedOrigin(req);
  if (browserOrigin && proxyOrigin && allowed.has(proxyOrigin) && browserOrigin === proxyOrigin) return;

  // Standards-compliant browsers can omit Origin/Referer in strict privacy mode.
  // Accept that case only for a same-origin fetch routed through an allow-listed host.
  if (!browserOrigin && req.headers.get("sec-fetch-site") === "same-origin" && proxyOrigin && allowed.has(proxyOrigin)) return;

  console.warn("[ORIGIN_REJECTED]", JSON.stringify({
    originHost: safeHost(origin),
    refererHost: safeHost(referer),
    proxyHost: safeHost(proxyOrigin),
    fetchSite: req.headers.get("sec-fetch-site") || "none"
  }));
  throw new Response("Origin rejected", { status: 403 });
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

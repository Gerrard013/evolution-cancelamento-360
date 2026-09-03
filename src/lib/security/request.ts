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

export function assertTrustedOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const configured = process.env.APP_ORIGIN?.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production" && !configured) {
    throw new Response("APP_ORIGIN not configured", { status: 503 });
  }

  if (!origin) {
    throw new Response("Origin required", { status: 403 });
  }

  const allowed = configured || new URL(req.url).origin;
  if (origin.replace(/\/$/, "") !== allowed) {
    throw new Response("Origin rejected", { status: 403 });
  }
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

import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { invalidateCachePrefix } from "@/lib/evo/cache";
import { sha256 } from "@/lib/security/crypto";

const MAX_BODY = 1_048_576;

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function verifyAuth(req: Request, raw: string) {
  const secret = process.env.EVO_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const mode = process.env.EVO_WEBHOOK_AUTH_MODE || "hmac";
  if (mode === "bearer") {
    return safeEqual(req.headers.get("authorization") || "", `Bearer ${secret}`);
  }

  const signatureHeader = (process.env.EVO_WEBHOOK_SIGNATURE_HEADER || "x-evo-signature").toLowerCase();
  const timestampHeader = (process.env.EVO_WEBHOOK_TIMESTAMP_HEADER || "x-evo-timestamp").toLowerCase();
  const signature = (req.headers.get(signatureHeader) || "").replace(/^sha256=/i, "");
  const timestamp = req.headers.get(timestampHeader) || "";
  const maxSkew = Number(process.env.EVO_WEBHOOK_MAX_SKEW_SECONDS || 300);
  const ts = Number(timestamp);
  if (!signature || !Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > maxSkew) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return safeEqual(signature, expected);
}

function deepFindString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = obj[key];
    if (typeof candidate === "string" || typeof candidate === "number") return String(candidate);
  }
  for (const child of Object.values(obj)) {
    const found = deepFindString(child, keys);
    if (found) return found;
  }
  return undefined;
}

export async function POST(req: Request) {
  const length = Number(req.headers.get("content-length") || "0");
  if (length > MAX_BODY) return new Response("Payload too large", { status: 413 });
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY) return new Response("Payload too large", { status: 413 });
  if (!verifyAuth(req, raw)) return new Response("Unauthorized", { status: 401 });

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const eventId = req.headers.get("x-evo-event-id") || deepFindString(payload, ["eventId", "idEvento", "event_id"]) || sha256(raw);
  const eventType = deepFindString(payload, ["eventType", "type", "tipo"]) || "unknown";
  const eventIdHash = sha256(eventId);
  const payloadHash = sha256(raw);

  try {
    await prisma.evoWebhookEvent.create({ data: { eventIdHash, eventType, payloadHash } });
  } catch {
    return Response.json({ ok: true, duplicate: true });
  }

  const memberId = deepFindString(payload, ["memberId", "idMember", "customerId", "idCliente"]);
  const contractId = deepFindString(payload, ["contractId", "idContract", "idContrato"]);
  if (memberId) {
    await invalidateCachePrefix(`member:${memberId}`);
    await invalidateCachePrefix(`contracts:${memberId}`);
  }
  if (contractId) await invalidateCachePrefix(`contract:${contractId}`);

  await prisma.evoWebhookEvent.update({ where: { eventIdHash }, data: { processedAt: new Date() } });
  return Response.json({ ok: true });
}

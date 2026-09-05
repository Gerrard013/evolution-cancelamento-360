import { createHash, randomUUID } from "crypto";

export const MAX_SIGNED_TERM_BYTES = 8 * 1024 * 1024;

export function validateSignedDocument(file: File, bytes: Buffer) {
  if (bytes.length === 0 || bytes.length > MAX_SIGNED_TERM_BYTES) throw new Error("FILE_SIZE_INVALID");
  const name = file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 160) || "termo-assinado";
  const pdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  let mimeType = "";
  if (pdf) {
    mimeType = "application/pdf";
    const body = bytes.toString("latin1");
    const dangerous = ["/JavaScript", "/JS", "/OpenAction", "/Launch", "/EmbeddedFile", "/RichMedia", "/AA"];
    if (dangerous.some(token => body.includes(token))) throw new Error("PDF_ACTIVE_CONTENT_BLOCKED");
  }
  else if (jpg) mimeType = "image/jpeg";
  else if (png) mimeType = "image/png";
  else throw new Error("FILE_TYPE_NOT_ALLOWED");
  if (file.type && ![mimeType, "application/octet-stream"].includes(file.type)) throw new Error("MIME_MISMATCH");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { originalName: name, mimeType, sizeBytes: bytes.length, sha256, objectKey: `signed-terms/${randomUUID()}` };
}

import crypto from "node:crypto";

export function newProtocol() {
  const suffix = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `EV-${new Date().getUTCFullYear()}-${suffix}`;
}

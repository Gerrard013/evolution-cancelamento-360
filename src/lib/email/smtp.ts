import nodemailer from "nodemailer";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

function transporter() {
  const host = required("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = required("SMTP_USER");
  const pass = required("SMTP_PASSWORD");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT_INVALID");
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    requireTLS: !secure,
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000
  });
}

export function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return "e-mail cadastrado";
  const shown = local.length <= 2 ? `${local[0] || "*"}*` : `${local[0]}${"•".repeat(Math.min(5, Math.max(2, local.length - 2)))}${local.at(-1)}`;
  return `${shown}@${domain}`;
}

function publicBaseUrl() {
  const raw = process.env.CANCELLATION_PUBLIC_URL?.trim() || process.env.APP_ORIGIN?.trim();
  if (!raw) throw new Error("CANCELLATION_PUBLIC_URL_NOT_CONFIGURED");
  const url = new URL(raw);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") throw new Error("CANCELLATION_PUBLIC_URL_MUST_USE_HTTPS");
  return url;
}

export async function sendIdentityCode(input: { to: string; code: string; challengeId: string; customerName?: string }) {
  const fromEmail = required("SMTP_FROM_EMAIL");
  const fromName = process.env.SMTP_FROM_NAME?.trim() || "Evolution Academia | Cancelamentos";
  const replyTo = process.env.SMTP_REPLY_TO?.trim() || fromEmail;
  const base = publicBaseUrl();
  base.searchParams.set("challenge", input.challengeId);
  base.searchParams.set("action", "cancelamento");
  const ttl = Math.max(3, Math.min(30, Number(process.env.OTP_TTL_MINUTES || 10)));
  const firstName = input.customerName?.trim().split(/\s+/)[0] || "cliente";

  const subject = "Código de confirmação | Evolution Academia";
  const text = [
    `Olá, ${firstName}.`,
    "",
    "Recebemos uma tentativa de iniciar uma solicitação de cancelamento no canal oficial da Evolution Academia.",
    `Seu código de confirmação é: ${input.code}`,
    `O código expira em ${ttl} minutos e pode ser usado uma única vez.`,
    "",
    `Acesse o canal oficial: ${base.toString()}`,
    "",
    "Se você não iniciou esta solicitação, ignore esta mensagem. Não compartilhe este código com terceiros.",
    "",
    "Evolution Academia | Canal Oficial de Cancelamentos"
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f7f8;color:#14201b;padding:24px"><div style="max-width:620px;margin:auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #dfe8e3"><p style="font-size:12px;letter-spacing:.12em;color:#24733f;font-weight:700">EVOLUTION ACADEMIA</p><h1 style="font-size:24px;margin:0 0 12px">Confirmação de identidade</h1><p>Olá, ${firstName}.</p><p>Recebemos uma tentativa de iniciar uma solicitação de cancelamento no canal oficial.</p><div style="margin:24px 0;padding:20px;border-radius:12px;background:#eef8f1;text-align:center"><span style="display:block;font-size:12px;color:#4b6557">SEU CÓDIGO</span><strong style="font-size:32px;letter-spacing:.18em;color:#165f33">${input.code}</strong></div><p>Este código expira em <strong>${ttl} minutos</strong> e pode ser usado uma única vez.</p><p><a href="${base.toString()}" style="display:inline-block;background:#176b39;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Abrir canal oficial</a></p><p style="font-size:13px;color:#5d6a64">Se você não iniciou esta solicitação, ignore esta mensagem. Não compartilhe o código.</p></div></body></html>`;

  const info = await transporter().sendMail({
    from: { name: fromName, address: fromEmail },
    to: input.to,
    replyTo,
    subject,
    text,
    html
  });
  return { messageId: info.messageId };
}

export async function sendProtocolConfirmation(input: { to: string; protocol: string; customerName?: string; refundDueAt?: Date | null }) {
  const fromEmail = required("SMTP_FROM_EMAIL");
  const fromName = process.env.SMTP_FROM_NAME?.trim() || "Evolution Academia | Cancelamentos";
  const replyTo = process.env.SMTP_REPLY_TO?.trim() || fromEmail;
  const firstName = input.customerName?.trim().split(/\s+/)[0] || "cliente";
  const due = input.refundDueAt ? input.refundDueAt.toLocaleDateString("pt-BR", { timeZone: "America/Belem" }) : null;
  const deadline = due ? `Quando houver estorno, a previsão operacional registrada para este protocolo é até ${due}.` : "Quando houver estorno, será aplicado o prazo operacional informado no termo vigente.";
  const subject = `Protocolo ${input.protocol} | Evolution Academia`;
  const text = `Olá, ${firstName}.\n\nSua solicitação foi registrada no canal oficial da Evolution Academia.\nProtocolo: ${input.protocol}\n${deadline}\n\nGuarde este protocolo para acompanhamento.\n\nEvolution Academia | Canal Oficial de Cancelamentos`;
  await transporter().sendMail({ from: { name: fromName, address: fromEmail }, to: input.to, replyTo, subject, text });
}

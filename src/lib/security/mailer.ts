import nodemailer from "nodemailer";

function clean(value: string | undefined) {
  return value?.trim() || undefined;
}

function mailTimeoutMs() {
  const configured = Number(process.env.MAIL_REQUEST_TIMEOUT_MS || 8000);
  return Number.isFinite(configured) ? Math.min(15000, Math.max(3000, configured)) : 8000;
}

function transporter() {
  const host = clean(process.env.SMTP_HOST);
  const user = clean(process.env.SMTP_USER);
  const pass = clean(process.env.SMTP_PASSWORD);
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass || !Number.isFinite(port)) throw new Error("SMTP_NOT_CONFIGURED");

  const timeout = mailTimeoutMs();
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
    requireTLS: process.env.SMTP_REQUIRE_TLS !== "false",
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout
  });
}

function message(code: string, ttlMinutes: number) {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "Evolution Cancelamento 360";
  const ttl = Math.min(20, Math.max(3, Math.trunc(ttlMinutes || 10)));
  return {
    subject: `${appName} — código de confirmação`,
    text: `Seu código de confirmação é ${code}. Ele expira em ${ttl} minutos. Se você não iniciou esta solicitação, ignore esta mensagem.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>${appName}</h2><p>Use o código abaixo para confirmar sua identidade:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</div><p>O código expira em ${ttl} minutos e só pode ser usado neste processo de cancelamento.</p><p style="color:#666">Se você não iniciou esta solicitação, ignore esta mensagem.</p></div>`
  };
}

async function sendViaResendApi(to: string, code: string, ttlMinutes: number) {
  const apiKey = clean(process.env.RESEND_API_KEY) || clean(process.env.SMTP_PASSWORD);
  const from = clean(process.env.SMTP_FROM);
  if (!apiKey) throw new Error("RESEND_API_KEY_NOT_CONFIGURED");
  if (!from) throw new Error("SMTP_FROM_NOT_CONFIGURED");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), mailTimeoutMs());
  try {
    const body = message(code, ttlMinutes);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from, to, ...body }),
      signal: controller.signal
    });

    if (!response.ok) {
      console.error("[RESEND_SEND_ERROR]", JSON.stringify({ status: response.status }));
      throw new Error(`RESEND_HTTP_${response.status}`);
    }

    console.info("[RESEND_SEND_OK]", JSON.stringify({ status: response.status }));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("RESEND_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendIdentityCode(to: string, code: string, ttlMinutes = 10) {
  const host = clean(process.env.SMTP_HOST);

  // Railway + Resend: use HTTPS API instead of SMTP socket to avoid outbound SMTP stalls.
  if (host === "smtp.resend.com" || clean(process.env.RESEND_API_KEY)) {
    await sendViaResendApi(to, code, ttlMinutes);
    return;
  }

  const from = clean(process.env.SMTP_FROM) || clean(process.env.SMTP_USER);
  if (!from) throw new Error("SMTP_FROM_NOT_CONFIGURED");
  const body = message(code, ttlMinutes);
  await transporter().sendMail({ from, to, ...body });
}

import nodemailer from "nodemailer";

function transporter() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass || !Number.isFinite(port)) throw new Error("SMTP_NOT_CONFIGURED");
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
    requireTLS: process.env.SMTP_REQUIRE_TLS !== "false"
  });
}

export async function sendIdentityCode(to: string, code: string) {
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();
  if (!from) throw new Error("SMTP_FROM_NOT_CONFIGURED");
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "Evolution Cancelamento 360";
  await transporter().sendMail({
    from,
    to,
    subject: `${appName} — código de confirmação`,
    text: `Seu código de confirmação é ${code}. Ele expira em 10 minutos. Se você não iniciou esta solicitação, ignore esta mensagem.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>${appName}</h2><p>Use o código abaixo para confirmar sua identidade:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</div><p>O código expira em 10 minutos e só pode ser usado neste processo de cancelamento.</p><p style="color:#666">Se você não iniciou esta solicitação, ignore esta mensagem.</p></div>`
  });
}

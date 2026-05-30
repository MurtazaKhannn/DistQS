const nodemailer = require("nodemailer");

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Send one email via Resend HTTP API (port 443). Use on hosts that block SMTP (e.g. Render free Web Services).
 */
async function sendViaResend({ from, to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
    }),
  });

  const raw = await res.text();
  let bodySnippet = raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      bodySnippet = parsed.message || JSON.stringify(parsed);
    }
  } catch {
    // keep raw
  }

  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${bodySnippet}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = {};
  }
  return data;
}

/**
 * Build mail transport: real SMTP when configured; otherwise jsonTransport (dev-friendly).
 */
function createMailTransport() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "1",
      family: 4,
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            }
          : undefined,
    });
  }
  return nodemailer.createTransport({ jsonTransport: true });
}

/**
 * Email task — Resend (HTTPS) if RESEND_API_KEY; else Nodemailer SMTP; else jsonTransport (local demo).
 */
async function runEmailTask(payload, ctx) {
  const { logger } = ctx;
  const from = process.env.MAIL_FROM || "noreply@localhost";
  const text = payload.text || `Automated message: ${payload.subject}`;

  if (process.env.RESEND_API_KEY) {
    const data = await sendViaResend({
      from,
      to: payload.to,
      subject: payload.subject,
      text,
    });
    logger.info(
      {
        event: "email_sent",
        provider: "resend",
        resendId: data.id || null,
      },
      "Email sent"
    );
    return;
  }

  const transport = createMailTransport();
  const info = await transport.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    text,
  });

  if (process.env.SMTP_HOST) {
    logger.info({ event: "email_sent", messageId: info.messageId }, "Email sent");
  } else {
    logger.info(
      { event: "email_simulated", preview: info.message },
      "Email sent (jsonTransport — set RESEND_API_KEY or SMTP_* for real delivery)"
    );
  }
}

module.exports = { runEmailTask };

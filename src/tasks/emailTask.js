const nodemailer = require("nodemailer");

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

/** Loose check for a plausible email local@domain */
function looksLikeEmail(s) {
  return /^[^\s<>]+@[^\s<>]+\.[^\s<>]+$/.test(s);
}

/**
 * Parse MAIL_FROM into display name + email for Brevo sender.
 * Supports: "Name <email@domain.com>" or "email@domain.com"
 */
function parseMailFrom(mailFrom) {
  const raw = (mailFrom || "").trim();
  if (!raw) {
    throw new Error("MAIL_FROM is empty but BREVO_API_KEY is set");
  }
  const angle = /^(.+?)\s*<([^>]+)>$/.exec(raw);
  if (angle) {
    const name = angle[1].replace(/^["']|["']$/g, "").trim();
    const email = angle[2].trim();
    if (!looksLikeEmail(email)) {
      throw new Error(`MAIL_FROM has invalid email inside brackets: ${email}`);
    }
    return { name: name || undefined, email };
  }
  if (looksLikeEmail(raw)) {
    return { name: undefined, email: raw };
  }
  throw new Error(
    `MAIL_FROM must be "email@domain.com" or "Name <email@domain.com>"; got: ${raw.slice(0, 80)}`
  );
}

/**
 * Send one email via Brevo HTTP API (port 443). Use on hosts that block SMTP (e.g. Render free Web Services).
 */
async function sendViaBrevo({ senderName, senderEmail, to, subject, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = { email: senderEmail };
  if (senderName) {
    sender.name = senderName;
  }

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      textContent: text,
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
    throw new Error(`Brevo ${res.status}: ${bodySnippet}`);
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
 * Email task — Brevo (HTTPS) if BREVO_API_KEY; else Nodemailer SMTP; else jsonTransport (local demo).
 */
async function runEmailTask(payload, ctx) {
  const { logger } = ctx;
  const fromRaw = process.env.MAIL_FROM || "noreply@localhost";
  const text = payload.text || `Automated message: ${payload.subject}`;

  if (process.env.BREVO_API_KEY) {
    const { name, email } = parseMailFrom(fromRaw);
    const data = await sendViaBrevo({
      senderName: name,
      senderEmail: email,
      to: payload.to,
      subject: payload.subject,
      text,
    });
    logger.info(
      {
        event: "email_sent",
        provider: "brevo",
        messageId: data.messageId != null ? String(data.messageId) : null,
      },
      "Email sent"
    );
    return;
  }

  const transport = createMailTransport();
  const info = await transport.sendMail({
    from: fromRaw,
    to: payload.to,
    subject: payload.subject,
    text,
  });

  if (process.env.SMTP_HOST) {
    logger.info({ event: "email_sent", messageId: info.messageId }, "Email sent");
  } else {
    logger.info(
      { event: "email_simulated", preview: info.message },
      "Email sent (jsonTransport — set BREVO_API_KEY or SMTP_* for real delivery)"
    );
  }
}

module.exports = { runEmailTask };

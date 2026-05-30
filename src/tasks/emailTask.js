const nodemailer = require("nodemailer");

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
 * Email task — sends via Nodemailer (SMTP or jsonTransport in dev).
 */
async function runEmailTask(payload, ctx) {
  const { logger } = ctx;
  const transport = createMailTransport();
  const from = process.env.MAIL_FROM || "noreply@localhost";

  const info = await transport.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text || `Automated message: ${payload.subject}`,
  });

  if (process.env.SMTP_HOST) {
    logger.info({ event: "email_sent", messageId: info.messageId }, "Email sent");
  } else {
    logger.info(
      { event: "email_simulated", preview: info.message },
      "Email sent (jsonTransport — set SMTP_* for real delivery)"
    );
  }
}

module.exports = { runEmailTask };

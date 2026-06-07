const crypto = require("crypto");

const UNAUTHORIZED_BODY = { success: false, error: "Unauthorized" };

/**
 * Exchange secret for `POST /auth/token` (env `JOB_API_BEARER_TOKEN`).
 */
function getJobApiExchangeSecret() {
  const raw = process.env.JOB_API_BEARER_TOKEN;
  if (raw == null || typeof raw !== "string") {
    return "";
  }
  return raw.trim();
}

/**
 * Parse `Authorization: Bearer <token>` (RFC 6750-style).
 * Returns the token string or null if missing/invalid.
 */
function parseBearerToken(authorizationHeader) {
  if (authorizationHeader == null || typeof authorizationHeader !== "string") {
    return null;
  }
  const trimmed = authorizationHeader.trim();
  const match = /^Bearer\s+(\S+)$/i.exec(trimmed);
  if (!match) {
    return null;
  }
  return match[1];
}

/**
 * Constant-time equality for UTF-8 strings of equal byte length only.
 */
function tokensEqual(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  UNAUTHORIZED_BODY,
  getJobApiExchangeSecret,
  parseBearerToken,
  tokensEqual,
};

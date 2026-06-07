const jwt = require("jsonwebtoken");

function getJwtSecret() {
  const raw = process.env.JWT_SECRET;
  if (raw == null || typeof raw !== "string") {
    return "";
  }
  return raw.trim();
}

function getExpiresInOption() {
  const raw = process.env.JWT_EXPIRES_IN;
  if (raw != null && String(raw).trim()) {
    return String(raw).trim();
  }
  return "1h";
}

/**
 * Issue a short-lived access JWT for job API routes (HS256).
 */
function signAccessToken() {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return jwt.sign(
    { sub: "job-api-client", typ: "access" },
    secret,
    { expiresIn: getExpiresInOption() }
  );
}

/**
 * Verify access JWT. Returns payload or null.
 */
function verifyAccessToken(token) {
  const secret = getJwtSecret();
  if (!secret || !token) {
    return null;
  }
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

/**
 * Seconds until expiry from a signed token (for /auth/token response).
 */
function accessTokenExpiresInSeconds(accessToken) {
  const payload = jwt.decode(accessToken);
  if (payload && typeof payload.exp === "number" && typeof payload.iat === "number") {
    return Math.max(0, payload.exp - payload.iat);
  }
  return 3600;
}

module.exports = {
  getJwtSecret,
  signAccessToken,
  verifyAccessToken,
  accessTokenExpiresInSeconds,
};

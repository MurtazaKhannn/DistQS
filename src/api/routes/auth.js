const express = require("express");
const {
  UNAUTHORIZED_BODY,
  getJobApiExchangeSecret,
  parseBearerToken,
  tokensEqual,
} = require("../middleware/bearerTokenUtils");
const {
  signAccessToken,
  accessTokenExpiresInSeconds,
  getJwtSecret,
} = require("../utils/jwtAccessToken");

const router = express.Router();

/**
 * Exchange long-lived client secret for a short-lived JWT.
 * Authorization: Bearer <JOB_API_BEARER_TOKEN>
 */
router.post("/auth/token", (req, res) => {
  if (!getJwtSecret()) {
    return res.status(503).json({
      success: false,
      error: "JWT signing is not configured (set JWT_SECRET).",
    });
  }

  const expected = getJobApiExchangeSecret();
  if (!expected) {
    return res.status(401).json(UNAUTHORIZED_BODY);
  }

  const provided = parseBearerToken(req.get("Authorization"));
  if (provided == null || !tokensEqual(provided, expected)) {
    return res.status(401).json(UNAUTHORIZED_BODY);
  }

  try {
    const access_token = signAccessToken();
    const expires_in = accessTokenExpiresInSeconds(access_token);
    return res.status(200).json({
      access_token,
      token_type: "Bearer",
      expires_in,
    });
  } catch {
    return res.status(500).json({
      success: false,
      error: "Token issuance failed.",
    });
  }
});

module.exports = router;

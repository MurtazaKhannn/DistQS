const {
  UNAUTHORIZED_BODY,
  parseBearerToken,
} = require("./bearerTokenUtils");
const { verifyAccessToken } = require("../utils/jwtAccessToken");

/**
 * Require `Authorization: Bearer <JWT>` with a valid HS256 access token (JWT_SECRET).
 */
function requireJwtAuth(req, res, next) {
  const token = parseBearerToken(req.get("Authorization"));
  if (token == null) {
    return res.status(401).json(UNAUTHORIZED_BODY);
  }

  const payload = verifyAccessToken(token);
  if (payload == null) {
    return res.status(401).json(UNAUTHORIZED_BODY);
  }

  req.auth = payload;
  next();
}

module.exports = { requireJwtAuth };

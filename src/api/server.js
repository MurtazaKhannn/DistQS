require("dotenv").config();

const { createApp } = require("./app");
const { logger } = require("../utils/logger");
const { disconnectPrisma } = require("../db/client");

if (process.env.NODE_ENV === "production") {
  const exchange = String(process.env.JOB_API_BEARER_TOKEN || "").trim();
  const jwtSecret = String(process.env.JWT_SECRET || "").trim();
  if (!exchange || !jwtSecret) {
    logger.error(
      { event: "api_config_error" },
      "JOB_API_BEARER_TOKEN and JWT_SECRET are required in production"
    );
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;
const app = createApp();

const server = app.listen(PORT, () => {
  logger.info(
    { port: PORT, event: "api_listen" },
    "API (producer) listening"
  );
});

async function shutdown() {
  logger.info({ event: "api_shutdown" }, "shutting down API");
  await new Promise((resolve) => server.close(resolve));
  await disconnectPrisma();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

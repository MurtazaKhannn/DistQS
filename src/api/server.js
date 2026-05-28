require("dotenv").config();

const { createApp } = require("./app");
const { logger } = require("../utils/logger");
const { disconnectPrisma } = require("../db/client");

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

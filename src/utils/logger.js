const pino = require("pino");

const isDev = process.env.NODE_ENV !== "production";
const usePretty =
  process.env.LOG_PRETTY === "1" || (isDev && process.env.LOG_PRETTY !== "0");

/** Structured logger (replaces console.log) for observability in Phase 2. */
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: usePretty
    ? {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:standard" },
      }
    : undefined,
});

module.exports = { logger };

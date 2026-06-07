const express = require("express");
const authRouter = require("./routes/auth");
const jobsRouter = require("./routes/jobs");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(authRouter);
  app.use(jobsRouter);
  return app;
}

module.exports = { createApp };

const express = require("express");
const jobsRouter = require("./routes/jobs");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(jobsRouter);
  return app;
}

module.exports = { createApp };

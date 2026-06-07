require("dotenv").config();

const { test, describe, after } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");

const run = process.env.RUN_INTEGRATION === "1";
const skip = process.env.SKIP_INTEGRATION === "1" || !run;

describe("integration (RUN_INTEGRATION=1, Postgres + Redis)", () => {
  after(async () => {
    if (!run || skip) return;
    try {
      const { taskQueue } = require("../src/queues/taskQueue");
      await taskQueue.close();
    } catch {
      // ignore
    }
    const { disconnectPrisma } = require("../src/db/client");
    await disconnectPrisma();
  });

  test("POST /jobs then GET /jobs/:id", { skip }, async () => {
    const exchange = String(process.env.JOB_API_BEARER_TOKEN || "").trim();
    if (!exchange) {
      process.env.JOB_API_BEARER_TOKEN = "integration-test-bearer";
    }
    const jwtSecret = String(process.env.JWT_SECRET || "").trim();
    if (!jwtSecret) {
      process.env.JWT_SECRET = "integration-test-jwt-secret-min-32-chars!!";
    }
    const exchangeSecret = String(process.env.JOB_API_BEARER_TOKEN || "").trim();

    const { createApp } = require("../src/api/app");
    const app = createApp();

    const tokenRes = await request(app)
      .post("/auth/token")
      .set("Authorization", `Bearer ${exchangeSecret}`)
      .expect(200);
    const accessToken = tokenRes.body.access_token;

    const postRes = await request(app)
      .post("/jobs")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        type: "pdf",
        payload: { title: "Integration PDF" },
      })
      .expect(200);

    assert.strictEqual(postRes.body.success, true);
    assert.ok(postRes.body.id);
    assert.ok(postRes.body.queueJobId);

    const getRes = await request(app)
      .get(`/jobs/${postRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    assert.strictEqual(getRes.body.type, "pdf");
    assert.ok(
      ["queued", "active", "completed", "retrying"].includes(getRes.body.status)
    );
  });
});

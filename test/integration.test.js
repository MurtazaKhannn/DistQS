require("dotenv").config();

const { test, describe, after } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");

const run = process.env.RUN_INTEGRATION === "1";
const skip = process.env.SKIP_INTEGRATION === "1" || !run;

describe("integration (RUN_INTEGRATION=1, Postgres + Redis)", () => {
  after(async () => {
    if (!run || skip) return;
    const { disconnectPrisma } = require("../src/db/client");
    await disconnectPrisma();
  });

  test("POST /jobs then GET /jobs/:id", { skip }, async () => {
    const { createApp } = require("../src/api/app");
    const app = createApp();

    const postRes = await request(app)
      .post("/jobs")
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
      .expect(200);

    assert.strictEqual(getRes.body.type, "pdf");
    assert.ok(
      ["queued", "active", "completed", "retrying"].includes(getRes.body.status)
    );
  });
});

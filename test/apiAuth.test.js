const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");

describe("API JWT auth (JWT_SECRET + JOB_API_BEARER_TOKEN exchange)", () => {
  let previousExchange;
  let previousJwtSecret;

  before(() => {
    previousExchange = process.env.JOB_API_BEARER_TOKEN;
    previousJwtSecret = process.env.JWT_SECRET;
    process.env.JOB_API_BEARER_TOKEN = "api-auth-test-exchange-secret";
    process.env.JWT_SECRET = "api-auth-test-jwt-secret-at-least-32-chars!!";
  });

  after(async () => {
    try {
      const { taskQueue } = require("../src/queues/taskQueue");
      await taskQueue.close();
    } catch {
      // ignore if queue never loaded
    }
    if (previousExchange === undefined) {
      delete process.env.JOB_API_BEARER_TOKEN;
    } else {
      process.env.JOB_API_BEARER_TOKEN = previousExchange;
    }
    if (previousJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousJwtSecret;
    }
  });

  async function mintAccessToken(app) {
    const res = await request(app)
      .post("/auth/token")
      .set(
        "Authorization",
        "Bearer api-auth-test-exchange-secret"
      );
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.access_token);
    return res.body.access_token;
  }

  test("POST /auth/token returns 401 for wrong exchange secret", async () => {
    const { createApp } = require("../src/api/app");
    const app = createApp();

    const res = await request(app)
      .post("/auth/token")
      .set("Authorization", "Bearer wrong-exchange");

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, "Unauthorized");
  });

  test("POST /auth/token returns 503 when JWT_SECRET is unset", async () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    const { createApp } = require("../src/api/app");
    const app = createApp();

    const res = await request(app)
      .post("/auth/token")
      .set(
        "Authorization",
        "Bearer api-auth-test-exchange-secret"
      );

    assert.strictEqual(res.status, 503);
    process.env.JWT_SECRET = saved;
  });

  test("POST /auth/token returns 200 with access_token", async () => {
    const { createApp } = require("../src/api/app");
    const app = createApp();

    const res = await request(app)
      .post("/auth/token")
      .set(
        "Authorization",
        "Bearer api-auth-test-exchange-secret"
      );

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.access_token);
    assert.strictEqual(res.body.token_type, "Bearer");
    assert.ok(Number.isFinite(res.body.expires_in));
  });

  test("POST /jobs returns 401 without Authorization", async () => {
    const { createApp } = require("../src/api/app");
    const app = createApp();

    const res = await request(app)
      .post("/jobs")
      .send({ type: "pdf", payload: { title: "x" } });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, "Unauthorized");
  });

  test("POST /jobs returns 401 when Bearer is exchange secret not JWT", async () => {
    const { createApp } = require("../src/api/app");
    const app = createApp();

    const res = await request(app)
      .post("/jobs")
      .set(
        "Authorization",
        "Bearer api-auth-test-exchange-secret"
      )
      .send({ type: "pdf", payload: { title: "x" } });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, "Unauthorized");
  });

  test("POST /jobs returns 401 for invalid JWT", async () => {
    const { createApp } = require("../src/api/app");
    const app = createApp();

    const res = await request(app)
      .post("/jobs")
      .set("Authorization", "Bearer not-a-valid-jwt")
      .send({ type: "pdf", payload: { title: "x" } });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, "Unauthorized");
  });

  test("POST /jobs returns 401 for malformed Authorization (not Bearer)", async () => {
    const { createApp } = require("../src/api/app");
    const app = createApp();

    const res = await request(app)
      .post("/jobs")
      .set("Authorization", "Basic abc")
      .send({ type: "pdf", payload: { title: "x" } });

    assert.strictEqual(res.status, 401);
  });

  test("POST /jobs with valid JWT runs validation (400 invalid body)", async () => {
    const { createApp } = require("../src/api/app");
    const app = createApp();
    const jwt = await mintAccessToken(app);

    const res = await request(app)
      .post("/jobs")
      .set("Authorization", `Bearer ${jwt}`)
      .send({ type: "pdf", payload: {} });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, "Validation failed");
  });

  test("GET /jobs/:id returns 401 without Authorization", async () => {
    const { createApp } = require("../src/api/app");
    const app = createApp();

    const res = await request(app).get("/jobs/some-cuid");

    assert.strictEqual(res.status, 401);
  });

  test("POST /auth/token returns 401 when JOB_API_BEARER_TOKEN is unset", async () => {
    const saved = process.env.JOB_API_BEARER_TOKEN;
    delete process.env.JOB_API_BEARER_TOKEN;
    const { createApp } = require("../src/api/app");
    const app = createApp();

    const res = await request(app)
      .post("/auth/token")
      .set(
        "Authorization",
        "Bearer api-auth-test-exchange-secret"
      );

    assert.strictEqual(res.status, 401);

    process.env.JOB_API_BEARER_TOKEN = saved;
  });
});

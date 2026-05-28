const { test } = require("node:test");
const assert = require("node:assert");
const {
  postJobBodySchema,
  formatZodError,
} = require("../src/validators/jobValidators");

test("accepts valid email job", () => {
  const r = postJobBodySchema.safeParse({
    type: "email",
    payload: { to: "user@example.com", subject: "Hello" },
  });
  assert.strictEqual(r.success, true);
});

test("rejects email without subject", () => {
  const r = postJobBodySchema.safeParse({
    type: "email",
    payload: { to: "user@example.com" },
  });
  assert.strictEqual(r.success, false);
  assert.ok(formatZodError(r.error).length > 0);
});

test("accepts valid pdf job", () => {
  const r = postJobBodySchema.safeParse({
    type: "pdf",
    payload: { title: "Report" },
  });
  assert.strictEqual(r.success, true);
});

test("accepts pdf job with title and data", () => {
  const r = postJobBodySchema.safeParse({
    type: "pdf",
    payload: {
      title: "Report",
      data: { rows: [{ product: "A", revenue: 50 }], total: 100 },
    },
  });
  assert.strictEqual(r.success, true);
});

test("rejects pdf job when data is not an object", () => {
  const r = postJobBodySchema.safeParse({
    type: "pdf",
    payload: { title: "Report", data: "not-json-object" },
  });
  assert.strictEqual(r.success, false);
});

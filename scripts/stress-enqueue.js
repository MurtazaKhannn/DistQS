/**
 * Fire many POST /jobs requests for manual stress testing.
 * Usage: node scripts/stress-enqueue.js [count] [baseUrl]
 * Example: node scripts/stress-enqueue.js 50 http://localhost:3000
 *
 * Requires JOB_API_BEARER_TOKEN (exchange secret). The API must have JWT_SECRET configured to mint tokens.
 * Loads .env via dotenv; obtains a JWT once via POST /auth/token.
 */

require("dotenv").config();
const baseUrl = process.argv[3] || "http://localhost:3000";
const raw = parseInt(process.argv[2] || "20", 10);
const count = Number.isFinite(raw) && raw > 0 ? raw : 20;

async function fetchAccessToken() {
  const exchange = process.env.JOB_API_BEARER_TOKEN;
  if (!exchange || !String(exchange).trim()) {
    console.error(
      "Set JOB_API_BEARER_TOKEN in the environment (exchange secret for POST /auth/token)."
    );
    process.exit(1);
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/auth/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${String(exchange).trim()}`,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("POST /auth/token failed", res.status, json);
    process.exit(1);
  }
  if (!json.access_token) {
    console.error("No access_token in /auth/token response", json);
    process.exit(1);
  }
  return json.access_token;
}

async function main() {
  const accessToken = await fetchAccessToken();

  const body = {
    type: "pdf",
    payload: { title: `Stress job` },
  };

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  for (let i = 0; i < count; i++) {
    body.payload.title = `Stress job ${i + 1}`;
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/jobs`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`Request ${i + 1} failed`, res.status, json);
      process.exitCode = 1;
      return;
    }
    console.log(`queued ${i + 1}/${count} id=${json.id}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Fire many POST /jobs requests for manual stress testing.
 * Usage: node scripts/stress-enqueue.js [count] [baseUrl]
 * Example: node scripts/stress-enqueue.js 50 http://localhost:3000
 */

const baseUrl = process.argv[3] || "http://localhost:3000";
const raw = parseInt(process.argv[2] || "20", 10);
const count = Number.isFinite(raw) && raw > 0 ? raw : 20;

async function main() {
  const body = {
    type: "pdf",
    payload: { title: `Stress job` },
  };

  for (let i = 0; i < count; i++) {
    body.payload.title = `Stress job ${i + 1}`;
    const res = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

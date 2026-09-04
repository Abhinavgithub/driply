import { expect, test } from "@playwright/test";

test("GET /api/health returns ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.status).toBe("ok");
  expect(typeof json.timestamp).toBe("string");
});

test("GET /api/readyz exposes db + storage shape", async ({ request }) => {
  const res = await request.get("/api/readyz");
  // 200 when healthy, 503 when degraded — either way the contract holds and
  // failure details stay generic (never raw hosts/connection strings).
  expect([200, 503]).toContain(res.status());
  const json = await res.json();
  expect(["ready", "degraded"]).toContain(json.status);
  expect(typeof json.checks?.db?.ok).toBe("boolean");
  expect(typeof json.checks?.storage?.ok).toBe("boolean");
  for (const check of [json.checks.db, json.checks.storage]) {
    expect(typeof check.latencyMs).toBe("number");
    if (!check.ok) expect(check.error).toBe("unavailable");
  }
});

import { expect, test } from "@playwright/test";

test("security headers on / (prod build)", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  const headers = res.headers();
  const csp = headers["content-security-policy"] ?? "";

  // Supabase origin pinned to the exact project (not the *.supabase.co
  // wildcard). Env-agnostic: works with the CI placeholder origin too.
  expect(csp).not.toContain("*.supabase.co");
  const supabaseSrc = csp.match(/https:\/\/[^\s;]*supabase\.co/)?.[0];
  expect(supabaseSrc).toBeTruthy();
  expect(supabaseSrc).not.toContain("*");
  // No data: images (previews use blob:); upgrade active in production.
  expect(csp).not.toMatch(/img-src[^;]*data:/);
  expect(csp).toContain("upgrade-insecure-requests");

  expect(headers["strict-transport-security"]).toContain("max-age=63072000");
  expect(headers["strict-transport-security"]).toContain("preload");
  expect(headers["x-dns-prefetch-control"]).toBe("off");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
});

test("/today allows geolocation for weather lookup", async ({ request }) => {
  // maxRedirects: 0 — assert on the /today response itself, not the
  // followed /sign-in page (which correctly carries the global deny policy).
  const res = await request.get("/today", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["permissions-policy"]).toContain("geolocation=(self)");
});

test("global permissions-policy denies geolocation elsewhere", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["permissions-policy"]).toContain("geolocation=()");
});

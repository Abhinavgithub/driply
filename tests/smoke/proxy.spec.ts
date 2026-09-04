import { expect, test } from "@playwright/test";

// Unauthenticated proxy matrix: protected pages (incl. future sub-routes)
// redirect to sign-in; client-guarded pages render; APIs are untouched.
const REDIRECT_CASES = [
  ["/today", "/sign-in?next=%2Ftoday"],
  ["/today/some-sub-route", "/sign-in?next=%2Ftoday%2Fsome-sub-route"],
  ["/library", "/sign-in?next=%2Flibrary"],
  ["/library/some-sub-route", "/sign-in?next=%2Flibrary%2Fsome-sub-route"],
] as const;

for (const [path, location] of REDIRECT_CASES) {
  test(`unauthenticated ${path} redirects to ${location}`, async ({ request }) => {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toBe(location);
  });
}

test("unauthenticated /profile renders (client-guarded, documented)", async ({ request }) => {
  const res = await request.get("/profile");
  expect(res.status()).toBe(200);
});

test("unauthenticated /api/health is untouched by the proxy", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
});

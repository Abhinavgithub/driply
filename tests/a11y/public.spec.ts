import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Public pages only — authenticated pages need a seeded-user fixture
// (tracked follow-up). Gate: zero serious/critical violations.
const PUBLIC_PAGES = ["/", "/sign-in", "/sign-up", "/forgot-password"] as const;

for (const path of PUBLIC_PAGES) {
  test(`axe: ${path} has no serious/critical violations`, async ({ page }) => {
    // Freeze animations (the global reduced-motion CSS override kills them):
    // axe color-contrast otherwise flakes on animated gradients.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const blocking = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(
      blocking.map((v) => `${v.id}: ${v.description} (${v.nodes.length} nodes)`),
      `axe violations on ${path}`,
    ).toEqual([]);
  });
}

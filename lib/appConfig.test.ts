import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { appConfig: { findMany: vi.fn() } },
}));

describe("getConfig failure backoff", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function setup() {
    const { prisma } = await import("@/lib/prisma");
    const findMany = prisma.appConfig.findMany as unknown as Mock;
    // NOTE: the vi.mock factory is evaluated once per file, so the mock fn
    // (and its call history) is shared across tests even with resetModules.
    // Clear history here; appConfig module state itself is fresh per test.
    findMany.mockClear();
    const { getConfig } = await import("@/lib/appConfig");
    return { findMany, getConfig };
  }

  it("backs off after cold-start failure instead of retrying per request", async () => {
    const { findMany, getConfig } = await setup();
    findMany.mockRejectedValue(new Error("db down"));
    process.env.BACKOFF_TEST_KEY = "env-fallback";

    await expect(getConfig("BACKOFF_TEST_KEY")).resolves.toBe("env-fallback");
    expect(findMany).toHaveBeenCalledTimes(1);

    // Still inside the 5s backoff window — no new DB hit.
    await expect(getConfig("BACKOFF_TEST_KEY")).resolves.toBe("env-fallback");
    expect(findMany).toHaveBeenCalledTimes(1);

    // Past the window — retries once.
    vi.setSystemTime(1_000_000 + 6_000);
    await expect(getConfig("BACKOFF_TEST_KEY")).resolves.toBe("env-fallback");
    expect(findMany).toHaveBeenCalledTimes(2);

    delete process.env.BACKOFF_TEST_KEY;
  });

  it("caches successful reads for the TTL window", async () => {
    const { findMany, getConfig } = await setup();
    findMany.mockResolvedValue([{ key: "CACHED_KEY", value: "db-value" }]);

    await expect(getConfig("CACHED_KEY")).resolves.toBe("db-value");
    await expect(getConfig("CACHED_KEY")).resolves.toBe("db-value");
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

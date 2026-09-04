import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { getDatabaseUrl } from "@/lib/env";

// Prevent creating a new PrismaClient on every hot-reload in dev.
// Both the client and its pg adapter are cached — recreating the adapter on
// every HMR while reusing the client leaks pg pools (P1-1).
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaAdapter?: PrismaPg;
};

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    if (!globalForPrisma.prismaAdapter) {
      // Lazily resolved so importing this module never throws: validateEnv()
      // in instrumentation.ts aggregates missing vars instead of crashing here
      // with a single stack trace (P1-1).
      globalForPrisma.prismaAdapter = new PrismaPg({ connectionString: getDatabaseUrl() });
    }
    globalForPrisma.prisma = new PrismaClient({
      adapter: globalForPrisma.prismaAdapter,
      log: ["error", "warn"],
    });
  }
  return globalForPrisma.prisma;
}

// Lazily initialized proxy: preserves the `prisma.model.action` call shape at
// all call sites while deferring getDatabaseUrl() (which throws when
// DATABASE_URL is missing) until first actual use.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const value = (getPrismaClient() as unknown as Record<PropertyKey, unknown>)[prop];
    if (typeof value !== "function") return value;
    const fn = value as (...args: never[]) => unknown;
    const client = getPrismaClient();
    return (...args: never[]) => fn.apply(client, args);
  },
});

if (process.env.NODE_ENV !== "production") {
  // Eagerly cache the instance in dev so HMR reuses a single client/adapter.
  try {
    getPrismaClient();
  } catch {
    // DATABASE_URL missing — leave uninitialized; validateEnv() reports it.
  }
}

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prevent creating a new PrismaClient on every hot-reload in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL for Prisma.");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

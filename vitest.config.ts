import { defineConfig } from "vitest/config";

export default defineConfig({
  // Native tsconfig path-alias resolution ("@/..." → project root).
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});

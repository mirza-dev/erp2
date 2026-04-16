import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/lib/services/**",
        "src/lib/stock-utils.ts",
        "src/lib/api-mappers.ts",
        "src/lib/ai-guards.ts",
        "src/lib/alert-ui-helpers.ts",
      ],
      exclude: ["src/__tests__/**"],
      thresholds: { lines: 80, functions: 80, branches: 80 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

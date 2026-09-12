import { defineConfig } from "vitest/config";
import path from "path";

// 2026-09-12: dosya `.ts` iken ESM sözdizimi CommonJS olarak yükleniyordu ve
// Vite bunu "gelecek major'da desteklenmeyecek" diye uyarıyordu. `.mts`ye
// alındı — ama `.mts` ESM'dir, yani `__dirname` YOKTUR. Alias sessizce
// bozulsaydı `@/...` çözülemez ve 7082 testin tamamı düşerdi; ESM karşılığı
// `import.meta.dirname` (Node >= 20.11) ile değiştirildi.

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["src/__tests__/setup.ts"],
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
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
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});

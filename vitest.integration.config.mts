import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Gerçek-DB entegrasyon kapısı (2026-09-16) — YEREL Supabase'e karşı koşar.
 *
 * `npm test` (vitest.config.mts) tamamen mock'ludur ve `src/__tests__` ile sınırlıdır; bu
 * config `tests/integration/**` dosyalarını alır, o dizin oraya HİÇ girmez → 7.1k'lık mock
 * suite'i etkilenmez. Playwright `.spec.ts` eşlediği için `.test.ts` dosyalarını da almaz.
 *
 * Ön koşul: `colima start && supabase start` (docs/yerel-gelistirme.md). Hedef yerel değilse
 * setup dosyası FAIL-CLOSED patlar — bu kapı canlıya ASLA gitmez (bkz. tests/integration/setup.ts).
 */
export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/integration/**/*.test.ts"],
        setupFiles: ["tests/integration/setup.ts"],
        globalSetup: ["tests/integration/global-setup.ts"],
        testTimeout: 60_000,
        hookTimeout: 120_000,
        fileParallelism: false,   // tek yerel DB; iki dosya aynı ürün stoğuna dokunmasın
    },
    resolve: {
        alias: { "@": path.resolve(import.meta.dirname, "./src") },
    },
});

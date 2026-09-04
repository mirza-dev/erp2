import { defineConfig, devices } from "@playwright/test";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Playwright doesn't auto-load .env.local — do it explicitly
dotenv.config({ path: path.join(__dirname, ".env.local") });

export const STORAGE_STATE = path.join(__dirname, "tests/.auth/user.json");

// Pre-create the auth directory so global-setup can write the file
fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });

export default defineConfig({
    testDir: "./tests",
    globalSetup: "./tests/global-setup.ts",
    globalTeardown: "./tests/global-teardown.ts",
    // 60 sn: dev sunucusu (Next 16 + Turbopack) bir rotayı İLK KEZ derlerken
    // navigasyon tek başına 30 sn'yi aşabiliyor — aynı test yeniden denemede
    // 5 sn'de geçiyor. Kısa timeout gerçek kusuru değil, soğuk derlemeyi ölçer.
    timeout: 60_000,
    // 2026-09-05: yerelde 1 → 0. Retry, kusuru DÜZELTMEZ; GİZLER. Bu suite
    // aylarca "yeşil" görünüyordu çünkü 8 test ilk denemede düşüp retry'da
    // geçiyordu ve rapor onları yalnız "flaky" diye işaretliyordu. Kök sebepler
    // bulunup kapatıldıktan sonra (hidrasyon yarışı + soğuk derleme) iki ardışık
    // koşumda 94/94 retry'sız geçti — yani retry'a artık gerek yok ve varlığı
    // bir sonraki yarışı yine gizlerdi. CI'da 2 kalıyor: orada amaç kusuru
    // görmek değil, altyapı hıçkırığında boşuna kırmızı yakmamak.
    retries: process.env.CI ? 2 : 0,
    fullyParallel: false,   // share a single dev server; parallelism risks data races
    workers: 1,
    reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],

    use: {
        baseURL: "http://localhost:3000",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "on-first-retry",
        locale: "tr-TR",
    },

    // SIRA ÖNEMLİ: `workers: 1` + bağımlılıksız projelerde Playwright projeleri
    // tanım sırasına göre koşturur. `auth` EN SONDA olmalı — içindeki çıkış
    // testi oturumu iptal ediyor ve `chromium`'un paylaştığı `storageState`
    // ondan sonra kullanılamaz hâle geliyordu (2026-08-30: dashboard.spec tek
    // başına 6/6, auth'tan sonra 2/6 → tüm suite giriş sayfasında kalıyordu).
    // Asıl sebep `/api/auth/logout`'un global kapsamlı signOut'uydu ve orada
    // düzeltildi; bu sıralama ikinci savunma — ileride oturumu geçersizleştiren
    // başka bir test eklenirse kaskad yine oluşmasın.
    projects: [
        // ── All tests that need a session ────────────────────────────────────
        {
            name: "chromium",
            testMatch: /(?<!auth)\.spec\.ts/,
            use: {
                ...devices["Desktop Chrome"],
                storageState: STORAGE_STATE,
            },
        },

        // ── Auth tests: explicitly no stored session; EN SONDA koşar ─────────
        {
            name: "auth",
            testMatch: /auth\.spec\.ts/,
            use: {
                ...devices["Desktop Chrome"],
                storageState: undefined,
            },
        },
    ],

    webServer: {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 60_000,
        stdout: "ignore",
        stderr: "pipe",
    },
});

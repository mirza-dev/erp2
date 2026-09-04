import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const STORAGE_STATE = path.join(__dirname, ".auth/user.json");

export default async function globalSetup() {
    const email    = process.env.E2E_USER_EMAIL    ?? "";
    const password = process.env.E2E_USER_PASSWORD ?? "";

    if (!email || !password) {
        throw new Error(
            "E2E_USER_EMAIL ve E2E_USER_PASSWORD env değişkenleri gereklidir.\n" +
            ".env.local dosyanıza ekleyin:\n" +
            "  E2E_USER_EMAIL=your@email.com\n" +
            "  E2E_USER_PASSWORD=yourpassword"
        );
    }

    const browser = await chromium.launch();
    const page    = await browser.newPage();

    await page.goto("http://localhost:3000/login");

    await page.getByLabel(/e-posta/i).fill(email);
    await page.getByLabel(/şifre/i).fill(password);
    await page.getByRole("button", { name: /giriş/i }).click();

    // Wait for redirect to dashboard
    await page.waitForURL("**/dashboard**", { timeout: 15_000 });

    // Ensure the .auth directory exists before writing
    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });

    // Persist auth state for all tests
    await page.context().storageState({ path: STORAGE_STATE });

    await warmRoutes(page);

    await browser.close();
}

/**
 * Suite'in dokunduğu her rotayı BİR KEZ derletir.
 *
 * NEDEN GEREKLİ: E2E `next dev`e karşı koşmak ZORUNDA. Üretim CSP'si
 * `connect-src`i `*.supabase.co` ile sınırlıyor ve yerel Supabase
 * `127.0.0.1:54321`de duruyor — `next start`a karşı koşulduğunda giriş
 * sessizce ("Failed to fetch") düşüyor. Yani "üretim sunucusuna karşı koş"
 * çözümü, üretim CSP'sini gevşetmeden mümkün DEĞİL (ve o string gate ile
 * kilitli). 2026-09-05'te denendi ve globalSetup girişte takıldı.
 *
 * Bedeli Turbopack'in İLK İSTEK derlemesi ödüyordu: 2026-09-05 baseline
 * koşumunda 8 test "flaky" çıktı; hepsi ilk denemede 30–60 sn'lik beklemeleri
 * aşıp retry'da 1 sn'de geçti. Derleme testin İÇİNDE olduğu sürece hangi
 * timeout yazılırsa yazılsın yarış sürüyor — 2026-08-30'da beklemeler
 * 15→30 sn'ye çıkarılmıştı ve yetmedi.
 *
 * Burada derleme test bütçesinin DIŞINDA yapılıyor: globalSetup'ın test
 * timeout'u yok. Isınma salt-okunur (yalnız GET) ve fail-soft — bir rota
 * ısıtılamazsa suite yine koşar, yalnız o rotanın ilk testi yavaş olur.
 */
async function warmRoutes(page: import("@playwright/test").Page) {
    // Dinamik rotalar da derlensin diye sahte bir UUID yeter: sayfa "bulunamadı"
    // gösterse bile Turbopack o route'u derlemiş olur.
    const FAKE_ID = "00000000-0000-4000-8000-000000000000";
    const routes = [
        "/dashboard",
        "/dashboard/alerts",
        "/dashboard/customers",
        "/dashboard/import",
        "/dashboard/import/excel",
        "/dashboard/orders",
        "/dashboard/orders/new",
        `/dashboard/orders/${FAKE_ID}`,
        "/dashboard/parasut",
        "/dashboard/production",
        "/dashboard/products",
        "/dashboard/products/aging",
        `/dashboard/products/${FAKE_ID}`,
        "/dashboard/purchase/suggested",
        "/dashboard/settings",
        "/dashboard/settings/users",
    ];

    const started = Date.now();
    let failed = 0;
    for (const route of routes) {
        try {
            await page.goto(`http://localhost:3000${route}`, {
                waitUntil: "domcontentloaded",
                timeout: 120_000,
            });
        } catch {
            failed++;
        }
    }
    const secs = Math.round((Date.now() - started) / 1000);
    console.log(`[warm] ${routes.length} rota ${secs} sn'de derlendi` + (failed ? ` (${failed} atlandı)` : ""));
}

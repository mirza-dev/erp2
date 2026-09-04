/**
 * Auth & Demo Mode E2E Tests
 * These tests run WITHOUT pre-stored auth state (see playwright.config.ts "auth" project).
 */
import { test, expect } from "@playwright/test";
import { gotoApp } from "./helpers/nav";

// Auth tests explicitly clear storageState
test.use({ storageState: { cookies: [], origins: [] } });

const EMAIL    = process.env.E2E_USER_EMAIL    ?? "";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "";

// ── Login ────────────────────────────────────────────────────────────────────

test("doğru kimlik bilgileri → dashboard'a yönlendirir", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/e-posta/i).fill(EMAIL);
    await page.getByLabel(/şifre/i).fill(PASSWORD);
    await page.getByRole("button", { name: /giriş/i }).click();
    await page.waitForURL("**/dashboard**", { timeout: 15_000 });
    expect(page.url()).toContain("/dashboard");
});

test("yanlış şifre → hata mesajı gösterir", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/e-posta/i).fill(EMAIL);
    await page.getByLabel(/şifre/i).fill("yanlis-sifre-12345");
    await page.getByRole("button", { name: /giriş/i }).click();
    await expect(page.getByText(/e-posta veya şifre hatalı/i)).toBeVisible({ timeout: 8_000 });
});

test("boş e-posta ile giriş → submit çalışmaz", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/şifre/i).fill(PASSWORD);
    const submitBtn = page.getByRole("button", { name: /giriş/i });
    // HTML5 required prevents submit — URL stays on /login
    await submitBtn.click();
    expect(page.url()).toContain("/login");
});

// ── Already authenticated redirects ─────────────────────────────────────────

test("giriş yapmış kullanıcı /dashboard'a erişebilir (oturum korunuyor)", async ({ page, context }) => {
    // Log in
    await page.goto("/login");
    await page.getByLabel(/e-posta/i).fill(EMAIL);
    await page.getByLabel(/şifre/i).fill(PASSWORD);
    await page.getByRole("button", { name: /giriş/i }).click();
    await page.waitForURL("**/dashboard**", { timeout: 15_000 });

    // Session is maintained — navigate away and back
    await gotoApp(page, "/dashboard/orders");
    expect(page.url()).toContain("/dashboard/orders");

    void context;
});

// ── Demo mode ────────────────────────────────────────────────────────────────

test("Demo Gez butonu → demo_mode cookie seti ve dashboard açılır", async ({ page }) => {
    await page.goto("/");
    const demoBtn = page.getByRole("button", { name: /demo gez/i })
        .or(page.getByRole("link", { name: /demo gez/i }));
    await demoBtn.first().click();
    await page.waitForURL("**/dashboard**", { timeout: 10_000 });

    const cookies = await page.context().cookies();
    const demoCookie = cookies.find(c => c.name === "demo_mode");
    expect(demoCookie?.value).toBe("1");
});

test("demo modda yazma işlemi (müşteri ekleme) engellenir", async ({ page }) => {
    // Set demo cookie
    await page.goto("/");
    await page.evaluate(() => {
        document.cookie = "demo_mode=1; path=/; max-age=86400; SameSite=Lax";
    });
    await gotoApp(page, "/dashboard/customers");

    const addBtn = page.getByRole("button", { name: /müşteri ekle|yeni müşteri/i });

    // 2026-09-05 — HİDRASYON YARIŞI düzeltildi (bu test iki koşumda da düştü).
    //
    // `useIsDemo()` cookie'yi ilk İSTEMCİ render'ında okur; sunucuda `document`
    // olmadığı için SSR HTML'i `isDemo=false` ile boyanır. Yani buton bir an
    // ETKİN görünüyor, hidrasyondan sonra `disabled` oluyor. Eski kurgu
    // görünürlüğü o pencerede ölçüp "etkin" dalına giriyor, sonra devre dışı
    // kalmış butona tıklamayı deniyor ve Playwright eyleme geçebilirlik için
    // 60 sn bekleyip düşüyordu.
    //
    // Çözüm beklemeyi KARARLI HÂLE bağlamak: Playwright bu iddiaları
    // kendiliğinden yeniden dener. `if (görünürse)` sarmalayıcısı da kalktı —
    // buton bulunamazsa test sessizce GEÇİYORDU, yani hiçbir şey kanıtlamıyordu.
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await expect(addBtn).toBeDisabled({ timeout: 15_000 });
    await expect(addBtn).toHaveAttribute("title", /demo/i);
    // Sunucu tarafı yasak ayrıca vitest'te: `demo-mode-middleware.test.ts`
    // (POST/PATCH/DELETE → 403). Buradaki iddia UI guard'ının kendisi.
});

test("demo modda buton title attribute 'Demo modunda...' içerir", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
        document.cookie = "demo_mode=1; path=/; max-age=86400; SameSite=Lax";
    });
    await gotoApp(page, "/dashboard/products");

    // "Yeni Ürün" butonu demo modda devre dışı ve sebebini `title`da söylüyor.
    // Aynı hidrasyon yarışı (yukarıdaki teste bak): attribute'lar SSR anında
    // henüz yazılmamış oluyordu, `expect(...).toBeTruthy()` false görüyordu.
    // Anlık okuma yerine Playwright'ın yeniden deneyen iddiaları kullanılıyor.
    const newProductBtn = page.getByRole("button", { name: /yeni ürün/i });
    await expect(newProductBtn).toBeVisible({ timeout: 10_000 });
    await expect(newProductBtn).toBeDisabled({ timeout: 15_000 });
    await expect(newProductBtn).toHaveAttribute("title", /demo/i);
});

test("çıkış yap → /login sayfasına yönlendirir", async ({ page }) => {
    // Log in first
    await page.goto("/login");
    await page.getByLabel(/e-posta/i).fill(EMAIL);
    await page.getByLabel(/şifre/i).fill(PASSWORD);
    await page.getByRole("button", { name: /giriş/i }).click();
    await page.waitForURL("**/dashboard**");

    // Click the "Çıkış Yap" button in the sidebar
    await page.getByRole("button", { name: /çıkış yap/i }).click();
    await page.waitForURL("**/login**", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
});

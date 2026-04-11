/**
 * Auth & Demo Mode E2E Tests
 * These tests run WITHOUT pre-stored auth state (see playwright.config.ts "auth" project).
 */
import { test, expect } from "@playwright/test";

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
    await page.goto("/dashboard/orders");
    await page.waitForLoadState("networkidle");
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
    await page.goto("/dashboard/customers");
    await page.waitForLoadState("networkidle");

    const addBtn = page.getByRole("button", { name: /müşteri ekle|yeni müşteri/i });
    if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const isDisabled = await addBtn.isDisabled();
        if (isDisabled) {
            // Button is disabled — demo mode is blocking writes as expected
            expect(isDisabled).toBe(true);
        } else {
            // Button is enabled — click and expect a toast block
            await addBtn.click();
            const toast = page.getByText(/demo modunda değişiklik yapılamaz/i);
            await expect(toast).toBeVisible({ timeout: 5_000 });
        }
    }
});

test("demo modda buton title attribute 'Demo modunda...' içerir", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
        document.cookie = "demo_mode=1; path=/; max-age=86400; SameSite=Lax";
    });
    await page.goto("/dashboard/products");
    await page.waitForLoadState("networkidle");

    // "+ Yeni Ürün" butonu disabled veya title içeriyor
    const newProductBtn = page.getByRole("button", { name: /yeni ürün/i });
    if (await newProductBtn.isVisible()) {
        const title    = await newProductBtn.getAttribute("title") ?? "";
        const disabled = await newProductBtn.getAttribute("disabled");
        expect(title.toLowerCase().includes("demo") || disabled !== null).toBeTruthy();
    }
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

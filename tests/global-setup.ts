import { chromium } from "@playwright/test";
import { STORAGE_STATE } from "../playwright.config";
import fs from "fs";
import path from "path";

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
    await browser.close();
}

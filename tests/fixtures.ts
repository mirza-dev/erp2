import { test as base, Page } from "@playwright/test";

/**
 * Custom fixture: a page with demo_mode=1 cookie (no login required).
 * Use this in auth.spec.ts demo mode tests and any read-only spec.
 */
export const test = base.extend<{ demoPage: Page }>({
    demoPage: async ({ browser }, use) => {
        const context = await browser.newContext({ storageState: undefined });
        const page    = await context.newPage();

        // Set demo cookie the same way the landing page button does
        await page.goto("/");
        await page.evaluate(() => {
            document.cookie = "demo_mode=1; path=/; max-age=86400; SameSite=Lax";
        });

        // eslint-disable-next-line react-hooks/rules-of-hooks
        await use(page);
        await context.close();
    },
});

export { expect } from "@playwright/test";

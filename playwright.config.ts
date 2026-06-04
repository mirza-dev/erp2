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
    timeout: 30_000,
    retries: process.env.CI ? 2 : 1,
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

    projects: [
        // ── Auth tests: explicitly no stored session ─────────────────────────
        {
            name: "auth",
            testMatch: /auth\.spec\.ts/,
            use: {
                ...devices["Desktop Chrome"],
                storageState: undefined,
            },
        },

        // ── All other tests: use persistent session ──────────────────────────
        {
            name: "chromium",
            testMatch: /(?<!auth)\.spec\.ts/,
            use: {
                ...devices["Desktop Chrome"],
                storageState: STORAGE_STATE,
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

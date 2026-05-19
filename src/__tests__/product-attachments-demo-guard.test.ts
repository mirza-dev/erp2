/**
 * Faz 2d Review P3-005 — ENV opt-in demo guard for attachments routes.
 *
 * Coverage (source-regex — middleware.ts):
 *   - ATTACHMENTS_BLOCK_DEMO_ANON env flag whitelist'i mevcut
 *   - Demo block koşulu /api/products/:id/attachments path'ini kapsıyor
 *   - 401 status döndürülüyor (anonim demo cookie + private bucket)
 *   - Default kapalı (env yoksa mevcut akış değişmez)
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MIDDLEWARE = fs.readFileSync(
    path.join(process.cwd(), "middleware.ts"),
    "utf8",
);

const URL_ROUTE = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/products/[id]/attachments/[attachmentId]/url/route.ts"),
    "utf8",
);

const ENV_EXAMPLE = fs.readFileSync(
    path.join(process.cwd(), ".env.example"),
    "utf8",
);

describe("Faz 2d Review P3-005 — middleware demo guard", () => {
    it("middleware reads ATTACHMENTS_BLOCK_DEMO_ANON env flag", () => {
        expect(MIDDLEWARE).toMatch(/process\.env\.ATTACHMENTS_BLOCK_DEMO_ANON === "true"/);
    });

    it("guard targets /api/products/:id/attachments path tree", () => {
        // Middleware kaynağında: /^\/api\/products\/[^/]+\/attachments/
        expect(MIDDLEWARE).toContain("\\/api\\/products\\/[^/]+\\/attachments");
    });

    it("guard returns 401 with Turkish message", () => {
        expect(MIDDLEWARE).toMatch(/status:\s*401/);
        expect(MIDDLEWARE).toMatch(/kimlik doğrulama gerekiyor/);
    });

    it("guard sits INSIDE the demo-cookie branch (not unconditional)", () => {
        // env+demo-cookie kombinasyonu — production'da env aktifken bile
        // authenticated kullanıcı etkilenmemeli.
        const idx = MIDDLEWARE.indexOf("ATTACHMENTS_BLOCK_DEMO_ANON");
        const before = MIDDLEWARE.slice(0, idx);
        expect(before).toMatch(/isDemoMode/);
    });

    it("url route documents the env flag in its security note", () => {
        expect(URL_ROUTE).toMatch(/ATTACHMENTS_BLOCK_DEMO_ANON=true/);
    });

    it(".env.example documents the opt-in flag", () => {
        expect(ENV_EXAMPLE).toMatch(/ATTACHMENTS_BLOCK_DEMO_ANON/);
    });
});

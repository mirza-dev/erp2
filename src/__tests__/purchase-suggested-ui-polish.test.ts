/**
 * Öneriler sayfası — UI polish regresyon kilidi (source-regex)
 *   - Arama input aria-label taşır
 *   - Hardcoded rgba(248,81,73,0.04) kalmadı → var(--danger-bg-subtle)
 *   - globals.css --danger-bg-subtle tanımlar
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const page = readFileSync(join(ROOT, "app/dashboard/purchase/suggested/page.tsx"), "utf8");
const globals = readFileSync(join(ROOT, "app/globals.css"), "utf8");

describe("Öneriler UI polish", () => {
    it("arama input aria-label taşır", () => {
        expect(page).toMatch(/aria-label="Ürün adı veya SKU'ya göre ara"/);
    });

    it("hardcoded danger-tint rgba kalmadı", () => {
        expect(page).not.toMatch(/rgba\(248\s*,\s*81\s*,\s*73\s*,\s*0\.04\)/);
    });

    it("danger-bg-subtle CSS var kullanılır (en az 2 callsite)", () => {
        const matches = page.match(/var\(--danger-bg-subtle\)/g) ?? [];
        expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it("globals.css --danger-bg-subtle tanımlar", () => {
        expect(globals).toMatch(/--danger-bg-subtle:\s*rgba\(248,\s*81,\s*73,\s*0\.04\)/);
    });
});

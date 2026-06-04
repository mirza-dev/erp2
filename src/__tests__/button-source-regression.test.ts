import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

const PRIMARY_CTA_FILES = [
    "src/app/dashboard/page.tsx",
    "src/app/dashboard/vendors/page.tsx",
    "src/app/dashboard/customers/page.tsx",
    "src/app/dashboard/products/page.tsx",
    "src/app/dashboard/orders/page.tsx",
    "src/app/dashboard/quotes/page.tsx",
    "src/app/dashboard/purchase/orders/page.tsx",
    "src/app/dashboard/settings/product-types/page.tsx",
    "src/app/dashboard/settings/note-templates/page.tsx",
    "src/app/dashboard/settings/users/page.tsx",
];

const FULL_CTA_FILES = PRIMARY_CTA_FILES.filter(file => file !== "src/app/dashboard/page.tsx");

describe("premium button source regression", () => {
    it("ana CTA'larda literal '+ Yeni' metni kullanılmaz", () => {
        for (const file of PRIMARY_CTA_FILES) {
            const source = readFileSync(join(projectRoot, file), "utf8");
            expect(source, file).not.toMatch(/\+\s*Yeni\s+(Sipariş|Teklif|Müşteri|Tedarikçi|Ürün|Şablon|Kullanıcı)/);
        }
    });

    it("ana CTA'lar Lucide Plus icon pattern'ine bağlıdır", () => {
        for (const file of PRIMARY_CTA_FILES) {
            const source = readFileSync(join(projectRoot, file), "utf8");
            expect(source, file).toContain("leftIcon=");
            expect(source, file).toContain("<Plus");
        }
    });

    it("dashboard harici ana CTA'lar cta size pattern'ine bağlıdır", () => {
        for (const file of FULL_CTA_FILES) {
            const source = readFileSync(join(projectRoot, file), "utf8");
            expect(source, file).toContain('size="cta"');
        }
    });
});

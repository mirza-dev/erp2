/**
 * Liste satır hover'ı DOM-mutation antipattern'inden önce `hoveredId` state'ine,
 * ardından (Faz B #7) ortak `DataTable` + globals.css `.erp-data-table` kuralına
 * taşındı. Doğrudan `td.style.background` yazımı Strict Mode / React reconciliation
 * ile çakışan kırılgan bir paterndi; per-satır `hoveredId` state'i ise her hover'da
 * tüm listeyi yeniden render ediyordu. Bu test source-regex ile regresyonu kilitler.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/products/page.tsx"),
    "utf-8",
);

describe("products list — hover state (no DOM mutation, no rerender)", () => {
    it("Card + DataTable kullanır, satırlar rows prop'undan gelir", () => {
        expect(SRC).toContain("<DataTable");
        expect(SRC).toContain("<Card>");
        expect(SRC).toMatch(/rows=\{pageRows\}/);
        // Elle yazılmış tablo DOM'u DataTable'a taşındı.
        expect(SRC).not.toMatch(/<table/);
        expect(SRC).not.toMatch(/<thead>/);
    });

    it("hover CSS'e bırakıldı — hoveredId state / mouse handler YOK", () => {
        expect(SRC).not.toMatch(/hoveredId/);
        expect(SRC).not.toMatch(/setHoveredId/);
        expect(SRC).not.toMatch(/onMouseEnter=\{\(\) => setHoveredId/);
        expect(SRC).not.toMatch(/const rowBg =/);
        expect(SRC).not.toMatch(/background: rowBg/);
    });

    it("REGRESSION: doğrudan td.style.background DOM mutation YOK", () => {
        expect(SRC).not.toMatch(/querySelectorAll\("td"\)\.forEach/);
        expect(SRC).not.toMatch(/td\.style\.background/);
    });

    it("inline silme onayı (confirmDeleteId) korunur — hover'a kuplajlı değil", () => {
        expect(SRC).toMatch(/confirmDeleteId/);
        // mouse-leave confirm state'ini sıfırlamamalı
        expect(SRC).not.toMatch(/onMouseLeave=\{[^}]*setConfirmDeleteId/);
    });

    it("satır klavyeyle de açılabilir — a11y DataTable'a devredildi", () => {
        // Eski elle yazılmış tabIndex/role/onKeyDown yerine DataTable sözleşmesi:
        // onRowClick → tabIndex=0 + Enter/Space, rowAriaLabel → erişilebilir ad.
        expect(SRC).toMatch(/onRowClick=\{product =>/);
        expect(SRC).toMatch(/rowAriaLabel=\{product =>/);
    });
});

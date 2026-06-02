/**
 * Liste satır hover'ı DOM-mutation antipattern'inden hoveredId state'ine taşındı
 * (orders/quotes precedent'i). DOM'a doğrudan `td.style.background` yazımı,
 * Strict Mode / React reconciliation ile çakışan kırılgan bir paterndi.
 * Bu test source-regex ile regresyonu kilitler.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/products/page.tsx"),
    "utf-8",
);

describe("products list — hover state (no DOM mutation)", () => {
    it("hoveredId state tanımlı", () => {
        expect(SRC).toMatch(/const \[hoveredId, setHoveredId\] = useState<string \| null>\(null\)/);
    });
    it("onMouseEnter/onMouseLeave state setter kullanır", () => {
        expect(SRC).toMatch(/onMouseEnter=\{\(\) => setHoveredId\(product\.id\)\}/);
        expect(SRC).toMatch(/onMouseLeave=\{\(\) => setHoveredId\(null\)\}/);
    });
    it("satır td'leri koşullu rowBg kullanır", () => {
        expect(SRC).toMatch(/const rowBg = hoveredId === product\.id \? "var\(--bg-secondary\)" : "transparent"/);
        expect(SRC).toMatch(/background: rowBg/);
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
});

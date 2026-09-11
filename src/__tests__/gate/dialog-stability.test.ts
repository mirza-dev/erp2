/**
 * KAPI — diyalog davranış çekirdeğinin ömrü prop KİMLİĞİNE bağlanamaz.
 *
 * 2026-09-11 dış inceleme bulgusu #1. `useDialogA11y`nin odak/Escape/tuzak
 * effect'i `onClose` bağımlılığındaydı. Çağıranların neredeyse hepsi prop'u
 * inline yazdığı için (`onClose={() => setX(null)}`) ebeveynin her render'ında
 * effect sökülüp yeniden kuruluyor, odak da diyalogdaki ilk odaklanabilir
 * öğeye dönüyordu: form state'i ebeveynde tutan diyaloglarda YAZILAMIYORDU.
 *
 * Davranış kanıtı `dialog-focus-stability.test.tsx`te (gerçek render, gerçek
 * odak). Burası kaynak kilidi: iddia dosyada `onClose` geçmesine DEĞİL,
 * effect'in BAĞIMLILIK DİZİSİNE bağlanır — yoksa kural komşusuna tutunur.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SRC = stripComments(read("src/components/ui/dialog-a11y.ts"));

/** `useEffect(...)`in kapanış bağımlılık dizisini döndürür. */
function effectDeps(src: string): string {
    const start = src.indexOf("useEffect(");
    expect(start, "`useEffect(` bulunamadı — ayrıştırıcı bozuk, altındaki iddialar sahte-yeşil olurdu").toBeGreaterThan(-1);
    const m = src.slice(start).match(/\n\s*\},\s*\[([^\]]*)\]\s*\)\s*;/);
    expect(m, "effect'in kapanış bağımlılık dizisi ayrıştırılamadı").toBeTruthy();
    return m![1];
}

describe("gate/dialog-stability — effect ömrü prop kimliğine bağlanamaz", () => {
    it("odak effect'inin bağımlılık dizisinde `onClose` YOK", () => {
        const deps = effectDeps(SRC)
            .split(",")
            .map(d => d.trim())
            .filter(Boolean);

        expect(
            deps,
            "effect `onClose`a bağlı — inline prop veren her çağıranda odak her render'da sıfırlanır",
        ).not.toContain("onClose");
    });

    it("bağımlılık dizisi YALNIZ kararlı referanslardan oluşur", () => {
        // Ref nesneleri (`dialogRef`) React sözleşmesi gereği kararlıdır.
        // Yeni bir prop buraya eklenirse kusur aynı biçimde geri gelir.
        const deps = effectDeps(SRC)
            .split(",")
            .map(d => d.trim())
            .filter(Boolean);

        expect(deps, `beklenmeyen bağımlılık: ${deps.join(", ")}`).toEqual(["dialogRef"]);
    });

    it("`onClose` ref üzerinden okunur — güncel değer yine çağrılır", () => {
        // Ref'e almak "eski closure'a takıl" demek OLMAMALI: her kullanım
        // `.current` üzerinden gitmeli.
        expect(SRC, "`onCloseRef` kurulmamış").toMatch(/const onCloseRef = useRef\(onClose\)/);
        expect(SRC, "ref her render'da tazelenmiyor").toMatch(/onCloseRef\.current = onClose/);

        // Doğrudan `onClose()` çağrısı kalmamalı (bildirim ve ref ataması hariç).
        const bareCalls = SRC.match(/(?<![.\w])onClose\(\)/g) ?? [];
        expect(bareCalls, "`onClose()` doğrudan çağrılıyor — ref atlanmış").toEqual([]);
    });

    it("`dismissible` de ref'te kalır — iki prop aynı gerekçeyi paylaşır", () => {
        expect(SRC).toMatch(/const dismissibleRef = useRef\(dismissible\)/);
        expect(SRC).toMatch(/dismissibleRef\.current = dismissible/);
    });
});

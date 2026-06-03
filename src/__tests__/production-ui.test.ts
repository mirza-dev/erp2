/**
 * Üretim Girişi sayfası — final ürün UI source-regex testleri.
 *
 * Bu tur 3 düzeltmeyi kilitler (servis/RPC davranışı production-service.test.ts'te):
 *   1. [BOM] addUretimKaydi (data-context) buildShortageMessage ile zengin hata;
 *      handleSave kısmi dalı firstError'ı toast'a taşır.
 *   2. [silme onayı] kayıt silme tek-tıktan onay modalına (role=dialog/aria-modal/
 *      aria-labelledby + başlık id); × yalnız modalı açar.
 *   3. [a11y] tarih input + satır-kaldır × + silme × aria-label taşır.
 *
 * Kaynak okuma yöntemi (vendors-ui / voice-production-page aynası): JSX davranışı
 * jsdom render etmeden source-regex ile kilitlenir.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGE_SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/production/page.tsx"),
    "utf8",
);
const CTX_SRC = readFileSync(
    join(process.cwd(), "src/lib/data-context.tsx"),
    "utf8",
);

// ── 1. BOM eksik-bileşen zengin mesaj ─────────────────────────

describe("Üretim — BOM eksik-bileşen şeffaflığı", () => {
    it("data-context buildShortageMessage'ı import eder ve shortages payload'ını kullanır", () => {
        expect(CTX_SRC).toMatch(/import\s+\{\s*buildShortageMessage\s*\}\s+from\s+"\.\/production-shortage-helpers"/);
        expect(CTX_SRC).toMatch(/buildShortageMessage\(\s*errBody\?\.shortages\s*,\s*fallback\s*\)/);
    });

    it("handleSave kısmi dalı firstError'ı toast mesajına taşır", () => {
        // succeeded>0 && failed>0 dalında firstError detay olarak eklenir
        expect(PAGE_SRC).toMatch(/const detail = firstError \? ` \$\{firstError\}` : "";/);
        expect(PAGE_SRC).toMatch(/kayıt başarısız\.\$\{detail\}/);
    });
});

// ── 2. Silme onay modalı ──────────────────────────────────────

describe("Üretim — kayıt silme onay modalı", () => {
    it("confirmDeleteId state + performDelete handler tanımlı", () => {
        expect(PAGE_SRC).toMatch(/const \[confirmDeleteId, setConfirmDeleteId\] = useState<string \| null>\(null\)/);
        expect(PAGE_SRC).toMatch(/const performDelete = async \(id: string\)/);
    });

    it("silme × butonu doğrudan silmez, yalnız modalı açar (setConfirmDeleteId)", () => {
        expect(PAGE_SRC).toMatch(/setConfirmDeleteId\(kaydi\.id\)/);
    });

    it("modal panel role=dialog + aria-modal=true + aria-labelledby + başlık id taşır", () => {
        expect(PAGE_SRC).toMatch(/role="dialog"/);
        expect(PAGE_SRC).toMatch(/aria-modal="true"/);
        expect(PAGE_SRC).toMatch(/aria-labelledby="delete-production-title"/);
        expect(PAGE_SRC).toMatch(/id="delete-production-title"/);
    });

    it("onayla butonu performDelete'i çağırır + 'Vazgeç' butonu var", () => {
        expect(PAGE_SRC).toMatch(/onClick=\{\(\) => void performDelete\(confirmDeleteId\)\}/);
        expect(PAGE_SRC).toMatch(/Vazgeç/);
        expect(PAGE_SRC).toMatch(/Evet, sil/);
    });
});

// ── 3. a11y — etiketsiz kontroller ────────────────────────────

describe("Üretim — a11y aria-label'lar", () => {
    it("tarih input aria-label taşır", () => {
        expect(PAGE_SRC).toMatch(/aria-label="Üretim tarihi"/);
    });

    it("satır-kaldır × butonu aria-label taşır", () => {
        expect(PAGE_SRC).toMatch(/aria-label=\{`\$\{idx \+ 1\}\. satırı kaldır`\}/);
    });

    it("silme × butonu aria-label taşır", () => {
        expect(PAGE_SRC).toMatch(/aria-label=\{`\$\{kaydi\.productName\} üretim kaydını sil`\}/);
    });
});

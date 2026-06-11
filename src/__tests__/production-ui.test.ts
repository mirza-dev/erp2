/**
 * Üretim Girişi sayfası — final ürün UI source-regex testleri.
 *
 * Bu tur 3 düzeltmeyi kilitler (servis/RPC davranışı production-service.test.ts'te):
 *   1. [BOM] addUretimKaydi (data-context) buildShortageMessage ile zengin hata;
 *      handleSave kısmi dalı firstError'ı toast'a taşır.
 *   2. [silme onayı] kayıt silme tek-tıktan onay modalına (role=dialog/aria-modal/
 *      aria-labelledby + başlık id); × yalnız modalı açar.
 *   3. [a11y] tarih input + satır-kaldır × + silme × aria-label taşır.
 *   4. [tarih bağlamı] seçilen gün kayıt listesi, başlık ve silme hedefini birlikte yönetir.
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
        expect(PAGE_SRC).toMatch(/aria-label="Kayıt tarihi"/);
    });

    it("satır-kaldır × butonu aria-label taşır", () => {
        expect(PAGE_SRC).toMatch(/aria-label=\{`\$\{idx \+ 1\}\. satırı kaldır`\}/);
    });

    it("satır alanları erişilebilir ad, native aksiyon butonları açık type taşır", () => {
        expect(PAGE_SRC).toMatch(/aria-label=\{`\$\{idx \+ 1\}\. satır ürün`\}/);
        expect(PAGE_SRC).toMatch(/aria-label=\{`\$\{idx \+ 1\}\. satır adet`\}/);
        expect(PAGE_SRC).toMatch(/aria-label=\{`\$\{idx \+ 1\}\. satır not`\}/);
        expect(PAGE_SRC.match(/type="button"/g)).toHaveLength(2);
    });

    it("silme × butonu aria-label taşır", () => {
        expect(PAGE_SRC).toMatch(/aria-label=\{`\$\{kaydi\.productName\} üretim kaydını sil`\}/);
    });

    it("ses kaydı iptal kontrolü erişilebilir ada sahiptir", () => {
        expect(PAGE_SRC).toMatch(/aria-label="Ses kaydını iptal et"/);
    });
});

describe("Üretim — seçili tarih aktif çalışma bağlamıdır", () => {
    it("seçilen tarih hem kaydetme payload'ına hem günlük kayıt listesine gider", () => {
        expect(PAGE_SRC).toMatch(/tarih,\s*\n\s*girenKullanici/);
        expect(PAGE_SRC).toMatch(/const selectedDateLogs = uretimKayitlari\.filter\(k => k\.tarih === tarih\)/);
        expect(PAGE_SRC).not.toMatch(/const todayLogs =/);
    });

    it("seçili gün dışındaki kayıtlar ayrı listelenir ve silme hedefi seçili günden bulunur", () => {
        expect(PAGE_SRC).toMatch(/const otherDateLogs = uretimKayitlari\.filter\(k => k\.tarih !== tarih\)/);
        expect(PAGE_SRC).toContain("Diğer Günlerin Kayıtları");
        expect(PAGE_SRC).toMatch(/const target = selectedDateLogs\.find\(k => k\.id === confirmDeleteId\)/);
    });

    it("gelecek tarih ve boş tarih arayüzde bugüne sabitlenir", () => {
        expect(PAGE_SRC).toMatch(/max=\{todayStr\}/);
        expect(PAGE_SRC).toMatch(/!e\.target\.value \|\| e\.target\.value > todayStr \? todayStr : e\.target\.value/);
    });

    it("geçmiş tarih uyarısı ve Bugüne Dön aksiyonu görünür", () => {
        expect(PAGE_SRC).toContain("Geçmiş tarih seçili. Kaydedilen üretim stoğu şimdi günceller.");
        expect(PAGE_SRC).toContain("Bugüne Dön");
        expect(PAGE_SRC).toMatch(/onClick=\{\(\) => setTarih\(todayStr\)\}/);
    });

    it("seçili tarih için dinamik başlık ve boş durum metni kullanılır", () => {
        expect(PAGE_SRC).toContain('`${selectedDateLabel} Üretim Kayıtları`');
        expect(PAGE_SRC).toContain("Seçili tarihte üretim kaydı bulunmuyor");
    });
});

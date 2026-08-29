/**
 * A2 (2026-08-24) — Geçmiş gün üretim kaydına erişim.
 *
 * `reverse_production` (mig.104) ve `DELETE /api/production/[id]` hazırdı, UI'da
 * onaylı silme akışı da vardı — ama YALNIZ seçili günün listesinde. Operatör
 * geçen haftaki hatalı kaydı "Diğer Günlerin Kayıtları" tablosunda görüyor ama
 * üzerinde hiçbir şey yapamıyordu; tarih seçiciyi o güne almayı bilmesi
 * gerekiyordu.
 *
 * Silme butonunu o tabloya koymak BOZUK olurdu: onay modalı hedefi
 * `selectedDateLogs` içinde arar, bulamayınca null döner. Bunun yerine satır
 * o güne geçirir → mevcut tek onaylı akış devralır.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/production/page.tsx"),
    "utf8",
);

describe("Diğer Günlerin Kayıtları — satır erişimi", () => {
    it("satır tıklanınca o güne geçer", () => {
        expect(SRC).toMatch(/onClick=\{\(\) => setTarih\(kaydi\.tarih\)\}/);
    });

    it("klavyeyle de erişilebilir (tabIndex + Enter/Space + preventDefault)", () => {
        expect(SRC).toMatch(/tabIndex=\{0\}/);
        expect(SRC).toMatch(/if \(e\.key === "Enter" \|\| e\.key === " "\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*setTarih\(kaydi\.tarih\);/);
    });

    it("ekran okuyucu için satırın ne yaptığı yazılı", () => {
        expect(SRC).toMatch(/aria-label=\{`\$\{kaydi\.tarih\} tarihine geç/);
    });

    it("tıklanabilirlik görsel olarak belli (cursor + yönlendirme metni)", () => {
        expect(SRC).toMatch(/Bir kaydı düzeltmek için satıra tıklayın/);
        expect(SRC).toMatch(/cursor: "pointer"/);
    });

    it("silme YALNIZ tek yüzeyde kalır — diğer-gün tablosuna kopyalanmadı", () => {
        // Onay modalı hedefi selectedDateLogs'ta arar; oraya buton eklenirse
        // modal null döner ve silme sessizce çalışmaz.
        expect(SRC).toMatch(/const target = selectedDateLogs\.find\(k => k\.id === confirmDeleteId\)/);
        // Yalnız diğer-gün tablosu bloğu — modal (setConfirmDeleteId kullanır)
        // bu tablodan SONRA geldiği için dilim orada bitmeli.
        // KOBİ-sim O8: liste artık tarihe göre GRUPLU (`digerGunGruplari`),
        // düz `otherDateLogs.map` değil; tek-yüzey kuralı aynen geçerli.
        const start = SRC.indexOf("{digerGunGruplari.map(([gun, kayitlar]) => (");
        const end = SRC.indexOf("</table>", start);
        expect(start).toBeGreaterThan(0);
        expect(end).toBeGreaterThan(start);
        expect(SRC.slice(start, end)).not.toMatch(/setConfirmDeleteId/);
    });
});

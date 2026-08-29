/**
 * KOBİ simülasyonu — Tur 2 (yüksek bulgular) regresyon testleri.
 *
 *   Y1 — iptal edilen istek "kayıt bulunamadı" göstermemeli
 *   Y2 — mükerrer üretim kaydı uyarısı
 *   Y3 — hurda/fire (asıl kök: taşıma katmanı)
 *   Y4 — RFQ teknik şartname notu
 *   Y5 — uyarı tazeliği + mal kabul sonrası taramanın hiç çalışmaması
 *   O1 — ayırt edilebilir silme etiketleri
 *   O6 — üretimi girenin görünürlüğü
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatProductionTime } from "@/app/dashboard/production/page";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");

/**
 * Yorumları soyulmuş kaynak.
 *
 * Bu turun düzeltmeleri, DÜZELTİLEN eski kalıbı yorumda birebir alıntılıyor
 * (niçin yanlış olduğunu anlatmak için). Ham metin üzerinde "bu kalıp artık
 * yok" demek o yorumları yakalayıp yanlış alarm üretiyordu — testin kendisi
 * bir kez bu tuzağa düştü. Kod iddiaları buradan okunur.
 */
const code = (p: string) =>
    src(p)
        .replace(/\/\*[\s\S]*?\*\//g, "")   // blok yorum (JSDoc dahil)
        .replace(/^\s*\/\/.*$/gm, "");        // satır yorumu

// ── Y1 ───────────────────────────────────────────────────────────────────

describe("Y1 — iptal/hata ile 'kayıt yok' karışmamalı", () => {
    it("quotes/[id]: finally KALDIRILDI, AbortError'da state'e dokunulmuyor", () => {
        // Kodda kalmamalı; açıklama yorumu eski kalıbı alıntılıyor.
        expect(code("src/app/dashboard/quotes/[id]/page.tsx"))
            .not.toMatch(/\.finally\(\(\) => setQuoteLoading/);
        const page = src("src/app/dashboard/quotes/[id]/page.tsx");
        expect(page).toContain('if (err?.name === "AbortError") return;');
        expect(page).toContain("setLoadFailed(true)");
    });

    it("orders/[id]: finally kaldırıldı (return'ü yeniyordu)", () => {
        const page = src("src/app/dashboard/orders/[id]/page.tsx");
        expect(page).not.toMatch(/\}\s*finally\s*\{\s*setOrderLoading\(false\);\s*\}/);
        expect(page).toContain("setLoadFailed(true)");
    });

    it("orders/[id]: 404 = yok, diğer HTTP hatası = yüklenemedi", () => {
        const page = src("src/app/dashboard/orders/[id]/page.tsx");
        expect(page).toContain("if (res.status !== 404) setLoadFailed(true)");
    });

    it("iki sayfada da 'yüklenemedi' mesajı 'bulunamadı'dan AYRI", () => {
        for (const p of ["src/app/dashboard/quotes/[id]/page.tsx", "src/app/dashboard/orders/[id]/page.tsx"]) {
            const page = src(p);
            expect(page).toMatch(/yüklenemedi — bağlantıyı kontrol/);
            expect(page).toMatch(/bulunamadı\./);
            expect(page).toContain("Yeniden dene");
        }
    });

    it("settings: aynı sınıftaki iki abort bloğu düzeltildi", () => {
        const page = src("src/app/dashboard/settings/page.tsx");
        expect(page).not.toMatch(/Profil yüklenemedi\."\s*\}\);\s*\}\s*\}\)\s*\.finally/);
        expect(page.match(/if \(err\?\.name === "AbortError"\) return;/g) ?? []).toHaveLength(2);
    });
});

// ── Y2 + O1 ──────────────────────────────────────────────────────────────

describe("Y2 — mükerrer üretim kaydı uyarısı", () => {
    const page = src("src/app/dashboard/production/page.tsx");

    it("kaydetmeden önce aynı ürün/gün kontrolü yapılır", () => {
        expect(page).toContain("selectedDateLogs.some(k => k.productId === l.productId)");
        expect(page).toContain("setDuplicateWarn");
    });

    it("onay penceresi mevcut toplamı ve davranışı söyler", () => {
        expect(page).toContain("Bu ürün için bugün zaten kayıt var");
        expect(page).toMatch(/yeni bir kayıt EKLENİR/);
        expect(page).toContain("Yeni kayıt olarak ekle");
    });

    it("onaysız kayıt yolu yok — handleSave performSave'e delege eder", () => {
        expect(page).toContain("await performSave();");
    });
});

describe("O1 — silme etiketleri ayırt edilebilir", () => {
    const page = src("src/app/dashboard/production/page.tsx");

    it("aria-label artık miktar + saat taşıyor", () => {
        expect(page).not.toMatch(/aria-label=\{`\$\{kaydi\.productName\} üretim kaydını sil`\}/);
        expect(page).toContain("formatProductionTime(kaydi.createdAt)");
        expect(page).toContain("adet`");
    });

    it("onay modalı hangi kayıt olduğunu söyler", () => {
        expect(page).toContain("saat {formatProductionTime(target.createdAt)}");
    });

    it("formatProductionTime saat üretir, bozuk/eksik girdide boş döner", () => {
        expect(formatProductionTime(undefined)).toBe("");
        expect(formatProductionTime("çöp")).toBe("");
        expect(formatProductionTime("2026-08-29T10:23:00Z")).toMatch(/^\d{2}:\d{2}$/);
    });
});

// ── Y3 ───────────────────────────────────────────────────────────────────

describe("Y3 — hurda/fire (asıl kök: taşıma katmanı)", () => {
    it("data-context gövdesi scrap_qty + waste_reason TAŞIR (kök düzeltme)", () => {
        const ctx = src("src/lib/data-context.tsx");
        expect(ctx).toContain("scrap_qty: k.scrap");
        expect(ctx).toContain("waste_reason: k.wasteReason");
    });

    it("form gerçek hurda değerini gönderir (scrap: 0 sabiti kalktı)", () => {
        const page = src("src/app/dashboard/production/page.tsx");
        expect(page).not.toMatch(/scrap:\s*0,/);
        expect(page).toContain("scrap: parseInt(line.hurda) || 0");
        expect(page).toContain("wasteReason: line.hurdaNeden");
    });

    it("formda hurda ve fire nedeni alanları var", () => {
        const page = src("src/app/dashboard/production/page.tsx");
        expect(page).toContain("satır hurda adedi");
        expect(page).toContain("satır fire nedeni");
    });

    it("kayıt listesinde hurda görünür", () => {
        const page = src("src/app/dashboard/production/page.tsx");
        expect(page).toMatch(/<th style=\{\{ \.\.\.thStyle, textAlign: "right" as const \}\}>Hurda<\/th>/);
    });

    it("mapper waste_reason'ı taşır", () => {
        const m = src("src/lib/api-mappers.ts");
        expect(m).toContain("wasteReason: row.waste_reason ?? undefined");
    });
});

// ── O6 ───────────────────────────────────────────────────────────────────

describe("O6 — üretimi giren görünür (denetim izi zaten doğruydu)", () => {
    const page = src("src/app/dashboard/production/page.tsx");

    it("sahte 'Usta' sabiti kaldırıldı", () => {
        expect(page).not.toContain('girenKullanici: "Usta"');
    });

    it("listede Giren kolonu var", () => {
        expect(page).toContain("<th style={thStyle}>Giren</th>");
        expect(page).toContain("kaydi.girenKullanici");
    });

    it("sunucu entered_by'ı oturumdan yazmaya devam ediyor", () => {
        const route = src("src/app/api/production/route.ts");
        expect(route).toContain("entered_by: user?.email ?? user?.id");
    });
});

// ── Y4 ───────────────────────────────────────────────────────────────────

describe("Y4 — RFQ teknik şartname notu", () => {
    it("detay sayfası notu gösterir", () => {
        const page = src("src/app/dashboard/purchase/rfqs/[id]/page.tsx");
        expect(page).toContain("Teknik Şartname / Notlar");
        expect(page).toContain("{rfq.notes}");
    });

    it("tedarikçiye giden belge zaten notu taşıyor (regresyon kilidi)", () => {
        expect(src("src/app/dashboard/purchase/rfqs/components/RfqDocument.tsx"))
            .toContain("data.notes");
        expect(src("src/lib/rfq-archive-html.ts")).toContain("notes: detail.notes");
    });
});

// ── Y5 ───────────────────────────────────────────────────────────────────

describe("Y5 — uyarı tazeliği", () => {
    const svc = src("src/lib/services/alert-service.ts");

    it("aktif stok uyarısının metni okuma anında tazelenir", () => {
        expect(svc).toContain('dbUpdateActiveAlertContent("stock_critical", entityId');
        expect(svc).toContain('dbUpdateActiveAlertContent("stock_risk", entityId');
    });

    it("tazeleme aynı description üreticisini kullanır (tek kaynak)", () => {
        const calls = svc.match(/buildStockAlertDescription\(riskInputs, "(critical|warning)"\)/g) ?? [];
        // 2 create + 2 tazeleme
        expect(calls.length).toBe(4);
    });
});

describe("Y5 ikinci kök — mal kabul sonrası tarama artık gerçekten koşuyor", () => {
    it("kendi sunucusuna göreli-URL HTTP turu KALDIRILDI", () => {
        expect(code("src/lib/services/purchase-order-service.ts"))
            .not.toMatch(/await fetch\(`\$\{process\.env\.NEXT_PUBLIC_APP_URL/);
        expect(src("src/lib/services/purchase-order-service.ts"))
            .toContain("await serviceRunAlertScan()");
    });

    it("koşucu advisory lock semantiğini korur", () => {
        const runner = src("src/lib/services/alert-scan-runner.ts");
        expect(runner).toContain("try_acquire_scan_lock");
        expect(runner).toContain("release_scan_lock");
        expect(runner).toContain("skipped: true");
    });

    it("route aynı koşucuyu kullanır (lock tek yerde)", () => {
        const route = src("src/app/api/alerts/scan/route.ts");
        expect(route).toContain("serviceRunAlertScan(force)");
        expect(route).not.toContain("try_acquire_scan_lock");
    });

    it("repoda başka self-HTTP çağrısı kalmadı", () => {
        expect(code("src/lib/services/purchase-order-service.ts"))
            .not.toMatch(/fetch\([^)]*\/api\/alerts\/scan/);
    });
});

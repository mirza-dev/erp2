/**
 * KOBİ simülasyonu — Tur 4 (düşük + nit) regresyon testleri.
 *
 *   D1 — kaydetme bildirimi tutarsız
 *   D2 — "Formu Düzenle" boş yeni teklif açıyor
 *   D3 — onay metni sonuçla uyuşmuyor
 *   D4 — aktivite geçmişi ham kod + çıplak UUID
 *   D5 — eskime raporunda negatif bekleme günü
 *   Nit — kur şeffaflığı, etiketsiz tarih filtreleri
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { poActionLabel, poActorLabel, PO_ACTION_LABELS } from "@/lib/purchase-order-ui";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");

// ── D1 ───────────────────────────────────────────────────────────────────

describe("D1 — kaydetme bildirimi güvenilir", () => {
    const form = src("src/app/dashboard/quotes/_components/QuoteForm.tsx");

    it("önceki zamanlayıcı iptal edilir (üst üste kayıtta bildirim yutulmasın)", () => {
        expect(form).toContain("if (toastTimerRef.current) clearTimeout(toastTimerRef.current)");
        expect(form).toContain("toastTimerRef.current = setTimeout");
    });

    it("unmount'ta zamanlayıcı temizlenir", () => {
        expect(form).toMatch(/useEffect\(\(\) => \(\) => \{ if \(toastTimerRef\.current\) clearTimeout/);
    });
});

// ── D2 ───────────────────────────────────────────────────────────────────

describe("D2 — önizlemeden forma dönüş doğru teklife gider", () => {
    it("kaydedilmiş teklif varsa /quotes/<id>'ye döner", () => {
        const preview = src("src/app/dashboard/quotes/preview/page.tsx");
        expect(preview).toContain("data?.quoteId ? `/dashboard/quotes/${data.quoteId}` : \"/dashboard/quotes/new\"");
    });

    it("snapshot quoteId taşır (iki yazım yolu da)", () => {
        const form = src("src/app/dashboard/quotes/_components/QuoteForm.tsx");
        expect(form.match(/quoteId,\s+\/\/ D2/g) ?? []).toHaveLength(2);
    });

    it("QuoteData tipi quoteId'yi opsiyonel taşır (eski taslaklar bozulmaz)", () => {
        expect(src("src/app/dashboard/quotes/components/quote-types.ts"))
            .toContain("quoteId?: string | null");
    });
});

// ── D3 ───────────────────────────────────────────────────────────────────

describe("D3 — onay metni sonuçla uyumlu", () => {
    const disp = src("src/app/dashboard/quotes/_utils/quote-display.ts");

    it("kabul metni artık 'taslak' demiyor — ONAYLI sipariş diyor", () => {
        expect(disp).not.toMatch(/kabul edilip taslak sipariş olarak oluşturulacak/);
        expect(disp).toContain("ONAYLI sipariş olarak oluşturulacak");
    });

    it("rezervasyon devri de söyleniyor (088 davranışı)", () => {
        expect(disp).toMatch(/rezerve edilen stok siparişe geçer/);
    });

    it("dönüştür metni de hizalandı", () => {
        expect(disp).not.toMatch(/teklif taslak sipariş olarak oluşturulacak/);
    });
});

// ── D4 ───────────────────────────────────────────────────────────────────

describe("D4 — aktivite geçmişi okunur", () => {
    it("RPC'nin gerçekten yazdığı kod artık haritada (asıl kusur buydu)", () => {
        // receive_po_lines `po_fully_received` yazıyor (051); sayfadaki sözlükte
        // `po_received` vardı → eşleşmeyen kod ham basılıyordu.
        expect(PO_ACTION_LABELS.po_fully_received).toBe("Mal kabul tamamlandı");
        expect(poActionLabel("po_fully_received")).toBe("Mal kabul tamamlandı");
    });

    it("migration'lardaki her po_* eylemi haritada var", () => {
        const migrations = ["051_po_receive_rpc.sql", "052_po_confirm_commitment_seed.sql"];
        const kodlar = new Set<string>();
        for (const m of migrations) {
            const sql = src(join("supabase/migrations", m));
            for (const k of sql.match(/'po_[a-z_]+'/g) ?? []) {
                const ad = k.slice(1, -1);
                if (ad === "po_id" || ad === "po_number") continue;   // kolon adları
                kodlar.add(ad);
            }
        }
        expect(kodlar.size).toBeGreaterThan(0);
        for (const k of kodlar) expect(PO_ACTION_LABELS[k], `eksik etiket: ${k}`).toBeTruthy();
    });

    it("bilinmeyen kod yine de okunur hâle gelir", () => {
        expect(poActionLabel("po_bilinmeyen_sey")).toBe("bilinmeyen sey");
    });

    it("çıplak UUID kullanıcıya gösterilmez", () => {
        expect(poActorLabel("6f1c1b0e-6a2f-4e5a-9c7d-2b3a4c5d6e7f")).toBe("Sistem");
        expect(poActorLabel("system")).toBe("Sistem");
        expect(poActorLabel("mirza@example.com")).toBe("mirza@example.com");
        expect(poActorLabel(null)).toBeNull();
    });

    it("sayfa yerel sözlüğü bırakıp ortak modülü kullanıyor (drift kapandı)", () => {
        const page = src("src/app/dashboard/purchase/orders/[id]/page.tsx");
        expect(page).not.toContain("const ACTION_LABELS");
        expect(page).toContain("poActionLabel(e.action)");
        expect(page).toContain("poActorLabel(e.actor)");
    });
});

// ── D5 ───────────────────────────────────────────────────────────────────

describe("D5 — eskime raporunda negatif bekleme günü yok", () => {
    const route = src("src/app/api/products/aging/route.ts");

    it("taban 0 ile sınırlanır", () => {
        expect(route).toContain("Math.max(\n                        0,");
    });

    it("fark YEREL takvim günü üzerinden (UTC kayması Y6 sınıfı)", () => {
        expect(route).toContain("localISODate");
        expect(route).toContain("const bugunMs = new Date(localISODate(Date.now())).getTime()");
        expect(route).not.toMatch(/const now = Date\.now\(\);/);
    });
});

// ── Nit ──────────────────────────────────────────────────────────────────

describe("Nit — kur şeffaflığı (elenen iddiadan türeyen gerçek bulgu)", () => {
    const page = src("src/app/dashboard/page.tsx");

    it("hangi para birimi ve hangi kur olduğu yazılır", () => {
        expect(page).toContain("rateStamp");
        expect(page).toMatch(/Tutarlar <strong[^>]*>\{reporting\}<\/strong> cinsinden/);
    });

    it("kaynak + tarih künyesi kur verisinden üretilir", () => {
        expect(page).toContain('kaynak === "TCMB" ? "TCMB" : "Live-Rates"');
        expect(page).toContain("1 USD =");
    });

    it("kur çözülmeden künye basılmaz (flash guard korunur)", () => {
        expect(page).toContain("if (!ratesResolved || !rates) return null");
    });
});

describe("Nit — tarih filtrelerinin erişilebilir adı var", () => {
    it("Teklifler listesi", () => {
        const c = src("src/app/dashboard/quotes/QuotesClient.tsx");
        expect(c).toContain('aria-label="Teklif tarihi — başlangıç"');
        expect(c).toContain('aria-label="Teklif tarihi — bitiş"');
    });

    it("Siparişler listesinde de aynı kusur vardı (sim yalnız Teklifler'de gördü)", () => {
        const c = src("src/app/dashboard/orders/OrdersClient.tsx");
        expect(c).toContain('aria-label="Sipariş tarihi — başlangıç"');
        expect(c).toContain('aria-label="Sipariş tarihi — bitiş"');
    });

    it("RFQ geçerlilik tarihi label'ı input'a bağlı", () => {
        const c = src("src/app/dashboard/purchase/rfqs/[id]/page.tsx");
        expect(c).toContain('htmlFor="rfq-valid-until"');
        expect(c).toContain('id="rfq-valid-until"');
    });
});

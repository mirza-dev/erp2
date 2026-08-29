/**
 * KOBİ simülasyonu — Tur 3 (orta bulgular) regresyon testleri.
 *
 *   O2 — teklif adresi formda zorunlu işaretli + Gönder gerekçeli pasif
 *   O3 — seed taahhütleri PO satırına bağlı + yetim tespiti
 *   O4 — bfcache dönüşünde bayat durum
 *   O5 — alternatif tedarikçi (tek-kaynak riski)
 *   O7 — rapor düğmesi etiketi
 *   O8 — hafta/ay üretim toplamı
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { donemBaslangici, donemOzeti } from "@/app/dashboard/production/page";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");

// ── O2 ───────────────────────────────────────────────────────────────────

describe("O2 — gönderim zorunlulukları formda görünür", () => {
    const form = src("src/app/dashboard/quotes/_components/QuoteForm.tsx");

    it("adres alanı zorunlu işaretli ve aria-required taşır", () => {
        expect(form).toContain('const zorunlu = en === "Address"');
        expect(form).toContain("aria-required={zorunlu || undefined}");
        expect(form).toContain("gönderim için zorunlu");
    });

    it("boş adres alanında inline uyarı çıkar", () => {
        expect(form).toContain("Gönderim için zorunlu");
    });

    it("Gönder düğmesi eksik varken pasif ve SEBEBİNİ söyler", () => {
        expect(form).toContain("Müşteri bir cari kaydına bağlanmalı");
        expect(form).toContain("Müşteri adresi girilmeli");
        expect(form).toContain("disabled={saving || sending || engel !== null}");
        expect(form).toMatch(/title=\{engel \? `Gönderilemez/);
    });
});

// ── O3 ───────────────────────────────────────────────────────────────────

describe("O3 — taahhütler PO satırına bağlı", () => {
    const runner = src("src/lib/seed/seed-runner.ts");
    const data   = src("src/lib/seed/seed-data.ts");

    it("seed taahhütleri po_line_id yazar", () => {
        expect(runner).toContain("po_line_id: lineId ?? null");
        expect(runner).toContain("poLineIdByPoSku");
    });

    it("insert PO'lardan SONRA koşar (satırlar önce var olmalı)", () => {
        // Dosyanın başındaki `clearAllData` tablo listesi de "purchase_commitments"
        // içeriyor — hedef INSERT çağrısının kendisi.
        expect(runner.indexOf("poLineIdByPoSku.set"))
            .toBeLessThan(runner.indexOf('from("purchase_commitments").insert'));
    });

    it("bağlanamayan açık taahhüt seed'i PATLATIR (sessiz yetim yok)", () => {
        expect(runner).toContain('c.status !== "cancelled"');
        expect(runner).toMatch(/taahhüt PO satırına bağlanamadı/);
    });

    it("her açık taahhüdün poNumber'ı var; yalnız iptal edilen PO'suz", () => {
        const acikOlanlar = data.match(/\{ sku: "[^"]+", poNumber: [^,]+, qty: \d+[^}]*status: "(pending|received)"/g) ?? [];
        expect(acikOlanlar.length).toBeGreaterThan(0);
        for (const satir of acikOlanlar) expect(satir).not.toContain("poNumber: null");
        expect(data).toMatch(/poNumber: null[^}]*status: "cancelled"/);
    });

    it("find-test-data yetim taahhüdü raporlar", () => {
        const script = src("scripts/find-test-data.ts");
        expect(script).toContain("YETİM TAAHHÜTLER");
        expect(script).toContain('c.status === "pending" && !c.po_line_id');
    });
});

// ── O4 ───────────────────────────────────────────────────────────────────

describe("O4 — geri dönüşte (bfcache) bayat durum tazelenir", () => {
    for (const p of ["src/app/dashboard/quotes/[id]/page.tsx", "src/app/dashboard/orders/[id]/page.tsx"]) {
        it(`${p.split("/").at(-2)}: pageshow + visibilitychange dinlenir`, () => {
            const page = src(p);
            expect(page).toContain('window.addEventListener("pageshow", onPageShow)');
            expect(page).toContain("if (e.persisted) yenile()");
            expect(page).toContain('document.addEventListener("visibilitychange", onVisible)');
        });
    }
});

// ── O5 ───────────────────────────────────────────────────────────────────

describe("O5 — alternatif tedarikçi (tek-kaynak riski)", () => {
    const route = src("src/app/api/product-vendor-links/route.ts");
    const panel = src("src/components/products/ProductVendorsPanel.tsx");

    it("yazma ucu eklendi (eskiden yalnız GET vardı)", () => {
        expect(route).toContain("export async function POST");
        expect(route).toContain("dbUpsertProductVendorLink");
    });

    it("ürün ana verisi değiştiği için manage_product_master ister", () => {
        expect(route).toContain('requirePermissionFor(ctx, "manage_product_master")');
    });

    it("actor sunucu-otoriter", () => {
        expect(route).toContain("actor:          await getCurrentUserId()");
        expect(route).not.toContain("body.actor");
    });

    it("geçersiz UUID / negatif sayı reddedilir", () => {
        expect(route).toContain("UUID_RE.test(productId)");
        expect(route).toContain("UUID_RE.test(vendorId)");
        expect(route).toContain("Number.isInteger(n) || n < 0");
    });

    it("panel tek tedarikçide riski görünür kılar", () => {
        expect(panel).toContain("Tek tedarikçi — bu ürün tek kaynağa bağlı");
        expect(panel).toContain("tek-kaynak riski değerlendirilemiyor");
    });

    it("panel ürün detayının Tedarik sekmesine bağlı", () => {
        const page = src("src/app/dashboard/products/[id]/page.tsx");
        expect(page).toContain("<ProductVendorsPanel productId={product.id}");
    });

    it("tercihli işaretlenince ürünün preferred_vendor_id'si de yazılır", () => {
        // Kolon DB'de vardı, okunuyordu, ama hiçbir UI yolu yazmıyordu.
        expect(src("src/lib/supabase/product-vendor-links.ts"))
            .toContain("preferred_vendor_id: input.vendor_id");
        expect(panel).toContain("is_preferred: preferred");
    });
});

// ── O7 ───────────────────────────────────────────────────────────────────

describe("O7 — rapor düğmesi yaptığı işi söylüyor", () => {
    const page = src("src/app/dashboard/page.tsx");
    it("etiket 'indir' değil 'yazdır / PDF'", () => {
        expect(page).toContain("Raporu yazdır / PDF");
        expect(page).not.toMatch(/>\s*Rapor indir\s*</);
    });
    it("davranış değişmedi (window.print)", () => {
        expect(page).toContain("onClick={() => window.print()}");
    });
});

// ── O8 ───────────────────────────────────────────────────────────────────

describe("O8 — hafta/ay üretim toplamı", () => {
    const KAYITLAR = [
        { tarih: "2026-08-24", adet: 10, scrap: 0 },  // Pazartesi
        { tarih: "2026-08-26", adet: 20, scrap: 2 },  // Çarşamba
        { tarih: "2026-08-29", adet: 5,  scrap: 1 },  // Cumartesi
        { tarih: "2026-08-20", adet: 99, scrap: 9 },  // önceki hafta
        { tarih: "2026-07-15", adet: 50, scrap: 0 },  // önceki ay
    ];

    it("hafta PAZARTESİ başlar (TR iş haftası)", () => {
        expect(donemBaslangici("2026-08-29", "hafta")).toBe("2026-08-24"); // Cumartesi → Pzt
        expect(donemBaslangici("2026-08-24", "hafta")).toBe("2026-08-24"); // Pazartesi → kendisi
    });

    it("ay ayın 1'inde başlar", () => {
        expect(donemBaslangici("2026-08-29", "ay")).toBe("2026-08-01");
    });

    it("haftalık toplam yalnız o haftayı sayar", () => {
        const o = donemOzeti(KAYITLAR, donemBaslangici("2026-08-29", "hafta"), "2026-08-29");
        expect(o.adet).toBe(35);
        expect(o.hurda).toBe(3);
        expect(o.kalem).toBe(3);
    });

    it("aylık toplam önceki ayı dışlar", () => {
        const o = donemOzeti(KAYITLAR, donemBaslangici("2026-08-29", "ay"), "2026-08-29");
        expect(o.adet).toBe(134);   // 10+20+5+99
        expect(o.kalem).toBe(4);
    });

    it("gelecekteki kayıt sayılmaz (bitiş dahil)", () => {
        const o = donemOzeti(
            [{ tarih: "2026-08-30", adet: 7, scrap: 0 }],
            "2026-08-24", "2026-08-29",
        );
        expect(o.adet).toBe(0);
    });

    it("ekranda hafta/ay kartları var", () => {
        const page = src("src/app/dashboard/production/page.tsx");
        expect(page).toContain('["Bu hafta", haftaOzet]');
        expect(page).toContain('["Bu ay", ayOzet]');
        expect(page).toContain("fire");
    });

    it("diğer günler tarihe göre gruplanır + gün toplamı gösterir", () => {
        const page = src("src/app/dashboard/production/page.tsx");
        expect(page).toContain("digerGunGruplari");
        expect(page).toMatch(/kayitlar\.reduce\(\(t, k\) => t \+ k\.adet, 0\)/);
    });
});

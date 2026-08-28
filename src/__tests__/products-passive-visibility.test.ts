/**
 * A4 (2026-08-24) — Pasif (soft-delete edilmiş) ürünlere erişim.
 *
 * Ürünlerde "Sil" SOFT DELETE'tir (`dbDeleteProduct` → is_active=false), ama
 * liste `is_active=true` varsayılanıyla sorguluyordu ve sayfada bunu değiştiren
 * hiçbir kontrol yoktu. Sonuç: canlıda 42 üründen 22'si UI'dan TAMAMEN
 * erişilemez durumdaydı — yanlışlıkla silinen ürün ne görülebiliyor ne geri
 * alınabiliyordu, SKU unique olduğu için yeniden de yaratılamıyordu.
 *
 * Cariler'de "Pasif" sekmesi, Tedarikçiler'de "Pasifleri göster" vardı;
 * Ürünler'de hiçbiri yoktu (asimetri).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const API_SRC = readFileSync(join(root, "src/app/api/products/route.ts"), "utf8");
const PAGE_SRC = readFileSync(join(root, "src/app/dashboard/products/page.tsx"), "utf8");
const DB_SRC = readFileSync(join(root, "src/lib/supabase/products.ts"), "utf8");

describe("silme gerçekten soft-delete (bulgunun ön kabulü)", () => {
    it("dbDeleteProduct satırı silmez, is_active=false yapar", () => {
        expect(DB_SRC).toMatch(/export async function dbDeleteProduct[\s\S]{0,300}update\(\{ is_active: false \}\)/);
    });
});

describe("/api/products is_active — üç durum", () => {
    it("'all' → undefined (aktif + pasif birlikte)", () => {
        expect(API_SRC).toMatch(/isActiveRaw === "all" \? undefined : isActiveRaw !== "false"/);
    });

    it("varsayılan (parametre yok) hâlâ YALNIZ aktif — eski davranış korundu", () => {
        // isActiveRaw null → "all" değil, "false" değil → true
        const parse = (raw: string | null) => (raw === "all" ? undefined : raw !== "false");
        expect(parse(null)).toBe(true);
        expect(parse("true")).toBe(true);
        expect(parse("false")).toBe(false);
        expect(parse("all")).toBeUndefined();
    });

    it("cache imzaları undefined'ı taşıyabiliyor (aksi halde tip hatası)", () => {
        expect(API_SRC).toMatch(/isActive: boolean \| undefined/);
    });
});

describe("ürünler sayfası — pasif görünürlüğü", () => {
    it("'Pasifleri göster' kontrolü var (Tedarikçiler kalıbı)", () => {
        expect(PAGE_SRC).toContain("Pasifleri göster");
        expect(PAGE_SRC).toMatch(/checked=\{showPassive\}/);
    });

    it("işaretlenince sorguya is_active=all gider", () => {
        expect(PAGE_SRC).toMatch(/if \(showPassive\) params\.set\("is_active", "all"\)/);
    });

    it("showPassive sorgu bağımlılıklarında (bayat liste kalmaz)", () => {
        expect(PAGE_SRC).toMatch(/filterCommercial, signalIds, showPassive\]/);
    });

    it("filtre değişince ilk sayfaya döner (bayat sayfa no yok)", () => {
        expect(PAGE_SRC).toMatch(/setShowPassive\(e\.target\.checked\); setCurrentPage\(1\)/);
    });

    it("pasif satır görsel olarak ayrışır (soluk + rozet)", () => {
        expect(PAGE_SRC).toMatch(/rowStyle=\{product => \(product\.isActive \? \{\} : \{ opacity: 0\.55 \}\)\}/);
        expect(PAGE_SRC).toMatch(/\{!product\.isActive && \([\s\S]{0,320}Pasif</);
    });
});

describe("geri yükleme", () => {
    it("pasif üründe 'Sil' yerine 'Geri Yükle' sunulur", () => {
        expect(PAGE_SRC).toMatch(/!product\.isActive \? \([\s\S]{0,600}Geri Yükle/);
    });

    it("geri yükleme PATCH is_active=true ile (silmenin tersi, veri kaybı yok)", () => {
        expect(PAGE_SRC).toMatch(/method: "PATCH"[\s\S]{0,160}JSON\.stringify\(\{ is_active: true \}\)/);
    });

    it("yetki + demo guard'ları korunur", () => {
        expect(PAGE_SRC).toMatch(/has\("manage_product_master"\) && !product\.isActive/);
        expect(PAGE_SRC).toMatch(/const handleRestore = async \(id: string\) => \{\s*\n\s*if \(isDemo\)/);
    });

    it("geri yükleme sonrası liste VE sayaçlar tazelenir", () => {
        expect(PAGE_SRC).toMatch(/handleRestore[\s\S]{0,700}await Promise\.all\(\[fetchList\(\), refetchCounts\(\)\]\)/);
    });
});

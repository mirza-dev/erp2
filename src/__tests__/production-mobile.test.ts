/**
 * Üretim Girişi — sahada telefondan kullanılabilirlik (2026-08-24).
 *
 * Bu, fabrika operatörünün telefonla kullanacağı TEK ekran; üç tablosu da sabit
 * genişlikteydi (600px / 480px / 460px) → dar ekranda yatay kaydırma zorunluydu.
 * Kozmetik değil işlevsel bir engeldi: operatör üretim kaydını rahat giremiyordu.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const SRC = readFileSync(join(root, "src/app/dashboard/production/page.tsx"), "utf8");
const HOOK = readFileSync(join(root, "src/hooks/useIsMobile.ts"), "utf8");

describe("ortak useIsMobile hook'u", () => {
    it("SSR-güvenli: window yoksa masaüstü varsayılanı", () => {
        expect(HOOK).toMatch(/typeof window !== "undefined" \? window\.innerWidth : SSR_FALLBACK_WIDTH/);
    });

    it("768px eşiği tek yerde tanımlı", () => {
        expect(HOOK).toMatch(/export const MOBILE_BREAKPOINT = 768;/);
    });

    it("resize dinleyicisi temizlenir (sızıntı yok)", () => {
        expect(HOOK).toMatch(/return \(\) => window\.removeEventListener\("resize", handleResize\)/);
    });

    it("üretim sayfası kendi kopyasını yazmaz, hook'u kullanır", () => {
        expect(SRC).toContain('from "@/hooks/useIsMobile"');
        expect(SRC).toMatch(/const isMobile = useIsMobile\(\);/);
        expect(SRC).not.toMatch(/setWindowWidth/);
    });
});

describe("dar ekran davranışı", () => {
    it("üç tablonun da sabit genişliği YALNIZ geniş ekranda uygulanır", () => {
        for (const w of ["600px", "480px", "460px"]) {
            expect(SRC).toContain(`...(isMobile ? {} : { minWidth: "${w}" })`);
        }
        // Koşulsuz minWidth geri gelmesin (yatay kaydırma dönerdi).
        expect(SRC).not.toMatch(/borderCollapse: "collapse", minWidth: "(600|480|460)px"/);
    });

    it("giriş kalemleri dar ekranda kart listesi olur", () => {
        expect(SRC).toMatch(/\{isMobile \? \([\s\S]{0,1200}\. kalem/);
    });

    it("adet alanı telefonda sayı klavyesi açar", () => {
        expect(SRC).toMatch(/inputMode="numeric"/);
    });

    it("kart görünümünde de erişilebilir adlar korunur", () => {
        // Aynı aria-label kalıpları hem tabloda hem kartta olmalı.
        for (const label of ["satır ürün", "satır adet", "satır not", "satırı kaldır"]) {
            const hits = SRC.match(new RegExp(`aria-label=\\{\`\\$\\{idx \\+ 1\\}\\. ${label}\``, "g")) ?? [];
            expect(hits.length, label).toBeGreaterThanOrEqual(2);
        }
    });

    it("sesli giriş ipuçları kart görünümünde de var", () => {
        const hints = SRC.match(/Sesli giriş düşük güvenle eşleşti/g) ?? [];
        expect(hints.length).toBeGreaterThanOrEqual(2);
    });
});

describe("gizlenen kolonların bilgisi kaybolmaz", () => {
    it("SKU dar ekranda ürün adının altına iner", () => {
        expect(SRC).toMatch(/\{!isMobile && <th style=\{thStyle\}>SKU<\/th>\}/);
        expect(SRC).toMatch(/\{isMobile && \([\s\S]{0,260}kaydi\.productSku/);
    });

    it("not da dar ekranda satır altına taşınır (kaybolmaz)", () => {
        // KOBİ-sim Y3/O1/O6: alt satır artık saat ve hurdayı da taşıyor
        // (aynı ürünün iki kaydını ayırt etmek + fireyi görünür kılmak için),
        // bu yüzden sabit dizgi yerine parça-parça doğrulanıyor.
        expect(SRC).toMatch(/kaydi\.notlar,\s*\]\.filter\(Boolean\)\.join\(" · "\)/);
    });

    it("dar ekranda saat ve hurda da alt satıra iner", () => {
        expect(SRC).toMatch(/formatProductionTime\(kaydi\.createdAt\),/);
        expect(SRC).toMatch(/hurda \$\{formatNumber\(kaydi\.scrap\)\}/);
    });

    it("geçmiş gün satırının tıklanabilirliği korunur (A2 kazanımı)", () => {
        expect(SRC).toMatch(/onClick=\{\(\) => setTarih\(kaydi\.tarih\)\}/);
        expect(SRC).toMatch(/tabIndex=\{0\}/);
    });
});

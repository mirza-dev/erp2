// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RovenLogo } from "@/components/layout/RovenLogo";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("RovenLogo", () => {
    it("varsayılan: hexagon mark (svg + polygon) + 'Roven' wordmark render eder", () => {
        const html = renderToStaticMarkup(<RovenLogo />);
        expect(html).toContain("<svg");
        expect(html).toContain("<polygon");
        expect(html).toContain("currentColor");
        expect(html).toMatch(/>Roven</);
    });

    it("tema-uyumlu: sabit hex renk YOK, currentColor/inherit kullanılır", () => {
        const html = renderToStaticMarkup(<RovenLogo />);
        // mark + wordmark currentColor; sarmal inherit → parent var(--text-primary) miras alınır
        expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
    });

    it("varsayılan: svg dekoratif (aria-hidden), erişilebilir ad görünür wordmark'tan gelir", () => {
        const html = renderToStaticMarkup(<RovenLogo />);
        expect(html).toContain('aria-hidden="true"');
        expect(html).not.toContain('aria-label="Roven"');
    });

    it("showWordmark=false: yalnız mark, svg role=img + aria-label=Roven, görünür metin yok", () => {
        const html = renderToStaticMarkup(<RovenLogo showWordmark={false} />);
        expect(html).toContain('role="img"');
        expect(html).toContain('aria-label="Roven"');
        expect(html).not.toMatch(/>Roven</);
    });

    it("size prop svg boyutunu ayarlar", () => {
        const html = renderToStaticMarkup(<RovenLogo size={30} />);
        expect(html).toContain('width="30"');
        expect(html).toContain('height="30"');
    });

    it("wordmarkSize verilince fontSize uygulanır", () => {
        const html = renderToStaticMarkup(<RovenLogo wordmarkSize={15} />);
        expect(html).toMatch(/font-size:\s*15px/);
    });
});

describe("RovenLogo entegrasyon (source-regression)", () => {
    it("Topbar RovenLogo kullanır, düz 'Roven' metin düğümü kalmadı", () => {
        const src = read("src/components/layout/Topbar.tsx");
        expect(src).toContain("RovenLogo");
        expect(src).not.toMatch(/>\s*Roven\s*</);
    });

    it("landing page RovenLogo kullanır, düz 'Roven' metin düğümü kalmadı", () => {
        const src = read("src/app/page.tsx");
        expect(src).toContain("RovenLogo");
        expect(src).not.toMatch(/>\s*Roven\s*</);
    });

    it("login page RovenLogo kullanır, düz 'Roven' metin düğümü kalmadı", () => {
        const src = read("src/app/login/page.tsx");
        expect(src).toContain("RovenLogo");
        expect(src).not.toMatch(/>\s*Roven\s*</);
    });

    it("app/icon.svg favicon mevcut (hexagon mark)", () => {
        const svg = read("src/app/icon.svg");
        expect(svg).toContain("<polygon");
        expect(svg).toContain("<svg");
    });
});

/**
 * Akış Altıgeni (kullanıcı kararı 2026-09-16) — işaret DÖRT yerde yaşar ve
 * bileşen import edemeyen ikisi geometriyi kopyalamak zorunda:
 *   · RovenLogo.tsx (React, currentColor)
 *   · src/app/icon.svg (favicon; React yok)
 *   · scripts/brand-mark.ts (raster: PWA ikonları + OG görseli; React yok)
 *   · src/app/global-error.tsx (kök hata sınırı uygulama bileşeni import EDEMEZ)
 * Sayılar birinde değişip diğerlerinde kalırsa favicon ile launcher ikonu
 * farklı işaret gösterir — 2026-09-16'ya kadar tam olarak bu durumdaydı
 * (ikon scripti bileşenden ~%3 büyük kendi altıgenini taşıyordu). Bu blok
 * dördünü birbirine kilitler; iddia yorumda değil ölçümde yaşar.
 */
describe("RovenLogo — Akış Altıgeni geometrisi dört kaynakta birebir", () => {
    const POINTS = "12,2.8 19.97,7.4 19.97,16.6 12,21.2 4.03,16.6 4.03,7.4";
    const CHANNEL = "M1.5 9.6 H10.2 L13.8 14.4 H22.5";
    const SOURCES = [
        "src/components/layout/RovenLogo.tsx",
        "src/app/icon.svg",
        "scripts/brand-mark.ts",
        "src/app/global-error.tsx",
    ];

    it("altıgen köşeleri ve kanal yolu dört dosyada aynı dize", () => {
        for (const rel of SOURCES) {
            const src = read(rel);
            expect(src, `${rel}: altıgen köşeleri`).toContain(POINTS);
            expect(src, `${rel}: akış kanalı`).toContain(CHANNEL);
        }
    });

    it("kanal NEGATİF alan: mask beyaz zemin + siyah yol, altıgen mask'a bağlı", () => {
        for (const rel of SOURCES) {
            const src = read(rel);
            expect(src, `${rel}: mask`).toMatch(/<mask\b/);
            expect(src, `${rel}: mask zemini`).toMatch(/fill=["']?white/);
            expect(src, `${rel}: kanal rengi`).toMatch(/stroke=["']?black/);
            expect(src, `${rel}: polygon mask'a bağlı`).toMatch(/mask=["{]?`?url\(#/);
        }
    });

    it("render: mask + kanal path çıktıda var, mask id url ile eşleşiyor, tek renk kuralı korunur", () => {
        const html = renderToStaticMarkup(<RovenLogo />);
        expect(html).toContain("<mask");
        expect(html).toContain(`d="${CHANNEL}"`);
        const id = html.match(/<mask id="([^"]+)"/)?.[1];
        expect(id).toBeTruthy();
        expect(html).toContain(`mask="url(#${id})"`);
        // useId ayraçları temizlenmiş olmalı — url(#…) parçası yalnız güvenli karakter taşır.
        expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
        // Mask'ın white/black'i luminance'tır, tema rengi değil; sabit HEX yine YOK.
        expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
    });

    it("aynı sayfada iki logo → iki FARKLI mask id (ilk tanım ikinciyi ezmesin)", () => {
        const html = renderToStaticMarkup(
            <>
                <RovenLogo />
                <RovenLogo size={16} />
            </>,
        );
        const ids = [...html.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1]);
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
    });

    it("PWA ikon scripti kendi altıgenini taşımaz — tek kaynağa bağlı", () => {
        const src = read("scripts/build-pwa-icons.ts");
        expect(src).toMatch(/from "\.\/brand-mark"/);
        expect(src).toContain("markSvgInner(");
        expect(src).not.toMatch(/const HEX\s*=/);
    });
});

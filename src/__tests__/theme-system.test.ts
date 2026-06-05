/**
 * Tema sistemi — koyu + aydınlık (Cool slate).
 *
 * Kullanıcı kararları:
 *   - İlk açılış: sistem tercihini izle (prefers-color-scheme); elle seçim hatırlanır.
 *   - Geçiş: Topbar'da küçük ikon (güneş/ay), avatar öncesi.
 *   - Kayıt: yalnız localStorage (FOUC-suz, backend yok).
 *   - Aydınlık palet: Cool slate (#f6f8fa zemin / #1f2328 metin / #0969da accent).
 *
 * "Sıfır frontend bozulması": baskı/marka belgeleri (QuoteDocument, PurchaseOrderDocument)
 * tema-MUAF — sabit hex'leri korumalı (yanlışlıkla tokenize edilirse regression yakalanır).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const LAYOUT_SRC = read("src/app/layout.tsx");
const GLOBALS_SRC = read("src/app/globals.css");
const THEME_SRC = read("src/lib/theme/use-theme.tsx");
const TOGGLE_SRC = read("src/components/layout/ThemeToggle.tsx");
const TOPBAR_SRC = read("src/components/layout/Topbar.tsx");
const DASH_LAYOUT_SRC = read("src/app/dashboard/layout.tsx");
const QUOTE_DOC_SRC = read("src/app/dashboard/quotes/components/QuoteDocument.tsx");
const PO_DOC_SRC = read("src/components/purchase/PurchaseOrderDocument.tsx");

// ── 1. FOUC-suz bootstrap ───────────────────────────────────

describe("Tema — FOUC-suz bootstrap (layout.tsx)", () => {
    it("boyamadan önce data-theme'i ayarlayan inline script içerir", () => {
        expect(LAYOUT_SRC).toMatch(/dangerouslySetInnerHTML/);
        expect(LAYOUT_SRC).toMatch(/localStorage\.getItem\('theme'\)/);
        expect(LAYOUT_SRC).toMatch(/prefers-color-scheme: dark/);
        expect(LAYOUT_SRC).toMatch(/setAttribute\('data-theme'/);
    });

    it("hata durumunda koyu temaya düşer (mevcut varsayılan korunur)", () => {
        expect(LAYOUT_SRC).toMatch(/catch[\s\S]*setAttribute\('data-theme','dark'\)/);
    });
});

// ── 2. Palet tokenları (globals.css) ────────────────────────

describe("Tema — palet blokları (globals.css)", () => {
    it("koyu (varsayılan) ve aydınlık tema blokları tanımlı", () => {
        expect(GLOBALS_SRC).toMatch(/:root\[data-theme="dark"\]/);
        expect(GLOBALS_SRC).toMatch(/:root\[data-theme="light"\]/);
    });

    it("koyu palet mevcut değerleri birebir korur (sıfır değişiklik)", () => {
        expect(GLOBALS_SRC).toMatch(/--bg-primary:\s*#1a1d23/);
        expect(GLOBALS_SRC).toMatch(/--text-primary:\s*#e6edf3/);
        expect(GLOBALS_SRC).toMatch(/--accent:\s*#58a6ff/);
    });

    it("aydınlık palet Cool slate anahtar değerlerini taşır", () => {
        expect(GLOBALS_SRC).toMatch(/--bg-secondary:\s*#f6f8fa/);
        expect(GLOBALS_SRC).toMatch(/--text-primary:\s*#1f2328/);
        expect(GLOBALS_SRC).toMatch(/--accent:\s*#0969da/);
    });

    it("color-scheme her iki temada native uyum için ayarlı", () => {
        expect(GLOBALS_SRC).toMatch(/color-scheme:\s*dark/);
        expect(GLOBALS_SRC).toMatch(/color-scheme:\s*light/);
    });

    it("yeni tema-bilir tokenlar tanımlı (highlight-inset + -bg-strong + accent-glow)", () => {
        expect(GLOBALS_SRC).toMatch(/--highlight-inset:/);
        expect(GLOBALS_SRC).toMatch(/--accent-bg-strong:/);
        expect(GLOBALS_SRC).toMatch(/--success-bg-strong:/);
        expect(GLOBALS_SRC).toMatch(/--danger-bg-strong:/);
        expect(GLOBALS_SRC).toMatch(/--accent-glow:/);
    });

    it("reduced-motion global guard'ı var", () => {
        expect(GLOBALS_SRC).toMatch(/prefers-reduced-motion: reduce/);
    });
});

// ── 3. useTheme mantığı (source-regex) ──────────────────────

describe("Tema — useTheme provider mantığı", () => {
    it("üç seçim + türetilmiş resolved tipini taşır", () => {
        expect(THEME_SRC).toMatch(/ThemeChoice\s*=\s*"system"\s*\|\s*"dark"\s*\|\s*"light"/);
        expect(THEME_SRC).toMatch(/ResolvedTheme\s*=\s*"dark"\s*\|\s*"light"/);
    });

    it("localStorage'a tercihi yazar (persist)", () => {
        expect(THEME_SRC).toMatch(/localStorage\.setItem\(STORAGE_KEY/);
    });

    it("ilk resolved'ı DOM'dan okur (re-flash önler), default'tan değil", () => {
        expect(THEME_SRC).toMatch(/getAttribute\("data-theme"\)/);
    });

    it("theme==='system' iken matchMedia change dinler", () => {
        expect(THEME_SRC).toMatch(/addEventListener\("change"/);
        expect(THEME_SRC).toMatch(/removeEventListener\("change"/);
    });

    it("toggle resolved'ın karşıtını seçer", () => {
        expect(THEME_SRC).toMatch(/resolved === "dark" \? "light" : "dark"/);
    });
});

// ── 4. ThemeToggle + Topbar entegrasyonu ────────────────────

describe("Tema — ThemeToggle UI", () => {
    it("güneş/ay ikonu + erişilebilir ad taşır", () => {
        expect(TOGGLE_SRC).toMatch(/import \{ Moon, Sun \}/);
        expect(TOGGLE_SRC).toMatch(/aria-label="Temayı değiştir"/);
    });

    it("uzun-bas ile 'system'e döner (Q1↔Q2 geri dönüş kancası)", () => {
        expect(TOGGLE_SRC).toMatch(/setTheme\("system"\)/);
        expect(TOGGLE_SRC).toMatch(/onPointerDown/);
    });

    it("Topbar'da ThemeToggle avatar öncesi render edilir", () => {
        expect(TOPBAR_SRC).toMatch(/import ThemeToggle/);
        expect(TOPBAR_SRC).toMatch(/<ThemeToggle \/>[\s\S]*<UserAvatarLink \/>/);
    });

    it("ThemeProvider dashboard kabuğunda en dış provider olarak mount", () => {
        expect(DASH_LAYOUT_SRC).toMatch(/import \{ ThemeProvider \}/);
        expect(DASH_LAYOUT_SRC).toMatch(/<ThemeProvider>[\s\S]*<DataProvider>/);
    });
});

// ── 5. Baskı belgeleri TEMA-MUAF (regression) ───────────────

describe("Tema — baskı/marka belgeleri tema-muaf (sabit hex korunur)", () => {
    it("QuoteDocument sabit hex renklerini korur (tokenize EDİLMEMELİ)", () => {
        // Marka mavisi + kağıt renkleri tema değişkenine bağlanmamalı.
        expect(QUOTE_DOC_SRC).toMatch(/#[0-9a-fA-F]{6}/);
        expect(QUOTE_DOC_SRC).toMatch(/TEMA-MUAF/);
    });

    it("PurchaseOrderDocument sabit hex renklerini korur (tokenize EDİLMEMELİ)", () => {
        expect(PO_DOC_SRC).toMatch(/#[0-9a-fA-F]{6}/);
        expect(PO_DOC_SRC).toMatch(/TEMA-MUAF/);
    });
});

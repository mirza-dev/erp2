/**
 * Tema sistemi — koyu + aydınlık (premium cool slate).
 *
 * Kullanıcı kararları:
 *   - İlk açılış: sistem tercihini izle (prefers-color-scheme); elle seçim hatırlanır.
 *   - Geçiş: Topbar'da küçük ikon (güneş/ay), avatar öncesi.
 *   - Kayıt: yalnız localStorage (FOUC-suz, backend yok).
 *   - Aydınlık palet: premium cool slate (#eef3f8 zemin / #1f2937 metin / #1f6fd1 steel-blue accent).
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
const LOGIN_SRC = read("src/app/login/page.tsx");
const TOPBAR_SRC = read("src/components/layout/Topbar.tsx");
const SIDEBAR_SRC = read("src/components/layout/Sidebar.tsx");
const BUTTON_SRC = read("src/components/ui/Button.tsx");
const DASH_LAYOUT_SRC = read("src/app/dashboard/layout.tsx");
const PRODUCTS_SRC = read("src/app/dashboard/products/page.tsx");
const ORDERS_SRC = read("src/app/dashboard/orders/OrdersClient.tsx");
const STOCK_GRID_SRC = read("src/components/dashboard/StockDataGrid.tsx");
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

    it("koyu palet mevcut ana karakterini korur", () => {
        expect(GLOBALS_SRC).toMatch(/--bg-primary:\s*#1a1d23/);
        expect(GLOBALS_SRC).toMatch(/--text-primary:\s*#e6edf3/);
        expect(GLOBALS_SRC).toMatch(/--accent:\s*#58a6ff/);
    });

    it("koyu tema okunurluk için destek metin ve sınır kontrastını artırır", () => {
        expect(GLOBALS_SRC).toMatch(/--text-secondary:\s*#aeb7c4/);
        expect(GLOBALS_SRC).toMatch(/--text-tertiary:\s*#7a8493/);
        expect(GLOBALS_SRC).toMatch(/--surface-border:\s*#444d58/);
        expect(GLOBALS_SRC).toMatch(/--shell-border:\s*#39424d/);
    });

    it("aydınlık palet premium cool slate anahtar değerlerini taşır", () => {
        expect(GLOBALS_SRC).toMatch(/--bg-secondary:\s*#eef3f8/);
        expect(GLOBALS_SRC).toMatch(/--text-primary:\s*#1f2937/);
        expect(GLOBALS_SRC).toMatch(/--accent:\s*#1f6fd1/);
    });

    it("aydınlık tema okunurluk için destek metin ve sınır kontrastını artırır", () => {
        expect(GLOBALS_SRC).toMatch(/--text-secondary:\s*#4b5a68/);
        expect(GLOBALS_SRC).toMatch(/--text-tertiary:\s*#6f7b88/);
        expect(GLOBALS_SRC).toMatch(/--surface-border:\s*#ccd9e6/);
        expect(GLOBALS_SRC).toMatch(/--input-border:\s*#bdcddd/);
    });

    it("color-scheme her iki temada native uyum için ayarlı", () => {
        expect(GLOBALS_SRC).toMatch(/color-scheme:\s*dark/);
        expect(GLOBALS_SRC).toMatch(/color-scheme:\s*light/);
    });

    it("tema-bilir tokenlar tanımlı (highlight-inset + -bg-strong + accent-glow)", () => {
        expect(GLOBALS_SRC).toMatch(/--highlight-inset:/);
        expect(GLOBALS_SRC).toMatch(/--accent-bg-strong:/);
        expect(GLOBALS_SRC).toMatch(/--success-bg-strong:/);
        expect(GLOBALS_SRC).toMatch(/--danger-bg-strong:/);
        expect(GLOBALS_SRC).toMatch(/--accent-glow:/);
    });

    it("iki tema için ortak okunurluk tokenları tanımlı", () => {
        expect(GLOBALS_SRC).toMatch(/--line-width:\s*1px/);
        expect(GLOBALS_SRC).toMatch(/--font-body-weight:\s*450/);
        expect(GLOBALS_SRC).toMatch(/--font-ui-weight:\s*500/);
        expect(GLOBALS_SRC).toMatch(/--font-table-cell-weight:\s*500/);
        expect(GLOBALS_SRC).toMatch(/--font-table-heading-weight:\s*650/);
        expect(GLOBALS_SRC).toMatch(/font-weight:\s*var\(--font-body-weight\)/);
    });

    it("light tema premium shell/surface materyal tokenlarını taşır", () => {
        expect(GLOBALS_SRC).toMatch(/--app-bg:\s*#eef3f8/);
        expect(GLOBALS_SRC).toMatch(/--shell-bg:\s*#f8fbff/);
        expect(GLOBALS_SRC).toMatch(/--surface-raised:\s*#ffffff/);
        expect(GLOBALS_SRC).toMatch(/--surface-shadow:/);
        expect(GLOBALS_SRC).toMatch(/--table-header-bg:\s*#f4f7fb/);
        expect(GLOBALS_SRC).toMatch(/--input-bg:\s*#fbfdff/);
        expect(GLOBALS_SRC).toMatch(/--nav-active-bg:/);
    });

    it("dark'a ait sabit settings yüzey rgba'ları globals'ta kalmaz", () => {
        expect(GLOBALS_SRC).not.toContain("rgba(26, 29, 35");
        expect(GLOBALS_SRC).not.toContain("rgba(34, 37, 44");
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

    it("hydrate sonrası bootstrap attribute'ü düşerse resolved'ı DOM'a tekrar yazar", () => {
        expect(THEME_SRC).toMatch(/useEffect\(\(\) => \{[\s\S]*applyDom\(resolved\);[\s\S]*\}, \[resolved\]\)/);
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

    it("hydration mismatch üretmemek için ikon/title mount öncesi stabil kalır", () => {
        expect(TOGGLE_SRC).toMatch(/const \[mounted, setMounted\] = useState\(false\)/);
        expect(TOGGLE_SRC).toMatch(/useEffect\(\(\) => \{[\s\S]*setMounted\(true\);[\s\S]*\}, \[\]\)/);
        expect(TOGGLE_SRC).toMatch(/const isDark = mounted && resolved === "dark"/);
        expect(TOGGLE_SRC).toMatch(/: "Temayı değiştir"/);
        expect(LOGIN_SRC).toMatch(/function Chrome/);
        expect(LOGIN_SRC).toMatch(/const \[mounted, setMounted\] = useState\(false\)/);
        expect(LOGIN_SRC).toMatch(/const isDark = mounted && resolved === "dark"/);
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

    it("dashboard shell light surface tokenlarını kullanır", () => {
        expect(DASH_LAYOUT_SRC).toContain("var(--app-bg)");
        expect(SIDEBAR_SRC).toContain("var(--shell-bg)");
        expect(SIDEBAR_SRC).toContain("var(--nav-active-bg)");
        expect(GLOBALS_SRC).toMatch(/\.topbar-shell[\s\S]*var\(--shell-bg\)/);
    });

    it("primary Button tema-bilir steel-blue tokenlarından gelir", () => {
        expect(BUTTON_SRC).toContain("var(--button-primary-bg)");
        expect(BUTTON_SRC).toContain("var(--button-primary-shadow)");
        expect(GLOBALS_SRC).toMatch(/--button-primary-bg:/);
    });

    it("temsilci tablolar line-width ve tablo font ağırlığı tokenlarını kullanır", () => {
        for (const src of [PRODUCTS_SRC, ORDERS_SRC, STOCK_GRID_SRC]) {
            expect(src).toContain("var(--line-width) solid var(--surface-border)");
            expect(src).toContain("var(--line-width) solid var(--border-tertiary)");
            expect(src).toContain("var(--font-table-heading-weight)");
            expect(src).toContain("var(--font-table-cell-weight)");
        }
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

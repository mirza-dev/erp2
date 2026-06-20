/**
 * Quotes modülü UI audit fix — source-regex regression locks.
 *
 * Audit (2026-05-28) tespit ettikleri:
 *   1) page.tsx satır 429-454: DOM mutation antipattern
 *      (querySelectorAll + .style mutations + data-chevron/data-delete attrs)
 *   2) page.tsx satır 452: confirmId onMouseLeave'de sıfırlanıyordu → UX bug
 *   3) preview/page.tsx 9 hardcoded hex renk (CSS var değil)
 *   4) QuoteForm.tsx INJECTED_CSS: var(--bg-hover, #2a2e37) fallback
 *      (--bg-hover globals.css'te yok → her zaman hex'e düşer)
 *   5) page.tsx ikon-only buton aria-label eksik (refresh + delete)
 *   6) [id]/page.tsx confirm dialog'da role+aria-modal+labelledby yok
 *
 * Bu test'ler gelecekte biri eski pattern'i geri alırsa erken yakalar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LIST_SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/QuotesClient.tsx"),
    "utf8",
);
const DETAIL_SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/[id]/page.tsx"),
    "utf8",
);
const PREVIEW_SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/preview/page.tsx"),
    "utf8",
);
const FORM_SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/_components/QuoteForm.tsx"),
    "utf8",
);

describe("quotes/page.tsx — Bulgu 3 / P2-A: toplu silme yalnız silinebilir satır + başarılı id", () => {
    it("seçim yalnız silinebilir (draft) satırlarla sınırlı — deletablePageIds", () => {
        // A1: sunucu sayfaladı → `quotes` prop'u geçerli sayfa (eski pagedItems).
        expect(LIST_SRC).toMatch(/const deletablePageIds = canDeleteQuotes \? displayQuotes\.filter\(q => canDeleteQuote\(q\.status\)\)/);
    });

    it("select-all üç helper'ı da deletablePageIds üzerinden çalışır (pageIds değil)", () => {
        expect(LIST_SRC).toMatch(/isPageAllSelected\(deletablePageIds\)/);
        expect(LIST_SRC).toMatch(/isPageIndeterminate\(deletablePageIds\)/);
        expect(LIST_SRC).toMatch(/toggleAll\(deletablePageIds\)/);
    });

    it("per-row checkbox yalnız deletable (+ RBAC Faz 7 delete yetkisi) satırda render edilir", () => {
        expect(LIST_SRC).toMatch(/\{deletable && canDeleteQuotes && \(/);
    });

    it("handleBulkDelete başarılı/başarısız sayımı ortak helper ile yapar ve local patch uygular", () => {
        const bulkStart = LIST_SRC.indexOf("const handleBulkDelete");
        const bulkEnd = LIST_SRC.indexOf("const totalPages", bulkStart);
        const bulkBlock = LIST_SRC.slice(bulkStart, bulkEnd);
        expect(LIST_SRC).toMatch(/const succeededIds = successfulResponseIds\(ids, results\)/);
        expect(LIST_SRC).toContain("applyDeletedQuotes(succeededIds)");
        expect(bulkBlock).not.toContain("router.refresh()");
        expect(LIST_SRC).toMatch(/succeededIds\.length\} teklif silindi/);
        // Eski yanıltıcı "tüm ids'i düşür" kalmadı
        expect(LIST_SRC).not.toMatch(/prev\.filter\(q => !ids\.includes\(q\.id\)\)/);
    });
});

describe("quotes/page.tsx — DOM mutation + UX + a11y fixes", () => {
    it("querySelectorAll DOM mutation pattern'i kaldırıldı", () => {
        expect(LIST_SRC).not.toMatch(/querySelectorAll\(["']td["']\)/);
        expect(LIST_SRC).not.toMatch(/querySelector\(["']\[data-chevron\]["']\)/);
        expect(LIST_SRC).not.toMatch(/querySelector\(["']\[data-delete\]["']\)/);
    });

    it("Card + DataTable kullanır; hoveredId state kaldırıldı (hover + reveal CSS)", () => {
        // Faz B: satır hover + sil/chevron reveal artık globals.css `.erp-data-table`
        // ve `.row-reveal` ile (React state / DOM mutation yok).
        expect(LIST_SRC).toContain("<DataTable");
        expect(LIST_SRC).toMatch(/rows=\{displayQuotes\}/);
        expect(LIST_SRC).not.toMatch(/const \[hoveredId, setHoveredId\]/);
        expect(LIST_SRC).not.toMatch(/onMouseEnter/);
        expect(LIST_SRC).toContain('className="row-reveal"');
    });

    it("data-chevron ve data-delete attribute'ları kaldırıldı", () => {
        expect(LIST_SRC).not.toMatch(/data-chevron/);
        expect(LIST_SRC).not.toMatch(/data-delete/);
    });

    it("UX bug fix: confirmId hover handler'ında sıfırlanmıyor", () => {
        // Hiçbir handler içinde "if (confirmId === q.id) setConfirmId(null)" kalmadı.
        expect(LIST_SRC).not.toMatch(/if \(confirmId === q\.id\) setConfirmId\(null\)/);
    });

    it("Refresh butonuna aria-label eklendi", () => {
        expect(LIST_SRC).toMatch(/aria-label="Teklifleri yenile"/);
    });

    it("Delete butonuna aria-label eklendi", () => {
        expect(LIST_SRC).toMatch(/aria-label="Teklifi sil"/);
    });
});

describe("quotes/[id]/page.tsx — confirm dialog a11y", () => {
    it("Confirm dialog role='dialog' içerir", () => {
        expect(DETAIL_SRC).toMatch(/role="dialog"/);
    });

    it("Confirm dialog aria-modal='true' içerir", () => {
        expect(DETAIL_SRC).toMatch(/aria-modal="true"/);
    });

    it("Confirm dialog aria-labelledby + title id eşleşmesi var", () => {
        expect(DETAIL_SRC).toMatch(/aria-labelledby="quote-confirm-dialog-title"/);
        expect(DETAIL_SRC).toMatch(/id="quote-confirm-dialog-title"/);
    });
});

describe("quotes/preview/page.tsx — hardcoded hex → CSS variable", () => {
    it("9 ana hardcoded hex değeri kaldırıldı", () => {
        // toolbar bg
        expect(PREVIEW_SRC).not.toMatch(/#1e2330/);
        // toolbar border
        expect(PREVIEW_SRC).not.toMatch(/#2d3347/);
        // btnPrimary background (accent)
        expect(PREVIEW_SRC).not.toMatch(/#0072BC/);
        // btnSecondary text + notFound/loading text
        expect(PREVIEW_SRC).not.toMatch(/#9ca3b0/);
        // btnSecondary border
        expect(PREVIEW_SRC).not.toMatch(/#373e47/);
        // notFound/loading bg
        expect(PREVIEW_SRC).not.toMatch(/#1a1d23/);
        // notFound title
        expect(PREVIEW_SRC).not.toMatch(/#e6edf3/);
        // toolbar küçük yazı
        expect(PREVIEW_SRC).not.toMatch(/#636d7c/);
    });

    it("CSS variable'ları kullanılıyor", () => {
        // Not: eski btnPrimary/btnSecondary inline stilleri (`var(--accent)` +
        // `0.5px solid var(--border-secondary)`) görsel QA'da Button component'ine
        // delege edildi (ham <button> → <Button>). Button kullanımı + hardcoded hex
        // yokluğu button-source-regression.test.ts'te kilitli; preview kalan CSS
        // variable'ları hâlâ inline kullanır (aşağıdaki assertion'lar bunu doğrular).
        expect(PREVIEW_SRC).toMatch(/background:\s*"var\(--bg-primary\)"/);
        expect(PREVIEW_SRC).toMatch(/color:\s*"var\(--text-primary\)"/);
        expect(PREVIEW_SRC).toMatch(/color:\s*"var\(--text-secondary\)"/);
        expect(PREVIEW_SRC).toMatch(/color:\s*"var\(--text-tertiary\)"/);
        expect(PREVIEW_SRC).toMatch(/borderBottom:\s*"0\.5px solid var\(--border-tertiary\)"/);
    });

    it("Bilinçli korunan #d0d5dd hâlâ var (PDF kağıt taklidi)", () => {
        // Bu renk korunmalı; yorum satırı + style hâlâ aynı yerde.
        expect(PREVIEW_SRC).toMatch(/#d0d5dd/);
        expect(PREVIEW_SRC).toMatch(/PDF kağıdını taklit eden/);
    });
});

describe("QuoteForm.tsx — INJECTED_CSS hardcoded fallback temizliği", () => {
    it("var(--bg-hover, #2a2e37) fallback kaldırıldı", () => {
        expect(FORM_SRC).not.toMatch(/#2a2e37/);
        expect(FORM_SRC).not.toMatch(/var\(--bg-hover/);
    });

    it("Hover background'ı var(--bg-secondary) kullanıyor", () => {
        // En az bir yerde tr:hover veya .q-cust-opt:hover var(--bg-secondary) ile
        expect(FORM_SRC).toMatch(/tr:hover td\s*\{\s*background:\s*var\(--bg-secondary\)/);
    });

    it("ürün dropdown'u açıkken tablo kapsayıcısı overflow:visible (kırpma fix)", () => {
        // <td position:absolute dropdown'u overflowX:auto kapsayıcıda dikey
        // kırpılıyordu; dropdown açıkken (prodOpenRowId) overflow visible olmalı.
        expect(FORM_SRC).toMatch(/overflowX:\s*prodOpenRowId\s*!==\s*null\s*\?\s*"visible"\s*:\s*"auto"/);
        // Sabit overflowX:"auto" (koşulsuz) artık tablo kapsayıcısında kalmamalı.
        expect(FORM_SRC).not.toMatch(/<div style=\{\{\s*overflowX:\s*"auto"\s*\}\}>/);
    });
});

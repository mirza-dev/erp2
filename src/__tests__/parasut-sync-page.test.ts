/**
 * Paraşüt sync sayfası (final ürün turu) — source-regex davranış kilidi
 *
 * Test ortamında JSX render edilmez (DOM yok); kritik davranışlar source-regex
 * ile kilitlenir (proje paterni).
 *
 *   #1 Manuel Sync kırık-buton fix — runSync `/api/parasut/sync-pending` çağırır
 *      (CRON-only `/api/parasut/sync-all` DEĞİL).
 *   #2 "Son sync" gerçek veri — stats.last_sync_at türevli; hardcoded "17 Mar 2026" yok.
 *   #3 Dürüst progress — sahte "Cariler/Faturalar/Ödemeler" adımları + yüzde yok.
 *   #5 a11y — hata genişletme klavye erişilebilir + filtre select aria-label.
 */
import { describe, it, expect, beforeAll } from "vitest";

describe("Paraşüt sync sayfası — final ürün source kilidi", () => {
    let src = "";

    beforeAll(async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        src = await fs.readFile(
            path.resolve(process.cwd(), "src/app/dashboard/parasut/page.tsx"),
            "utf-8",
        );
    });

    it("#1 runSync authenticated `/api/parasut/sync-pending` ucunu çağırır", () => {
        expect(src).toContain('fetch("/api/parasut/sync-pending"');
        // CRON-only sync-all artık UI'dan çağrılmamalı (yalnız yorumda geçebilir)
        expect(src).not.toContain('fetch("/api/parasut/sync-all"');
    });

    it("#2 lastSyncTime stats.last_sync_at'tan türetilir; hardcoded tarih yok", () => {
        expect(src).toContain("stats.last_sync_at");
        expect(src).toMatch(/last_sync_at \? formatDateTime\(stats\.last_sync_at\)/);
        // Eski sahte başlangıç değeri kaldırıldı
        expect(src).not.toContain('useState("17 Mar 2026');
        expect(src).not.toContain("setLastSyncTime");
    });

    it("#3 sahte ilerleme adımları kaldırıldı (dürüst durum)", () => {
        expect(src).not.toContain("Cariler sync ediliyor");
        expect(src).not.toContain("Ödemeler sync ediliyor");
        expect(src).not.toContain("syncStepLabel");
        // sahte adım/yüzde state'leri yok
        expect(src).not.toContain("setSyncProgress");
        expect(src).not.toContain("setSyncStep");
        expect(src).toContain("Senkronize ediliyor");
    });

    it("#5 hata genişletme span klavye erişilebilir (role/tabIndex/onKeyDown/aria-expanded)", () => {
        expect(src).toContain('role="button"');
        expect(src).toContain("aria-expanded={isExpanded}");
        expect(src).toMatch(/onKeyDown=\{\(e\) => \{[^]*?Enter[^]*?setExpandedError/);
    });

    it("#5 log filtre select'lerine aria-label eklendi", () => {
        expect(src).toContain('aria-label="Step\'e göre filtrele"');
        expect(src).toContain('aria-label="Hata tipine göre filtrele"');
        expect(src).toContain('aria-label="Duruma göre filtrele"');
    });
});

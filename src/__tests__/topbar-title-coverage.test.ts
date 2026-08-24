/**
 * B3 (2026-08-24) — Her dashboard sayfasının üst çubukta kendi adı olmalı.
 *
 * `/dashboard/purchase/rfqs` üst çubukta "Roven" yazıyordu: RFQ rotaları
 * `topbar-title.ts` haritasına hiç eklenmemişti ve fallback'e düşüyorlardı.
 * Aynı sessiz boşluk `/dashboard/import/excel`de de vardı — toplam 34 rotanın
 * 4'ü adsızdı.
 *
 * Bu test tek tek rota saymaz: DOSYA SİSTEMİNİ tarar. Yeni bir sayfa eklenip
 * başlığı unutulursa burada kırılır — kaynak ile harita ayrışamaz.
 */
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { getTopbarTitle } from "@/lib/topbar-title";

const DASHBOARD_DIR = join(process.cwd(), "src/app/dashboard");

/** `src/app/dashboard/**\/page.tsx` → `/dashboard/...` rota yolları. */
function collectRoutes(dir: string, prefix = "/dashboard"): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            // Dinamik segment (`[id]`) örnek bir değerle temsil edilir —
            // getTopbarTitle regex dalları böyle eşleşir.
            const seg = entry.startsWith("[") ? "ornek-id" : entry;
            out.push(...collectRoutes(full, `${prefix}/${seg}`));
        } else if (entry === "page.tsx") {
            out.push(prefix);
        }
    }
    return out;
}

const routes = collectRoutes(DASHBOARD_DIR).sort();

describe("topbar başlık kapsamı", () => {
    it("dashboard altındaki her sayfa taranabiliyor (tarama gerçekten çalışıyor)", () => {
        // Tarama bozulup boş dizi dönerse aşağıdaki asıl test sessizce geçerdi.
        expect(routes.length).toBeGreaterThan(25);
        expect(routes).toContain("/dashboard/purchase/rfqs");
        expect(routes).toContain("/dashboard/quotes");
    });

    it("HİÇBİR sayfa 'Roven' fallback'ine düşmez", () => {
        const untitled = routes.filter(r => getTopbarTitle(r) === "Roven");
        expect(untitled, `başlıksız rota(lar): ${untitled.join(", ")}`).toEqual([]);
    });

    it("başlıklar boş/whitespace değil", () => {
        const blank = routes.filter(r => getTopbarTitle(r).trim() === "");
        expect(blank).toEqual([]);
    });

    it("bilinmeyen rota hâlâ 'Roven' döner (fallback korunuyor)", () => {
        expect(getTopbarTitle("/dashboard/olmayan-sayfa")).toBe("Roven");
    });

    it("B3'ün asıl vakası: RFQ rotalarının üçü de adlandırıldı", () => {
        expect(getTopbarTitle("/dashboard/purchase/rfqs")).toBe("Fiyat Talepleri");
        expect(getTopbarTitle("/dashboard/purchase/rfqs/new")).toBe("Yeni Fiyat Talebi");
        expect(getTopbarTitle("/dashboard/purchase/rfqs/abc-123")).toBe("Fiyat Talebi Detayı");
    });

    it("RFQ detay regex'i 'new' sabitini gölgelemez (sıra doğru)", () => {
        // `/rfqs/new` haritada; regex'ten ÖNCE eşleşmeli, yoksa "Fiyat Talebi
        // Detayı" yazardı.
        expect(getTopbarTitle("/dashboard/purchase/rfqs/new")).not.toBe("Fiyat Talebi Detayı");
    });
});

/**
 * Sidebar — sipariş label çakışmasını düzeltme regression lock.
 *
 * 2026-05-27 — Operasyon ve Satın Alma grupları altında her ikisi de
 * "Siparişler" diye listeleniyordu (kullanıcı sadece grup başlığından ayırıyordu).
 * Net adlandırmaya geçildi: "Satış Siparişleri" + "Satın Alma Siparişleri".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
    join(process.cwd(), "src/components/layout/Sidebar.tsx"),
    "utf8",
);

describe("Sidebar — sipariş label net adlandırma", () => {
    it('Operasyon grubu "Satış Siparişleri" → /dashboard/orders', () => {
        expect(SOURCE).toMatch(
            /label:\s*"Satış Siparişleri",\s*href:\s*"\/dashboard\/orders"/,
        );
    });

    it('Satın Alma grubu "Satın Alma Siparişleri" → /dashboard/purchase/orders', () => {
        expect(SOURCE).toMatch(
            /label:\s*"Satın Alma Siparişleri",\s*href:\s*"\/dashboard\/purchase\/orders"/,
        );
    });

    it('Eski generic "Siparişler" label HİÇBİR href ile eşleşmemeli (regression)', () => {
        // Eski pattern: { label: "Siparişler", href: "/dashboard/orders" } veya
        // { label: "Siparişler", href: "/dashboard/purchase/orders" } — biri bile
        // geri gelirse iki link aynı isimle görünür, UI çakışması döner.
        expect(SOURCE).not.toMatch(/label:\s*"Siparişler",\s*href:\s*"\/dashboard\/orders"/);
        expect(SOURCE).not.toMatch(/label:\s*"Siparişler",\s*href:\s*"\/dashboard\/purchase\/orders"/);
    });
});

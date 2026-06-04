/**
 * Sidebar — sipariş label çakışmasını düzeltme regression lock.
 *
 * 2026-05-27 — Satış ve Satın Alma grupları altında her ikisi de
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
    it('Satış grubu "Satış Siparişleri" → /dashboard/orders', () => {
        expect(SOURCE).toMatch(/label:\s*"Satış"/);
        expect(SOURCE).toMatch(
            /label:\s*"Satış Siparişleri",\s*href:\s*"\/dashboard\/orders",\s*icon:\s*ClipboardList/,
        );
    });

    it('Satın Alma grubu "Satın Alma Siparişleri" → /dashboard/purchase/orders', () => {
        expect(SOURCE).toMatch(
            /label:\s*"Satın Alma Siparişleri",\s*href:\s*"\/dashboard\/purchase\/orders",\s*icon:\s*ShoppingBag/,
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

describe("Sidebar — premium domain navigation", () => {
    it("Dashboard tekil üst item olarak exact active davranışıyla kalır", () => {
        expect(SOURCE).toMatch(
            /label:\s*"Dashboard",\s*href:\s*"\/dashboard",\s*icon:\s*LayoutDashboard,\s*exact:\s*true/,
        );
    });

    it("Cariler Satış altında, Veri Aktarım Merkezi Veri altında görünür", () => {
        expect(SOURCE).toMatch(/label:\s*"Satış"[\s\S]*label:\s*"Cariler",\s*href:\s*"\/dashboard\/customers",\s*icon:\s*Building2/);
        expect(SOURCE).toMatch(/label:\s*"Veri"[\s\S]*label:\s*"Veri Aktarım Merkezi",\s*href:\s*"\/dashboard\/import",\s*icon:\s*UploadCloud/);
    });

    it("Uyarılar Stok & Üretim altında danger rozetle yer alır", () => {
        expect(SOURCE).toMatch(/label:\s*"Stok & Üretim"[\s\S]*label:\s*"Uyarılar",\s*href:\s*"\/dashboard\/alerts",\s*icon:\s*TriangleAlert,[\s\S]*countTone:\s*"danger"/);
    });

    it("eski zayıf sidebar label'ları geri gelmez", () => {
        expect(SOURCE).not.toContain("AI İçeri Aktar");
        expect(SOURCE).not.toContain("Üretim & Stok Uyarıları");
        expect(SOURCE).not.toContain("Muhasebe");
        expect(SOURCE).not.toContain("Otomasyon");
    });

    it("Ayarlar exact active; alt ayar sayfaları kendi item'ını aktif eder", () => {
        expect(SOURCE).toMatch(/label:\s*"Ayarlar",\s*href:\s*"\/dashboard\/settings",\s*icon:\s*Settings,\s*exact:\s*true/);
        expect(SOURCE).toMatch(/item\.exact\s*\?\s*pathname === item\.href/);
    });
});

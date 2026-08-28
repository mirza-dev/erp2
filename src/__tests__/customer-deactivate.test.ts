/**
 * A5 (2026-08-24) — Cariyi pasife alma.
 *
 * `customers.is_active` kolonu ve listedeki "Aktif / Pasif" sekmeleri migration
 * 001'den beri VARDI, ama hiçbir yazma yolu bu alanı set etmiyordu:
 * `UpdateCustomerInput`'ta yok, `dbUpdateCustomer` patch'lemiyor, PATCHABLE
 * whitelist'inde yok, düzenleme panelinde kontrol yok.
 *
 * Tek aksiyon "Kalıcı Sil"di ve o da siparişi olan caride FK guard'ıyla 409
 * dönüyordu → "bu müşteriyle artık çalışmıyoruz" durumunun HİÇBİR karşılığı
 * yoktu; cari sonsuza kadar aktif listede kalıyordu. (Tedarikçiler'de "Pasife
 * al", Ürünler'de soft-delete vardı — cariler tek istisnaydı.)
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const DB_SRC = readFileSync(join(root, "src/lib/supabase/customers.ts"), "utf8");
const ROUTE_SRC = readFileSync(join(root, "src/app/api/customers/[id]/route.ts"), "utf8");
const UI_SRC = readFileSync(join(root, "src/app/dashboard/customers/CustomersClient.tsx"), "utf8");

describe("veri katmanı", () => {
    it("UpdateCustomerInput is_active taşır", () => {
        expect(DB_SRC).toMatch(/is_active\?: boolean;/);
    });

    it("dbUpdateCustomer is_active'i patch'ler", () => {
        expect(DB_SRC).toMatch(/if \(input\.is_active !== undefined\)\s+patch\.is_active = input\.is_active;/);
    });

    it("alan filtresi hâlâ beyaz-liste (mass-assignment yok)", () => {
        // dbUpdateCustomer bilinmeyen alanı patch'e ALMAZ; route body'yi olduğu
        // gibi geçirdiği için asıl koruma burada.
        expect(DB_SRC).toMatch(/const patch: Record<string, unknown> = \{\};/);
        expect(DB_SRC).not.toMatch(/\.update\(input\)/);
    });
});

describe("PATCH sözleşmesi", () => {
    it("is_active PATCHABLE listesinde", () => {
        expect(ROUTE_SRC).toMatch(/const PATCHABLE = \[[^\]]*"is_active"\]/);
    });

    it("boolean olmayan is_active 400 ile reddedilir", () => {
        expect(ROUTE_SRC).toMatch(/if \("is_active" in body && typeof body\.is_active !== "boolean"\)/);
    });

    it("mevcut RBAC guard'ı korunuyor", () => {
        expect(ROUTE_SRC).toMatch(/requirePermission\(req, "manage_customers"\)/);
    });
});

describe("liste aksiyonu", () => {
    it("geri alınabilir seçenek sunulur ve duruma göre etiketlenir", () => {
        expect(UI_SRC).toMatch(/customer\.isActive \? "Pasife al" : "Aktif et"/);
    });

    it("PATCH is_active ile çalışır (kalıcı silme DEĞİL)", () => {
        expect(UI_SRC).toMatch(/handleToggleActive[\s\S]{0,700}JSON\.stringify\(\{ is_active: next \}\)/);
    });

    it("yıkıcı seçenek korunur ama tek seçenek değil", () => {
        expect(UI_SRC).toContain("Kalıcı Sil");
        expect(UI_SRC).toMatch(/Kalıcı silinecek\. Emin misin\?/);
    });

    it("demo guard'ı var", () => {
        expect(UI_SRC).toMatch(/const handleToggleActive = async \(customer: Customer\) => \{\s*\n\s*if \(isDemo\)/);
    });

    it("sekme sayaçları iki yönde de düzeltilir", () => {
        expect(UI_SRC).toMatch(/active: next \? 1 : -1,\s*\n\s*passive: next \? -1 : 1,/);
    });

    it("pasife alınan cari 'Aktif' sekmesinden düşer (mevcut görünüm mantığı)", () => {
        // applyUpdatedCustomer matchesCurrentView ile satırı listeden çıkarır.
        expect(UI_SRC).toMatch(/applyUpdatedCustomer\(mapCustomer\(await res\.json\(\)\)\)/);
        expect(UI_SRC).toMatch(/if \(tab === "active" && !customer\.isActive\) return false;/);
    });
});

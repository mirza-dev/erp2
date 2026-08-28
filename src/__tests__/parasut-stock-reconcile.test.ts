/**
 * Faz 15 — Paraşüt stok mutabakatı.
 *
 * NEDEN VAR: Paraşüt'e stok YALNIZ satış irsaliyesinden DÜŞÜŞ olarak gidiyordu.
 * Giriş hiç gitmiyordu (alış faturası warehouse'suz kesilir; üretim çıkışının
 * Paraşüt'te belge karşılığı YOK) → Paraşüt stoğu zamanla eksiye düşer ve
 * ERP'den kalıcı sapar.
 *
 * ÇÖZÜM: olay tekrarı değil MUTABAKAT — `stock_updates` MUTLAK yazar.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import {
    totalParasutStock,
    hasDrift,
    describeDrifts,
    isAutocorrectEnabled,
    type StockDriftRow,
} from "@/lib/services/parasut-stock-service";
import type { ParasutInventoryLevel } from "@/lib/parasut-adapter";

const SVC = readFileSync("src/lib/services/parasut-stock-service.ts", "utf8");

function lvl(id: string, count: number, wh = "wh1"): ParasutInventoryLevel {
    return { id, warehouse_id: wh, stock_count: count };
}

// ── Stok toplama ─────────────────────────────────────────────────────────────

describe("totalParasutStock", () => {
    it("tek depo seviyesini döner", () => {
        expect(totalParasutStock([lvl("l1", 42)])).toBe(42);
    });

    it("çok depoda TOPLAR (ERP tek on_hand tutar)", () => {
        expect(totalParasutStock([lvl("l1", 30, "a"), lvl("l2", 12, "b")])).toBe(42);
    });

    it("KAYIT YOK → null (sıfır DEĞİL)", () => {
        // "Paraşüt'te stok kaydı yok" ile "stoğu sıfır" aynı şey değil;
        // sıfır sanmak, kaydı olmayan her ürün için sahte sapma üretirdi.
        expect(totalParasutStock([])).toBeNull();
    });
});

// ── Sapma tespiti ────────────────────────────────────────────────────────────

describe("hasDrift", () => {
    it("eşitse sapma yok", () => {
        expect(hasDrift(100, 100)).toBe(false);
        expect(hasDrift(0, 0)).toBe(false);
    });

    it("farklıysa sapma var (iki yönde de)", () => {
        expect(hasDrift(100, 90)).toBe(true);
        expect(hasDrift(90, 100)).toBe(true);
    });

    it("Paraşüt eksideyse yakalanır (asıl semptom)", () => {
        expect(hasDrift(50, -20)).toBe(true);
    });

    it("kayıt yoksa sapma SAYILMAZ (kapsam dışı)", () => {
        expect(hasDrift(100, null)).toBe(false);
    });

    it("ondalık artıklar sapma üretmez (adet bazlı stok)", () => {
        expect(hasDrift(100, 100.0000001)).toBe(false);
    });
});

// ── Rapor metni ──────────────────────────────────────────────────────────────

describe("describeDrifts", () => {
    const rows: StockDriftRow[] = [
        { productId: "p1", sku: "KV-1", name: "Vana", parasutId: "x1", erpOnHand: 100, parasutCount: 90, diff: 10 },
        { productId: "p2", sku: "KV-2", name: "Vana", parasutId: "x2", erpOnHand: 5, parasutCount: null, diff: null },
    ];

    it("SKU + iki taraf + fark yazar", () => {
        const text = describeDrifts(rows);
        expect(text).toContain("KV-1: ERP 100 · Paraşüt 90 (fark 10)");
    });

    it("kayıt yoksa 'kayıt yok' der (0 yazmaz)", () => {
        expect(describeDrifts(rows)).toContain("KV-2: ERP 5 · Paraşüt kayıt yok");
    });

    it("uzun listeyi kısaltır (uyarı açıklaması taşmasın)", () => {
        const many: StockDriftRow[] = Array.from({ length: 15 }, (_, i) => ({
            productId: `p${i}`, sku: `S${i}`, name: "x", parasutId: `x${i}`,
            erpOnHand: 1, parasutCount: 0, diff: 1,
        }));
        expect(describeDrifts(many, 10)).toContain("ve 5 ürün daha");
    });
});

// ── Güvenlik varsayılanları ──────────────────────────────────────────────────

describe("otomatik düzeltme VARSAYILAN OLARAK KAPALI", () => {
    it("env yokken kapalı", () => {
        const old = process.env.PARASUT_STOCK_AUTOCORRECT;
        delete process.env.PARASUT_STOCK_AUTOCORRECT;
        expect(isAutocorrectEnabled()).toBe(false);
        if (old !== undefined) process.env.PARASUT_STOCK_AUTOCORRECT = old;
    });

    it("yalnız tam 'true' açar (truthy string yetmez)", () => {
        const old = process.env.PARASUT_STOCK_AUTOCORRECT;
        for (const v of ["1", "yes", "TRUE", "false"]) {
            process.env.PARASUT_STOCK_AUTOCORRECT = v;
            expect(isAutocorrectEnabled(), v).toBe(false);
        }
        process.env.PARASUT_STOCK_AUTOCORRECT = "true";
        expect(isAutocorrectEnabled()).toBe(true);
        if (old === undefined) delete process.env.PARASUT_STOCK_AUTOCORRECT;
        else process.env.PARASUT_STOCK_AUTOCORRECT = old;
    });

    it("kapalıyken hiçbir yazma yapılmaz (kaynak kilidi)", () => {
        expect(SVC).toContain("if (autocorrect && drifts.length > 0) {");
    });

    it("Paraşüt'te kaydı OLMAYAN ürün düzeltilmez", () => {
        // Mutlak değer yazmak beklenmedik kayıt yaratabilir.
        expect(SVC).toContain("const fixable = drifts.filter(d => d.parasutCount !== null);");
    });

    it("yazım MUTLAK ERP değeriyle yapılır (delta değil)", () => {
        expect(SVC).toContain("new_total_inventory: d.erpOnHand,");
        expect(SVC).toContain("// MUTLAK: ERP otoritedir.");
    });
});

describe("uyarı davranışı", () => {
    it("ürün başına DEĞİL tek toplu uyarı (uyarı merkezi boğulmasın)", () => {
        expect(SVC).toContain("Paraşüt stok sapması — ${unresolved} ürün");
        // Döngü içinde alert açılmamalı.
        const loopStart = SVC.indexOf("for (const p of products) {");
        const loopEnd   = SVC.indexOf("// ── Düzeltme (opt-in)");
        expect(SVC.slice(loopStart, loopEnd)).not.toContain("dbCreateAlert");
    });

    it("sapma kalmayınca uyarı KAPANIR", () => {
        expect(SVC).toContain('reason:   "stock_reconciled"');
    });

    it("kaynak ayrımı korunur (system) — AI uyarıları silinmez", () => {
        // C2 dersi: kaynak ayırmadan kapatmak başka kaynağın uyarısını siliyordu.
        expect(SVC).toContain('source:   "system"');
    });
});

describe("kapsam ve dayanıklılık", () => {
    it("yalnız Paraşüt'e kayıtlı AKTİF ürünler karşılaştırılır", () => {
        expect(SVC).toContain('.not("parasut_product_id", "is", null)');
        expect(SVC).toContain('.eq("is_active", true)');
    });

    it("tek ürünün hatası taramayı DURDURMAZ", () => {
        expect(SVC).toContain("parasut_stock_reconcile_fail");
        expect(SVC).toContain("failed++");
    });

    it("PARASUT_ENABLED kapalıyken hiç çağrı yok ve ayırt edilebilir", () => {
        expect(SVC).toContain("autocorrect: false, drifts: [], disabled: true");
    });

    it("düzeltme parçalara bölünür (tek dev istek yok)", () => {
        expect(SVC).toContain("const CORRECTION_CHUNK = 25;");
    });
});

describe("CRON kaydı", () => {
    it("reconcile-stock CRON_PATHS'te", () => {
        expect(readFileSync("src/proxy.ts", "utf8")).toContain('"/api/parasut/reconcile-stock"');
    });

    it("env örneğinde belgelenmiş ve varsayılanı kapalı", () => {
        const env = readFileSync(".env.example", "utf8");
        expect(env).toContain("PARASUT_STOCK_AUTOCORRECT=false");
        expect(env).toContain("VARSAYILAN: yalnız rapor");
    });
});

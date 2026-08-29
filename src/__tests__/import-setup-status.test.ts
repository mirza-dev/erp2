/**
 * Kurulum durumu — sayaç ucu + panelin türettiği adımlar.
 *
 * NEDEN VAR: Veri Aktarım Merkezi kullanıcıya ne yapabileceğini söylemiyordu;
 * panel bu boşluğu dolduruyor. Panelin değeri DOĞRU sayı göstermesinde —
 * "tamamlandı" derken veri gerçekten orada olmalı, yoksa kullanıcıyı eksik
 * kurulumla go-live'a gönderir.
 *
 * Not: `product_type_id IS NULL` sayımı `is_active=true` ile filtrelenir.
 * Canlıda 42 üründen 22'si tipsiz görünüyordu ama HEPSİ pasif ürünlerdi;
 * filtresiz sayaç kullanıcıya olmayan bir sorun gösterirdi.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequirePermission, mockDbGetImportSetupStatus } = vi.hoisted(() => ({
    mockRequirePermission: vi.fn(),
    mockDbGetImportSetupStatus: vi.fn(),
}));

vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
}));

vi.mock("@/lib/supabase/import-setup-status", () => ({
    dbGetImportSetupStatus: (...a: unknown[]) => mockDbGetImportSetupStatus(...a),
}));

// unstable_cache cache'lemesin — her testte taze çağrı görelim.
vi.mock("next/cache", () => ({
    unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/import/setup-status/route";
import { buildSetupSteps } from "@/components/import/SetupStatusPanel";
import type { ImportSetupStatus } from "@/lib/supabase/import-setup-status";

function req(): NextRequest {
    return new NextRequest("http://localhost:3000/api/import/setup-status");
}

/** Kurulumu tamamlanmış bir sistemin sayaçları. */
function tamKurulum(over: Partial<ImportSetupStatus> = {}): ImportSetupStatus {
    return {
        productTypes: { total: 9, withFields: 8 },
        products: { total: 20, withoutType: 0, withoutSku: 0 },
        customers: { total: 23 },
        vendors: { total: 5, productLinks: 9, productsWithPreferred: 3 },
        stock: { productsWithStock: 19 },
        ...over,
    };
}

beforeEach(() => {
    mockRequirePermission.mockReset();
    mockDbGetImportSetupStatus.mockReset();
    mockRequirePermission.mockResolvedValue(null);
});

describe("GET /api/import/setup-status", () => {
    it("view_import izni ister", async () => {
        mockDbGetImportSetupStatus.mockResolvedValue(tamKurulum());
        await GET(req());
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "view_import");
    });

    it("yetkisiz kullanıcı 403 alır ve sorgu koşmaz", async () => {
        mockRequirePermission.mockResolvedValue(
            NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
        );
        const res = await GET(req());
        expect(res.status).toBe(403);
        expect(mockDbGetImportSetupStatus).not.toHaveBeenCalled();
    });

    it("sayaçları aynen döner", async () => {
        const durum = tamKurulum();
        mockDbGetImportSetupStatus.mockResolvedValue(durum);
        const res = await GET(req());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(durum);
    });

    it("DB hatası 500'e dönüşür, çökmez", async () => {
        mockDbGetImportSetupStatus.mockRejectedValue(new Error("bağlantı yok"));
        const res = await GET(req());
        expect(res.status).toBe(500);
    });
});

describe("buildSetupSteps — sıra ve tamamlanma", () => {
    it("beş adım, kurulum sırasında", () => {
        const ids = buildSetupSteps(tamKurulum()).map(s => s.id);
        // Sıra keyfî değil: tipler ürünlerden, ürünler tedarikçi bağından önce.
        expect(ids).toEqual(["product_types", "products", "customers", "vendors", "stock"]);
    });

    it("tam kurulumda hepsi tamam", () => {
        expect(buildSetupSteps(tamKurulum()).every(s => s.done)).toBe(true);
    });

    it("boş sistemde hiçbiri tamam değil", () => {
        const bos: ImportSetupStatus = {
            productTypes: { total: 0, withFields: 0 },
            products: { total: 0, withoutType: 0, withoutSku: 0 },
            customers: { total: 0 },
            vendors: { total: 0, productLinks: 0, productsWithPreferred: 0 },
            stock: { productsWithStock: 0 },
        };
        expect(buildSetupSteps(bos).some(s => s.done)).toBe(false);
    });

    it("tip sayısı değil ALAN TANIMI tamamlanmayı belirler", () => {
        // 9 tip olsa da hiçbirinde alan yoksa teknik veri tutulamaz — adım
        // "tamam" sayılmamalı, yoksa kullanıcı eksik kurulumla ilerler.
        const s = buildSetupSteps(tamKurulum({ productTypes: { total: 9, withFields: 0 } }));
        const adim = s.find(x => x.id === "product_types")!;
        expect(adim.done).toBe(false);
        expect(adim.warning).toContain("teknik alan tanımlı değil");
    });
});

describe("buildSetupSteps — uyarılar gerçek riski göstermeli", () => {
    it("tipsiz aktif ürün uyarı üretir", () => {
        const s = buildSetupSteps(tamKurulum({ products: { total: 20, withoutType: 7, withoutSku: 0 } }));
        const adim = s.find(x => x.id === "products")!;
        expect(adim.done).toBe(true); // ürün var → adım tamam
        expect(adim.warning).toContain("7 aktif ürünün tipi yok"); // ama eksik var
    });

    it("SKU'suz ürün de uyarı üretir", () => {
        const s = buildSetupSteps(tamKurulum({ products: { total: 20, withoutType: 0, withoutSku: 3 } }));
        expect(s.find(x => x.id === "products")!.warning).toContain("SKU");
    });

    it("tedarikçi var ama ürün bağı yoksa uyarır", () => {
        const s = buildSetupSteps(tamKurulum({
            vendors: { total: 5, productLinks: 0, productsWithPreferred: 0 },
        }));
        expect(s.find(x => x.id === "vendors")!.warning).toContain("tedarikçiye bağlı değil");
    });

    it("bağ var ama tercihli tedarikçi seçili değilse uyarır", () => {
        // Canlıda tam bu durum vardı (9 bağ, 0 tercihli): satın alma önerisi
        // hangi tedarikçiye sipariş açacağını seçemiyordu.
        const s = buildSetupSteps(tamKurulum({
            vendors: { total: 5, productLinks: 9, productsWithPreferred: 0 },
        }));
        expect(s.find(x => x.id === "vendors")!.warning).toContain("tercihli tedarikçi seçili değil");
    });

    it("ürün var ama hiç stok yoksa uyarır", () => {
        const s = buildSetupSteps(tamKurulum({ stock: { productsWithStock: 0 } }));
        const adim = s.find(x => x.id === "stock")!;
        expect(adim.done).toBe(false);
        expect(adim.warning).toContain("Hiçbir üründe stok yok");
    });

    it("hiç ürün yokken stok uyarısı VERMEZ (gürültü olur)", () => {
        const s = buildSetupSteps(tamKurulum({
            products: { total: 0, withoutType: 0, withoutSku: 0 },
            stock: { productsWithStock: 0 },
        }));
        expect(s.find(x => x.id === "stock")!.warning).toBeUndefined();
    });

    it("tam kurulumda hiç uyarı yok", () => {
        expect(buildSetupSteps(tamKurulum()).filter(s => s.warning)).toEqual([]);
    });
});

describe("buildSetupSteps — şablon ve yönlendirme", () => {
    it("ürün tipleri adımının şablonu yok (kod değil konfigürasyon)", () => {
        const adim = buildSetupSteps(tamKurulum()).find(s => s.id === "product_types")!;
        expect(adim.template).toBeUndefined();
        expect(adim.href).toBe("/dashboard/settings/product-types");
    });

    it("yüklenebilir adımların hepsinde şablon ve sihirbaz türü var", () => {
        const yuklenebilir = buildSetupSteps(tamKurulum()).filter(s => s.id !== "product_types");
        for (const adim of yuklenebilir) {
            expect(adim.template, `${adim.id} şablonsuz`).toBeDefined();
            expect(adim.wizardKind, `${adim.id} sihirbaz türü yok`).toBeDefined();
        }
    });

    it("her adımın özeti gerçek sayıyı taşır", () => {
        const s = buildSetupSteps(tamKurulum());
        expect(s.find(x => x.id === "products")!.summary).toContain("20");
        expect(s.find(x => x.id === "customers")!.summary).toContain("23");
        expect(s.find(x => x.id === "vendors")!.summary).toContain("5");
        expect(s.find(x => x.id === "stock")!.summary).toContain("19");
    });
});

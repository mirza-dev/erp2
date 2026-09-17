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

const { mockRequireAnyRole, mockGetCurrentUserRoles, mockDbGetImportSetupStatus, mockDbCountAuthUsers } = vi.hoisted(() => ({
    mockRequireAnyRole: vi.fn(),
    mockGetCurrentUserRoles: vi.fn(),
    mockDbGetImportSetupStatus: vi.fn(),
    mockDbCountAuthUsers: vi.fn(),
}));

vi.mock("@/lib/auth/role-guard", () => ({
    requireAnyRole: (...a: unknown[]) => mockRequireAnyRole(...a),
    getCurrentUserRoles: (...a: unknown[]) => mockGetCurrentUserRoles(...a),
}));

vi.mock("@/lib/supabase/import-setup-status", () => ({
    dbGetImportSetupStatus: (...a: unknown[]) => mockDbGetImportSetupStatus(...a),
    dbCountAuthUsers: (...a: unknown[]) => mockDbCountAuthUsers(...a),
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

/** Sekiz adımın tamamını üreten sayaçlar (onboarding genişlemesi, 2026-09-16). */
function tamKurulum8(over: Partial<ImportSetupStatus> = {}): ImportSetupStatus {
    return tamKurulum({
        company: { nameFilled: true, taxNoFilled: true, addressFilled: true, hasLogo: true },
        users: { total: 4 },
        documents: { quotes: 3, salesOrders: 1 },
        ...over,
    });
}

/** `usePermissions().has` benzeri — verilen izin kümesine bakar. */
function permsOf(...allowed: string[]) {
    const set = new Set(allowed);
    return { has: (p: string) => set.has(p) } as { has: (p: never) => boolean };
}

beforeEach(() => {
    mockRequireAnyRole.mockReset();
    mockGetCurrentUserRoles.mockReset();
    mockDbGetImportSetupStatus.mockReset();
    mockDbCountAuthUsers.mockReset();
    mockRequireAnyRole.mockResolvedValue(null);
    mockGetCurrentUserRoles.mockResolvedValue(["purchasing"]);
    mockDbCountAuthUsers.mockResolvedValue(4);
});

describe("GET /api/import/setup-status", () => {
    it("oturumu olan HER rol okur (view_import değil — 2026-09-16 'herkes görsün')", async () => {
        mockDbGetImportSetupStatus.mockResolvedValue(tamKurulum());
        await GET(req());
        const [, allowed] = mockRequireAnyRole.mock.calls[0] as [unknown, string[]];
        expect(allowed).toEqual(expect.arrayContaining(["admin", "sales", "purchasing", "production", "accounting", "viewer"]));
    });

    it("oturumsuz/yetkisiz 403 alır ve sorgu koşmaz", async () => {
        mockRequireAnyRole.mockResolvedValue(
            NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
        );
        const res = await GET(req());
        expect(res.status).toBe(403);
        expect(mockDbGetImportSetupStatus).not.toHaveBeenCalled();
    });

    it("sayaçları aynen döner; admin değilse `users` alanı YOK", async () => {
        const durum = tamKurulum();
        mockDbGetImportSetupStatus.mockResolvedValue(durum);
        const res = await GET(req());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(durum);
        // Kullanıcı sayısı admin API'si — yetkisi olmayana sayılmaz bile.
        expect(mockDbCountAuthUsers).not.toHaveBeenCalled();
    });

    it("admin ise `users` alanı cache DIŞINDA eklenir", async () => {
        mockGetCurrentUserRoles.mockResolvedValue(["admin"]);
        mockDbGetImportSetupStatus.mockResolvedValue(tamKurulum());
        const res = await GET(req());
        expect((await res.json()).users).toEqual({ total: 4 });
        expect(mockDbCountAuthUsers).toHaveBeenCalledTimes(1);
    });

    it("DB hatası 500'e dönüşür, çökmez", async () => {
        mockDbGetImportSetupStatus.mockRejectedValue(new Error("bağlantı yok"));
        const res = await GET(req());
        expect(res.status).toBe(500);
    });
});

describe("buildSetupSteps — sıra ve tamamlanma", () => {
    it("yalnız veri sayaçları varsa beş adım, kurulum sırasında (geriye uyum)", () => {
        const ids = buildSetupSteps(tamKurulum()).map(s => s.id);
        // Sıra keyfî değil: tipler ürünlerden, ürünler tedarikçi bağından önce.
        // company/users/documents YOKSA o adımlar üretilmez — eski API yanıtı
        // ve eski fixture'lar hâlâ geçerli.
        expect(ids).toEqual(["product_types", "products", "customers", "vendors", "stock"]);
    });

    it("tam sayaçla SEKİZ adım: firma → veri → kullanıcılar → ilk belge", () => {
        const ids = buildSetupSteps(tamKurulum8()).map(s => s.id);
        expect(ids).toEqual([
            "company", "product_types", "products", "customers", "vendors", "stock",
            "users", "first_document",
        ]);
        expect(buildSetupSteps(tamKurulum8()).every(s => s.done)).toBe(true);
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
        // Şablonsuz olanlar konfigürasyon/işlem adımları: tipler, firma,
        // kullanıcılar, ilk belge. Excel'le yüklenen dört adımın şablonu ZORUNLU.
        const SABLONSUZ = new Set(["product_types", "company", "users", "first_document"]);
        const yuklenebilir = buildSetupSteps(tamKurulum8()).filter(s => !SABLONSUZ.has(s.id));
        expect(yuklenebilir.map(s => s.id)).toEqual(["products", "customers", "vendors", "stock"]);
        for (const adim of yuklenebilir) {
            expect(adim.template, `${adim.id} şablonsuz`).toBeDefined();
            expect(adim.wizardKind, `${adim.id} sihirbaz türü yok`).toBeDefined();
        }
    });

    it("her adım en az bir yetki ister (rolün açamayacağı sayfaya link verilmez)", () => {
        for (const adim of buildSetupSteps(tamKurulum8())) {
            expect(adim.permission.length, `${adim.id} yetkisiz`).toBeGreaterThan(0);
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

describe("buildSetupSteps — onboarding adımları (firma / kullanıcılar / ilk belge)", () => {
    it("firma: üç zorunlu alan dolmadan tamam sayılmaz; logo yoksa uyarır ama engellemez", () => {
        const eksik = buildSetupSteps(tamKurulum8({
            company: { nameFilled: true, taxNoFilled: false, addressFilled: true, hasLogo: false },
        })).find(s => s.id === "company")!;
        expect(eksik.done).toBe(false);
        expect(eksik.summary).toContain("2/3");
        expect(eksik.warning).toContain("Logo yüklenmedi");
        expect(eksik.href).toBe("/dashboard/settings?tab=firma");

        const tam = buildSetupSteps(tamKurulum8()).find(s => s.id === "company")!;
        expect(tam.done).toBe(true);
        expect(tam.warning).toBeUndefined();
    });

    it("kullanıcılar: tek kişilik sistem tamam DEĞİL, ikinci kullanıcıyla tamam", () => {
        expect(buildSetupSteps(tamKurulum8({ users: { total: 1 } })).find(s => s.id === "users")!.done).toBe(false);
        expect(buildSetupSteps(tamKurulum8({ users: { total: 2 } })).find(s => s.id === "users")!.done).toBe(true);
    });

    it("ilk belge: teklif VEYA sipariş varsa tamam; özet ikisini de sayar", () => {
        const bos = buildSetupSteps(tamKurulum8({ documents: { quotes: 0, salesOrders: 0 } })).find(s => s.id === "first_document")!;
        expect(bos.done).toBe(false);
        const siparis = buildSetupSteps(tamKurulum8({ documents: { quotes: 0, salesOrders: 1 } })).find(s => s.id === "first_document")!;
        expect(siparis.done).toBe(true);
        expect(siparis.summary).toBe("0 teklif · 1 sipariş");
    });

    it("ilk belge yönlendirmesi: teklif yetkisi varsa teklife, yalnız sipariş yetkisi varsa siparişe", () => {
        const teklifci = buildSetupSteps(tamKurulum8(), permsOf("manage_quotes")).find(s => s.id === "first_document")!;
        expect(teklifci.href).toBe("/dashboard/quotes/new");
        const siparisci = buildSetupSteps(tamKurulum8(), permsOf("manage_sales_orders")).find(s => s.id === "first_document")!;
        expect(siparisci.href).toBe("/dashboard/orders/new");
    });
});

describe("buildSetupSteps — yetki filtresi (herkes görür, herkes her adımı görmez)", () => {
    it("perms verilmezse hiçbir şey süzülmez", () => {
        expect(buildSetupSteps(tamKurulum8())).toHaveLength(8);
    });

    it("satış rolü: ürünler, cariler, stok ve ilk teklif — firma/tip/tedarikçi/kullanıcı YOK", () => {
        // sales: view_customers, view_products, manage_quotes … (permissions.ts)
        const ids = buildSetupSteps(
            tamKurulum8(),
            permsOf("view_customers", "view_products", "manage_quotes", "manage_sales_orders"),
        ).map(s => s.id);
        expect(ids).toEqual(["products", "customers", "stock", "first_document"]);
    });

    it("hiç yetkisi olmayan rol için sıfır adım (bant çizilmez)", () => {
        expect(buildSetupSteps(tamKurulum8(), permsOf())).toEqual([]);
    });

    it("admin (tüm yetkiler) sekiz adımın hepsini görür", () => {
        const hepsi = permsOf(
            "manage_settings", "view_products", "view_customers", "view_vendors",
            "manage_users", "manage_quotes",
        );
        expect(buildSetupSteps(tamKurulum8(), hepsi)).toHaveLength(8);
    });
});

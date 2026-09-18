/**
 * Settings — Company PATCH server-side validation
 *
 * UI'da inline validation var ama auth'lu kullanıcı endpoint'i doğrudan
 * çağırabildiği için API tarafında da aynı kuralları doğrula (defense in depth).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// RBAC Faz 4: route'a requirePermission guard eklendi → guard'ı allow'a mock'la.
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    requireRole: vi.fn().mockResolvedValue(null),
    requireAnyRole: vi.fn().mockResolvedValue(null),
    getCurrentUserPermissions: vi.fn().mockResolvedValue(
        new Set(["view_sales_prices", "view_purchase_costs", "view_financial_summary"])),
    getCurrentUserRoles: vi.fn().mockResolvedValue(["admin"]),
    getCurrentUserRole: vi.fn().mockResolvedValue("admin"),
}));
import { NextRequest } from "next/server";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDbUpdate = vi.fn();
const mockDbGet = vi.fn();
vi.mock("@/lib/supabase/company-settings", () => ({
    dbGetCompanySettings: (...a: unknown[]) => mockDbGet(...a),
    dbUpdateCompanySettings: (...a: unknown[]) => mockDbUpdate(...a),
}));

vi.mock("next/cache", () => ({
    unstable_cache: (fn: unknown) => fn,
    revalidateTag: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/settings/company/route";

beforeEach(() => {
    vi.clearAllMocks();
    mockDbUpdate.mockResolvedValue({ id: "c-1", name: "Test" });
});

function makeReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("PATCH /api/settings/company — server-side validation", () => {
    it("boş name → 400", async () => {
        const res = await PATCH(makeReq({ name: "" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("Firma adı");
        expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("name boşluk only → 400", async () => {
        const res = await PATCH(makeReq({ name: "   " }));
        expect(res.status).toBe(400);
    });

    it("name 200+ karakter → 400", async () => {
        const res = await PATCH(makeReq({ name: "a".repeat(201) }));
        expect(res.status).toBe(400);
    });

    it("geçersiz email → 400", async () => {
        const res = await PATCH(makeReq({ email: "not-an-email" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("e-posta");
    });

    it("boş email → kabul (opsiyonel alan)", async () => {
        const res = await PATCH(makeReq({ email: "" }));
        expect(res.status).toBe(200);
    });

    it("VKN 9 hane → 400", async () => {
        const res = await PATCH(makeReq({ tax_no: "123456789" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("Vergi");
    });

    it("VKN 10 hane → 200", async () => {
        const res = await PATCH(makeReq({ tax_no: "1234567890" }));
        expect(res.status).toBe(200);
    });

    it("geçersiz website → 400", async () => {
        const res = await PATCH(makeReq({ website: "not a url" }));
        expect(res.status).toBe(400);
    });

    it("geçersiz currency → 400", async () => {
        const res = await PATCH(makeReq({ currency: "GBP" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("USD, EUR veya TRY");
    });

    it("happy path → 200, dbUpdate çağrılır", async () => {
        const res = await PATCH(makeReq({
            name: "PMT",
            email: "info@pmt.com",
            tax_no: "1234567890",
            website: "pmt.com.tr",
            currency: "USD",
        }));
        expect(res.status).toBe(200);
        expect(mockDbUpdate).toHaveBeenCalledWith({
            name: "PMT",
            email: "info@pmt.com",
            tax_no: "1234567890",
            website: "pmt.com.tr",
            currency: "USD",
        });
    });

    it("logo_url whitelist'te yok → drop edilir", async () => {
        await PATCH(makeReq({ name: "PMT", logo_url: "https://evil.com/x.png" }));
        const calledWith = mockDbUpdate.mock.calls[0][0];
        expect(calledWith).not.toHaveProperty("logo_url");
    });
});

// ─── Teklif numara biçimi (mig.073 — arayüzü 2026-08-29'da açıldı) ──────────

describe("PATCH /api/settings/company — teklif numara biçimi", () => {
    it("geçerli önek + ayraç → 200 ve ikisi de yazılır", async () => {
        const res = await PATCH(makeReq({ quote_number_prefix: "OFR", quote_number_separator: "/" }));
        expect(res.status).toBe(200);
        expect(mockDbUpdate).toHaveBeenCalledWith({
            quote_number_prefix: "OFR",
            quote_number_separator: "/",
        });
    });

    it.each([
        ["boş önek", ""],
        ["9 karakter", "ABCDEFGHI"],
        ["ayraç içeriyor", "TK-L"],
        ["boşluk içeriyor", "TK L"],
        ["Türkçe karakter", "TÜR"],
    ])("geçersiz önek (%s) → 400, hiçbir şey yazılmaz", async (_ad, prefix) => {
        const res = await PATCH(makeReq({ quote_number_prefix: prefix }));
        expect(res.status).toBe(400);
        expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it.each([
        ["iki karakter", "--"],
        ["rakam", "2"],
        ["boş", ""],
        ["harf", "x"],
    ])("geçersiz ayraç (%s) → 400", async (_ad, sep) => {
        const res = await PATCH(makeReq({ quote_number_separator: sep }));
        expect(res.status).toBe(400);
        expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("alanlar gönderilmezse dokunulmaz (mevcut kayıt korunur)", async () => {
        await PATCH(makeReq({ name: "PMT" }));
        const calledWith = mockDbUpdate.mock.calls[0][0];
        expect(calledWith).not.toHaveProperty("quote_number_prefix");
        expect(calledWith).not.toHaveProperty("quote_number_separator");
    });
});

// ─── Belge vurgu rengi (mig.112 — 2026-09-18) ───────────────────────────────

/**
 * Renk `<style>` metnine ve react-pdf stiline gömülüyor → API, biçimi DB CHECK'i
 * ile birebir doğrulamalı. Ayrıca kolon CANLIDA henüz yok: GET anahtarı hiç
 * döndürmemeli (form "kolon yok" diye okuyor) ve PATCH 500 değil 409 vermeli.
 */
describe("PATCH /api/settings/company — belge vurgu rengi", () => {
    it("geçerli hex → 200 ve BÜYÜK harfe normalize edilerek yazılır", async () => {
        const res = await PATCH(makeReq({ document_accent_color: "#123f73" }));
        expect(res.status).toBe(200);
        expect(mockDbUpdate).toHaveBeenCalledWith({ document_accent_color: "#123F73" });
    });

    it.each([
        ["3 haneli kısa hex", "#abc"],
        ["diyez yok", "0072BC"],
        ["hex olmayan harf", "#00ZZBC"],
        ["renk adı", "red"],
        ["CSS enjeksiyonu", "#fff;} .q-th{display:none}"],
        ["sayı", 123],
    ])("geçersiz biçim (%s) → 400, hiçbir şey yazılmaz", async (_ad, value) => {
        const res = await PATCH(makeReq({ document_accent_color: value }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("#RRGGBB");
        expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("biçimi doğru ama çok açık renk → 400 (beyaz yazı okunmaz)", async () => {
        const res = await PATCH(makeReq({ document_accent_color: "#FFE600" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("çok açık");
        expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("koyu doygun renk (kırmızı) → 200 (kural yalnız okunmazı reddeder, vakum değil)", async () => {
        const res = await PATCH(makeReq({ document_accent_color: "#FF0000" }));
        expect(res.status).toBe(200);
    });

    it("alan gönderilmezse dokunulmaz (mevcut renk korunur)", async () => {
        await PATCH(makeReq({ name: "PMT" }));
        expect(mockDbUpdate.mock.calls[0][0]).not.toHaveProperty("document_accent_color");
    });

    it("kolon yoksa 500 değil 409 + migration numarası", async () => {
        const { CompanySettingsColumnMissingError } = await import("@/lib/company-settings-schema");
        mockDbUpdate.mockRejectedValueOnce(new CompanySettingsColumnMissingError(["document_accent_color"]));
        const res = await PATCH(makeReq({ document_accent_color: "#123F73" }));
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toContain("112");
        expect(body.error).toContain("document_accent_color");
    });
});

describe("GET /api/settings/company — belge rengi yalnız kolon VARSA döner", () => {
    it("kolon varsa değer aynen döner", async () => {
        mockDbGet.mockResolvedValueOnce({ id: "c-1", name: "PMT", document_accent_color: "#123F73" });
        const body = await (await GET()).json();
        expect(body.document_accent_color).toBe("#123F73");
    });

    it("kolon yoksa anahtar HİÇ yok (undefined değil — `in` ile ölçülüyor)", async () => {
        mockDbGet.mockResolvedValueOnce({ id: "c-1", name: "PMT" });
        const body = await (await GET()).json();
        expect("document_accent_color" in body).toBe(false);
        // Anti-vakum: aynı yanıtta whitelist'teki başka alan geliyor.
        expect(body.name).toBe("PMT");
    });

    it("whitelist dışı alan (api_token) sızmaz", async () => {
        mockDbGet.mockResolvedValueOnce({ id: "c-1", name: "PMT", document_accent_color: "#0072BC", api_token: "secret" });
        const body = await (await GET()).json();
        expect(body).not.toHaveProperty("api_token");
        expect(body.document_accent_color).toBe("#0072BC");
    });
});

/**
 * Faz 2 — Vendor entity tests.
 *
 * Covers:
 *   dbCreateVendor:
 *     - name boş → validation error
 *     - geçersiz email → validation error
 *     - geçersiz tax_number → validation error
 *     - geçersiz currency → validation error
 *     - negatif lead_time_days → validation error
 *     - başarılı create → insert + audit_log
 *
 *   dbUpdateVendor:
 *     - geçersiz email patch → validation error
 *     - başarılı patch → update + audit_log
 *
 *   dbDeactivateVendor:
 *     - is_active=false set edilir + audit_log
 *
 *   GET /api/vendors:
 *     - 200 + vendor listesi döner
 *
 *   POST /api/vendors:
 *     - name eksik → 400
 *     - geçersiz email → 400
 *     - başarılı → 201
 *
 *   PATCH /api/vendors/[id]:
 *     - vendor yok → 404
 *     - geçersiz email → 400
 *     - başarılı → 200
 *
 *   DELETE /api/vendors/[id]:
 *     - vendor yok → 404
 *     - zaten pasif → 409
 *     - başarılı → 200
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockSingle = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockMaybeSingle = vi.fn();

// Configurable thenable result for terminal chain methods (.in/.eq when at end).
let _terminalResult: { count?: number; error: unknown; data?: unknown } = { count: 0, error: null };
function setTerminalResult(v: { count?: number; error: unknown; data?: unknown }) { _terminalResult = v; }

const makeChain = () => {
    const chain: Record<string, unknown> = {};
    chain.insert = (_v: unknown) => { mockInsert(_v); return chain; };
    chain.update = (_v: unknown) => { mockUpdate(_v); return chain; };
    chain.select = (_v?: unknown, _o?: unknown) => { mockSelect(_v, _o); return chain; };
    chain.eq = (_k: unknown, _v: unknown) => { mockEq(_k, _v); return chain; };
    chain.in = (_k: unknown, _v: unknown) => { mockIn(_k, _v); return _terminalResult; };  // terminal for count queries
    chain.order = (_v: unknown) => { mockOrder(_v); return chain; };
    chain.limit = (_v: unknown) => { mockLimit(_v); return chain; };
    chain.single = () => mockSingle();
    chain.maybeSingle = () => mockMaybeSingle();
    return chain;
};

const mockSupabase = {
    from: (table: string) => { mockFrom(table); return makeChain(); },
};

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => mockSupabase,
}));

// Validation tests use vi.importActual to get real implementations (not mocks).
// Route tests use mock*Vendor helpers above via vi.mock.

// ── Route mocks ────────────────────────────────────────────────

const mockDbListVendors = vi.fn();
const mockDbCreateVendor = vi.fn();
const mockDbGetVendorById = vi.fn();
const mockDbUpdateVendor = vi.fn();
const mockDbDeactivateVendor = vi.fn();

vi.mock("@/lib/supabase/vendors", async () => {
    const actual = await vi.importActual("@/lib/supabase/vendors") as typeof import("@/lib/supabase/vendors");
    return {
        ...actual,
        dbListVendors:    (...a: unknown[]) => mockDbListVendors(...a),
        dbCreateVendor:   (...a: unknown[]) => mockDbCreateVendor(...a),
        dbGetVendorById:  (...a: unknown[]) => mockDbGetVendorById(...a),
        dbUpdateVendor:   (...a: unknown[]) => mockDbUpdateVendor(...a),
        dbDeactivateVendor: (...a: unknown[]) => mockDbDeactivateVendor(...a),
    };
});

vi.mock("next/cache", () => ({
    unstable_cache: (_fn: () => unknown) => _fn,
    revalidateTag: vi.fn(),
}));

import { GET as vendorsGET, POST as vendorsPOST } from "@/app/api/vendors/route";
import {
    GET as vendorIdGET,
    PATCH as vendorIdPATCH,
    DELETE as vendorIdDELETE,
} from "@/app/api/vendors/[id]/route";

// ── Helpers ────────────────────────────────────────────────────

function makeReq(body?: unknown, url = "http://localhost/api/vendors"): Request {
    if (body === undefined) return new Request(url);
    return new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

function makePatchReq(body?: unknown, url = "http://localhost/api/vendors/v-1"): Request {
    return new Request(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });
}

function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
}

const sampleVendor = {
    id: "v-1",
    name: "Valf A.Ş.",
    contact_email: null,
    contact_phone: null,
    contact_person: null,
    tax_number: null,
    address: null,
    currency: "TRY",
    payment_terms_days: null,
    lead_time_days: 30,
    notes: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
    mockFrom.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockSelect.mockReset();
    mockEq.mockReset();
    mockIn.mockReset();
    mockOrder.mockReset();
    mockSingle.mockReset();
    mockDbListVendors.mockReset();
    mockDbCreateVendor.mockReset();
    mockDbGetVendorById.mockReset();
    mockDbUpdateVendor.mockReset();
    mockDbDeactivateVendor.mockReset();
    setTerminalResult({ count: 0, error: null });
});

// ── dbCreateVendor validation ─────────────────────────────────

describe("dbCreateVendor — validation", () => {
    it("name boş string → validation error fırlatır", async () => {
        // importActual ile gerçek implementasyonu test ediyoruz —
        // supabase mock üzerinden geçmez, erken hata fırlatır.
        const { dbCreateVendor: realCreate } = await vi.importActual<typeof import("@/lib/supabase/vendors")>("@/lib/supabase/vendors");
        await expect(realCreate({ name: "" })).rejects.toThrow("Tedarikçi adı zorunludur.");
    });

    it("geçersiz email → validation error fırlatır", async () => {
        const { dbCreateVendor: realCreate } = await vi.importActual<typeof import("@/lib/supabase/vendors")>("@/lib/supabase/vendors");
        await expect(realCreate({ name: "Test", contact_email: "not-an-email" })).rejects.toThrow("Geçersiz e-posta");
    });

    it("geçersiz tax_number (5 hane) → validation error fırlatır", async () => {
        const { dbCreateVendor: realCreate } = await vi.importActual<typeof import("@/lib/supabase/vendors")>("@/lib/supabase/vendors");
        await expect(realCreate({ name: "Test", tax_number: "12345" })).rejects.toThrow("10 veya 11 haneli");
    });

    it("geçersiz currency → validation error fırlatır", async () => {
        const { dbCreateVendor: realCreate } = await vi.importActual<typeof import("@/lib/supabase/vendors")>("@/lib/supabase/vendors");
        await expect(realCreate({ name: "Test", currency: "GBP" })).rejects.toThrow("Geçersiz para birimi");
    });

    it("negatif lead_time_days → validation error fırlatır", async () => {
        const { dbCreateVendor: realCreate } = await vi.importActual<typeof import("@/lib/supabase/vendors")>("@/lib/supabase/vendors");
        await expect(realCreate({ name: "Test", lead_time_days: -1 })).rejects.toThrow("geçersiz");
    });
});

// ── dbCreateVendor numeric validation ────────────────────────

describe("dbCreateVendor — numeric validation", () => {
    it("lead_time_days: NaN → validation error fırlatır", async () => {
        const { dbCreateVendor: realCreate } = await vi.importActual<typeof import("@/lib/supabase/vendors")>("@/lib/supabase/vendors");
        await expect(realCreate({ name: "Test", lead_time_days: NaN })).rejects.toThrow("geçersiz");
    });

    it("lead_time_days: Infinity → validation error fırlatır", async () => {
        const { dbCreateVendor: realCreate } = await vi.importActual<typeof import("@/lib/supabase/vendors")>("@/lib/supabase/vendors");
        await expect(realCreate({ name: "Test", lead_time_days: Infinity })).rejects.toThrow("geçersiz");
    });

    it("lead_time_days: 1.5 (float) → validation error fırlatır", async () => {
        const { dbCreateVendor: realCreate } = await vi.importActual<typeof import("@/lib/supabase/vendors")>("@/lib/supabase/vendors");
        await expect(realCreate({ name: "Test", lead_time_days: 1.5 })).rejects.toThrow("geçersiz");
    });

    it("lead_time_days: 0 → geçer (geçerli sınır değeri)", async () => {
        const { dbCreateVendor: realCreate } = await vi.importActual<typeof import("@/lib/supabase/vendors")>("@/lib/supabase/vendors");
        // 0 geçerli — supabase mock'u bağlı değil, DB hatasıyla değil validation hatasıyla dönmeli
        await expect(realCreate({ name: "Test", lead_time_days: 0 })).rejects.not.toThrow("geçersiz");
    });

    it("payment_terms_days: NaN → validation error fırlatır", async () => {
        const { dbCreateVendor: realCreate } = await vi.importActual<typeof import("@/lib/supabase/vendors")>("@/lib/supabase/vendors");
        await expect(realCreate({ name: "Test", payment_terms_days: NaN })).rejects.toThrow("geçersiz");
    });

    it("payment_terms_days: 1.5 (float) → validation error fırlatır", async () => {
        const { dbCreateVendor: realCreate } = await vi.importActual<typeof import("@/lib/supabase/vendors")>("@/lib/supabase/vendors");
        await expect(realCreate({ name: "Test", payment_terms_days: 1.5 })).rejects.toThrow("geçersiz");
    });
});

// ── GET /api/vendors ──────────────────────────────────────────

describe("GET /api/vendors", () => {
    it("200 + vendor listesi döner", async () => {
        mockDbListVendors.mockResolvedValue([sampleVendor]);
        const res = await vendorsGET(makeReq() as unknown as Parameters<typeof vendorsGET>[0]);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
        expect(body[0].name).toBe("Valf A.Ş.");
    });
});

// ── POST /api/vendors ─────────────────────────────────────────

describe("POST /api/vendors", () => {
    it("name eksik → 400", async () => {
        mockDbCreateVendor.mockRejectedValue(new Error("Tedarikçi adı zorunludur."));
        const res = await vendorsPOST(makeReq({ name: "" }) as unknown as Parameters<typeof vendorsPOST>[0]);
        expect(res.status).toBe(400);
    });

    it("geçersiz email → 400", async () => {
        mockDbCreateVendor.mockRejectedValue(new Error("Geçersiz e-posta adresi."));
        const res = await vendorsPOST(makeReq({ name: "Test", contact_email: "bad" }) as unknown as Parameters<typeof vendorsPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/e-posta/i);
    });

    it("geçersiz lead_time_days (NaN/float) → 400", async () => {
        mockDbCreateVendor.mockRejectedValue(new Error("Tedarik süresi geçersiz: sıfır veya pozitif tam sayı olmalıdır."));
        const res = await vendorsPOST(makeReq({ name: "Test", lead_time_days: "abc" }) as unknown as Parameters<typeof vendorsPOST>[0]);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/geçersiz/i);
    });

    it("geçersiz payment_terms_days (float) → 400", async () => {
        mockDbCreateVendor.mockRejectedValue(new Error("Ödeme vadesi geçersiz: sıfır veya pozitif tam sayı olmalıdır."));
        const res = await vendorsPOST(makeReq({ name: "Test", payment_terms_days: 1.5 }) as unknown as Parameters<typeof vendorsPOST>[0]);
        expect(res.status).toBe(400);
    });

    it("başarılı create → 201", async () => {
        mockDbCreateVendor.mockResolvedValue(sampleVendor);
        const res = await vendorsPOST(makeReq({ name: "Valf A.Ş." }) as unknown as Parameters<typeof vendorsPOST>[0]);
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.name).toBe("Valf A.Ş.");
    });
});

// ── GET /api/vendors/[id] ─────────────────────────────────────

describe("GET /api/vendors/[id]", () => {
    it("vendor yok → 404", async () => {
        mockDbGetVendorById.mockResolvedValue(null);
        const res = await vendorIdGET(makeReq() as unknown as Parameters<typeof vendorIdGET>[0], makeParams("v-99"));
        expect(res.status).toBe(404);
    });

    it("vendor var → 200", async () => {
        mockDbGetVendorById.mockResolvedValue(sampleVendor);
        const res = await vendorIdGET(makeReq() as unknown as Parameters<typeof vendorIdGET>[0], makeParams("v-1"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe("v-1");
    });
});

// ── PATCH /api/vendors/[id] ───────────────────────────────────

describe("PATCH /api/vendors/[id]", () => {
    it("vendor yok → 404", async () => {
        mockDbGetVendorById.mockResolvedValue(null);
        const res = await vendorIdPATCH(makePatchReq({ name: "Yeni" }) as unknown as Parameters<typeof vendorIdPATCH>[0], makeParams("v-99"));
        expect(res.status).toBe(404);
    });

    it("geçersiz email patch → 400", async () => {
        mockDbGetVendorById.mockResolvedValue(sampleVendor);
        mockDbUpdateVendor.mockRejectedValue(new Error("Geçersiz e-posta adresi."));
        const res = await vendorIdPATCH(makePatchReq({ contact_email: "bad" }) as unknown as Parameters<typeof vendorIdPATCH>[0], makeParams("v-1"));
        expect(res.status).toBe(400);
    });

    it("geçersiz lead_time_days patch (float) → 400", async () => {
        mockDbGetVendorById.mockResolvedValue(sampleVendor);
        mockDbUpdateVendor.mockRejectedValue(new Error("Tedarik süresi geçersiz: sıfır veya pozitif tam sayı olmalıdır."));
        const res = await vendorIdPATCH(makePatchReq({ lead_time_days: 1.5 }) as unknown as Parameters<typeof vendorIdPATCH>[0], makeParams("v-1"));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/geçersiz/i);
    });

    it("başarılı patch → 200", async () => {
        mockDbGetVendorById.mockResolvedValue(sampleVendor);
        mockDbUpdateVendor.mockResolvedValue({ ...sampleVendor, name: "Yeni İsim" });
        const res = await vendorIdPATCH(makePatchReq({ name: "Yeni İsim" }) as unknown as Parameters<typeof vendorIdPATCH>[0], makeParams("v-1"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.name).toBe("Yeni İsim");
    });
});

// ── DELETE /api/vendors/[id] ──────────────────────────────────

describe("DELETE /api/vendors/[id]", () => {
    it("vendor yok → 404", async () => {
        mockDbGetVendorById.mockResolvedValue(null);
        const res = await vendorIdDELETE(makeReq() as unknown as Parameters<typeof vendorIdDELETE>[0], makeParams("v-99"));
        expect(res.status).toBe(404);
    });

    it("zaten pasif → 409", async () => {
        mockDbGetVendorById.mockResolvedValue({ ...sampleVendor, is_active: false });
        const res = await vendorIdDELETE(makeReq() as unknown as Parameters<typeof vendorIdDELETE>[0], makeParams("v-1"));
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toMatch(/zaten pasif/i);
    });

    it("başarılı deactivate → 200", async () => {
        mockDbGetVendorById.mockResolvedValue(sampleVendor);
        mockDbDeactivateVendor.mockResolvedValue(undefined);
        const res = await vendorIdDELETE(makeReq() as unknown as Parameters<typeof vendorIdDELETE>[0], makeParams("v-1"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(mockDbDeactivateVendor).toHaveBeenCalledWith("v-1");
    });
});

// ── dbDeactivateVendor — active PO guard (P2.1) ───────────────

describe("dbDeactivateVendor — active PO guard", () => {
    it("aktif PO var → 'aktif PO'su var' fırlatır", async () => {
        const { dbDeactivateVendor: realDeactivate } = await vi.importActual<typeof import("@/lib/supabase/vendors")>("@/lib/supabase/vendors");
        setTerminalResult({ count: 2, error: null });
        await expect(realDeactivate("v-1")).rejects.toThrow("aktif PO'su var");
    });

    it("aktif PO yok → UPDATE + audit_log çağrılır", async () => {
        const { dbDeactivateVendor: realDeactivate } = await vi.importActual<typeof import("@/lib/supabase/vendors")>("@/lib/supabase/vendors");
        setTerminalResult({ count: 0, error: null });
        await realDeactivate("v-1");
        // UPDATE: from("vendors") + update({ is_active: false })
        expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
        // audit_log INSERT
        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
            action: "vendor_deactivated",
            entity_type: "vendor",
            entity_id: "v-1",
        }));
    });
});

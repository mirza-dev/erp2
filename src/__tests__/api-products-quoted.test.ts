/**
 * Tests for quoted/promisable enrichment in GET /api/products.
 *
 * Verifies that the route merges dbGetQuotedQuantities() output into
 * each product, computing quoted and promisable fields correctly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbListProducts = vi.fn();
const mockDbGetQuotedQuantities = vi.fn();
const mockDbGetIncomingQuantities = vi.fn();

const mockDbListAllActiveProducts = vi.fn();
const mockDbCreateProduct = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts:           (...args: unknown[]) => mockDbListProducts(...args),
    dbListAllActiveProducts:  (...args: unknown[]) => mockDbListAllActiveProducts(...args),
    dbCreateProduct:          (...args: unknown[]) => mockDbCreateProduct(...args),
    dbGetQuotedQuantities:    (...args: unknown[]) => mockDbGetQuotedQuantities(...args),
}));

vi.mock("@/lib/supabase/purchase-commitments", () => ({
    dbGetIncomingQuantities: (...args: unknown[]) => mockDbGetIncomingQuantities(...args),
    dbListCommitments:       vi.fn(),
    dbCreateCommitment:      vi.fn(),
    dbGetCommitment:         vi.fn(),
    dbReceiveCommitment:     vi.fn(),
    dbCancelCommitment:      vi.fn(),
}));

// RBAC R3: GET artık per-request redaction yapıyor → getCurrentUserPermissions
// çağrılıyor. Tam finansal yetki dön (redaction no-op) ki mevcut fiyat/cost
// assertion'ları korunsun + createClient/cookies throw etmesin.
vi.mock("@/lib/auth/role-guard", () => ({
    getCurrentUserPermissions: vi.fn(async () =>
        new Set(["view_sales_prices", "view_purchase_costs", "view_financial_summary"])),
}));

import { GET, POST } from "@/app/api/products/route";

// ── Helpers ───────────────────────────────────────────────────

function makeRequest(): NextRequest {
    return new NextRequest("http://localhost/api/products", { method: "GET" });
}

function makeProduct(id: string, on_hand: number, reserved: number) {
    return {
        id,
        name: `Product ${id}`,
        sku: `SKU-${id}`,
        category: null,
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand,
        reserved,
        available_now: on_hand - reserved,
        min_stock_level: 5,
        is_active: true,
        product_type: "manufactured" as const,
        warehouse: null,
        reorder_qty: null as number | null,
        preferred_vendor: null,
        daily_usage: null as number | null,
        lead_time_days: null as number | null,
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        product_family: null,
        sub_category: null,
        sector_compatibility: null,
        cost_price: null,
        weight_kg: null,
        material_quality: null,
        origin_country: null,
        production_site: null,
        use_cases: null,
        industries: null,
        standards: null,
        certifications: null,
        product_notes: null,
    };
}

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    mockDbListProducts.mockResolvedValue([]);
    mockDbListAllActiveProducts.mockResolvedValue([]);
    mockDbGetQuotedQuantities.mockResolvedValue(new Map());
    mockDbGetIncomingQuantities.mockResolvedValue(new Map());
});

// ── Tests ─────────────────────────────────────────────────────

describe("GET /api/products — quoted/promisable enrichment", () => {
    it("quoted=0 and promisable=available_now when no active quotes", async () => {
        const product = makeProduct("prod-1", 50, 10);
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map());

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].quoted).toBe(0);
        expect(data[0].promisable).toBe(40); // available_now = 50 - 10 = 40
    });

    it("quoted reflects active quote quantity for a product", async () => {
        const product = makeProduct("prod-1", 50, 10);
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 30]]));

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].quoted).toBe(30);
        expect(data[0].promisable).toBe(10); // 40 available_now - 30 quoted
    });

    it("promisable can go negative when quotes exceed available stock", async () => {
        const product = makeProduct("prod-1", 50, 40); // available_now = 10
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 15]]));

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].quoted).toBe(15);
        expect(data[0].promisable).toBe(-5); // 10 - 15 = -5
    });

    it("products without active quotes get quoted=0", async () => {
        const prod1 = makeProduct("prod-1", 50, 0);
        const prod2 = makeProduct("prod-2", 30, 0);
        mockDbListProducts.mockResolvedValue([prod1, prod2]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 20]]));

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].quoted).toBe(20);
        expect(data[0].promisable).toBe(30);
        expect(data[1].quoted).toBe(0);
        expect(data[1].promisable).toBe(30);
    });

    it("both dbListProducts and dbGetQuotedQuantities are called in parallel", async () => {
        await GET(makeRequest());
        expect(mockDbListProducts).toHaveBeenCalledTimes(1);
        expect(mockDbGetQuotedQuantities).toHaveBeenCalledTimes(1);
    });
});

// forecasted = available_now + incoming - quoted
// (available_now = on_hand - reserved, so reserved is NOT subtracted again)
describe("GET /api/products — forecasted enrichment", () => {
    it("forecasted equals available_now when no incoming and no quoted", async () => {
        // on_hand=50, reserved=10 → available_now=40, incoming=0, quoted=0
        // forecasted = 40 + 0 - 0 = 40
        const product = makeProduct("prod-1", 50, 10);
        mockDbListProducts.mockResolvedValue([product]);

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].forecasted).toBe(40);
    });

    it("forecasted adds incoming on top of available_now", async () => {
        // on_hand=50, reserved=10 → available_now=40, incoming=20, quoted=0
        // forecasted = 40 + 20 - 0 = 60
        const product = makeProduct("prod-1", 50, 10);
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetIncomingQuantities.mockResolvedValue(new Map([["prod-1", 20]]));

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].forecasted).toBe(60);
    });

    it("forecasted subtracts quoted from available_now+incoming", async () => {
        // on_hand=50, reserved=10 → available_now=40, incoming=20, quoted=15
        // forecasted = 40 + 20 - 15 = 45
        const product = makeProduct("prod-1", 50, 10);
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 15]]));
        mockDbGetIncomingQuantities.mockResolvedValue(new Map([["prod-1", 20]]));

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].forecasted).toBe(45);
    });

    it("reserved is NOT double-counted in forecasted", async () => {
        // on_hand=100, reserved=30 → available_now=70
        // incoming=0, quoted=0
        // Correct:   forecasted = 70 + 0 - 0 = 70
        // Old bug:   forecasted = 70 + 0 - 30 - 0 = 40  (reserved double-counted)
        const product = makeProduct("prod-1", 100, 30);
        mockDbListProducts.mockResolvedValue([product]);

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].forecasted).toBe(70); // not 40
    });

    it("forecasted can go negative when quotes exceed available+incoming", async () => {
        // on_hand=20, reserved=10 → available_now=10, incoming=5, quoted=20
        // forecasted = 10 + 5 - 20 = -5
        const product = makeProduct("prod-1", 20, 10);
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 20]]));
        mockDbGetIncomingQuantities.mockResolvedValue(new Map([["prod-1", 5]]));

        const res = await GET(makeRequest());
        const data = await res.json();

        expect(data[0].forecasted).toBe(-5);
    });

    it("returns 200 with enriched products", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct("prod-1", 20, 5)]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 10]]));

        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveLength(1);
        expect(data[0]).toHaveProperty("quoted", 10);
        expect(data[0]).toHaveProperty("promisable", 5);
    });
});

// ── Deadline enrichment ───────────────────────────────────────

describe("GET /api/products — deadline enrichment", () => {
    it("daily_usage null → stockoutDate null, orderDeadline null", async () => {
        // makeProduct sets daily_usage: null by default
        mockDbListProducts.mockResolvedValue([makeProduct("prod-1", 50, 0)]);
        const [row] = await (await GET(makeRequest())).json();
        expect(row.stockoutDate).toBeNull();
        expect(row.orderDeadline).toBeNull();
    });

    it("daily_usage set, lead_time_days null → stockoutDate dolu, orderDeadline null", async () => {
        const p = { ...makeProduct("prod-1", 100, 0), daily_usage: 10, lead_time_days: null };
        mockDbListProducts.mockResolvedValue([p]);
        const [row] = await (await GET(makeRequest())).json();
        expect(row.stockoutDate).not.toBeNull();
        expect(row.orderDeadline).toBeNull();
    });

    it("daily_usage ve lead_time_days dolu → deadline hesaplanmış", async () => {
        const p = { ...makeProduct("prod-1", 100, 0), daily_usage: 10, lead_time_days: 30 };
        mockDbListProducts.mockResolvedValue([p]);
        const [row] = await (await GET(makeRequest())).json();
        expect(row.stockoutDate).not.toBeNull();
        expect(row.orderDeadline).not.toBeNull();
    });
});

// ─── Audit 4-5. tur — ?all=1 query parametresi ────────────────────────────────

describe("GET /api/products?all=1 — pagination'sız + filter-aware", () => {
    function makeAllRequest(qs = ""): NextRequest {
        return new NextRequest(`http://localhost/api/products?all=1${qs}`, { method: "GET" });
    }

    it("?all=1 → dbListProducts pageSize:10000 ile çağrılır", async () => {
        mockDbListProducts.mockResolvedValue([]);
        await GET(makeAllRequest());
        expect(mockDbListProducts).toHaveBeenCalledTimes(1);
        const [filter] = mockDbListProducts.mock.calls[0];
        expect(filter.pageSize).toBe(10000);
        expect(filter.page).toBe(1);
    });

    it("?all=0 (default) → dbListProducts pageSize default (paginated, regresyon)", async () => {
        mockDbListProducts.mockResolvedValue([]);
        await GET(makeRequest());
        expect(mockDbListProducts).toHaveBeenCalledTimes(1);
        const [filter] = mockDbListProducts.mock.calls[0];
        // Default pageSize helper içinde 100; ?all=1 değil
        expect(filter.pageSize).toBeUndefined();
    });

    it("?all=1 enrichment — promisable hesaplanır", async () => {
        const product = makeProduct("prod-1", 100, 0);
        mockDbListProducts.mockResolvedValue([product]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 30]]));
        const res = await GET(makeAllRequest());
        const data = await res.json();
        expect(data[0].quoted).toBe(30);
        expect(data[0].promisable).toBe(70);
    });

    // Audit 5. tur Fix 5: ?all=1 filter-aware

    it("?all=1&category=Vana → category filter'ı dbListProducts'a geçer", async () => {
        mockDbListProducts.mockResolvedValue([]);
        await GET(makeAllRequest("&category=Vana"));
        const [filter] = mockDbListProducts.mock.calls[0];
        expect(filter.category).toBe("Vana");
    });

    it("?all=1&product_type=manufactured → product_type filter'ı geçer", async () => {
        mockDbListProducts.mockResolvedValue([]);
        await GET(makeAllRequest("&product_type=manufactured"));
        const [filter] = mockDbListProducts.mock.calls[0];
        expect(filter.product_type).toBe("manufactured");
    });

    it("?all=1&is_active=false → is_active false filter'ı geçer", async () => {
        mockDbListProducts.mockResolvedValue([]);
        await GET(makeAllRequest("&is_active=false"));
        const [filter] = mockDbListProducts.mock.calls[0];
        expect(filter.is_active).toBe(false);
    });

    it("?all=1 (filtersiz) → is_active default true, category/type undefined", async () => {
        mockDbListProducts.mockResolvedValue([]);
        await GET(makeAllRequest());
        const [filter] = mockDbListProducts.mock.calls[0];
        expect(filter.is_active).toBe(true);
        expect(filter.category).toBeUndefined();
        expect(filter.product_type).toBeUndefined();
    });
});

// ─── Audit 6. tur Fix 5 — POST response enrichment ───────────────────────────

describe("POST /api/products — response enriched (quoted/promisable/incoming)", () => {
    function makePostRequest(body: Record<string, unknown>): NextRequest {
        return new NextRequest("http://localhost/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    beforeEach(() => {
        mockDbCreateProduct.mockReset();
        mockDbGetQuotedQuantities.mockResolvedValue(new Map());
        mockDbGetIncomingQuantities.mockResolvedValue(new Map());
    });

    it("response'ta quoted/promisable/incoming/forecasted alanları var", async () => {
        const created = makeProduct("prod-new", 100, 0);
        mockDbCreateProduct.mockResolvedValue(created);
        const res = await POST(makePostRequest({ name: "Test", sku: "T-1", unit: "adet" }));
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.quoted).toBeDefined();
        expect(data.promisable).toBeDefined();
        expect(data.incoming).toBeDefined();
        expect(data.forecasted).toBeDefined();
        expect(data.quoted).toBe(0); // yeni ürün için quote yok
        expect(data.promisable).toBe(100); // available_now - 0
    });

    it("response'ta stockoutDate/orderDeadline alanları var", async () => {
        const created = makeProduct("prod-new", 100, 0);
        // dailyUsage + leadTime mevcut → orderDeadline hesaplanır
        created.daily_usage = 2;
        created.lead_time_days = 10;
        mockDbCreateProduct.mockResolvedValue(created);
        const res = await POST(makePostRequest({ name: "Test", sku: "T-2", unit: "adet" }));
        const data = await res.json();
        expect(data.stockoutDate).toBeDefined();
        expect(data.orderDeadline).toBeDefined();
    });

    it("dbGetQuotedQuantities ve dbGetIncomingQuantities POST'ta çağrılır (enrichment için)", async () => {
        mockDbCreateProduct.mockResolvedValue(makeProduct("prod-new", 100, 0));
        await POST(makePostRequest({ name: "Test", sku: "T-3", unit: "adet" }));
        expect(mockDbGetQuotedQuantities).toHaveBeenCalled();
        expect(mockDbGetIncomingQuantities).toHaveBeenCalled();
    });

    it("Mevcut quote varsa promisable doğru hesaplanır (mevcut SKU içeriği)", async () => {
        const created = makeProduct("prod-existing", 100, 0);
        mockDbCreateProduct.mockResolvedValue(created);
        // Bu SKU için zaten 30 quote varmış (edge case — ürün gerçekte yeni yaratıldı,
        // ama quoted helper diğer ürünleri de döner, bizimki yok)
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-existing", 30]]));
        const res = await POST(makePostRequest({ name: "T", sku: "T-4", unit: "adet" }));
        const data = await res.json();
        expect(data.promisable).toBe(70);
    });
});

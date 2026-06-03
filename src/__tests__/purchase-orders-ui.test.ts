/**
 * Faz 4 — PO UI smoke + behavior tests
 *
 * Module load smoke (4) + extracted helper behavior (5 — Faz 4 follow-up)
 *   - lineFromDraft mapping (PO line → UI draft)
 *   - computeExpectedDate (vendor lead_time + base date → ISO date)
 *   - Source-regex: Revize butonu sadece isSent koşulunda render edilir
 *   - Source-regex: audit timeline render edilir (aria-label sırrı)
 *   - Source-regex: cancel handler 403'te tek toast (eski "if (res.status === 403) toast"
 *     pattern kaldırıldı)
 *
 * Test ortamında JSX render çağrılmaz (DOM yok); davranış pure helper +
 * source-regex pattern'larla doğrulanır (proje paterniyle uyumlu).
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

// ── Mocks for next.js client primitives ───────────────────────

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/ui/Toast", () => ({
    useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/demo-utils", () => ({
    useIsDemo: () => false,
    DEMO_DISABLED_TOOLTIP: "Demo modda devre dışı",
    DEMO_BLOCK_TOAST: { type: "info", message: "Demo modda devre dışı" },
}));

describe("Faz 4 — PO UI module load smoke", () => {
    it("/dashboard/purchase/orders (list) page default export = function component", async () => {
        const mod = await import("@/app/dashboard/purchase/orders/page");
        expect(typeof mod.default).toBe("function");
    });

    it("/dashboard/purchase/orders/new (form) page default export = function component", async () => {
        const mod = await import("@/app/dashboard/purchase/orders/new/page");
        expect(typeof mod.default).toBe("function");
    });

    it("/dashboard/purchase/orders/[id] (detail) page default export = function component", async () => {
        const mod = await import("@/app/dashboard/purchase/orders/[id]/page");
        expect(typeof mod.default).toBe("function");
    });

    it("Sidebar export 'Satın Alma' grubuna 'Satın Alma Siparişleri' linkini içerir", async () => {
        // 2026-05-27: label "Siparişler" → "Satın Alma Siparişleri" (operasyon
        // grubundaki "Satış Siparişleri" ile karışmasın diye net adlandırma).
        const fs = await import("fs/promises");
        const path = await import("path");
        const src = await fs.readFile(
            path.resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
            "utf-8",
        );
        expect(src).toContain('href: "/dashboard/purchase/orders"');
        expect(src).toContain('label: "Satın Alma Siparişleri"');
    });
});

// ── Pure helper behavior (extracted from new page) ────────────

describe("Faz 4 follow-up — lineFromDraft (PO line → UI draft state)", () => {
    it("tüm alanları doğru maps + notes null → '' fallback", async () => {
        const { lineFromDraft } = await import("@/app/dashboard/purchase/orders/new/page");
        const result = lineFromDraft({
            id: "l-1", po_id: "po-1", product_id: "p-1",
            quantity: 10, unit_price: 250.5, discount_pct: 5,
            line_total: 2380, received_qty: 0, notes: null,
        });
        expect(result).toEqual({
            product_id: "p-1", quantity: "10", unit_price: "250.5",
            discount_pct: "5", notes: "",
        });
    });

    it("notes dolu → korunur", async () => {
        const { lineFromDraft } = await import("@/app/dashboard/purchase/orders/new/page");
        const result = lineFromDraft({
            id: "l-1", po_id: "po-1", product_id: "p-1",
            quantity: 1, unit_price: 100, discount_pct: 0,
            line_total: 100, received_qty: 0, notes: "Acil",
        });
        expect(result.notes).toBe("Acil");
    });
});

describe("Faz 4 follow-up — computeExpectedDate (vendor lead_time auto-fill)", () => {
    it("lead_time=10 → bugün + 10 gün", async () => {
        const { computeExpectedDate } = await import("@/app/dashboard/purchase/orders/new/page");
        const base = new Date("2026-05-12T00:00:00Z");
        expect(computeExpectedDate(10, base)).toBe("2026-05-22");
    });

    it("lead_time=null → fallback 14 gün", async () => {
        const { computeExpectedDate } = await import("@/app/dashboard/purchase/orders/new/page");
        const base = new Date("2026-05-12T00:00:00Z");
        expect(computeExpectedDate(null, base)).toBe("2026-05-26");
    });

    it("lead_time=0 → aynı gün", async () => {
        const { computeExpectedDate } = await import("@/app/dashboard/purchase/orders/new/page");
        const base = new Date("2026-05-12T00:00:00Z");
        expect(computeExpectedDate(0, base)).toBe("2026-05-12");
    });
});

// ── Source-regex: UI gap'leri (advisor P2.2 / P2.3 / P3.3) ────

describe("Faz 4 follow-up — detail page UI gap'leri kapandı", () => {
    let detailSrc = "";

    beforeAll(async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        detailSrc = await fs.readFile(
            path.resolve(process.cwd(), "src/app/dashboard/purchase/orders/[id]/page.tsx"),
            "utf-8",
        );
    });

    it("P2.2 — Revize Et butonu sadece isSent koşulunda render edilir", () => {
        expect(detailSrc).toMatch(/\{isSent && \(\s*<button[^]*Revize Et/);
        expect(detailSrc).toContain('doTransition("revise"');
    });

    it("P2.3 — Audit timeline render block mevcut (aria-label: Sipariş aktivite geçmişi)", () => {
        expect(detailSrc).toContain('aria-label="Sipariş aktivite geçmişi"');
        expect(detailSrc).toContain("auditEntries.length > 0");
        // ACTION_LABELS map: tüm PO event türleri kapsanır
        expect(detailSrc).toContain("po_created:");
        expect(detailSrc).toContain("po_revised:");
        expect(detailSrc).toContain("po_cancelled:");
    });

    it("P3.3 — Cancel handler 403'te tek toast (eski çift-toast pattern kaldırıldı)", () => {
        // Eski hatalı pattern: ardışık `toast(...)` çağrısı 403 dalında
        // Yeni: `const msg = res.status === 403 ? ... : ...; toast({...msg});`
        expect(detailSrc).toMatch(/res\.status === 403[^]*?["']Sadece admin kullanıcılar/);
        // Eski "if (res.status === 403) toast" pattern kalmamalı
        expect(detailSrc).not.toMatch(/if \(res\.status === 403\) toast/);
    });
});

describe("Faz 4 follow-up — new page fromDraft preload", () => {
    let newSrc = "";

    beforeAll(async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        newSrc = await fs.readFile(
            path.resolve(process.cwd(), "src/app/dashboard/purchase/orders/new/page.tsx"),
            "utf-8",
        );
    });

    it("P2.1 — useSearchParams 'fromDraft' okuyor + fetch yapıyor", () => {
        expect(newSrc).toContain("useSearchParams");
        expect(newSrc).toContain('searchParams.get("fromDraft")');
        expect(newSrc).toMatch(/fetch\(`\/api\/purchase-orders\/\$\{fromDraftId\}`\)/);
    });

    it("P3.2 — expectedDateDirty dirty-flag pattern kullanılıyor", () => {
        expect(newSrc).toContain("expectedDateDirty");
        expect(newSrc).toContain("setExpectedDateDirty(true)");
    });

    it("Fiyat tutarsızlığı kapandı — handleSubmit price <= 0 reddeder (server semantiği)", () => {
        // Eski `price < 0` (0 geçiyordu) → server validatePoLines `<= 0` ile çelişiyordu.
        expect(newSrc).toContain("price <= 0");
        expect(newSrc).not.toMatch(/price < 0\b/);
    });
});

// ── Final ürün turu — isPoCancellable pure helper ─────────────

describe("isPoCancellable — toplu iptal seçim yüklemi (satış siparişleri paritesi)", () => {
    it("received/cancelled → false (iptal edilemez)", async () => {
        const { isPoCancellable } = await import("@/app/dashboard/purchase/orders/page");
        expect(isPoCancellable({ status: "received" })).toBe(false);
        expect(isPoCancellable({ status: "cancelled" })).toBe(false);
    });

    it("draft/sent/confirmed/partially_received → true (iptal edilebilir)", async () => {
        const { isPoCancellable } = await import("@/app/dashboard/purchase/orders/page");
        expect(isPoCancellable({ status: "draft" })).toBe(true);
        expect(isPoCancellable({ status: "sent" })).toBe(true);
        expect(isPoCancellable({ status: "confirmed" })).toBe(true);
        expect(isPoCancellable({ status: "partially_received" })).toBe(true);
    });
});

// ── Final ürün turu — liste sayfası UI polish (source-regex) ──

describe("Liste sayfası — hover state + toplu-iptal seçim + modal a11y", () => {
    let listSrc = "";

    beforeAll(async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        listSrc = await fs.readFile(
            path.resolve(process.cwd(), "src/app/dashboard/purchase/orders/page.tsx"),
            "utf-8",
        );
    });

    it("hover DOM-mutation antipattern kaldırıldı → hoveredId state", () => {
        expect(listSrc).toContain("const [hoveredId, setHoveredId]");
        expect(listSrc).toContain("setHoveredId(o.id)");
        expect(listSrc).toContain("const isHovered = hoveredId === o.id");
        // Eski doğrudan DOM yazımı kalmamalı
        expect(listSrc).not.toContain("e.currentTarget.style.background");
    });

    it("toplu iptal seçimi yalnız iptal edilebilir PO'larda (cancellablePageIds)", () => {
        expect(listSrc).toContain("const cancellablePageIds = pagedItems.filter(isPoCancellable)");
        expect(listSrc).toContain("toggleAll(cancellablePageIds)");
        expect(listSrc).toContain("isPageAllSelected(cancellablePageIds)");
        // satır checkbox koşullu
        expect(listSrc).toMatch(/\{cancellable && \(\s*<input/);
        // eski pageIds bağımlılığı kalmamalı
        expect(listSrc).not.toContain("toggleAll(pageIds)");
    });

    it("toplu-iptal modalı a11y: role=dialog + aria-modal + aria-labelledby", () => {
        expect(listSrc).toContain('role="dialog" aria-modal="true" aria-labelledby="bulk-cancel-title"');
        expect(listSrc).toContain('id="bulk-cancel-title"');
    });
});

describe("Detay sayfası — iptal modalı aria-labelledby", () => {
    it("dialog aria-labelledby + başlık id eşleşir", async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        const detailSrc = await fs.readFile(
            path.resolve(process.cwd(), "src/app/dashboard/purchase/orders/[id]/page.tsx"),
            "utf-8",
        );
        expect(detailSrc).toContain('aria-labelledby="po-cancel-title"');
        expect(detailSrc).toContain('id="po-cancel-title"');
    });
});

// ── Final ürün turu — formatExpectedDate pure helper ──────────

describe("formatExpectedDate — ISO → tr-TR (DD.MM.YYYY)", () => {
    it("dolu ISO tarih → tr-TR formatı", async () => {
        const { formatExpectedDate } = await import("@/app/dashboard/purchase/orders/page");
        // tr-TR locale gün.ay.yıl → "15.05.2026"
        expect(formatExpectedDate("2026-05-15")).toBe("15.05.2026");
    });

    it("null → '—' (ham ISO basılmaz)", async () => {
        const { formatExpectedDate } = await import("@/app/dashboard/purchase/orders/page");
        expect(formatExpectedDate(null)).toBe("—");
    });

    it("UTC midnight ile gün kayması yok (ayın ilk günü)", async () => {
        const { formatExpectedDate } = await import("@/app/dashboard/purchase/orders/page");
        // +"T00:00:00Z" olmadan yerel TZ bir önceki güne kaydırabilirdi
        expect(formatExpectedDate("2026-01-01")).toBe("01.01.2026");
    });
});

// ── Final ürün turu — sessiz yükleme hatası → görünür error state ──

describe("Liste sayfası — loadOrders sessiz hata yutmuyor (loadError state)", () => {
    let listSrc = "";

    beforeAll(async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        listSrc = await fs.readFile(
            path.resolve(process.cwd(), "src/app/dashboard/purchase/orders/page.tsx"),
            "utf-8",
        );
    });

    it("loadError state + !ordersRes.ok → setLoadError(true) + early return", () => {
        expect(listSrc).toContain("const [loadError, setLoadError]");
        expect(listSrc).toMatch(/if \(!ordersRes\.ok\) \{\s*setLoadError\(true\);\s*return;/);
        // Eski sessiz "if (ordersRes.ok)" sarması kalmamalı
        expect(listSrc).not.toContain("if (ordersRes.ok) {");
    });

    it("error banner: role=alert + Yeniden dene + empty state'ten ayrı dal", () => {
        expect(listSrc).toMatch(/loadError \?[^]*role="alert"/);
        expect(listSrc).toContain("Yeniden dene");
        expect(listSrc).toContain("Siparişler yüklenemedi");
        // empty state ("Henüz sipariş yok") artık loadError dalından SONRA gelir
        expect(listSrc).toMatch(/loadError \?[^]*filtered\.length === 0 \?/);
    });

    it("expected_date hücresi formatExpectedDate ile (ham ISO değil)", () => {
        expect(listSrc).toContain("formatExpectedDate(o.expected_date)");
        expect(listSrc).not.toContain("{o.expected_date ?? \"—\"}");
    });
});

describe("New form — loadData sessiz hata yutmuyor (loadError state)", () => {
    let newSrc = "";

    beforeAll(async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        newSrc = await fs.readFile(
            path.resolve(process.cwd(), "src/app/dashboard/purchase/orders/new/page.tsx"),
            "utf-8",
        );
    });

    it("loadError state + (!vRes.ok || !pRes.ok) → setLoadError(true)", () => {
        expect(newSrc).toContain("const [loadError, setLoadError]");
        expect(newSrc).toMatch(/if \(!vRes\.ok \|\| !pRes\.ok\) \{\s*setLoadError\(true\);\s*return;/);
        // Eski sessiz "if (vRes.ok)" / "if (pRes.ok)" yutma kalmamalı
        expect(newSrc).not.toContain("if (vRes.ok) setVendors");
        expect(newSrc).not.toContain("if (pRes.ok) setProducts");
    });

    it("error banner: role=alert + Yeniden dene → loadData refetch", () => {
        expect(newSrc).toMatch(/loadError && \(/);
        expect(newSrc).toContain('role="alert"');
        expect(newSrc).toContain("Form verileri yüklenemedi");
        expect(newSrc).toMatch(/Yeniden dene[^]*<\/button>/);
        expect(newSrc).toContain("void loadData()");
    });
});

describe("Detay sayfası — expected_date formatExpectedDate", () => {
    it("ham ISO yerine tr-TR helper kullanılır", async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        const detailSrc = await fs.readFile(
            path.resolve(process.cwd(), "src/app/dashboard/purchase/orders/[id]/page.tsx"),
            "utf-8",
        );
        expect(detailSrc).toContain("formatExpectedDate(po.expected_date)");
        expect(detailSrc).not.toContain("Beklenen: {po.expected_date ?? \"—\"}");
    });
});

// ── Final ürün turu — ürün seçilince birim fiyat auto-fill + KDV kırılımı ──

describe("pickPurchaseUnitPrice — satın alma birim fiyat önerisi (cost_price)", () => {
    it("cost_price dolu → String(cost_price)", async () => {
        const { pickPurchaseUnitPrice } = await import("@/app/dashboard/purchase/orders/new/page");
        expect(pickPurchaseUnitPrice({ cost_price: 420 })).toBe("420");
        expect(pickPurchaseUnitPrice({ cost_price: 9.5 })).toBe("9.5");
    });

    it("cost_price null → '' (kullanıcı elle girer; price fallback YOK)", async () => {
        const { pickPurchaseUnitPrice } = await import("@/app/dashboard/purchase/orders/new/page");
        expect(pickPurchaseUnitPrice({ cost_price: null })).toBe("");
    });

    it("cost_price 0 → '0' (sıfır geçerli sayı, null'dan farklı)", async () => {
        const { pickPurchaseUnitPrice } = await import("@/app/dashboard/purchase/orders/new/page");
        expect(pickPurchaseUnitPrice({ cost_price: 0 })).toBe("0");
    });
});

describe("computePoTotals — ara toplam / iskonto / KDV %20 / genel toplam", () => {
    it("tek satır, iskontosuz", async () => {
        const { computePoTotals } = await import("@/app/dashboard/purchase/orders/new/page");
        const r = computePoTotals([{ product_id: "p", quantity: "2", unit_price: "100", discount_pct: "0", notes: "" }]);
        expect(r).toEqual({ subtotal: 200, discount: 0, vat: 40, grand: 240 });
    });

    it("iskontolu satır → discount + KDV iskonto sonrası matrahtan", async () => {
        const { computePoTotals } = await import("@/app/dashboard/purchase/orders/new/page");
        // gross 100, %10 iskonto → subtotal 90, KDV 18, grand 108
        const r = computePoTotals([{ product_id: "p", quantity: "1", unit_price: "100", discount_pct: "10", notes: "" }]);
        expect(r).toEqual({ subtotal: 90, discount: 10, vat: 18, grand: 108 });
    });

    it("çok satır → toplanır", async () => {
        const { computePoTotals } = await import("@/app/dashboard/purchase/orders/new/page");
        const r = computePoTotals([
            { product_id: "a", quantity: "2", unit_price: "100", discount_pct: "0", notes: "" },
            { product_id: "b", quantity: "1", unit_price: "50", discount_pct: "0", notes: "" },
        ]);
        expect(r.subtotal).toBe(250);
        expect(r.vat).toBe(50);
        expect(r.grand).toBe(300);
    });

    it("qty=0 / price geçersiz satır atlanır (mevcut grandTotal davranışı)", async () => {
        const { computePoTotals } = await import("@/app/dashboard/purchase/orders/new/page");
        const r = computePoTotals([
            { product_id: "a", quantity: "0", unit_price: "100", discount_pct: "0", notes: "" },
            { product_id: "b", quantity: "1", unit_price: "abc", discount_pct: "0", notes: "" },
            { product_id: "c", quantity: "1", unit_price: "100", discount_pct: "0", notes: "" },
        ]);
        expect(r.subtotal).toBe(100);
        expect(r.grand).toBe(120);
    });

    it("boş liste → tümü 0", async () => {
        const { computePoTotals } = await import("@/app/dashboard/purchase/orders/new/page");
        expect(computePoTotals([])).toEqual({ subtotal: 0, discount: 0, vat: 0, grand: 0 });
    });
});

describe("New form — ürün seçimi unit_price auto-fill + currency uyarı + KDV kırılımı (source-regex)", () => {
    let newSrc = "";

    beforeAll(async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        newSrc = await fs.readFile(
            path.resolve(process.cwd(), "src/app/dashboard/purchase/orders/new/page.tsx"),
            "utf-8",
        );
    });

    it("ürün <select> onChange → handleProductSelect (eski salt product_id set kalmadı)", () => {
        expect(newSrc).toContain("onChange={e => handleProductSelect(idx, e.target.value)}");
        // handleProductSelect product_id + unit_price birlikte set eder
        expect(newSrc).toMatch(/handleProductSelect = \(idx: number, productId: string\) => \{/);
        expect(newSrc).toContain("unit_price: product ? pickPurchaseUnitPrice(product) : \"\"");
        // eski salt-product_id onChange kalmamalı
        expect(newSrc).not.toContain("onChange={e => updateLine(idx, { product_id: e.target.value })}");
    });

    it("currency mismatch inline uyarı (product.currency !== currency)", () => {
        expect(newSrc).toContain("sel.currency === currency");
        expect(newSrc).toContain("var(--warning-text)");
        expect(newSrc).toMatch(/Ürün fiyatı \{sel\.currency\} cinsinden/);
    });

    it("KDV kırılımı: Ara Toplam + KDV (%20) + Genel Toplam (totals helper'dan)", () => {
        expect(newSrc).toContain("const totals = useMemo(() => computePoTotals(lines)");
        expect(newSrc).toContain("Ara Toplam:");
        expect(newSrc).toContain("KDV (%20):");
        // Kaydedilmemiş form = tahmin; sunucu RPC otoritatif → "Tahmini" çerçevesi korunur.
        expect(newSrc).toContain("Tahmini Genel Toplam (KDV dahil):");
        expect(newSrc).toContain("totals.vat.toLocaleString");
        expect(newSrc).toContain("totals.grand.toLocaleString");
        // eski tek-satır grandTotal kaldırıldı
        expect(newSrc).not.toContain("grandTotal.toLocaleString");
    });
});

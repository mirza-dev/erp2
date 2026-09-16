/**
 * 2026-09-16 — RBAC "named" artıkların yapısal kapanışı.
 *
 * (1) PO print sayfası (`purchase/orders/[id]/print`) veriyi route'tan DEĞİL doğrudan
 *     DB'den çeker → route katmanının guard'ı ve redaksiyonu orada geçerli değildi. Bugün
 *     sızmıyordu, çünkü o rotaya girebilen üç rol de `view_purchase_costs` taşıyor —
 *     matris tesadüfü. Artık sayfanın kendisi guard + redaksiyon yapar; bu dosya onu kilitler.
 * (2) `formatPoCurrency(null)` "₺0,00" basıyordu (`Number(null)` tuzağı) → redaksiyon
 *     gelince "yetkin yok" yerine "sıfır" gösterilirdi. Şimdi "—"; sıfır ise gerçek değer.
 * (3) Teklif preview sayfası: "server-side preview redaction" takibi konusuz — sayfa saf
 *     istemci, yalnız localStorage okur, sunucudan teklif çekmez. Bu kilit, ileride birinin
 *     sayfaya sunucu fetch'i eklemesini (ve redaksiyonu atlamasını) görünür kılar.
 *
 * Kaynak iddiaları yorumları soyulmuş metinde ve gövdeye bağlı (satır yorumu ÖNCE, blok
 * yorumu SONRA soyulur — `//` içindeki `/*` blok başlangıcı sanılmasın).
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
        React.createElement("a", { href, ...rest }, children),
}));

const code = (src: string) =>
    src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const PRINT = code(read("src/app/dashboard/purchase/orders/[id]/print/page.tsx"));
const PREVIEW = code(read("src/app/dashboard/quotes/preview/page.tsx"));

describe("PO print sayfası — guard + redaksiyon sayfanın KENDİSİNDE (matris tesadüfüne bağlı değil)", () => {
    it("resolveAuthContext çözülür ve view_purchase_orders yoksa notFound — DB okumasından ÖNCE", () => {
        const ctxAt = PRINT.search(/const ctx = await resolveAuthContext\(\)/);
        const gateAt = PRINT.search(/if \(!ctx\.perms\.has\("view_purchase_orders"\)\) return notFound\(\)/);
        const fetchAt = PRINT.search(/await dbGetPurchaseOrderById\(/);
        expect(ctxAt, "resolveAuthContext çağrısı yok").toBeGreaterThan(-1);
        expect(gateAt, "view_purchase_orders kapısı yok").toBeGreaterThan(ctxAt);
        expect(fetchAt, "PO okuması yok").toBeGreaterThan(gateAt);
    });

    it("belgeye HAM po değil redakte edilmiş kopya gider", () => {
        expect(PRINT).toMatch(/const printable = redactPurchaseOrderForPerms\(po, ctx\.perms\)/);
        // <PurchaseOrderDocument …> etiketinin kendi gövdesinde po={printable}; po={po} YOK.
        const tag = PRINT.match(/<PurchaseOrderDocument(?:(?!\/>)[\s\S])*?\/>/);
        expect(tag, "PurchaseOrderDocument etiketi bulunamadı").not.toBeNull();
        expect(tag![0]).toMatch(/\bpo=\{printable\}/);
        expect(tag![0]).not.toMatch(/\bpo=\{po\}/);
    });
});

describe("formatPoCurrency — null 'yetkin yok', sıfır 'ölçülmüş değer'", () => {
    it("null / undefined → '—' (₺0,00 DEĞİL)", async () => {
        const { formatPoCurrency } = await import("@/lib/po-document-helpers");
        expect(formatPoCurrency(null, "TRY")).toBe("—");
        expect(formatPoCurrency(undefined, "USD")).toBe("—");
    });

    it("0 → '0,00' (sıfır gerçek bir tutardır, tire değil)", async () => {
        const { formatPoCurrency } = await import("@/lib/po-document-helpers");
        expect(formatPoCurrency(0, "TRY")).toContain("0,00");
        expect(formatPoCurrency(0, "TRY")).not.toBe("—");
    });
});

describe("PurchaseOrderDocument — redakte PO'da tutarlar '—', hiçbir yerde sahte 0,00 yok", () => {
    it("view_purchase_costs olmayan perms ile redakte edilmiş PO render: '—' var, '0,00' yok", async () => {
        const { redactPurchaseOrderForPerms } = await import("@/lib/auth/redact");
        const { default: PurchaseOrderDocument } = await import("@/components/purchase/PurchaseOrderDocument");
        const po = {
            id: "po-1", po_number: "PO-2026-0900", vendor_id: "v-1", status: "confirmed" as const,
            order_date: "2026-09-01", expected_date: "2026-09-10", currency: "TRY",
            subtotal: 9750, vat_rate: 20, vat_total: 1950, grand_total: 11700, notes: null,
            sent_at: null, confirmed_at: "2026-09-01T10:00:00Z", cancelled_at: null, cancel_reason: null,
            created_by: "u", created_at: "2026-09-01T09:00:00Z", updated_at: "2026-09-01T09:00:00Z",
            lines: [{ id: "l-1", po_id: "po-1", product_id: "p-1", quantity: 100, unit_price: 50,
                      discount_pct: 0, line_total: 5000, received_qty: 0, notes: null }],
        };
        // Anti-vakum: redaksiyon gerçekten null'lıyor mu? (perms boş → view_purchase_costs yok)
        const redacted = redactPurchaseOrderForPerms(po, new Set());
        expect(redacted.grand_total).toBeNull();
        expect(redacted.lines[0].unit_price).toBeNull();

        const html = renderToStaticMarkup(React.createElement(PurchaseOrderDocument, {
            po: redacted, vendor: null, company: null, products: [{ id: "p-1", sku: "GV-DN50", name: "Gate Valve", unit: "adet" }],
        }));
        expect(html).not.toMatch(/0,00/);
        expect(html).toContain("—");
        // Kontrol: aynı PO redaksiyonsuz render edilince tutarlar basılır (kural vakum değil).
        const full = renderToStaticMarkup(React.createElement(PurchaseOrderDocument, {
            po, vendor: null, company: null, products: [],
        }));
        expect(full).toMatch(/11\.700,00/);
    });
});

describe("Teklif preview sayfası — sunucu fetch'i YOK, redaksiyon konusu doğmaz", () => {
    it("saf istemci + yalnız localStorage; /api/quotes GET veya dbGet* importu yok", () => {
        expect(PREVIEW).toMatch(/^\s*"use client";/);
        expect(PREVIEW).toMatch(/localStorage\.getItem\("teklif_v3_full"\)/);
        // Tek fetch: preview-pdf POST (istemcinin kendi verdiğini basar). Başka /api/quotes yolu yok.
        const fetches = Array.from(PREVIEW.matchAll(/fetch\(\s*["'`]([^"'`]+)["'`]/g), m => m[1]);
        expect(fetches).toEqual(["/api/quotes/preview-pdf"]);
        expect(PREVIEW).not.toMatch(/@\/lib\/supabase\//);
        expect(PREVIEW).not.toMatch(/useSearchParams|useParams/);
    });
});

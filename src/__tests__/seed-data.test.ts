/**
 * Senaryosal seed verisi tutarlılık kilitleri (DB'siz, saf).
 *
 * Amaç: seed her değiştiğinde senaryo kapsamı sessizce bozulmasın —
 * SKU çözünürlüğü, 8 ürün tipi kapsamı, attributes↔057 field_key uyumu,
 * KDV %20 formülleri, enum geçerlilikleri ve alert-senaryo garantileri.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
    PRODUCT_TYPE_IDS,
    SEED_VENDORS, SEED_PRODUCTS, SEED_CUSTOMERS, SEED_QUOTES, SEED_ORDERS,
    SEED_POS, SEED_COMMITMENTS, SEED_BOM, SEED_PRODUCTION,
    SEED_LOCATION_BALANCES, SEED_VENDOR_LINKS, SEED_EMAIL_LOGS,
    SEED_IMPORT_DOCUMENTS, SEED_DEMO_USERS, SEED_COMPANY,
    orderTotals, quoteTotals, poTotals, round2, VAT_RATE,
    type ProductTypeKey,
} from "@/lib/seed/seed-data";
import { ROLES } from "@/lib/auth/permissions";

const SKUS = new Set(SEED_PRODUCTS.map(p => p.sku));
const CUSTOMER_NAMES = new Set(SEED_CUSTOMERS.map(c => c.name));
const VENDOR_NAMES = new Set(SEED_VENDORS.map(v => v.name));
const QUOTE_NUMBERS = new Set(SEED_QUOTES.map(q => q.quoteNumber));

describe("seed-data — referans bütünlüğü", () => {
    it("tüm sipariş/teklif/PO/BOM/taahhüt/bakiye/bağ satır SKU'ları kataloğa çözülür", () => {
        const used = [
            ...SEED_ORDERS.flatMap(o => o.lines.map(l => l.sku)),
            ...SEED_QUOTES.flatMap(q => q.lines.map(l => l.sku)),
            ...SEED_POS.flatMap(p => p.lines.map(l => l.sku)),
            ...SEED_COMMITMENTS.map(c => c.sku),
            ...SEED_BOM.flatMap(b => [b.finished, b.component]),
            ...SEED_PRODUCTION.map(e => e.sku),
            ...SEED_LOCATION_BALANCES.map(b => b.sku),
            ...SEED_VENDOR_LINKS.map(l => l.sku),
        ];
        const unknown = used.filter(sku => !SKUS.has(sku));
        expect(unknown).toEqual([]);
    });

    it("tüm sipariş/teklif müşterileri ve PO/bağ tedarikçileri tanımlı", () => {
        expect(SEED_ORDERS.filter(o => !CUSTOMER_NAMES.has(o.customerName))).toEqual([]);
        expect(SEED_QUOTES.filter(q => !CUSTOMER_NAMES.has(q.customerName))).toEqual([]);
        expect(SEED_POS.filter(p => !VENDOR_NAMES.has(p.vendorName))).toEqual([]);
        expect(SEED_VENDOR_LINKS.filter(l => !VENDOR_NAMES.has(l.vendor))).toEqual([]);
    });

    it("siparişlerin quote referansları tanımlı tekliflere işaret eder", () => {
        const refs = SEED_ORDERS.map(o => o.quoteNumber).filter((x): x is string => !!x);
        expect(refs.filter(r => !QUOTE_NUMBERS.has(r))).toEqual([]);
    });

    it("SKU'lar ve sipariş/teklif/PO numaraları benzersiz", () => {
        expect(SKUS.size).toBe(SEED_PRODUCTS.length);
        expect(new Set(SEED_ORDERS.map(o => o.orderNumber)).size).toBe(SEED_ORDERS.length);
        expect(QUOTE_NUMBERS.size).toBe(SEED_QUOTES.length);
        expect(new Set(SEED_POS.map(p => p.poNumber)).size).toBe(SEED_POS.length);
    });
});

describe("seed-data — ürün tipleri (056/057)", () => {
    it("8 ürün tipinin TAMAMI en az bir ürünle kapsanır", () => {
        const covered = new Set(SEED_PRODUCTS.map(p => p.type_key));
        expect([...covered].sort()).toEqual(
            (Object.keys(PRODUCT_TYPE_IDS) as ProductTypeKey[]).sort(),
        );
    });

    it("attributes anahtarları 057 migration'daki tip field_key'leriyle uyumlu", () => {
        const sql = readFileSync("supabase/migrations/057_seed_product_types.sql", "utf8");
        const keysByTypeId = new Map<string, Set<string>>();
        // satır formatı: ('00000000-0000-4000-8000-00000000000X'::uuid, 'field_key', ...
        const re = /\('(00000000-0000-4000-8000-00000000000\d)'::uuid,\s*'([a-z_0-9]+)'/g;
        for (const m of sql.matchAll(re)) {
            if (!keysByTypeId.has(m[1])) keysByTypeId.set(m[1], new Set());
            keysByTypeId.get(m[1])!.add(m[2]);
        }
        for (const p of SEED_PRODUCTS) {
            const allowed = keysByTypeId.get(PRODUCT_TYPE_IDS[p.type_key]) ?? new Set();
            const bad = Object.keys(p.attributes).filter(k => !allowed.has(k));
            expect(bad, `${p.sku} (${p.type_key}) geçersiz attribute`).toEqual([]);
        }
    });
});

describe("seed-data — hesap formülleri (KDV %20 domain kuralı)", () => {
    it("orderTotals: subtotal=Σ(qty·price·(1-disc)), KDV iskonto-sonrası bazdan", () => {
        const o = SEED_ORDERS.find(x => x.orderNumber === "ORD-2026-0001")!;
        const t = orderTotals(o);
        const expectedSub = round2(o.lines.reduce((s, l) => s + l.qty * l.price * (1 - l.disc / 100), 0));
        expect(t.subtotal).toBe(expectedSub);
        expect(t.vatTotal).toBe(round2(expectedSub * VAT_RATE));
        expect(t.grandTotal).toBe(round2(expectedSub + t.vatTotal));
    });

    it("quoteTotals: iskontolu teklifte KDV (subtotal - discount) üzerinden", () => {
        const q = SEED_QUOTES.find(x => x.discountAmount > 0)!;
        const t = quoteTotals(q);
        const sub = round2(q.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
        expect(t.vatTotal).toBe(round2((sub - q.discountAmount) * VAT_RATE));
    });

    it("poTotals tutarlı", () => {
        for (const p of SEED_POS) {
            const t = poTotals(p);
            expect(t.grandTotal).toBe(round2(t.subtotal + t.vatTotal));
        }
    });
});

describe("seed-data — enum geçerlilikleri", () => {
    it("sipariş çift ekseni geçerli kombinasyonlarda", () => {
        const commercial = new Set(["draft", "pending_approval", "approved", "cancelled"]);
        const fulfillment = new Set(["unallocated", "partially_allocated", "allocated", "shipped"]);
        for (const o of SEED_ORDERS) {
            expect(commercial.has(o.commercial)).toBe(true);
            expect(fulfillment.has(o.fulfillment)).toBe(true);
            // draft/cancelled fiziksel akışta olamaz
            if (o.commercial === "draft" || o.commercial === "cancelled") {
                expect(o.fulfillment).toBe("unallocated");
            }
        }
    });

    it("teklif/PO statüleri ve para birimleri DB CHECK'leriyle uyumlu", () => {
        const qs = new Set(["draft", "sent", "accepted", "rejected", "expired", "revised"]);
        const pos = new Set(["draft", "sent", "confirmed", "partially_received", "received", "cancelled"]);
        const cur = new Set(["TRY", "USD", "EUR"]);
        for (const q of SEED_QUOTES) { expect(qs.has(q.status)).toBe(true); expect(cur.has(q.currency)).toBe(true); }
        for (const p of SEED_POS) {
            expect(pos.has(p.status)).toBe(true);
            for (const l of p.lines) expect(l.receivedQty).toBeLessThanOrEqual(l.qty);
        }
    });
});

describe("seed-data — senaryo kilitleri (alerts/scan 7 tipi üretebilmeli)", () => {
    it("CRITICAL: en az bir ürün available ≤ min", () => {
        expect(SEED_PRODUCTS.some(p => p.on_hand - p.reserved <= p.min_stock_level && p.min_stock_level > 0)).toBe(true);
    });

    it("WARNING bandı: en az bir ürün min < available ≤ ceil(min×1.5)", () => {
        expect(SEED_PRODUCTS.some(p => {
            const avail = p.on_hand - p.reserved;
            return avail > p.min_stock_level && avail <= Math.ceil(p.min_stock_level * 1.5);
        })).toBe(true);
    });

    it("FİYAT EKSİK: en az bir ürün price=null", () => {
        expect(SEED_PRODUCTS.some(p => p.price === null)).toBe(true);
    });

    it("SHORTAGE: en az bir partially_allocated sipariş satırı stoğu aşar", () => {
        const byNum = new Map(SEED_PRODUCTS.map(p => [p.sku, p]));
        const has = SEED_ORDERS.some(o =>
            o.fulfillment === "partially_allocated" &&
            o.lines.some(l => l.qty > (byNum.get(l.sku)?.on_hand ?? 0)));
        expect(has).toBe(true);
    });

    it("OVERDUE SHIPMENT: approved+allocated+planned geçmiş sipariş var", () => {
        const today = new Date().toISOString().slice(0, 10);
        expect(SEED_ORDERS.some(o =>
            o.commercial === "approved" && o.fulfillment !== "shipped" &&
            !!o.plannedShipmentDate && o.plannedShipmentDate < today)).toBe(true);
    });

    it("QUOTE EXPIRED iki eksen: pending sipariş geçmiş vade + V7 sent geçmiş valid_until", () => {
        const today = new Date().toISOString().slice(0, 10);
        expect(SEED_ORDERS.some(o =>
            o.commercial === "pending_approval" &&
            !!o.quoteValidUntil && o.quoteValidUntil < today)).toBe(true);
        expect(SEED_QUOTES.some(q =>
            q.status === "sent" && !!q.validUntil && q.validUntil < today)).toBe(true);
    });

    it("PO OVERDUE: sent + expected_date geçmiş PO var", () => {
        const today = new Date().toISOString().slice(0, 10);
        expect(SEED_POS.some(p =>
            ["sent", "confirmed", "partially_received"].includes(p.status) &&
            !!p.expectedDate && p.expectedDate < today)).toBe(true);
    });

    it("revizyon zinciri tutarlı: rev>1 root'a işaret eder, root 'revised'", () => {
        for (const q of SEED_QUOTES) {
            if (q.revisionNo > 1) {
                expect(q.rootQuoteNumber).toBeTruthy();
                const root = SEED_QUOTES.find(x => x.quoteNumber === q.rootQuoteNumber);
                expect(root, `${q.quoteNumber} root eksik`).toBeTruthy();
                expect(root!.status).toBe("revised");
            }
        }
        expect(SEED_QUOTES.some(q => q.revisionNo > 1)).toBe(true);
    });

    it("accepted teklifin bağlı (convert) siparişi var; sent tekliflerin pending siparişi var (088)", () => {
        const accepted = SEED_QUOTES.filter(q => q.status === "accepted");
        expect(accepted.length).toBeGreaterThan(0);
        for (const q of accepted) {
            const order = SEED_ORDERS.find(o => o.quoteNumber === q.quoteNumber);
            expect(order, `${q.quoteNumber} bağlı sipariş yok`).toBeTruthy();
            expect(order!.commercial).toBe("approved");
            expect(order!.sourceQuoteRevisionNo).toBe(q.revisionNo);
        }
        // 088: geçerli (süresi geçmemiş) sent teklif → pending_approval bağlı sipariş
        const today = new Date().toISOString().slice(0, 10);
        const validSent = SEED_QUOTES.filter(q =>
            q.status === "sent" && (!q.validUntil || q.validUntil >= today));
        for (const q of validSent) {
            const order = SEED_ORDERS.find(o => o.quoteNumber === q.quoteNumber);
            expect(order, `${q.quoteNumber} (sent) bağlı pending sipariş yok`).toBeTruthy();
            expect(order!.commercial).toBe("pending_approval");
        }
    });

    it("depo bakiyeleri ürün stoğunu aşmaz (084 tutarlılığı)", () => {
        const byNum = new Map(SEED_PRODUCTS.map(p => [p.sku, p]));
        const sums = new Map<string, number>();
        for (const b of SEED_LOCATION_BALANCES) {
            sums.set(b.sku, (sums.get(b.sku) ?? 0) + b.quantity);
        }
        for (const [sku, total] of sums) {
            expect(total, `${sku} bakiye toplamı stok üstünde`).toBeLessThanOrEqual(byNum.get(sku)!.on_hand);
        }
    });

    it("import belgelerindeki matched satırlar kataloğa çözülür; new_product satırı var", () => {
        const allLines = SEED_IMPORT_DOCUMENTS.flatMap(d => d.lines);
        for (const l of allLines) {
            if (l.matchSku) expect(SKUS.has(l.matchSku)).toBe(true);
        }
        expect(allLines.some(l => l.matchAction === "new_product" && !!l.extractedSku)).toBe(true);
    });

    it("e-posta retry senaryosu: failed + gövde snapshot'lı kayıt var (096)", () => {
        expect(SEED_EMAIL_LOGS.some(e => e.status === "failed" && e.withBodySnapshot)).toBe(true);
    });
});

describe("seed-data — dış dünyaya sıfır etki garantileri", () => {
    it("tüm müşteri/tedarikçi e-postaları RFC 2606 example.com veya .test", () => {
        for (const c of SEED_CUSTOMERS) expect(c.email).toMatch(/@[a-z0-9.-]+\.example\.com$/);
        for (const v of SEED_VENDORS) expect(v.contact_email).toMatch(/@[a-z0-9.-]+\.example\.com$/);
        for (const e of SEED_EMAIL_LOGS) expect(e.recipient).toMatch(/(\.example\.com|\.test)$/);
        expect(SEED_COMPANY.email).toMatch(/\.example\.com$/);
    });

    it("seed-runner e-posta/Paraşüt/AI servislerini import ETMEZ (kaynak kilidi)", () => {
        const src = readFileSync("src/lib/seed/seed-runner.ts", "utf8");
        const imports = src.split("\n").filter(l => /^\s*import\b|require\(/.test(l)).join("\n");
        expect(imports).not.toMatch(/email-service|resend|nodemailer/i);
        expect(imports).not.toMatch(/parasut/i);
        expect(imports).not.toMatch(/anthropic|ai-service/i);
        // gönderim fonksiyonu hiçbir yerde çağrılmaz
        expect(src).not.toMatch(/sendDirectEmail\s*\(/);
    });

    it("seed route thin orchestrator: auth sözleşmesi korunur (CRON_SECRET + admin)", () => {
        const src = readFileSync("src/app/api/seed/route.ts", "utf8");
        expect(src).toContain("CRON_SECRET");
        expect(src).toContain('includes("admin")');
        expect(src).toContain("clearAllData");
        expect(src).toContain("runSeed");
    });

    it("demo şifre koda yazılmaz — env'den okunur (kaynak kilidi)", () => {
        const runner = readFileSync("src/lib/seed/seed-runner.ts", "utf8");
        expect(runner).toContain("process.env.SEED_DEMO_PASSWORD");
        // runner'da literal şifre ataması yok — yalnız env değişkeni geçirilir
        expect(runner).toMatch(/password:\s*demoPassword/);
        expect(runner).not.toMatch(/password:\s*["'`]/);
        const data = readFileSync("src/lib/seed/seed-data.ts", "utf8");
        expect(data).not.toMatch(/password\s*[:=]\s*["'`]/i);
    });

    it("demo kullanıcı rolleri permissions.ts ROLES ile birebir uyumlu", () => {
        for (const u of SEED_DEMO_USERS) {
            expect((ROLES as readonly string[]).includes(u.role)).toBe(true);
            expect(u.email.endsWith("@pmt-demo.test")).toBe(true);
        }
        expect(new Set(SEED_DEMO_USERS.map(u => u.role)).size).toBe(ROLES.length);
    });

    it("storage yazımları demo/ prefix'iyle sınırlı (temizlik kullanıcı dosyasına dokunmaz)", () => {
        const src = readFileSync("src/lib/seed/seed-runner.ts", "utf8");
        expect(src).toContain('const SEED_STORAGE_PREFIX = "demo"');
        expect(src).toContain("${SEED_STORAGE_PREFIX}/");
    });
});

describe("seed-runner — FK silme sırası kilitleri", () => {
    const runner = readFileSync("src/lib/seed/seed-runner.ts", "utf8");
    const order = (name: string) => runner.indexOf(`"${name}",`);

    it("alt tablolar üst tablolardan ÖNCE silinir", () => {
        expect(order("po_line_recommendations")).toBeLessThan(order("purchase_order_lines"));
        expect(order("purchase_order_lines")).toBeLessThan(order("purchase_orders"));
        expect(order("purchase_orders")).toBeLessThan(order("vendors"));
        expect(order("po_line_recommendations")).toBeLessThan(order("ai_recommendations"));
        expect(order("import_document_lines")).toBeLessThan(order("import_documents"));
        expect(order("quote_pdf_archives")).toBeLessThan(order("quotes"));
        expect(order("quote_line_items")).toBeLessThan(order("quotes"));
        expect(order("order_lines")).toBeLessThan(order("sales_orders"));
        expect(order("product_attachments")).toBeLessThan(order("products"));
        expect(order("product_vendor_links")).toBeLessThan(order("products"));
        expect(order("stock_location_balances")).toBeLessThan(order("products"));
    });

    it("note_templates ve product_types silme listesinde YOK (sistem verisi)", () => {
        expect(runner).not.toContain('"note_templates"');
        expect(runner).not.toContain('"product_types"');
        expect(runner).not.toContain('"product_type_fields"');
    });
});

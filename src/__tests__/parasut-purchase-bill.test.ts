/**
 * Faz 13 — alış tarafı: PO → Paraşüt alış faturası.
 *
 * NEDEN VAR: Faz 1-11 boyunca Paraşüt'e YALNIZ satış gidiyordu. `vendors` ve
 * `purchase_orders` tablolarında tek bir `parasut_*` kolonu yoktu → alış
 * faturası hiç oluşmuyor, **indirilecek KDV** muhasebeye ulaşmıyordu.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import {
    poLineVatRate,
    poLineNetTotal,
    purchaseBillDescription,
    computePoDueDate,
    classifyAndPatchPo,
} from "@/lib/services/parasut-purchase-service";
import { ParasutError } from "@/lib/parasut-adapter";
import { assertPurchaseBillStockInvariant } from "@/lib/parasut-http-adapter";
import type { PurchaseBillInput } from "@/lib/parasut-adapter";

const MIG = readFileSync("supabase/migrations/107_parasut_purchase_bills.sql", "utf8");
const SVC = readFileSync("src/lib/services/parasut-purchase-service.ts", "utf8");
const PO_SVC = readFileSync("src/lib/services/purchase-order-service.ts", "utf8");

// ── Satır bazlı KDV ──────────────────────────────────────────────────────────

describe("poLineVatRate — karışık KDV oranı", () => {
    it("satır oranı varsa o kullanılır (yüzde birimi)", () => {
        expect(poLineVatRate({ vat_rate: 10 }, { vat_rate: 0.2 })).toBe(10);
        expect(poLineVatRate({ vat_rate: 0 },  { vat_rate: 0.2 })).toBe(0);
    });

    it("satır oranı NULL ise BAŞLIK oranına düşer — eski PO'lar aynen çalışır", () => {
        // purchase_orders.vat_rate ORAN (0.20), satır YÜZDE (20) tutar.
        expect(poLineVatRate({ vat_rate: null },      { vat_rate: 0.2 })).toBe(20);
        expect(poLineVatRate({ vat_rate: undefined }, { vat_rate: 0.1 })).toBe(10);
    });

    it("ondalık başlık oranı doğru yüzdeye çevrilir (float artığı yok)", () => {
        expect(poLineVatRate({ vat_rate: null }, { vat_rate: 0.18 })).toBe(18);
        expect(poLineVatRate({ vat_rate: null }, { vat_rate: 0.01 })).toBe(1);
    });

    it("başlık oranı da yoksa %20'ye düşer (domain varsayılanı)", () => {
        expect(poLineVatRate({ vat_rate: null }, { vat_rate: undefined as unknown as number })).toBe(20);
    });
});

describe("poLineNetTotal", () => {
    it("iskonto uygulanmış net tutar", () => {
        expect(poLineNetTotal({ quantity: 10, unit_price: 100, discount_pct: 0 })).toBe(1000);
        expect(poLineNetTotal({ quantity: 10, unit_price: 100, discount_pct: 10 })).toBe(900);
    });
});

// ── Vade ─────────────────────────────────────────────────────────────────────

describe("computePoDueDate", () => {
    it("vade gününü ekler (UTC-güvenli — gün kayması yok)", () => {
        expect(computePoDueDate("2026-08-28", 30)).toBe("2026-09-27");
        expect(computePoDueDate("2026-12-20", 30)).toBe("2027-01-19");
    });

    it("0 gün → aynı gün (peşin alım)", () => {
        expect(computePoDueDate("2026-08-28", 0)).toBe("2026-08-28");
    });
});

// ── Deterministik eşleşme anahtarı ───────────────────────────────────────────

describe("purchaseBillDescription", () => {
    it("PO numarasını taşır — uzak kurtarmanın YEREL eşleşme anahtarı", () => {
        // Paraşüt `listPurchaseBills`'te invoice_no FİLTRESİ YOK; kurtarma
        // tedarikçi bazlı sayfalama + bu açıklamanın eşleşmesiyle yapılır.
        expect(purchaseBillDescription("PO-2026-0007")).toBe("Roven #PO-2026-0007");
    });

    it("servis hem create'te hem kurtarmada AYNI anahtarı kullanır", () => {
        expect(SVC).toContain("const marker      = purchaseBillDescription(po.po_number);");
        expect(SVC).toContain("list.find(b => b.attributes.description === marker)");
        expect(SVC).toContain("description: marker,");
    });
});

// ── Hata sınıflandırma ───────────────────────────────────────────────────────

describe("classifyAndPatchPo", () => {
    it("auth/validation → 2099 blok (operatör müdahalesi gerekir)", () => {
        for (const kind of ["auth", "validation"] as const) {
            const patch = classifyAndPatchPo({ parasut_retry_count: 0 }, "bill", new ParasutError(kind, "x"));
            expect(String(patch.parasut_next_retry_at)).toContain("2099");
        }
    });

    it("rate_limit → Retry-After kadar bekler", () => {
        const patch = classifyAndPatchPo({ parasut_retry_count: 0 }, "bill", new ParasutError("rate_limit", "x", 60));
        const waitMs = new Date(String(patch.parasut_next_retry_at)).getTime() - Date.now();
        expect(waitMs).toBeGreaterThan(55_000);
        expect(waitMs).toBeLessThan(65_000);
    });

    it("geçici hata → sayaç artar, exponential backoff", () => {
        const patch = classifyAndPatchPo({ parasut_retry_count: 1 }, "bill", new ParasutError("server", "x"));
        expect(patch.parasut_retry_count).toBe(2);
        expect(String(patch.parasut_next_retry_at)).not.toContain("2099");
    });

    it("5. denemeden sonra kalıcı blok (sonsuz retry yok)", () => {
        const patch = classifyAndPatchPo({ parasut_retry_count: 4 }, "bill", new ParasutError("server", "x"));
        expect(patch.parasut_retry_count).toBe(5);
        expect(String(patch.parasut_next_retry_at)).toContain("2099");
    });

    it("bill adımında hata mesajı ayrı kolona da yazılır", () => {
        const patch = classifyAndPatchPo({ parasut_retry_count: 0 }, "bill", new ParasutError("server", "patlak"));
        expect(patch.parasut_bill_error).toBe("patlak");
        expect(patch.parasut_last_failed_step).toBe("bill");
    });

    it("contact adımında bill hata kolonu KİRLETİLMEZ", () => {
        const patch = classifyAndPatchPo({ parasut_retry_count: 0 }, "contact", new ParasutError("server", "x"));
        expect(patch).not.toHaveProperty("parasut_bill_error");
    });
});

// ── Stok invariant (satışın simetriği) ───────────────────────────────────────

describe("alış faturası stok invariant'ı", () => {
    const base: PurchaseBillInput = {
        supplier_id: "c1", issue_date: "2026-08-28", due_date: "2026-09-27",
        currency: "TRL", description: "Roven #PO-1",
        details: [{ quantity: 5, unit_price: 100, vat_rate: 20, description: "Vana" }],
    };

    it("temiz payload geçer", () => {
        expect(() => assertPurchaseBillStockInvariant(base)).not.toThrow();
    });

    it("warehouse gönderilirse reddedilir — Paraşüt stoğu ÇİFT artardı", () => {
        expect(() => assertPurchaseBillStockInvariant({
            ...base, details: [{ ...base.details[0], warehouse: "w1" } as never],
        })).toThrow(/warehouse.*stok invariant/);
    });

    it("warehouse_id de reddedilir", () => {
        expect(() => assertPurchaseBillStockInvariant({
            ...base, details: [{ ...base.details[0], warehouse_id: "w1" } as never],
        })).toThrow(/stok invariant/);
    });

    it("servis detay üretiminde warehouse ASLA eklenmez (kaynak kilidi)", () => {
        expect(SVC).toContain("// warehouse: KASITLI OLARAK YOK — stok invariant");
        expect(SVC).not.toMatch(/warehouse_id:\s*[a-z]/i);
    });
});

// ── Akış kuralları (kaynak kilitleri) ────────────────────────────────────────

describe("ne zaman fatura kesilir", () => {
    it("YALNIZ tamamen mal kabul edilmiş PO — kısmi kabulde kesilmez", () => {
        // Kısmi kabulde PO toplamını gider yazmak, malın bir kısmı gelmişken
        // muhasebeyi yanıltırdı.
        expect(SVC).toContain('if (po.status !== "received")');
        expect(MIG).toContain("AND status = 'received'");
    });

    it("mal kabul tetiği yalnız `received`'de ateşler ve best-effort", () => {
        expect(PO_SVC).toContain('if (po.status === "received") {');
        expect(PO_SVC).toContain("serviceSyncPurchaseOrderToParasut(po.id).catch(");
    });

    it("fatura ALINAN miktar üzerinden kesilir (sipariş edilen değil)", () => {
        expect(SVC).toContain("Number(line.received_qty ?? line.quantity)");
    });

    it("tedarikçi fatura tarihi varsa KDV dönemi ona göre belirlenir", () => {
        expect(SVC).toContain("po.vendor_invoice_date ?? localISODate(Date.now())");
    });
});

describe("idempotency ve mükerrer koruması", () => {
    it("fatura ID'si varsa erken döner", () => {
        expect(SVC).toContain("if (po.parasut_bill_id) return; // idempotent");
    });

    it("durable marker create'ten HEMEN ÖNCE, tüm doğrulamalardan SONRA yazılır", () => {
        const validationIdx = SVC.indexOf("Ürün Paraşüt product ID eksik");
        const markerIdx     = SVC.indexOf("parasut_bill_create_attempted_at: new Date().toISOString()");
        const createIdx     = SVC.indexOf("adapter.createPurchaseBill(");
        expect(validationIdx).toBeGreaterThan(0);
        expect(markerIdx).toBeGreaterThan(validationIdx);
        expect(createIdx).toBeGreaterThan(markerIdx);
    });

    it("marker + uzak arama negatif → critical alert, sessiz ikinci fatura YOK", () => {
        expect(SVC).toContain("Alış faturası manuel inceleme gerekli");
        expect(SVC).toMatch(/severity:\s+"critical"/);
    });

    it("DB seviyesinde de mükerrer koruması var", () => {
        expect(MIG).toContain("CREATE UNIQUE INDEX IF NOT EXISTS po_parasut_bill_unique");
    });
});

describe("tedarikçi fatura künyesi (KDV indirimi)", () => {
    it("künye eksikse akış bloklanmaz ama UYARI açılır", () => {
        expect(SVC).toContain("if (!po.vendor_invoice_no) {");
        expect(SVC).toContain("Alış faturası künyesi eksik");
        expect(SVC).toMatch(/severity:\s+"warning"/);
    });

    it("künye varsa Paraşüt'e invoice_no olarak gider", () => {
        expect(SVC).toContain("...(po.vendor_invoice_no ? { invoice_no: po.vendor_invoice_no } : {})");
    });

    it("künye yazımı mal kabulü GERİ ALMAZ (stok hareketinden sonra, try/catch'li)", () => {
        expect(PO_SVC).toContain("po_vendor_invoice_write_fail");
        const receiveIdx = PO_SVC.indexOf("await dbReceivePurchaseOrderLines(");
        const invoiceIdx = PO_SVC.indexOf("await dbSetVendorInvoiceIdentity(");
        expect(invoiceIdx).toBeGreaterThan(receiveIdx);
    });
});

describe("migration 107", () => {
    it("vendors'a contact eşlemesi + TTL lease (customers 040 kalıbı)", () => {
        expect(MIG).toContain("ALTER TABLE vendors");
        expect(MIG).toContain("parasut_contact_id");
        expect(MIG).toContain("parasut_contact_creating_until");
        expect(MIG).toContain("parasut_contact_creating_owner");
    });

    it("satır bazlı KDV nullable — mevcut satırlar davranış değiştirmez", () => {
        expect(MIG).toContain("ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2)");
        expect(MIG).not.toMatch(/vat_rate numeric\(5,2\)\s+NOT NULL/);
        expect(MIG).toContain("chk_pol_vat_rate");
    });

    it("step CHECK'i alış akışının adımlarını taşır", () => {
        expect(MIG).toMatch(/parasut_step IN\s*\n?\s*\('contact','product','bill','done'\)/);
    });

    it("claim RPC SECURITY DEFINER hijyeni (search_path + REVOKE/GRANT)", () => {
        expect(MIG).toContain("SECURITY DEFINER");
        expect(MIG).toContain("SET search_path = public");
        expect(MIG).toContain("REVOKE ALL ON FUNCTION parasut_claim_po_sync(uuid, uuid, int) FROM public, anon, authenticated;");
        expect(MIG).toContain("GRANT EXECUTE ON FUNCTION parasut_claim_po_sync(uuid, uuid, int) TO service_role;");
    });

    it("CRON retry index'i sorguyla birebir (kalıcı hatalar hariç)", () => {
        expect(MIG).toContain("idx_po_parasut_retry");
        expect(MIG).toContain("NOT IN ('validation','auth')");
    });

    it("migration gate'ine kayıtlı (sessiz drift yok)", () => {
        const gate = readFileSync("scripts/check-migrations.ts", "utf8");
        expect(gate).toContain('"107": { kind: "column", table: "purchase_orders", column: "parasut_bill_id" }');
    });
});

describe("tedarikçi contact upsert", () => {
    it("VKN zorunlu — künyesiz alış faturası kesilmez", () => {
        expect(SVC).toContain("vergi numarası zorunlu (Paraşüt alış faturası)");
    });

    it("account_type=supplier gönderilir", () => {
        expect(SVC).toContain('account_type: "supplier",');
    });

    it("VKN eşleşirse MEVCUT contact kullanılır — mükerrer cari açılmaz", () => {
        // Aynı VKN hem müşteri hem tedarikçi olabilir; Paraşüt tek contact'ta tutar.
        expect(SVC).toContain("await writeContactId(byTax[0].id);");
    });

    it("birden fazla VKN eşleşmesi manuel incelemeye düşer", () => {
        expect(SVC).toContain("birden fazla kontakt var — manuel inceleme gerekli");
    });

    it("ürün upsert satışla ORTAK — aynı ürün iki kez yaratılmaz", () => {
        expect(SVC).toContain("serviceEnsureParasutProduct");
    });
});

describe("devre dışıyken hiçbir şey olmaz", () => {
    it("PARASUT_ENABLED kapalıyken sync erken döner", () => {
        expect(SVC).toContain('if (!isParasutEnabled()) return { success: false, error: "Paraşüt entegrasyonu devre dışı." };');
    });

    it("CRON da kapalıyken sıfır işler", () => {
        expect(SVC).toContain("if (!isParasutEnabled()) return { processed: 0, succeeded: 0, failed: 0 };");
    });
});

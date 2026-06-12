/**
 * Denetim Tur E (2026-06) — operasyonel düzeltme kilitleri.
 *  O1: ship post-patch hatası = uyarılı BAŞARI (stok düştü; "başarısız" yanıltıcıydı)
 *  O2: import apply status yazımına tek retry
 *  O3: Paraşüt reconcile kuruş-tamsayı akümülasyon
 *  O4: sync-log error_message PII maskesi
 *  O10: addOrder başarı-yolu hatasında cache refetch
 *  D5: PO receive geçersiz miktar toast'ı
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sanitizeSyncErrorMessage } from "@/lib/supabase/sync-log";

const read = (p: string) => readFileSync(p, "utf8");

describe("O4 — sanitizeSyncErrorMessage", () => {
    it("e-posta ve VKN/TCKN maskelenir, hata kodu kalır", () => {
        const out = sanitizeSyncErrorMessage(
            "Invoice failed for 'Acme', TAX 1234567890, mail acme@firma.com.tr: 422 Unprocessable",
        );
        expect(out).not.toContain("1234567890");
        expect(out).not.toContain("acme@firma.com.tr");
        expect(out).toContain("[vkn]");
        expect(out).toContain("[email]");
        expect(out).toContain("422 Unprocessable");
    });

    it("300 karaktere kırpılır; null/undefined null döner", () => {
        expect(sanitizeSyncErrorMessage("x".repeat(500))!.length).toBe(300);
        expect(sanitizeSyncErrorMessage(undefined)).toBeNull();
        expect(sanitizeSyncErrorMessage(null)).toBeNull();
    });

    it("dbCreateSyncLog mesajı sanitize ederek yazar (kaynak kilidi)", () => {
        expect(read("src/lib/supabase/sync-log.ts"))
            .toMatch(/error_message: sanitizeSyncErrorMessage\(input\.error_message\)/);
    });
});

describe("O1 — ship post-patch hatası uyarılı başarı (kaynak kilitleri)", () => {
    it("order-service success:false yerine success:true + postShipWarning döner", () => {
        const src = read("src/lib/services/order-service.ts");
        expect(src).toMatch(/postShipWarning\?: string/);
        expect(src).toMatch(/success: true,\s*\n\s*postShipWarning:/);
        expect(src).not.toMatch(/Sevk başarılı ancak shipped_at/);
    });

    it("ship route uyarıyı response'a taşır", () => {
        expect(read("src/app/api/orders/[id]/ship/route.ts"))
            .toMatch(/postShipWarning: result\.postShipWarning/);
    });
});

describe("O2/O3/O10/D5 — kaynak kilitleri", () => {
    it("O2: import apply status yazımında tek retry var", () => {
        const src = read("src/lib/services/import-apply-service.ts");
        expect(src).toMatch(/1\. deneme başarısız, yeniden deneniyor/);
    });

    it("O3: reconcile kuruş-tamsayı toplar (float akümülasyon geri gelmez)", () => {
        const src = read("src/lib/services/parasut-service.ts");
        expect(src).toMatch(/expectedCents \+= Math\.round\(net \* \(1 \+ vat \/ 100\) \* 100\)/);
        expect(src).not.toMatch(/expected \+= net \* \(1 \+ vat \/ 100\)/);
    });

    it("O10: addOrder başarı-yolu hatasında ORDERS/COUNTERS refetch edilir", () => {
        const src = read("src/lib/data-context.tsx");
        expect(src).toMatch(/catch \(postErr\) \{\s*\n\s*void mutate\(ORDERS_KEY\);\s*\n\s*void mutate\(COUNTERS_KEY\);/);
    });

    it("D5: PO receive geçersiz miktar toast'ı (sessiz filtre yok)", () => {
        const src = read("src/app/dashboard/purchase/orders/[id]/page.tsx");
        expect(src).toMatch(/Geçersiz miktar girilen satır var/);
    });
});

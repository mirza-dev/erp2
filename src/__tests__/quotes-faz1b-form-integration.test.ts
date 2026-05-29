/**
 * Faz 1b (2026-05-29) — QuoteForm V7 entegrasyonu.
 *
 * 1a DB foundation (migration 066-069 + type/mapper/input) hazır; bu faz
 * QuoteForm.tsx'i o alanlara bağlar:
 *   - V3-A4: productId gizli yakalama (autocomplete seçimi → payload product_id)
 *   - V4-A2: customer_id + customer_address (seçim + adres input)
 *   - V4-B3: GTİP/ölçü/birim ağırlık master'dan auto-fill
 *   - V3-B5/V4-A7: KG = qty × birim ağırlık recompute + manuel override flag
 *   - V4-A3: satıcı snapshot persist + hydrate + company_settings freeze
 *
 * QuoteForm büyük bir client component; entegrasyon noktaları source-regex ile
 * kilitlenir (faz4b modeli). Patern silinir / drift ederse test fail.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/_components/QuoteForm.tsx"),
    "utf8",
);

describe("QuoteForm Faz 1b — QuoteRow şeması + helper'lar", () => {
    it("QuoteRow'a productId/unitWeightKg/kgManualOverride alanları eklenir", () => {
        expect(SOURCE).toMatch(/interface QuoteRow[\s\S]{0,500}productId:\s*string/);
        expect(SOURCE).toMatch(/unitWeightKg:\s*string/);
        expect(SOURCE).toMatch(/kgManualOverride:\s*boolean/);
    });

    it("emptyRow yeni alanları default'lar (productId:'', unitWeightKg:'', kgManualOverride:false)", () => {
        expect(SOURCE).toMatch(
            /function emptyRow[\s\S]{0,300}productId:\s*""[\s\S]{0,250}unitWeightKg:\s*""[\s\S]{0,80}kgManualOverride:\s*false/,
        );
    });

    it("round3 yuvarlama helper'ı tanımlı (numeric(10,3) hedefi)", () => {
        expect(SOURCE).toMatch(
            /const round3 = \(n: number\) => String\(Math\.round\(n \* 1000\) \/ 1000\)/,
        );
    });

    it("patchRow çok-alanlı/boolean güncelleme helper'ı tanımlı", () => {
        expect(SOURCE).toMatch(
            /function patchRow\(id: number, patch: Partial<QuoteRow>\)/,
        );
    });
});

describe("QuoteForm Faz 1b — V3-A4 productId yakalama", () => {
    it("handleSelectProduct seçili ürün id'sini set eder", () => {
        expect(SOURCE).toMatch(
            /const handleSelectProduct[\s\S]{0,1400}updateRow\(rowId, "productId", p\.id\)/,
        );
    });

    it("handleCodeChange manuel yazımda productId temizler", () => {
        expect(SOURCE).toMatch(
            /handleCodeChange[\s\S]{0,300}updateRow\(rowId, "productId", ""\)/,
        );
    });

    it("buildQuotePayload satıra product_id ekler (manuel kodda null)", () => {
        expect(SOURCE).toMatch(/product_id:\s*r\.productId \|\| null/);
    });

    it("initialData satır hydrate'i productId taşır", () => {
        expect(SOURCE).toMatch(/productId:\s*l\.productId \?\? ""/);
    });
});

describe("QuoteForm Faz 1b — V4-A2 müşteri id + adres", () => {
    it("custId/custAddress state init", () => {
        expect(SOURCE).toMatch(/const \[custId, setCustId\] = useState\(""\)/);
        expect(SOURCE).toMatch(/const \[custAddress, setCustAddress\] = useState\(""\)/);
    });

    it("handleSelectCustomer id + adres yakalar", () => {
        expect(SOURCE).toMatch(
            /handleSelectCustomer[\s\S]{0,400}setCustId\(c\.id\)[\s\S]{0,120}setCustAddress\(c\.address/,
        );
    });

    it("handleCustCompanyChange manuel yazımda custId temizler", () => {
        expect(SOURCE).toMatch(
            /handleCustCompanyChange[\s\S]{0,300}setCustId\(""\)/,
        );
    });

    it("müşteri meta grid'ine Address / Adres input eklenir", () => {
        expect(SOURCE).toMatch(
            /\["Address",\s*"Adres",\s*custAddress, setCustAddress/,
        );
    });

    it("buildQuotePayload header'a customer_id + customer_address ekler", () => {
        expect(SOURCE).toMatch(/customer_id:\s*custId \|\| null/);
        expect(SOURCE).toMatch(/customer_address:\s*custAddress \|\| undefined/);
    });

    it("initialData hydrate custId + custAddress taşır", () => {
        expect(SOURCE).toMatch(/setCustId\(initialData\.customerId \?\? ""\)/);
        expect(SOURCE).toMatch(/setCustAddress\(initialData\.customerAddress\)/);
    });
});

describe("QuoteForm Faz 1b — V4-B3 hs/size auto-fill + KG recompute", () => {
    it("handleSelectProduct hs_code/size_text master'dan doldurur", () => {
        expect(SOURCE).toMatch(/updateRow\(rowId, "hs", p\.hsCode \?\? ""\)/);
        expect(SOURCE).toMatch(/updateRow\(rowId, "size", p\.sizeText \?\? ""\)/);
    });

    it("handleSelectProduct KG = qty × birim ağırlık recompute eder (override sıfırlı)", () => {
        expect(SOURCE).toMatch(
            /const handleSelectProduct[\s\S]{0,1800}kgManualOverride:\s*false[\s\S]{0,500}qtyN > 0 \? round3\(qtyN \* unit\)/,
        );
    });

    it("handleQtyChange override yoksa & birim ağırlık varsa KG recompute eder", () => {
        expect(SOURCE).toMatch(
            /function handleQtyChange[\s\S]{0,400}!r\.kgManualOverride && r\.unitWeightKg[\s\S]{0,200}round3\(q \* u\)/,
        );
    });

    it("handleKgChange manuel düzenlemede override flag açar", () => {
        expect(SOURCE).toMatch(
            /function handleKgChange[\s\S]{0,200}kgManualOverride:\s*true/,
        );
    });

    it("P1: handleSelectProduct kg'yi her durumda set eder (ağırlıksız üründe temizler, eski KG taşınmaz)", () => {
        // patch.kg koşulsuz atanır → ağırlıksız üründe "" olur. Eski koşullu
        // patern (`if (unit != null) patch.kg`) eski ürün KG'sini bırakıyordu.
        expect(SOURCE).toMatch(
            /kg:\s*unit != null && qtyN > 0 \? round3\(qtyN \* unit\) : "",/,
        );
        expect(SOURCE).not.toMatch(/if \(unit != null\) patch\.kg/);
    });

    it("buildQuotePayload satıra unit_weight_kg + kg_manual_override ekler", () => {
        expect(SOURCE).toMatch(
            /unit_weight_kg:\s*r\.unitWeightKg \? parseFloat\(r\.unitWeightKg\) : undefined/,
        );
        expect(SOURCE).toMatch(/kg_manual_override:\s*r\.kgManualOverride/);
    });

    it("qty/kg input'ları yeni handler'lara bağlı", () => {
        expect(SOURCE).toMatch(/handleQtyChange\(row\.id, e\.target\.value\)/);
        expect(SOURCE).toMatch(/handleKgChange\(row\.id, e\.target\.value\)/);
    });

    it("initialData satır hydrate'i unitWeightKg + kgManualOverride taşır", () => {
        expect(SOURCE).toMatch(/unitWeightKg:\s*l\.unitWeightKg !== null \? String\(l\.unitWeightKg\) : ""/);
        expect(SOURCE).toMatch(/kgManualOverride:\s*l\.kgManualOverride/);
    });
});

describe("QuoteForm Faz 1b — V4-A3 satıcı snapshot + freeze", () => {
    it("hasSellerSnapshot ayraç'ı tanımlı (sellerName dolu → snapshot var)", () => {
        expect(SOURCE).toMatch(
            /const hasSellerSnapshot = !!initialData && \(initialData\.sellerName\?\.trim\(\) \?\? ""\) !== "";/,
        );
    });

    it("company_settings effect snapshot'lı quote'ta atlanır (freeze gate)", () => {
        expect(SOURCE).toMatch(
            /if \(hasSellerSnapshot\) return;[\s\S]{0,120}fetch\("\/api\/settings\/company"\)/,
        );
    });

    it("P2: company_settings effect dep array hasSellerSnapshot içerir (lint warning yok)", () => {
        // Effect hasSellerSnapshot okuyor → exhaustive-deps gereği dep array'de.
        // `}, [hasSellerSnapshot]);` yalnız bu effect'e ait (benzersiz anchor).
        expect(SOURCE).toMatch(/\}, \[hasSellerSnapshot\]\);/);
    });

    it("initialData satıcı snapshot'ını hydrate eder", () => {
        expect(SOURCE).toMatch(/setSellerName\(initialData\.sellerName \|\| "PMT Endüstri A\.Ş\."\)/);
        expect(SOURCE).toMatch(/setSellerTel\(initialData\.sellerPhone\)/);
        expect(SOURCE).toMatch(/setSellerWeb\(initialData\.sellerWebsite\)/);
    });

    it("buildQuotePayload header'a seller_* (7) alanı persist eder", () => {
        expect(SOURCE).toMatch(/seller_name:\s*sellerName \|\| undefined/);
        expect(SOURCE).toMatch(/seller_phone:\s*sellerTel \|\| undefined/);
        expect(SOURCE).toMatch(/seller_address:\s*sellerAddr \|\| undefined/);
        expect(SOURCE).toMatch(/seller_tax_id:\s*sellerTaxId \|\| undefined/);
        expect(SOURCE).toMatch(/seller_website:\s*sellerWeb \|\| undefined/);
        expect(SOURCE).toMatch(/seller_logo_url:\s*logoSrc \|\| undefined/);
    });
});

describe("QuoteForm Faz 1b — regression guard'ları", () => {
    it("faz4b desc bloğu BİREBİR korunur (regex hâlâ eşleşir)", () => {
        // quotes-faz4b-form-integration.test.ts:30 ile aynı patern — kırılmamalı.
        expect(SOURCE).toMatch(
            /const handleSelectProduct[\s\S]{0,800}!descDirtyRowIds\.has\(rowId\)[\s\S]{0,300}buildQuoteLineDescription\(p\)/,
        );
    });

    it("localStorage restore yeni alanları emptyRow default'larıyla merge eder", () => {
        expect(SOURCE).toMatch(
            /\{ \.\.\.emptyRow\(i \+ 1\), \.\.\.r, id: i \+ 1 \}/,
        );
    });
});

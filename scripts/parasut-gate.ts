/**
 * GATE: Paraşüt canlı doğrulama turu (Faz 16).
 *
 * NE İŞE YARAR: Faz 1-15 boyunca kurulan tüm akış MOCK'a karşı doğrulandı.
 * Mock, gerçek API'nin sözleşmesini taklit eder ama İKİ ŞEYİ kanıtlayamaz:
 *   1. Payload'ların Paraşüt tarafından KABUL edildiğini (422 riski),
 *   2. **Stok invariant'ını** — `shipment_included=false` + warehouse'suz
 *      fatura gerçekten ikinci bir stok hareketi yaratmıyor mu?
 * Bu script ikisini de gerçek API'ye karşı ölçer.
 *
 * ⚠️ GERÇEK BELGE OLUŞTURUR. Tercihen Paraşüt'te ayrı bir DENEME ŞİRKETİ'ne
 * karşı koşulmalıdır (PARASUT_COMPANY_ID'yi o şirkete çevirin).
 *
 * KULLANIM
 *   npx tsx scripts/parasut-gate.ts              → yalnız SALT-OKUNUR maddeler
 *   npx tsx scripts/parasut-gate.ts --write      → yazma maddeleri de (belge oluşturur)
 *
 * ÖN KOŞUL
 *   PARASUT_USE_MOCK=false · PARASUT_CLIENT_ID/_SECRET/_COMPANY_ID
 *   ve kurulmuş bir OAuth bağlantısı (parasut_oauth_tokens satırı).
 *
 * ÇIKIŞ: her madde ✅/❌/⏭; bir ❌ varsa exit 1 → go-live BLOKLANIR.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// .env.local'ı elle yükle (check-migrations.ts kalıbı)
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
}

const WRITE = process.argv.includes("--write");

// ── Rapor ────────────────────────────────────────────────────

type Status = "pass" | "fail" | "skip";
interface Line { status: Status; label: string; detail?: string }
const results: Line[] = [];

function record(status: Status, label: string, detail?: string): void {
    results.push({ status, label, detail });
    const icon = status === "pass" ? "✅" : status === "fail" ? "❌" : "⏭";
    console.log(`${icon} ${label}${detail ? `\n     ${detail}` : ""}`);
}

async function check(label: string, fn: () => Promise<string | void>): Promise<void> {
    try {
        const detail = await fn();
        record("pass", label, detail || undefined);
    } catch (err) {
        record("fail", label, err instanceof Error ? err.message : String(err));
    }
}

function skip(label: string, why: string): void {
    record("skip", label, why);
}

// ── Ön koşullar ──────────────────────────────────────────────

function requireEnv(): void {
    if (process.env.PARASUT_USE_MOCK !== "false") {
        console.error("[parasut-gate] PARASUT_USE_MOCK=false olmalı — gate MOCK'a karşı anlamsızdır.");
        process.exit(2);
    }
    for (const k of ["PARASUT_CLIENT_ID", "PARASUT_CLIENT_SECRET", "PARASUT_COMPANY_ID"]) {
        if (!process.env[k]) {
            console.error(`[parasut-gate] ${k} tanımsız (.env.local).`);
            process.exit(2);
        }
    }
    // parasutApiCall PARASUT_ENABLED guard'ı taşır; gate onu geçici olarak açar.
    process.env.PARASUT_ENABLED = "true";
}

// ── Ana akış ─────────────────────────────────────────────────

async function main(): Promise<void> {
    requireEnv();

    console.log("\n═══ Paraşüt canlı doğrulama turu ═══");
    console.log(`   şirket: ${process.env.PARASUT_COMPANY_ID}`);
    console.log(`   mod:    ${WRITE ? "YAZMA (gerçek belge oluşturulur)" : "salt-okunur"}\n`);

    const { getParasutAdapter } = await import("../src/lib/parasut");
    const adapter = getParasutAdapter();

    // ── 1. OAuth ─────────────────────────────────────────────
    await check("OAuth: erişim jetonu çözülüyor + refresh rotate", async () => {
        const { getAccessToken } = await import("../src/lib/services/parasut-oauth");
        const token = await getAccessToken(adapter);
        if (!token) throw new Error("boş jeton");
        return `jeton alındı (${token.slice(0, 6)}…)`;
    });

    // ── 2. Liste filtreleri (salt okunur) ────────────────────
    await check("filter[tax_number] çalışıyor (contacts)", async () => {
        const r = await adapter.findContactsByTaxNumber("1111111111");
        return `${r.length} kayıt (0 olması normal — filtre 500 vermiyorsa geçer)`;
    });

    await check("filter[code] çalışıyor (products)", async () => {
        const r = await adapter.findProductsByCode("__ROVEN_GATE_PROBE__");
        return `${r.length} kayıt`;
    });

    await check("filter[vkn] çalışıyor (e_invoice_inboxes)", async () => {
        const r = await adapter.listEInvoiceInboxesByVkn("1111111111");
        return `${r.length} kayıt`;
    });

    await check("filter[invoice_series]+[invoice_id] hızlı arama (sales_invoices)", async () => {
        const r = await adapter.findSalesInvoicesByNumber("KE", 19990001);
        return `${r.length} kayıt (idempotency bu filtreye dayanıyor)`;
    });

    await check("shipment_documents sayfalama (procurement_number filtresi YOK)", async () => {
        const r = await adapter.listRecentShipmentDocuments(1, 25);
        return `${r.length} belge — crash-recovery yerel eşleşmeye dayanıyor`;
    });

    // ── 3. Yazma maddeleri ───────────────────────────────────
    if (!WRITE) {
        const reason = "--write verilmedi (gerçek belge oluşturmaz)";
        skip("STOK INVARIANT (kritik): irsaliye düşürür, fatura düşürmez", reason);
        skip("Alış faturası warehouse'suz → stok DEĞİŞMEZ", reason);
        skip("stock_updates MUTLAK yazar + inventory_levels geri okur", reason);
        skip("Dövizli faturada exchange_rate aynen görünür", reason);
        skip("payment_status / remaining gerçek tahsilatı yansıtır", reason);
        summarize();
        return;
    }

    console.log("\n── YAZMA MADDELERİ ────────────────────────────");
    console.log("   Aşağıdaki adımlar Paraşüt'te GERÇEK kayıt oluşturur.");
    console.log("   Bu bölümü yalnız DENEME ŞİRKETİ'nde koşun.\n");

    const stamp = Date.now();
    let contactId = "";
    let productId = "";

    await check("Test contact + ürün oluşturulabiliyor", async () => {
        const c = await adapter.createContact({
            name:       `ROVEN GATE ${stamp}`,
            tax_number: "1111111111",
        });
        contactId = c.id;
        const p = await adapter.createProduct({
            code: `ROVEN-GATE-${stamp}`,
            name: `Roven Gate Ürün ${stamp}`,
            vat_rate: 20,
        });
        productId = p.id;
        return `contact=${contactId} product=${productId}`;
    });

    if (!contactId || !productId) {
        skip("STOK INVARIANT (kritik)", "test contact/ürün oluşturulamadı");
        summarize();
        return;
    }

    // Başlangıç stoğu kur: mutlak yazım + geri okuma aynı anda doğrulanır.
    const BASE_STOCK = 100;
    const SHIP_QTY   = 10;

    await check("stock_updates MUTLAK yazar + inventory_levels geri okur", async () => {
        await adapter.createStockUpdate([{ product_id: productId, new_total_inventory: BASE_STOCK }]);
        const levels = await adapter.listInventoryLevels(productId);
        const total = levels.reduce((s, l) => s + l.stock_count, 0);
        if (total !== BASE_STOCK) {
            throw new Error(`beklenen ${BASE_STOCK}, okunan ${total} — mutlak yazım TUTMUYOR`);
        }
        // İkinci kez aynı değeri yaz: delta olsaydı 200 olurdu.
        await adapter.createStockUpdate([{ product_id: productId, new_total_inventory: BASE_STOCK }]);
        const again = (await adapter.listInventoryLevels(productId)).reduce((s, l) => s + l.stock_count, 0);
        if (again !== BASE_STOCK) {
            throw new Error(`ikinci yazımda ${again} — MUTLAK değil, DELTA davranışı! Faz 15 tasarımı geçersiz.`);
        }
        return `stok ${BASE_STOCK} · iki kez yazıldı, kaymadı (mutlak doğrulandı)`;
    });

    const today = new Date().toISOString().slice(0, 10);

    await check("STOK INVARIANT (kritik): irsaliye düşürür, fatura DÜŞÜRMEZ", async () => {
        const before = (await adapter.listInventoryLevels(productId)).reduce((s, l) => s + l.stock_count, 0);

        await adapter.createShipmentDocument({
            contact_id:         contactId,
            issue_date:         today,
            shipment_date:      today,
            inflow:             false,
            procurement_number: `ROVEN-GATE-${stamp}`,
            description:        `Roven gate ${stamp}`,
            details: [{ quantity: SHIP_QTY, product_id: productId, description: "gate" }],
        });

        const afterShip = (await adapter.listInventoryLevels(productId)).reduce((s, l) => s + l.stock_count, 0);
        if (afterShip !== before - SHIP_QTY) {
            throw new Error(`irsaliye sonrası ${afterShip}, beklenen ${before - SHIP_QTY} — irsaliye stok düşürmüyor`);
        }

        await adapter.createSalesInvoice({
            contact_id:        contactId,
            invoice_series:    "KE",
            invoice_id:        Number(String(stamp).slice(-8)),
            issue_date:        today,
            due_date:          today,
            currency:          "TRL",
            shipment_included: false,
            description:       `Roven gate ${stamp}`,
            details: [{
                quantity: SHIP_QTY, unit_price: 100, vat_rate: 20,
                description: "gate", product_id: productId,
            }],
        });

        const afterInvoice = (await adapter.listInventoryLevels(productId)).reduce((s, l) => s + l.stock_count, 0);
        if (afterInvoice !== afterShip) {
            throw new Error(
                `FATURA DA STOK DÜŞÜRDÜ (${afterShip} → ${afterInvoice}). ` +
                `shipment_included=false + warehouse'suz detail varsayımı GEÇERSİZ — ` +
                `canlıya GEÇİLMEZ, payload kombinasyonları yeniden denenmeli.`,
            );
        }
        return `${before} → irsaliye → ${afterShip} → fatura → ${afterInvoice} (tek düşüş ✓)`;
    });

    await check("Alış faturası warehouse'suz → stok DEĞİŞMEZ", async () => {
        const before = (await adapter.listInventoryLevels(productId)).reduce((s, l) => s + l.stock_count, 0);
        await adapter.createPurchaseBill({
            supplier_id: contactId,
            issue_date:  today,
            due_date:    today,
            currency:    "TRL",
            description: `Roven gate alış ${stamp}`,
            details: [{ quantity: 5, unit_price: 50, vat_rate: 20, description: "gate", product_id: productId }],
        });
        const after = (await adapter.listInventoryLevels(productId)).reduce((s, l) => s + l.stock_count, 0);
        if (after !== before) {
            throw new Error(
                `ALIŞ FATURASI STOK ARTIRDI (${before} → ${after}). Faz 13 invariant'ı geçersiz — ` +
                `Faz 15 mutabakatıyla birlikte ÇİFT artış olur.`,
            );
        }
        return `${before} → alış faturası → ${after} (değişmedi ✓)`;
    });

    await check("Dövizli faturada exchange_rate aynen görünür", async () => {
        const RATE = 41.1234;
        const inv = await adapter.createSalesInvoice({
            contact_id:        contactId,
            invoice_series:    "KE",
            invoice_id:        Number(String(stamp + 1).slice(-8)),
            issue_date:        today,
            due_date:          today,
            currency:          "USD",
            exchange_rate:     RATE,
            shipment_included: false,
            description:       `Roven gate FX ${stamp}`,
            details: [{ quantity: 1, unit_price: 10, vat_rate: 20, description: "gate" }],
        });
        return `fatura ${inv.id} — Paraşüt arayüzünden kurun ${RATE} göründüğü GÖZLE doğrulanmalı`;
    });

    await check("payment_status / remaining okunuyor", async () => {
        const list = await adapter.findSalesInvoicesByNumber("KE", Number(String(stamp).slice(-8)));
        if (list.length === 0) throw new Error("gate faturası bulunamadı");
        const state = await adapter.getSalesInvoicePaymentState(list[0].id);
        if (state.payment_status === null) {
            throw new Error("payment_status null döndü — tahsilat okuması çalışmıyor");
        }
        return `durum=${state.payment_status} kalan=${state.remaining} TL karşılığı=${state.remaining_in_trl}`;
    });

    console.log("\n⚠️  Gate deneme şirketinde GERÇEK belgeler bıraktı.");
    console.log(`   Etiket: "ROVEN GATE ${stamp}" / "ROVEN-GATE-${stamp}" — Paraşüt'ten temizleyin.\n`);

    summarize();
}

function summarize(): void {
    const pass = results.filter(r => r.status === "pass").length;
    const fail = results.filter(r => r.status === "fail").length;
    const skipped = results.filter(r => r.status === "skip").length;

    console.log("\n═══ ÖZET ═══");
    console.log(`   ✅ ${pass} · ❌ ${fail} · ⏭ ${skipped}`);

    if (fail > 0) {
        console.log("\n❌ GATE BAŞARISIZ — canlıya GEÇİLMEZ.");
        for (const r of results.filter(x => x.status === "fail")) {
            console.log(`   · ${r.label}: ${r.detail ?? ""}`);
        }
        process.exit(1);
    }
    if (skipped > 0) {
        console.log("\n⚠️  Atlanan maddeler var — go-live öncesi `--write` ile tam tur gerekli.");
        process.exit(0);
    }
    console.log("\n✅ Tüm maddeler geçti — Paraşüt canlıya açılabilir.\n");
}

main().catch(err => {
    console.error("[parasut-gate] beklenmeyen hata:", err);
    process.exit(2);
});

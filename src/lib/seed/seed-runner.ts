/**
 * seed-runner — clearAllData + runSeed (tüm modüller).
 *
 * DIŞ ETKİ YOK: yalnız Supabase DB + storage'a yazar. E-posta GÖNDERMEZ
 * (email_logs satırları sahte geçmiştir; email-service import edilmez),
 * Paraşüt'e/AI'ya çıkmaz, webhook tetiklemez.
 *
 * Storage sözleşmesi: seed'in yüklediği TÜM dosyalar `demo/` prefix'i altındadır;
 * clearAllData yalnız bu prefix'i temizler → kullanıcının elle yüklediği dosyalara
 * dokunulmaz. Storage hataları NON-FATAL (warnings'e düşer) — bucket yoksa demo
 * yine kullanılır, sadece dosya önizlemeleri eksik kalır.
 */
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { buildMiniPdf, buildPlaceholderPng } from "./seed-assets";
import {
    SEED_COMPANY, SEED_FACTORY_ADDRESS, PRODUCT_TYPE_IDS,
    SEED_VENDORS, SEED_PRODUCTS, SEED_CUSTOMERS, SEED_QUOTES, SEED_ORDERS,
    SEED_POS, SEED_COMMITMENTS, SEED_BOM, SEED_PRODUCTION,
    SEED_LOCATION_BALANCES, SEED_VENDOR_LINKS, SEED_CALENDAR_NOTES,
    SEED_EMAIL_LOGS, SEED_COMPANY_FILES, SEED_IMPORT_DOCUMENTS, SEED_DEMO_USERS,
    daysAgo, daysLater, daysAgoISO, hoursLaterISO, todayStr,
    orderTotals, quoteTotals, poTotals, round2,
    type SeedOrder,
} from "./seed-data";

type Service = ReturnType<typeof createServiceClient>;

const SEED_STORAGE_PREFIX = "demo";
const SEED_BUCKETS = ["company-files", "product-files", "quote-pdfs"] as const;

// ════════════════════════════════════════════════════════════════════════════
// clearAllData — demo + LOAD- verileri temizler; singleton/counter resetler.
// note_templates ve product_types SİLİNMEZ (migration seed'i, sistem verisi).
// Demo auth kullanıcıları SİLİNMEZ (idempotent upsert runSeed'de).
// ════════════════════════════════════════════════════════════════════════════

export async function clearAllData(
    supabase: Service,
): Promise<{ load_orders: number; demo_tables: number; storage_files: number }> {
    // ── Aşama 1: LOAD- prefix'li veriler (scripts/seed-large.ts kalıntıları) ──
    const { data: loadOrders } = await supabase
        .from("sales_orders").select("id").like("notes", "LOAD-%");
    const loadOrderIds = (loadOrders ?? []).map(o => o.id);
    if (loadOrderIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < loadOrderIds.length; i += 500) chunks.push(loadOrderIds.slice(i, i + 500));
        for (const chunk of chunks) {
            await supabase.from("order_lines").delete().in("order_id", chunk);
            await supabase.from("stock_reservations").delete().in("order_id", chunk);
        }
    }
    await supabase.from("sales_orders").delete().like("notes", "LOAD-%");
    await supabase.from("customers").delete().like("name", "LOAD%");
    await supabase.from("products").delete().like("sku", "LOAD-%");

    // ── Aşama 2: Demo verileri (FK alt → üst sırasıyla) ─────────────────────
    const tables = [
        "audit_log",
        "integration_sync_logs",
        "alerts",
        "calendar_notes",
        "email_logs",
        "company_files",
        "ai_feedback",
        // po_line_recommendations, ai_recommendations'ı RESTRICT ile tutar → önce o
        "po_line_recommendations",
        "purchase_order_lines",
        "purchase_orders",
        "product_vendor_links",
        "stock_location_balances",
        "vendors",
        "ai_recommendations",
        "ai_entity_aliases",
        "ai_runs",
        "column_mappings",
        "import_document_lines",
        "import_documents",
        "import_drafts",
        "import_batches",
        "quote_pdf_archives",
        "quote_line_items",
        "quotes",
        "payments",
        "invoices",
        "shipments",
        "shortages",
        "stock_reservations",
        "inventory_movements",
        "order_lines",
        "sales_orders",
        "purchase_commitments",
        "production_entries",
        "bills_of_materials",
        "product_attachments",
        "customers",
        "products",
        "parasut_oauth_tokens",
    ] as const;

    for (const table of tables) {
        const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) {
            // stock_location_balances/po_line_recommendations'ta id kolonu yok (composite PK)
            if (table === "stock_location_balances") {
                const { error: e2 } = await supabase.from(table).delete().neq("location", "");
                if (e2) throw new Error(`${table}: ${e2.message}`);
            } else if (table === "po_line_recommendations") {
                const { error: e2 } = await supabase.from(table).delete()
                    .neq("po_line_id", "00000000-0000-0000-0000-000000000000");
                if (e2) throw new Error(`${table}: ${e2.message}`);
            } else {
                throw new Error(`${table}: ${error.message}`);
            }
        }
    }

    // ── Aşama 3: Storage demo/ prefix temizliği (NON-FATAL) ─────────────────
    let storageFiles = 0;
    for (const bucket of SEED_BUCKETS) {
        try {
            const { data: files } = await supabase.storage.from(bucket)
                .list(SEED_STORAGE_PREFIX, { limit: 200 });
            const paths = (files ?? [])
                .filter(f => f.name)
                .map(f => `${SEED_STORAGE_PREFIX}/${f.name}`);
            if (paths.length > 0) {
                await supabase.storage.from(bucket).remove(paths);
                storageFiles += paths.length;
            }
        } catch {
            /* bucket yoksa sessiz geç — demo dosyasızken de çalışır */
        }
    }

    // ── Aşama 4: Singleton'lar + sayaçlar ───────────────────────────────────
    await supabase.from("company_settings").update({
        name: "", tax_office: "", tax_no: "", address: "",
        phone: "", email: "", website: "", logo_url: null, currency: "USD",
    }).neq("id", "00000000-0000-0000-0000-000000000000");

    const year = new Date().getFullYear();
    await supabase.from("order_counters").upsert({ year, last_seq: 0 }, { onConflict: "year" });
    await supabase.from("po_counters").upsert({ year, last_seq: 0 }, { onConflict: "year" });
    await supabase.from("quote_yearly_counters").upsert({ year, last_seq: 0 }, { onConflict: "year" });

    return { load_orders: loadOrderIds.length, demo_tables: tables.length, storage_files: storageFiles };
}

// ════════════════════════════════════════════════════════════════════════════
// runSeed
// ════════════════════════════════════════════════════════════════════════════

async function uploadDemoFile(
    supabase: Service, bucket: string, name: string,
    body: Buffer, contentType: string, warnings: string[],
): Promise<string | null> {
    const path = `${SEED_STORAGE_PREFIX}/${name}`;
    try {
        const { error } = await supabase.storage.from(bucket)
            .upload(path, body, { contentType, upsert: true });
        if (error) {
            warnings.push(`storage ${bucket}/${path}: ${error.message}`);
            return null;
        }
        return path;
    } catch (e) {
        warnings.push(`storage ${bucket}/${path}: ${e instanceof Error ? e.message : "upload failed"}`);
        return null;
    }
}

export async function runSeed(supabase: Service): Promise<Record<string, unknown>> {
    const warnings: string[] = [];
    const year = new Date().getFullYear();

    // ── 1. company_settings (PMT.pdf gerçek bilgileri; VKN kurgusal) ────────
    await supabase.from("company_settings").update({ ...SEED_COMPANY })
        .neq("id", "00000000-0000-0000-0000-000000000000");

    // ── 2. parasut_oauth_tokens (stub — dış API'ye ÇIKILMAZ) ────────────────
    await supabase.from("parasut_oauth_tokens").upsert(
        {
            singleton_key: "default",
            access_token: "DEMO-MOCK-AT-" + Math.random().toString(36).slice(2, 10),
            refresh_token: "DEMO-MOCK-RT-" + Math.random().toString(36).slice(2, 10),
            expires_at: hoursLaterISO(1),
            token_version: 0,
        },
        { onConflict: "singleton_key" },
    );

    // ── 3. Demo auth kullanıcıları (6 rol; şifre env'den — koda yazılmaz) ───
    let demoUsersCreated = 0;
    let firstUserId: string | null = null;
    const demoPassword = process.env.SEED_DEMO_PASSWORD;
    if (demoPassword) {
        const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
        const byEmail = new Map((existing?.users ?? []).map(u => [u.email?.toLowerCase(), u]));
        for (const du of SEED_DEMO_USERS) {
            const found = byEmail.get(du.email);
            if (found) {
                const { error } = await supabase.auth.admin.updateUserById(found.id, {
                    app_metadata: { roles: [du.role] },
                    user_metadata: { display_name: du.displayName },
                });
                if (error) warnings.push(`demo user ${du.email}: ${error.message}`);
                else demoUsersCreated++;
                if (du.role === "admin") firstUserId = found.id;
            } else {
                const { data, error } = await supabase.auth.admin.createUser({
                    email: du.email,
                    password: demoPassword,
                    email_confirm: true,
                    app_metadata: { roles: [du.role] },
                    user_metadata: { display_name: du.displayName },
                });
                if (error) warnings.push(`demo user ${du.email}: ${error.message}`);
                else {
                    demoUsersCreated++;
                    if (du.role === "admin") firstUserId = data.user?.id ?? null;
                }
            }
        }
    } else {
        warnings.push("SEED_DEMO_PASSWORD env yok — demo rol hesapları atlandı.");
    }
    // email_logs.user_id NOT NULL → herhangi bir auth kullanıcısı gerekli
    if (!firstUserId) {
        const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
        firstUserId = data?.users?.[0]?.id ?? null;
    }

    // ── 4. Vendors ──────────────────────────────────────────────────────────
    const { error: vErr } = await supabase.from("vendors").insert(
        SEED_VENDORS.map(v => ({
            name: v.name, contact_email: v.contact_email, contact_person: v.contact_person,
            currency: v.currency, payment_terms_days: v.payment_terms_days,
            lead_time_days: v.lead_time_days, notes: v.notes, is_active: true,
            address: v.name === "PMT Suluova Fabrikası" ? SEED_FACTORY_ADDRESS : null,
        })),
    );
    if (vErr) throw new Error("Vendors: " + vErr.message);
    const { data: allVendors } = await supabase.from("vendors").select("id, name");
    const vendorMap = new Map((allVendors ?? []).map(v => [v.name, v.id]));

    // ── 5. Products (tip ataması + attributes dahil) ────────────────────────
    const { error: pErr } = await supabase.from("products").insert(
        SEED_PRODUCTS.map(p => ({
            name: p.name, sku: p.sku, category: p.category, unit: p.unit,
            price: p.price, currency: p.currency,
            on_hand: p.on_hand, reserved: 0,
            min_stock_level: p.min_stock_level, reorder_qty: p.reorder_qty,
            product_type: p.product_type,
            product_type_id: PRODUCT_TYPE_IDS[p.type_key],
            attributes: p.attributes,
            warehouse: p.warehouse, preferred_vendor: p.preferred_vendor,
            lead_time_days: p.lead_time_days, daily_usage: p.daily_usage,
            cost_price: p.cost_price, material_quality: p.material_quality,
            origin_country: p.origin_country,
            production_site: p.production_site ?? null,
            hs_code: p.hs_code ?? null, size_text: p.size_text ?? null,
            is_active: true,
        })),
    );
    if (pErr) throw new Error("Products: " + pErr.message);
    const { data: allProducts } = await supabase.from("products").select("id, sku, name, unit, on_hand");
    const skuMap = new Map((allProducts ?? []).map(p => [p.sku, p]));
    const bySku = (sku: string) => {
        const p = skuMap.get(sku);
        if (!p) throw new Error("Seed iç tutarsızlık — SKU yok: " + sku);
        return p;
    };

    // ── 6. Customers ────────────────────────────────────────────────────────
    const { error: cErr } = await supabase.from("customers").insert(
        SEED_CUSTOMERS.map(c => ({ ...c, total_orders: 0, total_revenue: 0 })),
    );
    if (cErr) throw new Error("Customers: " + cErr.message);
    const { data: allCustomers } = await supabase.from("customers")
        .select("id, name, email, country, tax_office, tax_number, currency");
    const custMap = new Map((allCustomers ?? []).map(c => [c.name, c]));

    // ── 7. Quotes + lines + revizyon zinciri + arşiv PDF ────────────────────
    const quoteInsertRows = SEED_QUOTES.map(q => {
        const cust = custMap.get(q.customerName);
        const t = quoteTotals(q);
        return {
            quote_number: q.quoteNumber, quote_date: q.quoteDate,
            customer_id: cust?.id ?? null, customer_name: q.customerName,
            customer_email: cust?.email ?? null,
            currency: q.currency, status: q.status, valid_until: q.validUntil,
            vat_rate: 20, subtotal: t.subtotal, vat_total: t.vatTotal,
            grand_total: t.grandTotal, discount_amount: q.discountAmount,
            revision_no: q.revisionNo,
            delivery_method: q.deliveryMethod ?? null,
            payment_method: q.paymentMethod ?? null,
            notes: q.notes ?? null,
            ...(q.withSellerInfo ? {
                seller_name: SEED_COMPANY.name, seller_phone: SEED_COMPANY.phone,
                seller_email: SEED_COMPANY.email, seller_address: SEED_COMPANY.address,
                seller_tax_id: SEED_COMPANY.tax_no, seller_website: SEED_COMPANY.website,
            } : {}),
        };
    });
    const { data: insertedQuotes, error: qErr } = await supabase
        .from("quotes").insert(quoteInsertRows).select("id, quote_number");
    if (qErr) throw new Error("Quotes: " + qErr.message);
    const quoteIdByNumber = new Map((insertedQuotes ?? []).map(q => [q.quote_number, q.id]));

    // revizyon zinciri: rev2.root_quote_id → root id
    for (const q of SEED_QUOTES) {
        if (!q.rootQuoteNumber) continue;
        const selfId = quoteIdByNumber.get(q.quoteNumber);
        const rootId = quoteIdByNumber.get(q.rootQuoteNumber);
        if (selfId && rootId) {
            await supabase.from("quotes").update({ root_quote_id: rootId }).eq("id", selfId);
        }
    }

    const quoteLineRows: Array<Record<string, unknown>> = [];
    for (const q of SEED_QUOTES) {
        const quoteId = quoteIdByNumber.get(q.quoteNumber);
        if (!quoteId) continue;
        q.lines.forEach((l, idx) => {
            const prod = skuMap.get(l.sku);
            quoteLineRows.push({
                quote_id: quoteId, position: idx + 1,
                product_id: prod?.id ?? null, product_code: l.sku,
                description: l.description, quantity: l.quantity,
                unit_price: l.unitPrice,
                line_total: round2(l.quantity * l.unitPrice),
            });
        });
    }
    if (quoteLineRows.length > 0) {
        const { error } = await supabase.from("quote_line_items").insert(quoteLineRows);
        if (error) throw new Error("Quote line items: " + error.message);
    }
    await supabase.from("quote_yearly_counters")
        .upsert({ year, last_seq: SEED_QUOTES.length }, { onConflict: "year" });

    // Arşiv PDF'leri (sentetik — quote-pdfs bucket, demo/ prefix)
    const archiveIdByQuoteNumber = new Map<string, string>();
    let archiveCount = 0;
    for (const q of SEED_QUOTES) {
        if (!q.withPdfArchive) continue;
        const quoteId = quoteIdByNumber.get(q.quoteNumber);
        if (!quoteId) continue;
        const pdf = buildMiniPdf(`Teklif ${q.quoteNumber} (rev ${q.revisionNo})`, [
            SEED_COMPANY.name,
            `Musteri: ${q.customerName}`,
            `Para birimi: ${q.currency} — Toplam: ${quoteTotals(q).grandTotal}`,
            "DEMO ARSIV — sentetik icerik",
        ]);
        const path = await uploadDemoFile(
            supabase, "quote-pdfs", `${q.quoteNumber}-rev${q.revisionNo}.pdf`,
            pdf, "application/pdf", warnings,
        );
        if (!path) continue;
        const { data: arch, error } = await supabase.from("quote_pdf_archives").insert({
            quote_id: quoteId, revision_no: q.revisionNo, file_path: path,
            content_hash: createHash("sha256").update(pdf).digest("hex"),
            byte_size: pdf.length,
        }).select("id").single();
        if (error) { warnings.push(`quote_pdf_archives ${q.quoteNumber}: ${error.message}`); continue; }
        archiveIdByQuoteNumber.set(q.quoteNumber, arch.id);
        archiveCount++;
    }

    // ── 8. Sales orders + lines ─────────────────────────────────────────────
    const orderRows = SEED_ORDERS.map(o => {
        const cust = custMap.get(o.customerName);
        const t = orderTotals(o);
        return {
            order_number: o.orderNumber,
            customer_id: cust?.id ?? null, customer_name: o.customerName,
            customer_email: cust?.email ?? null, customer_country: cust?.country ?? null,
            customer_tax_office: cust?.tax_office ?? null, customer_tax_number: cust?.tax_number ?? null,
            commercial_status: o.commercial, fulfillment_status: o.fulfillment,
            currency: o.currency,
            subtotal: t.subtotal, vat_total: t.vatTotal, grand_total: t.grandTotal,
            item_count: o.lines.length, notes: o.notes ?? null,
            quote_valid_until: o.quoteValidUntil ?? null,
            planned_shipment_date: o.plannedShipmentDate ?? null,
            quote_id: o.quoteNumber ? quoteIdByNumber.get(o.quoteNumber) ?? null : null,
            discount_amount: o.discountAmount ?? 0,
            source_quote_revision_no: o.sourceQuoteRevisionNo ?? null,
            quote_pdf_archive_id: o.quoteNumber
                ? archiveIdByQuoteNumber.get(o.quoteNumber) ?? null : null,
            ai_risk_level: o.aiRisk ?? null, ai_confidence: o.aiConfidence ?? null,
            ai_reason: o.aiReason ?? null,
            parasut_invoice_id: o.parasutInvoiceId ?? null,
            parasut_sent_at: o.parasutSentAt ?? null,
            parasut_error: o.parasutError ?? null,
            created_at: daysAgoISO(o.createdDaysAgo),
        };
    });
    const { data: insertedOrders, error: oErr } = await supabase
        .from("sales_orders").insert(orderRows).select("id, order_number");
    if (oErr) throw new Error("Orders: " + oErr.message);
    const orderIdMap = new Map((insertedOrders ?? []).map(o => [o.order_number, o.id]));
    await supabase.from("order_counters")
        .upsert({ year, last_seq: SEED_ORDERS.length }, { onConflict: "year" });

    const lineRows: Array<Record<string, unknown>> = [];
    for (const o of SEED_ORDERS) {
        const orderId = orderIdMap.get(o.orderNumber);
        if (!orderId) continue;
        o.lines.forEach((l, idx) => {
            const prod = bySku(l.sku);
            lineRows.push({
                order_id: orderId, product_id: prod.id, product_name: prod.name,
                product_sku: l.sku, unit: prod.unit,
                quantity: l.qty, unit_price: l.price, discount_pct: l.disc,
                line_total: round2(l.qty * l.price * (1 - l.disc / 100)),
                sort_order: idx + 1,
            });
        });
    }
    const { data: insertedLines, error: lErr } = await supabase
        .from("order_lines").insert(lineRows).select("id, order_id, product_id, quantity");
    if (lErr) throw new Error("Order lines: " + lErr.message);

    // ── 9. Rezervasyon + shortage + products.reserved senkronu ──────────────
    // 082 modeli: taahhüt (pending_approval VEYA approved) rezerv tutar.
    const reservationRows: Array<Record<string, unknown>> = [];
    const shortageRows: Array<Record<string, unknown>> = [];
    const productReservedQty = new Map<string, number>();
    // kalan-müsait takibi (partially_allocated kısmi rezervi deterministik yapar)
    const remainingAvail = new Map<string, number>();
    for (const p of allProducts ?? []) remainingAvail.set(p.id, p.on_hand);

    const reservesStock = (o: SeedOrder) =>
        (o.commercial === "approved" || o.commercial === "pending_approval") &&
        o.fulfillment !== "unallocated";

    for (const o of SEED_ORDERS) {
        if (!reservesStock(o)) continue;
        const orderId = orderIdMap.get(o.orderNumber);
        if (!orderId) continue;
        const orderLines = (insertedLines ?? []).filter(l => l.order_id === orderId);

        for (const ol of orderLines) {
            if (o.fulfillment === "partially_shipped") {
                const shippedQty = Math.ceil(ol.quantity / 2);
                const openQty = ol.quantity - shippedQty;
                if (shippedQty > 0) {
                    reservationRows.push({
                        product_id: ol.product_id, order_id: orderId, order_line_id: ol.id,
                        reserved_qty: shippedQty, status: "shipped",
                    });
                }
                if (openQty > 0) {
                    reservationRows.push({
                        product_id: ol.product_id, order_id: orderId, order_line_id: ol.id,
                        reserved_qty: openQty, status: "open",
                    });
                    productReservedQty.set(ol.product_id, (productReservedQty.get(ol.product_id) ?? 0) + openQty);
                    remainingAvail.set(ol.product_id, (remainingAvail.get(ol.product_id) ?? 0) - openQty);
                }
                continue;
            }
            if (o.fulfillment === "shipped") {
                reservationRows.push({
                    product_id: ol.product_id, order_id: orderId, order_line_id: ol.id,
                    reserved_qty: ol.quantity, status: "shipped",
                });
                continue;
            }
            // allocated / partially_allocated → open rezerv (yetmezse shortage)
            const avail = Math.max(0, remainingAvail.get(ol.product_id) ?? 0);
            const reserveQty = Math.min(ol.quantity, avail);
            if (reserveQty > 0) {
                reservationRows.push({
                    product_id: ol.product_id, order_id: orderId, order_line_id: ol.id,
                    reserved_qty: reserveQty, status: "open",
                });
                productReservedQty.set(ol.product_id, (productReservedQty.get(ol.product_id) ?? 0) + reserveQty);
                remainingAvail.set(ol.product_id, avail - reserveQty);
            }
            if (reserveQty < ol.quantity) {
                shortageRows.push({
                    order_id: orderId, order_line_id: ol.id, product_id: ol.product_id,
                    requested_qty: ol.quantity, available_qty: reserveQty,
                    shortage_qty: ol.quantity - reserveQty, status: "open",
                });
            }
        }
    }
    if (reservationRows.length > 0) {
        const { error } = await supabase.from("stock_reservations").insert(reservationRows);
        if (error) throw new Error("Reservations: " + error.message);
    }
    if (shortageRows.length > 0) {
        const { error } = await supabase.from("shortages").insert(shortageRows);
        if (error) throw new Error("Shortages: " + error.message);
    }
    for (const [productId, totalReserved] of productReservedQty) {
        await supabase.from("products").update({ reserved: totalReserved }).eq("id", productId);
    }

    // ── 10. BOM + üretim + taahhütler ───────────────────────────────────────
    const bomRows = SEED_BOM.map(b => ({
        finished_product_id: bySku(b.finished).id,
        component_product_id: bySku(b.component).id,
        quantity: b.qty, unit: b.unit, notes: b.notes,
    }));
    if (bomRows.length > 0) {
        const { error } = await supabase.from("bills_of_materials").insert(bomRows);
        if (error) throw new Error("BOM: " + error.message);
    }

    const prodRows = SEED_PRODUCTION.map(e => {
        const prod = bySku(e.sku);
        return {
            product_id: prod.id, product_name: prod.name, product_sku: e.sku,
            produced_qty: e.qty, scrap_qty: e.scrap,
            waste_reason: e.scrap > 0 ? e.notes : null,
            production_date: e.date, notes: e.notes,
        };
    });
    if (prodRows.length > 0) {
        const { error } = await supabase.from("production_entries").insert(prodRows);
        if (error) throw new Error("Production: " + error.message);
    }

    const commitRows = SEED_COMMITMENTS.map(c => ({
        product_id: bySku(c.sku).id, quantity: c.qty, expected_date: c.date,
        supplier_name: c.supplier, status: c.status, notes: c.notes,
        received_at: c.status === "received" ? c.date : null,
    }));
    if (commitRows.length > 0) {
        const { error } = await supabase.from("purchase_commitments").insert(commitRows);
        if (error) throw new Error("Purchase commitments: " + error.message);
    }

    // ── 11. Purchase orders + lines (+ junction adayı) ──────────────────────
    const poIdByNumber = new Map<string, string>();
    const poLineIdForRec: string[] = [];
    for (const po of SEED_POS) {
        const vendorId = vendorMap.get(po.vendorName);
        if (!vendorId) throw new Error("Seed iç tutarsızlık — vendor yok: " + po.vendorName);
        const t = poTotals(po);
        const { data: poRow, error } = await supabase.from("purchase_orders").insert({
            po_number: po.poNumber, vendor_id: vendorId, status: po.status,
            order_date: daysAgo(po.orderDaysAgo), expected_date: po.expectedDate,
            currency: po.currency,
            subtotal: t.subtotal, vat_rate: 0.20, vat_total: t.vatTotal, grand_total: t.grandTotal,
            notes: po.notes,
            sent_at: ["sent", "confirmed", "partially_received", "received"].includes(po.status)
                ? daysAgoISO(po.orderDaysAgo - 1) : null,
            confirmed_at: ["confirmed", "partially_received", "received"].includes(po.status)
                ? daysAgoISO(Math.max(0, po.orderDaysAgo - 3)) : null,
            created_by: "demo-seed",
            created_at: daysAgoISO(po.orderDaysAgo),
        }).select("id").single();
        if (error) throw new Error(`PO ${po.poNumber}: ` + error.message);
        poIdByNumber.set(po.poNumber, poRow.id);

        const { data: poLines, error: plErr } = await supabase.from("purchase_order_lines").insert(
            po.lines.map(l => ({
                po_id: poRow.id, product_id: bySku(l.sku).id,
                quantity: l.qty, unit_price: l.unitPrice, discount_pct: 0,
                line_total: round2(l.qty * l.unitPrice), received_qty: l.receivedQty,
            })),
        ).select("id");
        if (plErr) throw new Error(`PO lines ${po.poNumber}: ` + plErr.message);
        if (po.linkRecommendationLineIdx != null && poLines?.[po.linkRecommendationLineIdx]) {
            poLineIdForRec.push(poLines[po.linkRecommendationLineIdx].id);
        }
    }
    await supabase.from("po_counters")
        .upsert({ year, last_seq: SEED_POS.length }, { onConflict: "year" });

    // ── 12. Depo bakiyeleri + tedarikçi bağları (084) ───────────────────────
    const { error: slbErr } = await supabase.from("stock_location_balances").insert(
        SEED_LOCATION_BALANCES.map(b => ({
            product_id: bySku(b.sku).id, location: b.location, quantity: b.quantity,
        })),
    );
    if (slbErr) throw new Error("Stock location balances: " + slbErr.message);

    const { error: pvlErr } = await supabase.from("product_vendor_links").insert(
        SEED_VENDOR_LINKS.map(l => ({
            product_id: bySku(l.sku).id, vendor_id: vendorMap.get(l.vendor),
            vendor_sku: l.vendorSku, lead_time_days: l.leadDays, moq: l.moq,
            is_preferred: l.preferred,
        })),
    );
    if (pvlErr) throw new Error("Product vendor links: " + pvlErr.message);

    // ── 13. Hareketler (üretim + PO teslim + sevkiyat + sayım) ──────────────
    const movementRows: Array<Record<string, unknown>> = [];
    for (const e of SEED_PRODUCTION) {
        const prod = bySku(e.sku);
        movementRows.push({
            product_id: prod.id, movement_type: "production", quantity: e.qty,
            reference_type: "production_entry",
            notes: `Üretim: ${e.qty} ${prod.unit} ${prod.name}`,
            occurred_at: e.date + "T08:00:00Z", source: "system",
        });
    }
    for (const po of SEED_POS) {
        for (const l of po.lines) {
            if (l.receivedQty <= 0) continue;
            movementRows.push({
                product_id: bySku(l.sku).id, movement_type: "receipt", quantity: l.receivedQty,
                reference_type: "manual",
                notes: `PO teslimi: ${po.poNumber} — ${l.receivedQty} adet (${po.vendorName})`,
                occurred_at: daysAgoISO(Math.max(1, po.orderDaysAgo - 12)), source: "system",
            });
        }
    }
    for (const o of SEED_ORDERS) {
        if (o.fulfillment !== "shipped" && o.fulfillment !== "partially_shipped") continue;
        for (const l of o.lines) {
            const prod = bySku(l.sku);
            const qty = o.fulfillment === "partially_shipped" ? Math.ceil(l.qty / 2) : l.qty;
            movementRows.push({
                product_id: prod.id, movement_type: "shipment", quantity: -qty,
                reference_type: "order", reference_id: orderIdMap.get(o.orderNumber),
                notes: `Sevkiyat: ${o.orderNumber} — ${qty} ${prod.unit}`,
                occurred_at: daysAgoISO(Math.max(1, o.createdDaysAgo - 5)), source: "system",
            });
        }
    }
    movementRows.push({
        product_id: bySku("BE-SC-M24x100-B7").id, movement_type: "adjustment", quantity: 200,
        reference_type: "manual",
        notes: "Sayım düzeltmesi — 200 adet fazla tespit edildi",
        occurred_at: daysAgoISO(6), source: "ui",
    });
    if (movementRows.length > 0) {
        const { error } = await supabase.from("inventory_movements").insert(movementRows);
        if (error) throw new Error("Movements: " + error.message);
    }

    // ── 14. Shipments + invoices + payments ─────────────────────────────────
    const shipmentRows = [
        {
            shipment_number: "SVK-2026-0001", order_id: orderIdMap.get("ORD-2026-0011"),
            order_number: "ORD-2026-0011", shipment_date: daysAgo(19),
            transport_type: "Karayolu — TIR", net_weight_kg: 520, gross_weight_kg: 580,
            notes: "Enerjisa — regülatör + saplama teslimatı",
        },
        {
            shipment_number: "SVK-2026-0002", order_id: orderIdMap.get("ORD-2026-0009"),
            order_number: "ORD-2026-0009", shipment_date: daysAgo(2),
            transport_type: "Karayolu — Kamyonet", net_weight_kg: 140, gross_weight_kg: 165,
            notes: "Abdi İbrahim — kısmi sevkiyat (1. parti)",
        },
        {
            shipment_number: "SVK-2026-0003", order_id: orderIdMap.get("ORD-2026-0012"),
            order_number: "ORD-2026-0012", shipment_date: daysAgo(17),
            transport_type: "Karayolu — TIR", net_weight_kg: 900, gross_weight_kg: 980,
            notes: "Botaş — fitting lotu",
        },
    ].filter(s => s.order_id);
    if (shipmentRows.length > 0) {
        const { error } = await supabase.from("shipments").insert(shipmentRows);
        if (error) throw new Error("Shipments: " + error.message);
    }

    const grandOf = (num: string) => {
        const o = SEED_ORDERS.find(x => x.orderNumber === num);
        return o ? orderTotals(o).grandTotal : 0;
    };
    const invoiceRows = [
        {
            invoice_number: "FTR-2026-0001", invoice_date: daysAgo(19),
            order_id: orderIdMap.get("ORD-2026-0011"), order_number: "ORD-2026-0011",
            customer_id: custMap.get("Enerjisa Üretim Santralleri")?.id,
            currency: "USD", amount: grandOf("ORD-2026-0011"),
            due_date: daysLater(26), status: "open" as const,
            notes: "Enerjisa — Paraşüt'e başarıyla aktarıldı",
        },
        {
            invoice_number: "FTR-2026-0002", invoice_date: daysAgo(2),
            order_id: orderIdMap.get("ORD-2026-0009"), order_number: "ORD-2026-0009",
            customer_id: custMap.get("Abdi İbrahim İlaç A.Ş.")?.id,
            currency: "EUR", amount: round2(grandOf("ORD-2026-0009") / 2),
            due_date: daysLater(28), status: "partially_paid" as const,
            notes: "Abdi İbrahim — kısmi sevkiyat faturası",
        },
        {
            invoice_number: "FTR-2026-0003", invoice_date: daysAgo(17),
            order_id: orderIdMap.get("ORD-2026-0012"), order_number: "ORD-2026-0012",
            customer_id: custMap.get("Botaş Doğalgaz İşletmeleri")?.id,
            currency: "TRY", amount: grandOf("ORD-2026-0012"),
            due_date: daysAgo(2), status: "open" as const,        // vadesi geçmiş alacak
            notes: "Botaş — vade geçti, tahsilat takipte",
        },
    ].filter(i => i.order_id);
    const { data: insertedInvoices, error: iErr } = await supabase
        .from("invoices").insert(invoiceRows).select("id, invoice_number");
    if (iErr) throw new Error("Invoices: " + iErr.message);

    const inv2 = insertedInvoices?.find(i => i.invoice_number === "FTR-2026-0002");
    const paymentRows = inv2 ? [{
        payment_number: "ODM-2026-0001",
        invoice_id: inv2.id, invoice_number: inv2.invoice_number,
        payment_date: daysAgo(1),
        amount: round2((invoiceRows.find(i => i.invoice_number === "FTR-2026-0002")?.amount ?? 0) * 0.5),
        currency: "EUR", payment_method: "Havale/EFT",
        notes: "Abdi İbrahim — kısmi ödeme (%50)",
    }] : [];
    if (paymentRows.length > 0) {
        const { error } = await supabase.from("payments").insert(paymentRows);
        if (error) throw new Error("Payments: " + error.message);
    }

    // ── 15. AI önerileri + feedback + PO junction ───────────────────────────
    const recRows = [
        {
            entity_type: "product", entity_id: bySku("FWBV-DN400-PN80-PH").id,
            recommendation_type: "purchase_suggestion",
            title: "FWBV DN400 — Acil Sipariş",
            body: "Stok kritik (3 adet, min 4). Star Rafineri siparişi 3 adet shortage'da; Langge 60 gün lead.",
            confidence: 0.93, severity: "critical", status: "suggested",
            model_version: "claude-haiku-demo",
            metadata: { suggestQty: 4, urgencyLevel: "high", supplier: "China Langge Valve Technology Co., Ltd" },
        },
        {
            entity_type: "product", entity_id: bySku("FIT-TEE-DN200-20S").id,
            recommendation_type: "purchase_suggestion",
            title: "Eşit Te DN200 — Sipariş Tarihi Geçti",
            body: "Günlük tüketim 8; mevcut stok ~4 günlük. 60 gün lead time ile sipariş tarihi geçti.",
            confidence: 0.88, severity: "warning", status: "suggested",
            model_version: "claude-haiku-demo",
            metadata: { suggestQty: 120, urgencyLevel: "high" },
        },
        {
            entity_type: "product", entity_id: bySku("INS-GPR-DN100").id,
            recommendation_type: "purchase_suggestion",
            title: "Gaz Regülatörü DN100 — Yeniden Sipariş",
            body: "Almanya 45 gün transit; öneri kabul edildi ve PO-2026-0003 açıldı.",
            confidence: 0.85, severity: "warning", status: "accepted",
            model_version: "claude-haiku-demo",
            metadata: { suggestQty: 6, urgencyLevel: "moderate", supplier: "Albrecht-Automatik GmbH" },
            decided_at: daysAgoISO(10),
        },
        {
            entity_type: "product", entity_id: bySku("CKV-DD-DN150-PN16-WCB").id,
            recommendation_type: "purchase_suggestion",
            title: "Çekvalf DN150 — Önerilen Tedarik",
            body: "Stok uyarı bandında; tedarik şu an zorunlu değil.",
            confidence: 0.62, severity: "info", status: "rejected",
            model_version: "claude-haiku-demo",
            metadata: { suggestQty: 40, urgencyLevel: "moderate" },
            decided_at: daysAgoISO(1),
        },
        {
            entity_type: "product", entity_id: bySku("KST-600-DN20-A105-NPT").id,
            recommendation_type: "stock_risk",
            title: "Kondenstop — Tüketim Artışı",
            body: "Son 30 günde günlük tüketim arttı; öneri adedi elle güncellendi.",
            confidence: 0.79, severity: "warning", status: "edited",
            model_version: "claude-haiku-demo",
            metadata: { suggestQty: 100, urgencyLevel: "moderate" },
            edited_metadata: { suggestQty: 150 },
            decided_at: daysAgoISO(1),
        },
    ];
    const { data: insertedRecs, error: arErr } = await supabase
        .from("ai_recommendations").insert(recRows).select("id, status");
    if (arErr) throw new Error("AI recommendations: " + arErr.message);

    const feedbackRows: Array<Record<string, unknown>> = [];
    let acceptedRecId: string | null = null;
    for (const r of insertedRecs ?? []) {
        if (r.status === "accepted") {
            acceptedRecId = r.id;
            feedbackRows.push({ recommendation_id: r.id, feedback_type: "accepted", actor: "demo-user" });
        } else if (r.status === "rejected") {
            feedbackRows.push({ recommendation_id: r.id, feedback_type: "rejected", feedback_note: "Şu an gerek yok.", actor: "demo-user" });
        } else if (r.status === "edited") {
            feedbackRows.push({ recommendation_id: r.id, feedback_type: "edited", edited_values: { suggestQty: 150 }, actor: "demo-user" });
        }
    }
    if (feedbackRows.length > 0) {
        const { error } = await supabase.from("ai_feedback").insert(feedbackRows);
        if (error) throw new Error("AI feedback: " + error.message);
    }
    // accepted öneri ↔ PO-2026-0003 satırı (049 junction)
    if (acceptedRecId && poLineIdForRec.length > 0) {
        const { error } = await supabase.from("po_line_recommendations").insert({
            po_line_id: poLineIdForRec[0], recommendation_id: acceptedRecId,
        });
        if (error) warnings.push("po_line_recommendations: " + error.message);
    }

    // ── 16. Import batches + drafts (eski akış) ─────────────────────────────
    const { data: insertedBatches, error: ibErr } = await supabase.from("import_batches").insert([
        {
            file_name: "urunler-subat-2026.xlsx", file_size: 184_320, status: "confirmed",
            parse_result: { sheet_count: 1, row_count: 3 }, confidence: 0.92,
            created_by: "demo-user", confirmed_at: daysAgoISO(7),
        },
        {
            file_name: "musteri-listesi.csv", file_size: 12_400, status: "review",
            parse_result: { sheet_count: 1, row_count: 4 }, confidence: 0.78,
            created_by: "demo-user",
        },
    ]).select("id, file_name");
    if (ibErr) throw new Error("Import batches: " + ibErr.message);
    const batchB = insertedBatches?.find(b => b.file_name === "musteri-listesi.csv");
    const draftRows: Array<Record<string, unknown>> = [];
    if (batchB) {
        draftRows.push(
            {
                batch_id: batchB.id, entity_type: "customer",
                raw_data: { name: "Yeni Müşteri Ltd.", tax_no: "1234567890" },
                parsed_data: { name: "Yeni Müşteri Ltd.", tax_no: "1234567890" },
                confidence: 0.88, status: "pending",
            },
            {
                batch_id: batchB.id, entity_type: "customer",
                raw_data: { name: "Eksik Bilgili A.Ş.", tax_no: null },
                parsed_data: { name: "Eksik Bilgili A.Ş." },
                ai_reason: "tax_no boş; manuel düzeltme gerekiyor",
                unmatched_fields: { tax_no: "missing" },
                confidence: 0.62, status: "pending",
            },
            {
                batch_id: batchB.id, entity_type: "customer",
                raw_data: { name: "Tüpraş İzmit", tax_no: "6440012345" },
                parsed_data: { name: "Tüpraş İzmit Rafinerisi", tax_no: "6440012345" },
                user_corrections: { name: "Tüpraş İzmit Rafinerisi" },
                confidence: 0.96, status: "pending",
            },
        );
        const { error } = await supabase.from("import_drafts").insert(draftRows);
        if (error) throw new Error("Import drafts: " + error.message);
    }

    // ── 17. Import documents + lines (AI kuyruğu — 061-086) ─────────────────
    let importDocCount = 0;
    let importLineCount = 0;
    for (const doc of SEED_IMPORT_DOCUMENTS) {
        let filePath = `${SEED_STORAGE_PREFIX}/${doc.fileName}`;
        let fileSize = 4096;
        if (doc.pdfTitle) {
            const pdf = buildMiniPdf(doc.pdfTitle, doc.pdfLines ?? []);
            const uploaded = await uploadDemoFile(
                supabase, "product-files", doc.fileName, pdf, "application/pdf", warnings);
            if (uploaded) { filePath = uploaded; fileSize = pdf.length; }
        }
        const { data: docRow, error } = await supabase.from("import_documents").insert({
            file_path: filePath, file_name: doc.fileName, file_size: fileSize,
            mime_type: doc.mime, classification: doc.classification, status: doc.status,
            classified_at: daysAgoISO(doc.createdDaysAgo),
            created_at: daysAgoISO(doc.createdDaysAgo),
        }).select("id").single();
        if (error) throw new Error(`Import document ${doc.fileName}: ` + error.message);
        importDocCount++;

        if (doc.lines.length > 0) {
            const { error: dlErr } = await supabase.from("import_document_lines").insert(
                doc.lines.map(l => ({
                    document_id: docRow.id, line_number: l.lineNumber,
                    extraction_type: "product",
                    extracted_name: l.extractedName, extracted_sku: l.extractedSku,
                    extracted_attributes: l.attributes,
                    extracted_core_fields: l.coreFields ?? {},
                    source_page: l.sourcePage,
                    matched_product_id: l.matchSku ? bySku(l.matchSku).id : null,
                    match_confidence: l.confidence,
                    match_action: l.matchAction,
                })),
            );
            if (dlErr) throw new Error(`Import document lines ${doc.fileName}: ` + dlErr.message);
            importLineCount += doc.lines.length;
        }
    }

    // ── 18. column_mappings + ai_entity_aliases ─────────────────────────────
    await supabase.from("column_mappings").insert([
        { source_column: "Ürün Kodu", normalized: "urun_kodu", entity_type: "product", target_field: "sku", usage_count: 5, success_count: 4 },
        { source_column: "Stok Adedi", normalized: "stok_adedi", entity_type: "product", target_field: "on_hand", usage_count: 3, success_count: 3 },
        { source_column: "Vergi No", normalized: "vergi_no", entity_type: "customer", target_field: "tax_number", usage_count: 8, success_count: 7 },
    ]);
    const tupras = custMap.get("Tüpraş İzmit Rafinerisi");
    const dgv = skuMap.get("DGV-800-DN25-A105");
    const aliasRows: Array<Record<string, unknown>> = [];
    if (tupras) aliasRows.push({ raw_value: "Tupras", normalized: "tupras", entity_type: "customer", resolved_id: tupras.id, resolved_name: tupras.name });
    if (dgv) aliasRows.push({ raw_value: "dovme gate dn25", normalized: "dovme gate dn25", entity_type: "product", resolved_id: dgv.id, resolved_name: dgv.name });
    if (aliasRows.length > 0) await supabase.from("ai_entity_aliases").insert(aliasRows);

    // ── 19. Sync logs + audit log ───────────────────────────────────────────
    const syncLogRows = [
        {
            entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0011"),
            direction: "push", status: "success", external_id: "PARASUT-INV-48211",
            retry_count: 0, requested_at: daysAgoISO(19), completed_at: daysAgoISO(19), source: "system",
        },
        {
            entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0012"),
            direction: "push", status: "error",
            error_message: "VKN doğrulanamadı — eşleşme hatası",
            retry_count: 2, requested_at: daysAgoISO(17), source: "system",
        },
        {
            entity_type: "customer", entity_id: tupras?.id,
            direction: "push", status: "success", external_id: "CST-DEMO-1001",
            retry_count: 0, requested_at: daysAgoISO(30), completed_at: daysAgoISO(30), source: "system",
        },
        {
            entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0006"),
            direction: "push", status: "retrying",
            error_message: "Geçici timeout — tekrar denenecek",
            retry_count: 1, requested_at: daysAgoISO(1), source: "scheduled",
        },
    ].filter(s => s.entity_id);
    if (syncLogRows.length > 0) {
        const { error } = await supabase.from("integration_sync_logs").insert(syncLogRows);
        if (error) throw new Error("Sync logs: " + error.message);
    }

    const auditRows = [
        { action: "order_created", entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0006"), occurred_at: daysAgoISO(6), source: "ui" },
        { action: "order_approved", entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0006"), occurred_at: daysAgoISO(5), source: "ui" },
        { action: "quote_accepted", entity_type: "quote", entity_id: quoteIdByNumber.get("TKL-2026-006"), occurred_at: daysAgoISO(3), source: "ui" },
        { action: "order_shipped", entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0011"), occurred_at: daysAgoISO(19), source: "system" },
        { action: "order_cancelled", entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0014"), occurred_at: daysAgoISO(15), source: "ui" },
        { action: "stock_adjusted", entity_type: "product", entity_id: bySku("BE-SC-M24x100-B7").id, occurred_at: daysAgoISO(6), source: "ui" },
        { action: "production_logged", entity_type: "product", entity_id: bySku("DGV-800-DN25-A105").id, occurred_at: todayStr + "T08:30:00Z", source: "ui" },
        { action: "po_created", entity_type: "purchase_order", entity_id: poIdByNumber.get("PO-2026-0003"), occurred_at: daysAgoISO(10), source: "ui" },
        { action: "rec_accepted", entity_type: "product", entity_id: bySku("INS-GPR-DN100").id, occurred_at: daysAgoISO(10), source: "ui" },
    ].filter(a => a.entity_id);
    if (auditRows.length > 0) {
        const { error } = await supabase.from("audit_log").insert(auditRows);
        if (error) throw new Error("Audit log: " + error.message);
    }

    // ── 20. Takvim notları (092) ────────────────────────────────────────────
    const { error: cnErr } = await supabase.from("calendar_notes").insert(
        SEED_CALENDAR_NOTES.map(n => ({
            title: n.title, description: n.description,
            note_date: n.noteDate, note_time: n.noteTime,
            visibility: n.visibility, owner_id: null, owner_label: "Demo Seed",
        })),
    );
    if (cnErr) throw new Error("Calendar notes: " + cnErr.message);

    // ── 21. Şirket dosyaları (091 — sentetik, demo/ prefix) ─────────────────
    let companyFileCount = 0;
    for (const f of SEED_COMPANY_FILES) {
        const body = f.ext === "png"
            ? buildPlaceholderPng([42, 98, 154])
            : buildMiniPdf(f.pdfTitle ?? f.displayName, f.pdfLines ?? []);
        const contentType = f.mime;
        const safeName = f.displayName.toLowerCase()
            .replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") + "." + f.ext;
        const path = await uploadDemoFile(supabase, "company-files", safeName, body, contentType, warnings);
        if (!path) continue;
        const { error } = await supabase.from("company_files").insert({
            display_name: f.displayName, description: f.description, category: f.category,
            ext: f.ext, file_path: path, file_size: body.length, mime_type: contentType,
            uploaded_by: "Demo Seed",
        });
        if (error) { warnings.push(`company_files ${f.displayName}: ${error.message}`); continue; }
        companyFileCount++;
    }

    // ── 22. Ürün ekleri (058 — datasheet PDF + primary görsel PNG) ──────────
    let attachmentCount = 0;
    const attachmentPlan = [
        { sku: "DGV-800-DN25-A105", kind: "datasheet", title: "Dovme Gate Valf 800LB Datasheet" },
        { sku: "DGLB-800-DN25-A105", kind: "datasheet", title: "Dovme Glob Valf 800LB Datasheet" },
        { sku: "SWG-150-DN200-SS304", kind: "datasheet", title: "Spiral Sarimli Conta Teknik Belge" },
        { sku: "DGV-800-DN25-A105", kind: "image", title: null },
        { sku: "FWBV-DN400-PN80-PH", kind: "image", title: null },
    ] as const;
    for (const a of attachmentPlan) {
        const prod = bySku(a.sku);
        const isImage = a.kind === "image";
        const body = isImage
            ? buildPlaceholderPng([54, 120, 92])
            : buildMiniPdf(a.title ?? prod.name, [prod.name, "DEMO BELGE — sentetik icerik"]);
        const fileName = `${a.sku}-${a.kind}.${isImage ? "png" : "pdf"}`;
        const path = await uploadDemoFile(
            supabase, "product-files", fileName, body,
            isImage ? "image/png" : "application/pdf", warnings);
        if (!path) continue;
        const { error } = await supabase.from("product_attachments").insert({
            product_id: prod.id, file_path: path, file_name: fileName,
            file_size: body.length, mime_type: isImage ? "image/png" : "application/pdf",
            kind: a.kind, is_primary_image: isImage,
        });
        if (error) { warnings.push(`product_attachments ${fileName}: ${error.message}`); continue; }
        attachmentCount++;
    }

    // ── 23. E-posta logları (047/096 — SAHTE GEÇMİŞ; gönderim YOK) ──────────
    let emailLogCount = 0;
    if (firstUserId) {
        const emailRows = SEED_EMAIL_LOGS.map(e => {
            const entityId = e.entity === "quote" && e.entityRef
                ? quoteIdByNumber.get(e.entityRef) ?? null
                : e.entity === "order" && e.entityRef
                    ? orderIdMap.get(e.entityRef) ?? null
                    : null;
            return {
                user_id: firstUserId, notification_type: e.notification_type,
                entity_type: e.entity, entity_id: entityId,
                recipient_email: e.recipient, subject: e.subject,
                status: e.status, error_message: e.errorMessage,
                attempt_count: e.attemptCount,
                last_attempt_at: e.sentDaysAgo != null ? daysAgoISO(e.sentDaysAgo) : daysAgoISO(0),
                sent_at: e.status === "sent" && e.sentDaysAgo != null ? daysAgoISO(e.sentDaysAgo) : null,
                ...(e.withBodySnapshot ? {
                    html_body: "<p>Sayın yetkili,</p><p>Teklifimiz ektedir (demo gövde — yeniden gönderim testi).</p>",
                    text_body: "Sayın yetkili,\nTeklifimiz ektedir (demo gövde — yeniden gönderim testi).",
                    body_expires_at: hoursLaterISO(24),
                } : {}),
            };
        });
        const { error } = await supabase.from("email_logs").insert(emailRows);
        if (error) warnings.push("email_logs: " + error.message);
        else emailLogCount = emailRows.length;
    } else {
        warnings.push("Auth kullanıcısı bulunamadı — email_logs atlandı (user_id NOT NULL).");
    }

    return {
        products: SEED_PRODUCTS.length,
        customers: SEED_CUSTOMERS.length,
        vendors: SEED_VENDORS.length,
        orders: SEED_ORDERS.length,
        order_lines: lineRows.length,
        quotes: SEED_QUOTES.length,
        quote_lines: quoteLineRows.length,
        quote_pdf_archives: archiveCount,
        purchase_orders: SEED_POS.length,
        reservations: reservationRows.length,
        shortages: shortageRows.length,
        bom: bomRows.length,
        purchase_commitments: commitRows.length,
        production: prodRows.length,
        movements: movementRows.length,
        shipments: shipmentRows.length,
        invoices: invoiceRows.length,
        payments: paymentRows.length,
        ai_recommendations: recRows.length,
        ai_feedback: feedbackRows.length,
        import_batches: 2,
        import_drafts: draftRows.length,
        import_documents: importDocCount,
        import_document_lines: importLineCount,
        stock_location_balances: SEED_LOCATION_BALANCES.length,
        product_vendor_links: SEED_VENDOR_LINKS.length,
        calendar_notes: SEED_CALENDAR_NOTES.length,
        company_files: companyFileCount,
        product_attachments: attachmentCount,
        email_logs: emailLogCount,
        demo_users: demoUsersCreated,
        sync_logs: syncLogRows.length,
        audit_log: auditRows.length,
        warnings,
    };
}

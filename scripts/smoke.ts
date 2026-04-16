/**
 * Smoke test script — kritik API akışlarını doğrular.
 *
 * Kullanım:
 *   npm run smoke                                  # localhost:3000
 *   BASE_URL=https://your-app.vercel.app npm run smoke
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;
const failures: string[] = [];

// ── Helpers ──────────────────────────────────────────────────

function ok(label: string) {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label: string, detail?: string) {
  const msg = detail ? `${label} — ${detail}` : label;
  console.error(`  ✗ ${msg}`);
  failed++;
  failures.push(msg);
}

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function post(path: string, payload?: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function patch(path: string, payload: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ── Tests ────────────────────────────────────────────────────

async function runHealthCheck() {
  console.log("\n[1] Health Check");
  const { status, body } = await get("/api/health");
  if (status === 200) {
    ok(`GET /api/health → ${status}`);
  } else {
    fail(`GET /api/health → ${status}`, JSON.stringify(body));
    // Health failure is fatal — DB/env not ready
    throw new Error("Health check failed — aborting smoke test");
  }
}

async function runProductsCheck(): Promise<string | null> {
  console.log("\n[2] Products");
  const { status, body } = await get("/api/products");
  if (status !== 200 || !Array.isArray(body)) {
    fail(`GET /api/products → ${status}`);
    return null;
  }
  ok(`GET /api/products → ${status} (${(body as unknown[]).length} ürün)`);
  if ((body as unknown[]).length === 0) {
    console.warn("  ⚠ Hiç ürün yok — sipariş testleri atlanacak");
    return null;
  }
  const first = (body as Array<{ id: string; name: string; sku: string; unit: string; price: number }>)[0];
  return first.id;
}

async function runOrderFlow(productId: string) {
  console.log("\n[3–6] Sipariş Akışı (oluştur → onayla → iptal)");

  // 3. Create draft order
  const lineTotal = 1200;
  const subtotal = 1000;
  const vatTotal = 200;
  const { status: createStatus, body: created } = await post("/api/orders", {
    customer_name: "[SMOKE TEST]",
    commercial_status: "draft",
    fulfillment_status: "unallocated",
    currency: "USD",
    subtotal,
    vat_total: vatTotal,
    grand_total: lineTotal,
    lines: [{
      product_id: productId,
      product_name: "Smoke Test Product",
      product_sku: "SMOKE-SKU",
      unit: "adet",
      quantity: 1,
      unit_price: subtotal,
      discount_pct: 0,
      line_total: lineTotal,
    }],
  });

  if (createStatus !== 201 || !(created as { id?: string })?.id) {
    fail(`POST /api/orders → ${createStatus}`, JSON.stringify(created));
    return;
  }
  const orderId = (created as { id: string }).id;
  ok(`POST /api/orders → 201 (id: ${orderId})`);

  // 4. draft → pending_approval
  const { status: s4 } = await patch(`/api/orders/${orderId}`, { transition: "pending_approval" });
  if (s4 === 200) {
    ok(`PATCH /api/orders/{id} draft → pending_approval → 200`);
  } else {
    fail(`PATCH /api/orders/{id} draft → pending_approval → ${s4}`);
  }

  // 5. pending_approval → approved (409 = stok yetersiz, kabul edilir)
  const { status: s5 } = await patch(`/api/orders/${orderId}`, { transition: "approved" });
  if (s5 === 200 || s5 === 409) {
    ok(`PATCH /api/orders/{id} → approved → ${s5} (200 ok, 409 stok yetersiz — ikisi de geçerli)`);
  } else {
    fail(`PATCH /api/orders/{id} → approved → ${s5}`);
  }

  // 6. cleanup: → cancelled
  const { status: s6 } = await patch(`/api/orders/${orderId}`, { transition: "cancelled" });
  if (s6 === 200) {
    ok(`PATCH /api/orders/{id} → cancelled → 200 (cleanup)`);
  } else {
    fail(`PATCH /api/orders/{id} → cancelled → ${s6}`);
  }
}

async function runAlertsCheck() {
  console.log("\n[7–8] Alerts");

  // 7. List alerts
  const { status: s7 } = await get("/api/alerts");
  if (s7 === 200) {
    ok(`GET /api/alerts → 200`);
  } else {
    fail(`GET /api/alerts → ${s7}`);
  }

  // 8. Scan
  const { status: s8, body: scanResult } = await post("/api/alerts/scan");
  if (s8 === 200 && scanResult !== null && typeof (scanResult as { scanned?: number }).scanned === "number") {
    const r = scanResult as { scanned: number; created: number; resolved: number };
    ok(`POST /api/alerts/scan → 200 (scanned: ${r.scanned}, created: ${r.created}, resolved: ${r.resolved})`);
  } else {
    fail(`POST /api/alerts/scan → ${s8}`, JSON.stringify(scanResult));
  }
}

async function runProductionCheck() {
  console.log("\n[9] Production");
  const { status } = await get("/api/production");
  if (status === 200) {
    ok(`GET /api/production → 200`);
  } else {
    fail(`GET /api/production → ${status}`);
  }
}

async function runShipOrderSmoke() {
  console.log("\n[11] ship_order_full — 011 UUID fix smoke testi");

  // 1. Kontrollü stoklu test ürünü oluştur
  const sku = `SMOKE-SHIP-${Date.now()}`;
  const { status: ps, body: product } = await post("/api/products", {
    name: "[SMOKE] Ship Test Product",
    sku,
    unit: "adet",
    price: 100,
    currency: "USD",
    on_hand: 10,
  });

  if (ps !== 201 || !(product as { id?: string })?.id) {
    fail("ship_order_full smoke: ürün oluşturulamadı", JSON.stringify(product));
    return;
  }
  const { id: productId } = product as { id: string };
  ok(`Ürün oluşturuldu (sku: ${sku}, on_hand: 10)`);

  // 2. Sipariş oluştur (qty=1, stok yeterli → tam tahsis garantili)
  const { status: os, body: order } = await post("/api/orders", {
    customer_name: "[SMOKE] Ship Test",
    commercial_status: "draft",
    fulfillment_status: "unallocated",
    currency: "USD",
    subtotal: 100,
    vat_total: 20,
    grand_total: 120,
    lines: [{
      product_id: productId,
      product_name: "[SMOKE] Ship Test Product",
      product_sku: sku,
      unit: "adet",
      quantity: 1,
      unit_price: 100,
      discount_pct: 0,
      line_total: 100,
    }],
  });

  if (os !== 201 || !(order as { id?: string })?.id) {
    fail("ship_order_full smoke: sipariş oluşturulamadı", JSON.stringify(order));
    await cleanupProduct(productId);
    return;
  }
  const { id: orderId } = order as { id: string };
  ok(`Sipariş oluşturuldu (id: ${orderId})`);

  // 3. draft → pending_approval
  const { status: s1 } = await patch(`/api/orders/${orderId}`, { transition: "pending_approval" });
  if (s1 !== 200) {
    fail(`ship_order_full smoke: pending_approval → ${s1}`);
    await cleanupProduct(productId);
    return;
  }

  // 4. pending_approval → approved; on_hand=10 > qty=1 → fulfillment_status "allocated" beklenir
  const { status: s2, body: approveBody } = await patch(`/api/orders/${orderId}`, { transition: "approved" });
  if (s2 !== 200) {
    fail(`ship_order_full smoke: approve → ${s2}`, JSON.stringify(approveBody));
    await cleanupProduct(productId);
    return;
  }
  const fulfillment = (approveBody as { fulfillment_status?: string })?.fulfillment_status;
  if (fulfillment !== "allocated") {
    fail(`ship_order_full smoke: fulfillment_status beklenen "allocated", alınan "${fulfillment}"`);
    await cleanupProduct(productId);
    return;
  }
  ok(`Sipariş onaylandı, fulfillment_status: ${fulfillment}`);

  // 5. approved → shipped — ship_order_full RPC çağrılır
  //    011 öncesinde p_order_id::text cast → inventory_movements.reference_id (uuid) type mismatch → hata
  //    011 sonrasında uuid doğrudan geçilir → başarılı sevkiyat
  const { status: s3, body: shipBody } = await patch(`/api/orders/${orderId}`, { transition: "shipped" });
  if (s3 !== 200) {
    fail(`ship_order_full smoke: sevk → ${s3} (uuid cast bug olabilir — migration 011 uygulandı mı?)`, JSON.stringify(shipBody));
    await cleanupProduct(productId);
    return;
  }
  ok(`ship_order_full → 200 ✓ (011 UUID fix doğrulandı)`);

  // 6. Cleanup: test ürününü soft-delete
  await cleanupProduct(productId);
  // Not: Sevk edilmiş sipariş DB'de kalır ([SMOKE] prefix ile filtreleriz)
}

async function cleanupProduct(productId: string): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/api/products/${productId}`, { method: "DELETE" });
    if (!res.ok) console.warn(`  ⚠ Cleanup: ürün silinemedi (${productId})`);
  } catch {
    console.warn(`  ⚠ Cleanup: ürün silme isteği başarısız (${productId})`);
  }
}

async function runImportCheck() {
  console.log("\n[10] Import Batch");
  const { status, body } = await post("/api/import", {
    file_name: "smoke-test.xlsx",
    file_size: 1024,
    created_by: "smoke-test",
  });
  if (status === 201 && (body as { id?: string })?.id) {
    ok(`POST /api/import → 201 (batchId: ${(body as { id: string }).id})`);
  } else {
    fail(`POST /api/import → ${status}`, JSON.stringify(body));
  }
}

// ── Yeni Test Fonksiyonları ──────────────────────────────────

async function runCustomersCheck() {
  console.log("\n[12] Customers");
  const { status, body } = await get("/api/customers");
  if (status !== 200 || !Array.isArray(body))
    fail(`GET /api/customers → ${status}`, JSON.stringify(body));
  else ok(`GET /api/customers → 200 (${(body as unknown[]).length} cari)`);
}

async function runPurchaseCommitmentsCheck() {
  console.log("\n[13] Purchase Commitments");
  const { status, body } = await get("/api/purchase-commitments");
  if (status !== 200 || !Array.isArray(body))
    fail(`GET /api/purchase-commitments → ${status}`, JSON.stringify(body));
  else ok(`GET /api/purchase-commitments → 200 (${(body as unknown[]).length} commitment)`);
}

async function runInventoryMovementsCheck(productId: string) {
  console.log("\n[14] Inventory Movements");
  // product_id olmadan 400 beklenir
  const { status: s1 } = await get("/api/inventory/movements");
  if (s1 === 400) ok("GET /api/inventory/movements (no product_id) → 400 ✓");
  else fail(`GET /api/inventory/movements (no product_id) → beklenen 400, alınan ${s1}`);

  // product_id ile 200 + Array beklenir
  const { status: s2, body } = await get(`/api/inventory/movements?product_id=${productId}`);
  if (s2 !== 200 || !Array.isArray(body))
    fail(`GET /api/inventory/movements?product_id → ${s2}`, JSON.stringify(body));
  else ok(`GET /api/inventory/movements?product_id → 200 (${(body as unknown[]).length} hareket)`);
}

async function runProductAgingCheck() {
  console.log("\n[15] Product Aging");
  const { status, body } = await get("/api/products/aging?type=all");
  if (status !== 200 || !Array.isArray(body)) {
    fail(`GET /api/products/aging → ${status}`, JSON.stringify(body));
    return;
  }
  const items = body as Array<Record<string, unknown>>;
  const badDays = items.find(p => p.daysWaiting !== null && typeof p.daysWaiting !== "number");
  if (badDays) { fail(`GET /api/products/aging — daysWaiting tipi yanlış (sku: ${badDays.sku})`); return; }
  const badCapital = items.find(p => typeof p.boundCapital === "number" && isNaN(p.boundCapital as number));
  if (badCapital) { fail(`GET /api/products/aging — boundCapital NaN (sku: ${badCapital.sku})`); return; }
  ok(`GET /api/products/aging → 200 (${items.length} ürün, tip kontrolleri geçti)`);
}

async function runProductQuotesCheck(productId: string) {
  console.log("\n[16] Product Quotes");
  const { status, body } = await get(`/api/products/${productId}/quotes`);
  const b = body as { items?: Array<{ quantity: number }>; totalQuoted?: unknown };
  if (status !== 200 || !Array.isArray(b?.items) || typeof b?.totalQuoted !== "number") {
    fail(`GET /api/products/{id}/quotes → ${status}`, JSON.stringify(body));
    return;
  }
  const calcSum = b.items.reduce((s, r) => s + r.quantity, 0);
  if (calcSum !== b.totalQuoted)
    fail(`GET /api/products/{id}/quotes — totalQuoted uyuşmazlığı (hesap: ${calcSum}, dönen: ${b.totalQuoted})`);
  else ok(`GET /api/products/{id}/quotes → 200 (totalQuoted: ${b.totalQuoted})`);
}

async function runPurchaseSuggestionsCheck() {
  console.log("\n[17] Purchase Suggestions");
  const { status, body } = await get("/api/purchase/suggestions");
  if (status !== 200 || !Array.isArray(body))
    fail(`GET /api/purchase/suggestions → ${status}`, JSON.stringify(body));
  else ok(`GET /api/purchase/suggestions → 200 (${(body as unknown[]).length} öneri)`);
}

async function runPurchaseScanCheck() {
  console.log("\n[18] Purchase Scan");
  const { status, body } = await post("/api/purchase/scan");
  const b = body as { scanned?: unknown; created?: unknown; resolved?: unknown };
  if (status !== 200 || typeof b.scanned !== "number" || typeof b.created !== "number" || typeof b.resolved !== "number")
    fail(`POST /api/purchase/scan → ${status}`, JSON.stringify(body));
  else ok(`POST /api/purchase/scan → 200 (scanned: ${b.scanned}, created: ${b.created}, resolved: ${b.resolved})`);
}

async function runExpireQuotesCheck() {
  console.log("\n[19] Expire Quotes");
  const { status, body } = await post("/api/orders/expire-quotes");
  const b = body as { expired?: unknown; alerted?: unknown };
  if (status !== 200 || typeof b.expired !== "number" || typeof b.alerted !== "number")
    fail(`POST /api/orders/expire-quotes → ${status}`, JSON.stringify(body));
  else ok(`POST /api/orders/expire-quotes → 200 (expired: ${b.expired}, alerted: ${b.alerted})`);
}

async function runAiObservabilityCheck() {
  console.log("\n[20] AI Observability");
  const { status, body } = await get("/api/ai/observability");
  const b = body as { runs?: { last7d?: unknown }; recommendations?: unknown; feedback?: unknown };
  if (status !== 200 || !b.runs || !b.recommendations || !b.feedback)
    fail(`GET /api/ai/observability → ${status} (eksik field'lar)`, JSON.stringify(body));
  else if (typeof b.runs.last7d !== "number")
    fail(`GET /api/ai/observability — runs.last7d sayı değil`);
  else ok(`GET /api/ai/observability → 200`);
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log(`\nSmoke Test → ${BASE_URL}`);
  console.log("─".repeat(50));

  try {
    await runHealthCheck();

    const productId = await runProductsCheck();

    if (productId) {
      await runOrderFlow(productId);
    } else {
      console.log("\n[3–6] Sipariş Akışı — ATLAND I (ürün yok)");
    }

    await runAlertsCheck();
    await runProductionCheck();
    await runImportCheck();
    await runShipOrderSmoke();
    await runCustomersCheck();
    await runPurchaseCommitmentsCheck();
    if (productId) {
      await runInventoryMovementsCheck(productId);
      await runProductQuotesCheck(productId);
    }
    await runProductAgingCheck();
    await runPurchaseSuggestionsCheck();
    await runPurchaseScanCheck();
    await runExpireQuotesCheck();
    await runAiObservabilityCheck();
  } catch (err) {
    fail("Beklenmedik hata", err instanceof Error ? err.message : String(err));
  }

  // ── Summary ──────────────────────────────────────────────
  console.log("\n" + "─".repeat(50));
  console.log(`Sonuç: ${passed} geçti, ${failed} başarısız\n`);

  if (failures.length > 0) {
    console.error("Başarısız adımlar:");
    failures.forEach(f => console.error(`  • ${f}`));
    console.log();
    process.exit(1);
  }

  console.log("Tüm smoke testler geçti ✓\n");
}

main();

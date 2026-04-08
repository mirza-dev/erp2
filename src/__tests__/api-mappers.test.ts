import { describe, it, expect } from "vitest";
import { mapProduct, mapCustomer, mapOrderSummary, mapOrderDetail, mapProductionEntry, mapRecommendation } from "@/lib/api-mappers";
import type { ProductWithStock, CustomerRow, SalesOrderRow, SalesOrderWithLines, ProductionEntryRow, AiRecommendationRow } from "@/lib/database.types";

// ── mapProduct ────────────────────────────────────────────────

describe("mapProduct", () => {
  const base: ProductWithStock = {
    id: "p1",
    name: "Test Ürün",
    sku: "SKU-001",
    category: "Vana",
    unit: "adet",
    price: 150,
    currency: "USD",
    on_hand: 100,
    reserved: 20,
    available_now: 80,
    min_stock_level: 10,
    is_active: true,
    product_type: "finished",
    warehouse: "Depo A",
    reorder_qty: null,
    preferred_vendor: null,
    daily_usage: null,
    lead_time_days: null,
    product_family: null,
    sub_category: null,
    sector_compatibility: null,
    cost_price: null,
    weight_kg: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  it("maps required fields correctly", () => {
    const p = mapProduct(base);
    expect(p.id).toBe("p1");
    expect(p.name).toBe("Test Ürün");
    expect(p.sku).toBe("SKU-001");
    expect(p.on_hand).toBe(100);
    expect(p.reserved).toBe(20);
    expect(p.available_now).toBe(80);
    expect(p.minStockLevel).toBe(10);
    expect(p.isActive).toBe(true);
  });

  it("defaults category to empty string when null", () => {
    expect(mapProduct({ ...base, category: null }).category).toBe("");
  });

  it("defaults price to 0 when null", () => {
    expect(mapProduct({ ...base, price: null }).price).toBe(0);
  });

  it("defaults warehouse to empty string when null", () => {
    expect(mapProduct({ ...base, warehouse: null }).warehouse).toBe("");
  });

  it("optional fields are undefined when null in DB", () => {
    const p = mapProduct(base); // reorder_qty, preferred_vendor, daily_usage all null
    expect(p.reorderQty).toBeUndefined();
    expect(p.preferredVendor).toBeUndefined();
    expect(p.dailyUsage).toBeUndefined();
    expect(p.leadTimeDays).toBeUndefined();
  });

  it("quoted defaults to 0 when missing from row", () => {
    const p = mapProduct(base); // base has no quoted field
    expect(p.quoted).toBe(0);
  });

  it("promisable defaults to available_now when missing from row", () => {
    const p = mapProduct(base); // base has no promisable field
    expect(p.promisable).toBe(base.available_now);
  });

  it("quoted=0 is preserved (not treated as nullish fallback)", () => {
    const p = mapProduct({ ...base, quoted: 0 });
    expect(p.quoted).toBe(0);
  });

  it("passes through quoted and promisable when present", () => {
    const p = mapProduct({ ...base, quoted: 15, promisable: 65 });
    expect(p.quoted).toBe(15);
    expect(p.promisable).toBe(65);
  });

  it("promisable can be negative (more quoted than available)", () => {
    const p = mapProduct({ ...base, quoted: 90, promisable: -10 });
    expect(p.promisable).toBe(-10);
  });

  it("incoming defaults to 0 when missing from row", () => {
    const p = mapProduct(base);
    expect(p.incoming).toBe(0);
  });

  it("forecasted defaults to available_now when missing from row", () => {
    const p = mapProduct(base);
    expect(p.forecasted).toBe(base.available_now);
  });

  it("passes through incoming and forecasted when present", () => {
    const p = mapProduct({ ...base, incoming: 20, forecasted: 70 });
    expect(p.incoming).toBe(20);
    expect(p.forecasted).toBe(70);
  });

  it("forecasted can be negative (valid state)", () => {
    const p = mapProduct({ ...base, incoming: 0, forecasted: -5 });
    expect(p.forecasted).toBe(-5);
  });
});

// ── mapCustomer ───────────────────────────────────────────────

describe("mapCustomer", () => {
  const base: CustomerRow = {
    id: "c1",
    name: "Acme Ltd",
    email: "acme@example.com",
    phone: "+90 555 000 00 00",
    address: "Istanbul",
    tax_number: "1234567890",
    tax_office: "Kadıköy",
    country: "TR",
    currency: "TRY",
    notes: null,
    is_active: true,
    total_orders: 5,
    total_revenue: 10000,
    last_order_date: "2024-12-01",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    created_by: null,
    payment_terms_days: null,
    default_incoterm: null,
    customer_code: null,
  };

  it("maps required fields correctly", () => {
    const c = mapCustomer(base);
    expect(c.id).toBe("c1");
    expect(c.name).toBe("Acme Ltd");
    expect(c.currency).toBe("TRY");
    expect(c.totalOrders).toBe(5);
    expect(c.totalRevenue).toBe(10000);
  });

  it("defaults nullable fields to empty string", () => {
    const c = mapCustomer({
      ...base,
      email: null,
      phone: null,
      address: null,
      tax_number: null,
      tax_office: null,
      country: null,
      notes: null,
      last_order_date: null,
    });
    expect(c.email).toBe("");
    expect(c.phone).toBe("");
    expect(c.address).toBe("");
    expect(c.taxNumber).toBe("");
    expect(c.taxOffice).toBe("");
    expect(c.country).toBe("");
    expect(c.notes).toBe("");
    expect(c.lastOrderDate).toBe("");
  });
});

// ── mapOrderSummary ───────────────────────────────────────────

describe("mapOrderSummary", () => {
  const base: SalesOrderRow = {
    id: "o1",
    order_number: "ORD-0001",
    customer_id: "c1",
    customer_name: "Acme Ltd",
    customer_email: null,
    customer_country: null,
    customer_tax_office: null,
    customer_tax_number: null,
    commercial_status: "draft",
    fulfillment_status: "unallocated",
    currency: "USD",
    subtotal: 1000,
    vat_total: 200,
    grand_total: 1200,
    notes: null,
    item_count: 2,
    parasut_invoice_id: null,
    parasut_sent_at: null,
    parasut_error: null,
    ai_confidence: null,
    ai_reason: null,
    ai_risk_level: null,
    ai_model_version: null,
    created_at: "2024-01-15T10:00:00Z",
    updated_at: "2024-01-15T10:00:00Z",
    created_by: null,
    incoterm: null,
    planned_shipment_date: null,
    quote_id: null,
    original_order_number: null,
  };

  it("maps all summary fields", () => {
    const o = mapOrderSummary(base);
    expect(o.id).toBe("o1");
    expect(o.orderNumber).toBe("ORD-0001");
    expect(o.customerName).toBe("Acme Ltd");
    expect(o.commercial_status).toBe("draft");
    expect(o.fulfillment_status).toBe("unallocated");
    expect(o.grandTotal).toBe(1200);
    expect(o.currency).toBe("USD");
    expect(o.itemCount).toBe(2);
    expect(o.createdAt).toBe("2024-01-15T10:00:00Z");
  });

  it("maps customer_id to customerId", () => {
    const o = mapOrderSummary(base); // customer_id: "c1"
    expect(o.customerId).toBe("c1");
  });

  it("maps null customer_id to undefined", () => {
    const o = mapOrderSummary({ ...base, customer_id: null });
    expect(o.customerId).toBeUndefined();
  });
});

// ── mapOrderSummary — AI fields ───────────────────────────────

describe("mapOrderSummary — AI fields", () => {
  const base: SalesOrderRow = {
    id: "o1",
    order_number: "ORD-0001",
    customer_id: "c1",
    customer_name: "Acme Ltd",
    customer_email: null,
    customer_country: null,
    customer_tax_office: null,
    customer_tax_number: null,
    commercial_status: "draft",
    fulfillment_status: "unallocated",
    currency: "USD",
    subtotal: 1000,
    vat_total: 200,
    grand_total: 1200,
    notes: null,
    item_count: 2,
    parasut_invoice_id: null,
    parasut_sent_at: null,
    parasut_error: null,
    ai_confidence: null,
    ai_reason: null,
    ai_risk_level: null,
    ai_model_version: null,
    created_at: "2024-01-15T10:00:00Z",
    updated_at: "2024-01-15T10:00:00Z",
    created_by: null,
    incoterm: null,
    planned_shipment_date: null,
    quote_id: null,
    original_order_number: null,
  };

  it("maps ai_risk_level to aiRiskLevel when present", () => {
    const o = mapOrderSummary({ ...base, ai_risk_level: "high", ai_confidence: 0.85 });
    expect(o.aiRiskLevel).toBe("high");
  });

  it("maps ai_confidence to aiConfidence when present", () => {
    const o = mapOrderSummary({ ...base, ai_risk_level: "high", ai_confidence: 0.85 });
    expect(o.aiConfidence).toBe(0.85);
  });

  it("maps null ai_risk_level to undefined", () => {
    const o = mapOrderSummary({ ...base, ai_risk_level: null });
    expect(o.aiRiskLevel).toBeUndefined();
  });

  it("maps null ai_confidence to undefined", () => {
    const o = mapOrderSummary({ ...base, ai_confidence: null });
    expect(o.aiConfidence).toBeUndefined();
  });
});

// ── mapOrderDetail ────────────────────────────────────────────

describe("mapOrderDetail", () => {
  const baseRow: SalesOrderRow = {
    id: "o1",
    order_number: "ORD-0001",
    customer_id: "c1",
    customer_name: "Acme Ltd",
    customer_email: "acme@example.com",
    customer_country: "TR",
    customer_tax_office: "Kadıköy",
    customer_tax_number: "1234567890",
    commercial_status: "approved",
    fulfillment_status: "allocated",
    currency: "USD",
    subtotal: 1000,
    vat_total: 200,
    grand_total: 1200,
    notes: "Test notu",
    item_count: 1,
    parasut_invoice_id: null,
    parasut_sent_at: null,
    parasut_error: null,
    ai_confidence: 0.87,
    ai_reason: "Standart sipariş",
    ai_risk_level: "low",
    ai_model_version: "claude-haiku-4-5-20251001",
    created_at: "2024-01-15T10:00:00Z",
    updated_at: "2024-01-15T10:00:00Z",
    created_by: null,
    incoterm: null,
    planned_shipment_date: null,
    quote_id: null,
    original_order_number: null,
  };

  const detailBase: SalesOrderWithLines = {
    ...baseRow,
    lines: [{
      id: "line-1",
      order_id: "o1",
      product_id: "p1",
      product_name: "Test Valve",
      product_sku: "TV-001",
      unit: "adet",
      quantity: 10,
      unit_price: 100,
      discount_pct: 0,
      line_total: 1000,
      sort_order: 0,
    }],
  };

  it("maps ai_confidence to aiConfidence", () => {
    const d = mapOrderDetail(detailBase);
    expect(d.aiConfidence).toBe(0.87);
  });

  it("maps ai_reason to aiReason", () => {
    const d = mapOrderDetail(detailBase);
    expect(d.aiReason).toBe("Standart sipariş");
  });

  it("maps ai_risk_level to aiRiskLevel", () => {
    const d = mapOrderDetail(detailBase);
    expect(d.aiRiskLevel).toBe("low");
  });

  it("maps all three AI fields as undefined when DB null", () => {
    const d = mapOrderDetail({
      ...detailBase,
      ai_confidence: null,
      ai_reason: null,
      ai_risk_level: null,
    });
    expect(d.aiConfidence).toBeUndefined();
    expect(d.aiReason).toBeUndefined();
    expect(d.aiRiskLevel).toBeUndefined();
  });

  it("maps lines array correctly", () => {
    const d = mapOrderDetail(detailBase);
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].productName).toBe("Test Valve");
    expect(d.lines[0].productSku).toBe("TV-001");
    expect(d.lines[0].quantity).toBe(10);
    expect(d.lines[0].unitPrice).toBe(100);
    expect(d.lines[0].lineTotal).toBe(1000);
  });
});

// ── mapProductionEntry ────────────────────────────────────────

describe("mapProductionEntry", () => {
  const base: ProductionEntryRow = {
    id: "pe1",
    product_id: "p1",
    product_name: "Test Ürün",
    product_sku: "SKU-001",
    produced_qty: 50,
    scrap_qty: 0,
    waste_reason: null,
    production_date: "2024-03-20",
    entered_by: null,
    notes: null,
    related_order_id: null,
    created_at: "2024-03-20T08:00:00Z",
  };

  it("maps production entry fields correctly", () => {
    const k = mapProductionEntry(base);
    expect(k.id).toBe("pe1");
    expect(k.productId).toBe("p1");
    expect(k.productName).toBe("Test Ürün");
    expect(k.productSku).toBe("SKU-001");
    expect(k.adet).toBe(50);
    expect(k.tarih).toBe("2024-03-20");
  });

  it("defaults nullable string fields to empty string", () => {
    const k = mapProductionEntry(base); // entered_by and notes are null
    expect(k.girenKullanici).toBe("");
    expect(k.notlar).toBe("");
  });
});

// ── mapRecommendation ─────────────────────────────────────

describe("mapRecommendation", () => {
  const baseRec: AiRecommendationRow = {
    id: "rec-1",
    entity_type: "product",
    entity_id: "prod-1",
    recommendation_type: "purchase_suggestion",
    title: "Test öneri",
    body: "Detay",
    confidence: 0.85,
    severity: "warning",
    status: "suggested",
    model_version: "v1",
    metadata: { suggestQty: 50 },
    edited_metadata: null,
    decided_at: null,
    expired_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("maps all snake_case fields to camelCase", () => {
    const result = mapRecommendation(baseRec);
    expect(result.id).toBe("rec-1");
    expect(result.entityType).toBe("product");
    expect(result.entityId).toBe("prod-1");
    expect(result.recommendationType).toBe("purchase_suggestion");
    expect(result.title).toBe("Test öneri");
    expect(result.modelVersion).toBe("v1");
    expect(result.decidedAt).toBeNull();
    expect(result.createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("nullable fields pass through as null", () => {
    const result = mapRecommendation({
      ...baseRec,
      body: null,
      confidence: null,
      model_version: null,
      metadata: null,
      edited_metadata: null,
      decided_at: null,
    });
    expect(result.body).toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.modelVersion).toBeNull();
    expect(result.metadata).toBeNull();
    expect(result.editedMetadata).toBeNull();
    expect(result.decidedAt).toBeNull();
  });

  it("metadata and editedMetadata are preserved as objects", () => {
    const result = mapRecommendation({
      ...baseRec,
      metadata: { suggestQty: 50, formula: "lead_time" },
      edited_metadata: { suggestQty: 40 },
    });
    expect(result.metadata).toEqual({ suggestQty: 50, formula: "lead_time" });
    expect(result.editedMetadata).toEqual({ suggestQty: 40 });
  });

  it("schema contract — exactly 14 output keys", () => {
    const result = mapRecommendation(baseRec);
    const expectedKeys = [
      "body", "confidence", "createdAt", "decidedAt", "editedMetadata",
      "entityId", "entityType", "id", "metadata", "modelVersion",
      "recommendationType", "severity", "status", "title",
    ].sort();
    expect(Object.keys(result).sort()).toEqual(expectedKeys);
  });
});

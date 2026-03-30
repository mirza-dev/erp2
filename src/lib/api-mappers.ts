/**
 * Mappers: Database row types (snake_case) → Frontend types (camelCase)
 *
 * DB types have nullable fields (string | null, number | null).
 * Frontend types expect non-null values.
 * All nullable fields use ?? to provide sensible defaults.
 */

import type {
  ProductWithStock,
  CustomerRow,
  SalesOrderRow,
  SalesOrderWithLines,
  ProductionEntryRow,
  OrderLineRow,
  AiRecommendationRow,
} from "./database.types";

import type {
  Product,
  Customer,
  Order,
  OrderDetail,
  OrderLineItem,
  UretimKaydi,
  AiRecommendation,
} from "./mock-data";

// ── Product ───────────────────────────────────────────────

export function mapProduct(row: ProductWithStock): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category ?? "",
    unit: row.unit,
    price: row.price ?? 0,
    currency: row.currency,
    on_hand: row.on_hand,
    reserved: row.reserved,
    available_now: row.available_now ?? (row.on_hand ?? 0) - (row.reserved ?? 0),
    minStockLevel: row.min_stock_level,
    isActive: row.is_active,
    productType: row.product_type,
    warehouse: row.warehouse ?? "",
    reorderQty: row.reorder_qty ?? undefined,
    preferredVendor: row.preferred_vendor ?? undefined,
    dailyUsage: row.daily_usage ?? undefined,
    leadTimeDays: row.lead_time_days ?? undefined,
    productFamily: row.product_family ?? undefined,
    subCategory: row.sub_category ?? undefined,
    sectorCompatibility: row.sector_compatibility ?? undefined,
    costPrice: row.cost_price ?? undefined,
    weightKg: row.weight_kg ?? undefined,
    materialQuality: row.material_quality ?? undefined,
    originCountry: row.origin_country ?? undefined,
    productionSite: row.production_site ?? undefined,
    useCases: row.use_cases ?? undefined,
    industries: row.industries ?? undefined,
    standards: row.standards ?? undefined,
    certifications: row.certifications ?? undefined,
    productNotes: row.product_notes ?? undefined,
  };
}

// ── Customer ──────────────────────────────────────────────

export function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    address: row.address ?? "",
    taxNumber: row.tax_number ?? "",
    taxOffice: row.tax_office ?? "",
    country: row.country ?? "",
    currency: row.currency,
    notes: row.notes ?? "",
    isActive: row.is_active,
    totalOrders: row.total_orders,
    totalRevenue: row.total_revenue,
    lastOrderDate: row.last_order_date ?? "",
  };
}

// ── Order Summary ─────────────────────────────────────────

export function mapOrderSummary(row: SalesOrderRow): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    commercial_status: row.commercial_status,
    fulfillment_status: row.fulfillment_status,
    grandTotal: row.grand_total,
    currency: row.currency,
    createdAt: row.created_at,
    itemCount: row.item_count,
    aiRiskLevel: row.ai_risk_level ?? undefined,
    aiConfidence: row.ai_confidence ?? undefined,
  };
}

// ── Order Line (private helper) ───────────────────────────

function mapOrderLine(line: OrderLineRow): OrderLineItem {
  return {
    id: line.id,
    productId: line.product_id,
    productName: line.product_name,
    productSku: line.product_sku,
    unit: line.unit,
    quantity: line.quantity,
    unitPrice: line.unit_price,
    discountPct: line.discount_pct,
    lineTotal: line.line_total,
  };
}

// ── Order Detail ──────────────────────────────────────────

export function mapOrderDetail(row: SalesOrderWithLines): OrderDetail {
  return {
    ...mapOrderSummary(row),
    customerId: row.customer_id ?? "",
    customerEmail: row.customer_email ?? "",
    customerCountry: row.customer_country ?? "",
    customerTaxOffice: row.customer_tax_office ?? "",
    customerTaxNumber: row.customer_tax_number ?? "",
    subtotal: row.subtotal,
    vatTotal: row.vat_total,
    notes: row.notes ?? "",
    parasutInvoiceId: row.parasut_invoice_id ?? undefined,
    parasutSentAt: row.parasut_sent_at ?? undefined,
    parasutError: row.parasut_error ?? undefined,
    lines: row.lines.map(mapOrderLine),
    aiConfidence: row.ai_confidence ?? undefined,
    aiReason: row.ai_reason ?? undefined,
    aiRiskLevel: row.ai_risk_level ?? undefined,
  };
}

// ── AI Recommendation ─────────────────────────────────────

export function mapRecommendation(row: AiRecommendationRow): AiRecommendation {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    recommendationType: row.recommendation_type,
    title: row.title,
    body: row.body,
    confidence: row.confidence,
    severity: row.severity,
    status: row.status,
    modelVersion: row.model_version,
    metadata: row.metadata as Record<string, unknown> | null,
    editedMetadata: row.edited_metadata as Record<string, unknown> | null,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

// ── Production Entry ──────────────────────────────────────

export function mapProductionEntry(row: ProductionEntryRow): UretimKaydi {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSku: row.product_sku,
    adet: row.produced_qty,
    tarih: row.production_date,
    girenKullanici: row.entered_by ?? "",
    notlar: row.notes ?? "",
  };
}

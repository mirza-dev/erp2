// ============================================================
// KokpitERP — Database Types
// Generated from supabase/migrations/001_initial_schema.sql
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = string | number | boolean | null | { [key: string]: any } | any[]

// ── Enums ────────────────────────────────────────────────────

export type CommercialStatus = "draft" | "pending_approval" | "approved" | "cancelled"
export type FulfillmentStatus = "unallocated" | "partially_allocated" | "allocated" | "partially_shipped" | "shipped"
export type ProductType = "finished" | "raw_material"
export type ReservationStatus = "open" | "shipped" | "released"
export type ShortageStatus = "open" | "resolved" | "cancelled"
export type MovementType = "production" | "shipment" | "receipt" | "adjustment" | "reservation_create" | "reservation_release"
export type AlertType = "stock_critical" | "stock_risk" | "purchase_recommended" | "order_shortage" | "sync_issue" | "import_review_required"
export type AlertSeverity = "critical" | "warning" | "info"
export type AlertStatus = "open" | "acknowledged" | "resolved" | "dismissed"
export type ImportBatchStatus = "pending" | "processing" | "review" | "confirmed" | "failed"
export type ImportDraftStatus = "pending" | "confirmed" | "rejected" | "merged"
export type SyncStatus = "success" | "error" | "pending" | "retrying"
export type AuditSource = "ui" | "system" | "ai" | "integration"

// ── Row Types ────────────────────────────────────────────────

export interface CustomerRow {
    id: string
    name: string
    email: string | null
    phone: string | null
    address: string | null
    tax_number: string | null
    tax_office: string | null
    country: string | null
    currency: string
    notes: string | null
    is_active: boolean
    total_orders: number
    total_revenue: number
    last_order_date: string | null
    created_at: string
    updated_at: string
    created_by: string | null
}

export interface ProductRow {
    id: string
    name: string
    sku: string
    category: string | null
    unit: string
    price: number | null
    currency: string
    on_hand: number
    reserved: number
    min_stock_level: number
    is_active: boolean
    product_type: ProductType
    warehouse: string | null
    reorder_qty: number | null
    preferred_vendor: string | null
    daily_usage: number | null
    created_at: string
    updated_at: string
}

/** ProductRow extended with the computed available_now field (on_hand - reserved) */
export interface ProductWithStock extends ProductRow {
    available_now: number
}

export interface BillOfMaterialsRow {
    id: string
    finished_product_id: string
    component_product_id: string
    quantity: number
    unit: string | null
    notes: string | null
    created_at: string
}

export interface SalesOrderRow {
    id: string
    order_number: string
    customer_id: string | null
    customer_name: string
    customer_email: string | null
    customer_country: string | null
    customer_tax_office: string | null
    customer_tax_number: string | null
    commercial_status: CommercialStatus
    fulfillment_status: FulfillmentStatus
    currency: string
    subtotal: number
    vat_total: number
    grand_total: number
    notes: string | null
    item_count: number
    parasut_invoice_id: string | null
    parasut_sent_at: string | null
    parasut_error: string | null
    created_at: string
    updated_at: string
    created_by: string | null
    ai_confidence: number | null
    ai_reason: string | null
    ai_model_version: string | null
}

export interface OrderLineRow {
    id: string
    order_id: string
    product_id: string
    product_name: string
    product_sku: string
    unit: string
    quantity: number
    unit_price: number
    discount_pct: number
    line_total: number
    sort_order: number
}

export interface StockReservationRow {
    id: string
    product_id: string
    order_id: string
    order_line_id: string
    reserved_qty: number
    status: ReservationStatus
    created_at: string
    released_at: string | null
}

export interface ShortageRow {
    id: string
    order_id: string
    order_line_id: string
    product_id: string
    requested_qty: number
    available_qty: number
    shortage_qty: number
    status: ShortageStatus
    resolved_at: string | null
    created_at: string
}

export interface InventoryMovementRow {
    id: string
    product_id: string
    movement_type: MovementType
    quantity: number
    reference_type: string | null
    reference_id: string | null
    notes: string | null
    occurred_at: string
    created_by: string | null
    source: AuditSource
}

export interface ProductionEntryRow {
    id: string
    product_id: string
    product_name: string
    product_sku: string
    produced_qty: number
    scrap_qty: number
    waste_reason: string | null
    production_date: string
    entered_by: string | null
    notes: string | null
    related_order_id: string | null
    created_at: string
}

export interface AlertRow {
    id: string
    type: AlertType
    severity: AlertSeverity
    title: string
    description: string | null
    entity_type: string | null
    entity_id: string | null
    status: AlertStatus
    acknowledged_at: string | null
    resolved_at: string | null
    dismissed_at: string | null
    resolution_reason: string | null
    ai_confidence: number | null
    ai_reason: string | null
    ai_model_version: string | null
    ai_inputs_summary: Json | null
    created_at: string
    source: "system" | "ai" | "ui"
}

export interface ImportBatchRow {
    id: string
    file_name: string | null
    file_size: number | null
    status: ImportBatchStatus
    parse_result: Json | null
    confidence: number | null
    created_by: string | null
    created_at: string
    confirmed_at: string | null
}

export interface ImportDraftRow {
    id: string
    batch_id: string
    entity_type: "customer" | "product" | "order"
    raw_data: Json | null
    parsed_data: Json | null
    matched_entity_id: string | null
    confidence: number | null
    ai_reason: string | null
    unmatched_fields: Json | null
    user_corrections: Json | null
    status: ImportDraftStatus
    created_at: string
}

export interface IntegrationSyncLogRow {
    id: string
    entity_type: string
    entity_id: string | null
    direction: "push" | "pull"
    status: SyncStatus
    external_id: string | null
    error_message: string | null
    retry_count: number
    requested_at: string
    completed_at: string | null
    source: "ui" | "system" | "scheduled"
}

export interface AuditLogRow {
    id: string
    actor: string | null
    action: string
    entity_type: string
    entity_id: string | null
    before_state: Json | null
    after_state: Json | null
    occurred_at: string
    source: AuditSource
}

// ── Composite / joined types ──────────────────────────────────

export interface SalesOrderWithLines extends SalesOrderRow {
    lines: OrderLineRow[]
}

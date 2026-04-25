// ============================================================
// KokpitERP — Database Types
// Generated from supabase/migrations/001_initial_schema.sql
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = string | number | boolean | null | { [key: string]: any } | any[]

// ── Enums ────────────────────────────────────────────────────

export type CommercialStatus = "draft" | "pending_approval" | "approved" | "cancelled"
export type FulfillmentStatus = "unallocated" | "partially_allocated" | "allocated" | "partially_shipped" | "shipped"
export type ProductType = "manufactured" | "commercial"
export type ReservationStatus = "open" | "shipped" | "released"
export type ShortageStatus = "open" | "resolved" | "cancelled"
export type MovementType = "production" | "shipment" | "receipt" | "adjustment" | "reservation_create" | "reservation_release"
export type AlertType = "stock_critical" | "stock_risk" | "purchase_recommended" | "order_shortage" | "sync_issue" | "import_review_required" | "order_deadline" | "quote_expired" | "overdue_shipment"
export type AlertSeverity = "critical" | "warning" | "info"
export type AlertStatus = "open" | "acknowledged" | "resolved" | "dismissed"
export type ImportBatchStatus = "pending" | "processing" | "review" | "confirmed" | "failed"
export type ImportDraftStatus = "pending" | "confirmed" | "rejected" | "merged"
export type SyncStatus = "success" | "error" | "pending" | "retrying"
export type AuditSource = "ui" | "system" | "ai" | "integration"
export type RecommendationType = "purchase_suggestion" | "stock_risk" | "order_risk"
export type RecommendationStatus = "suggested" | "accepted" | "edited" | "rejected" | "expired"
export type FeedbackType = "accepted" | "edited" | "rejected" | "note"
export type AiFeature = "order_score" | "stock_risk" | "import_parse" | "ops_summary" | "purchase_enrich" | "production_voice"
export type PurchaseCommitmentStatus = "pending" | "received" | "cancelled"
export type ParasutStep = "contact" | "product" | "shipment" | "invoice" | "edoc" | "done"
export type ParasutErrorKind = "auth" | "validation" | "rate_limit" | "server" | "network" | "not_found"
export type ParasutInvoiceType = "e_invoice" | "e_archive" | "manual"
export type ParasutEDocStatus = "running" | "done" | "error" | "skipped"

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
    payment_terms_days: number | null
    default_incoterm: string | null
    customer_code: string | null
    parasut_contact_id: string | null
    parasut_synced_at: string | null
    parasut_contact_creating_until: string | null
    parasut_contact_creating_owner: string | null
    city: string | null
    district: string | null
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
    lead_time_days: number | null
    created_at: string
    updated_at: string
    product_family: string | null
    sub_category: string | null
    sector_compatibility: string | null
    cost_price: number | null
    weight_kg: number | null
    material_quality: string | null
    origin_country: string | null
    production_site: string | null
    use_cases: string | null
    industries: string | null
    standards: string | null
    certifications: string | null
    product_notes: string | null
    parasut_product_id: string | null
    parasut_synced_at: string | null
}

/** ProductRow extended with the computed available_now field (on_hand - reserved) */
export interface ProductWithStock extends ProductRow {
    available_now: number
    /** Total quantity in active draft/pending_approval orders — computed by API layer */
    quoted?: number
    /** Quantity available to promise = available_now - quoted — computed by API layer */
    promisable?: number
    /** Total pending purchase commitments quantity — computed by API layer */
    incoming?: number
    /** Full stock outlook = on_hand + incoming - reserved - quoted — computed by API layer */
    forecasted?: number
    /** ISO date: when promisable stock runs out at daily_usage rate — computed by API layer */
    stockoutDate?: string | null
    /** ISO date: latest date to place a purchase order (stockoutDate - lead_time - 7) — computed by API layer */
    orderDeadline?: string | null
}

export interface PurchaseCommitmentRow {
    id: string
    product_id: string
    quantity: number
    expected_date: string        // "YYYY-MM-DD"
    supplier_name: string | null
    notes: string | null
    status: PurchaseCommitmentStatus
    created_at: string
    received_at: string | null
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
    ai_risk_level: "low" | "medium" | "high" | null
    incoterm: string | null
    planned_shipment_date: string | null
    quote_id: string | null
    original_order_number: string | null
    quote_valid_until: string | null
    shipped_at: string | null
    parasut_invoice_series: string | null
    parasut_invoice_number_int: number | null
    parasut_invoice_no: string | null
    parasut_invoice_error: string | null
    parasut_invoice_synced_at: string | null
    parasut_invoice_create_attempted_at: string | null
    parasut_invoice_type: ParasutInvoiceType | null
    parasut_shipment_document_id: string | null
    parasut_shipment_synced_at: string | null
    parasut_shipment_error: string | null
    parasut_shipment_create_attempted_at: string | null
    parasut_trackable_job_id: string | null
    parasut_e_document_id: string | null
    parasut_e_document_status: ParasutEDocStatus | null
    parasut_e_document_error: string | null
    parasut_e_document_create_attempted_at: string | null
    parasut_step: ParasutStep | null
    parasut_error_kind: ParasutErrorKind | null
    parasut_retry_count: number
    parasut_next_retry_at: string | null
    parasut_last_failed_step: string | null
    parasut_sync_lock_until: string | null
    parasut_sync_lock_owner: string | null
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
    vat_rate: number
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

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired"

export interface QuoteRow {
    id: string
    quote_number: string
    status: QuoteStatus
    customer_id: string | null
    customer_name: string
    customer_contact: string | null
    customer_phone: string | null
    customer_email: string | null
    sales_rep: string | null
    sales_phone: string | null
    sales_email: string | null
    currency: string
    vat_rate: number
    subtotal: number
    vat_total: number
    grand_total: number
    notes: string | null
    sig_prepared: string | null
    sig_approved: string | null
    sig_manager: string | null
    quote_date: string | null
    valid_until: string | null
    created_at: string
    updated_at: string
}

export interface QuoteLineItemRow {
    id: string
    quote_id: string
    position: number
    product_id: string | null
    product_code: string
    lead_time: string | null
    description: string
    quantity: number
    unit_price: number
    line_total: number
    hs_code: string | null
    weight_kg: number | null
    created_at: string
}

export interface ShipmentRow {
    id: string
    shipment_number: string
    order_id: string | null
    order_number: string | null
    shipment_date: string
    transport_type: string | null
    net_weight_kg: number | null
    gross_weight_kg: number | null
    notes: string | null
    created_at: string
}

export type InvoiceStatus = "open" | "partially_paid" | "paid" | "cancelled"

export interface InvoiceRow {
    id: string
    invoice_number: string
    invoice_date: string
    order_id: string | null
    order_number: string | null
    customer_id: string | null
    customer_code: string | null
    currency: string
    amount: number
    due_date: string | null
    status: InvoiceStatus
    notes: string | null
    created_at: string
    updated_at: string
}

export interface PaymentRow {
    id: string
    payment_number: string
    invoice_id: string | null
    invoice_number: string | null
    payment_date: string
    amount: number
    currency: string
    payment_method: string | null
    notes: string | null
    created_at: string
}

export interface ImportDraftRow {
    id: string
    batch_id: string
    entity_type: "customer" | "product" | "order" | "order_line" | "stock" | "quote" | "shipment" | "invoice" | "payment"
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
    error_kind: string | null
    step: string | null
    metadata: Json | null
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

export interface AiRecommendationRow {
    id: string
    entity_type: string
    entity_id: string
    recommendation_type: RecommendationType
    title: string
    body: string | null
    confidence: number | null
    severity: "critical" | "warning" | "info"
    status: RecommendationStatus
    model_version: string | null
    metadata: Json | null
    edited_metadata: Json | null
    decided_at: string | null
    expired_at: string | null
    created_at: string
    updated_at: string
}

export interface AiFeedbackRow {
    id: string
    recommendation_id: string
    feedback_type: FeedbackType
    feedback_note: string | null
    edited_values: Json | null
    actor: string | null
    created_at: string
}

export interface AiEntityAliasRow {
    id: string
    raw_value: string
    normalized: string
    entity_type: "customer" | "product"
    resolved_id: string
    resolved_name: string | null
    created_at: string
    updated_at: string
}

export interface AiRunRow {
    id: string
    feature: AiFeature
    entity_id: string | null
    input_hash: string | null
    confidence: number | null
    latency_ms: number | null
    model: string | null
    created_at: string
}

export interface ColumnMappingRow {
    id: string
    source_column: string
    normalized: string
    entity_type: string
    target_field: string
    usage_count: number
    success_count: number
    created_at: string
    updated_at: string
}

export interface CompanySettingsRow {
    id: string
    name: string
    tax_office: string
    tax_no: string
    address: string
    phone: string
    email: string
    website: string
    logo_url: string | null
    currency: string
    updated_at: string
}

// ── Composite / joined types ──────────────────────────────────

export interface SalesOrderWithLines extends SalesOrderRow {
    lines: OrderLineRow[]
}

export interface QuoteWithLines extends QuoteRow {
    lines: QuoteLineItemRow[]
}

export interface ParasutOAuthTokensRow {
    id:                 string
    singleton_key:      string
    access_token:       string
    refresh_token:      string
    expires_at:         string
    refresh_lock_until: string | null
    refresh_lock_owner: string | null
    token_version:      number
    updated_at:         string
    created_at:         string
}

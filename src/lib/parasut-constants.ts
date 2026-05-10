export const ALERT_ENTITY_PARASUT_AUTH           = '00000000-0000-0000-0000-00000000a001' as const;
export const ALERT_ENTITY_PARASUT_E_DOC          = '00000000-0000-0000-0000-00000000a002' as const;
export const ALERT_ENTITY_PARASUT_SHIPMENT       = '00000000-0000-0000-0000-00000000a003' as const;
export const ALERT_ENTITY_PARASUT_STOCK_INVARIANT= '00000000-0000-0000-0000-00000000a004' as const;
export const ALERT_ENTITY_PARASUT_INVOICE        = '00000000-0000-0000-0000-00000000a005' as const;

/**
 * Faz 1 (advisor P3): bilinen Paraşüt sync_issue alert entity_id'lerinin tam listesi.
 * `/api/alerts/[id]/sync-retry` endpoint'i bu whitelist üzerinden Paraşüt-spesifik
 * retry'a izin verir; type='sync_issue' olsa bile listede olmayan entity_id'ler
 * (gelecekte eklenecek farklı sync_issue türleri) yanlışlıkla Paraşüt sync-all
 * akışını tetiklemez.
 *
 * UI tarafında (alerts/page.tsx) systemAlerts filtresi ve productSysAlerts dışlama
 * mantığı da bu listeyi tek source-of-truth olarak kullanır.
 */
export const PARASUT_SYNC_ALERT_ENTITY_IDS: ReadonlySet<string> = new Set([
    ALERT_ENTITY_PARASUT_AUTH,
    ALERT_ENTITY_PARASUT_E_DOC,
    ALERT_ENTITY_PARASUT_SHIPMENT,
    ALERT_ENTITY_PARASUT_STOCK_INVARIANT,
    ALERT_ENTITY_PARASUT_INVOICE,
]);

/**
 * Paraşüt alert'lerinin entity_type değerleri. parasut-oauth.ts'te CAS çakışması
 * durumunda 'parasut_auth' (snake_case) kullanılıyor; diğer durumlarda 'parasut'.
 * UI ve endpoint filter'ları bu iki değeri birleşik olarak kontrol eder.
 */
export const PARASUT_ALERT_ENTITY_TYPES: ReadonlySet<string> = new Set([
    "parasut",
    "parasut_auth",
]);

export const PARASUT_INVOICE_SERIES = 'KE' as const;

export type ParasutStep = 'contact' | 'product' | 'shipment' | 'invoice' | 'edoc' | 'done';
export type ParasutErrorKind = 'auth' | 'validation' | 'rate_limit' | 'server' | 'network' | 'not_found';
export type ParasutInvoiceType = 'e_invoice' | 'e_archive' | 'manual';
export type ParasutEDocStatus = 'running' | 'done' | 'error' | 'skipped';

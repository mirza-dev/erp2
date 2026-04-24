export const ALERT_ENTITY_PARASUT_AUTH           = '00000000-0000-0000-0000-00000000a001' as const;
export const ALERT_ENTITY_PARASUT_E_DOC          = '00000000-0000-0000-0000-00000000a002' as const;
export const ALERT_ENTITY_PARASUT_SHIPMENT       = '00000000-0000-0000-0000-00000000a003' as const;
export const ALERT_ENTITY_PARASUT_STOCK_INVARIANT= '00000000-0000-0000-0000-00000000a004' as const;

export const PARASUT_INVOICE_SERIES = 'KE' as const;

export type ParasutStep = 'contact' | 'product' | 'shipment' | 'invoice' | 'edoc' | 'done';
export type ParasutErrorKind = 'auth' | 'validation' | 'rate_limit' | 'server' | 'network' | 'not_found';
export type ParasutInvoiceType = 'e_invoice' | 'e_archive' | 'manual';
export type ParasutEDocStatus = 'running' | 'done' | 'error' | 'skipped';

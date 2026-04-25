---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---
**Aktif:** Paraşüt entegrasyonu — Faz 9 sırada (Sales Invoice)
**Önceki:** Faz 8 TAMAMEN KAPALI (2026-04-26)

---

## Son Tamamlanan İş — Paraşüt Faz 8 (2026-04-26)

### Faz 8 özet
`upsertShipment` stub'ı tam implementasyona dönüştürüldü:
- **Idempotent:** `parasut_shipment_document_id` dolu → erken dön
- **Remote recovery:** `listRecentShipmentDocuments` pagination + `procurement_number` local filter (max 5 sayfa, `PARASUT_SHIPMENT_RECOVERY_MAX_PAGES` env ile artırılabilir, max 20)
- **hasAttemptedBefore + recovery negatif:** alert (`ALERT_ENTITY_PARASUT_SHIPMENT`) + `ParasutError('validation', ...)` — duplicate'den korunma
- **Durable marker:** `parasut_shipment_create_attempted_at` create çağrısından ÖNCE yazılır
- **Create:** `inflow=false`, `procurement_number=order.order_number`, `shipment_date=shipped_at??created_at` (ilk 10 char), müşteri city/district/address
- **Re-fetch:** customer ve product'lar içeride re-fetch (order stale olabilir); her line için `dbGetProductById` + `parasut_product_id` kontrolü
- **`dbWriteShipmentMeta`:** shipment_document_id + synced_at + error=null DB'ye

### Değişen dosyalar
| Dosya | Değişiklik |
|-------|-----------|
| `src/lib/services/parasut-service.ts` | `upsertShipment` + `dbWriteShipmentMeta` implementasyonu; import eklendi: `ALERT_ENTITY_PARASUT_SHIPMENT`, `ParasutShipmentDocument` |
| `src/__tests__/parasut-service-faz7.test.ts` | "shipment step (stub)" → "hata sınıflandırma"; `/faz 8/i` assertionlar kaldırıldı |
| `src/__tests__/parasut-service-faz8.test.ts` | YENİ — 26 test |

### Faz 8 son durumu (tam kapalı)
- Test: 26 yeni test; 95 dosya · 1850 test yeşil, TS clean

---

## Sıradaki adım — Faz 9

Sales Invoice (`upsertInvoice` stub'ı doldur):
1. Idempotent: `parasut_invoice_id` dolu → erken dön
2. Durable "create attempted" marker
3. Remote recovery: `findSalesInvoicesByNumber(series, numberInt)` — idempotent
4. `createSalesInvoice`: `shipment_included=false`, `PARASUT_INVOICE_SERIES='KE'`, `parasutInvoiceNumberInt`, `mapCurrency`
5. `dbWriteInvoiceMeta` — invoice ID + synced_at DB'ye

**Why:** Yeni session'da Claude aktif konuyu eksiksiz bilsin.
**How to apply:** Faz 8 tamamen kapalı. Faz 9'dan devam et.

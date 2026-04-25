---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---
**Aktif:** Paraşüt entegrasyonu — Faz 8 sırada (Shipment document)
**Önceki:** Faz 7 TAMAMEN KAPALI

---

## Son Tamamlanan İş — Paraşüt Faz 7 (2026-04-25)

### Faz 7 özet
`serviceSyncOrderToParasut` yeniden yazıldı: customer_id null guard → `parasut_claim_sync` RPC → step orchestration (contact→product→shipment stub→invoice stub→edoc stub) → catch: classifyAndPatch + DB patch + sync log → finally: `parasut_release_sync` (best-effort). `parasutInvoiceNumberInt` export, `mapCurrency` export + GBP. Stubs Faz 8/9/10'da doldurulacak.

### Değişen dosyalar
| Dosya | Değişiklik |
|-------|-----------|
| `src/lib/services/parasut-service.ts` | Orkestra rewrite: claim RPC, stubs, export mapCurrency+parasutInvoiceNumberInt, SyncOrderResult.skipped |
| `src/__tests__/parasut-service-faz7.test.ts` | YENİ — 24 test |
| `src/__tests__/parasut-service.test.ts` | sendInvoice bağımlı testler kaldırıldı, RPC mock eklendi |
| `src/__tests__/parasut-disabled.test.ts` | "proceeds to sendInvoice" → "claim RPC çağrılır" |

### Faz 7 son durumu (tam kapalı)
- Test: 27 yeni test (bulgu fix +3), 94 dosya · 1824 test yeşil, TS clean

---

## Sıradaki adım — Faz 8

Shipment document (`upsertShipment` stub'ı doldur):
1. Idempotent: `parasut_shipment_document_id` dolu → erken dön
2. Durable "create attempted" marker (crash-before-DB-write koruması)
3. Remote recovery: `listRecentShipmentDocuments` pagination + `procurement_number` local filter (max 5 sayfa)
4. `createShipmentDocument`: `inflow=false`, `procurement_number=order.order_number`, city/district/address
5. `dbWriteShipmentMeta` — shipment ID + synced_at DB'ye

**Why:** Yeni session'da Claude aktif konuyu eksiksiz bilsin.
**How to apply:** Faz 7 tamamen kapalı. Faz 8'den devam et.

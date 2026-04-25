---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---
**Aktif:** Paraşüt entegrasyonu — Faz 7 sırada (Claim/lease RPC + deterministik numara)
**Önceki:** Faz 6 TAMAMEN KAPALI

---

## Son Tamamlanan İş — Paraşüt Faz 6 (2026-04-25)

### Faz 6 özet
`serviceEnsureParasutProduct(productId)`: idempotent, SKU trim, `findProductsByCode` 0/1/>1 yolları, TTL lease mutex (migration 041).

### Değişen dosyalar
| Dosya | Değişiklik |
|-------|-----------|
| `supabase/migrations/041_parasut_product_lease.sql` | YENİ — `parasut_product_creating_until` + `parasut_product_creating_owner` + index |
| `src/lib/database.types.ts` | `ProductRow`'a 2 lease alanı eklendi |
| `src/lib/services/parasut-service.ts` | `serviceEnsureParasutProduct` eklendi (TTL lease, tüm dallar) |
| `src/__tests__/parasut-service-faz6.test.ts` | 19 yeni test |

### Faz 6 son durumu (tam kapalı)
- Test: 19 test, 93 dosya · 1810 test yeşil, TS clean

---

## Sıradaki adım — Faz 7

`serviceSyncOrderToParasut` orkestra + Claim/lease RPC + deterministik numara + remote lookup:
1. `parasut_claim_sync` RPC çağrısı (order lease, status guard)
2. `parasutInvoiceNumberInt(orderNumber)` — "ORD-2026-0042" → 20260042
3. `findSalesInvoicesByNumber` — idempotent remote lookup (invoice create öncesi)
4. Full orkestra: contact → product → shipment → invoice → edoc (step-based)
5. `parasut_release_sync` finally'de

**Why:** Yeni session'da Claude aktif konuyu eksiksiz bilsin.
**How to apply:** Faz 6 tamamen kapalı. Faz 7'den devam et.

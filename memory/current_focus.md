---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---
**Aktif:** Paraşüt entegrasyonu — Faz 6 sırada (Product upsert)
**Önceki:** Faz 5 TAMAMEN KAPALI (tüm bulgular dahil)

---

## Son Tamamlanan İş — Paraşüt Faz 5 + bulgu düzeltmeleri (2026-04-25)

### Faz 5 özet
`serviceEnsureParasutContact(customerId)`: idempotent, taxNumber trim, email fallback, `updateContact` çağrısı, adapter çağrıları `parasutApiCall()` ile sarılı.

### Faz 5 bulgu düzeltmeleri (4 fix kapatıldı)
| Önem | Bulgu | Fix |
|------|-------|-----|
| HIGH | DB write hataları sessiz geçiyordu | Tüm 4 yazım noktasında error check + throw |
| HIGH | Create path race condition | `writeContactIdCreate`: `WHERE parasut_contact_id IS NULL` + re-read on 0 rows |
| MEDIUM | Whitespace-only taxNumber geçiyordu | `tax_number?.trim()` |
| MEDIUM | Bazı adapter çağrıları wrapper dışındaydı | Tümü `parasutApiCall()` içine alındı |

### Değişen dosyalar
| Dosya | Değişiklik |
|-------|-----------|
| `src/lib/services/parasut-service.ts` | `serviceEnsureParasutContact`: trim, wrapper, error check, `writeContactIdCreate` (race guard) |
| `src/__tests__/parasut-service-faz5.test.ts` | 18 → 25 test; PARASUT_ENABLED beforeEach/afterEach; mock chain `.is().select()` destekler |

### Faz 5 — 2. bulgu turu (2026-04-25)
- BLOCKER: `.catch()` → `try/catch` (TypeScript fix)
- HIGH: `__creating_` placeholder → migration 040 TTL lease (`parasut_contact_creating_until` + `parasut_contact_creating_owner`); `parasut_contact_id` semantiği temiz

### Faz 5 son durumu (tam kapalı)
- Test: 31 test, 92 dosya · 1791 test yeşil, TS clean

---

## Sıradaki adım — Faz 6

`serviceEnsureParasutProduct(productId)`:
1. `product.parasut_product_id` dolu → skip (idempotent)
2. `findProductsByCode(product.sku)` via `parasutApiCall`:
   - 0 → `createProduct`
   - 1 → DB yaz (`products.parasut_product_id`)
   - >1 → validation error
3. Shipment step için zorunlu (shipment_document detail'ında `product_id` = Paraşüt UUID)
4. Product upsert fail → tüm sync step='product' hatasıyla durur (description-only fallback bu turda yok)

**Why:** Yeni session'da Claude aktif konuyu eksiksiz bilsin.
**How to apply:** Faz 5 tamamen kapalı. Faz 6'dan devam et.

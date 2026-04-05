---
name: KokpitERP — Domain Kuralları ve İş Mantığı
description: Sipariş çift ekseni, stok modeli, KDV hesaplama, tamamlanan fazlar
type: project
---

## Sipariş Durumu — Çift Eksen

```
commercial_status:   DRAFT → PENDING_APPROVAL → APPROVED → CANCELLED
fulfillment_status:  UNALLOCATED → PARTIALLY_ALLOCATED → ALLOCATED → PARTIALLY_SHIPPED → SHIPPED
```

**Kural:** `fulfillment_status` sadece `commercial_status = APPROVED` siparişlerde aktif.
Rezervasyon sadece APPROVED olunca tetiklenir.

---

## Stok Modeli

```
available_now = on_hand - reserved
// on_hand: fiziksel stok
// reserved: onaylı siparişler için ayrılmış
// available_now: satılabilir miktar (computed column)
```

---

## Hesaplama

```ts
lineTotal  = quantity * unitPrice * (1 - discountPct / 100)
subtotal   = sum(lineTotals)
vatTotal   = subtotal * 0.20   // KDV %20
grandTotal = subtotal + vatTotal
```

---

## Import Servisi Kontratı

`serviceConfirmBatch` → `{ added, updated, skipped, errors }`
- Yeni SKU → `added` (on_hand dahil)
- Mevcut SKU → `updated` (on_hand **dahil değil** — master-data only)
- Eksik zorunlu alan (sku/name/unit) → `skipped`
- "Hepsi merged" mantığı yok — üç sayaç bağımsız

---

## Tamamlanan Fazlar (Faz 0–10)

| Faz | Konu |
|-----|------|
| 0 | Domain Alignment |
| 1 | Frontend Stabilization |
| 2 | Core Domain Model (DB schema — 5 migration, 14 tablo) |
| 3 | Orders Engine |
| 4 | Inventory & Reservation Engine |
| 5 | Critical Stock & Alerts Engine |
| 6 | Purchase Suggestion Engine |
| 7 | Production Engine |
| 8 | Import Flow |
| 9 | Paraşüt Integration |
| 10 | AI Layer (Claude Haiku) |

Detay: `implementation-roadmap.md`

---
name: KokpitERP — Domain Kuralları ve İş Mantığı
description: Sipariş çift ekseni, stok modeli, KDV hesaplama, import kontratı, teklif süresi, alert tipleri, tamamlanan fazlar
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
on_hand        — fiziksel stok
reserved       — onaylı siparişler için ayrılmış
available_now  = on_hand - reserved   (computed column)
quoted         = draft + pending_approval siparişlerdeki toplam miktar
promisable     = available_now - quoted   (canonical; negatif olabilir)
incoming       = açık purchase commitment toplamı
forecasted     = on_hand + incoming - reserved - quoted
```

**Önemli:** Drawer ve API her zaman `product.promisable` kullanır, `Math.max(0, ...)` ile gizlenmez.

---

## Hesaplama

```ts
lineTotal  = quantity * unitPrice * (1 - discountPct / 100)
subtotal   = sum(lineTotals)
vatTotal   = subtotal * 0.20   // KDV %20
grandTotal = subtotal + vatTotal
```

---

## Teklif Süresi (quote_valid_until)

- `sales_orders.quote_valid_until date` — nullable, DB default yok
- NULL = süresiz (expire olmaz)
- Yeni sipariş formu default: bugün + 14 gün, `min=today` (geçmiş tarih girilemez)
- `validateOrderCreate()` sunucu tarafında da geçmiş tarih reddeder
- **Tarih karşılaştırma kuralı:** Her zaman string karşılaştırma kullan:
  ```ts
  const todayStr = new Date().toISOString().slice(0, 10);
  const isExpired = !!date && date < todayStr;  // "YYYY-MM-DD" < "YYYY-MM-DD"
  ```
  `new Date(date) < new Date()` KULLANMA — saat farkı nedeniyle UI/backend ~24 saat kayar.

### Expire akışı
- `serviceExpireQuotes()` (CRON): expired draft → auto-cancel, expired pending_approval → `quote_expired` alert
- `serviceUpdateQuoteDeadline(orderId, date)`: DB günceller + yeni tarih geçerliyse `quote_expired` alertleri resolve eder
- Approve/cancel geçişlerinde de `quote_expired` alertler otomatik resolve edilir

---

## Alert Tipleri

| Tip | Tetikleyici |
|-----|-------------|
| `stock_critical` | available_now ≤ 0 |
| `stock_risk` | available_now ≤ min_stock_level |
| `purchase_recommended` | reorder önerisi |
| `order_shortage` | onaylı sipariş için stok yetersiz |
| `order_deadline` | stok tükenme tarihi yakın |
| `quote_expired` | pending_approval + quote_valid_until geçmiş |
| `overdue_shipment` | approved + sevk edilmemiş, planned_shipment_date geçmiş veya 7+ gün |
| `sync_issue` | Paraşüt sync hatası |
| `import_review_required` | import batch review gerekiyor |

**Dedup kuralı:** Tüm alert tipleri için `dbListActiveAlerts()` → type + entity_id filtresi ile aktif alert varsa yeni yaratılmaz.
**Kapanma:** `dbBatchResolveAlerts([{ type, entityId, reason }])` — ID değil type+entity ile resolve edilir.

---

## Geciken Sevkiyat (overdue_shipment)

- `commercial_status = approved` AND `fulfillment_status != shipped`
- `planned_shipment_date` varsa → geçmişse overdue
- `planned_shipment_date` yoksa → `created_at + 7 gün` geçmişse overdue
- Sadece alert; auto-cancel yok (rezervasyon var, tehlikeli)
- `POST /api/orders/check-shipments` (CRON_SECRET korumalı)

---

## Import Servisi Kontratı

`serviceConfirmBatch` → `{ added, updated, skipped, errors }`
- Yeni SKU → `added` (on_hand dahil)
- Mevcut SKU → `updated` (on_hand **dahil değil** — master-data only)
- Eksik zorunlu alan (sku/name/unit) → `skipped`

---

## CRON Endpoint'leri (middleware.ts CRON_PATHS)

| Endpoint | İşlev |
|----------|-------|
| `POST /api/alerts/scan` | Stok alert taraması |
| `POST /api/alerts/ai-suggest` | AI alert önerileri |
| `POST /api/parasut/sync-all` | Paraşüt sync |
| `POST /api/orders/expire-quotes` | Süresi dolan teklifleri işle |
| `POST /api/orders/check-shipments` | Geciken sevkiyat alertları |

---

## Tamamlanan Fazlar (Faz 0–10 + ek)

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
| 8 | Import Flow → Kolon Eşleştirme + Hafıza + Inline Düzenleme + 12 bug fix |
| 9 | Paraşüt Integration |
| 10 | AI Layer (Claude Haiku) |
| 4.6 | Deadline Tutarlılık (promisable, off-by-one fix) |
| 5+ | Teklif Kırılımı + bug fix (currency, promisable, email) |
| 6+ | Teklif Süresi, Uzatma, Geciken Sevkiyat + bug fix'ler |

Detay: `implementation-roadmap.md`

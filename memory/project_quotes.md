---
name: KokpitERP — Teklif Modülü Roadmap
description: Teklif (quotes) modülünün tamamlanan fazları ve kalan işler
type: project
---

## Faz 1 — Temel Form UI ✅
- [x] `/dashboard/quotes/new` sayfası
- [x] `QuoteForm.tsx` — müşteri, satıcı, kalem ekleme, KDV hesaplama

## Faz 2 — PDF Önizleme ✅
- [x] `QuotePDFPreview.tsx` — inline preview component
- [x] Yazdır / PDF export butonu

## Faz 3 — Müşteri Entegrasyonu ✅
- [x] Müşteri seçici (customers tablosundan)
- [x] Müşteri bilgileri otomatik doldurma

## Faz 4 — Ürün Entegrasyonu ✅
- [x] Kalem satırlarında ürün arama (products tablosundan)
- [x] SKU, birim fiyat otomatik doldurma

## Faz 5 — DB Persistence + Otomatik Numara ✅ (2026-04-21)
- [x] Migration 034: `quotes` ALTER, `quote_line_items`, `quotes_number_seq`, `next_quote_number()`, RLS
- [x] Migration 035: `create_quote_with_lines` + `update_quote_with_lines` atomic RPC'ler
- [x] Migration 036: security definer fix
- [x] `database.types.ts`, `mock-data.ts`, `api-mappers.ts` güncellemeleri
- [x] `supabase/quotes.ts`: full CRUD + `dbFindQuoteByNumber`
- [x] `GET/POST /api/quotes` + `GET/PATCH/DELETE /api/quotes/[id]`
- [x] Edit modu, read-only Quote No, `window.history.replaceState`

## Faz 5.5 — Güvenlik + Test ✅ (2026-04-21)
- [x] `api/seed`: CRON_SECRET Bearer zorunlu
- [x] `api/admin/users`: `requireAdmin()` — `ADMIN_EMAILS` env guard
- [x] `next.config.ts`: X-Content-Type-Options, X-Frame-Options, Referrer-Policy

---

## Faz 6 — Teklif Listesi Sayfası ✅
- [x] `/dashboard/quotes` liste sayfası (`page.tsx` mevcut)
- [x] Filtreleme: status tabları (draft/sent/accepted/rejected/expired) + arama + tarih aralığı + para birimi
- [x] Teklif satırı: teklif no, müşteri, durum badge, geçerlilik badge, tarih, tutar
- [x] Satır hover → delete butonu + chevron
- [x] Soft-delete confirm (inline "Evet, sil")
- [x] Sidebar navigasyonuna "Teklifler" linki

---

## Faz 7 — Durum Yönetimi ✅ (2026-04-21)
- [x] Durum geçiş butonları: draft→sent, sent→accepted/rejected
- [x] CRON: `POST /api/quotes/expire` → `serviceExpireQuotes()`, middleware CRON_PATHS'e eklendi
- [x] Teklif detay sayfası: status bar + aksiyon butonları + confirm dialog
- [x] QuoteForm readOnly prop: non-draft teklifler kilitli
- [x] Bulgular fix: PATCH draft guard, CRON revalidateTag, autoSave readOnly guard

## Faz 8 — Sipariş Dönüşümü ✅ (2026-04-22)
- [x] `serviceConvertQuoteToOrder`: accepted teklif → draft sipariş
- [x] `dbFindOrderByQuoteId`: idempotency kontrolü
- [x] `POST /api/quotes/[id]/convert`: 201/400/404/409 + cache invalidation
- [x] GET /api/quotes/[id]: `convertedOrderId` + `convertedOrderNumber` (accepted için)
- [x] Quote detail: "Siparişe Dönüştür" butonu + confirm dialog + "Sipariş oluşturuldu" badge
- [x] Order detail: "Kaynak Teklif" linki (`quoteId` varsa)
- [x] `OrderDetail.quoteId` + `mapOrderDetail` mapper

## Faz 8 Bulgular Fix ✅ (2026-04-22) — commit `3634b1c`
- [x] `037_unique_quote_id.sql`: `sales_orders.quote_id` partial UNIQUE index (race condition)
- [x] `quote-service.ts`: 23505 violation catch → `alreadyConverted`; `createdBy` param
- [x] `quote-service.ts`: geçmiş `valid_until` → soft 400 (serviceCreateOrder'a varmadan)
- [x] `quote-service.ts`: atlanan satırlar sipariş `notes`'una ekleniyor
- [x] `convert/route.ts`: session extract → `created_by`; 409'da `existingOrderNumber`
- [x] `page.tsx`: 409 handler `setConvertedOrderNumber` (badge order number gösteriyor)
- [x] `QuoteForm.tsx`: `position: i+1` (1-based satır numaraları)
- [x] +5 test (T15 race, T16–T19 valid_until + notes)
- [x] **83 dosya · 1609 test — 0 hata · 0 TS hatası**

---

## Teknik Notlar

- Quote number format: `TKL-YYYY-NNN` (sıra DB sequence'den)
- Status değerleri: `draft | sent | accepted | rejected | expired`
- DELETE sadece `draft` ve `sent` statüsünde mümkün (409 otherwise)
- RPC'ler atomic: `create_quote_with_lines`, `update_quote_with_lines`
- Migrations: `034_quotes.sql`, `035_quote_rpcs.sql`, `036_fix_quote_rpc_security.sql`, `037_unique_quote_id.sql`
- Dönüşüm idempotency: `dbFindOrderByQuoteId` + DB UNIQUE index ikili güvence
- `serviceConvertQuoteToOrder(quoteId, createdBy?)` — ikinci parametre opsiyonel
- Geçmiş `valid_until` olan accepted teklif dönüştürülemez → 400
- Ürün eşleşmesi olmayan satırlar atlanır, warnings + notes'a yazılır

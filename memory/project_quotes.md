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
- [x] Migration 034: `quotes` ALTER (veri + FK korundu), `quote_line_items`, `quotes_number_seq`, `next_quote_number()`, RLS
- [x] Migration 035: `create_quote_with_lines` + `update_quote_with_lines` atomic RPC'ler
- [x] Migration 036: security definer fix (idempotent)
- [x] `database.types.ts`: `QuoteStatus`, `QuoteRow`, `QuoteLineItemRow`, `QuoteWithLines`
- [x] `mock-data.ts`: `QuoteLineItem`, `QuoteSummary`, `QuoteDetail`
- [x] `api-mappers.ts`: `mapQuoteSummary()`, `mapQuoteDetail()`
- [x] `supabase/quotes.ts`: `dbCreateQuote`, `dbGetQuote`, `dbListQuotes`, `dbUpdateQuote`, `dbDeleteQuote`
- [x] `GET/POST /api/quotes` + `GET/PATCH/DELETE /api/quotes/[id]` route'ları
- [x] Edit modu: `initialData` prop, seller info company_settings'ten yükleniyor
- [x] Quote No read-only (otomatik TKL-YYYY-NNN)
- [x] `window.history.replaceState` ile URL otomatik güncelleniyor
- [x] `/dashboard/quotes/[id]` Server Component düzenleme sayfası
- [x] Bulgular fix: DROP→ALTER, validity_days→valid_until, customer_name backfill, setval, PATCH 404 guard, DELETE 409 guard
- [x] Test: `quotes-route.test.ts` + `quotes-id-route.test.ts` (23 test)

## Faz 5.5 — Güvenlik + Test ✅ (2026-04-21)
- [x] `api/seed`: CRON_SECRET Bearer zorunlu
- [x] `api/admin/users`: `requireAdmin()` — `ADMIN_EMAILS` env guard
- [x] `next.config.ts`: X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- [x] 78 dosya · 1503 test — 0 hata

---

## Faz 6 — Teklif Listesi Sayfası ⬜ (sonraki)
- [ ] `/dashboard/quotes` liste sayfası
- [ ] Filtreleme: status (draft/sent/accepted/rejected/expired)
- [ ] Sıralama: tarih, müşteri, tutar
- [ ] Teklif kartı/satırı component'i
- [ ] Sidebar navigasyonuna "Teklifler" linki

## Faz 7 — Durum Yönetimi ⬜
- [ ] Durum geçiş butonları: draft→sent, sent→accepted/rejected
- [ ] Expired otomatik işaretleme (CRON veya on-read)
- [ ] Teklif detay sayfasında durum badge

## Faz 8 — Sipariş Dönüşümü ⬜
- [ ] "Siparişe Dönüştür" butonu (quote → sales_order)
- [ ] `sales_orders.quote_id` FK zaten var
- [ ] Teklif kalemleri → sipariş kalemleri otomatik aktarım

---

## Teknik Notlar

- Quote number format: `TKL-YYYY-NNN` (sıra DB sequence'den)
- Status değerleri: `draft | sent | accepted | rejected | expired`
- DELETE sadece `draft` ve `sent` statüsünde mümkün (409 otherwise)
- RPC'ler atomic: `create_quote_with_lines`, `update_quote_with_lines`
- Migrations: `034_quotes.sql`, `035_quote_rpcs.sql`, `036_fix_quote_rpc_security.sql`

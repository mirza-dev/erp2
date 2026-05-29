---
name: KokpitERP — Teklif Modülü Roadmap
description: Teklif (quotes) modülünün tamamlanan fazları, V2 master plan referansı, kalan işler
type: project
originSessionId: f2c7abb6-e108-4254-b294-f3de57424ee3
---
## V7 Master Plan — diskte mevcut, 6 bulgu kod karşısında DOĞRULANDI (2026-05-29 6. tur) — Implement EDİLMEDİ

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` zaten V7 (02:02'de yazılmış, bu oturumdan önce). Kullanıcının "Kısa Review" 6 bulgusu (3 P1 + 3 P2) + 1 bonus = **7 düzeltme** V7-A1…A7 olarak plana işlenmiş. Bu oturumda 6 bulgunun tamamı kod karşısında doğrulandı (geçerli):

- **V7-A1 (P1) SECURITY DEFINER kaldırılır:** `036_fix_quote_rpc_security.sql:1-3` bilinçli kaldırmış; 065 RPC'lerinde de DEFINER yok → V7 SECURITY INVOKER (default) korur. ✅ doğrulandı.
- **V7-A2 (P1) quote_date NULLIF guard:** `065:71,132` `NULLIF(p_header->>'quote_date','')::date`. ✅ doğrulandı (direkt cast boş string'te patlar).
- **V7-A3 (P1) order_lines satır vat_rate snapshot:** `039:57` `order_lines.vat_rate numeric(5,2) NOT NULL DEFAULT 20`; `parasut-service.ts:686` `vat_rate: line.vat_rate ?? 20`. Accept RPC `v_quote.vat_rate`'i her satıra yazmalı. ✅ doğrulandı.
- **V7-A4 (P2) header discount Paraşüt:** `parasut-service.ts:688` `discount_value: line.discount_pct`. ✅ doğrulandı. **DİKKAT:** Kullanıcı bunu SORU sordu ("bu faz sadece SO snapshot mı, Paraşüt fatura da tutmalı mı?"); V7-A4 "gelecek faza ertelendi" KARARI verdi — kullanıcı bu kararı henüz onaylamadı.
- **V7-A5 (P2) accept öncesi PDF arşiv guard:** `quote_pdf_archives` henüz yok (Faz 4 migration 073). ✅ bulgu geçerli. **DİKKAT:** Kullanıcı "recover/generate VEYA 409" önerdi; V7-A5 **422 hard-fail** KARARI verdi — kullanıcı onayı bekliyor.
- **V7-A7 (bonus) order_lines tablo adı:** `001:110 create table order_lines`; `sales_order_lines` hiçbir migration'da YOK. ✅ doğrulandı (V6 örneği yanlış tablo adı kullanmış).
- **V7-A6 (P2) faz başı tam plan prosedürü:** delta plan → Faz 1'de self-contained tam plan yaz (3 adım).

**Açık onay bekleyen 2 P2 kararı:** (A4) Paraşüt header discount erteleme, (A5) PDF arşiv 422 hard-fail. İkisi de "spirit"e uygun ama kullanıcı bunları soru/seçenek olarak sundu → memory'de "kesinleşti" sayılmaz.

**Toplam: V7 = V2(5)+V3(12)+V4(13)+V5(5)+V6(4)+V7(7) = 46 düzeltme.** ~182 test · 12 migration (066-077) · 7 faz.
**Not:** V7 plan dosyası bu oturumda commit edildi (`d201c11`) ama commit mesajı yanlışlıkla "V6" der; içerik V7. Memory bu girişle V7'ye hizalandı.
**Sıradaki:** Faz 1 başlama onayı + yukarıdaki 2 P2 kararının teyidi bekleniyor.

---

## V6 Master Plan ONAYLANDI (2026-05-29 5. tur) — Implement EDİLMEDİ

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` — V6 versiyona güncellendi

**Kapsam:** 7 faz · 12 migration (066-077) · ~175 yeni test · 4-6 hafta tam zamanlı.

**4 düzeltme V6 (5. tur — schema uyum):**
- V6-A1: quote_line_items kolon isimleri **mevcut schema'ya bire bir** — `product_code` (product_sku DEĞİL), `description` (product_name DEĞİL); discount_pct/notes/product_sku/product_name kolonları DB'de yok → RPC'den kaldırıldı. Mapper UI alanları (productSku/productName) translate eder.
- V6-A2: Order number RPC adı **`generate_order_number()`** (next_order_number değil). 003/007 migration'larda tanımlı + orders.ts:59 kullanıyor.
- V6-A3: `sales_orders.vat_rate` snapshot kolonu eklenir — Migration 075 ALTER (DEFAULT 20, CHECK 0-100). Mevcut sales_orders'da vat_total var ama oran yok; quote'tan donmuş snapshot olmadan ileride VAT değişiminde eski siparişler bozulur.
- V6-A4: RPC'ler **tam rewrite DEĞİL** — mevcut create_quote_with_lines (065, 27 alan) + update_quote_with_lines korunur, sadece V5 yeni alanları (customer_address, seller_*, unit_weight_kg, kg_manual_override) eklenir. Migration 069 başlığı bunu açıkça yazar.

**Önceki düzeltmeler korundu:**
- V5 (5): Migration sırası FIX, RPC payload extension, Faz 2 validation order, accept atomik RPC, yearly counter backfill
- V4 (13): audit source, customer_address, seller snapshot, productId hard, PDF resume, DELETE draft, kg DB persist, /accept tek yol, quote_yearly_counters, RLS, hs/size geniş, audit source test, memory checklist
- V3 (12) + V2 (5): GTİP soft, status CHECK, audit kolonlar, productId hidden, PDF immutable, non-draft guard, sig backfill, currency reuse, prefix, src/proxy.ts, unitWeightKg, 0 fiyat 0.00, prepared/approved serbest text, expired→sent, root_quote_id, discount migration kaldırıldı, preview hibrit

**Toplam: V6 = V2 (5) + V3 (12) + V4 (13) + V5 (5) + V6 (4) = 39 düzeltme** entegre.

**Sıradaki:** Faz 1 başlama onayı bekleniyor. Her faz öncesi ayrı detay plan modu açılır.

---

## V5 Master Plan ONAYLANDI (2026-05-29 4. tur) — Implement EDİLMEDİ

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` — V5 versiyona güncellendi

**Kapsam:** 7 faz · 12 migration (066-077) · ~170 yeni test · 4-6 hafta tam zamanlı.

**5 düzeltme V5 (4. tur):**
- V5-A1: Migration sırası — Faz 1+2'nin ihtiyaç duyduğu tüm DB alanları Faz 1 migration grubunda (066-069). customer_address, seller_*, unit_weight_kg artık Faz 1'de hazır. Faz 5 069 ayrıştırıldı.
- V5-A2: Faz 1 yeni Migration 069 — create_quote_with_lines + update_quote_with_lines RPC'leri Faz 1 yeni alanları (customer_address, seller_*, unit_weight_kg, kg_manual_override) payload'tan okur. DB hazır, RPC tutarlı.
- V5-A3: Faz 2 validation order — schema Faz 1'de hazır olduğundan customerAddress + productId hard check güvenle Faz 2'de.
- V5-A4: `/accept` atomik RPC `accept_quote_and_create_order(quote_id, actor)` — Migration 075. Tek PL/pgSQL transaction içinde: SELECT FOR UPDATE quote → idempotency check → status guard → productId defensive → sales_order insert → order lines insert → quote status='accepted' → audit_log. Hata → tüm değişiklikler ROLLBACK.
- V5-A5: Yıllık counter backfill prefix/separator bağımsız — created_at'tan yıl, regex `\d+$` ile son rakam dizisi (TKL/PMT/ABC + -/. tüm formatlar destekli). Revision quote'lar (revision_no>0) backfill'de sayılmaz.

**Migration tahsisi V5:**
- 066: products.hs_code + size_text (Faz 1)
- 067: quotes.customer_address + seller_* 7 alan (Faz 1)
- 068: quote_line_items.unit_weight_kg + kg_manual_override (Faz 1)
- 069: Faz 1 RPC payload extension (V5-A2)
- 070: quotes.discount_amount + company_settings.default_vat_rate (Faz 3)
- 071: RPC header discount + draft guard (Faz 3)
- 072: status CHECK + revision + sig backfill + prefix + quote_yearly_counters (Faz 5)
- 073: quote_pdf_archives + RLS (Faz 4c)
- 074: storage quote-pdfs bucket (Faz 4c)
- 075: sales_orders meta + accept_quote_and_create_order RPC (Faz 6, V5-A4)
- 076: note_templates + RLS (Faz 7)
- 077: quote_line_items_sort_order (Faz 7, koşullu)

**Önceki düzeltmeler korundu:**
- V4 (13 düzeltme): audit_log.source='system', customer_address+validator, seller_* snapshot, productId hard, PDF 3 path resume, DELETE draft, kg DB persist, /accept tek yol, quote_yearly_counters, RLS, hs/size geniş, audit source test, memory checklist
- V3 (12 düzeltme): GTİP soft, status CHECK constraint, audit_log kolonları, productId hidden, PDF immutable INSERT-only, non-draft guard, sig backfill, currency reuse, prefix migration, src/proxy.ts, unitWeightKg, 0 fiyat 0.00
- V2 (5 düzeltme): prepared/approved serbest text, expired→sent, root_quote_id, discount migration kaldırıldı, preview hibrit

**Toplam: V5 = V2 (5) + V3 (12) + V4 (13) + V5 (5) = 35 düzeltme** entegre.

**Sıradaki:** Faz 1 başlama onayı bekleniyor. Her faz öncesi ayrı detay plan modu açılır.

---

## V4 Master Plan ONAYLANDI (2026-05-29 3. tur) — Implement EDİLMEDİ

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` — V4 versiyona güncellendi

**Kapsam:** 7 faz · 10 migration (066-075) · ~145 yeni test · 4-6 hafta tam zamanlı.

**Sıra:** Faz 1 → 2 → 3 → 5 → 4 → 6 → 7 (V3 ile aynı bağımlılık zinciri).

**8 ana düzeltme V4 (3. tur):**
- V4-A1: audit_log.source='system' (enum uyumu; AuditSource = "ui"|"system"|"ai"|"integration"; literal 'migration_069' patlardı)
- V4-A2: quotes.customer_address snapshot + zorunlu validator + backfill + PDF render + müşteri seçiminde auto-fill
- V4-A3: seller_* 7 snapshot alanı DB'de (name/phone/email/address/tax_id/website/logo_url) + sent'te dondur
- V4-A4: productId send-time HARD check (rows.every productId) + convert defensive check (custom satır izinsiz)
- V4-A5: PDF arşiv 3 path resume strategy (idempotent/resume/fresh; partial failure recovery)
- V4-A6: DELETE sadece draft (mevcut sent silinebilir, V4'te 409)
- V4-A7: unit_weight_kg + kg_manual_override DB persist (reload sonrası korunur)
- V4-A8: /accept tek yol; PATCH transition accepted 410 Gone + /convert 410 Gone

**5 ikincil düzeltme V4:**
- V4-B1: quote_yearly_counters tablo + atomik INSERT ON CONFLICT (mevcut quotes_number_seq global, yıllık reset yok)
- V4-B2: RLS ENABLE her yeni tabloya (quote_pdf_archives, note_templates, quote_yearly_counters)
- V4-B3: hs_code/size_text geniş entegrasyon (CreateProductInput + mapper + import wizard)
- V4-B4: audit-source-enum.test.ts (migration/RPC source enum coverage)
- V4-B5: Memory update checklist faz sonu

**Önceki düzeltmeler korundu:**
- V3 (12 düzeltme): GTİP soft, status text+CHECK, audit_log kolon isimleri, productId hidden, PDF immutable INSERT-only, non-draft guard, sig backfill, currency reuse, prefix migration, src/proxy.ts, unitWeightKg gizli, 0 fiyat 0.00
- V2 (5 düzeltme): prepared/approved serbest text + user FK audit, expired→sent, root_quote_id zincir fix, discount migration KALDIRILDI, preview hibrit

**Toplam: V4 = V2 (5) + V3 (12) + V4 (13) = 30 düzeltme** entegre.

**Sıradaki:** Faz 1 başlama onayı bekleniyor. Her faz öncesi ayrı detay plan modu açılır.

---

## V3 Master Plan ONAYLANDI (2026-05-29 2. tur) — Implement EDİLMEDİ

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` — V3 versiyona güncellendi

**Kapsam:** 7 faz · 9 migration (066-074) · ~125 yeni test · 4-6 hafta tam zamanlı tahmin.

**Sıra:** 1 (master + productId + unitWeightKg) → 2 (validation: hs+kg soft, draft guard) → 3 (header discount + currency reuse) → 5 (CHECK constraint update + revision + root_quote_id + expired→sent + sig backfill + prefix) → 4 (PDF + INSERT-only arşiv + preview hibrit + 0.00 fmt) → 6 (kabul → sales_order + productId) → 7 (liste UX, autosave, note_templates).

**6 ana düzeltme V3 (2. tur):**
- V3-A1: GTİP soft warn (HARD değil), KG gibi yumuşak
- V3-A2: Status migration text+CHECK constraint paterni (enum DEĞİL — quotes.status text)
- V3-A3: audit_log kolon isimleri (`entity_type/entity_id/before_state/after_state/source`; target_*/payload YANLIŞ)
- V3-A4: QuoteRow.productId hidden field Faz 1'de (convert flow için kritik)
- V3-A5: PDF immutable arşiv — INSERT-only, upsert=false; varsa mevcut signed URL döner
- V3-A6: Non-draft update/delete HARD guard (helper + RPC SQL guard + 409)

**6 ikincil düzeltme V3:**
- V3-B1: sig_prepared/sig_approved → prepared_by_name/approved_by_name backfill
- V3-B2: company_settings.currency reuse (default_currency DUPLICATE etme)
- V3-B3: quote_number_prefix/separator migration SQL'e dahil
- V3-B4: src/proxy.ts (NOT middleware.ts — Next 16 convention)
- V3-B5: unitWeightKg gizli alan KG recompute için
- V3-B6: 0 fiyat PDF "0.00" (mevcut kod "—" basıyor)

**6 önceki V2 düzeltmesi korundu:** prepared/approved serbest text + user FK audit; legacy expired → sent; root_quote_id zincir fix; discount migration YOK (legacy snapshot); preview hibrit.

**Sıradaki:** Faz 1 başlama onayı bekleniyor. Her faz öncesi ayrı detay plan modu açılır.

**Why:** Kullanıcı kapsamlı revize istedi: ürün auto-fill + çift dilli kurumsal PDF + revizyon + immutable arşiv + kabulde sipariş dönüşümü. Mevcut Faz 1-8 üzerine inşa edilir.
**How to apply:** Faz başlangıçlarında bu dosyayı oku → ilgili fazın migration/dosya/test detayını master plandan çek → faz-spesifik plan yaz → implement et.

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

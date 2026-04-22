---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Teklif Roadmap Tamamlandı:** Faz 1–8 + tüm bulgular fix — tüm fazlar ✅

**Sonraki:** Belirsiz — kullanıcı yönlendirecek

---

**Son tamamlanan (2026-04-22 — Faz 8 Bulgular Fix Round 2):**

1. `quote-service.ts`: geçmiş `valid_until` → `serviceCreateOrder`'a varmadan soft 400 (tarih mesajı dahil)
2. `quote-service.ts`: atlanan satırlar sipariş `notes`'una ekleniyor: `[Dönüştürme: N satır atlandı — Satır X, ...]`
3. 4 yeni test (T16–T19): expired valid_until, null valid_until, notes append x2
4. **83 dosya · 1609 test — 0 hata · 0 TS hatası** — commit `3634b1c`

**Son tamamlanan (2026-04-22 — Faz 8 Bulgular Fix Round 1):**

1. `037_unique_quote_id.sql`: `sales_orders.quote_id` partial UNIQUE index — DB seviyesinde race condition fix
2. `quote-service.ts`: 23505 unique violation catch → `alreadyConverted`; `createdBy` param eklendi
3. `convert/route.ts`: session extract → `created_by`; 409'da `existingOrderNumber` dahil
4. `page.tsx`: 409 handler `setConvertedOrderNumber` — badge artık sipariş numarasını gösteriyor
5. `QuoteForm.tsx`: `position: i` → `position: i + 1` (1-based satır numaraları)
6. T15 race condition testi + route testine `@/lib/supabase/server` mock

**Son tamamlanan (2026-04-22 — Faz 8: Siparişe Dönüştür):**

1. `serviceConvertQuoteToOrder`: accepted teklif → draft sipariş; ürün/müşteri lookup, finansal yeniden hesaplama, idempotency
2. `dbFindOrderByQuoteId`: `sales_orders.quote_id` FK üzerinden idempotency kontrolü
3. `POST /api/quotes/[id]/convert`: 201/400/404/409 + 4 cache tag invalidation
4. GET /api/quotes/[id]: accepted tekliflere `convertedOrderId`/`convertedOrderNumber` eklendi
5. Quote detail page: "Siparişe Dönüştür" butonu + confirm dialog + "Sipariş oluşturuldu" badge
6. Order detail page: "Kaynak Teklif" linki (`quoteId` varsa)
7. `OrderDetail.quoteId` + `mapOrderDetail` mapper güncellendi
8. 22 yeni test (14 service + 8 route)

**Son tamamlanan (2026-04-21 — Faz 7: Durum Yönetimi):**

1. Durum geçiş butonları: draft→sent, sent→accepted/rejected
2. CRON: `POST /api/quotes/expire` → `serviceExpireQuotes()`, middleware CRON_PATHS'e eklendi
3. Teklif detay sayfası client component → status bar + aksiyon butonları + confirm dialog
4. QuoteForm readOnly prop: non-draft teklifler kilitli
5. Bulgular fix: PATCH doc-update draft guard, CRON revalidateTag, autoSave readOnly guard, 404 vs 409 ayrımı

**Son tamamlanan (2026-04-21 — Faz 5+5.5: DB Persistence + Güvenlik):**

- Migration 034–036: quotes tablosu, atomic RPC'ler, RLS
- Otomatik TKL-YYYY-NNN numaralandırma
- Security: CRON_SECRET Bearer, requireAdmin(), security headers

**Bekleyen manuel adımlar:** ✅ Tamamlandı (2026-04-22)
- Migration 037 uygulandı
- Sentry DSN `.env.local` ve GitHub Secrets'a eklendi

**Why:** Yeni session'da Claude aktif konuyu bilsin.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.

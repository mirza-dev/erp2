# Quotes Modülü Derin Denetim — Bulgular

**Tarih:** 2026-06-18
**Kapsam:** Teklif (quotes) modülü — `src/lib/services/quote-service.ts`, `src/lib/supabase/quotes.ts`, `src/lib/quote-*`, `src/app/api/quotes/**`, `src/app/dashboard/quotes/**`, paylaşım token + public arşiv yüzeyi.
**Yöntem:** REVIEW.md kurallarıyla read-only inceleme (erp2-reviewer checklist'i + manuel kanıtlama). Önceki iki "Bulgular" turu (Faz 6 + Faz 8) sonrası modül olgun; bu tur yeni/izlenmeyen noktaları hedefler.
**Özet:** **K:0 · Y:0 · O:1 · D:1 · Nit:1.** Tek eyleme dönük bulgu O1 (kullanıcı kararıyla düzeltildi). Diğer yüzeyler temiz.

---

## O1 (Orta) — İki ayrı teklif-sona-eriş cron'u çakışıyor (legacy sales_order modeli)

**Kanıt:** `.github/workflows/crons.yml:90-106` her ikisini de 6 saatte bir ardışık çağırıyordu:
- `/api/quotes/expire` → `quote-service.serviceExpireQuotes` — **canonical**: yeni `quotes` tablosunu tarar; teklifi `expired` yapar, `dbCancelQuoteLinkedOrder` ile bağlı `pending_approval` siparişi iptal eder (rezerv release), `quote_expired` alert (entity_type=`quote`).
- `/api/orders/expire-quotes` → `order-service.serviceExpireQuotes` (`src/lib/services/order-service.ts:476`) — **legacy** eski model: `orders.dbListExpiredQuotes` (`src/lib/supabase/orders.ts:426`) `sales_orders` WHERE `commercial_status IN (draft,pending_approval) AND quote_valid_until < today`. 088 RPC (`supabase/migrations/088_quote_send_reservation.sql:102`) ve 077 RPC (`supabase/migrations/077_quotes_accept_order.sql:88`) `quote_valid_until` kolonunu oluşturulan sipariş satırına YAZAR.

**Etki:**
1. **Çift `quote_expired` alert** — her sona eren sent teklif için: canonical entity_type=`quote`, legacy entity_type=`sales_order` açar. Dedup indexi (`idx_alerts_active_dedup`) `(type, entity_type, entity_id)` ayrımına dayandığından farklı entity → iki kayıt da hayatta kalır → Uyarılar sayfasında tek mantıksal sona-eriş için çift gürültü. Workflow sırası legacy'yi önce çağırdığından, ürettiği `sales_order` alert'i canonical'in az sonra iptal ettiği siparişe işaret eder.
2. **Bant-dışı draft sipariş iptali** — legacy `dbCancelOrder` (`order-service.ts:493`) `quote_valid_until` geçmiş `draft` `sales_orders`'u iptal eder. 077 accept (linked pending yoksa fallback) `quote_valid_until`'li draft sipariş yaratır → kabul edilmiş tekliften doğan, onay bekleyen meşru bir taslak sipariş cron'da sessizce iptal olabilir (soft-hold release). Canonical akışın yaptığı işi tekrarlamaz; ona çelişir.

**Önceki iz:** `docs/audit/2026-06-review-bulgular.md:46` "legacy duplikatı sil" demiş; yalnız `requireCronSecret(req)` eklenmiş, divergent logic silinmemiş.

**Düzeltme (kullanıcı kararı: tamamen sil — 2026-06-18):**
- Silindi: `src/app/api/orders/expire-quotes/route.ts`, `src/__tests__/expire-quotes-route.test.ts`, `src/__tests__/expire-quotes-service.test.ts`.
- Kaldırıldı: `order-service.serviceExpireQuotes` + artık kullanılmayan `dbCreateAlert`/`dbListActiveAlerts` importları; `orders.dbListExpiredQuotes` (prod çağıranı kalmadı).
- Config: `crons.yml` "Orders — expire quotes" adımı + OUTCOMES satırı; `proxy.ts` CRON_PATHS girişi. `smoke.ts` `[19]` canonical `/api/quotes/expire`'a yönlendirildi.
- Korundu: canonical `quote-service.serviceExpireQuotes` + `quotes.dbListExpiredQuotes` + `/api/quotes/expire` (088 modelini tam kapsar → kayıp yok).

---

## D1 (Düşük — zaten izlenen, YENİ değil) — Liste/detay GET route-seviye guard'sız

`GET /api/quotes` ve `GET /api/quotes/[id]` yalnız `getCurrentUserPermissions` + redaction uygular (grandTotal/satır fiyatları `view_sales_prices` yoksa null); route-seviye `view_quotes` guard'ı yok. Liste + müşteri adları her oturumlu iç kullanıcıya açık; sayfa erişimi proxy page-gate'inde. `memory/project_quotes` "KALAN: GET view_quotes RBAC" borcunda zaten kayıtlı. A1'de eklenen `quotes/page.tsx` route'u birebir aynalar (tutarlı). **Bu turda düzeltilmedi** (ayrı RBAC borcu).

## Nit (1) — `preview-pdf` Content-Disposition filename

`src/app/api/quotes/preview-pdf/route.ts` `filename="${quotePdfFilename(data.quoteNo)}"` header'a interpole ediyor; CRLF/`"` enjeksiyonu teorik (modern runtime geçersiz header karakterini reddeder; uç `view_quotes` korumalı). Düşük; bu turda dokunulmadı.

---

## Temiz doğrulananlar (bulgu YOK)

- **Paylaşım token** (`quote-share-token.ts`): HMAC-SHA256 + `timingSafeEqual` + fail-closed + `exp` kontrolü; sır yoksa alan-ayrımlı CRON_SECRET türevi.
- **Public `shared/[token]` route**: token-gated, fail-closed (503/403/404/502/500 HTML), `X-Robots-Tag: noindex`, donmuş arşivi kendi origin'inden `text/html` servis (stored-XSS koruması).
- **Arşiv HTML** (`quote-archive-html.ts`): gövde `renderToStaticMarkup(QuoteDocument)` → React otomatik escape; `dangerouslySetInnerHTML` yalnız statik CSS sabitleri (PAGE/PRINT/INJECTED_CSS). Ham string HTML concat YOK. RFQ O1'deki escape açığı kalıbı burada YOK.
- **SSRF guard** (`inlineLogoAsDataUri`): yalnız kendi Supabase host'u fetch; MIME allowlist + 512KB sınır.
- **RBAC**: tüm mutasyon route'larında guard — POST/PATCH `manage_quotes`, DELETE `delete_quotes`, accept/send-email/revise `manage_quotes`, archive `view_sales_prices`, preview-pdf `view_quotes`, expire CRON_SECRET; convert = 410 tombstone.
- **HTTP map'ler**: accept (notFound→404/invalidStatus→409/archiveFailed→502/expired→400/unprocessable→422) ve send-email (no_email→400/suppressed→409/pdf_failed→502/config→503) service flag'lerini doğru çevirir.
- **Sunucu-otoriter validasyon** (`quote-validation.ts`): `validateDiscount` NaN/Infinity + negatif + subtotal-üstü guard; qty pozitif tam sayı; not ≤800; PATCH = POST parity.
- **Redaction parity**: `quotes/page.tsx` (A1) `redactQuotesForPerms(map → perms)` route GET ile birebir; client `maskCurrency` + sunucu redaction (defense-in-depth).
- **Demo**: proxy non-GET API'yi 403'ler (per-route kontrol gerekmez, kod tabanıyla tutarlı).
- **Concurrency**: `dbUpdateQuoteStatus` optimistik (eq expected-status); arşiv üç-durumlu obje doğrulama (present/missing/unknown); audit best-effort, başarıdan sonra.

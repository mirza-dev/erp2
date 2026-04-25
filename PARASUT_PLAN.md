# Paraşüt Entegrasyonu — Canlıya Alma Hazırlığı (API hariç)

## 🎯 Progress Tracker

**Son güncelleme:** 2026-04-26
**Durum:** Faz 8 TAMAMEN KAPALI — Faz 9 sırada

### Faz ilerlemesi

| # | Faz | Durum | Son güncelleme | Notlar |
|---|-----|-------|---------------|--------|
| 1 | Migration + adapter interface + sabitler + mock yeniden yazımı | ✅ Tamamlandı | 2026-04-25 | 1683 test yeşil, TS temiz |
| 2 | OAuth token lease + CAS + `/oauth/start` + `/callback` | ✅ Tamamlandı | 2026-04-25 | 1704 test yeşil, TS temiz; bulgu fix: re-read after lease, upsert, HMAC cookie |
| 3 | `parasutApiCall()` wrapper (429 Retry-After + context logging) | ✅ Tamamlandı | 2026-04-25 | 1719 test yeşil, TS temiz; PARASUT_ENABLED guard, 15 test |
| 4 | Error classification + step-based backoff + stats order-state | ✅ Tamamlandı | 2026-04-25 | 1743 test yeşil, TS temiz; classifyAndPatch+markStepDone+checkAuthAlertThreshold, 24 yeni test |
| 5 | Contact upsert (tax_number zorunlu, email ikinci savunma) | ✅ Tamamlandı | 2026-04-25 | 1791 test yeşil, TS temiz; serviceEnsureParasutContact + TTL lease mutex (migration 040) + 4 bulgu fix, 31 test |
| 6 | Product upsert (filter[code]) | ✅ Tamamlandı | 2026-04-25 | 1810 test yeşil, TS temiz; serviceEnsureParasutProduct + TTL lease mutex (migration 041) + 19 test |
| 7 | Claim/lease RPC + deterministik numara + remote lookup | ✅ Tamamlandı | 2026-04-26 | 1824 test yeşil, TS temiz; parasutInvoiceNumberInt + mapCurrency(GBP) + claim/release RPC + stubs(Faz8-10) + 27 test; bulgu fix: claimErr audit trail, retry skipped log, catch DB write |
| 8 | Shipment document (inflow=false + procurement_number + marker) | ✅ Tamamlandı | 2026-04-26 | 1852 test yeşil, TS temiz; upsertShipment + dbWriteShipmentMeta + durable marker + recovery pagination + 28 test; bulgu fix: marker sırası, alert best-effort, recovery parasutApiCall, orderId context |
| 9 | Sales invoice (shipment_included=false + warehouse YOK invariant) | ⬜ Başlamadı | — | Stok invariant sandbox gate |
| 10 | E-belge create + trackable_job poll + invoice re-read | ⬜ Başlamadı | — | |
| 11 | Backend preflight + step-granular manual retry + UI badges | ⬜ Başlamadı | — | |
| 12 | Gerçek API adapter + sandbox GATE | ⬜ Başlamadı | — | Kullanıcı yapacak (en son) |

**Durum legend:** ⬜ Başlamadı · 🟦 Devam ediyor · ✅ Tamamlandı · ⚠️ Bloklu / manuel inceleme

### Sıradaki adım
Faz 9 — Sales invoice (shipment_included=false, parasutInvoiceNumberInt, mapCurrency, durable marker, recovery lookup).

### Son oturum özeti
- **Faz 8 tamamlandı + bulgu fix (2026-04-26):**
  - `src/lib/services/parasut-service.ts`: `upsertShipment` stub → tam implementasyon
    - `dbWriteShipmentMeta(orderId, ship)` — shipment_document_id + synced_at + error=null
    - Idempotent: `parasut_shipment_document_id` dolu → erken dön
    - Recovery: `listRecentShipmentDocuments` pagination (max 5 sayfa, env ile artırılabilir) + local procurement_number filter; `parasutApiCall` wrapper'ından geçiyor (429 retry + context log)
    - `hasAttemptedBefore + recovery negatif` → alert best-effort (dbCreateAlert try/catch) + `ParasutError('validation')` her koşulda fırlatılır
    - Durable marker: tüm validasyonlar (customer, product re-fetch, parasut_product_id) geçtikten sonra, create çağrısından hemen önce yazılır
    - `createShipmentDocument`: `parasutApiCall({ op, orderId, step })` — orderId context dahil
    - Import: `ALERT_ENTITY_PARASUT_SHIPMENT`, `ParasutShipmentDocument`
  - **Bulgu fix (2026-04-26):**
    - HIGH: Marker sırası — validasyon öncesi değil sonrası; ürün ID eksikse marker kalmaz
    - MEDIUM: `dbCreateAlert` hata verirse `validation` semantiği maskelenmez (try/catch)
    - MEDIUM: Recovery loop `parasutApiCall` wrapper'ından geçiyor (429 + log standardı)
    - MEDIUM: `createShipmentDocument` wrapper'ında `orderId` eksikti — eklendi
  - `src/__tests__/parasut-service-faz8.test.ts`: 28 test (idempotent, recovery, hasAttemptedBefore, create, validasyon, marker, meta)
  - `src/__tests__/parasut-service-faz7.test.ts`: stub assertion'lar güncellendi
  - **1852 test yeşil, 95 dosya, TS clean**

- **Faz 7 tamamlandı + bulgu fix (2026-04-25 → 2026-04-26):**
  - `src/lib/services/parasut-service.ts`: orkestra yeniden yazıldı
    - `export function parasutInvoiceNumberInt(orderNumber)` — ORD-YYYY-NNNN → deterministik int, Date.now() fallback yok
    - `export function mapCurrency(c)` — GBP eklendi (spec TRL|USD|EUR|GBP)
    - `mapOrderToParasut` + eski `sendInvoiceToParasut` çağrısı kaldırıldı
    - `SyncOrderResult` → `skipped?` + `reason?` alanları eklendi
    - `serviceSyncOrderToParasut` rewrite: customer_id null guard → `parasut_claim_sync` RPC → step orchestration (contact→product→shipment stub→invoice stub→edoc stub) → catch: classifyAndPatch + DB patch + sync log → finally: `parasut_release_sync` (best-effort)
    - `upsertShipment/Invoice/EDocument` stub fonksiyonları (Faz 8/9/10'da doldurulacak)
    - `serviceSyncAllPending`: skipped sipariş synced/failed sayaçlarını artırmaz
  - **Bulgu fix (2026-04-26):**
    - HIGH (kapatıldı önceki tur): `claimErr` check eklenmişti — şimdi ayrıca `classifyAndPatch` + DB patch + sync log yazıyor (audit trail eksiği kapatıldı)
    - MEDIUM: `serviceRetrySyncLog` skipped sonuçta log'u `"error"` yazmıyor; `"retrying"` kalıyor
    - Sağlamlık: catch block `supabase.update().eq()` sonucundan `{ error: patchErr }` destructure, patchErr varsa `console.error` (sessiz kayıp kapatıldı)
  - `src/__tests__/parasut-service-faz7.test.ts`: 27 test
  - `src/__tests__/parasut-service.test.ts`: sendInvoice bağımlı testler kaldırıldı, RPC mock + skipped log testi eklendi
  - `src/__tests__/parasut-disabled.test.ts`: "proceeds to sendInvoice" → "parasut_claim_sync çağrılır" olarak güncellendi
  - **1824 test yeşil, 94 dosya, TS clean**

- **Faz 6 tamamlandı (2026-04-25):**
  - `src/lib/services/parasut-service.ts`: `serviceEnsureParasutProduct(productId)` eklendi; idempotent, SKU trim, `findProductsByCode` 0/1/>1 yolları, TTL lease mutex
  - `supabase/migrations/041_parasut_product_lease.sql`: `products` tablosuna `parasut_product_creating_until` + `parasut_product_creating_owner` eklendi (OAuth + contact ile aynı pattern)
  - `src/lib/database.types.ts`: `ProductRow`'a 2 lease alanı eklendi
  - `src/__tests__/parasut-service-faz6.test.ts`: 19 test (idempotent, guard, findByCode 1/multi/0, TTL lease tüm dallar)
  - **1810 test yeşil, 93 dosya, TS clean**

- **Faz 5 — 2. bulgu turu (2026-04-25) — 2 fix:**
  - BLOCKER: `releaseCreate`'teki `.catch()` (PostgrestFilterBuilder'da yok) → `try/catch` block'a çevrildi
  - HIGH: `__creating_${customerId}` placeholder yerine TTL lease pattern (migration 040):
    - `customers` tablosuna `parasut_contact_creating_until` + `parasut_contact_creating_owner` eklendi
    - `claimOrSkip`: `.is(null).or(lease expired)` atomic claim + stale-lease auto-recovery
    - `finishCreate`: owner-gated write; 0 rows → lease lost → ParasutError('server')
    - `releaseCreate`: owner-gated, best-effort try/catch
    - `parasut_contact_id` semantiği temiz: her zaman NULL veya gerçek Paraşüt UUID
  - Test: 25 → 31 test, tsc temiz, 1791 test yeşil

- **Faz 5 bulgu düzeltmeleri (2026-04-25) — 4 fix:**
  - HIGH: DB write hataları artık throw ediyor (tüm 4 yazım noktası)
  - HIGH: Create path race guard: `WHERE parasut_contact_id IS NULL` + re-read on 0 rows (`writeContactIdCreate`)
  - MEDIUM: `tax_number?.trim()` — whitespace-only boş sayılıyor
  - MEDIUM: Tüm adapter çağrıları `parasutApiCall()` wrapper'ından geçiyor
  - Test: 18 → 25; `PARASUT_ENABLED=true` beforeEach/afterEach; `.is().select()` mock chain eklendi
  - **1785 test yeşil, 92 dosya, TS clean**

- **Faz 5 tamamlandı (2026-04-25):**
  - `src/lib/services/parasut-service.ts`: `serviceEnsureParasutContact(customerId)` eklendi; idempotent, tax_number trim, email fallback, updateContact çağrısı
  - `src/__tests__/parasut-service-faz5.test.ts`: 18 yeni test
  - **1761 test yeşil, TS clean**

- **Faz 4 tamamlandı (2026-04-25):**
  - `src/lib/supabase/sync-log.ts`: `CreateSyncLogInput`'a `step?`, `error_kind?`, `metadata?` eklendi
  - `src/lib/services/parasut-service.ts`: `classifyAndPatch()`, `markStepDone()`, `checkAuthAlertThreshold()` eklendi; `serviceSyncAllPending()` CRON sorgusu step-tabanlıya güncellendi
  - `src/app/api/parasut/stats/route.ts`: `pending_syncs` (step-tabanlı), `failed_syncs` (retry_count<5), `blocked_syncs` (auth/validation) step-tabanlı sorgulara güncellendi
  - `src/__tests__/parasut-service-faz4.test.ts`: 24 yeni test (classifyAndPatch 12, markStepDone 6, checkAuthAlertThreshold 5+)
  - **1743 test yeşil, TS clean**

- **Faz 3 tamamlandı (2026-04-25):**
  - `src/lib/services/parasut-api-call.ts`: `parasutApiCall<T>(ctx, fn)` wrapper
  - PARASUT_ENABLED guard (false/unset → `ParasutError('validation')` fırlatır, fn çağrılmaz)
  - 429 Retry-After: `wait = min(retryAfterSec ?? 5, 30)` → tek retry; ikinci hata olursa fırlatır
  - Structured logging: success / rate_limited / success_after_retry / error / error_after_retry
  - `src/__tests__/parasut-api-call.test.ts`: 15 test
  - **1719 test yeşil, TS clean**

- **Faz 2 tamamlandı (2026-04-25) — bulgu fix dahil:**
  - `src/lib/parasut.ts`: `getParasutAdapter()` factory eklendi
  - `middleware.ts`: `/api/parasut/oauth/callback` → ALWAYS_PUBLIC
  - `src/lib/services/parasut-oauth.ts`: `getAccessToken(adapter)` — token geçerliyse skip, lease+**re-read after lease** (stale refresh_token fix), CAS, CAS çakışmasında sync_issue alert, 5-poll 1s
  - `src/app/api/parasut/oauth/start/route.ts`: requireAdmin, **HMAC-signed state cookie** (CRON_SECRET), mock bypass, gerçek mod → authorize redirect
  - `src/app/api/parasut/oauth/callback/route.ts`: HMAC+timingSafeEqual CSRF doğrulama, 409 lock guard, **atomic upsert** (ON CONFLICT singleton_key), 502 hata yolu
  - `src/__tests__/parasut-oauth.test.ts`: 21 test (re-read fresh token testi dahil)
  - **1704 test yeşil, TS clean**
  - Bulgu kapatma: HIGH stale refresh_token ✅ · HIGH non-atomic insert ✅ · LOW unsigned cookie ✅ · MEDIUM re-auth CAS → pratik risk sıfır, yapılmadı (auth code single-use)

- **Faz 1 tamamlandı (2026-04-25):**
  - `039_parasut_integration_prep.sql`: token tablosu, customers/products/order_lines/sales_orders yeni kolonlar, CHECK constraints, partial unique index'ler, retry index, claim/release RPCs (SECURITY DEFINER + REVOKE/GRANT)
  - `parasut-constants.ts`: sabit UUID'ler, tip alias'ları
  - `parasut-adapter.ts`: `ParasutError` + `ParasutAdapter` interface (tüm metodlar + input tipleri)
  - `parasut.ts`: `MockParasutAdapter` (in-memory, invariant assertions, idempotency) + legacy `sendInvoiceToParasut` delegate
  - `database.types.ts`: CustomerRow/ProductRow/OrderLineRow/SalesOrderRow/IntegrationSyncLogRow/ParasutOAuthTokensRow güncellendi; ParasutStep/ParasutErrorKind/ParasutInvoiceType/ParasutEDocStatus eklendi
  - `credentials-no-leak.test.ts`: settings/company route OAuth sızıntı regresyon testi eklendi
  - **1683 test yeşil, TS clean, build clean**
  - Bulgu fix (2026-04-25): test kapsamı genişletildi (86 dosya, 37 yeni test); credentials-no-leak poisoned fixture; error injection tri-state; e-doc type tracking; settings/company GET allowlist

### Bloklu / açıklanması gereken
- Sandbox GATE testleri: stok invariant, procurement_number uniqueness, city/district zorunluluğu — Faz 12'de gerçek API ile doğrulanacak.
- RPC permission smoke testi (`parasut_claim_sync` service_role ✓, anon ✗) — gerçek DB gerektirir, unit test dışı. Talimat: `039_parasut_integration_prep.sql` dosyasının sonundaki yorum bloğu. Faz 12 gate'inden önce staging'de doğrulanmalı.

---

## Context

Paraşüt sync şu an mock. Kullanıcı gerçek API adapterını **en son** ekleyecek. Bu plan — Paraşüt OpenAPI V4 (https://raw.githubusercontent.com/parasutcom/api-doc/.../spec/swagger.yaml) spesifik alanları gözetilerek — orkestra + güvenlik + duplicate koruması + stok invariant + debug gözlemlenebilirliği kurmak.

**Orkestra ilkesi:** Paraşüt tek çağrıyla "shipment+fatura+e-belge+stok" yapmaz; ERP sırayla çağırır. Paraşüt her bir belgeyi kendi işler (GIB dahil). Ayrıca spec'te `sales_invoice → shipment_document` **relationship YOK** — iki belge API'de birbirine bağlanmaz; tutarlılık `procurement_number` ve `description` ile sağlanır.

### Spec'ten doğrulanan kritik gerçekler (swagger.yaml satır no'larıyla)
| Konu | Gerçek |
|------|--------|
| **SalesInvoice relationships** (17461-17608) | `category, contact, details, payments, tags, sales_offer, sharings, recurrence_plan, active_e_document` — **`shipment_document` YOK** |
| **SalesInvoice attrs `shipment_included`** (17416) | `boolean` — "İrsaliyeli fatura" (true ise invoice içinde irsaliye otomatik → stok hareketi; **false zorunlu** çünkü biz shipment_document ayrı keseceğiz) |
| **`manage_inventory`** | **Spec'te YOK** — plan bu alanı kullanamaz |
| **SalesInvoiceDetail required** (17738-17741) | `quantity, unit_price, vat_rate` — `product` ve `warehouse` relationship **OPSİYONEL (spec bazında)** |
| **Stok hareketi davranışı** | **Schema garantisi YOK** — varsayım: `detail.warehouse` gönderilmezse stok hareketi tetiklenmez. **Bu invariant sandbox'ta açık testle doğrulanacak** (aşağı Faz 9 GATE). Spec'te bu davranışın açık kanıtı yok; canlıya geçmeden önce kesin test. |
| **ShipmentDocument attrs** (18395-18428) | `inflow: boolean` (satış için **false**), `procurement_number: string` (deterministik ref), `shipment_date`, `city/district/address`, `issue_date` required |
| **listShipmentDocuments filter** (11600-11610) | SADECE `filter[flow_type], filter[invoice_status], filter[archived]` — **`procurement_number` filter YOK** → crash recovery için pagination + local filter |
| **listSalesInvoices filter** (8597-8604) | `filter[invoice_id]` (integer) + `filter[invoice_series]` + `filter[contact_id]` — **fast remote lookup ÇALIŞIR** |
| **listProducts filter** | `filter[name], filter[code]` — SKU için `filter[code]` kullanılacak |
| **TrackableJob enum** (18880-18883) | `running, done, error` — **3 değer**; `pending` spec enum'da YOK (sadece narrative). Adapter pending'i tolere eder ama enum'a eklenmez; raw değer `integration_sync_logs.metadata`'ya yazılır |
| **Contact filter** | `filter[tax_number], filter[email], filter[name], filter[tax_office]` |
| **SalesInvoice currency enum** (17068-17074) | `TRL, USD, EUR, GBP` — **4 değer** (mevcut adapter GBP'yi kapsamıyordu) |
| **OAuth rotate** | Refresh her call'da yeni `refresh_token` döndürür |
| **Rate limit** | 10 req / 10 sn |

### Kullanıcı kararları
- Fazlara bölünür, hatasızlık öncelikli
- Single-tenant
- Kısmi sevkiyat + iade **v2**
- İrsaliye otomatik dahil
- B2C/e-arşiv tax_number fallback **v2** (bu turda tax_number zorunlu)

### Stok invariant (canlı gate)
> **Hedef:** Paraşüt stok hareketi TEK YERDE — `shipment_document` (`inflow=false`).
> `sales_invoice` payload'ında `shipment_included=false` ve detail'larda `warehouse` relationship **gönderilmez**.
> **Bu bir varsayımdır, spec'te kanıt YOK.** Sandbox gate (Faz 9 + Faz 12) kesin doğrulamayı yapar:
> - Stok seviyesini ölç → shipment kes → invoice kes → **tek N düşüş** olmalı, iki N değil
> - Doğrulama başarısızsa alternatif payload kombinasyonları test edilir (örn. detail'da product da gönderilmeden deneme)
> - Doğrulanmadan canlıya geçilmez.

### Akış sırası
```
shipped transition
  → (1) contact upsert (customer.parasut_contact_id)
  → (2) product upsert (her line, eksik olanlara)
  → (3) shipment_document (inflow=false, procurement_number=order_number)
  → (4) sales_invoice (shipment_included=false, detail'da warehouse yok, invoice_series+invoice_id deterministik)
  → (5) e_invoice veya e_archive → trackable_job_id (invoice_type: customer tax_number + listEInvoiceInboxes)
  → (6) Poll CRON trackable_job → done → GET sales_invoices/{id}?include=active_e_document → e_document_id
```

### Repo kısıtları
- `database.types.ts` hand-written → manuel edit (`gen types` yasak)
- Tarih alanları `string` (ISO) → `.toISOString()`
- `alerts.entity_id uuid` + dedup `(type, entity_id)` partial index → sabit UUID'ler
- `customer_id` nullable + `purchase_commitments`/`column_mappings` RLS zaten 029'da ✅
- `/api/settings/company` tüm row döner + cache → token ayrı private tabloda
- `pg_try_advisory_xact_lock` PostgREST RPC olarak çağrılamaz → DB lease pattern

---

## Faz Haritası

| # | Faz | Öncelik |
|---|-----|---------|
| 1 | Migration + adapter interface + sabitler + mock yeniden yazımı | **MUST** |
| 2 | OAuth token lease + CAS + `/oauth/start` + `/callback` | **MUST** |
| 3 | `parasutApiCall()` wrapper (429 Retry-After + context logging) | **MUST** |
| 4 | Error classification + step-based backoff + stats order-state | **MUST** |
| 5 | Contact upsert (tax_number zorunlu, email ikinci savunma) | **MUST** |
| 6 | Product upsert (SKU = filter[code]; description-only opsiyonel line'larda geçerli ama default ensure) | **MUST** |
| 7 | Claim/lease RPC (commercial+fulfillment guard) + deterministik numara + remote lookup | **MUST** |
| 8 | Shipment document (inflow=false + procurement_number + local recovery) | **MUST** |
| 9 | Sales invoice (shipment_included=false + warehouse YOK invariant + fast remote lookup) | **MUST** |
| 10 | E-belge create + trackable_job poll (3 status) + invoice re-read | **MUST** |
| 11 | Backend preflight + step-granular manual retry + UI badges + observability | **MUST** |
| — | Faz 12: Gerçek API adapter + sandbox gate | (kullanıcı) |

---

## Faz 1 — Migration + Adapter + Mock

### 1.1 Token tablosu (private, lease)
```sql
CREATE TABLE parasut_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  -- Singleton key: expression index değil, gerçek kolon — PostgREST upsert onConflict net çalışır
  singleton_key text not null default 'default' unique check (singleton_key = 'default'),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  refresh_lock_until timestamptz,
  refresh_lock_owner uuid,
  token_version integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
ALTER TABLE parasut_oauth_tokens ENABLE ROW LEVEL SECURITY;
-- Hiçbir policy → sadece service_role. Hiçbir UI route bu tabloyu döndürmeyecek.
```

OAuth callback upsert: `supabase.from('parasut_oauth_tokens').upsert({ singleton_key: 'default', ...tokens, token_version: existingVersion + 1 }, { onConflict: 'singleton_key' })` — gerçek kolon constraint'i ile PostgREST konfliktli çalışır.

### 1.2 Customers + Products + OrderLines (eksik alanlar)
```sql
-- Customers: Paraşüt alanları + irsaliye adres alanları (spec shipment attrs: city/district/address)
ALTER TABLE customers ADD COLUMN parasut_contact_id text;
ALTER TABLE customers ADD COLUMN parasut_synced_at timestamptz;
ALTER TABLE customers ADD COLUMN city text;       -- shipment_document.city için
ALTER TABLE customers ADD COLUMN district text;   -- shipment_document.district için
CREATE UNIQUE INDEX customers_parasut_contact_unique
  ON customers (parasut_contact_id) WHERE parasut_contact_id IS NOT NULL;

-- Products
ALTER TABLE products ADD COLUMN parasut_product_id text;
ALTER TABLE products ADD COLUMN parasut_synced_at timestamptz;
CREATE UNIQUE INDEX products_parasut_product_unique
  ON products (parasut_product_id) WHERE parasut_product_id IS NOT NULL;

-- Order lines: vat_rate (şu an yok; KDV oranı sabit %20 olarak hesaplanıyor)
-- Paraşüt detail.vat_rate zorunlu; satır bazında doğru oran lazım
ALTER TABLE order_lines ADD COLUMN vat_rate numeric(5,2) not null default 20;
```

**Migration notları:**
- `customers.city/district`: Mevcut müşteriler NULL ile migrate olur; Paraşüt sync için zorunlu değil (shipment_document payload'ında opsiyonel) ama varsa gönderilir. Sandbox GATE: boş city/district ile shipment kabul ediliyor mu doğrulanacak (değilse backend preflight'a eklenir).
- `order_lines.vat_rate default 20`: Mevcut siparişler %20 olarak hesaplanıyor → geriye uyum sağlanır. Yeni sipariş oluşturma UI'sı bu değeri product'tan devralabilir (v2 iyileştirme).

### 1.3 Sales orders — step-based + claim + retry + e-doc
```sql
-- Mevcut kolonlar (001:95-97): parasut_invoice_id text, parasut_sent_at timestamptz, parasut_error text
-- → Bu üçü ZATEN VAR, migration'da tekrar ADD COLUMN yapılmaz.

-- Invoice numbering (deterministik)
ALTER TABLE sales_orders ADD COLUMN parasut_invoice_series text;         -- "KE"
ALTER TABLE sales_orders ADD COLUMN parasut_invoice_number_int bigint;   -- 20260042 (bigint — uzun seri)
ALTER TABLE sales_orders ADD COLUMN parasut_invoice_no text;             -- okunmuş "KE2026000042"

-- Shipment
ALTER TABLE sales_orders ADD COLUMN parasut_shipment_document_id text;
ALTER TABLE sales_orders ADD COLUMN parasut_shipment_synced_at timestamptz;
ALTER TABLE sales_orders ADD COLUMN parasut_shipment_error text;
-- Durable "create attempted" marker — crash-before-DB-write duplicate koruması
ALTER TABLE sales_orders ADD COLUMN parasut_shipment_create_attempted_at timestamptz;

-- Sevk tarihi (mevcut tabloda yok; shipped transition anında set edilecek)
ALTER TABLE sales_orders ADD COLUMN shipped_at timestamptz;

-- Invoice step — parasut_error zaten global error olarak kullanılıyor; step-specific:
ALTER TABLE sales_orders ADD COLUMN parasut_invoice_error text;
ALTER TABLE sales_orders ADD COLUMN parasut_invoice_synced_at timestamptz;
ALTER TABLE sales_orders ADD COLUMN parasut_invoice_create_attempted_at timestamptz;

-- E-doc (spec enum: running|done|error). Manuel durumda status='skipped' kullanılır.
ALTER TABLE sales_orders ADD COLUMN parasut_invoice_type text;           -- e_invoice|e_archive|manual (order-level override)
ALTER TABLE sales_orders ADD COLUMN parasut_trackable_job_id text;
ALTER TABLE sales_orders ADD COLUMN parasut_e_document_id text;
ALTER TABLE sales_orders ADD COLUMN parasut_e_document_status text;      -- running|done|error|skipped
ALTER TABLE sales_orders ADD COLUMN parasut_e_document_error text;
ALTER TABLE sales_orders ADD COLUMN parasut_e_document_create_attempted_at timestamptz;

-- Step pointer (hangi adımda olduğu)
ALTER TABLE sales_orders ADD COLUMN parasut_step text;                   -- contact|product|shipment|invoice|edoc|done
-- Step bazlı retry — her adım ayrı failure/retry takibi
-- NOT: parasut_error kolonu zaten mevcut (001:97) — yeniden ADD edilmez.
ALTER TABLE sales_orders ADD COLUMN parasut_error_kind text;             -- auth|validation|rate_limit|server|network|not_found
ALTER TABLE sales_orders ADD COLUMN parasut_retry_count integer not null default 0;
ALTER TABLE sales_orders ADD COLUMN parasut_next_retry_at timestamptz;
ALTER TABLE sales_orders ADD COLUMN parasut_last_failed_step text;       -- hangi adımda fail etti

-- CHECK constraint'ler (kontrollü enum)
ALTER TABLE sales_orders ADD CONSTRAINT chk_parasut_step
  CHECK (parasut_step IS NULL OR parasut_step IN ('contact','product','shipment','invoice','edoc','done'));
ALTER TABLE sales_orders ADD CONSTRAINT chk_parasut_error_kind
  CHECK (parasut_error_kind IS NULL OR parasut_error_kind IN ('auth','validation','rate_limit','server','network','not_found'));
ALTER TABLE sales_orders ADD CONSTRAINT chk_parasut_invoice_type
  CHECK (parasut_invoice_type IS NULL OR parasut_invoice_type IN ('e_invoice','e_archive','manual'));
ALTER TABLE sales_orders ADD CONSTRAINT chk_parasut_e_document_status
  CHECK (parasut_e_document_status IS NULL OR parasut_e_document_status IN ('running','done','error','skipped'));

-- Claim/lease owner'lı
ALTER TABLE sales_orders ADD COLUMN parasut_sync_lock_until timestamptz;
ALTER TABLE sales_orders ADD COLUMN parasut_sync_lock_owner uuid;

-- Partial unique index'ler
CREATE UNIQUE INDEX orders_parasut_invoice_unique
  ON sales_orders (parasut_invoice_id) WHERE parasut_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX orders_parasut_shipment_unique
  ON sales_orders (parasut_shipment_document_id) WHERE parasut_shipment_document_id IS NOT NULL;
CREATE UNIQUE INDEX orders_parasut_edoc_unique
  ON sales_orders (parasut_e_document_id) WHERE parasut_e_document_id IS NOT NULL;
CREATE UNIQUE INDEX orders_parasut_trackable_unique
  ON sales_orders (parasut_trackable_job_id) WHERE parasut_trackable_job_id IS NOT NULL;
CREATE UNIQUE INDEX orders_parasut_series_number_unique
  ON sales_orders (parasut_invoice_series, parasut_invoice_number_int)
  WHERE parasut_invoice_series IS NOT NULL AND parasut_invoice_number_int IS NOT NULL;

-- Retry partial index — CRON query ile birebir uyumlu
CREATE INDEX idx_orders_parasut_retry ON sales_orders (parasut_next_retry_at)
  WHERE parasut_step IS NOT NULL AND parasut_step != 'done'
    AND (parasut_error_kind IS NULL OR parasut_error_kind NOT IN ('validation','auth'));
```

### 1.4 Integration sync log
```sql
ALTER TABLE integration_sync_logs ADD COLUMN error_kind text;
ALTER TABLE integration_sync_logs ADD COLUMN step text; -- contact|product|shipment|invoice|edoc
ALTER TABLE integration_sync_logs ADD COLUMN metadata jsonb;
```

### 1.5 Claim/lease RPC (status guard + owner)
```sql
CREATE OR REPLACE FUNCTION parasut_claim_sync(p_order_id uuid, p_owner uuid, p_lease_secs int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE updated integer;
BEGIN
  UPDATE sales_orders
    SET parasut_sync_lock_until = now() + make_interval(secs => p_lease_secs),
        parasut_sync_lock_owner = p_owner
    WHERE id = p_order_id
      -- Status guard: sadece approved + shipped siparişler
      AND commercial_status = 'approved'
      AND fulfillment_status = 'shipped'
      -- Henüz tamamlanmamış
      AND (parasut_step IS NULL OR parasut_step != 'done')
      -- Kilit boş veya expire
      AND (parasut_sync_lock_until IS NULL OR parasut_sync_lock_until < now());
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END; $$;

CREATE OR REPLACE FUNCTION parasut_release_sync(p_order_id uuid, p_owner uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE sales_orders SET parasut_sync_lock_until = NULL, parasut_sync_lock_owner = NULL
    WHERE id = p_order_id AND parasut_sync_lock_owner = p_owner;
$$;

REVOKE ALL ON FUNCTION parasut_claim_sync(uuid,uuid,int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION parasut_release_sync(uuid,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION parasut_claim_sync(uuid,uuid,int) TO service_role;
GRANT EXECUTE ON FUNCTION parasut_release_sync(uuid,uuid) TO service_role;

-- parasut_rate_limit_acquire için aynı kısıt+grant (eğer DB limiter Faz 3 sonradan eklenirse)
```

**Migration testi (Faz 1 bitişinde):** service_role client ile `supabase.rpc('parasut_claim_sync', ...)` çağrıldığında başarıyla döndüğü; anon veya authenticated client ile çağrılınca `permission denied` alındığı test edilir.

### 1.6 Sabitler (`src/lib/parasut-constants.ts`)
```ts
export const ALERT_ENTITY_PARASUT_AUTH = '00000000-0000-0000-0000-00000000a001' as const;
export const ALERT_ENTITY_PARASUT_E_DOC = '00000000-0000-0000-0000-00000000a002' as const;
export const ALERT_ENTITY_PARASUT_SHIPMENT = '00000000-0000-0000-0000-00000000a003' as const;
export const ALERT_ENTITY_PARASUT_STOCK_INVARIANT = '00000000-0000-0000-0000-00000000a004' as const;
export const PARASUT_INVOICE_SERIES = 'KE';
export type ParasutStep = 'contact'|'product'|'shipment'|'invoice'|'edoc'|'done';
```

### 1.7 Adapter (`src/lib/parasut-adapter.ts`)
```ts
export class ParasutError extends Error {
  constructor(
    public kind: 'auth'|'validation'|'rate_limit'|'server'|'network'|'not_found',
    message: string,
    public retryAfterSec?: number,
  ) { super(message); }
}

export interface OAuthTokens { access_token: string; refresh_token: string; expires_at: string; }

export interface ParasutAdapter {
  // OAuth
  exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  refreshToken(refreshToken: string): Promise<OAuthTokens>;

  // Contact (filter[tax_number])
  findContactsByTaxNumber(taxNumber: string): Promise<ParasutContact[]>;
  findContactsByEmail(email: string): Promise<ParasutContact[]>;
  createContact(input: ContactInput): Promise<ParasutContact>;

  // Product (filter[code] = SKU)
  findProductsByCode(code: string): Promise<ParasutProduct[]>;
  createProduct(input: ProductInput): Promise<ParasutProduct>;

  // Sales invoice — filter[invoice_id] + filter[invoice_series] (hızlı lookup; spec onaylı)
  findSalesInvoicesByNumber(series: string, numberInt: number): Promise<ParasutInvoice[]>;
  createSalesInvoice(input: InvoiceInput): Promise<ParasutInvoice>; // shipment_included=false ZORUNLU
  getSalesInvoiceWithActiveEDocument(id: string): Promise<ParasutInvoiceWithEDocument>;

  // Shipment document — filter'lar zayıf; recovery için listeden local filtre
  listRecentShipmentDocuments(page: number, pageSize: number): Promise<ParasutShipmentDocument[]>;
  createShipmentDocument(input: ShipmentDocInput): Promise<ParasutShipmentDocument>; // inflow=false ZORUNLU

  // E-fatura mükellef kontrolü
  listEInvoiceInboxesByVkn(vkn: string): Promise<ParasutEInvoiceInbox[]>;

  // E-document
  // NOT: Spec'te relationship adları asimetrik — e_invoices.relationships.invoice (3523) vs
  // e_archives.relationships.sales_invoice (3162). Adapter bu farkı içeride gizler; interface uniform.
  createEInvoice(salesInvoiceId: string, input: EInvoiceInput): Promise<{ trackable_job_id: string }>;
  createEArchive(salesInvoiceId: string, input: EArchiveInput): Promise<{ trackable_job_id: string }>;

  // TrackableJob (spec enum 3 değer)
  getTrackableJob(id: string): Promise<{ status: 'running'|'done'|'error'; errors?: string[] }>;
}

export interface InvoiceInput {
  contact_id: string;
  invoice_series: string;
  invoice_id: number;     // deterministik
  issue_date: string;
  due_date: string;
  currency: 'TRL'|'USD'|'EUR'|'GBP'; // spec enum (17068-17074)
  shipment_included: false; // KESIN false — stok invariant
  description: string;     // "KokpitERP #ORD-2026-0042" (audit için)
  details: Array<{
    quantity: number;
    unit_price: number;
    vat_rate: number;
    discount_type?: 'percentage'|'amount';
    discount_value?: number;
    description: string;
    product_id?: string;   // opsiyonel (spec: not required)
    // warehouse: KASITLI OLARAK YOK — stok hareketi yaratmasın
  }>;
}

export interface ShipmentDocInput {
  contact_id: string;
  issue_date: string;
  shipment_date: string;
  inflow: false;           // KESIN false — satış
  procurement_number: string; // order_number — deterministik ref
  description: string;     // "KokpitERP #ORD-XXXX"
  city?: string; district?: string; address?: string;
  details: Array<{
    quantity: number;
    product_id: string;    // shipment'ta stok hareketi için ZORUNLU
    description: string;
    warehouse_id?: string; // varsayılan depo kullanılır
  }>;
}
```

### 1.8 Mock yeniden yaz (`src/lib/parasut.ts`)
`MockParasutAdapter` sınıfı tüm metodları implement eder:
- In-memory map'ler: `contacts`, `products`, `invoices`, `shipments`, `trackableJobs`, `eDocuments`
- `findContactsByTaxNumber(tax)`: önceki create'leri döner (idempotency test)
- `createSalesInvoice` assertion: `input.shipment_included === false`; detail'larda `warehouse` yok
- `createShipmentDocument` assertion: `input.inflow === false`; `procurement_number` dolu
- `getTrackableJob`: ilk 2 çağrı `running`, sonra `done`
- `getSalesInvoiceWithActiveEDocument`: done sonrası dolu döner
- Her metod %90 başarı + 200-600ms gecikme; configurable error injection (test amaçlı)
- Legacy `sendInvoiceToParasut` wrapper → mevcut testler kırılmasın diye `createSalesInvoice`'a delegate eder; production service direkt adapter metodları kullanır

### 1.9 `database.types.ts` manuel
Yeni alanlar `CustomerRow`, `ProductRow`, `SalesOrderRow`, `IntegrationSyncLogRow`'a eklenir. `ParasutStep` TS union tip olarak.

### 1.10 Settings route sızıntı guard testi
`GET /api/settings/company` response'unda `parasut_oauth`/`access_token`/`refresh_token`/`refresh_lock_*` anahtarlarının olmadığı assert.

**Test:** migration, RLS, SECURITY DEFINER execute kısıtı, TS compile, mevcut 1643 test yeşil, mock adapter tüm metodlar + invariant assertions, sızıntı regresyon testi.

---

## Faz 2 — OAuth Token Lease

`src/lib/services/parasut-oauth.ts`:
- `getAccessToken(adapter)` — lease + CAS (önceki plan detaylarıyla)
- Paralel getAccessToken → lease alan refresh eder; diğeri polling (5sn cap)
- `refresh_token` rotate edilir, eski token bir daha kullanılmaz
- CAS çakışması → `sync_issue` alert (`ALERT_ENTITY_PARASUT_AUTH`), kritik log

`src/app/api/parasut/oauth/start/route.ts` (yeni):
- State üret (crypto.randomBytes), signed cookie (`parasut_oauth_state`, httpOnly)
- Paraşüt authorize URL'ine 302 redirect
- Mock: no-op (doğrudan callback'e yönlendir)

`src/app/api/parasut/oauth/callback/route.ts` (yeni):
- State cookie doğrula (CSRF)
- `exchangeAuthCode(code, redirect_uri)` → token DB'ye yaz
- **Singleton upsert:** `.upsert(..., { onConflict: '((true))' })` yerine atomik pattern:
  1. `INSERT ... ON CONFLICT DO UPDATE` — `token_version + 1` ile CAS
  2. Eğer paralel callback gelirse (tekrarlı redirect) `token_version`'ı daha yüksek olan kazanır; kaybeden refresh_token'ı ezmez
- Write öncesi: mevcut `refresh_lock_until > now()` varsa fail (başka refresh akışı aktifse callback yazımını bloklar)

**Test:** state mismatch; paralel getAccessToken; refresh rotate; CAS çakışması; lease timeout.

---

## Faz 3 — `parasutApiCall()` Wrapper

`src/lib/services/parasut-api-call.ts`:
```ts
export interface ApiCallContext {
  op: string;            // 'createSalesInvoice'
  orderId?: string;
  step?: ParasutStep;
  attempt?: number;
}
export async function parasutApiCall<T>(ctx: ApiCallContext, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  let attempt = 1;
  try {
    const result = await fn();
    console.log(JSON.stringify({ parasut_api: ctx.op, attempt, duration_ms: Date.now() - t0, orderId: ctx.orderId, step: ctx.step, status: 'success' }));
    return result;
  } catch (err) {
    if (err instanceof ParasutError && err.kind === 'rate_limit') {
      const wait = Math.min(err.retryAfterSec ?? 5, 30);
      console.log(JSON.stringify({ parasut_api: ctx.op, attempt, rate_limited: true, wait_sec: wait, orderId: ctx.orderId, step: ctx.step }));
      await sleep(wait * 1000);
      attempt = 2;
      try {
        const result = await fn();
        console.log(JSON.stringify({ parasut_api: ctx.op, attempt, duration_ms: Date.now() - t0, orderId: ctx.orderId, step: ctx.step, status: 'success_after_retry' }));
        return result;
      } catch (err2) {
        const e = err2 instanceof ParasutError ? err2 : new ParasutError('server', String(err2));
        console.log(JSON.stringify({ parasut_api: ctx.op, attempt, duration_ms: Date.now() - t0, orderId: ctx.orderId, step: ctx.step, status: 'error_after_retry', error_kind: e.kind, error: e.message }));
        throw err2;
      }
    }
    const e = err instanceof ParasutError ? err : new ParasutError('server', String(err));
    console.log(JSON.stringify({ parasut_api: ctx.op, attempt, duration_ms: Date.now() - t0, orderId: ctx.orderId, step: ctx.step, status: 'error', error_kind: e.kind, error: e.message }));
    throw err;
  }
}
```
DB-based sliding limiter **şimdilik eklenmiyor** — canlıda 429 görülürse eklenir.

**Test:** 429 + Retry-After → success; ikinci 429 → error; normal → pass; context loglanır.

---

## Faz 4 — Error Classification + Step-Based Backoff + Stats

### 4.1 Step-based catch
```ts
function classifyAndPatch(order: SalesOrderRow, step: ParasutStep, pe: ParasutError): Partial<SalesOrderRow> {
  const patch: Partial<SalesOrderRow> = {
    parasut_error: pe.message,
    parasut_error_kind: pe.kind,
    parasut_last_failed_step: step,
    parasut_step: step, // hangi adımda takıldı
  };
  // Step-specific error alanı
  if (step === 'shipment') patch.parasut_shipment_error = pe.message;
  else if (step === 'invoice') patch.parasut_invoice_error = pe.message;
  else if (step === 'edoc') patch.parasut_e_document_error = pe.message;

  if (pe.kind === 'rate_limit') {
    patch.parasut_next_retry_at = new Date(Date.now() + (pe.retryAfterSec ?? 30) * 1000).toISOString();
  } else if (pe.kind === 'auth' || pe.kind === 'validation') {
    patch.parasut_next_retry_at = new Date('2099-01-01T00:00:00Z').toISOString();
  } else {
    patch.parasut_retry_count = order.parasut_retry_count + 1;
    if (patch.parasut_retry_count >= 5) {
      patch.parasut_next_retry_at = new Date('2099-01-01T00:00:00Z').toISOString();
    } else {
      const backoff = Math.min(30 * 60, 30 * 2 ** patch.parasut_retry_count);
      patch.parasut_next_retry_at = new Date(Date.now() + (backoff + Math.random()*5)*1000).toISOString();
    }
  }
  return patch;
}
```

### 4.2 Başarılı adım sonrası temizlik + retry audit
Her başarılı adım sonrası ilgili error alanları temizlenir. `parasut_retry_count` sıfırlanır — **bu operasyonel sayaç**. Toplam deneme geçmişi `integration_sync_logs.step` üzerinden hesaplanır (audit/observability).

```ts
async function markStepDone(orderId: string, step: ParasutStep, nextStep: ParasutStep) {
  await supabase.from('sales_orders').update({
    parasut_step: nextStep,
    parasut_error: null,
    parasut_error_kind: null,
    parasut_next_retry_at: null,
    parasut_retry_count: 0, // operasyonel reset; audit integration_sync_logs'tan
    parasut_last_failed_step: null,
    // step-specific:
    ...(step === 'shipment' ? { parasut_shipment_error: null, parasut_shipment_synced_at: new Date().toISOString() } : {}),
    ...(step === 'invoice' ? { parasut_invoice_error: null, parasut_invoice_synced_at: new Date().toISOString() } : {}),
    ...(step === 'edoc' ? { parasut_e_document_error: null } : {}),
  }).eq('id', orderId);
  // Audit log:
  await dbCreateSyncLog({
    entity_type: 'sales_order', entity_id: orderId,
    direction: 'push', status: 'success', step,
    metadata: { next_step: nextStep },
  });
}
```

Dashboard "toplam deneme sayısı" → `integration_sync_logs` içinde o orderId + step için `status='error'` count. "Son hata" → o step'in en son error kaydı.

### 4.3 CRON filtresi (partial index ile birebir)
**Başlangıç durumu:** `shipped` transition başarılı olduğunda `serviceSyncOrderToParasut` ilk çağrılmadan önce backend `parasut_step='contact'` set eder. Böylece yeni akışta `parasut_step IS NULL` olan sipariş hiç kalmaz.

```ts
// shipped transition preflight sonrası, sync çağrılmadan önce:
await supabase.from('sales_orders').update({ parasut_step: 'contact' })
  .eq('id', orderId).is('parasut_step', null);
```

**Eski shipped order'lar için backfill (migration 039 içinde):**
```sql
-- Paraşüt enabled'a geçilmeden önce shipped olmuş ve henüz sync edilmemiş orderlar:
-- parasut_invoice_id dolu olanlar zaten "done" bitmiştir, onları atla.
-- parasut_invoice_id boş olan shipped orderlar için parasut_step='contact' set edilmez —
-- çünkü bu orderlar Paraşüt bağlı olmadığı dönemde sevk edilmiş (kapsam dışı).
-- Kullanıcı manuel olarak "Bu eski orderları senkronize et" butonundan (UI) tetikleyebilir:
-- butona basılırsa sadece o order için parasut_step='contact' set edilir ve normal akışa girer.

-- Migration otomatik backfill YOK. Bilinçli karar — sessiz retroaktif sync riskli.
```

UI (`/dashboard/parasut`): "Eski senkronize edilmemiş siparişler (N)" kartı + "Seç ve senkronize et" akışı (v2 iyileştirme; Faz 11'de iskelet).

CRON query:
```ts
.not('parasut_step', 'is', null)  // 'contact'|'product'|...|'done'
.neq('parasut_step', 'done')
.or('parasut_error_kind.is.null,parasut_error_kind.not.in.(validation,auth)')
.or(`parasut_next_retry_at.is.null,parasut_next_retry_at.lte.${nowISO}`)
.limit(50)
```

Partial index `WHERE parasut_step IS NOT NULL AND parasut_step != 'done'` — query ile birebir uyumlu.

### 4.4 Auth alert
Son 1 saat `error_kind='auth'` ≥3 → `sync_issue` alert sabit UUID ile dedup.

### 4.5 Stats order-state
`failed_syncs` → `sales_orders` where `parasut_error_kind IS NOT NULL AND parasut_error_kind NOT IN ('validation','auth') AND parasut_retry_count < 5`
`pending_syncs` → `sales_orders` where `parasut_step IS NOT NULL AND parasut_step != 'done'` (invoice yazılmış ama e-doc bekliyor olan siparişler de dahil; "pending" = "tamamlanmamış")
`in_progress_syncs` → `parasut_step IN ('contact','product','shipment','invoice','edoc')` (alt metrik)
`blocked_syncs` → `parasut_error_kind IN ('validation','auth')` (manuel müdahale gerekli)
Log sadece audit amaçlı.

---

## Faz 5 — Contact Upsert (tax_number Zorunlu)

**Politika:** Paraşüt sync için `customer.tax_number` zorunlu. Boşsa `ParasutError('validation')`. B2C/e-arşiv fallback v2.

**`serviceEnsureParasutContact(customerId)`:**
1. `customer.parasut_contact_id` dolu → adapter hiç çağrılmaz, dön
2. `customer.tax_number` boş → validation error
3. `findContactsByTaxNumber(tax)`:
   - 1 eşleşme → DB'ye yaz, dön
   - >1 eşleşme → validation error ("aynı tax_number ile birden fazla kontakt")
   - 0 eşleşme → **email fallback** (tax_number uyumlu ise):
     - `customer.email` boş → `createContact`
     - `findContactsByEmail(email)`:
       - 1 eşleşme + o kontağın `tax_number == customer.tax_number` VEYA boş → DB'ye yaz, Paraşüt'te tax_number güncellemesi için `updateContact` çağır
       - 1 eşleşme + farklı tax_number → validation error ("email eşleşti ama tax_number farklı — veri bozulma riski, manuel müdahale")
       - 0 eşleşme → `createContact`
       - >1 eşleşme → validation error
4. Paralel race → `customers_parasut_contact_unique` index bloklar

**Gerekçe:** Email aynı ama tax_number farklı ise iki ayrı cari demektir (farklı firmanın genel info@... adresi). Tax_number doğrulanmadan kullanmak kritik veri bozulma.

---

## Faz 6 — Product Upsert (filter[code])

**`serviceEnsureParasutProduct(productId)`:**
1. `product.parasut_product_id` dolu → dön
2. `findProductsByCode(product.sku)`:
   - 0 → `createProduct`
   - 1 → DB yaz
   - >1 → validation error

**Zorunlu:** Shipment akışı `shipment_document` detail'larında `stock_movements.product.id` (yani Paraşüt product UUID) gerektiriyor. Bu yüzden product upsert bu akışta **DEFAULT olarak zorunlu**; description-only fallback shipment öncesi akışta **yok**. Sadece invoice-only senaryolarda (v2/manual exception) description-only geçerli olabilir — bu plan kapsamında değil. Product upsert fail ederse tüm sync step='product' hatası ile durur.

---

## Faz 7 — Claim + Deterministik Numara + Remote Lookup

### 7.1 Claim (tüm orkestra tek lease)
`serviceSyncOrderToParasut(orderId)`:
```ts
const owner = crypto.randomUUID();
const { data: claimed } = await supabase.rpc('parasut_claim_sync', { p_order_id: orderId, p_owner: owner, p_lease_secs: 300 });
if (!claimed) return { skipped: true, reason: 'not_eligible_or_locked' };
try {
  await ensureContact();       // step='contact'
  await markStepDone(orderId, 'contact', 'product');
  await ensureAllProducts();   // step='product' — shipment stock_movements.product zorunlu; başarısızsa tüm sync durur
  await markStepDone(orderId, 'product', 'shipment');
  await upsertShipment();      // step='shipment'
  await markStepDone(orderId, 'shipment', 'invoice');
  await upsertInvoice();       // step='invoice'
  await markStepDone(orderId, 'invoice', 'edoc');
  const eDocResult = await upsertEDocument();  // step='edoc'
  // e_document_status: 'done' → orkestra bitti, 'skipped' → manual, 'running' → poll CRON bitirir
  if (eDocResult.status === 'done' || eDocResult.status === 'skipped') {
    await markStepDone(orderId, 'edoc', 'done');
  }
  // 'running' durumunda parasut_step='edoc' kalır; lease finally'de bırakılır;
  // Poll CRON trackable_job done olunca markStepDone çağırır.
} catch (err) {
  // classifyAndPatch + release (finally)
} finally {
  await supabase.rpc('parasut_release_sync', { p_order_id: orderId, p_owner: owner });
}
```

### 7.2 Deterministik invoice numarası
```ts
function parasutInvoiceNumberInt(orderNumber: string): number {
  const m = orderNumber.match(/^ORD-(\d{4})-(\d+)$/);
  if (!m) throw new ParasutError('validation', `order_number formatı Paraşüt için uygun değil: ${orderNumber}`);
  return parseInt(m[1] + m[2].padStart(4, '0'), 10);
}
```
`Date.now()` fallback yok.

---

## Faz 8 — Shipment Document ✅ (2026-04-26 — 26 test)

```ts
if (order.parasut_shipment_document_id) return; // idempotent

// Durable "create attempted" marker — crash-before-DB-write koruması
// Mantık: Eğer önceki attempted_at varsa ve ID yoksa → Paraşüt'te belge oluşmuş olabilir; recovery lookup zorunlu, bulamazsa manual review
const hasAttemptedBefore = !!order.parasut_shipment_create_attempted_at;

// Remote recovery (procurement_number filter YOK — pagination + local filter)
// Limit config: env PARASUT_SHIPMENT_RECOVERY_MAX_PAGES (default 5, max 20) — yoğun trafikli kurulumlarda artırılabilir
const maxPages = Math.min(20, parseInt(process.env.PARASUT_SHIPMENT_RECOVERY_MAX_PAGES ?? '5'));
let found: ParasutShipmentDocument | null = null;
for (let p = 1; p <= maxPages; p++) {
  const list = await adapter.listRecentShipmentDocuments(p, 25);
  if (list.length === 0) break;
  const hit = list.find(s => s.attributes.procurement_number === order.order_number);
  if (hit) { found = hit; break; }
  if (list.length < 25) break;
}
if (found) {
  await dbWriteShipmentMeta(orderId, found);
  return;
}
// Recovery başarısız — duplicate riski değerlendirmesi:
// - hasAttemptedBefore=true + bulunamadı → önceki create çağrısı başarılı olup DB yazılamadı olabilir;
//   pagination recovery yetersiz kalmış → MANUAL REVIEW (otomatik ikinci create atma)
// - hasAttemptedBefore=false + bulunamadı → güvenli yeni create path
if (hasAttemptedBefore) {
  await raiseAlert(ALERT_ENTITY_PARASUT_SHIPMENT, `Shipment create attempted ${order.parasut_shipment_create_attempted_at} ama DB ID yok + local recovery negatif → duplicate riski, manuel inceleme gerekli`);
  throw new ParasutError('validation', 'Shipment manual review gerekli — duplicate riski (önceki attempt marker + recovery negatif)');
}

// Attempted marker YAZ (create çağrısından HEMEN ÖNCE — crash olsa bile bir sonraki denemede bu dal çalışır)
await supabase.from('sales_orders').update({
  parasut_shipment_create_attempted_at: new Date().toISOString(),
}).eq('id', orderId);

// Tarih stratejisi:
// issue_date = bugün (shipment kesme tarihi); shipment_date = order.shipped_at (fiili sevk); yoksa order.created_at
const shippedAt = order.shipped_at ?? order.created_at;

// Create
const ship = await parasutApiCall({ op: 'createShipmentDocument', orderId, step: 'shipment' }, () =>
  adapter.createShipmentDocument({
    contact_id: customer.parasut_contact_id,
    issue_date: new Date().toISOString().slice(0, 10),
    shipment_date: shippedAt,
    inflow: false,  // satış
    procurement_number: order.order_number, // deterministik ref (DB-local unique — partial unique index var; Paraşüt-taraflı uniqueness sandbox'ta doğrulanacak, yoksa recovery lookup tek savunma)
    description: `KokpitERP #${order.order_number}`,
    city: customer.city,
    district: customer.district,
    address: customer.address,
    details: order.lines.map(l => ({
      quantity: l.quantity,
      product_id: l.product.parasut_product_id,
      description: `${l.product_name} (${l.product_sku})`,
    })),
  })
);
await dbWriteShipmentMeta(orderId, ship);
```

Paralel koruması: `orders_parasut_shipment_unique` index.

**Test:** idempotent skip; recovery (mock'ta 2. sayfada match); create + procurement_number doğrulama; `inflow: false` payload assertion.

---

## Faz 9 — Sales Invoice (Stok Invariant)

```ts
if (order.parasut_invoice_id) return; // idempotent

const series = PARASUT_INVOICE_SERIES;
const numberInt = parasutInvoiceNumberInt(order.order_number);

// Durable attempted marker kontrolü
const hasInvoiceAttemptedBefore = !!order.parasut_invoice_create_attempted_at;

// Fast remote lookup (spec onaylı filter[invoice_id]+filter[invoice_series])
const existing = await adapter.findSalesInvoicesByNumber(series, numberInt);
if (existing.length > 0) {
  await dbWriteInvoiceMeta(orderId, existing[0]);
  return;
}

// Marker var ama remote'ta bulunmuyor → fast lookup güvenilir (series+number deterministik unique), yine de manual review
if (hasInvoiceAttemptedBefore) {
  await raiseAlert(ALERT_ENTITY_PARASUT_SHIPMENT, `Invoice create attempted ${order.parasut_invoice_create_attempted_at} ama remote'ta bulunamadı → beklenmedik durum, manuel kontrol`);
  throw new ParasutError('validation', 'Invoice manual review — attempted marker + lookup negatif');
}

// Attempted marker yaz
await supabase.from('sales_orders').update({
  parasut_invoice_create_attempted_at: new Date().toISOString(),
}).eq('id', orderId);

// Tarih stratejisi (shipment-centric):
// issue_date = bugün (fatura kesme tarihi); due_date = issue_date + payment_terms
const issueDate = new Date().toISOString().slice(0, 10);
const dueDate = computeDueDate(issueDate, customer.payment_terms_days ?? 30);

// Create — STOK INVARIANT
const invoice = await parasutApiCall({ op: 'createSalesInvoice', orderId, step: 'invoice' }, () =>
  adapter.createSalesInvoice({
    contact_id: customer.parasut_contact_id,
    invoice_series: series,
    invoice_id: numberInt,
    issue_date: issueDate,
    due_date: dueDate,
    currency: mapCurrency(order.currency), // spec enum: TRL|USD|EUR|GBP
    shipment_included: false, // KESIN false — shipment ayrı belgede
    description: `KokpitERP #${order.order_number}`,
    details: order.lines.map(l => ({
      quantity: l.quantity,
      unit_price: l.unit_price,
      vat_rate: l.vat_rate ?? 20, // Sipariş satırından gelen oran; yoksa %20 varsayılan (domain kuralı)
      discount_type: 'percentage',
      discount_value: l.discount_pct,
      description: `${l.product_name} (${l.product_sku})`,
      product_id: l.product.parasut_product_id, // opsiyonel; kataloğa bağlar
      // warehouse: KASITLI OLARAK YOK — stok invariant
    })),
  })
);
await dbWriteInvoiceMeta(orderId, invoice);
// dbWriteInvoiceMeta yazımı:
//   parasut_invoice_id = invoice.id (yeni)
//   parasut_invoice_no = invoice.attributes.invoice_no
//   parasut_invoice_series = series
//   parasut_invoice_number_int = numberInt
//   parasut_invoice_synced_at = now
//   parasut_sent_at = now  ← LEGACY alan; api-mappers.ts:149 hâlâ okuyor, UI ve mapOrderDetail dönüşümü bu alanı kullanıyor
//     → bu Faz'da her iki alan da yazılır; UI tamamen parasut_invoice_synced_at'e taşındığında v2'de legacy kaldırılır
```

**vat_rate domain kuralı:** Faz 1.2'de `order_lines.vat_rate numeric(5,2) not null default 20` kolonu eklendi; mevcut siparişlerde %20 olarak migrate olur, TS `OrderLineRow.vat_rate` alanı güncellenir. Yeni sipariş satırı oluşturulurken UI bu değeri product'tan/domain default'undan devralır. Paraşüt detail'ında `vat_rate: l.vat_rate` olarak gönderilir.

**currency:** `mapCurrency(c)`: TRY/TRL → 'TRL', USD → 'USD', EUR → 'EUR', GBP → 'GBP', diğer → 'TRL' (fallback, audit log'a warning).

### Sandbox GATE (Faz 12 prerequisite)
Stok invariant **sandbox'ta açık testle doğrulanacak**:
1. Ürün X Paraşüt'te stok = 100
2. ERP'den order yarat (10 adet X)
3. Sync tetikle → shipment_document + sales_invoice oluşsun
4. Paraşüt'te ürün X stok = 90 olmalı (**10 düşüş, 20 değil**)
5. Eğer 20 düşerse: detail'da warehouse gönderilmiyor ama Paraşüt yine de düşürüyorsa, alternatif payload kombinasyonları denenecek. Bu test geçmeden canlıya geçilmez.

---

## Faz 10 — E-Belge

```ts
// Crash recovery 1: Paraşüt tarafında active_e_document zaten var mı?
if (!order.parasut_e_document_id) {
  const fresh = await adapter.getSalesInvoiceWithActiveEDocument(order.parasut_invoice_id);
  if (fresh.active_e_document) {
    await dbWriteEDocMeta(orderId, fresh.active_e_document);
    return;
  }
}

// Crash recovery 2: Job başlatılmış ama done değil?
if (order.parasut_trackable_job_id && order.parasut_e_document_status !== 'done') {
  const job = await adapter.getTrackableJob(order.parasut_trackable_job_id);
  if (job.status === 'done') {
    const f = await adapter.getSalesInvoiceWithActiveEDocument(order.parasut_invoice_id);
    await dbWriteEDocMeta(orderId, f.active_e_document);
    return;
  }
  if (job.status === 'running') {
    await dbUpdate(orderId, { parasut_e_document_status: 'running' });
    return; // Poll CRON bitirir
  }
  // error
  await raiseEDocAlert(orderId, job.errors);
  await dbUpdate(orderId, { parasut_e_document_status: 'error', parasut_e_document_error: (job.errors ?? []).join('; ') });
  return;
}

// Yeni job
const type = order.parasut_invoice_type
  ?? (customer.tax_number ? ((await adapter.listEInvoiceInboxesByVkn(customer.tax_number)).length > 0 ? 'e_invoice' : 'e_archive') : 'e_archive');

if (type === 'manual') {
  // "skipped" semantiği: e-belge hiç oluşturulmadı (done ile karıştırma)
  await dbUpdate(orderId, { parasut_invoice_type: 'manual', parasut_e_document_status: 'skipped' });
  await markStepDone(orderId, 'edoc', 'done'); // orkestra tamamlandı
  return;
}

// Durable attempted marker — trackable_job_id DB'ye yazılmadan önce crash olsa bile
// bir sonraki denemede active_e_document yoksa ve marker varsa: otomatik yeni job AÇMA → manual review
const hasEDocAttemptedBefore = !!order.parasut_e_document_create_attempted_at;
if (hasEDocAttemptedBefore && !order.parasut_trackable_job_id) {
  // Önceki create çağrısı başarılı dönmüş ama trackable_job_id yazılamadı olabilir.
  // Paraşüt'te zaten job başlamış olabilir → ikinci job duplicate e-belge yaratır.
  // invoice re-read yukarıda yapıldı (active_e_document boş); yine de güvenli tarafa çek:
  await raiseAlert(ALERT_ENTITY_PARASUT_E_DOC, `E-doc create attempted ${order.parasut_e_document_create_attempted_at} ama trackable_job_id yok + active_e_document yok → duplicate riski, manuel inceleme`);
  throw new ParasutError('validation', 'E-doc manual review — attempted marker + tracking bilgisi eksik');
}

// Marker yaz (create çağrısından hemen önce)
await supabase.from('sales_orders').update({
  parasut_e_document_create_attempted_at: new Date().toISOString(),
  parasut_invoice_type: type,
}).eq('id', orderId);

const job = type === 'e_invoice'
  ? await adapter.createEInvoice(order.parasut_invoice_id, eInvoiceInput)
  : await adapter.createEArchive(order.parasut_invoice_id, eArchiveInput);
await dbUpdate(orderId, {
  parasut_trackable_job_id: job.trackable_job_id,
  parasut_e_document_status: 'running',
});
```

### Poll CRON `/api/parasut/poll-e-documents`
Poll ile sync-all aynı e-doc satırını paralel işleyebilir (`parasut_claim_sync` zaten aktif olmayabilir — poll CRON'u ayrı tetiklenir). Bu nedenle idempotent yazım:

- `parasut_e_document_status = 'running'` AND `parasut_step = 'edoc'` rows için `getTrackableJob`
- **Idempotent update:** her DB update'i `.eq('parasut_trackable_job_id', jobId).neq('parasut_e_document_status', 'done')` guard'ı ile — aynı job iki kez done yazılamaz
- `done` → `getSalesInvoiceWithActiveEDocument` → update yaparken:
  - `parasut_e_document_id` yaz + `markStepDone(orderId, 'edoc', 'done')`
  - Alert atma: `raiseAlert` çağrısından önce `dbListActiveAlerts(type, entity_id)` dedup kontrol (zaten alert sisteminde var)
- `running` → sadece `raw_status` farklıysa metadata'ya not et (gereksiz update'ler önlenir)
- `error` → status='error' + dedup alert; yeni job otomatik açılmaz (manuel retry UI step='edoc')
- TrackableJob `pending` → `running` map; `metadata.raw_status='pending'` log'a yaz

`middleware.ts` CRON_PATHS'a ekle.

**CRON sorgu kapsamı:** `parasut_step='edoc'` + `parasut_invoice_id` dolu satırlar için invoice-odaklı CRON sorguları (Faz 4) bu satırları yanlış değerlendirmemeli — query `parasut_step != 'done'` ile zaten doğru filtreliyor.

**Test:** mükellef (`e_invoice`), değil (`e_archive`), manual skip, crash recovery 1 (active_e_document), crash recovery 2 (job running → done), poll branşları.

---

## Faz 11 — Preflight + Manual Retry + UI

### 11.1 Backend preflight
`serviceTransitionOrder` (order-service.ts) — `transition === 'shipped'`:
- Customer/products ayrıca okunur (denormalize değil, güncel veri için):
  ```ts
  const customer = await dbGetCustomerById(order.customer_id);
  const productsBySku = await dbGetProductsByIds(order.lines.map(l => l.product_id));
  ```
- Koşullar:
  - `order.customer_id` NULL → "Sipariş müşterisiz sevk edilemez"
  - Paraşüt enabled + `customer.tax_number` NULL → "Paraşüt için tax_number zorunlu"
  - Paraşüt enabled + herhangi bir line.product.sku boş → "SKU eksik"
  - Paraşüt enabled + `order_number` regex fail → "order_number format hatası"
- Transition başarılıysa → `sales_orders.shipped_at = now()` yazılır (migration Faz 1.2'de bu kolon eklendi; shipment_date için kaynak).
- Transition başarılıysa + Paraşüt enabled → `parasut_step='contact'` set edilir (başlangıç durumu belirsizliğini önler — Faz 4.3).
- Transition fail olursa sync başlamaz.

### 11.2 Manual retry — step state machine
`POST /api/parasut/retry` body: `{ orderId, step?: 'contact'|'product'|'shipment'|'invoice'|'edoc'|'all' }`

`ParasutStep` union'da `'done'` değeri var; retry map'i bunu içermemeli. TS'te `Exclude`:
```ts
type RetryableParasutStep = Exclude<ParasutStep, 'done'>; // contact|product|shipment|invoice|edoc

const deps: Record<RetryableParasutStep, (o: OrderDetailForParasut) => boolean> = {
  contact:  () => true,
  product:  (o) => !!o.customer.parasut_contact_id,
  shipment: (o) => allProductsSynced(o),
  invoice:  (o) => !!o.parasut_shipment_document_id,
  edoc:     (o) => !!o.parasut_invoice_id,
};
if (step !== 'all' && !deps[step as RetryableParasutStep](order)) {
  return { error: `${step} için önceki adım tamamlanmalı` };
}
```

### 11.3 UI step badges (sipariş detay)
5 badge: Contact · Product · Shipment · Invoice · E-Doc

**Veri kaynağı:** Mevcut `dbGetOrderById` sadece `sales_orders + order_lines` döndürüyor (orders.ts:78) — customer ve products join etmiyor. UI için ya:
- (a) Yeni `dbGetOrderDetailForParasut(orderId)` oluştur — `customer` + `order_lines` + `products` join; ya da
- (b) Mevcut endpoint'i genişlet — `customer:customers(*), order_lines(*, product:products(*))`

Seçim: (b) — `api-mappers.ts` mapOrderDetail'i genişletip camelCase alanları eklemek en az invaziv.

Badge hesaplaması:
- **Contact done:** `order.customer.parasut_contact_id != null`
- **Product done:** `order.lines.every(l => l.product.parasut_product_id != null)`
- **Shipment done:** `order.parasut_shipment_document_id != null`
- **Invoice done:** `order.parasut_invoice_id != null`
- **E-Doc:**
  - `done` → `parasut_e_document_status === 'done'` (yeşil "E-Fatura/E-Arşiv ✓")
  - `skipped` → `status === 'skipped'` (gri "Manuel — e-belge atlandı")
  - `running` → `status === 'running'` (mavi "İşleniyor…")
  - `error` → `status === 'error'` (kırmızı + error mesajı)
- Renk: gray (not_started) / blue (in_progress = parasut_step match) / green (done) / red (error)
- Tooltip: hata mesajı + `next_retry_at` + son 24h deneme sayısı (integration_sync_logs audit)
- Her badge için "Yeniden Dene" butonu (step-granular, dep-guard'lı)

### 11.4 Dashboard
- Token durumu (`expires_at` - now)
- Step dağılımı: hangi adımda kaç sipariş takılı
- Error_kind dağılımı
- Sync log → step + error_kind kolonları + filtreler

### 11.5 Settings
"Paraşüt'e bağlan" butonu → `/api/parasut/oauth/start`
Token süre göstergesi + manual refresh butonu

### 11.6 Alert entegrasyonu
`sync_issue` tipi altında 4 sabit entity_id:
- `ALERT_ENTITY_PARASUT_AUTH` — 3 auth hata
- `ALERT_ENTITY_PARASUT_E_DOC` — trackable_job error
- `ALERT_ENTITY_PARASUT_SHIPMENT` — shipment step fail
- `ALERT_ENTITY_PARASUT_STOCK_INVARIANT` — staging invariant gate fail

**Test:** preflight blocks ship; badge her kombinasyonda doğru renk; manual retry dep guard çalışır; başarılı sonrası error alanları temiz.

---

## Kritik Dosyalar
| Dosya | Faz |
|-------|-----|
| `supabase/migrations/039_parasut_integration_prep.sql` | 1 |
| `src/lib/parasut-adapter.ts` (yeni) | 1 |
| `src/lib/parasut-constants.ts` (yeni) | 1 |
| `src/lib/parasut.ts` | 1 (mock rewrite) |
| `src/lib/database.types.ts` | 1 (manuel) |
| `src/lib/services/parasut-oauth.ts` (yeni) | 2 |
| `src/app/api/parasut/oauth/start/route.ts` (yeni) | 2 |
| `src/app/api/parasut/oauth/callback/route.ts` (yeni) | 2 |
| `src/lib/services/parasut-api-call.ts` (yeni) | 3 |
| `src/lib/services/parasut-service.ts` | 4-10 (orkestrasyon) |
| `src/app/api/parasut/poll-e-documents/route.ts` (yeni) | 10 |
| `src/app/api/parasut/retry/route.ts` | 11 (step+deps) |
| `src/app/api/parasut/stats/route.ts` | 4 (order-state) |
| `middleware.ts` | 10 (CRON poll) |
| `src/lib/services/order-service.ts` | 11 (preflight) |
| `src/app/dashboard/parasut/page.tsx` | 11 |
| `src/app/dashboard/orders/[id]/page.tsx` | 11 (5 badge, step retry) |
| `src/app/dashboard/settings/page.tsx` | 2,11 |
| `domain-rules.md` §10 | 4,5,7,9 (stok invariant, politika) |

## Doğrulama (her faz sonu)
1. `npx tsc --noEmit` temiz
2. `npx vitest run` tam suite yeşil (her faz +10-20 test; hedef ~1750)
3. `npm run build` temiz
4. Migration staging'de uygulandı
5. Memory + CLAUDE.md güncel
6. Sızıntı regresyon testi yeşil

## Faz 12 Sandbox GATE (gerçek API'den önce)
- [ ] OAuth `authorization_code` + rotate refresh doğru
- [ ] `listContacts?filter[tax_number]`
- [ ] `listEInvoiceInboxes?filter[vkn]`
- [ ] `listProducts?filter[code]`
- [ ] `listSalesInvoices?filter[invoice_id]+filter[invoice_series]` fast path
- [ ] `listShipmentDocuments` pagination + local procurement_number match
- [ ] `getSalesInvoiceWithActiveEDocument` e_document_id döner
- [ ] TrackableJob `running|done|error` — `pending` gelirse tolere, raw metadata'ya yazılır
- [ ] **STOK INVARIANT (critical):**
  - Ürün X stok = 100 → shipment_document (inflow=false, 10 adet) → stok = 90 olmalı
  - Aynı order → sales_invoice (shipment_included=false, warehouse yok, 10 adet) → stok = 90 kalmalı (değişmemeli)
  - Eğer 80 olursa: invariant ihlali → alternatif payload (product da göndermeyerek) dene; her kombinasyon başarısızsa plan revize
- [ ] **Procurement_number uniqueness:** aynı procurement_number ile ikinci shipment_document POST → Paraşüt reddeder mi (ideal) yoksa duplicate oluşturur mu? Duplicate oluşturuyorsa local recovery tek savunma → limit config zorunlu
- [ ] **Shipment city/district zorunluluğu:** customers.city/district boş olan müşteride shipment_document create 400/422 verir mi? Ret olursa backend preflight'a "adres zorunlu" eklenir; kabul olursa veri opsiyonel kalabilir
- [ ] 429 Retry-After doğru
- [ ] refresh_token rotate gerçekten her refresh'te yeni değer döner

## Advisor bulgularının kapatma haritası
| Bulgu | Faz |
|-------|-----|
| Paraşüt otomatik değil, orkestra ERP'de | Faz 7 (step-based) |
| shipment_document ↔ sales_invoice relationship YOK | Faz 9 (bağlama yok; procurement_number + description matching) |
| `manage_inventory` spec'te yok → `shipment_included` | Faz 1.7 + Faz 9 (`shipment_included=false`) |
| Detail `warehouse` opsiyonel; stok invariant | Faz 1.7 + Faz 9 (warehouse GÖNDERİLMEZ) |
| `inflow: false` açık | Faz 1.7 + Faz 8 |
| ShipmentDocument filter zayıf | Faz 8 (pagination recovery) |
| Step-based retry | Faz 1.3 + Faz 4 |
| E-doc status enum tutarsız | Faz 1.3 (running|done|error) + Faz 10 (pending→running map) |
| Contact/Product badge derived | Faz 11.3 (relationship'ten) |
| Product zorunlu vs stok invariant çelişmez | Faz 6 + Faz 9 (warehouse yok = stok yok; product opsiyonel) |
| Claim RPC status guard | Faz 1.5 |
| Preflight güncel customer/product | Faz 11.1 |
| E-fatura tip tax_number çelişki | Faz 10 (defensive kalır; Faz 5 validation yakalar) |
| Manual retry dep guard | Faz 11.2 |
| Başarı sonrası error temizle | Faz 4.2 |
| OAuth start route | Faz 2 |
| parasutApiCall context | Faz 3 (op+orderId+step) |
| series_number unique index IS NOT NULL | Faz 1.3 |
| invoice_number_int bigint | Faz 1.3 |
| Products filter[code] | Faz 1.7 + Faz 6 |
| TrackableJob 3 değer enum | Faz 1.7 + Faz 10 |
| Mock yeni metodlar | Faz 1.8 (legacy delegate, prod direkt) |
| Stok invariant sandbox gate | Faz 9 (açık test) + Faz 12 |
| `parasut_error` mevcut kolon (001:97) | Faz 1.3 (tekrar ADD edilmez; mevcut kullanılır) |
| Step NULL başlangıç / CRON uyumu | Faz 4.3 + Faz 11.1 (preflight'ta 'contact' set) |
| pending_syncs invoice değil step odaklı | Faz 4.5 (parasut_step != 'done') |
| E-doc manual semantiği | Faz 10 (`status='skipped'` + markStepDone) |
| tax_number / e-archive çelişki | Faz 5 (validation) + Faz 10 (defensive fallback + explicit test) |
| Shipment recovery limit config + manual review | Faz 8 (env + retry_count guard) |
| procurement_number uniqueness Paraşüt'te | Sandbox GATE |
| Lease e-doc running'de erken release | Faz 7 (finally içinde; markStepDone sonra CRON'da) |
| Retry history audit | Faz 4.2 (integration_sync_logs.step count) |
| parasutApiCall attempt log | Faz 3 (structured log) |
| OAuth callback singleton race | Faz 2 (CAS + refresh_lock guard) |
| SECURITY DEFINER GRANT test | Faz 1.5 (migration testinde service_role çağrısı) |
| Order detail UI customer/product | Faz 11.3 (mapOrderDetail genişletme) |
| parasut_step/error_kind/invoice_type/e_doc_status CHECK | Faz 1.3 (CHECK constraints) |
| Trackable error sonrası yeni job stratejisi | Faz 10 (manuel retry UI'dan) |
| vat_rate hardcode → domain kuralı | Faz 9 (order_lines.vat_rate ?? 20) |
| currency GBP desteği | Faz 1.7 + Faz 9 (mapCurrency 4 değer) |
| issue_date shipped_at kullan | Faz 8 + Faz 9 (shipment_date=shipped_at; issue_date=today) |
| TrackableJob pending raw metadata | Faz 10 |
| Shipment create-before-DB-write duplicate | Faz 1.3 + Faz 8 (`parasut_shipment_create_attempted_at` marker) |
| E-doc create-before-DB-write duplicate | Faz 1.3 + Faz 10 (`parasut_e_document_create_attempted_at` marker) |
| OAuth singleton expression index PostgREST uyumsuz | Faz 1.1 (`singleton_key text default 'default' unique check`) |
| order.shipped_at mevcut değil | Faz 1.3 (migration eklendi) + Faz 11.1 (shipped transition'da yazılır) |
| customer.city/district mevcut değil | Faz 1.2 (customers'a eklendi) + sandbox GATE (zorunluluk) |
| Retry deps map 'done' hatası | Faz 11.2 (`Exclude<ParasutStep, 'done'>`) |
| InvoiceInput currency GBP eksik | Faz 1.7 (`TRL\|USD\|EUR\|GBP`) |
| Email fallback tax_number guard | Faz 5 (tax_number uyum kontrolü) |
| SECURITY DEFINER GRANT açık | Faz 1.5 (`GRANT EXECUTE ... TO service_role`) |
| Legacy parasut_sent_at write | Faz 9 (`dbWriteInvoiceMeta` iki alan birden) |
| order_lines.vat_rate yok | Faz 1.2 (migration) + Faz 9 (TS union güncel) |
| Poll CRON idempotent + dedup alert | Faz 10 (guard'lı update + alert dedup) |
| e-invoice vs e-archive farklı relationship adı | Faz 1.7 (adapter interface uniform, içeride asimetri gizli) |
| parasutApiCall fail log | Faz 3 (success/error/error_after_retry tüm path log'lu) |
| Eski shipped order backfill | Faz 4.3 (otomatik yok; UI tetiklemeli) |

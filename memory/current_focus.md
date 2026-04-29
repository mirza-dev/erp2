---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---
**Aktif:** Sprint B — AI İçeri Aktar stabilizasyonu (`docs/plans/02-ai-import-implementation.md`)
**Önceki:** Sprint A — Üretim & Stok Uyarıları stabilizasyonu KAPALI (2026-04-29; 1987 test)

---

## Sprint A Özet (2026-04-29) — KAPALI

**Hedef:** /dashboard/alerts sayfasının görünür "amacına uygun çalışmıyor" sorununu çözmek; mevcut tasarımı bozmadan sadece eksik işlevsellik + bug + lifecycle.

**4 commit:**
- Part 1 (`d842be3`): Türkçe etiketler (4 yeni tip) + 24h dismiss toast + dead code (import_review_required)
- Part 2 (`0ffc8c9`): Silinmiş ürün uyarılarının auto-cleanup'ı — scan başında orphan resolution
- Part 3 (`7d0471c`): AI servisi kullanılamıyor sarı banner (kırmızı toast yerine)
- Part 4a (`a384aa1`): AI önerilerinde "Genel durum" + %X confidence + model adı
- Part 4b (`1764545`): quote_expired drawer'da inline "Süreyi Uzat" formu (PATCH /api/orders/[id])
- Part 4c (this): 24h dismiss dedup + severity escalation bypass + migration 042

**Migration:** `042_alerts_dismissed_severity.sql` — `dismissed_severity` kolonu + index.

**Domain kuralı:** Manuel yoksay → 24 saat aynı tip+entity+severity için yeni alert oluşturma. Severity yükseldiyse bypass et. purchase_recommended muaf.

**Test:** 106 dosya · 1987 test yeşil · TS clean.

---

## Son Tamamlanan İş — Paraşüt Faz 10 (2026-04-26)

### Faz 10 özet
`upsertEDocument` stub'ı tam implementasyona dönüştürüldü + bağımsız Poll CRON eklendi:

**`upsertEDocument`:**
- **Idempotent:** `parasut_e_document_id` dolu → done; `parasut_e_document_status='skipped'` → skipped (erken dön)
- **Recovery 1:** `getSalesInvoiceWithActiveEDocument` — active_e_document varsa `dbWriteEDocMeta`
- **Recovery 2:** `getTrackableJob` — done (invoice re-read + meta), running, error 3 dal; idempotent guard ile (`.eq("parasut_trackable_job_id", jobId).neq("parasut_e_document_status", "done")`)
- **Tip seçimi:** `order.parasut_invoice_type` override > VKN inbox lookup (10 hane normalize, `replace(/\D/g,'')`) > e_archive
- **Manual:** status=skipped, create yapılmaz
- **hasEDocAttemptedBefore + trackable_job_id null:** alert best-effort + validation error
- **Marker + create + job_id yazımı:** validasyonlar geçtikten sonra; create'den önce marker, sonra trackable_job_id idempotent guard ile

**`serviceParasutPollEDocuments` (yeni):**
- Bağımsız Poll CRON — `parasut_claim_sync` KULLANMAZ; idempotent DB guard zorunlu
- `done`: invoice re-read + meta + step='done' + sync log (source: poll)
- `running`: DB update yok (gereksiz yazım önlemi)
- `error`: alert + status=error idempotent guard'lı yazım
- `pending` ve bilinmeyen status'lar → running'e map + console.log uyarı (Faz 12 gerçek HTTP adapter hazırlığı)

**Yeni dosyalar:**
- `src/app/api/parasut/poll-e-documents/route.ts` — CRON-only POST endpoint
- `src/__tests__/parasut-service-faz10.test.ts` — 25 test
- `src/__tests__/parasut-service-poll-edocs.test.ts` — 9 test

**Güncellemeler:**
- `middleware.ts`: CRON_PATHS'a `/api/parasut/poll-e-documents` eklendi
- `serviceSyncOrderToParasut`: invoice→edoc geçişinde `dbGetOrderById` re-fetch (stale order fix)

### Bulgu fix (2026-04-26)
- **HIGH** — Stale order re-fetch: Yeni invoice sonrası `upsertEDocument` in-memory snapshot kullanıyordu → validation fail → 2099 retry block. Fix: orchestrator invoice→edoc geçişinde re-fetch
- **HIGH** — Bağımsız Poll CRON yoktu (plan açıkça istiyordu) → route + service + middleware
- **MEDIUM/HIGH** — Trackable job update'leri idempotent guard ile korunmuyordu (poll vs orchestrator yarışı) → tüm running/error/job_id yazımlarına `.eq jobId .neq status='done'` guard
- **MEDIUM** — pending → running map + raw_status metadata log davranışı yoktu → poll service'inde implement
- **MEDIUM** — VKN tax_number whitespace/tire normalize edilmiyordu → `replace(/\D/g,'')`

### Faz 10 son durumu (tam kapalı)
- Test: 35 yeni test; 98 dosya · 1914 test yeşil, TS clean

### Faz 10 ek bulgu fix (2026-04-26, 2. tur)
- **ORTA** — `dbWriteEDocMeta` (line 706) sadece `.eq("id", orderId)` ile yazıyordu → idempotent guard eklendi: `.neq("parasut_e_document_status", "done")` her zaman; `jobId` parametresi varsa ek olarak `.eq("parasut_trackable_job_id", jobId)`. Recovery 2 done branch (line 773) artık jobId ile çağırıyor. Recovery 1 (active_e_document) jobId'siz çağırıyor (sadece status guard yeterli).
- **DÜŞÜK/ORTA** — Poll'de unknown/pending status'u sadece `console.log` yazıyordu; plan PARASUT_PLAN.md:1031 `metadata.raw_status` istiyordu → `dbCreateSyncLog` ile `metadata: { raw_status, source: "poll", note: "unknown_status_mapped_to_running" }` eklendi (best-effort try/catch).
- **DÜŞÜK** — Poll catch block'unda `result.error++` eksikti → CRON çıktısı `error: 0` ama `errors[]` dolu olabiliyordu. Eklendi.

### Faz 10 ek bulgu fix (2026-04-26, 3. tur)
- **ORTA** — `dbWriteEDocMeta` 0 satır güncellendiğinde sessiz başarı sayılıyordu → markStepDone yanlış 'done' yazabilirdi. `.select("id")` ile etkilenen satır kontrolü; 0 satırda DB re-read; status='done' değilse `ParasutError` fırlat → markStepDone tetiklenmez. +2 test (poll-beat-us / unexpected state).
- **YÜKSEK (KRİTİK)** — `.neq("parasut_e_document_status", "done")` SQL'de NULL satırları kapsamıyor (`NULL != 'done'` → NULL → WHERE false). Yeni e-doc create akışında status başlangıçta NULL → guard yüzünden `parasut_trackable_job_id` HİÇ yazılmazdı → next sync attempted_marker var + job_id yok → manuel review hatası (sistem çıkmaza girerdi). 4 yer fix: dbWriteEDocMeta, recovery 2 running/error, yeni job yazımı. `.or("parasut_e_document_status.is.null,parasut_e_document_status.neq.done")` ile IS DISTINCT FROM semantiği. +1 regresyon test (orFilterCalls assertion).

**Test:** 98 dosya · 1917 test yeşil, TS clean.

**Domain kuralı:** PostgREST'te nullable column'a `.neq("X")` filtresi NULL satırları içermez. NULL'u kapsamak için `.or("col.is.null,col.neq.X")` kullan.

---

## Faz 11 (2026-04-26) — TAMAMLANDI

### 11.1 — Sevk preflight (order-service.ts)
- `preflightShipment(order)`: customer_id NULL → red; Paraşüt enabled iken customer.tax_number NULL/empty, product SKU empty, order_number `^ORD-(\d{4})-(\d+)$` regex fail → red.
- `serviceTransitionOrder('shipped')`: preflight başarılıysa `dbShipOrderFull` → `shipped_at=now()` her zaman + `parasut_step='contact'` Paraşüt enabled iken.
- Test: `order-service-preflight-faz11.test.ts` (15 test).

### 11.2 — Step-granular manual retry
- `serviceRetryParasutStep(orderId, step)`:
  - `step='all'` → `serviceSyncOrderToParasut` (mevcut orchestrator).
  - `step='X'` → dep guard (contact: dep yok; product: contact_id; shipment: tüm product_id'ler; invoice: shipment_doc_id; edoc: invoice_id) → claim → tek step → markStepDone(NEXT) → release.
  - `RetryableParasutStep = Exclude<ParasutStep,'done'>`, `NEXT_STEP` map.
  - eDoc 'running' → markStepDone çağrılmaz (poll bitirir).
- `POST /api/parasut/retry` body kontratı: `{ orderId, step? }` + geriye dönük `{ sync_log_id }`. `skipped:true` → 200 (400 değil).
- Test: `parasut-retry-step-faz11.test.ts` (17 test).

### 11.3 — UI step badges
- `GET /api/orders/[id]/parasut-status` — order + customer + products join; badges (contactDone/productDone/shipmentDone/invoiceDone/edocStatus).
- `OrderDetailPage` — `ParasutStepBadges` 5 badge (gri/mavi/yeşil/kırmızı), error tooltip (next_retry_at + retry_count), step başına "yeniden dene" butonu (sadece error iken), "Tüm adımları yeniden dene" butonu.
- Test: `parasut-status-route-faz11.test.ts` (9 test).

### Etkilenen testler
- `order-service.test.ts`, `DR-5.1-reservation-invariant.test.ts` — Mock'lara customers/products + service client + zenginleştirilmiş APPROVED_ORDER fixture eklendi.

### Final durum
- 101 dosya · **1958 test yeşil** · TS clean.

### Faz 11 — Bulgular 2. tur fix (2026-04-27)
- **HIGH 11.4 Dashboard:** `/api/parasut/stats` artık `byStep` + `byErrorKind` dağılımları ve `token: { connected, expiresAt, secondsRemaining, tokenVersion }` döndürüyor. Dashboard sayfasında: token durumu satırı + "Bağlan"/"Yenile" butonları, Step + Hata Tipi dağılımı kartları (tıklayınca log filtre uygular), sync log tablosuna **Step** ve **Hata Tipi** kolonları + step/error_kind/status dropdown filtreleri ve "Temizle" butonu.
- **HIGH 11.5 Settings:** ApiTab'a "Paraşüt OAuth" bölümü — token süre göstergesi (`formatTokenDuration`), "Paraşüt'e bağlan" linki (`/api/parasut/oauth/start`), "↻ Token Yenile" butonu (yeni `POST /api/parasut/oauth/refresh` endpoint, admin-only).
- **M1 transition update error:** `serviceTransitionOrder('shipped')` post-ship `update().eq()` artık `{ error }` kontrol ediyor; fail → `success: false` + açıklayıcı error.
- **M2 24h deneme sayısı:** `dbCountRecentSyncLogsByStep(entityId, hours)` helper; `parasut-status` route `attemptsLast24h: Record<step,count>` döndürür; UI tooltip'inde "Son 24h: N deneme" satırı.
- **M/L her badge için Yeniden Dene:** `canRetry = !isDemo` (eskiden `err && !isDemo`); backend dep guard zaten reddediyor.
- **LOW STOCK_INVARIANT alert:** `upsertInvoice` içinde `createSalesInvoice` try/catch; mesaj `/shipment_included|warehouse|stok invariant/i` ise `ALERT_ENTITY_PARASUT_STOCK_INVARIANT` ile critical `sync_issue` alert üretilir.
- **Yeni endpoint:** `POST /api/parasut/oauth/refresh` (admin-only) — expires_at'i 1970'e çekip `getAccessToken` ile zorla refresh; fail durumunda eski expires_at restore.
- **Yeni dosyalar:** `parasut-stats-faz11-bulgular.test.ts` (4), `parasut-stock-invariant-alert.test.ts` (3); `parasut-status-route-faz11.test.ts` (+2 attempts test); `order-service-preflight-faz11.test.ts` (+3 M1 test); mevcut `parasut-stats-route.test.ts` mock parasut_oauth_tokens + ConfigError ile güncellendi.

**Test:** 103 dosya · **1970 test yeşil** · TS clean.

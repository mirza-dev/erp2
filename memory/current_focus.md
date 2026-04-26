---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---
**Aktif:** Paraşüt entegrasyonu — Faz 11 sırada (Preflight + manual retry + UI)
**Önceki:** Faz 10 TAMAMEN KAPALI (2026-04-26)

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
- 98 dosya · 1914 test yeşil, TS clean.

---

## Sıradaki adım — Faz 11

Backend preflight + step-granular manual retry + UI badges:
1. **`serviceTransitionOrder` preflight** (order-service.ts):
   - customer + products re-fetch
   - customer_id null, tax_number null (Paraşüt enabled), SKU eksik, order_number format kontrolleri
   - Transition başarılı → `shipped_at = now()`, `parasut_step = 'contact'` (başlangıç)
2. **`POST /api/parasut/retry`** body: `{ orderId, step?: 'contact'|'product'|'shipment'|'invoice'|'edoc'|'all' }`
   - `Exclude<ParasutStep, 'done'>` retry map
   - Step state machine
3. **UI badges:** sipariş listesi/detay sayfasında step + error_kind görünür hale getir

**Why:** Yeni session'da Claude aktif konuyu eksiksiz bilsin.
**How to apply:** Faz 10 tamamen kapalı. Faz 11'den devam et.

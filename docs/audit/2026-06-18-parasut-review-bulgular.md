# Paraşüt Modülü Derin Denetim — Bulgular

**Tarih:** 2026-06-18
**Kapsam:** Paraşüt entegrasyonu — `src/lib/parasut.ts`, `src/lib/parasut-adapter.ts`, `src/lib/parasut-constants.ts`, `src/lib/services/parasut-service.ts` (1635 satır), `src/lib/services/parasut-oauth.ts`, `src/lib/services/parasut-api-call.ts`, `src/app/api/parasut/**` (13 route), `src/app/api/orders/[id]/parasut-status`, OAuth akışı + RLS + RBAC + idempotency yüzeyi.
**Yöntem:** REVIEW.md kurallarıyla read-only inceleme (erp2-reviewer checklist'i + manuel kanıtlama). Modül olgun (Faz 1-11 + iki önceki Bulgular turu); bu tur yeni/izlenmeyen noktaları hedefler.
**Önemli bağlam:** Paraşüt şu an MOCK (`PARASUT_USE_MOCK`) + `PARASUT_ENABLED != "true"` → canlıda DEVRE DIŞI. Tek bulgu gerçek ama yalnız Faz 12 (canlı OAuth) açıldığında ısırır → "go-live öncesi kapat" sınıfı.
**Özet:** **K:0 · Y:0 · O:1 · D:0 · Nit:2.** Tek eyleme dönük bulgu O1 (kullanıcı kararıyla düzeltildi). Diğer yüzeyler temiz.

---

## O1 (Orta) — `checkAuthAlertThreshold` üretimde hiç çağrılmıyordu (orphaned auth-alert mekanizması)

**Kanıt:** `src/lib/services/parasut-service.ts:135` `checkAuthAlertThreshold()` export edilmiş + `parasut-service-faz4.test.ts`'te 25 testle kanıtlanmış, ama tüm repoda (worktree aynaları hariç) **sıfır üretim çağıranı** — `grep -rn checkAuthAlertThreshold src/app` boş. Fonksiyon `integration_sync_logs`'ta son 1 saatte `error_kind='auth'` ≥3 olunca **critical** "Paraşüt auth hatası — OAuth yeniden doğrulama gerekebilir" alert'i (`entity_type='parasut'`, `entity_id=ALERT_ENTITY_PARASUT_AUTH`) + outbox bildirimi üretmek için yazılmış.

**Etki:** Canlıda OAuth refresh_token iptal/expired olunca `getAccessToken` `auth` hatası fırlatır → `classifyAndPatch` `error_kind='auth'` + `2099-01-01` retry-block yazar → **tüm sipariş sync'leri sessizce durur**. Loglar `error_kind='auth'` ile birikir ama **operatöre dönük hiçbir alert otomatik açılmazdı**. Dahası: `/api/alerts/[id]/sync-retry` rotası `ALERT_ENTITY_PARASUT_AUTH` alert'inden OAuth refresh tetikler — ama bu alert hiç oluşmadığından **tasarlanan alert→sync-retry→OAuth-refresh kurtarma döngüsü asla otomatik tetiklenemiyordu**. Operatör yalnız logları/stats'ı elle inceleyerek fark ederdi.

**Mevcut hafifletme:** (a) Paraşüt pre-production (devre dışı); (b) stats sayfası `blocked_syncs` + token durumunu gösterir; (c) CAS-çakışması ayrı (nadir) bir `parasut_auth` warning üretir. Yine de tasarlanan birincil mekanizma kopuktu.

**Düzeltme (kullanıcı kararı: WIRE ET — 2026-06-18):**
- `serviceSyncOrderToParasut` ve `serviceRetryParasutStep` catch bloklarında, error sync-log yazımından **sonra**, `pe.kind === "auth"` ise `checkAuthAlertThreshold()` **best-effort** (kendi try/catch'i, mevcut `parasut_*_fail` log kalıbıyla tutarlı) çağrılır. Sıra önemli: log önce yazılır ki eşik sorgusu bu hatayı da saysın.
- Mükerrer alert riski yok: `dbCreateAlert` + `idx_alerts_active_dedup` `(type, entity_type, entity_id)` aynı `ALERT_ENTITY_PARASUT_AUTH` için tek aktif kayıt tutar.
- Yeni davranışsal test (`src/__tests__/parasut-auth-alert-wiring.test.ts`): auth hatası + ≥3 auth → critical PARASUT_AUTH alert; eşik altı → alert yok; auth-dışı (server) → eşik kontrolü hiç çağrılmaz. Hem ana sync hem step-retry için. Mevcut 25 faz4 testi korundu.
- **Migration YOK** (yalnız service-katmanı wiring).

---

## Nit-1 — `getAccessToken` poll penceresi (5×1s=5s) < lease TTL (30s)

`parasut-oauth.ts:13-16`: lease 30s, ama bekleyen paralel çağıran `POLL_MAX_ATTEMPTS=5 × POLL_INTERVAL_MS=1000` = yalnız 5s polling yapar. Refresh 5s'den uzun sürerse bekleyen "yenileme bekleme süresi aşıldı" fırlatır (lease sahibi hâlâ başarıyla bitirebilir). Etki düşük: o siparişin sync'i hata yazar, sonraki cron tekrar dener. Mock gecikmesi 200-600ms, gerçek refresh ~yüzlerce ms → pratikte tetiklenmez. **Bu turda dokunulmadı** (opsiyonel: `POLL_MAX_ATTEMPTS` ~30'a çıkarmak lease TTL'i kapatır).

## Nit-2 — `serviceParasutOAuthRefresh` lease almadan global `expires_at` mutasyonu

`parasut-oauth.ts:178-224`: manuel refresh `expires_at`'i epoch'a çeker (lease/owner almadan) sonra `getAccessToken` çağırır; hata olursa `oldExpiresAt`'i geri yazar. Devam eden bir refresh ile eşzamanlı olursa eventually-consistent (CAS + restore) ama hafif racy. Admin-gated + nadir → kabul edilebilir. **Bu turda dokunulmadı.**

---

## Temiz doğrulananlar (bulgu YOK)

- **OAuth CSRF:** HMAC-SHA256 imzalı state + `timingSafeEqual` + fail-closed (`CRON_SECRET` yoksa start throw / callback false); callback `ALWAYS_PUBLIC` ama state-cookie gated; relative redirect (reverse-proxy güvenli); cookie `httpOnly`+`secure`(prod)+`lax`+300s; in-progress-refresh 409 guard.
- **Token tablosu RLS:** `parasut_oauth_tokens` policy YOK → yalnız service_role (mig.039:27). `parasut_claim_sync`/`parasut_release_sync` SECURITY DEFINER + `REVOKE … FROM public, anon, authenticated` + `GRANT … TO service_role`.
- **RBAC:** mutasyonlar `manage_parasut` (sync/retry/sync-pending); okumalar (config/invoices/logs/stats) `view_parasut`; CRON (sync-all/poll-e-documents) proxy `CRON_PATHS` Bearer + route-içi `requireCronSecret` (derinlemesine savunma, D4); `sync-pending` = session+`manage_parasut` (CRON sync-all'ın kullanıcı ikizi); `parasut-status` `view_sales_orders` (Y1, demo-dostu); oauth/start+refresh ADMIN_EMAILS gate; sync-retry `manage_alerts` + entity whitelist.
- **Redaction:** `view_parasut` yalnız `admin` + `accounting`'de (`permissions.ts:110`); ikisi de `view_sales_prices` taşır → `/api/parasut/invoices` ham `select("*")` satırları **redaction açığı DEĞİL**.
- **Secret ifşası:** config route kimlik bilgilerini `mask()`'ler (ilk 4 + bullet), secret yalnız boolean; demo yalnız `enabled`; dashboard sayfası maskeli/boolean gösterir, ham token client'a gitmez.
- **Stok invariant:** `shipment_included=false` + details'te `warehouse` YOK adapter'da zorlanır (throw) + ihlalde critical alert (`ALERT_ENTITY_PARASUT_STOCK_INVARIANT`).
- **Idempotency/crash recovery:** contact/product create'te TTL-lease mutex (parasut_*_id daima NULL-veya-gerçek-UUID); shipment/invoice/edoc'ta durable `*_create_attempted_at` marker + remote lookup recovery + manuel-inceleme alert'i; e-doc idempotent guard'ları (`.eq(job_id)` + `.neq('done')` + `OR is null` NULL-kapsama); poll CRON claim KULLANMAZ → idempotent guard zorunlu (kanıtlandı); partial unique index'ler (invoice/shipment/edoc/trackable/series-number).
- **Discount reconciliation:** claim ÖNCESİ guard hem ana sync hem invoice-retry'da; kuruş-tamsayı akümülasyon (float drift yok); subtotal=0 & discount>0 → blok + alert.
- **Invoice no:** deterministik (`ORD-YYYY-N` → int), `Date.now()` fallback YOK; tutarlı üretici → gerçekçi çakışma yok + DB `(series, number_int)` unique index emniyet ağı.
- **Retry:** step-order guard (geriye düşme yok), dep guard'lar, auth/validation → 2099 blok, exp backoff + jitter + 5-deneme cap.
- **api-call:** `PARASUT_ENABLED` guard + rate_limit tek-retry (≤30s cap) + structured JSON log.
- **Sync tetikleyici:** order ship (PATCH + /ship) `serviceSyncOrderToParasut(id).catch()` best-effort (ship commit'i bloklanmaz; cron emniyet ağı).

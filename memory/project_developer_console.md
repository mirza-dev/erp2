---
name: project_developer_console
description: Developer Console / System Health paneli — internalOperator kapısı, 3 telemetri kancası, migration 109, istemci RUM, bilinen sınırlar
metadata:
  type: project
---

**Developer Console (2026-08-30, migration 109).** ERP'nin üstüne eklenen
observability katmanı — `/dashboard/developer` altında 6 ekran (Genel Bakış ·
Hatalar · Kayıtlar · Bug'lar · Performans · Tanılama) + 11 API ucu.
6504 → **6713 test**, yeni bağımlılık **0**.

**Denetimin en önemli çıktısı — kurulmayanlar.** Sentry ZATEN kuruluydu
(v10.48 + `sentry-scrub.ts`), `internalOperator` ZATEN vardı
(`INTERNAL_OPERATOR_EMAILS` allowlist ∧ `view_settings`, env boşsa
fail-closed), `/dashboard/settings/email-deliveries` de aranan kalıbın çalışan
örneğiydi. Bu yüzden ikinci auth sistemi, yeni rol, yeni monitoring altyapısı
ve paralel DB **kurulmadı**.

**Güvenlik 4 katman** (email-deliveries kalıbının aynısı): `proxy.ts`
`INTERNAL_ONLY_PREFIXES` · `page-access.ts` (`view_settings`, kaba kapı) ·
her route `requireInternalOperatorFor` · RLS `service_role`-only.
Test `/api/developer` dizinini **enumerate eder** → guard'sız yeni uç eklenemez.

**Üç telemetri kancası (iş mantığına sıfır dokunuş, §21):**
1. `api-error.ts` `handleApiError` → `after(recordError)` — 115/148 route
2. `src/instrumentation.ts` `onRequestError` → önce `Sentry.captureRequestError`,
   sonra `recordError` — kalan 33 route + RSC. **`register()` export ETMEZ**
   (kök `sentry.*.config.ts` kurulumu devralınmasın).
3. `proxy.ts` → `x-request-id` üretir, İSTEK başlığına yazar; `handleApiError`
   `next/headers` ile okur → **148 route'un hiçbirinin imzası değişmedi**.

**Performans = istemci RUM.** Next.js middleware handler'dan ÖNCE bitiyor,
yanıt süresi/status'u göremiyor → 148 route'a dokunmadan sunucu latency'si
ölçülemez. `rum-client.ts` global `fetch`'i sarar (`jsonFetcher` yalnız 2
dosyada, ham `fetch` 58 dosyada — fetcher'ı sarmak paneli boş bırakırdı),
`TelemetryBridge` dashboard layout'unda tek noktadan kurar.

**İki gerçek kusur build'de yakalandı ve düzeltildi:** `node:crypto` Edge
runtime'a ve istemci bundle'ına sızıyordu → fingerprint **FNV-1a 64**
(bağımlılıksız, sync, her runtime'da aynı); bug sabitleri sunucu modülünden
import ediliyordu → `telemetry/console-types.ts` (çalışma zamanı bağımlılığı
YOK) ortak kaynak oldu.

**Bilinen sınırlar (panelde de yazılı):** RUM ağ süresini içerir ve yalnız
UI'ın çağırdığı uçları kapsar · `process.uptime()` ve telemetri arıza sayacı
instance başına · cron sağlığı DOLAYLI (son etki zamanı) · hata olayları
grup başına saatte 20 örneklenir (grup `occurrence_count` TAM) ·
`INTERNAL_OPERATOR_EMAILS` set edilmeden panel açılmaz.

**Açık:** migration 109 APPLY · `INTERNAL_OPERATOR_EMAILS` set · tarayıcı turu.

İlgili: [[project_security]] · [[project_integrations]] · [[current_focus]]

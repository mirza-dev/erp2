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

## 2026-08-30 — bağımsız inceleme + 29 bulgunun kapanışı

Rapor: `docs/audit/2026-08-developer-console-review.md` (K:2 Y:7 O:7 D:8 Nit:5 → **29/29 düzeltildi**).

**Panelin ilk sürümündeki iki yapısal yanlış:**
1. **Kapsama iddiası yanlıştı.** `onRequestError` "kalan 33 route"u yakalamıyordu —
   28'i kendi `catch`'inde yanıt döndürdüğü için hata Next'in sınırına ULAŞMIYOR.
   Ders: *bir kancanın kapsamı, kancanın varlığıyla değil, hatanın oraya ULAŞMASIYLA ölçülür.*
   Artık `gate/route-error-coverage.test.ts` kilitliyor (baseline BOŞ).
2. **Kör olduğunda yeşil gösteriyordu.** `safe(…, emptyErrorStats())` başarısız sondayı
   ölçülmüş sıfıra çeviriyordu. Ders: *izleme aracında `0` ile `null` ASLA aynı şey değildir.*
   Sözleşme artık uçtan uca `null = ölçülemedi`; `computeOverallHealth` `telemetryReadable`
   girdisiyle kör durumda **degraded** diyor.

**Güvenlik dersi (K1, canlıda kanıtlandı):** Supabase'te `revoke … from public`
varsayılan ayrıcalıkların anon/authenticated'a verdiği DOĞRUDAN EXECUTE'u KALDIRMAZ.
DEFINER fonksiyonu çağıranın RLS'ine tabi olmadığı için tablo policy'leri devreye girmez.
A/B probe: 109'un RPC'si anon key ile HTTP 200, kontrol (087) 401/42501.
→ `mig.110` + gate'te rol-hedefli REVOKE kontrolü. Bkz. [[project_security]].

**Test altyapısı dersi:** `code()` yorum-ayıklayıcısı 11 dosyada kopyalanmıştı ve
blokları satır yorumlarından ÖNCE ayıklıyordu; `// /dashboard/**` içindeki `/*`
blok başlangıcı sanılınca aradaki GERÇEK KOD siliniyor, kaynak-kilidi testleri
sessizce yanlış şeyi doğruluyordu. Sıra düzeltildi (önce satır, sonra blok).

**Yeni kalıcı kapılar:** `gate/route-error-coverage` · `gate/rum-endpoint-allowlist`
(`known-endpoints.ts` dizinden üretilir) · `sql-migration-lint`'te rol-hedefli REVOKE.

---

## Frontend turu (2026-08-31) — `console-ui.ts`

Konsol kurulduğundan beri **hiç görsel olarak incelenmemişti**:
`INTERNAL_OPERATOR_EMAILS` boştu, kimse giremiyordu, sidebar linki bile render
edilmiyordu. Bu turda allowlist açıldı ve altı ekran canlı veriyle ölçüldü.
Rapor: `docs/audit/2026-08-31-developer-console-frontend.md`.

**Erişim zinciri:** `hasInternalOperatorAccess` allowlist **ve** `view_settings`
ister. Canlı hesaplar okundu — iki gmail de zaten `["admin"]`, yani `view_settings`
vardı; eksik olan tek şey allowlist'ti (`ADMIN_EMAILS`'e dokunulmadı).
Dev sunucusu prod-koruma kapısına takıldı (`predev` → canlı fabrika hedefi);
tur `ALLOW_PROD_TARGET=1` ile **yalnız görsel inceleme** olarak yürütüldü.

**Kök örüntü: `Card` kasten dolgusuzdur, dolgu çocuğun sorumluluğudur** —
`DataTable` bunu verir (`10px 14px`), elle örülen yüzeyler vermiyordu. Sonuç:
Tanılama'nın **5 kartının hepsinde içerik kenarlığa 1px** kalıyordu, Kayıtlar
satırının son hücresinin sağ kenarı kartın iç kenarıyla **birebir aynıydı**.
Konsolun `DataTable` kullanan üç sayfası (Bug'lar/Hatalar/Performans) zaten temizdi.

**YENİ `src/app/dashboard/developer/console-ui.ts`** — `CONSOLE_GUTTER = "14px"`
(DataTable ritmi) · `consoleRow(v)` · `sectionTitle` (3 kopyaydı, `margin` 6px'e
karşı 8px ayrışmıştı) · `factGrid`/`factCell`/`factValue`/`factWide`/`factLabel`.
`consoleRow` dolguyu satır kutusunun İÇİNDE tutar, `borderBottom` kenarda kalır →
**ayraç tam genişlikte kalır**, tablo görünümü bozulmaz.

**Ders — hizalama sorununu yanlış katmanda çözdüm, ölçüm yakaladı.** İki satıra
kırılan etiket komşularının değerini aşağı itiyordu (610 vs 627). `factGrid`'e
`alignItems: "start"` verdim; tarayıcı hâlâ **742 vs 756** gösterdi. Kayma
hücreler *arasında* değil hücrenin *içinde*: bir satırlık etiketin altındaki
değer, iki satırlığınkinden yukarıda kalıyor. Doğru kol `factCell`
(`height:100%`) + `factValue` (`marginTop:auto`).

**Ders — bir önceki turun kapısı bir varyantı kaçırdı.** `form-consistency`
yalnız `const labelStyle` bildirimlerine bakıyordu; konsolun `<dt>`'si satır içi
yazılmıştı → ölçülen **11px/450**, kanonik 11px/600. *Kaynak-iddiası kuralı,
ihlalin tek bir yazım biçimini değil, kavramın tüm yazım biçimlerini kapsamalı.*

**Ders — yedeklemede `basename` çakışması.** Kırmızı-kanıt turunda dört farklı
`page.tsx` aynı yedek dosyaya yazıldı ve üçü ezildi. `HEAD`'den geri alındı,
düzenlemeler yeniden uygulandı, kanıt dosya-başına yedek + SHA-256 doğrulamasıyla
tekrarlandı (**11/11 kırmızı**).

**Kapı:** YENİ `gate/console-consistency.test.ts` (10 test). `<li>` kuralın
dışında — whitelist değil, kuralın doğru sınırı (liste öğesinin yatay girintisi
ebeveyn `<ul>`'nin işi); muafiyet gerçek kusuru gizlemesin diye `<ul>`'nin
gutter'ı taşıdığı **ayrıca** kilitlendi.

**Ölçülen sonuç:** kart içeriği 1px → **15px** · İstemci hücresi 192×113px
(7 satır) → **1183×19px (1 satır)** · `<dt>` 450 → **600** · Yapılandırma
tabanları 610/627 → **756 (hepsi)** · Performans satırları 58/41 → **41 (hepsi)**.

**~~AÇIK — D1~~ → KAPANDI (2026-09-04).** Kayıt "filtreler URL'ye yazılmıyor;
dizinde `useSearchParams`/`router.replace`/`replaceState` **sıfır**" diyordu.
2026-09-12'de kaynaktan ölçüldü: YENİ `src/hooks/useUrlFilters.ts` (kendi
yorumu "A4 — filtre durumunu URL'de tutan istemci hook'u") ve konsolun **beş
sayfası** onu kullanıyor (`page` · `bugs` · `logs` · `errors` · `performance`).
**~~Kapsam dışı: mobil / dokunma hedefleri~~ → KAPANDI (2026-09-10, A5):**
"6 sayfada `tap-44` sıfır" iddiası da bayat — `tap-44` artık `layout.tsx`
dahil dört konsol dosyasında.

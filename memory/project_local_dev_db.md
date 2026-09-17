---
name: project-local-dev-db
description: Yerel geliştirme veritabanı (colima + Supabase) — 2026-08-31'de kuruldu, E2E kilidini açtı
metadata:
  type: project
---

**2026-08-31: yerel geliştirme veritabanı kuruldu.** O güne kadar ayrı bir dev DB
YOKTU; `.env.local` canlı fabrikaya bakıyordu, `npm run dev` prod kapısına
takılıyordu ve **13 Playwright spec'i hiç koşamamıştı**.

**Kurulan:** colima 0.10.3 + docker CLI 29.7.2 + supabase CLI 2.116.0 (hepsi
brew, `/opt/homebrew`). **Docker Desktop DEĞİL** — ilk açılışta GUI'de lisans
onayı ve admin parolası ister, ajan tamamlayamaz; colima terminalden sudo'suz
kuruluyor ve aynı işi görüyor.

**Docker Desktop daha önce kurulmuş ve SİLİNMİŞ**: `/usr/local/bin`'de 8 kırık
sembolik bağ + `~/.docker` kalmıştı. Bağlar silinmedi (PATH'te
`/opt/homebrew/bin` önce geliyor, zararsızlar). Ama `~/.docker/config.json`
DÜZELTİLDİ: `credsStore: "desktop"` ve `currentContext: "desktop-linux"` silinmiş
uygulamaya bakıyordu ve colima'yı bozardı.

**Kapı kendiliğinden açıldı — kod değişmeden.** `isProdTarget()`
(`src/lib/env-target.ts:47`) yalnız canlı ref'i tanır ve bilinçli olarak
fail-closed değildir; yerel hedef "canlı değil" sayılır. Ders: bu kapı zaten
dev DB'ye geçiş için tasarlanmıştı.

**Env:** `.env.local` = yerel · `.env.canli.local` = canlı yedeği (gitignored).
Geri dönüş `cp .env.canli.local .env.local`.

**Şema doğrulandı:** 111 migration hatasız uygulandı, 64 tablo / 64 RLS / 6 kova
— schema-bundle README'sinin beklediğiyle birebir. Yerel taban: policy 29,
fonksiyon 100 (bunlar kaynakta ölçülmemişti).

**Kurulum GERÇEK BİR KUSUR buldu:** `next.config.ts` CSP `connect-src` yalnız
`https://*.supabase.co`'ya izin veriyordu; yerel Supabase `127.0.0.1:54321` bu
desene uymuyor → tarayıcı girişi bloklar, **sunucu logunda hata yok**, "parola
yanlış" gibi görünür. `isDev` koluyla çözüldü, üretim string'i değişmedi.
**Ders: E2E kilitliyken bu sınıf kusur görünmez.**

**E2E ilk tam koşum: 84 passed / 1 failed / 9 flaky.** Tek gerçek hata
`products.spec.ts` araması — UYGULAMA KUSURU DEĞİLDİ: arama sunucu tarafına
taşınmış (350ms debounce + fetch), test sabit 400ms bekleyip eski listeyi
sayıyordu. Otomatik yeniden deneyen assertion'a çevrildi. Düzeltirken ikinci
tuzak: `toHaveCount(0)` tablo render olmadan da geçer → önce `rows.first()`
görünür assert'i eklendi (yoksa test sahte-yeşil yanardı).

**Bilinen kırık — SEBEBİ ANAHTAR, KOD DEĞİL:** `import.spec.ts:204 tam import
akışı` düşüyor çünkü `.env.local`'daki **`ANTHROPIC_API_KEY` GEÇERSİZ**
(sunucu logu: `401 authentication_error: invalid x-api-key`). Sihirbaz AI kolon
tespiti bekliyor, 90 sn'de timeout. Aynı küme kararsızlığının da muhtemel
sebebi. **Uygulama doğru davranıyor** (AI kapalı bandı + Excel/CSV yolu
çalışıyor); kırık olan test AI'lı yolu bekliyor. Anahtar yenilenmeli.

Not: ilk teşhiste "sihirbaz AI çağırmıyor" dedim — YANLIŞTI, yanlış dosyada
aradım. Doğrulayıcının ilk teşhisi de bir iddiadır.

Kullanım ve sıfırdan kurulum: `docs/yerel-gelistirme.md`.
Ayrıntılı bağlam: [[project_delivery]] · [[deferred_backlog]] · [[project_security]]

**2026-09-05 — E2E suite ilk kez uçtan uca yeşil (94/94, retries=0, 2,3 dk).**
Kilit 2026-08-31'de açılmıştı ama suite o günden beri hiç koşmamıştı; ilk koşum
**85 passed · 8 flaky · 1 failed · 32,8 dk** verdi.

**KAYDA GEÇEN KISIT: E2E yerelde `next dev`e MAHKÛM.** "Üretim sunucusuna karşı
koş" denendi ve globalSetup girişte takıldı — üretim CSP'si `connect-src`i
`*.supabase.co` ile sınırlıyor, yerel Supabase `127.0.0.1:54321`de. `next.config`
zaten dev/prod diye ayrılmış durumda ve **üretim stringi gate ile kilitli**, yani
gevşetilemez. Sonuç: Turbopack'in ilk-istek derlemesi bir gerçek ve testin
bütçesinden çıkarılması gerekiyor → `globalSetup` 16 rotayı ısıtıyor.

İkinci kök: **hidrasyon**. `domcontentloaded` anında `main` üzerinde `__react*`
anahtarı yok (~2,5 sn sonra var); o pencerede yapılan `setInputFiles`/`fill`
sessizce kayboluyor. `tests/helpers/nav.ts` → `waitForHydration`.


**2026-09-17 — E2E 94 → 123 (8 yeni spec) + gerçek-DB entegrasyon kapısı.**
- `npm run test:integration` (`vitest.integration.config.mts`, `tests/integration/**`,
  `npm test`in DIŞINDA): `supabase db query --local` ile `pg_class.relrowsecurity` 64/64 ·
  PostgREST anon probu 0 satır (anti-vakum: service key ile tohumlu tablolarda satır var) ·
  6 kova · mig.110 DEFINER RPC'leri **gerçek imzayla** anon → 401/42501 (boş `{}` PGRST202
  verir — imza uyuşmazlığı, izin kanıtı DEĞİL) · 088 rezervasyon zinciri. Runner
  **fail-closed**: `NEXT_PUBLIC_SUPABASE_URL` host yerel değilse hiç koşmaz (`preflight:env`
  yalnız canlı ref'i tanır; bu test canlıya ASLA gitmemeli).
- `E2E_PORT` (`tests/helpers/base-url.ts`, varsayılan 3000): bu makinede `:3000` yabancı bir
  `vinext dev` süreci tarafından tutuluyor → `E2E_PORT=3100`. `warmRoutes` 39 rota.
- **`~/Library/Caches/ms-playwright` iki kez dışarıdan silindi** (başka oturum/araç) →
  `PLAYWRIGHT_BROWSERS_PATH=$CLAUDE_JOB_DIR/tmp/pw-browsers` + `npx playwright install chromium
  chromium-headless-shell` (ikisi ayrı hedef; yalnız `chromium` headless-shell'i getirmedi).
- Test yazımı dersleri: JS regex `i` bayrağı Türkçe **İ**'yi eşlemez → literal ad + `exact` ·
  `getByLabel` alt-dize eşler · URL-durumlu checkbox `.check()` düşer (`click`+`toBeChecked`) ·
  debounce'lu arama sonrası satır tıklaması: önce `waitForURL(/[?&]search=/)` (gecikmiş
  `replace` `push`u ezer) · 3 sn'lik toast'a iddia bağlanmaz.
- E2E'nin bulduğu ürün kusurları: `revalidateTag(…, "max")` SWR (bkz. [[project_stack]]) ve
  preview sayfası hidrasyon uyuşmazlığı. Rapor: `docs/audit/2026-09-17-a1-a7-kapanis.md`.

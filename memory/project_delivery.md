---
name: project_delivery
description: Teslim modeli — tek kiracılı mimari, müşteri başına Supabase projesi, şema paketi, prod-koruma kapısı, PWA
metadata:
  type: project
---

**Ürün TEK KİRACILI ve bu şemada sert uygulanıyor:** `company_settings` üzerinde
`unique index … ((true))` var (033) → ikinci firma satırı fiziksel olarak yazılamaz;
111 migration'ın hiçbirinde `tenant_id`/`company_id`/`org_id` kolonu YOK (ölçüldü).
Dolayısıyla **yeni müşteri = yeni Supabase projesi + yeni deployment.** Bu eksiklik
değil, kasıt: müşteriler birbirinin verisini teknik olarak göremez.

**Maliyet:** Supabase Pro **organizasyon başına** $25/ay, içindeki $10 compute kredisi
ilk projeyi karşılar → her yeni müşterinin marjinali **~$10/ay**. PITR ($100/ay) bu
işlem hacmi için orantısız; Team ($599) yalnız sözleşmede SOC2/SSO dayatılırsa.
**Asıl maliyet para değil migration operasyonu** — migration'lar Studio'dan elle
uygulanıyor, N müşteri = N kez elle + drift riski. İkinci müşteriden ÖNCE
`check-migrations.ts` çok-projeli koşuma uyarlanmalı.

**Şema paketi** (`npm run schema:bundle` → `scripts/build-schema-bundle.ts`):
111 migration → 5 yapıştırmalık parça (502 KB) + README + doğrulama sorgusu
(`tablo` == `rls_acik` == 64, kova 6). Birleştirme güvenliği ölçülerek doğrulandı:
açık begin/commit yok, psql meta-komutu yok, `concurrently` yok, tek eklenti
`pg_trgm` (IF NOT EXISTS), **6 kovanın tamamı migration'larda yaratılıyor**.
Çıktı `.gitignore`'da (türetilmiş). Gate: bir migration'ın sessizce düşmesi.
**Uyarı:** `057_seed_product_types` vana/fitting sektörüne özel 8 tip basar —
farklı sektör müşterisinde değiştirilmeli.

**Prod-koruma kapısı** (`src/lib/env-target.ts` + `npm run preflight:env`):
`PROD_PROJECT_REF = "ryvxpolvhvsycuqyphoa"` sabit commit'li (sır değil, `NEXT_PUBLIC_`).
`predev` + `pretest:e2e*` bağlı; **`backup`/`build`/`start` KASITLI bağlanmadı**
(yedek ve Coolify prod derlemesi meşru biçimde canlıyı hedefler). Kaçış:
`ALLOW_PROD_TARGET=1`. **Fail-closed DEĞİL, bilinçli:** tanınmayan URL prod sayılmaz
(yerel/self-host/başka müşteri) — bilinmeyeni bloklamak kapıyı gürültüye çevirirdi.
⚠️ **E2E artık kilitli** — dev projesinde `E2E_USER_EMAIL` kullanıcısı açılana kadar.

**PWA — 2026-08-31'de TARAYICIDA doğrulandı** (üretim build + `npm start`, yalnız
teknik kontroller): manifest bağlı · 4/4 ikon 200 · iki tema `theme-color` · **10
açılış ekranı link'i** · SW `activated` scope `/` · cache'te **0 API girdisi** ·
sunucu gerçekten kapatılıp gezinme denendi → `/offline` sayfası çıktı.

Sabit "Roven" kimliği (müşteri logosu uygulama içinde — klasik SaaS). Kısayollar:
Yeni Sipariş · Yeni Teklif · Stok · Uyarılar. İkonlar `npm run pwa:icons` ile
`icon.svg`'den **sabit renklerle yeniden kurulur** (ham SVG'yi rasterleştirmek
yanlış olurdu: içindeki `prefers-color-scheme` rasterleştirmede uygulanmaz → koyu
marka + şeffaf zemin, koyu launcher'da kaybolur); PNG'ler commit'li.

**`public/sw.js` KASTEN APTAL:** yalnız `/_next/static/`, **API ve navigasyonlar
ASLA** — ERP'de bayat sipariş/stok, olmayan hatadan beterdir. `MAX_ENTRIES=200`
FIFO tavan (yoksa her deploy önbelleği büyütür). Gezinme hatasında `/offline`
döner — bu **önbellekleme değil yakalama**. `install`'da **`skipWaiting()` YOK**:
yeni worker "waiting"te bekler ki `ServiceWorkerUpdatePrompt` (dashboard layout,
`ToastProvider` içinde — kökte DEĞİL) "Yenile" diye sorabilsin; onayla
`SKIP_WAITING` → `controllerchange` → reload.

**SW yalnız ÜRETİMDE kaydolur; dev'de mevcut kaydı ve `roven-*` cache'lerini
AKTİF OLARAK SİLER** — guard yetmezdi, SW kaydı kalıcıdır ve bir kez koşan
geliştiricide eski JS servis edilirdi.

**Toast genişletildi** (geriye dönük uyumlu): `action` artık `{label,href}` VEYA
`{label,onClick}`; `duration: 0` = kalıcı toast. 3 saniyede kaybolan bir güncelleme
istemi sorulmamış sayılır.

**iOS:** `src/app/apple-icon.png` (Next `<link>`i oradan basar — `public/`teki kök-yol
tahminine güvenmek kırılgandı) · 10 `apple-touch-startup-image` · `statusBarStyle`
**"default" BİLİNÇLİ** ve **`viewport-fit: cover` EKLENMEDİ** (üstte bugün olmayan
sorunu yaratırdı); yalnız mobil çekmeceye `env(safe-area-inset-bottom)`.
`apple-mobile-web-app-capable` **elle eklendi** — Next `capable:true` için yalnız
standart `mobile-web-app-capable` basıyor (tarayıcıda ölçüldü), iOS 16.4 öncesi
Apple'ınkini istiyor.

`proxy.ts` matcher'ı `webmanifest|js|png`'yi zaten dışlıyor (auth kapısını atlarlar) —
bu bağ teste kilitlendi, biri listeyi daraltırsa PWA sessizce ölürdü.
Kapı: `src/__tests__/gate/pwa.test.ts` **16 test**, her kural kırmızı-yandığı kanıtlanarak.

**On-premise REDDEDİLDİ:** müşteri sunucusuna kurulum, Next.js'i değil Supabase'in
tamamını (Postgres+GoTrue+Storage+Realtime+PostgREST) self-host etmek demek.
Gerekçe `docs/musteri-kurulum.md`'de yazılı — soru her müşteride gelecek.

Yordam: `docs/musteri-kurulum.md`. İlgili: [[project_backups]] · [[project_security]] ·
[[reference_theming]] · [[deferred_backlog]]

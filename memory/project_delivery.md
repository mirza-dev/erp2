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

**PWA:** sabit "Roven" kimliği (müşteri logosu uygulama içinde — klasik SaaS).
`public/manifest.webmanifest` · ikonlar `npm run pwa:icons` ile `icon.svg`'den
**sabit renklerle yeniden kurulur** (ham SVG'yi rasterleştirmek yanlış olurdu:
içindeki `prefers-color-scheme` rasterleştirmede uygulanmaz → koyu marka + şeffaf
zemin, koyu launcher'da kaybolur); PNG'ler commit'li. **`public/sw.js` KASTEN APTAL:**
yalnız `/_next/static/` önbelleğe alınır, **API ve navigasyonlar ASLA** — ERP'de bayat
sipariş/stok, olmayan hatadan beterdir. KILL SWITCH yordamı dosyanın başında.
`proxy.ts` matcher'ı `webmanifest|js|png`'yi zaten dışlıyor (auth kapısını atlarlar) —
bu bağ teste kilitlendi, biri listeyi daraltırsa PWA sessizce ölürdü.

**On-premise REDDEDİLDİ:** müşteri sunucusuna kurulum, Next.js'i değil Supabase'in
tamamını (Postgres+GoTrue+Storage+Realtime+PostgREST) self-host etmek demek.
Gerekçe `docs/musteri-kurulum.md`'de yazılı — soru her müşteride gelecek.

Yordam: `docs/musteri-kurulum.md`. İlgili: [[project_backups]] · [[project_security]] ·
[[reference_theming]] · [[deferred_backlog]]

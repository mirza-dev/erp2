# Yeni Müşteri Kurulumu

Bu ürün **tek kiracılıdır** — bir veritabanı = bir firma. Şema bunu sert biçimde
uyguluyor: `company_settings` üzerinde `unique index … ((true))` var, yani ikinci
bir firma satırı fiziksel olarak yazılamaz ve 111 migration'ın hiçbirinde
`tenant_id`/`company_id` kolonu yok.

Dolayısıyla **yeni müşteri = yeni Supabase projesi + yeni deployment.** Bu bir
eksiklik değil, kasıtlı: müşteriler birbirinin verisini teknik olarak göremez.

Maliyet: Supabase Pro **organizasyon başına** $25/ay ve içindeki $10 compute
kredisi ilk projeyi karşılıyor. Bütün müşteri projeleri aynı org'da olursa her
yeni müşterinin marjinal maliyeti **~$10/ay**.

---

## 1. Supabase projesi

Yeni proje, **aynı organizasyonda**, bölge **Frankfurt (`eu-central-1`)**.

> Mevcut canlı proje Tokyo'da (`ap-northeast-1`) — Türkiye'den her istek dünyayı
> dolaşıyor. Supabase bölgeyi yerinde değiştirmiyor; yeni projeler Frankfurt'ta
> açılmalı. Müşteri verisinin AB'de durması KVKK tarafını da rahatlatır.

## 2. Şema

```bash
npm run schema:bundle
```

`supabase/schema-bundle/` altında 5 parça üretir. Studio → SQL Editor'e
**sırayla** yapıştırın; her parçadan sonra hata olmadığını görün.

Son parçanın sonundaki doğrulama sorgusu tek satır döndürür:

| tablo | rls_acik | kova |
|---|---|---|
| 64 | 64 | 6 |

**`tablo` ile `rls_acik` eşit olmalı.** Eşit değilse RLS'siz bir tablo var demektir
ve o tablo tarayıcıdaki anon anahtarıyla okunabilir — kurulumu durdurun.

### Sektör kontrolü

`057_seed_product_types.sql` **vana/fitting sektörüne özel** 8 ürün tipi basar
(Vana, Conta, Flans, Fitting, Bağlantı Elemanı, Enstrüman, Sızdırmazlık
Malzemesi, Diğer — `is_system: true`). PMT için doğru. **Farklı sektörden bir
müşteride bunlar değiştirilmeli.** Ürün tipi sistemi dinamik olduğu için engel
değil: Ayarlar'dan yenileri eklenip bunlar pasife alınabilir.

## 3. İlk admin

```bash
npm run create-admin
npm run preflight:auth     # 0 kalıcı admin → exit 1 = BRICK
```

`preflight:auth` **exit 1 verirse devam etmeyin.** Kalıcı admin yoksa kullanıcı
yönetimine kimse erişemez ve sistem kurtarılamaz hale gelir.

## 4. Deployment

Coolify'da yeni deployment + alt alan adı: `<musteri>.<sizin-domain>`. Özel domain
yerine alt alan adı hem ucuz hem sertifika yönetimi basit.

Ortam değişkenleri: [`deploy-env-matrix.md`](deploy-env-matrix.md) **satır satır**.
Özellikle sessizce kapanan özellikler (§2) — `EMAIL_FROM` yoksa bildirimler
`notification_outbox`'ta birikir ve müşteri hiçbir uyarı almaz, ama deploy
başarılı görünür.

`next.config.ts` zaten `output: "standalone"` — Docker imajı minimal çıkar.

## 5. İlk yedek

```bash
npm run backup
```

Müşteri verisi girmeye başlamadan önce **bir kere**, sonra haftalık ve her
migration/toplu içe aktarım öncesi. Free planda Supabase'in geri alma imkânı yok;
Pro'da bile Storage yedeğe girmiyor. Yordam: [`backup-restore.md`](backup-restore.md).

## 6. Müşteri verisi

**Veri Aktarım Merkezi** üzerinden — 5 adımlı kurulum aracı olarak tasarlandı
(ürünler, cariler, tedarikçiler, stok). Ayrı bir onboarding akışı yazmaya gerek yok.

## 7. Geliştirme ortamı

Aynı yordamla bir de **dev projesi** kurun. Kurulduktan sonra `.env.local`'ı ona
çevirin — `npm run dev` ve E2E artık canlıya bağlanamaz
([`env-target.ts`](../src/lib/env-target.ts) kapısı). E2E'nin tekrar çalışması için
dev projesinde `E2E_USER_EMAIL` kullanıcısının açılması gerekir.

Canlıya bilerek bağlanmanız gerekirse: `ALLOW_PROD_TARGET=1 npm run dev`.

---

## Neden on-premise değil

"Veri bizde dursun" talebi gelecek. Cevap: bu mimaride müşterinin sunucusuna
kurulum, Next.js uygulamasını değil **Supabase'in tamamını** (Postgres, GoTrue
auth, Storage, Realtime, PostgREST) self-host etmek demektir. Bunun karşılığında:

- Postgres sürüm yükseltmeleri, yedek ve izleme müşterinin sahasında sizin işiniz olur
- Güncelleme kontrolünü kaybedersiniz — her müşteri farklı sürümde kalır
- Destek uzaktan çözülemez hale gelir

Ayrı Supabase projesi zaten **veritabanı düzeyinde izolasyon** veriyor: müşteriler
birbirinin verisine erişemez. Talep bundan fazlasıysa, ayrı ve yüksek bir fiyatla
konuşulmalı; standart teklifin parçası olmamalı.

## PWA — "uygulama" olarak kullanma

Müşteri linki tarayıcıda açıp **"Ana ekrana ekle"** derse uygulama ikonla,
tarayıcı çubuğu olmadan açılır. Kurulum, mağaza ve güncelleme yükü yok — güncelleme
siz deploy ettiğiniz an geçer.

İkon ve isim **her müşteride "Roven"**; müşterinin kendi logosu uygulama içinde
(Ayarlar → Firma) görünür. Klasik SaaS davranışı.

Service worker kasten yalnız `/_next/static/` önbelleğe alır; **API yanıtları ve
sayfa gezinmeleri asla önbelleğe alınmaz** — bir ERP bayat sipariş veya stok
gösteremez. Sorun çıkarsa kurtarma yordamı [`../public/sw.js`](../public/sw.js)
başındaki "KILL SWITCH" bölümünde.

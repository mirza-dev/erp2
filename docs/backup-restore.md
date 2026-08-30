# Yedekleme ve Geri Yükleme

## Neden bu dosya var

Proje **Supabase Free planında.** Supabase Free'de **otomatik yedek yoktur** —
günlük yedekler yalnız Pro (7 gün), Team (14) ve Enterprise (30) planlarında; PITR
her planda ayrı ücretli eklenti. Yani bugün veritabanının tek kopyası var.

Ücretli plana geçilse bile bir katman yedeğe **hiç** girmiyor. Supabase'in kendi
belgesinden, kelimesi kelimesine:

> "Database backups do not include objects you store via the Storage API, as the
> database only includes metadata about these objects."

DB'deki satır dosyanın yalnız **adresini** tutar. Storage silinirse veritabanı
geri yüklenir ama teklif arşiv PDF'leri, ürün ekleri ve firma dosyaları
"var sanılan" satırlar olarak döner. Ölçüm (2026-08-30): **76 obje / 47,4 MB.**

Kaynak: [`audit/2026-08-30-supabase-yedek-dogrulamasi.md`](audit/2026-08-30-supabase-yedek-dogrulamasi.md)

## Ne yedeklenir, ne yedeklenmez

| Katman | Nerede | `npm run backup` | Not |
|---|---|---|---|
| **Şema** (tablo, RPC, RLS, trigger) | `supabase/migrations/` — git'te | — | Zaten sürüm kontrolünde; yedeğe gerek yok, sırayla uygulanır |
| **Veri** (64 tablo) | yalnız Supabase | ✅ `tables/*.ndjson` | Satır başına bir JSON nesnesi |
| **Hesaplar** | yalnız Supabase | ⚠️ `auth/users.ndjson` | Kimlik + rol korunur, **parola hash'i YOK** (aşağı bak) |
| **Dosyalar** (6 kova) | yalnız Supabase | ✅ `storage/<kova>/<yol>` | Supabase yedeği bunları **hiçbir planda** kapsamaz |
| **Ortam değişkenleri** | `.env.local` / Coolify | ❌ | Sır içerir, kasada durmalı — [`deploy-env-matrix.md`](deploy-env-matrix.md) |

## Yedek alma

```bash
npm run backup                                  # → backups/<zaman-damgası>/
npm run backup -- --out /Volumes/yedek/erp2     # dış diske
npm run backup -- --no-storage                  # yalnız veri (hızlı)
```

Süre ~3–4 dakika: proje Tokyo'da (`ap-northeast-1`), istekler ardışık.

Script kaynağa **hiç yazmaz**. Her tablonun satır sayısını önce `count=exact` ile
ölçer, sonra dosyanın satır sayısıyla karşılaştırır; tutmazsa **exit 1** ve
"bu yedek EKSİK" der. Sessizce yarım yedek üretemez.

**`backups/` `.gitignore`'dadır ve öyle kalmalı** — içinde müşteri listesi,
alış/satış fiyatları ve `parasut_oauth_tokens` var. Şifreli bir dış diske veya
kasaya kopyalayın; repoya, Drive'a, Slack'e değil.

### Sıklık

Bu ERP'de günde bir avuç işlem oluyor (1.236 satır / ~3 ay). Haftada bir yedek
makul; **fatura kesimi, toplu içe aktarım veya migration uygulaması öncesinde
mutlaka bir kere.** Free planda geri alma imkânı olmadığı için migration öncesi
yedek pazarlık konusu değil.

## Yedeğin sağlamlığını okuma

`manifest.json` içinde:

- `totals` — tablo/satır/hesap/obje sayıları ve byte
- `tables.<ad>.sha256` — dosyanın özeti; iki yedeği karşılaştırmak için
- `tables.<ad>.orderedBy` — sayfalamanın hangi kolona göre sıralandığı
- `restoreOrder` — FK'leri bozmayan geri yükleme sırası
- `errors` — **boş olmalı.** Doluysa yedek eksiktir, tekrar koşun

`restoreOrder` migration'ların tablo yaratma sırasından türetilir: bir tabloya FK
verebilmek için hedefin önce var olması gerekir, dolayısıyla yaratma sırası
geçerli bir topolojik sıradır.

## Geri yükleme

> Bu yordam **canlıya yazar.** Önce boş bir Supabase projesinde prova edin.
> Bir kere prova edilmemiş yedek, yedek değil hipotezdir.

### 0. Şema

`supabase/migrations/*.sql` dosyalarını **numara sırasıyla** Studio SQL editor'den
uygulayın (bu projede migration'lar hep böyle uygulanıyor). Ardından:

```bash
npx tsx scripts/check-migrations.ts   # nesne drift'i
```
ve `audit/manual-migration-checks.sql` — RLS/grant satırları OpenAPI'de görünmez,
elle koşulmalı.

### 1. Hesaplar — tablolardan ÖNCE

13 kolon `auth.users(id)`'ye FK veriyor (`created_by`, `owner_id`, `assigned_to`,
`uploaded_by`, `actor_user_id`, `resolved_by`, `reviewed_by`, `user_id`…), biri
`not null … on delete cascade`. Kullanıcılar yoksa tablo yüklemesi FK'den patlar.

`auth/users.ndjson`'daki her kayıt için `POST /auth/v1/admin/users` — **`id`,
`email` ve `app_metadata.roles` aynen korunmalı**, yoksa RBAC dağılımı ve tüm
`created_by` referansları kırılır.

> **Parolalar geri gelmez.** Admin API parola hash'i döndürmez, dolayısıyla yedekte
> yoktur. Kullanıcılar parola sıfırlama ile girer. Bu bir eksiklik değil, Supabase
> Admin API'sinin sınırı — ama geri yükleme gününde sürpriz olmaması için burada.

Sonra `npm run preflight:auth` — **0 kalıcı admin çıkarsa sistem brick'tir.**

### 2. Tablolar — `restoreOrder` sırasıyla

Her `tables/<ad>.ndjson` için, 500'lük gruplar halinde:

```
POST /rest/v1/<tablo>
  apikey / Authorization: service_role
  Content-Type: application/json
  Prefer: resolution=merge-duplicates      # idempotent — yarıda kalırsa tekrar koşulabilir
  gövde: [ …500 satır… ]
```

Sıraya uyun; `restoreOrder` dışına çıkmak FK hatası verir.

**Tetiklenen trigger'lar** (şemada doğrulandı, 2026-08-30):

- `updated_at` trigger'larının hepsi **BEFORE UPDATE** — INSERT'te ateşlenmez,
  orijinal zaman damgaları korunur. ✅
- `trg_pol_line_total` **BEFORE INSERT**'te de ateşlenir: `purchase_order_lines`
  satırının `line_total`'ını `quantity/unit_price/discount_pct`'ten yeniden hesaplar.
  Aynı girdiden aynı sonuç çıkar; ama geçmişte elle farklı yazılmış bir `line_total`
  varsa geri yüklemede **sessizce düzeltilir**.
- `trg_pol_after_change` **AFTER INSERT**: `purchase_orders` başlık toplamlarını
  yeniden hesaplar. `purchase_orders` satırlarda önce yüklendiği için toplamları
  satır yüklemesi **üzerine yazar**. Geri yükleme sonunda PO toplamlarını
  manifest'teki değerlerle karşılaştırın.

### 3. Dosyalar

`storage/<kova>/<yol>` ağacını olduğu gibi geri yükleyin:

```
POST /storage/v1/object/<kova>/<yol>
```

Kovaları önce yaratın ve **public/private ayarını manifest'teki `storage.<kova>.public`
değerine göre verin** — `product-files`, `quote-pdfs`, `company-files`, `rfq-pdfs`
private; `company-assets` ve `user-avatars` public. Private bir kovayı yanlışlıkla
public açmak, kapatılmış olan 7 numaralı denetim maddesini geri açar.

### 4. Doğrulama

```bash
npm run backup -- --out /tmp/dogrulama --no-storage
```
Yeni manifest'in `totals.rows` ve tablo bazlı satır sayıları, geri yüklediğiniz
yedeğinkiyle **birebir** olmalı. Ardından `npm run smoke`.

## Bilinen sınırlar

- **Parola hash'leri yedekte yok** (Admin API döndürmüyor) → sıfırlama gerekir.
- **Ortam değişkenleri yedekte yok** — bilinçli; sır içeriyorlar.
- Yedek **anlık tutarlı değil**: tablolar sırayla okunur, arada yazma olursa satır
  sayısı kontrolü bunu hata olarak bildirir (tekrar koşun). Sistem kullanımdayken
  değil, gün sonunda alın.
- Free planda **PITR yok**: kayıp penceresi son yedekten bu yanadır.

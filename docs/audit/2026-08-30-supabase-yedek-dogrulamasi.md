# Supabase Yedek Doğrulaması

**Tarih:** 2026-08-30 · **Yöntem:** canlı `erp2` projesine salt-okunur envanter +
Supabase belgesinin birincil kaynaktan okunması
**Sonuç:** **Yedek yoktu.** İki ayrı katmanda, iki ayrı sebeple.

Bu, [10 maddelik güvenlik denetiminin](2026-08-30-vibecode-guvenlik-denetimi.md)
kapsamı dışında bırakılıp "deploy öncesi bakılmalı" diye not düşülen maddeydi.

---

## Ölçüm

| Katman | Nerede duruyor | Yedeği | Ölçüm |
|---|---|---|---|
| Şema | `supabase/migrations/` (git) | ✅ Sürüm kontrolünde | 111 migration; RLS kapsaması tam (65/65) |
| Veri | yalnız Supabase | ❌ Yok | 64 tablo / **1.238 satır** |
| Hesaplar | yalnız Supabase | ❌ Yok | **8 kullanıcı** — 3 admin, 5 rol |
| Dosyalar | yalnız Supabase Storage | ❌ Yok | 6 kova / **76 obje / 47,38 MB** |

Proje: `erp2` · `ryvxpolvhvsycuqyphoa` · `aws-1-ap-northeast-1` (Tokyo) · PG 17.6.1.084

## İki ayrı sebep

**1. Plan.** Proje **Free planda.** Supabase Free'de otomatik yedek yoktur;
günlük yedekler Pro (7 gün) / Team (14) / Enterprise (30) planlarına özel, PITR
her planda ayrı ücretli eklenti. Belge Free kullanıcılarına doğrudan
"CLI `db dump` ile düzenli export alın ve dış yedek tutun" diyor.

**2. Storage — plandan bağımsız.** Supabase belgesinin birebir ifadesi:

> "Database backups do not include objects you store via the Storage API, as the
> database only includes metadata about these objects."

Yani ücretli plana geçilse **bile** 47 MB dosya yedeğe girmez. DB'deki satır
dosyanın yalnız adresini tutuyor.

**Çapraz kontrol (bugün veri tutarlı):** DB'den storage'a **kırık referans yok (0)** —
`quote_pdf_archives` (7), `product_attachments` (5), `company_files` (4) satırlarının
işaret ettiği her dosya yerinde. Yani kayıp yaşanmadı; risk gelecekte. Storage
silinse DB restore, dosyaların **var olduğunu iddia eden** satırlarla geri döner.

*Yan gözlem (yedek konusu değil):* kovalarda DB'nin işaret etmediği ~50 obje var,
12'si `quotes/<id>/rN.html` — teklif arşivinin ara HTML çıktıları. Ayrı hijyen konusu.

## Ne yapıldı

`npm run backup` (`scripts/backup.ts`) — kaynağa salt-okunur, yalnız yerel diske yazar:

- 64 tablo → `tables/*.ndjson`, PostgREST birincil anahtarına göre **sıralı** sayfalama
  (ORDER BY'sız `Range` satır kaçırır/yineler)
- `auth/users.ndjson` — kimlik + `app_metadata.roles` korunur, **parola hash'i yok**
  (Admin API döndürmüyor; geri yüklemede sıfırlama gerekir — runbook'ta uyarı)
- `storage/<kova>/<yol>` — 76 objenin birebir kopyası
- `manifest.json` — sayı/SHA-256 + **`restoreOrder`**: migration'ların tablo yaratma
  sırası, FK'yi bozmayan geçerli bir topolojik sıradır (hedef tablo FK'den önce var olmalı)

**Yarım yedek exit 0 dönemez:** her tablonun satır sayısı önce `count=exact` ile
ölçülüp dosyanın satır sayısıyla karşılaştırılıyor; tutmazsa exit 1.

İlk koşum doğrulandı: **64 tablo · 1.238 satır · 8 hesap · 76 obje · 47,38 MB ·
`errors: []` · 64/64 tablo `restoreOrder`'da · sıralama kolonu bulunamayan tablo 0.**

Geri yükleme yordamı: [`../backup-restore.md`](../backup-restore.md) — şemadan sonra
**önce hesaplar** (13 kolon `auth.users(id)`'ye FK veriyor, biri `not null cascade`),
sonra `restoreOrder` sırasıyla tablolar, sonra dosyalar. Şemadan doğrulanan trigger
yan etkileri de orada (`trg_pol_line_total` INSERT'te `line_total`'ı yeniden hesaplar;
`trg_pol_after_change` PO başlık toplamlarını satır yüklemesinde üzerine yazar;
`updated_at` trigger'ları BEFORE UPDATE olduğu için INSERT'i etkilemez).

## Kalıcı kapılar

`src/__tests__/backup-script.test.ts` — üç invaryant, üçü de kırmızı-yandığı
kanıtlanarak eklendi:

1. **`backups/` `.gitignore`'da.** İçinde müşteri listesi, alış/satış fiyatları ve
   `parasut_oauth_tokens` var; public repo'ya sızması yedeğin kendisinden beter olur.
2. **Script kaynağa yazmaz.** Her yazma-metotlu `fetch`'in hedefi
   `storage/v1/object/list` (bir listeleme çağrısı) olmak zorunda.
3. **Satır sayısı doğrulaması yerinde.** Kaldırılırsa yarım yedek sessizce yeşil döner —
   aynı gün RLS gate'inde yaşanan "yeşil ama işlevsiz" sınıfının tekrarı.

## Açık kalan — kullanıcı tarafı

- **Yedek dışarı çıkarılmalı.** `backups/` aynı diskte duruyor; disk arızası ikisini
  birden götürür. Şifreli dış disk veya kasa.
- **Sıklık.** Haftada bir; **migration uygulaması, toplu içe aktarım ve fatura kesimi
  öncesi mutlaka.** Free planda geri alma yok.
- **Geri yükleme provası yapılmadı.** Prova edilmemiş yedek, yedek değil hipotezdir —
  boş bir Supabase projesinde bir kere denenmeli. Bu doğrulamanın kapsamı yedeğin
  ALINABİLDİĞİ ve EKSİKSİZ olduğuydu; geri YÜKLENEBİLDİĞİ değil.
- **Pro planı değerlendirilmeli** — günlük yedek + PITR, storage açığını kapatmasa da
  veri tarafındaki kayıp penceresini son yedekten saniyelere indirir.

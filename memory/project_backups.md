---
name: project_backups
description: Supabase yedekleme durumu — Free planda otomatik yedek YOK, Storage hiçbir planda DB yedeğine girmiyor; npm run backup aracı ve geri yükleme runbook'u
metadata:
  type: project
---

**2026-08-30 doğrulaması: yedek YOKTU.** İki ayrı katmanda, iki ayrı sebeple.

**1. Plan.** Proje Supabase **Free planında** → otomatik yedek hiç yok. Günlük
yedekler Pro (7 gün) / Team (14) / Enterprise (30); PITR her planda ayrı ücretli.

**2. Storage — plandan BAĞIMSIZ.** Supabase belgesi birebir: *"Database backups do
not include objects you store via the Storage API, as the database only includes
metadata about these objects."* Ücretli plana geçilse bile 6 kovadaki dosyalar
yedeğe girmez; DB satırı yalnız dosyanın adresini tutar.

**Ölçüm (2026-08-30):** 64 tablo / 1.238 satır · 8 hesap (3 admin) · 76 obje /
47,38 MB · proje `erp2`/`ryvxpolvhvsycuqyphoa`, Tokyo `ap-northeast-1`, PG 17.6.1.084.
DB→storage kırık referans **0** (kayıp yaşanmamış; risk gelecekte).

**Kapatıldı:** `npm run backup` (`scripts/backup.ts`) — kaynağa salt-okunur, yalnız
yerel diske. Tablolar NDJSON (PostgREST **PK'ya göre sıralı** sayfalama — ORDER BY'sız
`Range` satır kaçırır), `auth/users.ndjson`, `storage/<kova>/<yol>`, `manifest.json`.
Manifest'te `restoreOrder` var: **migration'ların tablo yaratma sırası geçerli bir
topolojik sıradır** (FK hedefi önce var olmalı). Her tablo `count=exact` ile ölçülüp
dosya satır sayısıyla karşılaştırılır → **yarım yedek exit 0 dönemez.**

**Geri yükleme sırası** (`docs/backup-restore.md`): şema (migration'lar) → **ÖNCE
hesaplar** (13 kolon `auth.users(id)`'ye FK veriyor, biri `not null cascade`) →
`restoreOrder` sırasıyla tablolar → dosyalar. Şemadan doğrulanan trigger yan etkileri:
`trg_pol_line_total` INSERT'te `line_total`'ı yeniden hesaplar; `trg_pol_after_change`
PO başlık toplamlarını satır yüklemesinde üzerine yazar; `updated_at` trigger'ları
BEFORE UPDATE → INSERT'i etkilemez.

**Sınır:** `auth/users.ndjson` **parola hash'i içermez** (Admin API döndürmüyor) →
geri yüklemede sıfırlama gerekir. Kimlik + `app_metadata.roles` korunur.

**Kalıcı kapı:** `src/__tests__/backup-script.test.ts` — 3 invaryant, üçü de
kırmızı-yandığı kanıtlanarak eklendi: `backups/` .gitignore'da (müşteri verisi +
`parasut_oauth_tokens`) · script kaynağa yazmaz · satır sayısı doğrulaması yerinde.

**AÇIK (kullanıcı tarafı):** yedek dış diske/kasaya çıkarılmalı (şu an aynı diskte) ·
haftalık + migration/toplu-import/fatura öncesi koşum · **geri yükleme provası
yapılmadı** (prova edilmemiş yedek hipotezdir) · Pro planı değerlendirilmeli.

Rapor: `docs/audit/2026-08-30-supabase-yedek-dogrulamasi.md`. İlgili:
[[project_security]] · [[deferred_backlog]] · [[reference_worktree_branches]]

**2026-09-05 — GERİ YÜKLEME PROVA EDİLDİ (ilk kez), #11 kapandı.** Yerel dev DB
yedeklendi → `supabase db reset --local` (111 migration sıfırdan) → **tek geçişte**
geri yüklendi: **64/64 tablo · 952 satır · 1 hesap · 13/13 obje · 0 hata**;
ardından `preflight:auth` ✅, `check:chains` ✅ (tek kopukluk yedekte de vardı),
**94/94 E2E** geri yüklenmiş DB'ye karşı yeşil. YENİ `scripts/restore.ts`
(`npm run restore`, kuru çalışma varsayılan; canlıda `ALLOW_PROD_TARGET=1`;
`manifest.errors` doluysa REDDEDER).

**Prova DÖRT gerçek kusur çıkardı — hepsi yordamın kâğıt üstünde doğru görünen
kısımlarındaydı:**
1. **`restoreOrder` YANLIŞ ÜRETİLİYORDU.** Belgedeki gerekçe — "yaratma sırası
   geçerli topolojik sıradır, çünkü FK için hedef önce var olmalı" — **yanlış**:
   FK sonradan `ALTER TABLE` ile eklenebiliyor. `purchase_commitments` (mig.020)
   ↔ `purchase_order_lines` (mig.049), FK mig.050 → sıra ters, 23503. Artık sıra
   **canlı FK grafiğinden** (PostgREST OpenAPI `<fk table=…/>`) topolojik olarak
   üretiliyor + `restoreOrderCycles`.
2. **`company_settings` tekil satırı** migration'da tohumlanıyor → 23505 →
   **firma profili hiç geri gelmiyordu.**
3. **`product_type_fields`** ikincil unique kısıtta çakışıyor (merge-duplicates
   yalnız PK'dan çözer) → 68 satır yüklenmiyordu.
4. **Yedek obje içerik TÜRÜNÜ saklamıyordu** → `quote-pdfs` (allowlist yalnız
   `text/html`) teklif arşivlerini HTTP 400 ile reddediyordu. İnceliği: tür ilk
   düzeltmede indirme yanıtının BAŞLIĞINDAN alındı ve yine olmadı — **Supabase
   Storage HTML'i stored-XSS'e karşı `text/plain` SERVİS EDER**, başlık saklanan
   türü söylemez. Doğru kaynak obje listesindeki `metadata.mimetype`.

**Geri yüklemenin değiştirdiği TEK şey `updated_at`:** kaynak ↔ sonuç SHA-256
karşılaştırmasında **60/64 tablo birebir**; farklı dördünde (`note_templates`,
`product_types`, `product_type_fields`, `purchase_orders`) yalnız `updated_at`
kaymış. Sebep: bu yollarda INSERT değil UPDATE yapılıyor (tohum satırları +
`trg_pol_after_change`) ve `updated_at` trigger'ları BEFORE UPDATE.

Kapı: `backup-script.test.ts` 6 → 10 test, **5/5 kırmızı kanıtlı**.

## 2026-09-11 — Yedek DOĞRULANIYOR (dış inceleme #3 · #8)

**#3 — geri yükleme manifest özetlerini HİÇ okumuyordu.** `backup.ts`
2026-08-30'dan beri her tablo için SHA-256 yazıyor; `restore.ts` alanı tipinde
tanıyor ama hiç karşılaştırmıyordu. Tek kontrol, işlem BİTTİKTEN sonraki satır
sayısıydı → bozulmuş bir yedek, satır sayısı tuttuğu sürece "başarılı" geri
yüklenebiliyordu. **En sessiz nokta:** manifestte olup diskte olmayan dosya
`ndjson()` tarafından `[]` dönüyor, yani **boş tablo** sayılıyordu — felaket
anında o tablonun verisi "silinmiş" görünür ve hiçbir hata üretilmezdi.

YENİ `verifyBackup()`: hedefe **tek bayt yazılmadan önce**, tümü-ya-hiç, kuru
çalışmada da koşar. Storage tarafında özet hiç yoktu → `backup.ts` artık obje
başına üretiyor; 2026-09-11 öncesi yedekler reddedilmez ama "bütünlük
DOĞRULANMADI" diye rapor edilir.

Sentetik yedekle 5 senaryo ölçüldü: sağlam ✓ · tek bayt bozuldu ❌ · dosya
silindi ❌ ("1 satır kaybı") · storage objesi bozuldu ❌ · eski yedek → kabul +
uyarı.

**#8 — belge yanıltıcıydı, kod değil.** REST üzerinden atomik snapshot MÜMKÜN
DEĞİL. `docs/backup-restore.md` *"arada yazma olursa satır sayısı kontrolü
bunu hata olarak bildirir"* diyordu; artık neyin yakalandığını **ve neyin
yakalanmadığını** sayıyor: ❌ UPDATE'ler · ❌ eşit sayıda DELETE+INSERT ·
❌ tablolar arası FK tutarsızlığı. **"0 hata" = "sayıyı değiştiren yazma
görmedim", "tutarlı bir an yakaladım" DEĞİL.** Gerçek çözüm Pro planda PITR ya
da `pg_dump` → kullanıcı-tarafı madde.

Kapı: `backup-script` 10 → 16 test; yalnız "doğrulama var mı" demiyor, SIRAYI
(`verifyBackup` ilk yazmadan ÖNCE) ve iki tarafın AYNI özet gövdesini
kullandığını da kilitliyor.

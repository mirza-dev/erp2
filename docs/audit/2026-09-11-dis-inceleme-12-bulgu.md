# Dış inceleme raporu — 12 bulgunun doğrulanması ve kapatılması

**Tarih:** 2026-09-11 · **Sonuç:** GREEN · **Migration:** YOK
**Commit zinciri:** `9f4c29a` → `36aa82d` → `c205a9a` → `9301585` → `09a48f7` → `ee87276`

---

## 1. Bağlam

Kullanıcı dışarıdan bir kod-inceleme raporu paylaştı. Rapor 15 Ağustos – 5 Eylül
2026 aralığında `origin/main`'deki 69 Claude-ilişkili commit'i taramış (~525
dosya, +50.277 / −5.767 satır), 12 bulgu çıkarmış, **kod değiştirmemiş**.
Kullanıcının isteği tek kelimeydi: **"incele"**.

`user_review_workflow`in kuralı burada belirleyici: **önce doğrula, sonra
düzelt.** On iki bulgunun hepsi kaynağa karşı tek tek okundu; ancak ondan sonra
kapsam kararları soruldu ve düzeltmeye geçildi.

> **Rapor hangi ağaçta koşmuş?** Kendi doğrulama çıktısı "498 test dosyası /
> 6.948 test" diyor; bu turun başındaki taban **502 / 7026**'ydı. Yani inceleme
> daha eski bir ağaçta koşmuş. Atıf verdiği satır numaraları yine de bugünkü
> ağaçta tutuyor — hepsi teker teker doğrulandı.

---

## 2. Doğrulama sonucu — 12/12 GERÇEK

| # | İddia | Yerinde doğrulama | Hüküm |
|---|---|---|---|
| 1 | `dialog-a11y` odak effect'i `onClose` bağımlılığında | `:94` `[onClose, dialogRef]`. Dosyanın KENDİ yorumu (`:42`) `dismissible`ı tam bu sebeple ref'e almış, `onClose` atlanmış | **DOĞRULANDI · CANLI** |
| 2 | Parola politikası istemciden aşılabiliyor | `sifre-yenile/page.tsx:72` doğrudan `auth.updateUser` — tarayıcıdan. ⚠️ **delil yanlış** (§3) | **DOĞRULANDI** |
| 3 | Restore manifest SHA-256'yı hiç doğrulamıyor | `backup.ts:205` yazıyor; `restore.ts` tipinde tanıyor, **hiç okumuyor**; tek kontrol satır sayısı | **DOĞRULANDI** |
| 4 | Stok mutabakatı ilk 100'den sonrasını görmüyor | `:116-121` — `.order()` yok, `.limit(100)` var, imleç yok | **DOĞRULANDI · bugün ÖLÜ** |
| 5 | Tahsilat kuyruğu hata verenle kilitleniyor | `:108` sıra doğru, `:168` hata kolu `checked_at` **yazmıyor** → kalıcı `null` | **DOĞRULANDI · bugün ÖLÜ** |
| 6 | Realtime kapsamı ilan edilenle uyuşmuyor | 9 alan ilan, **5 alan / 7 dosya** yayın, hepsi koleksiyon POST'unda | **DOĞRULANDI** |
| 7 | Parola audit kayıtları sessizce kaybolabiliyor | `{ error }` çözülmüyor; PostgREST hatayı sonuç nesnesinde döner, `try/catch` görmez | **DOĞRULANDI · rapordan GENİŞ** (§4) |
| 8 | Yedek eşzamanlı-yazma kontrolü yetersiz | Doğru; **ama kodla çözülemez** — belge yanıltıcıydı | **DOĞRULANDI · belge kusuru** |
| 9 | DataTable'da çocuk kontrollerin klavye olayı satıra taşıyor | `:137-142` kaynak denetlenmiyor; `onClick`+`stopPropagation` `keydown`'ı durdurmaz | **DOĞRULANDI · CANLI** |
| 10 | SW önbellek tavanı garanti değil | `sw.js:105` `void trim(cache)` | **DOĞRULANDI** |
| 11 | Telemetri ham mesajı konsola yazıyor | `:89` redakte, `:93` ham | **DOĞRULANDI** |
| 12 | Proxy statik muafiyeti dinamik API yollarını atlatıyor | matcher `.*\.(?:…\|js\|…)$` → `/api/x/foo.js` muaf. ⚠️ yorum fazla iddialı | **DOĞRULANDI · etkisi ~sıfır** |

---

## 3. Raporun iki delil hatası (iddiaları yine de doğruydu)

**#2 — `supabase/config.toml` prod ayarı DEĞİL.** Rapor `enable_signup = true`,
`password_min_length = 6` ve `secure_password_change = false` satırlarını canlı
zayıflık delili olarak gösterdi. O dosyanın başında `project_id = "proje-codex"`
ve `[api] port = 54321` yazıyor: bu, `supabase start` ile ayağa kalkan **yerel
geliştirme** yığınının config'i. Prod projesinin Auth ayarları Supabase
panelinde yaşar ve repodan okunamaz. Raporun kendisi de "prod ayarlarının
repodakiyle aynı olduğu varsayımına dayanıyor" diye hedge etmişti — varsayım
yanlıştı. **Asıl iddia (dördüncü parola yüzeyi istemci-tek) delilden bağımsız
olarak doğruydu** ve düzeltildi. Prod panelindeki iki ayar **kullanıcı-tarafı
madde** olarak açıldı (§9).

**#12 — yorumun kendisi fazla iddialıydı.** `proxy.ts:369` *"Uzantısız her yol
(tüm API route'ları ve sayfalar) artık middleware'den geçer"* diyordu. İki şey
aynı değil: uzantıyla BİTEN dinamik bir API yolu (`/api/x/foo.js`) uzantısız
değildir ve muaf kalıyordu. Fark tam olarak bulgunun kendisiydi; cümle gerçeğe
çekildi.

---

## 4. Sıralamayı değiştiren iki ölçüm

**(a) #4 ve #5 bugün ÖLÜ.** `.env.local`de `PARASUT_ENABLED=` boş; iki servis de
`isParasutEnabled()` ile ilk satırda dönüyor. Rapor ikisini "yüksek" saymıştı;
doğru sıfat **gizil**. Kod olarak kapatıldılar ve go-live runbook'una iki
sayaçlık bir gözlem tablosu eklendi — çünkü belirtileri sessiz ve yalnız
Paraşüt açıkken görülür.

**(b) #9 "orta" değil CANLI.** Ürün listesinde satır checkbox'ında Space'e
basmak hem kutucuğun kendi davranışını `preventDefault` ile iptal ediyor hem de
detay sayfasına savuruyordu. `onRowClick` taşıyan **dokuz liste** etkileniyordu.

**(c) #7 raporun gördüğünden dört kat büyük.** Rapor iki çağrı yerini (parola
yolları) işaret etmişti. Depo tarandı: **28 `audit_log` insert'inin 21'i**
`{ error }` çözmüyordu — 7 dosya. Örneği değil sınıfı kapatmak gerekti; yoksa
"hepsi" diyen bir kapı 19 muafiyetle doğardı.

**(d) #1'in raporda olmayan ikinci tekrarı daha ağır.** Rapor
`NoteTemplatesTab`ı bulmuştu. Aynı sınıf `purchase/orders/[id]:685`te de var ve
orada alan, PO iptalinin **zorunlu gerekçesi**: alan boşken buton kilitli
(`:712`), yani kullanıcı yazamazsa PO'yu hiç iptal edemiyordu.

---

## 5. Ne yapıldı — altı dilim

### Dilim 1 · `#1` diyalog odağı — `9f4c29a`

Düzeltme **tek dosyada**: `onClose` da `dismissible` gibi ref'e alındı, effect
bağımlılığı `[dialogRef]`e indi. 20+ Modal/Drawer tüketicisinin hiçbirine
dokunulmadı; sözleşme değişmedi.

**Mekanizma:** inline `onClose` → her ebeveyn render'ında yeni kimlik → effect
temizlen/yeniden kur → temizlik `previouslyFocused`a döner, kurulum diyalogdaki
İLK odaklanabilir öğeye geçer. Form state'i ebeveynde olan her diyalogda
yazmak imkânsızdı.

**Nötrlük kanıtı:** `modal-ui` (17) + `drawer-ui` (15) = **32 test, dosyalarına
hiç dokunulmadan yeşil** — 2026-09-05'te `dialog-a11y` çıkarılırken kullanılan
kanıtın aynısı.

**TARAYICIDA A/B ÖLÇÜLDÜ** (`NoteTemplatesTab`, gerçek Chromium, tuş tuş yazım
25 ms aralıkla) — kusurun en çıplak hâli:

| | odak (önce) | odak (yazdıktan sonra) | alana giren metin |
|---|---|---|---|
| düzeltme GERİ ALINMIŞ | `Şablon başlığı` | **`Şablon kategorisi`** | **`%`** |
| düzeltme UYGULANMIŞ | `Şablon başlığı` | `Şablon başlığı` | `%50 Avans / %50 Sevk` |

Yani kullanıcı **ilk karakterden sonrasını yazamıyordu**: birinci tuş ebeveyni
render ediyor, effect yeniden kuruluyor, odak `<select>`e atlıyor ve geri kalan
her tuş boşa gidiyordu. Ölçümden sonra dosya SHA-256 ile birebir geri yüklendi.

### Dilim 2 · `#9` `#10` `#11` `#12` — `36aa82d`

| bulgu | düzeltme | yayılım |
|---|---|---|
| #9 | satır klavye handler'ı `e.target === e.currentTarget` ister | **9 liste** tek dosyadan |
| #10 | `void trim(cache)` → `await trim(cache)` | SW tavanı gerçekten uygulanır |
| #11 | konsol ham `message` yerine redakte edileni yazar | 1 satır |
| #12 | matcher'a `(?!api/)` iç lookahead'i | `/api/**` artık uzantıdan bağımsız kapsanır |

**#12 ölçüldü, tahmin edilmedi** — desen 16 örnek yola uygulandı: değişen
**yalnız üç `/api/**` yolu**; `/sw.js`, `/manifest.webmanifest`, `/icon.svg`,
`/apple-icon.png`, `/_next/**`, `/fonts/*.woff2`, `/robots.txt` **hiçbiri**
etkilenmedi → PWA'nın bağlı olduğu muafiyet korundu.

### Dilim 3 · `#2` `#7` — `c205a9a`

YENİ `POST /api/auth/recovery-password`: kurtarma oturumunu cookie'den okur,
`checkPasswordPolicy`'yi **sunucuda** uygular, sonra yazar, audit'i düşer.
Mevcut şifre bilerek istenmez (kurtarmanın tanımı — sayfanın kendi *kayda geçen
kararı*). İstemci aynası kaldı: anında geri bildirim, otorite sunucuda.

21 audit insert'i `{ error }` çözer hâle geldi. **Non-fatal kalır** (mutasyon
gerçekten oldu) ama artık sessiz değil.

### Dilim 4 · `#6` — `9301585`

**Önce:** 9 alan ilan · 5 alan / 7 dosya yayın · hepsi koleksiyon POST'unda.
**Sonra:** **39 dosya · 9/9 alan yayıncılı.**

Çapa `revalidateTag` seçildi — keyfi değil yapısal: sunucu önbelleğinin
tazelendiği nokta, istemci önbelleğinin de tazelenmesi gereken noktadır.

**Döngü tuzağı ölçüldü ve kaçınıldı:** `quotes/expire`de ikinci `revalidateTag`
süresi dolan HER teklif için dönen bir `for`un içinde. Yayın oraya konsaydı 40
teklif 40 sinyal üretir, her istemci 40 kez yeniden çekerdi. Kapı bunu artık
genel olarak yasaklıyor.

### Dilim 5 · `#3` `#8` — `09a48f7`

YENİ `verifyBackup()` — hedefe **tek bayt yazılmadan önce**, tümü-ya-hiç.
Storage tarafında özet hiç yoktu; `backup.ts` artık obje başına üretiyor.

**Sentetik yedekle beş senaryo ölçüldü:**

| senaryo | sonuç |
|---|---|
| sağlam yedek | ✓ exit 0 |
| tek bayt bozuldu | ❌ "SHA-256 TUTMUYOR" · exit 1 · hiçbir şey yazılmadı |
| tablo dosyası silindi | ❌ "manifestte var, DİSKTE YOK (1 satır kaybı)" — **eskiden sessizce boş tablo** |
| storage objesi bozuldu | ❌ exit 1 |
| eski yedek (özetsiz) | kabul + "bütünlük DOĞRULANMADI" uyarısı |

`#8` için düzeltilecek olan koddu değil **belgeydi**: `backup-restore.md` artık
neyin yakalandığını **ve neyin yakalanmadığını** (UPDATE'ler · eşit sayıda
DELETE+INSERT · tablolar arası FK tutarsızlığı) tek tek sayıyor.

### Dilim 6 · `#4` `#5` — `ee87276`

Stok mutabakatı deterministik sayfalamaya geçti (`.order("sku")` + `.range()`),
tavan doldu mu **rapor ediliyor**. Migration YOK — kolon eklemek yerine tam
tarama seçildi.

Tahsilat pollunun hata kolu artık **yalnız** `checked_at` damgalıyor; durum
alanlarına dokunmuyor (bayat durumu "taze" göstermek bilmemekten kötü olurdu).

**Davranışla ölçüldü:** 250 senkronlu üründe `checked` gerçekten **250** (eski
kodda 100). Kırmızı-kanıt mutasyonu doğrudan `.limit(100)`u geri koyuyor.

---

## 6. Kapının bulduğu ÜÇ ek — raporda yoktu

**(a) 13. parola yüzeyi.** "Parolayı yazan her yer" kuralı `seed-runner.ts`i
yakaladı: `/api/seed` **altı gerçek auth hesabını** `SEED_DEMO_PASSWORD`'dan
hiçbir kontrol olmadan yaratıyordu. "En gevşek yüzey kazanır" gereği zayıf bir
env değeri altı hesabı birden zayıflatırdı. Politika oraya da uygulandı;
davranış "env yok" dalının aynısı (uyarı + atla), seed'in geri kalanı sürer.

**(b) Dört sessiz mutasyon route'u.** Realtime kuralı kendi mantığıyla ortaya
çıkardı: `purchase-commitments/[id]` · `product-vendor-links` ·
`import/[batchId]/confirm` · `import/documents/[id]/apply`. Son ikisi en ağırı —
toplu içe aktarım ürün/cari/tedarikçi satırlarını birlikte yazıp hiçbir sekmeye
haber vermiyordu.

**(c) Planımın bir gerekçesi çürüdü.** Ürün ekleri "alan listesinde yok" diye
kapsam dışı bırakılmıştı; ama iki ek route'u `products` etiketini tazeliyor,
yani kuralın kendi mantığına göre yayın yapmalılar. **Muafiyet açılmadı, yayın
eklendi.**

---

## 7. Ölçü aracı dört kez bulgu oldu

1. **Parola kuralının ilk yazımı `seed-runner`ı YANLIŞ sebeple yakaladı** —
   "çağrı var + dosyada `password` geçiyor" diyordu; oradaki `updateUserById`
   yalnız metadata yazıyor. Üstelik gerçek yazıcı olan `createUser` desende
   **hiç yoktu**: yanlışı yakalayıp doğruyu kaçırıyordu. İddia paren derinliği
   sayılarak **çağrının gövdesine** bağlandı (2026-09-04'ün "mesafeye değil
   yapıya bağla" dersi).
2. **"Eksik dosya boş tablo sayılmıyor" kuralı ZAYIFTI — 9. kez "desen
   komşusuna tutundu".** `/manifestte var, DİSKTE YOK/` deseni STORAGE kolunda
   da geçtiği için TABLO kolu tamamen silindiğinde kural yeşil kalıyordu. İki
   kola ayrı ayrı bağlandı ve yeniden kırmızı-kanıtlandı.
3. **`pwa` kapısında kendi yorumuna tutunma tuzağı** (8. kez): `void trim`
   yasağının gerekçe yorumu dosyada `void` kelimesini geçiriyor. `sw` için ayrı
   bir yorumsuz gövde türetildi — ham `sw` **korundu**, çünkü "KILL SWITCH
   yordamı dosyada yazılı" iddiası bilerek yorumu ölçüyor.
4. **`#5`in damga iddiası `catch` bloğunun İÇİNE bağlandı** — başarı kolundaki
   `paymentPatch` zaten `checked_at` yazıyor; kural ona tutunsaydı hata kolu
   silinince yeşil kalırdı.

---

## 8. Üç mevcut kapı yandı, üçü de haklıydı

Hiçbiri gevşetilmedi:

| kapı | ne dedi | ne yapıldı |
|---|---|---|
| `gate/password-reset` HALKA 3 | `updateUser({password})` **sayfada** olmalı | Sözleşme sunucuya taşındı → iddia da taşındı (HALKA 3b). 2026-09-10'da `aging.spec`in `←` okunu `BackLink`e taşırken uygulanan yöntemin aynısı. |
| `gate/route-guard-matrix` | yeni uç guard'sız | baseline'a `self-auth` sınıfı + gerekçe (tasarlanmış akış: karar review'da görünür) |
| `gate/rum-endpoint-allowlist` | yeni uç allowlist'te yok | `known-endpoints` yeniden üretildi |

---

## 9. Kapı — 9 kural ailesi, **hepsi kırmızı-kanıtlı**

| # | kural | ev | mutasyon |
|---|---|---|---|
| K1 | effect bağımlılığında `onClose` olamaz; ref'ten okunur | YENİ `gate/dialog-stability` | 4/4 🔴 |
| K2 | satır klavye handler'ı olay kaynağını denetler | `ui/data-table` (gerçek render) | 2/2 🔴 |
| K3 | her ilan edilen alanın yayıncısı var · domain etiketi tazeleyen yayın yapar · yayın döngüde olamaz | YENİ `gate/realtime-coverage` | 4/4 🔴 |
| K4 | `audit_log` insert'lerinin **hepsi** `{ error }` çözer — muafiyet YOK | `gate/route-error-coverage` | 1/1 🔴 |
| K5 | istemci parola yazamaz · yazan her sunucu yüzeyi politikayı aynı dosyada uygular | `gate/password-policy` | 4/4 🔴 |
| K6 | restore yazmadan ÖNCE hash doğrular · eksik dosya boş sayılmaz · iki taraf aynı özet gövdesi · belge dürüst | `backup-script` | 6/6 🔴 |
| K7 | mutabakat sırasız okumaz · tavan raporlanır · tahsilat hata kolu damgalar | YENİ `gate/parasut-batch-progress` + davranış testi | 7/7 🔴 |
| K8 | SW budaması beklenir | `gate/pwa` | 1/1 🔴 |
| K9 | matcher `/api/` yollarını uzantıdan bağımsız kapsar; statik varlıklar muaf | `gate/pwa` | 2/2 🔴 |

**Toplam 31 mutasyon / 31 kırmızı** (biri ilk turda yeşil kalıp kuralı
güçlendirdi, sonra kırmızı yandı).

Her yeni tarama kuralı **anti-vakum sayacı** taşıyor: ayrıştırıcı çökerse iddia
boş kümeyi denetler ve sahte-yeşil olurdu.

**PLANDAN SAPMA:** `#12`nin kapısı `client-boot` yerine `pwa`ya kondu —
matcher'a dair her iddia zaten orada ve tek bir regex'in değişmezlerini iki
gate dosyasına bölmek drift'in başladığı yerdir.

---

## 10. Kapsam dışı — bilerek, kayıtlı

- **Atomik yedek snapshot'ı** — REST üzerinden imkânsız; Pro planda PITR ya da
  `pg_dump` gerekir. Belge düzeltildi, **kullanıcı-tarafı madde** açıldı.
- **Prod Supabase `password_min_length` / `secure_password_change`** — panel
  ayarı, kodla ölçülemez. **Kullanıcı-tarafı madde.**
- **`originFromRequest` / `ORIGIN_HEADER` ölü** — tanımlı ama hiçbir yerde
  kullanılmıyor; istemci başlığı göndermiyor, hiçbir route yayına origin
  koymuyor. Yani "kendi değişikliğini ikinci kez çekme" optimizasyonu fiilen
  yok. Mevcut CANLI desen izlendi; ölü mekanizmayı 43 çağrı yerine yaymak
  yanlış olurdu. **Ayrı bir turun maddesi.**
- **`quotes/[id]/convert`** — 410 mezar taşı; yayın eklenmedi.
- **`orders/[id]` `quote_valid_until` kolu** — `revalidateTag` çağırmıyor, yani
  yayın da yapmıyor. Bu koldaki eksik, RSC önbelleğinde ZATEN vardı (önceden de
  30 sn bayat kalıyordu); realtime turunun değil önbellek turunun maddesi.
- Migration YOK · RBAC değişikliği YOK · veri yolu değişikliği YOK.

---

## 11. Doğrulama

| kontrol | sonuç |
|---|---|
| `tsc --noEmit` | 0 |
| `npm run lint` | 0 |
| `npm test` | **508 dosya / 7076 test** (taban 502 / 7026) |
| `npm run build` | 0 uyarı · `/api/auth/recovery-password` manifestte |
| E2E (`retries=0`) | **94/94** · 2,4 dk |
| Kırmızı-kanıt | 31/31 |
| Yedek/restore | 5 senaryo ölçüldü (§5, Dilim 5) |
| Paraşüt sayfalama | 250 ürün · `checked=250` ölçüldü |
| Proxy matcher | 16 örnek yol · yalnız 3 `/api/**` değişti |
| Diyalog odağı | tarayıcıda A/B: `%` → `%50 Avans / %50 Sevk` |

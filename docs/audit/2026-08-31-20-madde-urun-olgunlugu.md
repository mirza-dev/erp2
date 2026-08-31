# Lansman öncesi 20 maddelik ürün-olgunluğu listesi — denetim

**Tarih:** 2026-08-31 · **Tetikleyen:** Kullanıcı ikinci bir 20 maddelik liste
paylaştı ("20 things to tell Claude before launching your app") ve
*"tek tek incele, eksik var mı, varsa detaylı ince ince kapatalım"* dedi.

Bir öncekinden farkı: o **güvenlik** listesiydi
([2026-08-31 · 20 madde](2026-08-31-20-madde-liste-denetimi.md)), bu **ürün
olgunluğu** listesi — onboarding, giriş, parola kurtarma, boş/yükleniyor/hata/ağ
durumları, bildirimler, analitik, gizlilik, erişilebilirlik.

**Denetim sonucu: 9 kapalı · 6 kısmi · 4 eksik/kırık · 1 kullanıcı-tarafı.**
Bu turda **4 madde kapatıldı** (#1, #4, #9, #10, #14, #16 — altısı).

**Migration YOK.**

---

## Asıl bulgu — #4 parola sıfırlama tamamen kırıktı

Zincirin her halkası ayrı ayrı ölçüldü:

| Halka | Durum |
|---|---|
| `/login` → `resetPasswordForEmail()` | ✅ çağrılıyordu, e-posta gidiyordu |
| Dönüş adresi | ❌ `${origin}/login` |
| `createBrowserClient` akışı | PKCE → link `?code=` ile döner |
| `/login` `code` işleme | ❌ yalnız `error`/`reason`/`attempted` okunuyordu |
| "Yeni şifre" ekranı | ❌ **hiç yoktu** |
| `api/settings/user/password` | ❌ **mevcut şifreyi** istiyor — unutan kişiye yaramaz |
| `PATCH /api/admin/users/[id]` | ❌ yalnız `{ roles }` — admin de sıfırlayamıyor |

**Net sonuç: şifresini unutan herkes — admin dâhil — kalıcı kilitleniyordu.**
Tek çıkış Supabase Studio'ydu.

Kırıklığın şekli öğretici: **her parça tek başına makul görünüyordu.** Kimse
"parola sıfırlama yok" demezdi — düğme vardı, e-posta gidiyordu, callback
handler'ı vardı, şifre değiştirme ekranı vardı. Kopuk olan **bağlantılardı**.
Kapı testi bu yüzden parçaları değil bağlantıları kilitliyor.

### Çözüm: iki bağımsız yol

**A1 — self-servis.** `redirectTo` artık `/auth/callback?next=/sifre-yenile`.
O handler `exchangeCodeForSession`'ı **zaten yapıyordu**; eksik olan tek şey
nereye bırakacağıydı. YENİ `src/app/sifre-yenile/page.tsx` yeni şifreyi alır ve
`checkPasswordPolicy` ile doğrular (kural tek kaynakta, kopya yok).

`next` bir **açık yönlendirme kolu değil**: `resolveNextPath` serbest path kabul
etmez, küçük bir allowlist'le TAM eşleşme arar; tanınmayan her değer `/dashboard`.
Canlı doğrulandı — `?next=https://kotu.example.com` → `/login?error=oauth`.

**A2 — admin sıfırlama.** `PATCH` gövdesine `{ password }` eklendi:
politika → `updateUserById` → `audit_log` (`password_reset_by_admin`).
Kullanıcılar sayfasına "Şifre sıfırla" eylemi.

Neden ikisi birden: self-servis **e-posta teslimine bağlı**. `EMAIL_FROM` şu an
boş ve Supabase'in yerleşik SMTP'si saatte birkaç mailde tıkanıyor. Tek yol o
olsaydı kurtarma yolu teslim gününde çalışmayabilirdi.

**Yeni yetki yüzeyi açılmadı:** admin bu kullanıcıyı zaten silip yeniden
oluşturabiliyordu.

### Kayda geçen karar

Exchange sonrası kullanıcının **tam oturumu** olur ve teknik olarak şifre
belirlemeden panoya gidebilir. Bu Supabase kurtarma modelinin doğası — linke
sahip olmak, kişinin kendi e-posta kutusuna sahip olması demektir ve kimlik
kanıtı odur. Kapatılmaya çalışılmadı; gizli bir açık değil, yazılı bir karar.

---

## Özet tablo

| # | Madde | Durum | Dayanak |
|---|---|---|---|
| 1 | Onboarding | ✅ **kapatıldı** | Rehber vardı (`buildSetupSteps`, 5 adım) ama **yalnız Veri Aktarım Merkezi'nin içinde**; boş sisteme ilk gireni oraya yönlendiren hiçbir şey yoktu (5 günlük simülasyonda 4 kişiden hiçbiri açmadı). Panoya bant eklendi |
| 2 | Kayıt ve giriş | ✅ | E-posta+parola · Google OAuth · "beni hatırla" · 5/15dk limit · RBAC provizyon. `signUp` bilerek yok (davetiye modeli) |
| 3 | E-posta doğrulama | ✅ N/A | Self-servis kayıt yok; admin `email_confirm: true` ile açıyor |
| 4 | **Parola sıfırlama** | ✅ **kapatıldı** | Yukarıda |
| 5 | Hesap silme | ✅ | `DELETE` + son-admin kilidi (409) + kendini silme engeli. Ticari kayıt izleri bilerek korunuyor → KVKK envanteri §3 |
| 6 | Kullanıcı izinleri | ✅ | 6 rol · method-seviye guard matrisi · finansal redaction |
| 7 | Boş durumlar | ✅ | **Ölçüm düzeltmesi:** 14 DataTable yüzeyinin **hepsinde** boş-durum var — 9'u `emptyMessage`, 5'i tablodan önce koşullu render. İlk grep yalnız `emptyMessage` aradığı için "6 eksik" diyordu; ikinci deseni ıskalamıştı |
| 8 | Yükleniyor durumları | ✅ **kapatıldı** | 5 RSC liste sayfasında `loading.tsx` vardı. Eksik olan: **pano** `data-context`'in `loading`'ini hiç okumuyordu → yüklenirken **sıfır** gösteriyordu ("0 TL ciro" ile "henüz gelmedi" ayırt edilemiyordu); `products` listesi de "Ürün bulunamadı" diyordu. İkisi kapatıldı |
| 9 | Hata durumları | ✅ **kapatıldı** | `not-found.tsx` **yoktu** (404 = Next'in stilsiz varsayılanı), `global-error.tsx` **yoktu** (kök layout hatası hiçbir sınıra ulaşmıyor, Sentry'ye de gitmiyordu). İkisi eklendi |
| 10 | Ağ durumları | ✅ **kapatıldı** | `navigator.onLine` repoda **hiç geçmiyordu**. SW yalnız tam gezinmede `/offline` döndürüyor — ama uygulama SPA, gerçek hâl "fetch reddedildi". Bant + merkezî mesaj eklendi |
| 11 | Veri kalıcılığı | ✅ | Supabase + `npm run backup`. ⚠️ geri yükleme provası hâlâ yapılmadı |
| 12 | Ödeme akışı | ✅ N/A | SaaS faturalama yok; Paraşüt muhasebe entegrasyonu, müşteri ödeme akışı değil |
| 13 | Bildirimler | ⚠️ **env** | Altyapı olgun (outbox + 3 deneme + suppression + tercihler + 11 uyarı tipi). **Canlı ölçüm: 10 kayıt, 10'u da `waiting_config`** — `EMAIL_FROM` boş |
| 14 | Analitik | ✅ **kapatıldı** | Modül kullanım sayacı; mevcut `request_metrics` altyapısı üzerine, üçüncü taraf script YOK |
| 15 | Çökme raporlama | ✅ | Sentry client+server+edge · PII scrub · %10 trace · DSN dolu |
| 16 | Gizlilik | ✅ **kapatıldı** | Aydınlatma metni, gizlilik sayfası, yasal link **yoktu**. `/gizlilik` + `docs/kvkk-veri-envanteri.md` |
| 17 | Erişilebilirlik | ✅ | label/aria · ortak `Modal` (Escape + focus tuzağı) · `role="alert"` · reduced-motion |
| 18 | Duyarlılık | ✅ | 5 profil × 14 ekran taşmasız · 44px dokunma hedefleri · iOS yakınlaştırma kapalı |
| 19 | Kullanıcı akışları | ⚠️ **kilitli** | 13 Playwright spec var ama `pretest:e2e` canlı DB'ye karşı durduruyor |
| 20 | Beta testçiler | ⏳ | PMT pilot haftası |

---

## Diğer kapatılanlar

### #10 — ağ durumları: kural 53 çağrı yerinde değil, TEK huniden

Repoda `toast({ type: "error" })` **53 yerde** çağrılıyor. Her `catch` bloğunu
tek tek düzeltmek hem 53 dokunuş, hem de bir dahaki hata toast'ı yazıldığında
yeniden unutulacak bir kural demekti. Kural `ToastProvider`'a kondu: hata
tonundaki her toast, çevrimdışıyken sebebi mesaja ekler.

**Eklenir, değiştirilmez:** gerçek bir doğrulama hatası çevrimdışıyken de
olabilir; onu gizlemek yerine sebep yanına yazılıyor.

`navigator.onLine` **yalnız `false` yönünde** güvenilir — captive portal veya
kopuk ADSL'de de `true` döner. Bu yüzden mutasyonlar `true` diye serbest
bırakılmıyor, `false` diye bloklanmıyor: sinyal gösteriliyor, karar kullanıcıda.
Bant **kapatılamaz** (`DemoBanner`'dan bilinçli farkı): kapatılabilseydi kullanıcı
bandı kapatır, kopuk hâlde çalışır ve kaydettiğini sandığı işi kaybederdi.

### #14 — modül kullanım sayacı: yeni altyapı değil

Ölçüldü: altyapının **%90'ı hazırdı** — `request_metrics` tablosu, RUM ingest'i,
`normalizeEndpoint` + `SAFE_PATH_RE` (`/dashboard` zaten kabul), 30 günlük
retention, RLS ve **41 `/dashboard/*` yolunun tamamı `KNOWN_ENDPOINTS`'te**.
Eksik olan tek şey `rum-client.ts`'in yalnız `/api/` ölçmesiydi.

**Bedeli ve korunması:** aynı tablo artık iki farklı şey taşıyor. Sayfa
görüntülemeleri birer istek DEĞİL (süre 0, statü hep 200). Performans okuması
onları dışlamazsa **p95 aşağı çekilir, hata oranı suni olarak düşer ve
`errorRateCorroborated` sağlık kararı bozulur** — panel "her şey yolunda" derken
gerçek uçlar yavaşlıyor olabilir. `dbPerformanceSummary` `/api/%` ile sınırlandı,
`dbPageUsageSummary` `/dashboard%` okur. Ayrım tek bir `.like()` filtresi ve
sessizce silinebilir — kapı testi tam olarak onu kilitliyor.

Üçüncü taraf script yok · CSP değişmedi · kişisel veri yok (normalize yol + sayı;
sorgu dizesi `normalizeEndpoint` tarafından zaten düşürülüyor).

### #16 — gizlilik: envanter koddan çıkarıldı

`docs/kvkk-veri-envanteri.md` **canlı şemadan** üretildi (kolon adları okundu,
değerler değil): hangi tabloda hangi kişisel veri, saklama süreleri (telemetri
30 gün, outbox/e-posta denetimi 90 gün — kodda sabit), yurt dışı aktarım
(Supabase Tokyo · Resend · Sentry · Anthropic · Paraşüt) ve madde #5'in
gerekçesi (silinen kullanıcının `audit_log` izleri neden kalıyor).

`/gizlilik` sayfasındaki firma-özel alanlar **görünür `[köşeli parantez]`**
olarak duruyor — uydurulmuş bir ticari unvan yanlış beyandır. Sayfa
`ALWAYS_PUBLIC`'te: aydınlatma metnini giriş yapmamış biri de okuyabilmeli.

### #1 — kurulum bandı

`buildSetupSteps()` zaten export edilmiş saf bir fonksiyondu; bant onu **import
ediyor**, yeniden yazmıyor — iki yüzey ayrışsaydı kullanıcı iki farklı "kaç adım
kaldı" görürdü. Kurulum tamamlanınca bant **kendiliğinden kaybolur**; kalıcı bir
uyarı öğrenilmiş körlük yaratır ve asıl uyarılar da görünmez olur.
`view_import` olmayan rolde (403) **sessiz** — aktarımı yapamayacak kişiye
"kurulumu tamamla" demek anlamsız.

---

## Kapı testleri

| Dosya | Neyi kilitliyor |
|---|---|
| `gate/password-reset.test.ts` (6) | Zincirin **dört halkası** + tek-kaynak yolu + süresi dolmuş link mesajı. Açık yönlendirme reddi davranışsal olarak test ediliyor |
| `gate/error-pages.test.ts` (3) | `not-found` + `global-error`; ikincisi kendi `<html>`/`<body>`'sini kurmalı ve `captureException` çağırmalı |
| `network-state.test.ts` (5) | `describeNetworkError` saf davranışı · `onLine` yalnız `false` yönünde · bant kapatılamaz · kural TEK noktada |
| `gate/page-usage-telemetry.test.ts` (6) | `/api/%` ↔ `/dashboard%` ayrımı · gönderilen yolların allowlist'te olduğu · sorgu dizesinin düşürüldüğü |
| `setup-progress-banner.test.tsx` (6) | Eksikte görünür · tamamda kaybolur · 403'te sessiz · ağ hatasında panoyu bozmaz |

`gate/password-policy.test.ts`'in çağrı-yeri listesi **dörtten altıya** çıktı.

**9/9 kural kırmızı yandığı kanıtlanarak eklendi.**

### Bir kırmızı-kanıt yanmadı ve sebebi testti, kod değil

`global-error`'ın `<html>`'ini `<div>`'e çevirdim — **test yeşil kaldı**. Sebep:
dosyanın **yorumu** da "kendi `<html>`/`<body>`'sini render etmek zorunda" diyor
ve `/<html/` onu yakalıyordu. Yani test kodu değil kendi açıklamasını
doğruluyordu. Yorum soyucu eklendi, kural sertleştirildi, kırmızı kanıtı
tekrarlandı. (Aynı sınıf hata 2026-08-31 dokunma-hedefi turunda iki kez çıkmıştı
— kaynak-iddiası testlerinin tekrarlayan tuzağı budur.)

---

## Doğrulama

`tsc` 0 · `lint` 0 · **492 dosya / 6873 test** · `build` 0 · migration yok.

Canlı (prod build, `:3111`):

| Kontrol | Sonuç |
|---|---|
| `/gizlilik` oturumsuz | **200** + başlık |
| `/sifre-yenile` oturumsuz | **307 → /login** (kapının arkasında, doğru) |
| `?next=https://kotu.example.com` | **`/login?error=oauth`** — allowlist tuttu |
| `?next=/sifre-yenile` (kod yok) | **`/login?error=recovery`** — mesaj ayrışıyor |
| 404 içeriği | `_not-found.html` içinde "Sayfa bulunamadı" + "Panoya dön" |

**404 hakkında bir not:** bilinmeyen `/dashboard/*` yolları admin dışı rollerde
`?forbidden=` ile geri çevriliyor — bu `canAccessPath`'in **kasıtlı fail-closed**
davranışı (matriste olmayan yeni hassas sayfa sessizce açık kalmasın). 404 sayfası
admin ve dashboard dışı yollarda görünür.

---

## React Doctor — üç bulgu, üçü de gerçekti

Önceki üç turda "staged regressions" uyarısı **yanlış alarmdı**; bu sefer
ölçünce **değildi**. HEAD~1'de geçici bir worktree açıp aynı komut koşuldu:

| | temel (`36e53de`) | ilk hâl | düzeltme sonrası |
|---|---|---|---|
| hata | 87 | 91 | 91 |
| uyarı | 564 | **568** | **565** |

**İki bulgu düzeltildi:** `/gizlilik` linklerini ham `<a>` ile yazmıştım
(`login/page.tsx`, `page.tsx`) — Next içi gezinmede tam sayfa yeniden yükleme
demek. İkisi de `Link`'e çevrildi.

**Bir bulgu gerekçelendirildi ve bastırıldı:** `auth/callback/route.ts` —
*"URL pre-fills a privileged action"*, yani `next` parametresinin hedefi
belirlemesi. Kural tüm repoda yalnız burada tetikleniyor ve haklı bir sezgi;
göremediği şey allowlist. Üç savunma yazılı: `resolveNextPath` serbest path
kabul etmez (tam eşleşme), her iki hedef de oturum sahibinin zaten gidebileceği
sayfalar (ayrıcalık yükseltmesi yok), ve gate testi iki yönü de kilitliyor.
**Alternatif ölçüldü ve elendi:** kurtarma sinyalini çerezle taşımak, linkin
**başka cihazda** açıldığı en yaygın durumu kırardı (dizüstünde iste, telefonda
aç). `react-doctor-disable-next-line` — repoda emsali var
(`api/parasut/oauth/callback`).

**Kalan 4 "hata" farkı benim değil:** `supabase/schema-bundle/*.sql` **gitignore'lu
üretilmiş** dosyalar (`npm run schema:bundle`); çalışma dizininde var, taze
worktree'de yok. Dosya-bazlı fark listesi düzeltme sonrası **yalnız o dördünü**
gösteriyor — yani kaynak kodda **sıfır regresyon**.

**Ders:** "üç kez yanlış alarm verdi" bir sonrakini görmezden gelmek için gerekçe
değil. Kıyas ölçümü ucuz; varsayım pahalı.

---

## Kullanıcı-tarafı (kod değil)

1. **`EMAIL_FROM`** — 10 bildirim `waiting_config`'te bekliyor, 11 uyarı tipi
   kimseye ulaşmıyor.
2. **Supabase → Authentication → URL Configuration → Redirect URLs** — parola
   sıfırlama linkinin dönüş adresi kayıtlı olmalı, yoksa link "requested path is
   invalid" ile döner.
3. `ADMIN_EMAILS` ve `NEXT_PUBLIC_APP_URL` `.env.local`'de boş.
4. `/gizlilik` firma alanları + hukuk danışmanı onayı.
5. E2E kilidi (#19) — Frankfurt dev projesi.
6. Geri yükleme provası (#11) · Beta testçiler (#20).

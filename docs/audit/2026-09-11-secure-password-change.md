# "Secure password change" açıldı — Ayarlar'daki şifre değiştirme kırılıyordu

**Tarih:** 2026-09-11 · **Tetik:** kullanıcı prod Supabase panelinde 12 bulgu
turunun (`#2`) kullanıcı-tarafı maddesini kapattı: `password_min_length = 12`
+ **Secure password change**. Mesaj: *"parola ayarlarını da yaptım"*.
**Migration YOK.**

Prod ayarları repodan okunamıyor (yönetim belirteci yok), yani ayarın açık
olduğu kullanıcının beyanına dayanıyor. Bu turun işi ayarın **kodla
etkileşimini** ölçmekti.

## 1. Ayarın ne yaptığı (yerel GoTrue v2.188.1'de ölçüldü)

"Secure password change" açıkken GoTrue, **oturumu 24 saatten eski** bir
`updateUser({ password })` isteğini `400 reauthentication_needed` ile reddeder
(e-postayla gelen bir kodla yeniden doğrulama ister). Ölçüm için bir test
kullanıcısı açıldı ve `auth.sessions.created_at` 25 saat geriye çekildi.

| Senaryo | Ayar KAPALI | Ayar AÇIK |
|---|---|---|
| A — taze oturumla değiştir | OK | OK |
| B — 25 saatlik oturumla değiştir | OK | **400 `reauthentication_needed`** |
| C — iki oturum var, değişikliği YENİ oturum yapıyor | eski oturum **kapanır**, yeni yaşar | aynı |
| D — admin API (`updateUserById`) | kullanıcının oturumu **kapanır** | aynı |

C ve D ayardan bağımsız ama düzeltmenin biçimini onlar belirledi: **GoTrue
parolayı değiştiren oturumu yaşatır, kullanıcının öteki bütün oturumlarını
kapatır. Admin API hepsini kapatır.**

## 2. Kırılan yüzey: `POST /api/settings/user/password`

Uç mevcut şifreyi **ayrı, çerezsiz** bir istemcide doğruluyor, parolayı ise
**çerez oturumuyla** değiştiriyordu. Ayarlar'a gelen kullanıcının çerez oturumu
tipik olarak günlerce eskidir: oturum yenileme belirteciyle yaşar ama
`created_at` ilk girişte kalır. Ölçümde gerçek dev sunucusu ve gerçek
`@supabase/ssr` çerezleri kullanıldı.

| | Ayar kapalı | Ayar açık, ÖNCE | Ayar açık, SONRA |
|---|---|---|---|
| Taze oturum | 200 | 200 | 200 |
| 25 saatlik oturum | 200 | **500** + *"Password update requires reauthentication"* (İngilizce, kullanıcının ekranına) | **200** |
| Yanıttaki çerezle oturum geçerli mi | — | — | evet (profil 200) |
| Eski çerez oturumu | yaşıyor | — | **kapandı** (profil 401) |

## 3. Düzeltme: mevcut şifre doğrulaması ZATEN yeniden kimlik doğrulamadır

Tarayıcı, doğrulamanın açtığı **taze** oturuma taşınır (`setSession`, yeni
çerezler yanıta yazılır). Parola **o** oturumla değişir. Sıra önemli (senaryo
C): değişikliği doğrulama istemcisi yapsaydı çerez oturumu kapanır, kullanıcı
çıkış yapmış olurdu. Taşıma başarısızsa ya da doğrulama oturum döndürmezse
parolaya dokunulmaz (500, Türkçe mesaj).

Görünür davranış değişmedi. Kullanıcı bu tarayıcıda oturumda kalıyor, diğer
cihazlarda çıkış yapılıyor. Değişiklikten önce de öyleydi, çünkü GoTrue öteki
oturumları zaten kapatıyordu.

**Neden e-posta koduyla yeniden doğrulama değil:** `reauthenticate()`
kullanıcıya e-postayla kod gönderir. Akış iki adıma çıkar ve Supabase'in
yerleşik e-postasına bağlanır, o da saatte birkaç ileti gönderebiliyor. Mevcut
şifre aynı kanıtı tek adımda veriyor.

**Neden admin API değil:** senaryo D. Admin güncellemesi kullanıcının bütün
oturumlarını kapatır, değişikliği yapan tarayıcı da çıkış yapmış olurdu.

## 4. Etkilenmeyenler

- **Kurtarma (`POST /api/auth/recovery-password`)**: kurtarma oturumu
  `/auth/callback`teki kod takasında açılır, yani her zaman tazedir. Ayar
  açıkken taze oturumla 200 döndüğü ölçüldü. 24 saatten eski bir kurtarma
  sekmesi 400 alıyor. Mesajı (*"Bağlantının süresi dolmuş olabilir; yeni bir
  sıfırlama bağlantısı isteyin"*) bu durumu doğru tarif ediyor.
- **Admin sıfırlama (`PATCH /api/admin/users/[id]`)**: admin API kullanıyor,
  ayar ona uygulanmaz.
- **12 karakter**: uygulamanın politikası zaten 12 (`password-policy.ts`).
  Politikaya uyan her parola GoTrue'nun alt sınırını da geçiyor.

## 5. Güvenlik notu: ayar neden önemliydi

Bir oturumu çalan kişi parolayı değiştirmek için bu uygulamanın uçlarını
kullanmak zorunda değil. Anon anahtarı herkese açık, erişim belirteci
tarayıcıda. GoTrue'nun `PUT /user` ucunu doğrudan çağırmak yeter. Uygulamanın
sorduğu mevcut şifre buna karşı koruma **değil**. Gerçek sınır bu ayar: artık
24 saatten eski bir oturum parolayı değiştiremiyor. Daha taze bir oturum hâlâ
değiştirebilir, Supabase'in modeli bu. Aynı sebeple
`/api/auth/recovery-password`'ın oturum türüne bakmaması ek bir açık değil.
O çağrı GoTrue'ya doğrudan da yapılabiliyor ve sınır yine bu ayar.

## 6. Yerel yığın prod'a hizalandı

`supabase/config.toml` artık `minimum_password_length = 12` ve
`secure_password_change = true` (ikisinin de gerekçe yorumu var). Yerel yığın
prod'dan gevşek kalsaydı bu kusur yerelde hiç görülmezdi. 12 bulgu turundaki
inceleme bu dosyayı prod ayarı sanmıştı. Artık ikisi aynı. Ayarların
yerelde etkili olması için `supabase stop && supabase start` gerekir. Bu
turda yapıldı. E2E kullanıcısının parolası 14 karakter olduğu için
etkilenmedi.

## Kapı

`settings-user-password.test.ts` 7 testten 10'a çıktı:

- taze oturum, parola değişiminden ÖNCE çereze taşınır (`invocationCallOrder`),
- taşıma başarısızsa parola değişmez,
- doğrulama oturum döndürmezse parola değişmez.

**3/3 kırmızı-kanıtlı:** taşıma adımı silindiğinde, taşıma hatası
yutulduğunda ve sıra ters çevrildiğinde testler kırmızıya döndü.

tsc 0 · lint 0 · **508 dosya / 7082 test** · E2E 94/94 retries=0 · build 0 uyarı · migration YOK.

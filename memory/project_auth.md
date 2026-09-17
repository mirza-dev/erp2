---
name: Roven — Auth ve Kullanıcı Yönetimi
description: Login akışı, kullanıcı yönetimi, admin API, landing page
type: project
---

## Login Akışı

**Google OAuth (2026-06 kesin kapanış, `5b3f3f9`):** login `signInWithOAuth(google, redirectTo=origin/auth/callback)` → `src/app/auth/callback/route.ts` (ALWAYS_PUBLIC) `exchangeCodeForSession` + **provizyon kontrolü burada**: rolsüz OAuth kullanıcısında `src/lib/auth/oauth-provision.ts reconcileOAuthUserRoles` (aynı-e-postalı rol sahibi ekli kullanıcıdan app_metadata.roles kopyalanır; YALNIZ doğrulanmış e-posta; fail-closed), olmazsa signOut + `/login?error=unauthorized&attempted=<email>`. Hata teşhisi: `reason=provider|no_code|pkce|exchange` (pkce = "code verifier" hatası → Supabase Dashboard Redirect URL allowlist'te domain eksik olabilir — Coolify çift-domain + localhost kayıtlı olmalı). Politika: **yalnız ekli kullanıcılar** (self-signup Gmail reddedilir).

**Beni hatırla (gerçek, 2026-06):** `src/lib/auth/remember.ts` — login iki akışta sign-in ÖNCESİ `roven_remember` cookie (1/0) yazar; auth cookie YAZAN 3 katman (`supabase/server.ts` setAll · `proxy.ts` setAll · `supabase/client.ts` custom cookies) persist=0'da maxAge/expires düşürür → session cookie (tarayıcı kapanınca düşer); SİLME yazımları muaf (logout sağlam); varsayılan işaretli=kalıcı.

**Parola kurtarma (2026-08-31 — ÖNCESİNDE TAMAMEN KIRIKTI):** e-posta gidiyordu ama dönüş `/login`'e düşüyordu, `/login` PKCE `?code=`'unu HİÇ işlemiyordu, "yeni şifre" ekranı YOKTU → **şifresini unutan herkes (admin dâhil) kalıcı kilitleniyordu.** Şimdi İKİ bağımsız yol:
1. **Self-servis:** `resetPasswordForEmail(redirectTo=origin/auth/callback?next=/sifre-yenile)` → mevcut callback `exchangeCodeForSession` yapar → `src/app/sifre-yenile/page.tsx` (`checkPasswordPolicy` aynası) → **`POST /api/auth/recovery-password`** (2026-09-11: politika + `updateUser` SUNUCUDA; eskiden tarayıcıdan yazıyordu). `next` **allowlist**'ten geçer (`src/lib/auth/recovery-route.ts` `resolveNextPath`) — serbest path YOK, açık yönlendirme değil. Süresi dolmuş link → `/login?error=recovery` (OAuth hatasından ayrı mesaj).
2. **Admin sıfırlama:** `PATCH /api/admin/users/[id]` gövdesine `{ password }` → politika → `updateUserById` → audit `password_reset_by_admin`; UI: Kullanıcılar sayfasında "Şifre sıfırla". **E-postaya HİÇ bağlı değil** — `EMAIL_FROM` boş ve Supabase SMTP saatte birkaç mailde tıkanıyor, teslim gününün tek güvenilir kurtarma yolu bu.

**Kayda geçen karar:** exchange sonrası tam oturum açılır; kullanıcı şifre belirlemeden panoya gidebilir. Supabase kurtarma modelinin doğası (linke sahip olmak = kendi e-posta kutusuna sahip olmak), kapatılmadı.
**KULLANICI-TARAFI ÖN KOŞUL:** Supabase → Authentication → URL Configuration → **Redirect URLs**'e dönüş adresi eklenmeli, yoksa link "requested path is invalid" ile döner.

**Şifre değiştirme + "Secure password change" (2026-09-11):** prod panelinde AÇIK (min 12 + secure). GoTrue 24 saatten eski oturumla `updateUser({password})`ı `reauthentication_needed` ile reddeder → `POST /api/settings/user/password` tarayıcıyı mevcut-şifre doğrulamasının TAZE oturumuna taşır (`setSession`), parolayı O oturumla değiştirir. **Ölçülmüş GoTrue davranışı:** parolayı değiştiren oturum yaşar, kullanıcının öteki oturumları kapanır; admin API (`updateUserById`) hepsini kapatır. Kurtarma oturumu hep tazedir (etkilenmez). Yerel `config.toml` prod'la aynı. Detay `docs/audit/2026-09-11-secure-password-change.md` · [[project_security]].

- `src/app/login/page.tsx` — email/password (Supabase `signInWithPassword`)
- `src/app/api/auth/logout/route.ts` — POST ile çıkış
- İlk admin: `npm run create-admin email şifre` (`scripts/create-admin.ts`)
- Tüm kullanıcılar Supabase `auth.users`'da

---

## Kullanıcı Yönetimi

- `src/app/dashboard/settings/users/page.tsx` — liste, ekle, sil (self-delete engelli), **şifre sıfırla** (2026-08-31, ortak `Modal` + demo guard)
- `src/app/api/admin/users/route.ts` — GET (listele) / POST (oluştur) — service role key
- `src/app/api/admin/users/[id]/route.ts` — PATCH (roller **ve/veya şifre**; ikisi bağımsız, ikisi de yoksa 400) / DELETE (son-admin kilidi 409)
- Her handler `requireAdmin()` ile korunuyor: `ADMIN_EMAILS` env var kontrolü (bkz. project_security.md)
- Demo modda bu endpoint'ler middleware tarafından 403 ile bloklanır (POST/DELETE)
- `fetchUsers` → `useCallback` ile sarılı, `useEffect`'e dep olarak verilir

---

## Davetle kullanıcı açma (2026-09-17, onboarding turu)

- `POST /api/admin/users` body `{ email, roles, mode: "invite" | "password", password? }`.
  `invite`: sunucu rastgele parolayla (`randomInvitePassword`, politika kontrolü ATLANIR —
  sunucu sırrı, kullanıcı görmez) hesabı yaratır → `auth.admin.generateLink({type:"recovery",
  redirectTo: <origin>/auth/callback?next=/sifre-yenile})` → **kendi Resend kanalımızla**
  `renderUserInvite` e-postası (`templates.ts` SONU; Supabase SMTP 2–4/saat kapaklı, o yüzden
  `inviteUserByEmail` KULLANILMADI) → `email_logs` `entity_type=user_invite` → audit
  `user_invited`. Gönderim düşerse `deleteUser` ile geri alınır → 502 `invite_send_failed`
  (yarım hesap kalmaz). E-posta yapılandırılmamışsa (`RESEND_API_KEY ∧ EMAIL_FROM`) 400
  `email_not_configured`; GET `{ users, inviteAvailable }` döner (**yanıt şekli değişti**).
- `POST /api/admin/users/[id]/invite` — daveti yeniden gönder; `last_sign_in_at` doluysa 409
  `already_signed_in` ("Şifre sıfırla" kullanılır).
- Retry cron'u davet e-postasını ALMAZ (`email-logs.ts` filtresi `not.in.(quote,user_invite)`;
  kurtarma linki tek kullanımlık).
- UI (`settings/users`): radyo mod "Davet e-postası gönder (önerilen)" / "Parolayı ben
  belirleyeyim"; davet kapalıysa gerekçe + `Ayarlar › Sistem Durumu` (`?tab=sistem`) linki.
  Yerel profilde Resend yoksa parola modu varsayılan (E2E `onboarding.spec` iki dalı da kabul eder).
- Sistem sağlığı tek yerde: `src/lib/system-status.ts` (`buildSystemStatus(env, aiProbe)`) →
  `GET /api/settings/system-status` (view_settings) + `SistemDurumuTab`; aynı fonksiyon
  `scripts/check-env-matrix.ts` → `npm run kurulum:dogrula` (preflight:auth → migrations → env).

## Landing Page

- `src/app/page.tsx` — herkese açık (hero, 6 feature card, stack footer, GitHub linki)
- Butonlar: "Giriş Yap" → `/login` · "Demo Gez" → `GET /api/auth/demo` (sunucu yönlendirmesi; `enterDemoMode()` 2026-08-31'de ölü kod olarak kaldırıldı) · "Kaynak Kod" → GitHub
- Auth'd kullanıcı `/`'e gelirse → `/dashboard`'a yönlendiriliyor (middleware)

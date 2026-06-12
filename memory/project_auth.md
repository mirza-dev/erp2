---
name: Roven — Auth ve Kullanıcı Yönetimi
description: Login akışı, kullanıcı yönetimi, admin API, landing page
type: project
---

## Login Akışı

**Google OAuth (2026-06 kesin kapanış, `5b3f3f9`):** login `signInWithOAuth(google, redirectTo=origin/auth/callback)` → `src/app/auth/callback/route.ts` (ALWAYS_PUBLIC) `exchangeCodeForSession` + **provizyon kontrolü burada**: rolsüz OAuth kullanıcısında `src/lib/auth/oauth-provision.ts reconcileOAuthUserRoles` (aynı-e-postalı rol sahibi ekli kullanıcıdan app_metadata.roles kopyalanır; YALNIZ doğrulanmış e-posta; fail-closed), olmazsa signOut + `/login?error=unauthorized&attempted=<email>`. Hata teşhisi: `reason=provider|no_code|pkce|exchange` (pkce = "code verifier" hatası → Supabase Dashboard Redirect URL allowlist'te domain eksik olabilir — Coolify çift-domain + localhost kayıtlı olmalı). Politika: **yalnız ekli kullanıcılar** (self-signup Gmail reddedilir).

**Beni hatırla (gerçek, 2026-06):** `src/lib/auth/remember.ts` — login iki akışta sign-in ÖNCESİ `roven_remember` cookie (1/0) yazar; auth cookie YAZAN 3 katman (`supabase/server.ts` setAll · `proxy.ts` setAll · `supabase/client.ts` custom cookies) persist=0'da maxAge/expires düşürür → session cookie (tarayıcı kapanınca düşer); SİLME yazımları muaf (logout sağlam); varsayılan işaretli=kalıcı.

- `src/app/login/page.tsx` — email/password (Supabase `signInWithPassword`)
- `src/app/api/auth/logout/route.ts` — POST ile çıkış
- İlk admin: `npm run create-admin email şifre` (`scripts/create-admin.ts`)
- Tüm kullanıcılar Supabase `auth.users`'da

---

## Kullanıcı Yönetimi

- `src/app/dashboard/settings/users/page.tsx` — liste, ekle, sil (self-delete engelli)
- `src/app/api/admin/users/route.ts` — GET (listele) / POST (oluştur) — service role key
- `src/app/api/admin/users/[id]/route.ts` — DELETE
- Her handler `requireAdmin()` ile korunuyor: `ADMIN_EMAILS` env var kontrolü (bkz. project_security.md)
- Demo modda bu endpoint'ler middleware tarafından 403 ile bloklanır (POST/DELETE)
- `fetchUsers` → `useCallback` ile sarılı, `useEffect`'e dep olarak verilir

---

## Landing Page

- `src/app/page.tsx` — herkese açık (hero, 6 feature card, stack footer, GitHub linki)
- Butonlar: "Giriş Yap" → `/login` · "Demo Gez" → `enterDemoMode()` · "Kaynak Kod" → GitHub
- Auth'd kullanıcı `/`'e gelirse → `/dashboard`'a yönlendiriliyor (middleware)

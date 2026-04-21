---
name: KokpitERP — Auth ve Kullanıcı Yönetimi
description: Login akışı, kullanıcı yönetimi, admin API, landing page
type: project
---

## Login Akışı

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

# C1 — Login Brick-Risk Preflight + Deploy Checklist + Kurtarma Runbook

**Tarih:** 2026-06-19
**Tetikleyen:** `deferred_backlog` C1 — "Login 'Monolith' canlı tur, ⚠️ brick riski". Auth testleri mock'lu, canlı doğrulanmadı.
**Sınır (dürüst rapor):** Çekirdek brick koşulu ("deploy sonrası ≥1 admin var mı?") bu turda **AI tarafında otomatikleştirildi** (read-only preflight script). Kalan iş — tarayıcı smoke + Supabase/Coolify dashboard ayarları — kaçınılmaz **kullanıcı tarafıdır** (prod sürülemez, dashboard erişimi yok).

---

## §1 — Brick modeli (koddan izlendi)

İki kapı zinciri her oturumda çalışır:

1. **Provize kapısı** — `src/proxy.ts:241`:
   ```
   if (!isProvisionedUser(user.app_metadata, user.email, ADMIN_EMAILS)) → /login?error=unauthorized (sayfa) / 403 (api)
   ```
   `isProvisionedUser` (`src/lib/auth/permissions.ts:173`) yalnız `app_metadata.roles` (veya legacy `app_metadata.role`) VARSA ya da e-posta `ADMIN_EMAILS`'te ise `true`. Google ile kendi kaydolan kullanıcıda `app_metadata.roles` HİÇ yoktur → reddedilir.

2. **Admin kapısı** — kurtarma kolu (`/dashboard/settings/users` + `/api/admin/users`) `requireAdmin` ister; admin = `parseRoles(app_metadata, email, ADMIN_EMAILS)` ∋ `admin` (`permissions.ts:142`).

**BRICK:** Deploy sonrası **hiçbir** `auth.users` kaydında `app_metadata.roles ∋ admin` YOK **ve** prod `ADMIN_EMAILS` boş/yanlışsa → kimse admin değil → kullanıcı yönetimi kapalı → kimse provize/düzeltilemez. **Password login bile kurtarmaz** (oturum açılır ama provize/admin kapıları aynı şekilde kapalı). Kurtarma yalnız §4'teki dışarıdan müdahale.

---

## §2 — Preflight script (`scripts/check-auth-preflight.ts`)

`npm run preflight:auth` — tek READ-ONLY `auth.admin.listUsers` okuması, **HİÇBİR mutasyon**. Rol tespiti üretimle birebir olsun diye gerçek `parseRoles`/`isProvisionedUser` import edilir.

Raporlar:
- toplam kullanıcı + provize sayısı;
- **kalıcı admin** = `parseRoles(app_metadata, email, [])` ∋ admin → **env-bağımsız**, prod'da da geçerli (asıl brick koruması);
- **bootstrap admin** = yalnız LOCAL `ADMIN_EMAILS` ile admin → env'e bağlı;
- `ADMIN_EMAILS` (LOCAL) değeri + e-posta format doğrulaması;
- ⚠️ **mis-provision** = `user_metadata` rol VAR ama `app_metadata.roles` YOK (rolleri sessizce yok sayılır → viewer).

**Exit kodları:**
| Durum | Exit | Anlam |
|---|---|---|
| kalıcı + bootstrap admin == 0 | **1** | BRICK — deploy ERTELE |
| kalıcı == 0, bootstrap > 0 | 0 + ⚠️ | admin yalnız ADMIN_EMAILS'e bağlı → her iki Coolify env'inde set olmalı |
| kalıcı ≥ 1 | 0 | OK (env-bağımsız brick koruması) |
| `listUsers` hatası | **1** | fail-closed (admin sayılamadı → BRICK varsay) |

Örnek çıktı (e-postalar maskeli):
```
[auth-preflight] toplam kullanıcı: 8 · provize: 8
  kalıcı admin (app_metadata.roles ∋ admin — env-bağımsız, prod'da da geçerli): 3
    ✅ a***@***
  bootstrap admin (yalnız LOCAL ADMIN_EMAILS): 0
  ADMIN_EMAILS (LOCAL): boş — prod Coolify env'de set olup olmadığını AYRICA doğrula.
[auth-preflight] OK — en az bir kalıcı admin var (env-bağımsız brick koruması).
```

**2026-06-19 koşusu:** 3 kalıcı admin (paylaşımlı Supabase `auth.users`) → **prod brick-korumalı** (deploy sonrası en az 3 admin erişebilir; ADMIN_EMAILS'ten bağımsız).

**SINIR:** `ADMIN_EMAILS` buradan LOCAL env'den okunur; **prod Coolify değeri script tarafından GÖRÜLEMEZ** — ayrıca doğrula. "Kalıcı admin" tespiti `auth.users` paylaşımlı olduğu için prod'da da geçerlidir.

---

## §3 — Manuel deploy checklist (kullanıcı, deploy ÖNCESİ)

- [ ] `npm run preflight:auth` → **OK** (kalıcı admin ≥ 1) veya en azından bootstrap admin + ADMIN_EMAILS doğru.
- [ ] **ADMIN_EMAILS** her iki Coolify ortamında (her iki domain) set + format doğru (virgülle ayrılmış geçerli e-postalar).
- [ ] Supabase → Auth → **"Allow new signups = OFF"** (self-signup oturum bile yaratamaz; kod ikinci kilit).
- [ ] Supabase → Auth → URL Configuration → **Redirect URLs**: her iki Coolify domain + localhost'un `…/auth/callback`'i ekli (eksikse Google login `pkce`/`code verifier` hatası verir; password login etkilenmez).
- [ ] **Tarayıcı smoke (deploy sonrası):**
  - [ ] Password ile admin giriş → `/dashboard/settings/users` açılır.
  - [ ] Provize olmayan hesap → `/login?error=unauthorized` (döngü yok).
  - [ ] Google ile admin@ giriş → `/dashboard` (callback `reason` log'u temiz).
  - [ ] "Beni hatırla" işaretsiz → tarayıcı kapanınca oturum düşer.

---

## §4 — Kurtarma runbook (brick olursa)

Aşağıdakilerden biri yeterli (hepsi server/dashboard erişimi ister):

1. **create-admin (server shell):**
   ```
   npm run create-admin <email> <şifre>
   ```
   `auth.admin.createUser` ile `app_metadata.roles:["admin"]` → kalıcı admin (env-bağımsız).
2. **ADMIN_EMAILS + redeploy:** Coolify env'e admin e-postasını ekle, redeploy → bootstrap admin olarak girer, sonra panelden kalıcı rol ata.
3. **Supabase Studio:** `auth.users` kaydının `app_metadata`'sına `{"roles":["admin"]}` ekle.

> Tavsiye: en az bir kullanıcıya **kalıcı** `app_metadata.roles:["admin"]` ata (ADMIN_EMAILS'e güvenme) → tek ortam env hatası bile brick yaratmaz.

---

## Özet
- AI tarafı: ✅ read-only preflight script (`npm run preflight:auth`, brick koşulu otomatik) + brick modeli + kurtarma runbook.
- Kullanıcı tarafı: §3 manuel checklist (Coolify ADMIN_EMAILS + Supabase signups/redirect URLs + tarayıcı smoke).
- 2026-06-19 itibarıyla paylaşımlı Supabase'de 3 kalıcı admin → mevcut durumda brick riski YOK.

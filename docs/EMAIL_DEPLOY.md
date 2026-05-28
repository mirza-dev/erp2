# SMTP / E-posta Bildirim Sistemi — Deploy Runbook

Kod **2026-05-06**'dan beri hazır (commit history'de "SMTP/Resend entegrasyonu"). Bu doküman müşteri domain'i belli olunca yapılacak deploy adımlarını yönerge halinde verir. Süre: **~30 dk** (DNS propagation hariç).

---

## Mimari özet

- **Sağlayıcı:** [Resend](https://resend.com) (free tier: 100 mail/gün, 3000/ay)
- **Tetik noktası:** Fire-and-forget — request'i bozmaz (config eksik = sessiz return)
- **5 bildirim türü:** `stock_critical`, `order_pending`, `order_new`, `sync_error`, `order_shipped`
- **Dedup:** 6 saat penceresi (aynı user + entity + tip CRON spam'i engellenir)
- **Retry:** GitHub Actions cron her saat `/api/email/retry-failed` → `status='failed'` + son 24 saat + max 3 deneme
- **Audit:** Her gönderim `email_logs` tablosuna işlenir (status, attempt_count, resend_message_id, error)

---

## Faz 1 — Resend hesabı + Domain doğrulama (kullanıcı tarafı, ~10 dk + DNS bekleyiş)

1. **Resend hesabı aç:** https://resend.com/signup
2. **Domains → Add Domain:**
   - Müşteri domain'ini gir (örn. `bildirim.pmt.com.tr` veya `mail.example.com`)
   - **Subdomain** kullan, root değil (`pmt.com.tr` root'a koyma — diğer mail servisleri bozulur)
3. **DNS records ekle (3 kayıt):**
   - Resend dashboard'da listelenen `MX`, `TXT (SPF)`, `TXT (DKIM)` kayıtlarını domain'in DNS sağlayıcısına ekle (Cloudflare/Hetzner/GoDaddy/Vargonen)
   - **DKIM kritik** — yoksa Gmail/Outlook spam'e atar
4. **"Verify DNS" tıkla** — propagation 1-15 dk (TTL 300 önerilir)
5. **API Key oluştur:** API Keys → Create → "Full access" → değeri kopyala (sadece bir kere gösterilir)

**Önemli:** Domain doğrulanmadan EMAIL_FROM o domain'le çalışmaz. Geçici test için `EMAIL_FROM="KokpitERP <onboarding@resend.dev>"` (Resend test alanı) kullanılabilir ama deliverability düşük — sadece kod test'i için.

---

## Faz 2 — Coolify Environment Variables (kullanıcı tarafı, ~5 dk)

Coolify dashboard → ERP project → Environment Variables → 4 değişken:

| Key | Değer | Not |
|---|---|---|
| `RESEND_API_KEY` | `re_xxxxxxxxxxxxxx` | Faz 1.5'te kopyalanan |
| `EMAIL_FROM` | `KokpitERP <bildirim@bildirim.pmt.com.tr>` | Doğrulanmış domain'den; "Display Name <adres>" formatı önerilir |
| `NEXT_PUBLIC_APP_URL` | `https://erp.getmedspace.com` | Zaten set ise dokunma — email template'lerinde CTA link |
| `ADMIN_EMAILS` | `mrzsrbyk06@gmail.com` (opsiyonel) | virgülle ayrılmış admin liste; user_notification_preferences boşsa fallback |

**Dikkat:**
- `NEXT_PUBLIC_*` prefix'i client bundle'a girer — sadece public URL koy, asla API key
- `RESEND_API_KEY` ve `EMAIL_FROM` boş → email-service `getResend()` null döner → sessiz fail-safe (sistem patlamaz, sadece email gitmez)

---

## Faz 3 — Migration 047 uygulama (kullanıcı tarafı, ~3 dk)

`supabase/migrations/047_email_logs.sql` production DB'ye uygulanmalı:

```sql
-- Önce kontrol — tablo var mı?
SELECT to_regclass('public.email_logs');

-- NULL dönerse migration'ı çalıştır:
-- Supabase SQL Editor veya psql:
\i supabase/migrations/047_email_logs.sql
-- veya: psql $DATABASE_URL -f supabase/migrations/047_email_logs.sql
```

Migration idempotent (`CREATE TABLE IF NOT EXISTS`, RLS politikaları create-or-replace). Tekrar çalıştırmak güvenli.

---

## Faz 4 — Coolify redeploy

Coolify panel → ERP project → Redeploy. ~3-5 dk sürer. Build sonrası env vars runtime'a inject edilir.

---

## Faz 5 — Smoke test (~5 dk)

### Yöntem A — Test endpoint (önerilen)

`POST /api/email/test` admin-only endpoint, recipient lookup + dedup bypass ile direkt mail atar.

**Adımlar:**
1. Browser'da `https://erp.getmedspace.com/login` → admin hesap ile giriş yap
2. DevTools → Network tab açık olsun (cookies yakalayacağız)
3. Console'da:
   ```js
   fetch("/api/email/test", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ to: "kendi.email@example.com", type: "stock_critical" }),
   }).then(r => r.json()).then(console.log)
   ```
4. Response `{ status: "sent", resend_message_id: "...", log_id: "..." }` dönmeli
5. ~30 saniye içinde inbox'a **"Kritik stok: Test Ürün"** subject'li mail düşmeli
6. Gmail kullanıyorsan promotions veya spam klasörünü de kontrol et (ilk seferki olduğu için)

**Diğer 4 tip için tekrar:**
```js
for (const t of ["order_pending", "order_new", "sync_error", "order_shipped"]) {
  await fetch("/api/email/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: "kendi.email@example.com", type: t }),
  }).then(r => r.json()).then(d => console.log(t, d))
}
```

### Yöntem B — Gerçek tetikleyici
- Bir test ürünün stoğunu 0'a indir (`/dashboard/products` → edit)
- `POST /api/alerts/scan` çağır (veya cron'un tetiklemesini bekle — 6 saat)
- Stok kritik alert oluşur → `alert-service.ts:148` `notifyUsersByEmail` çağrılır
- Bildirim tercihlerinde `stock_critical` aktif olan admin'lere mail gider

---

## Faz 6 — Hata durumları (troubleshooting)

| Belirti | Sebep | Çözüm |
|---|---|---|
| `status: "config_missing"` (503) | RESEND_API_KEY veya EMAIL_FROM env eksik | Coolify env vars kontrol; redeploy |
| `status: "failed"` + "Domain not verified" | DNS henüz propagate olmadı veya DKIM eksik | Resend dashboard "Domains" status kontrol; TTL 300 + 15 dk bekle |
| 200 dönüyor ama inbox'a düşmüyor | Spam klasörü; SPF/DKIM hâlâ eksik; reverse DNS | Spam kontrol; Resend dashboard "Logs" → message status |
| `email_logs.status = 'failed'` çok | Resend rate limit; geçici network | GitHub Actions cron her saat retry; 3 deneme sonrası bırakır |
| Cron çalışmıyor | GitHub Actions secret `CRON_SECRET` set değil veya endpoint URL yanlış | Workflow logs kontrol (`.github/workflows/crons.yml` `email_retry` step) |

**Resend dashboard Logs:**
- https://resend.com/logs → her gönderim status, message-id, delivery time
- "delivered" yeşil, "bounced" kırmızı (yanlış email), "complained" (spam reported)

---

## Faz 7 — Kontroller

✅ `GET /api/health?detail=true` → `email: { configured: true, has_api_key: true, has_email_from: true }` (eğer health endpoint email section ekleyebilirsek — şu an opsiyonel, sonraki tur)

✅ Resend dashboard'da "Domains" → status: **verified** (yeşil)

✅ Supabase `email_logs` tablosunda son 5 satır:
```sql
SELECT id, notification_type, recipient_email, status, attempt_count, created_at, sent_at, metadata->>'error' as last_error
FROM email_logs
ORDER BY created_at DESC LIMIT 10;
```

✅ GitHub Actions `Crons` workflow log → `email_retry` step son 24 saatte success.

---

## Notlar

- **Resend free tier yetebilir mi?** 100 mail/gün × 30 = 3000/ay. Stok kritik alert günde 5-10, sipariş bildirim 1-5 → çok rahat sınır altında.
- **EMAIL_FROM formatı:** `"Display Name <email@domain>"` veya sadece `"email@domain"`. Display name spam skor'unu düşürür.
- **Disable etmek:** RESEND_API_KEY'i Coolify'dan sil → sessiz fail-safe, kod hatasız çalışmaya devam eder.
- **NotificationPreferences:** Her kullanıcı `/dashboard/settings` → "Bildirimler" sekmesinden tip bazlı opt-out yapabilir.
- **Test endpoint güvenliği:** `requireRole(["admin"])` guard'lı, demo modunda middleware tarafından zaten blok. Body'deki `to` admin yetkili olduğu için keyfi adrese gidebilir — production'da admin role'ü güvenle tutulmalı.

---

## Test endpoint reference

`POST /api/email/test`

**Body:** `{ to: string (valid email), type: NotificationTypeKey }`

**Geçerli `type` değerleri:** `stock_critical`, `order_pending`, `order_new`, `sync_error`, `order_shipped`

**Response (sent):**
```json
{
  "status": "sent",
  "resend_message_id": "re_abc123",
  "log_id": "uuid",
  "from": "KokpitERP <bildirim@pmt.com.tr>",
  "to": "admin@example.com",
  "subject": "Kritik stok: Test Ürün"
}
```

**Response (config eksik):** 503 `{ status: "config_missing", has_api_key, has_email_from }`
**Response (Resend hata):** 502 `{ status: "failed" | "error", error, log_id }`
**Response (admin değil):** 403 `{ error: "Yetkiniz yok." }`
**Response (geçersiz body):** 400 `{ error }`

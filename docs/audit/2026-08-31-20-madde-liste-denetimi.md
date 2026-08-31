# 20 maddelik "vibe-coded app" listesi — denetim

**Tarih:** 2026-08-31 · **Tetikleyen:** Kullanıcı sosyal medyada dolaşan
"20 NICHE ways to get your vibe coded app hacked" listesini paylaşıp
*"buradaki listeyi kontrol et, sistemde bunlar var mı, eksikler neler"* dedi.

Yirmi maddenin **tamamı ölçüldü** — kaynak okuma, `npm audit`, git geçmişi ve
canlı probe. 2026-08-30'daki [10 maddelik denetimle](2026-08-30-vibecode-guvenlik-denetimi.md)
örtüşen maddeler oradan devralındı; kalan 16'sı bu turda ölçüldü.

**Sonuç: 17 kapalı · 2 zayıf · 1 açık.** Açık olan (#18) ve zayıflardan biri (#19)
aynı gün kapatıldı; kalan zayıf (#5) zaten deploy günü env maddesi olarak takipte.

---

## Özet tablo

| # | Madde | Durum | Dayanak |
|---|---|---|---|
| 1 | `.env` GitHub'da | ✅ | `.gitignore: .env*`; `git log --all` → tüm geçmişte yalnız `.env.example` |
| 2 | API anahtarı frontend'de | ✅ | 4 `NEXT_PUBLIC_` (Supabase URL · anon key · Sentry DSN · app URL) — hepsi public-by-design. Client dosyalarında sır **değeri** yok; geçen isimler yalnız Ayarlar ekranındaki durum etiketleri |
| 3 | RLS yok | ✅ | 65/65 tablo RLS; anon key ile 24 tablo probe → hepsi 200 + **0 satır** (2026-08-30) |
| 4 | İzin yalnız frontend'de | ✅ | `proxy.ts` `pageGateRedirect` + **method-seviye** guard matrisi (gate testi geçiyor); 29 kasıtlı istisna baseline'da kayıtlı |
| 5 | Rate limit yok | ⚠️ | Var: login 5/15dk · AI 10/dk · API 300/dk. Ama `REDIS_URL` yok → in-memory fallback. **Tek instance'ta sorun değil**; çok-instance'lı deploy'da limit instance başına olur. Deploy günü env maddesi |
| 6 | SQL string birleştirme | ✅ | Tüm sorgular Supabase istemcisi + 49 RPC (parametreli). Tek dinamik SQL: mig.100'de `format('… %1$s', t)` — `t` sabit tablo listesinden, kullanıcı girdisi değil |
| 7 | Girdi doğrulama yok | ✅ | zod kullanılmıyor ama elle yazılmış katman var: `lib/validation.ts` · `quote-validation.ts` · `rfq-validation.ts`; `safeParseJson` 146× · `validateStringLengths` 23× · `validateTag` 78× |
| 8 | Kullanıcı içeriği ham HTML | ✅ | 8 `dangerouslySetInnerHTML` — **hepsi sabit CSS** (`PAGE_CSS`/`PRINT_CSS`/`INJECTED_CSS`) + tema bootstrap. Kullanıcı verisi enterpolasyon eden tek örnek yok |
| 9 | Düz metin parola | ✅ | 111 migration'da parola sütunu **yok**; kimlik doğrulama tamamen Supabase'de |
| 10 | Auth localStorage'da | ✅ | Auth **cookie**'de (`@supabase/ssr` + `roven_remember` kalıcılık tercihi). localStorage yalnız teklif taslağı (`teklif_v3`) |
| 11 | Auth'suz admin paneli | ✅ | `/api/admin/*` iki rotada da `requireAdmin()`; UI middleware kapısında |
| 12 | CORS `*` | ✅ | Kodda ve `next.config.ts`'te **hiç** `Access-Control-Allow-Origin` yok → same-origin |
| 13 | E-posta doğrulama yok | ✅ | `signUp` hiçbir route/bileşende yok → **genel kayıt kapalı**. Kullanıcılar yalnız admin panelinden açılıyor (`email_confirm: true`) |
| 14 | Tahmin edilebilir ID | ✅ | Tüm birincil anahtarlar `uuid` (200+ tanım); artan tamsayı yok |
| 15 | Tüm request body kaydediliyor | ✅ | Hiçbir rotada `...body` insert/update'e yayılmıyor. `created_by`/`actor` sunucu-otoriter (2026-06 purchase/vendors turları) |
| 16 | Webhook imza kontrolü | ✅ | Resend/svix imzası doğrulanıyor; **sır yoksa fail-closed** — `if (!secret) throw` |
| 17 | Prod stack trace | ✅ | `api-error.ts`: `NODE_ENV === "production"` → generic mesaj; iç detay yalnız log'a |
| 18 | Bağımlılık güncelleme | ✅ **kapatıldı** | Denetimde **17 açık, 6 yüksek**. Aşağıda |
| 19 | Parola gücü | ✅ **kapatıldı** | Denetimde yalnız `length >= 8`, dört yere kopyalanmış. Aşağıda |
| 20 | Dosya yükleme doğrulaması | ✅ | MIME allowlist + 10 MB tavan; hem içe aktarım (`import-file-helpers.ts`) hem ürün ekleri (`product-attachments.ts`) |

---

## #18 — bağımlılık açıkları (asıl bulgu)

`npm audit --omit=dev` → **17 açık: 6 yüksek · 10 orta · 1 düşük.**

Yükseklerin neden ciddi olduğu tek bir satırda:

> **Next.js: "Middleware / Proxy bypass in App Router applications"**

Bu uygulamanın **auth kapısı** `src/proxy.ts` — yani bir middleware. Kapının
atlanabilmesi, oturum kontrolünün atlanabilmesi demek. Diğer yüksekler: `sharp`
(libvips CVE'leri), `postcss` (XSS + path traversal), `nanoid`, `fast-uri`,
`brace-expansion`.

**Düzeltme:** `next` **ve** `eslint-config-next` birlikte `16.2.9 → 16.3.3`
(minor, kırıcı değil; `@sentry/nextjs@10.48` peer aralığı `^16.0.0-0` kapsıyor),
ardından `npm audit fix` (nanoid · fast-uri · brace-expansion).

**Sonuç: 17 → 1.** Altı yüksek de kapandı.

### Kalan tek açık — bilerek bırakıldı

`@anthropic-ai/sdk` (orta): iki uyarı da **yerel dosya sistemi "Memory Tool"**
hakkında (sandbox kaçışı + gevşek dosya izinleri). Düzeltmesi `0.80 → 0.122`,
**kırıcı major**.

Bu projede Memory Tool **kullanılmıyor** — ölçüldü: kaynakta `memory` aracı,
`betas` ya da dosya sistemi aracı geçmiyor; SDK yalnız metin üretimi ve normal
tool-use için kullanılıyor. Kullanılmayan bir özellik için kırıcı major'a atlamak,
kazanç olmadan risk almak olurdu. **Yeniden değerlendirme tetikleyicisi:** SDK'nın
memory/dosya-sistemi araçlarından biri kullanılmaya başlanırsa.

`npm audit fix --force` **bilerek koşulmadı** — breaking major'lara atlar.

---

## #19 — parola politikası

Denetimde kural **dört yere kopyalanmıştı** ve dördü de yalnız `length >= 8`
bakıyordu: `api/settings/user/password/route.ts` · `api/admin/users/route.ts` ·
Ayarlar sayfası · Kullanıcılar sayfası.

Kopyalanmış kuralın asıl tehlikesi ayrışmadır: biri sıkılaşır, öteki geride kalır
ve kullanıcı **en gevşek yüzeyden** parolasını belirler.

**Düzeltme:** tek saf yardımcı — `src/lib/auth/password-policy.ts`.

- `MIN_PASSWORD_LENGTH = 12`
- Zayıf/yaygın parola listesi (TR + EN) + basit türevler (`Sifre123!` → `sifre`)
- Türkçe karakter katlama (`ŞİFRE` ≡ `sifre`)
- Bağlam reddi: kullanıcının kendi e-posta yerel adı parolada geçemez
- Tekrar (`aaaaaa…`) ve ardışık dizi (`123456…`) reddi
- **Karmaşıklık kuralı YOK** — NIST 800-63B önermiyor; `Sifre123!` gibi tahmin
  edilebilir kalıplara itiyor. Uzunluk daha etkili. (Kullanıcı kararı.)

Sunucu otoriter; istemci aynı fonksiyonu UX için aynalıyor (repodaki
`validateQuoteForSend` kalıbı).

**Kapsam:** kural **yeni/değişen** parolalara uygulanır. Mevcut kullanıcılar zorla
değiştirilmiyor — davetiye-bazlı sistem, 3 kalıcı admin var, zorlamak brick riski
taşır. Supabase tarafındaki kendi parola politikası ayrıca açılabilir
(kullanıcı-tarafı).

---

## Yan bulgu — ölü kod

`src/lib/demo-utils.ts` içindeki `enterDemoMode()` **sıfır çağrı yeriyle** duruyordu
(ölçüldü: tanımı dışında tek referans yok; hafızadaki not da bayattı). Demo girişi
`GET /api/auth/demo` sunucu yönlendirmesiyle yapılıyor — o rota cookie'yi sunucuda
yazıyor ve neden tercih edildiğini kendi yorumunda anlatıyor.

Fonksiyon ayrıca `eslint-config-next@16.3.3` ile gelen
`no-location-assign-relative-destination` kuralının repodaki **tek kaynağıydı**.
Kaldırıldı; yerine gerekçe yorumu bırakıldı.

---

## Kapı testleri

| Dosya | Neyi kilitliyor |
|---|---|
| `src/__tests__/gate/password-policy.test.ts` (7 test) | Politika davranışı **+ dört çağrı yerinin dördü de ortak yardımcıyı kullanıyor** — biri elle `8`e dönerse yakalar |
| `src/__tests__/gate/client-boot.test.ts` (+2 test) | `next >= 16.3.3` ve `eslint-config-next` ile **aynı** sürümde — yükseltme sessizce geri alınırsa middleware-bypass açığı geri gelir |

Her yeni kural **kırmızı yandığı kanıtlanarak** eklendi (9/9 enjeksiyon).

## Ölçüm komutları

```bash
npm audit --omit=dev                       # #18
git log --all --pretty=format: --name-only | grep -E "^\.env" | sort -u   # #1
grep -rn "dangerouslySetInnerHTML" src     # #8
grep -hoE "id +uuid" supabase/migrations/*.sql | wc -l                     # #14
grep -rn "Access-Control-Allow-Origin" src next.config.ts                  # #12
grep -rn "signUp" src                       # #13
npx vitest run src/__tests__/gate/          # kapı
```

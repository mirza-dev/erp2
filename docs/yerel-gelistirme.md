# Yerel geliştirme veritabanı (colima + Supabase)

2026-08-31'e kadar bu projede **ayrı bir geliştirme veritabanı yoktu**:
`.env.local` doğrudan canlı fabrika projesine (`ryvxpolvhvsycuqyphoa`) bakıyordu.
Bu yüzden `npm run dev` prod-koruma kapısına takılıyor, 13 Playwright spec'i hiç
koşamıyor ve hiçbir mutasyon testi yapılamıyordu.

Artık tüm yığın **yerelde** çalışıyor. Maliyeti yok, internet gerekmiyor,
`supabase db reset` ile saniyeler içinde temiz başa dönüyor.

## Kurulu olanlar

| Araç | Sürüm | Neden bu |
|---|---|---|
| colima | 0.10.3 | Docker Desktop ilk açılışta GUI'de lisans onayı + admin parolası ister; colima tamamen terminalden, sudo'suz ve aynı işi görür |
| docker (CLI) | 29.7.2 | `/opt/homebrew/bin` — PATH'te `/usr/local/bin`'den ÖNCE |
| supabase CLI | 2.116.0 | `brew install supabase/tap/supabase` |

> **Not:** `/usr/local/bin`'de silinmiş Docker Desktop'tan kalma **kırık sembolik
> bağlar** var (`docker`, `kubectl`, `hub-tool`…). Silinmedi — PATH sırası
> zaten brew sürümünü öne aldığı için zararsızlar.

## Günlük kullanım

```bash
colima start                 # VM (4 CPU / 6 GB / 30 GB, Apple Virtualization)
supabase start               # 10 konteyner; migration'lar otomatik uygulanır
npm run dev                  # kapı artık DURDURMAZ
```

Kapatmak: `supabase stop && colima stop`

| Servis | Adres |
|---|---|
| API | http://127.0.0.1:54321 |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| **Studio** | http://127.0.0.1:54323 |
| Mailpit (giden e-posta) | http://127.0.0.1:54324 |

`analytics` (logflare + vector) `config.toml`'da **kapatıldı** — ~1 GB RAM yiyor
ve bu projede kullanılmıyor.

## Env geçişi

- `.env.local` → **yerel** (şu an aktif)
- `.env.canli.local` → canlı değerlerin yedeği (gitignored)

```bash
cp .env.canli.local .env.local   # canlıya dön (kapı yine ALLOW_PROD_TARGET ister)
```

Kapı hiçbir yapılandırma istemiyor: `isProdTarget()` yalnız canlı ref'i tanır,
yerel hedef otomatik geçer (`src/lib/env-target.ts:47`).

## Sıfırdan kurulum (yeni makine / temiz başlangıç)

```bash
brew install colima docker docker-compose supabase/tap/supabase
colima start --cpu 4 --memory 6 --disk 30 --vm-type=vz --mount-type=virtiofs
supabase start                              # 111 migration otomatik
npm run create-admin -- <e-posta> <parola>  # E2E_USER_* ile AYNI olmalı
npm run dev                                 # sonra: POST /api/seed
```

**Sıra önemli:** `POST /api/seed` `clearAllData()` çalıştırır ama `auth.users`'a
dokunmaz — yine de admin'i seed'den sonra doğrulayın.

### Şema doğrulaması

`supabase/schema-bundle/README.md`'deki sorgu. Beklenen (kaynak proje, 2026-08-31):

| tablo | rls_acik | kova |
|---|---|---|
| 64 | 64 | 6 |

Yerelde ölçülen: **64 · 64 · 6** ✓ (ayrıca policy 29, fonksiyon 100 — bunlar
kaynak projede ölçülmediği için karşılaştırma tabanı olarak buraya yazıldı).

`tablo == rls_acik` olmalı. Değilse RLS'siz tablo var, kurulumu durdurun.

## Kurulum sırasında bulunan gerçek kusur

`next.config.ts`'deki CSP `connect-src` yalnız `https://*.supabase.co`'ya izin
veriyordu. Yerel Supabase `127.0.0.1:54321`'de durur ve bu desene UYMAZ →
tarayıcı giriş isteğini bloklar, konsolda yalnız `TypeError: Failed to fetch`
görünür, **sunucu logunda hiçbir hata yoktur** ve tablo "parola yanlış" gibi
durur. E2E kilitliyken bu kusur görünmezdi.

Çözüm: `isDev` kolu (dosyada aynı sınıf hata için zaten kullanılan kalıp).
**Üretim string'i değişmedi** — `gate/client-boot` onu kilitliyor.

## E2E

```bash
npm run test:e2e          # 94 test, ~6,5 dk
npx playwright test --grep "arama"   # tek test
```

Auth: `tests/global-setup.ts` `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` ile giriş
yapıp `tests/.auth/user.json` yazar; teardown onu **siler** (her koşum yeniden
kimlik doğrular).

### Bilinen kırık: `tam import akışı` (import.spec.ts:204)

**Sebep kodda değil, ANAHTARDA:** `.env.local`'daki `ANTHROPIC_API_KEY` geçersiz.
Sunucu logu: `401 authentication_error: invalid x-api-key`. Import sihirbazı
kolon eşleştirmesi için AI bekliyor, yanıt gelmiyor, test 90 sn'de düşüyor.
Uygulama bunu doğru yönetiyor (ekranda *"AI çıkarımı şu an kapalı — API anahtarı
geçersiz"* bandı çıkıyor ve Excel/CSV yolu çalışmaya devam ediyor), ama testin
tamamı AI'lı yolu bekliyor.

`import.spec.ts`'teki diğer testlerin kararsızlığının da muhtemel sebebi bu.

**Yapılacak:** Anthropic anahtarını yenile → bu test ve küme düzelmeli.

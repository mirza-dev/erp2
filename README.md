<div align="center">

# ⬢ Roven

### AI Destekli Endüstriyel ERP

_Endüstriyel vana ticaretinde **teklif → sipariş → stok → muhasebe**, uçtan uca tek sistem._

![Next.js](https://img.shields.io/badge/Next.js-16.1-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20RLS-3ECF8E?logo=supabase&logoColor=white)
![Claude](https://img.shields.io/badge/AI-Claude%20Haiku-D97757?logo=anthropic&logoColor=white)

![Tests](https://img.shields.io/badge/tests-~4650%20passing-22c55e)
![Migrations](https://img.shields.io/badge/migrations-84-blue)
![Deploy](https://img.shields.io/badge/deploy-Coolify%20%C2%B7%20Docker-0b76ef)
![Theme](https://img.shields.io/badge/theme-dark%20%2B%20light-6366f1)

</div>

---

> **Roven**, PMT Endüstriyel için geliştirilmiş yapay zeka destekli bir ERP'dir. Endüstriyel vana (B2B) ticaretini kataloglama, teklif, sipariş çift ekseni, stok rezervasyonu, üretim, satın alma önerisi ve muhasebe entegrasyonuna kadar uçtan uca kapsar. AI; belge okuma, kolon eşleştirme, risk skorlama ve satın alma kopilotunda devrede — anahtarsız çalışır, AI yoksa sistem sade modda devam eder.

## İçindekiler

- [📦 Özellikler](#-özellikler)
- [🚀 Hızlı Kurulum](#-hızlı-kurulum)
- [🔑 Ortam Değişkenleri](#-ortam-değişkenleri)
- [🗄️ Veritabanı & Migration](#️-veritabanı--migration)
- [🏥 Health Check](#-health-check)
- [🚢 Deployment (Coolify)](#-deployment-coolify)
- [🧱 Mimari & Domain](#-mimari--domain)
- [📁 Proje Yapısı](#-proje-yapısı)
- [🧪 Test & Komutlar](#-test--komutlar)
- [🧭 Bu Projeyi İlk Açıyorsan](#-bu-projeyi-i̇lk-açıyorsan)

---

## 📦 Özellikler

| | |
|---|---|
| **🤖 AI Belge Okuma** | Excel / CSV / PDF / görsel dosyaları Claude ile sınıflandırır, ürün/sertifika çıkarır, kolon eşleştirmeyi öğrenir ve sonraki içe aktarmalarda hafızasını kullanır. |
| **📊 Satın Alma Kopilotu** | Stok seviyesi, günlük kullanım, tedarik süresi ve aktif teklifleri (promisable stok) birlikte değerlendirerek yeniden sipariş önerir; karar geçmişini hatırlar. |
| **🔔 Akıllı Uyarı Motoru** | Kritik stok, sipariş son tarihi, geciken sevkiyat, süresi dolan teklif ve sync hatalarını otomatik tarar; severity değişimini ve toplu çözümü yönetir. |
| **🧾 Sipariş Çift Ekseni** | `commercial_status` (ticari) ve `fulfillment_status` (lojistik) ayrı eksenlerde ilerler; rezervasyon "Onaya Gönder" anında tetiklenir. |
| **📄 Teklif Modülü (V7)** | Çift dilli kurumsal PDF, revizyon zinciri, dondurulmuş HTML arşivi, not şablonları ve tek tıkla "Kabul Et → Sipariş" atomik dönüşümü. |
| **🏭 Üretim & BOM** | Reçete bazlı üretim kaydı, atomik stok tüketimi, eksik bileşen şeffaflığı ve **sesli giriş** (Ctrl+M) ile hızlı kayıt. |
| **🔗 Paraşüt Entegrasyonu** | Onaylanan cari/ürün/fatura/e-belge/irsaliyeyi muhasebe yazılımıyla senkronize eder; OAuth + retry + reconciliation. |
| **🛡️ RBAC + Tema** | 6 rollü erişim kontrolü, finansal redaction ve `data-theme` ile **koyu + aydınlık** premium tema (FOUC'suz). |

---

## 🚀 Hızlı Kurulum

```bash
# 1. Env dosyasını oluştur ve doldur
cp .env.example .env.local

# 2. Bağımlılıkları yükle
npm install

# 3. Supabase migration'larını uygula (aşağıya bak)
supabase db push

# 4. Geliştirme sunucusunu başlat
npm run dev

# 5. Sağlık kontrolü — tüm check'ler "ok" olmalı
curl http://localhost:3000/api/health
```

> İlk admin kullanıcısı: `npm run create-admin email şifre`

---

## 🔑 Ortam Değişkenleri

| Değişken | Zorunlu | Kaynak |
|----------|:-------:|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | aynı yer (public, client-side güvenli) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | aynı yer — **gizli tut**, RLS'i bypass eder |
| `ANTHROPIC_API_KEY` | ⬜ | AI özet, puanlama ve parse için. Eksikse sistem çalışır; AI özellikleri devre dışı kalır. [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `RESEND_API_KEY` · `EMAIL_FROM` | ⬜ | E-posta bildirimleri (Resend). Eksikse bildirim sessizce atlanır. |
| `REDIS_URL` | ⬜ | Rate limiting (self-hosted Redis). Eksikse fail-open (limit yok). |
| `PARASUT_CLIENT_ID` · `_SECRET` · `_COMPANY_ID` | ⬜ | Paraşüt Developer Portal → OAuth |
| `CRON_SECRET` | ⬜ | CRON endpoint'leri için Bearer token |

---

## 🗄️ Veritabanı & Migration

`supabase/migrations/` altında **84 sıralı SQL migration** bulunur. **Sırayla** uygulanmalıdır:

```bash
# Supabase CLI ile (önerilen)
supabase db push

# veya Dashboard → SQL Editor → her dosyayı 001'den 084'e sırayla çalıştır
```

> ⚠️ Migration'lar bağımlıdır; sıra atlanamaz. Bir önceki uygulanmadan sonraki çalıştırılırsa runtime hataları (eksik kolon/RPC/constraint) görülür.

**Kritik dönüm noktaları:**

| # | İçerik |
|---|--------|
| `001` | İlk şema — 14 tablo, index, trigger, CHECK constraint'ler |
| `002`–`004` | Atomik stok & sipariş & envanter RPC'leri |
| `017` | 23 tabloda Row Level Security — anon key ile doğrudan DB erişimini engeller |
| `018` | `create_order_with_lines` — atomik sipariş oluşturma RPC |
| `034` | Teklif (quotes) modülü temeli |
| `047` | `email_logs` — bildirim audit + retry |
| `056`–`057` | Dinamik ürün tipleri + alanlar + 8 hazır tip seed |
| `077` | `accept_quote_and_create_order` — atomik teklif → sipariş |
| `082` | Rezervasyonun `pending_approval` aşamasına taşınması |
| `083`–`084` | Teknik şablonlar + Excel içe aktarma merkezi |

---

## 🏥 Health Check

```
GET /api/health
```

Env değişkenlerini ve tablo/migration varlığını kontrol eder.

- **HTTP 200** → sistem hazır (AI ve Paraşüt opsiyonel, eksikse 503 dönmez)
- **HTTP 503** → eksik zorunlu env (Supabase) veya uygulanmamış migration

```jsonc
{
  "env.SUPABASE_URL": "ok",
  "env.SERVICE_ROLE_KEY": "ok",
  "ai.ANTHROPIC_API_KEY": "ok",                 // veya "disabled (AI features unavailable)"
  "env.PARASUT_CLIENT_ID": "MISSING (optional)",
  "db.customers": "ok"
  // ...migration check'ler
}
```

---

## 🚢 Deployment (Coolify)

Production sürümü self-hosted **Coolify** üzerinde çalışır (Hetzner/Vargonen VPS). Vercel'den **2026-05**'te taşındı (cron limit sorunu).

**Mimari:**
- **Runtime:** Coolify → Docker (multi-stage Dockerfile, Next.js standalone)
- **Cron:** GitHub Actions (`.github/workflows/crons.yml`) — 6h ve 1h schedule
- **Source map:** GitHub Actions (`sentry-release.yml`) build sonrası Sentry'e upload
- **Auto-deploy:** `main` branch push → Coolify webhook → Docker build → swap

**Gerekli GitHub Secrets:**
- `APP_URL`, `CRON_SECRET` (Coolify env ile aynı)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`

```bash
# Local Docker testi
npm run docker:build && npm run docker:run    # http://localhost:3000
```

**Rollback:** Coolify dashboard → Deployments → eski commit'e "Redeploy".

---

## 🧱 Mimari & Domain

**Katmanlar:** DB (snake_case) → `api-mappers.ts` → Frontend (camelCase)

```
Product   → id, name, sku, category, unit, price, currency,
            on_hand, reserved, available_now, productType, attributes (JSONB), ...
Order     → orderNumber, commercial_status, fulfillment_status, grandTotal, lines[]
```

**Sipariş çift ekseni:**

```
commercial_status:   draft → pending_approval → approved → cancelled
fulfillment_status:  unallocated → partially_allocated → allocated
                     → partially_shipped → shipped
```

> Rezervasyon **"Onaya Gönder"** (draft → pending_approval) ile tetiklenir. `approved` = light ticari teyit.

**Stok modeli:**

```
available_now = on_hand - reserved          # satılabilir fiziksel stok
quoted        = draft tekliflerdeki miktar  # soft hold
promisable    = available_now - quoted      # gerçek vaat edilebilir (negatif olabilir)
incoming      = açık satın alma taahhütleri
forecasted    = on_hand + incoming - reserved - quoted
```

**Sipariş hesaplama:**

```ts
lineTotal  = quantity * unitPrice * (1 - discountPct / 100)
subtotal   = sum(lineTotals)
vatTotal   = subtotal * 0.20            // KDV %20
grandTotal = subtotal + vatTotal
```

---

## 📁 Proje Yapısı

```
src/
├── app/
│   ├── dashboard/          — tüm dashboard sayfaları
│   │   ├── orders/         — satış siparişleri (liste, yeni, [id], edit)
│   │   ├── quotes/         — teklifler (V7: PDF, revizyon, arşiv)
│   │   ├── products/       — stok & ürünler + dinamik tipler
│   │   ├── customers/      — cariler
│   │   ├── production/     — üretim kaydı (ses + form)
│   │   ├── import/         — AI içe aktarma (sınıflandırma + çıkarım)
│   │   ├── alerts/         — üretim & stok uyarıları
│   │   ├── parasut/        — muhasebe sync dashboard
│   │   ├── purchase/       — satın alma siparişleri + öneriler + tedarikçiler
│   │   └── settings/       — firma + kullanıcı + tip + şablon + API ayarları
│   ├── api/                — route handler'lar (Next.js App Router)
│   └── globals.css         — CSS variables (koyu + aydınlık, :root[data-theme])
├── components/
│   ├── layout/             — Sidebar, Topbar, ThemeToggle, ExchangeRatesTicker
│   ├── dashboard/          — StatsCards, RecentOrders, AIAlerts, AISummaryCard
│   └── ui/                 — Button, Toast, Pagination, DemoBanner, ...
└── lib/
    ├── supabase/           — DB client + tablo query fonksiyonları
    ├── theme/              — use-theme.tsx (ThemeProvider/useTheme)
    ├── auth/               — RBAC permission guard'ları
    ├── services/           — iş mantığı (order/alert/production/purchase/parasut/ai)
    ├── api-mappers.ts      — DB row → frontend model
    └── database.types.ts   — Supabase tablo tipleri (snake_case)
supabase/
└── migrations/             — 84 SQL migration (sırayla uygula)
```

---

## 🧪 Test & Komutlar

```bash
npm test              # Vitest — 319 dosya / ~4650 test
npm run test:coverage # kapsam raporu
npm run test:e2e      # Playwright E2E
npm run lint          # ESLint (0 hata hedefi)
npm run smoke         # production smoke kontrolü
npm run doctor        # react-doctor tarama
```

| Komut | İşlev |
|-------|-------|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Production build (standalone) |
| `npm run create-admin` | İlk admin kullanıcısı oluştur |
| `npm run docker:build` / `docker:run` | Local Docker testi |

---

## 🧭 Bu Projeyi İlk Açıyorsan

### Okuma Sırası
1. **`README.md`** (bu dosya) — kurulum ve ortam
2. **`domain-rules.md`** — sistemin ne yapması/yapmaması gerektiği (source of truth)
3. **`src/lib/database.types.ts`** — DB şeması (snake_case)
4. **`src/lib/api-mappers.ts`** — DB ↔ frontend veri akışı
5. **`CLAUDE.md`** — kodlama kuralları ve mimari özet

### Kritik Kurallar
- 🎨 **Stil:** Sadece inline styles + CSS variables. Tailwind class **kullanma**.
- 🌗 **Tema:** Renkte **her zaman** `var(--...)` kullan → koyu/aydınlık otomatik çalışır. Sabit hex ekleme.
- ⚛️ **`"use client"`:** Tüm interaktif component'larda zorunlu.
- 🚫 **Framer Motion:** Kurulu değil/yasak. CSS animasyon yalnız gerekli yerde.

## 🔍 Kod İnceleme & Güvenlik Denetimi

Projeye özel **`erp2-reviewer`** Claude Code subagent'ı (`.claude/agents/erp2-reviewer.md`) bug,
semantik hata ve güvenlik açığı tarar; bulguları `docs/audit/` altında **Bulgular (K/Y/O/D)**
formatında üretir. Mekanik katman için iki yerel araç gerekir:

```bash
brew install semgrep gitleaks      # SAST + secret taraması
```

Çalıştırma (Claude Code içinde): **`/erp-review`** (tam denetim) · **`/erp-review diff`** (yalnız PR
değişikliği). Subagent `.semgrep/erp-rules.yml` (projeye özel kurallar: NEXT_PUBLIC secret, UTC tarih
kayması, Tailwind, framer-motion, hardcoded renk…) + `p/typescript p/react p/nextjs p/owasp-top-ten`
ruleset'lerini çalıştırıp sonuçları yorumlar. Yalnız **rapor** üretir; düzeltmeleri uygulamaz.

<div align="center">

---

**Roven** · PMT Endüstriyel · AI Destekli ERP

</div>

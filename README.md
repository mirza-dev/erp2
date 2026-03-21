# KokpitERP

PMT Endüstriyel için yapay zeka destekli ERP sistemi. Endüstriyel vana satışı (B2B).

**Stack:** Next.js 15 · TypeScript · Supabase · Tailwind CSS (inline styles ile)

---

## Hızlı Kurulum

```bash
# 1. Env dosyasını oluştur ve doldur
cp .env.example .env.local

# 2. Bağımlılıkları yükle
npm install

# 3. Supabase migration'larını uygula (aşağıya bak)

# 4. Geliştirme sunucusunu başlat
npm run dev

# 5. Sağlık kontrolü — tüm check'ler "ok" olmalı
curl http://localhost:3000/api/health
```

---

## Ortam Değişkenleri

| Değişken | Zorunlu | Kaynak |
|----------|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | aynı yer (public, client-side güvenli) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | aynı yer — **gizli tut**, RLS'i bypass eder |
| `ANTHROPIC_API_KEY` | ✓ | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `PARASUT_CLIENT_ID` | Opsiyonel | Paraşüt Developer Portal → OAuth |
| `PARASUT_CLIENT_SECRET` | Opsiyonel | aynı yer |
| `PARASUT_COMPANY_ID` | Opsiyonel | aynı yer |

> Vercel'e deploy ederken: Project → Settings → Environment Variables'dan ekle.

---

## Migration Sırası

`supabase/migrations/` altındaki dosyaları **sırayla** uygula:

| Sıra | Dosya | İçerik |
|------|-------|--------|
| 1 | `001_initial_schema.sql` | 14 tablo, index'ler, trigger'lar, CHECK constraint'ler |
| 2 | `002_stock_rpc_functions.sql` | 4 atomik stok RPC fonksiyonu (`increment_reserved`, `decrement_reserved`, `decrement_on_hand`, `adjust_on_hand`) |

**Supabase CLI ile:**
```bash
supabase db push
```

**Dashboard ile:** SQL Editor → her dosyayı sırayla çalıştır.

> ⚠️ `002` olmadan üretim ve sevkiyat akışları çalışmaz (RPC call hatası alırsın).

---

## Health Check

```
GET /api/health
```

Env değişkenlerini ve tablo/migration varlığını kontrol eder.

- **HTTP 200** → her şey hazır
- **HTTP 503** → eksik env veya uygulanmamış migration

```jsonc
// Örnek başarılı yanıt
{
  "env.SUPABASE_URL": "ok",
  "env.SERVICE_ROLE_KEY": "ok",
  "env.ANTHROPIC_API_KEY": "ok",
  "env.PARASUT_CLIENT_ID": "MISSING (optional)",
  "db.customers": "ok",
  "db.sales_orders": "ok",
  "db.production_entries": "ok",
  "db.alerts": "ok",
  "db.rpc_stock_functions": "ok"
}
```

---

## API Hata Kodları

| HTTP | `code` alanı | Anlam |
|------|-------------|-------|
| 503 | `CONFIG_ERROR` | Env var eksik — `/api/health`'e bak |
| 500 | — | DB veya uygulama hatası |
| 409 | — | Stok/conflict (beklenen iş mantığı) |
| 400 | — | Validation hatası (eksik alan vb.) |
| 404 | — | Kayıt bulunamadı |

---

## Proje Yapısı

```
src/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx           — Ana dashboard
│   │   ├── layout.tsx         — Sidebar + Topbar wrapper
│   │   ├── orders/            — Sipariş listesi, yeni sipariş, detay
│   │   ├── products/page.tsx  — Stok & Ürünler
│   │   ├── customers/page.tsx — Cariler
│   │   ├── production/page.tsx — Üretim kaydı
│   │   ├── import/page.tsx    — AI dosya içe aktarma
│   │   └── alerts/page.tsx    — Üretim & Stok uyarıları
│   ├── api/                   — Route handler'lar (Next.js App Router)
│   │   ├── health/route.ts    — Sağlık kontrolü endpoint'i
│   │   ├── orders/            — CRUD + durum geçişleri
│   │   ├── products/          — CRUD
│   │   ├── customers/         — CRUD
│   │   ├── production/        — CRUD
│   │   ├── alerts/            — CRUD + scan
│   │   ├── import/            — AI dosya parse akışı
│   │   ├── ai/                — parse + score endpoint'leri
│   │   └── parasut/           — Muhasebe sync
│   └── globals.css            — CSS variables (dark theme)
├── components/
│   ├── layout/                — Sidebar, Topbar
│   └── dashboard/             — StatsCards, RecentOrders vb.
└── lib/
    ├── supabase/              — DB client + tablo query fonksiyonları
    ├── services/              — İş mantığı servisleri
    ├── api-error.ts           — Merkezi API hata yönetimi
    ├── data-context.tsx       — Client-side React context
    └── mock-data.ts           — Interface tanımları + mock veriler
supabase/
└── migrations/                — SQL migration dosyaları (sırayla uygula)
```

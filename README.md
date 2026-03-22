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
| 3 | `003_order_rpcs.sql` | Sipariş durum geçiş RPC'leri |
| 4 | `004_inventory_rpcs.sql` | Gelişmiş envanter yönetim RPC'leri |
| 5 | `005_faz8910_hardening.sql` | `ai_risk_level` kolonu, parasut/sync-log index'leri |
| 6 | `006_lead_time.sql` | `products.lead_time_days` kolonu — lead-time-aware satın alma önerisi |

**Supabase CLI ile:**
```bash
supabase db push
```

**Dashboard ile:** SQL Editor → her dosyayı sırayla çalıştır.

> ⚠️ Migration'lar sırayla uygulanmalı. `002` olmadan üretim/sevkiyat, `003`–`004` olmadan sipariş geçişleri ve rezervasyon, `006` olmadan lead-time aware satın alma önerisi çalışmaz.

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
  "db.rpc_stock_functions": "ok",
  "db.rpc_order_functions": "ok",
  "db.rpc_inventory_functions": "ok",
  "db.migration_005": "ok",
  "db.migration_006": "ok"
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
│   │   ├── alerts/page.tsx    — Üretim & Stok uyarıları
│   │   ├── parasut/page.tsx   — Paraşüt muhasebe sync dashboard
│   │   ├── purchase/suggested/page.tsx — Yeniden sipariş önerileri
│   │   └── settings/page.tsx  — Firma + kullanıcı + API ayarları
│   ├── api/                   — Route handler'lar (Next.js App Router)
│   │   ├── health/route.ts    — Sağlık kontrolü endpoint'i
│   │   ├── orders/            — CRUD + durum geçişleri
│   │   ├── products/          — CRUD
│   │   ├── customers/         — CRUD
│   │   ├── production/        — CRUD
│   │   ├── alerts/            — CRUD + scan
│   │   ├── import/            — AI dosya parse akışı
│   │   ├── ai/                — parse + score + ops-summary endpoint'leri
│   │   └── parasut/           — Muhasebe sync
│   └── globals.css            — CSS variables (dark theme)
├── components/
│   ├── layout/                — Sidebar, Topbar
│   └── dashboard/             — StatsCards, RecentOrders vb.
└── lib/
    ├── supabase/              — DB client + tablo query fonksiyonları
    ├── services/              — İş mantığı servisleri
    ├── api-error.ts           — Merkezi API hata yönetimi
    ├── api-mappers.ts         — DB row → frontend model dönüşümleri
    ├── data-context.tsx       — Client-side React context (gerçek API'ye bağlı)
    ├── database.types.ts      — Supabase tablo tipleri (snake_case)
    ├── mock-data.ts           — Frontend interface tanımları (camelCase)
    └── stock-utils.ts         — coverage_days, daysColor yardımcıları
supabase/
└── migrations/                — SQL migration dosyaları (sırayla uygula)
```

---

## Bu Projeyi İlk Açıyorsan

### Okuma Sırası
1. `README.md` (bu dosya) — kurulum ve ortam
2. `domain-rules.md` — sistemin ne yapması/yapmaması gerektiğini anla
3. `implementation-roadmap.md` — hangi fazlar tamamlandı, ne kaldı
4. `src/lib/database.types.ts` — DB şemasını anlamak için
5. `src/lib/api-mappers.ts` — DB ↔ frontend veri akışını anlamak için
6. `CLAUDE.md` — kodlama kuralları ve mimari özet

### Kritik Kurallar (hızlı özet)
- **Stil:** Sadece inline styles + CSS variables. Tailwind class kullanma.
- **Framer Motion:** Kurulu ama YASAK. Import etme.
- **`"use client"`:** Tüm interaktif component'larda zorunlu.
- **Renk:** `var(--text-primary)`, `var(--accent-bg)` vb. CSS variables kullan.

### Mimari Özet
- DB → frontend: `src/lib/api-mappers.ts` mapper fonksiyonları
- Global state: `src/lib/data-context.tsx` (gerçek API'ye bağlı, `refetchAll` expose eder)
- DB tipleri: `src/lib/database.types.ts` (snake_case, Supabase şemasına parallel)
- Frontend tipleri: `src/lib/mock-data.ts` (camelCase interfaces)
- İş mantığı: `src/lib/services/` klasörü (order, alert, production, parasut, AI...)
- 38 API route: `src/app/api/` altında Next.js App Router route handler'ları

### Order Durum Eksenları
```
commercial_status:  draft → pending_approval → approved → cancelled
fulfillment_status: unallocated → partially_allocated → allocated → partially_shipped → shipped
```
Rezervasyon sadece `approved` durumda tetiklenir.

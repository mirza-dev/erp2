# KokpitERP

PMT Endüstriyel için yapay zeka destekli ERP sistemi. Endüstriyel vana satışı (B2B).

**Stack:** Next.js 16 · TypeScript · Supabase · Tailwind CSS (inline styles ile)

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
| `ANTHROPIC_API_KEY` | Opsiyonel | AI özet, puanlama ve parse için. Eksikse sistem çalışır; AI özellikleri devre dışı kalır. [console.anthropic.com](https://console.anthropic.com/settings/keys) |
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
| 7 | `007_rpc_hotfix.sql` | Sipariş RPC hotfix'leri |
| 8 | `008_inventory_rpc_hotfix.sql` | Envanter/üretim RPC hotfix'leri |
| 9 | `009_audit_log_entity_id_text.sql` | `audit_log.entity_id` kolonu `text` hotfix'i — runtime uuid/text hatasını kapatır |
| 10 | `010_ai_recommendations.sql` | `ai_recommendations` + `ai_feedback` tabloları — AI karar yaşam döngüsü (kabul/düzenle/reddet) |
| 11 | `011_fix_ship_order_uuid.sql` | `ship_order_full()` RPC'de UUID/text tip uyumsuzluğu hotfix'i |
| 12 | `012_excel_full_import.sql` | `quotes`, `shipments`, `invoices`, `payments` tabloları + `sales_orders`/`customers`/`products` genişletilmiş alanlar (incoterm, cost_price, weight_kg vb.) |
| 13 | `013_ai_entity_aliases.sql` | `ai_entity_aliases` tablosu — import dedup öğrenme (ham değer → DB entity eşleşmesi) |
| 14 | `014_ai_runs.sql` | `ai_runs` tablosu — AI çağrı gözlemlenebilirlik kaydı (fire-and-forget, opsiyonel) |
| 15 | `015_product_identity_fields.sql` | `products`'a 8 kimlik alanı (material_quality, origin_country, certifications vb.) — products CRUD bağımlı, zorunlu |
| 16 | `016_health_check_utils.sql` | `check_migration_011_applied()` tanı fonksiyonu — `pg_proc.prosrc` üzerinden 011 UUID fix'ini doğrular, `/api/health` bağımlısı |
| 17 | `017_enable_rls.sql` | 23 tabloda Row Level Security etkinleştirme — anon key ile doğrudan DB erişimini engeller; `service_role` bypass eder, uygulama etkilenmez |
| 18 | `018_create_order_rpc.sql` | `create_order_with_lines()` RPC — atomik sipariş oluşturma (header + satırlar tek transaction'da); `dbCreateOrder` bu RPC'ye bağımlı, zorunlu |

**Supabase CLI ile:**
```bash
supabase db push
```

**Dashboard ile:** SQL Editor → her dosyayı sırayla çalıştır.

> ⚠️ Migration'lar sırayla uygulanmalı. `002` olmadan üretim/sevkiyat, `003`–`004` olmadan sipariş geçişleri ve rezervasyon, `006` olmadan lead-time aware satın alma önerisi, `009` olmadan bazı sipariş transition'larında `entity_id uuid / text` hatası görülebilir. `010` olmadan AI öneri kararları ve satın alma önerileri, `011` olmadan sevkiyat sırasında UUID/text tip hatası, `012` olmadan Excel import flow, `013` olmadan import dedup çalışmaz. `015` olmadan ürün oluşturma ve güncelleme işlemleri kırılır (identity alanları her INSERT/UPDATE'e dahil edilir). `016` olmadan `/api/health` 011 fix'ini doğrulayamaz (`db.migration_011` check'i PGRST202 döndürür). `017` olmadan RLS kapalı kalır ve anon key ile doğrudan veritabanına erişilebilir. `018` olmadan sipariş oluşturma kırılır (`dbCreateOrder` `create_order_with_lines` RPC'ye bağımlıdır).

---

## Health Check

```
GET /api/health
```

Env değişkenlerini ve tablo/migration varlığını kontrol eder.

- **HTTP 200** → sistem hazır (AI ve Paraşüt opsiyonel, eksikse 503 dönmez; `ai_runs` tablosu da opsiyonel)
- **HTTP 503** → eksik zorunlu env (Supabase) veya uygulanmamış migration

```jsonc
// AI yapılandırılmış — tam kapasite
{
  "env.SUPABASE_URL": "ok",
  "env.SERVICE_ROLE_KEY": "ok",
  "ai.ANTHROPIC_API_KEY": "ok",
  "env.PARASUT_CLIENT_ID": "MISSING (optional)",
  "db.customers": "ok",
  // ...migration check'ler
}

// AI yapılandırılmamış — sistem çalışıyor, AI özellikleri devre dışı
{
  "env.SUPABASE_URL": "ok",
  "env.SERVICE_ROLE_KEY": "ok",
  "ai.ANTHROPIC_API_KEY": "disabled (AI features unavailable)",
  "env.PARASUT_CLIENT_ID": "MISSING (optional)",
  "db.customers": "ok",
  // ...
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
│   │   ├── alerts/            — CRUD + scan + AI öneri
│   │   ├── import/            — AI dosya parse akışı (batch → drafts → confirm)
│   │   ├── inventory/movements/ — Stok hareketi kayıt (üretim/giriş/düzeltme)
│   │   ├── purchase/          — scan + suggestions
│   │   ├── recommendations/   — AI öneri CRUD + karar (kabul/düzenle/reddet)
│   │   ├── ai/                — parse + score + ops-summary + stock-risk + observability
│   │   ├── parasut/           — Muhasebe sync
│   │   └── seed/              — Test verisi seed endpoint'i
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
- 37 API route: `src/app/api/` altında Next.js App Router route handler'ları

### Order Durum Eksenları
```
commercial_status:  draft → pending_approval → approved → cancelled
fulfillment_status: unallocated → partially_allocated → allocated → partially_shipped → shipped
```
Rezervasyon sadece `approved` durumda tetiklenir.

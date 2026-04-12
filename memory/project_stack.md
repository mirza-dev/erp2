---
name: KokpitERP — Stack ve Kodlama Kuralları
description: Teknoloji stack, kritik kodlama kuralları, klasör yapısı ve veri modelleri
type: project
---

**Çalışma dizini:** `/Users/mirzasaribiyik/Projects/erp2`
**GitHub:** `mirza-dev/erp2` (public repo)

**Stack:** Next.js 15 · TypeScript · Supabase (15+ tablo, 26 migration) · Tailwind kurulu ama kullanılmıyor
**Font:** `geist` npm paketi (`geist/font/sans`, `geist/font/mono`) — `next/font/google` değil; build sırasında ağ bağımlılığı yok

---

## Kritik kodlama kuralları

- **Sadece inline styles + CSS variables** — Tailwind class YASAK
- **Framer Motion import YASAK** (kurulu ama yasak)
- Her interaktif component için `"use client";`
- Renk: `var(--text-primary/secondary/tertiary)`, `var(--bg-primary/secondary/tertiary)`, `var(--border-primary/secondary/tertiary)`, `var(--accent/success/warning/danger)` + `-bg/-text/-border` varyantları
- CSS `animation` ve `transition` sadece gerekli yerde (hover, progress bar)

---

## Klasör yapısı

```
src/
├── app/
│   ├── dashboard/          — tüm dashboard sayfaları
│   │   ├── orders/         — liste, yeni, [id] detay
│   │   ├── products/       — stok & ürünler
│   │   ├── customers/      — cariler
│   │   ├── production/     — üretim kaydı (ses + form)
│   │   ├── import/         — AI dosya içe aktarma (7-adım wizard)
│   │   ├── alerts/         — üretim & stok uyarıları
│   │   ├── parasut/        — muhasebe sync dashboard
│   │   ├── purchase/suggested/ — yeniden sipariş önerileri
│   │   └── settings/       — firma + kullanıcı + API ayarları
│   ├── api/                — route handler'lar (Next.js App Router)
│   └── globals.css         — CSS variables (dark theme)
├── components/
│   ├── layout/             — Sidebar, Topbar
│   ├── dashboard/          — StatsCards, RecentOrders, AIAlerts
│   ├── ui/                 — Button, Toast, DemoBanner, DemoButton
│   └── customers/          — CustomerDetailPanel
└── lib/
    ├── supabase/            — DB client + tablo query fonksiyonları (service.ts, orders.ts, ...)
    ├── services/            — iş mantığı (order/alert/production/purchase/parasut/import/ai service)
    ├── database.types.ts    — Supabase tablo tipleri (snake_case)
    ├── api-mappers.ts       — DB row → frontend model (mapProduct, mapCustomer, mapOrderDetail)
    ├── mock-data.ts         — frontend interface tanımları (camelCase)
    ├── data-context.tsx     — global React context (gerçek API'ye bağlı)
    ├── api-error.ts         — merkezi hata yönetimi (handleApiError)
    └── stock-utils.ts       — coverage_days, daysColor
```

---

## Veri modelleri

**Mimari katmanlar:** DB (snake_case) → `api-mappers.ts` → Frontend (camelCase)

```
Product: id, name, sku, category, unit, price, currency,
         on_hand, reserved, available_now, minStockLevel,
         isActive, productType, warehouse, reorderQty?, preferredVendor?, dailyUsage?

Customer: id, name, email, phone, address, taxNumber, taxOffice,
          country, currency, notes, isActive,
          totalOrders, totalRevenue, lastOrderDate

Order: id, orderNumber, customerName,
       commercial_status, fulfillment_status,
       grandTotal, currency, createdAt, itemCount

OrderDetail extends Order: customerId, customerEmail, customerCountry,
             customerTaxOffice, customerTaxNumber, subtotal, vatTotal, notes,
             parasutInvoiceId?, parasutSentAt?, parasutError?,
             aiConfidence?, aiReason?, aiRiskLevel?,
             lines: OrderLineItem[]
```

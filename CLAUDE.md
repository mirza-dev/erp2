# KokpitERP — Claude Code Rehberi

## Proje Özeti
PMT Endüstriyel için yapay zeka destekli ERP sistemi. Endüstriyel vana satışı (B2B).
**Stack:** Next.js 15 · TypeScript · Supabase (henüz yok, mock data) · Tailwind CSS kurulu ama kullanılmıyor

---

## Kritik Kodlama Kuralları

### Stil: Sadece Inline Styles + CSS Variables
```tsx
// DOĞRU
<div style={{ color: "var(--text-primary)", padding: "16px" }}>

// YANLIŞ — Tailwind class kullanma
<div className="text-white p-4">
```

### Animasyon Yasak
- Framer Motion import etme
- CSS `animation` ve `transition` sadece gerekli yerde (hover, progress bar gibi)

### Her interaktif component için
```tsx
"use client";
```

### Renk değerleri: Her zaman CSS variable
```
var(--text-primary)    var(--text-secondary)   var(--text-tertiary)
var(--bg-primary)      var(--bg-secondary)      var(--bg-tertiary)
var(--border-primary)  var(--border-secondary)  var(--border-tertiary)
var(--accent)          var(--accent-bg)          var(--accent-text)     var(--accent-border)
var(--success)         var(--success-bg)         var(--success-text)    var(--success-border)
var(--warning)         var(--warning-bg)         var(--warning-text)    var(--warning-border)
var(--danger)          var(--danger-bg)          var(--danger-text)     var(--danger-border)
```

---

## Proje Yapısı

```
src/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx           — Ana dashboard
│   │   ├── layout.tsx         — Sidebar + Topbar wrapper
│   │   ├── orders/
│   │   │   ├── page.tsx       — Sipariş listesi
│   │   │   ├── new/page.tsx   — Yeni sipariş formu
│   │   │   └── [id]/page.tsx  — Sipariş detay + durum geçişleri
│   │   ├── products/page.tsx  — Stok & Ürünler
│   │   ├── customers/page.tsx — Cariler
│   │   ├── import/page.tsx    — AI dosya içe aktarma
│   │   └── alerts/page.tsx    — Üretim & Stok uyarıları
│   └── globals.css            — CSS variables tanımı
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx        — Sol nav (navGroups array'i)
│   │   └── Topbar.tsx         — Üst bar
│   ├── dashboard/
│   │   ├── StatsCards.tsx
│   │   ├── StockDataGrid.tsx
│   │   ├── RecentOrders.tsx
│   │   └── AIAlerts.tsx
│   └── customers/
│       └── CustomerDetailPanel.tsx  — Sağ panel (slide-in)
└── lib/
    ├── mock-data.ts    — Tüm mock veriler + interface tanımları
    └── utils.ts        — formatCurrency, formatDate
```

---

## Veri Modelleri (mock-data.ts)

```ts
Product       — id, name, sku, category, unit, price, currency,
                totalStock, allocatedStock, availableStock, minStockLevel, isActive

Customer      — id, name, email, phone, address, taxNumber, taxOffice,
                country, currency, notes, isActive, totalOrders, totalRevenue, lastOrderDate

Order         — id, orderNumber, customerName, status, grandTotal,
                currency, createdAt, itemCount

OrderLineItem — id, productId, productName, productSku, unit,
                quantity, unitPrice, discountPct, lineTotal

OrderDetail extends Order — customerId, customerEmail, customerCountry,
                            customerTaxOffice, customerTaxNumber,
                            subtotal, vatTotal, notes, lines: OrderLineItem[]
```

**Order status flow:** `DRAFT → PENDING → APPROVED → SHIPPED` | `CANCELLED`

---

## Sipariş Hesaplama
```ts
lineTotal = quantity * unitPrice * (1 - discountPct / 100)
subtotal  = sum(lineTotals)
vatTotal  = subtotal * 0.20   // KDV %20
grandTotal = subtotal + vatTotal
```

---

## Sonraki Adımlar (Backend)
1. Supabase kurulumu + schema oluşturma
2. mock-data.ts → Supabase queries ile değiştir
3. Server Actions veya API routes ekle
4. Paraşüt entegrasyonu (muhasebe sync)
5. AI model entegrasyonu (dosya parse için)

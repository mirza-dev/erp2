# Filtreleme Geliştirme Planı

_Oluşturulma: 2026-04-10_

## Genel Yaklaşım

Üç faz, artan karmaşıklık sırasıyla. Her faz bağımsız tamamlanabilir.
UI kuralları: inline styles + CSS variables, animasyon yok, Turkish UI.

---

## Faz 1 — Eksik Aramaları Ekle

**Kapsam:** Alerts, Purchase Suggestions, Products Aging sayfalarına SKU/ad arama kutusu.
**Efor:** Düşük (her sayfa ~15 satır değişiklik)
**Risk:** Sıfır — sadece client-side state

### 1A — Alerts Page (`src/app/dashboard/alerts/page.tsx`)

**Eklenecek state (satır 97 civarı):**
```ts
const [search, setSearch] = useState("");
```

**Filtre logic değişikliği (satır 175, `filtered` satırı):**
```ts
const searched = search.trim().toLowerCase();
const searchedGroups = searched
    ? productGroups.filter(
        (g) =>
          g.productName.toLowerCase().includes(searched) ||
          g.sku.toLowerCase().includes(searched)
      )
    : productGroups;

const filtered =
    activeFilter === "all"      ? searchedGroups
  : activeFilter === "critical" ? searchedGroups.filter((g) => g.topSeverity === "critical")
  : activeFilter === "warning"  ? searchedGroups.filter((g) => g.topSeverity === "warning")
  : searchedGroups.filter((g) => g.alerts.some((a) => a.type === "order_shortage"));
```

**UI — arama inputu (tab bar'ın sağına, ~satır 458 sonrası):**
```tsx
<input
    type="text"
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="Ürün adı veya SKU..."
    style={{
        fontSize: "12px",
        padding: "6px 12px",
        border: "0.5px solid var(--border-secondary)",
        borderRadius: "6px",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        width: "200px",
        outline: "none",
    }}
/>
```

---

### 1B — Purchase Suggested Page (`src/app/dashboard/purchase/suggested/page.tsx`)

**Eklenecek state (satır 468 civarı, diğer state'lerin yanına):**
```ts
const [search, setSearch] = useState("");
```

**Filtre logic değişikliği (`filtered` tanımına ek koşul):**
```ts
const searched = search.trim().toLowerCase();
const filtered = (filter === "all" ? reorderSuggestions : reorderSuggestions.filter(p => p.productType === filter))
    .filter(p =>
        !searched ||
        p.name.toLowerCase().includes(searched) ||
        p.sku.toLowerCase().includes(searched)
    );
```

**UI — header arama inputu (type filter tab'larının yanına):**
Aynı input pattern, placeholder: `"Ürün adı veya SKU..."`

---

### 1C — Products Aging Page (`src/app/dashboard/products/aging/page.tsx`)

**Eklenecek state (satır 39 civarı):**
```ts
const [search, setSearch] = useState("");
```

**Filtre logic değişikliği (satır 64):**
```ts
// Önce:
const filtered = filter === "all" ? rows : rows.filter(r => r.agingCategory === filter);

// Sonra:
const searched = search.trim().toLowerCase();
const filtered = (filter === "all" ? rows : rows.filter(r => r.agingCategory === filter))
    .filter(r =>
        !searched ||
        r.name.toLowerCase().includes(searched) ||
        r.sku.toLowerCase().includes(searched)
    );
```

**UI — filter tab'larının hemen sağına veya üstüne arama inputu**

**Not:** `AgingRow` tipinde `name` ve `sku` field'larının var olduğu doğrulanmalı (`src/lib/supabase/aging.ts`).

---

### Faz 1 Doğrulama

- [ ] `npx tsc --noEmit` → 0 hata
- [ ] Alerts: "Vana" yazınca sadece Vana içeren ürün grupları kalır
- [ ] Purchase: "DN" yazınca SKU'da DN geçen ürünler filtreler
- [ ] Aging: arama + category tab birlikte çalışır (AND mantığı)

---

## Faz 2 — Alerts Sayfası Güçlendirme

**Kapsam:** Alerts sayfasına alert TİPİ filtresi + sipariş bazlı uyarılar (quote_expired, overdue_shipment) için ayrı section.
**Efor:** Orta (~80 satır değişiklik)
**Risk:** Düşük — mevcut product grouping mantığı korunur, sipariş uyarıları ayrı render edilir

### 2A — AlertFilter tipini genişlet

**`src/app/dashboard/alerts/page.tsx`, satır 16 civarı:**
```ts
// Önce:
type AlertFilter = "all" | "critical" | "warning" | "order_shortage";

// Sonra:
type AlertFilter =
    | "all"
    | "critical"
    | "warning"
    | "order_shortage"
    | "quote_expired"
    | "overdue_shipment";
```

**Tab listesine iki yeni tab ekle:**
```ts
{ key: "quote_expired" as AlertFilter,     label: "Teklif Süresi",  count: quoteExpiredCount, dot: "var(--warning)" },
{ key: "overdue_shipment" as AlertFilter,  label: "Geciken Sevkiyat", count: overdueCount,   dot: "var(--danger)"  },
```

### 2B — Sipariş uyarılarını ayır

`productGroups` hesaplanırken `entity_type = 'sales_order'` olan alertlar ürün gruplarına karışıyor (isOrphaned = true olarak). Bunları ayır:

```ts
// grouping'den ÖNCE:
const sysAlerts = activeAlerts.filter((a) => a.source !== "ai" && a.entity_id);
const productAlerts = sysAlerts.filter((a) => a.entity_type === "sales_order" ? false : true);
const orderAlerts   = sysAlerts.filter((a) => a.entity_type === "sales_order");
```

`productGroups` hesaplamasında `sysAlerts` yerine `productAlerts` kullan.

**`orderAlerts` için count hesapla:**
```ts
const quoteExpiredCount = orderAlerts.filter(a => a.type === "quote_expired").length;
const overdueCount      = orderAlerts.filter(a => a.type === "overdue_shipment").length;
```

**Filtre logic'e iki yeni branch ekle:**
```ts
const filtered =
    activeFilter === "all"             ? searchedGroups
  : activeFilter === "critical"        ? searchedGroups.filter((g) => g.topSeverity === "critical")
  : activeFilter === "warning"         ? searchedGroups.filter((g) => g.topSeverity === "warning")
  : activeFilter === "order_shortage"  ? searchedGroups.filter((g) => g.alerts.some((a) => a.type === "order_shortage"))
  : []; // quote_expired / overdue_shipment → ayrı section'da gösterilir, product groups boş
```

### 2C — Sipariş uyarıları section'ı

Tab `quote_expired` veya `overdue_shipment` seçiliyse, product groups tablosunun yerine (veya altına) sipariş uyarı listesi göster:

```tsx
{(activeFilter === "quote_expired" || activeFilter === "overdue_shipment") && (
    <div style={{ padding: "16px 20px" }}>
        {orderAlerts
            .filter(a => a.type === activeFilter)
            .map(alert => (
                <div key={alert.id} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    borderBottom: "0.5px solid var(--border-tertiary)",
                    gap: "12px",
                }}>
                    <div>
                        <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                            {alert.title}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                            {alert.description}
                        </div>
                    </div>
                    <Link
                        href={`/dashboard/orders/${alert.entity_id}`}
                        style={{ fontSize: "12px", color: "var(--accent)", whiteSpace: "nowrap" }}
                    >
                        Siparişe Git →
                    </Link>
                </div>
            ))
        }
        {orderAlerts.filter(a => a.type === activeFilter).length === 0 && (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--text-tertiary)", fontSize: "13px" }}>
                Bu tipte aktif uyarı yok.
            </div>
        )}
    </div>
)}
```

### Faz 2 Doğrulama

- [ ] "Teklif Süresi" tab'ı: quote_expired alertları siparişe link olarak listelenir
- [ ] "Geciken Sevkiyat" tab'ı: overdue_shipment alertları görünür
- [ ] Tümü tab'ı: eski davranış korunur (ürün grupları)
- [ ] Sipariş tipli alertlar artık "Silinmiş Ürün" olarak görünmez
- [ ] Arama (Faz 1'den) product groups'u filtreler, order alerts'i etkilemez

---

## Faz 3 — Orders Gelişmiş Filtreler + URL Persistence

**Kapsam:** Orders sayfasına tarih aralığı, para birimi filtresi; tüm filtreler URL'de persist.
**Efor:** Orta-yüksek (~120 satır değişiklik)
**Risk:** Orta — `useSearchParams` kullanımı var, Suspense wrapper mevcut

### 3A — Yeni Filter State'leri

**`src/app/dashboard/orders/page.tsx`, `OrdersList` component içi:**
```ts
const [dateFrom, setDateFrom]       = useState("");   // "YYYY-MM-DD" | ""
const [dateTo, setDateTo]           = useState("");   // "YYYY-MM-DD" | ""
const [currencyFilter, setCurrencyFilter] = useState(""); // "USD" | "EUR" | "TRY" | ""
```

### 3B — URL Persistence

Mevcut `useSearchParams` kullanımı `customerIdFilter` için var. Bunu tüm filtrelere genişlet:

**Sayfa mount'unda (mevcut `filterAppliedRef` pattern ile):**
```ts
useEffect(() => {
    if (filterAppliedRef.current) return;
    filterAppliedRef.current = true;

    const customer  = searchParams.get("customer");
    const tab       = searchParams.get("tab");
    const from      = searchParams.get("from");
    const to        = searchParams.get("to");
    const currency  = searchParams.get("currency");

    if (customer) setCustomerIdFilter(customer);
    if (tab && filterTabs.some(t => t.id === tab)) setActiveTab(tab as FilterTab);
    if (from) setDateFrom(from);
    if (to) setDateTo(to);
    if (currency) setCurrencyFilter(currency);
}, [searchParams]);
```

**Filter değiştiğinde URL'i güncelle (replace, push değil):**
```ts
useEffect(() => {
    const params = new URLSearchParams();
    if (customerIdFilter) params.set("customer", customerIdFilter);
    if (activeTab !== "ALL") params.set("tab", activeTab);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (currencyFilter) params.set("currency", currencyFilter);
    router.replace(`?${params.toString()}`, { scroll: false });
}, [activeTab, customerIdFilter, dateFrom, dateTo, currencyFilter, router]);
```

### 3C — Genişletilmiş Filter Logic

```ts
const filtered = mockOrders.filter((o) => {
    if (customerIdFilter && o.customerId !== customerIdFilter) return false;
    if (!matchesTab(o, activeTab)) return false;

    const matchSearch =
        !search ||
        o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        o.customerName.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;

    // Tarih aralığı (o.createdAt: "YYYY-MM-DDTHH:MM:SSZ" formatında)
    const orderDate = o.createdAt?.slice(0, 10) ?? "";
    if (dateFrom && orderDate < dateFrom) return false;
    if (dateTo   && orderDate > dateTo)   return false;

    // Para birimi
    if (currencyFilter && o.currency !== currencyFilter) return false;

    return true;
});
```

### 3D — UI: Gelişmiş Filtre Satırı

Mevcut arama inputunun altına (veya yanına açılan collapse panel) ikinci filtre satırı:

```tsx
{/* Gelişmiş Filtreler Satırı */}
<div style={{
    display: "flex",
    gap: "8px",
    alignItems: "center",
    padding: "0 20px 12px",
    flexWrap: "wrap",
}}>
    {/* Tarih Aralığı */}
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Tarih:</span>
        <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
                fontSize: "12px",
                padding: "5px 8px",
                border: "0.5px solid var(--border-secondary)",
                borderRadius: "6px",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                outline: "none",
            }}
        />
        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>—</span>
        <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
                fontSize: "12px",
                padding: "5px 8px",
                border: "0.5px solid var(--border-secondary)",
                borderRadius: "6px",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                outline: "none",
            }}
        />
    </div>

    {/* Para Birimi */}
    <select
        value={currencyFilter}
        onChange={(e) => setCurrencyFilter(e.target.value)}
        style={{
            fontSize: "12px",
            padding: "5px 8px",
            border: "0.5px solid var(--border-secondary)",
            borderRadius: "6px",
            background: "var(--bg-primary)",
            color: currencyFilter ? "var(--text-primary)" : "var(--text-tertiary)",
            outline: "none",
            cursor: "pointer",
        }}
    >
        <option value="">Tüm Para Birimleri</option>
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
        <option value="TRY">TRY</option>
    </select>

    {/* Filtreleri Temizle */}
    {(dateFrom || dateTo || currencyFilter || customerIdFilter) && (
        <button
            onClick={() => {
                setDateFrom("");
                setDateTo("");
                setCurrencyFilter("");
                setCustomerIdFilter(null);
            }}
            style={{
                fontSize: "12px",
                padding: "5px 10px",
                border: "0.5px solid var(--border-secondary)",
                borderRadius: "6px",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
            }}
        >
            × Filtreleri Temizle
        </button>
    )}
</div>
```

**"Filtreleri Temizle" butonu:** `dateFrom`, `dateTo`, `currencyFilter`, `customerIdFilter` aynı anda sıfırlar.

### Faz 3 Doğrulama

- [ ] `?tab=approved` URL'i ile açıldığında Onaylı tab aktif gelir
- [ ] `?from=2026-01-01&to=2026-03-31` ile sadece Q1 siparişleri görünür
- [ ] `?currency=USD` ile sadece USD siparişleri listeler
- [ ] Filtre değiştikçe URL otomatik güncellenir (browser back çalışır)
- [ ] "Filtreleri Temizle" butonu tüm advanced filtreleri sıfırlar, URL temizlenir
- [ ] `npx tsc --noEmit` → 0 hata

---

## Değişen Dosyalar Özeti

| Dosya | Faz | Değişiklik |
|-------|-----|-----------|
| `src/app/dashboard/alerts/page.tsx` | 1 + 2 | search state + type filtresi + order alerts section |
| `src/app/dashboard/purchase/suggested/page.tsx` | 1 | search state + UI |
| `src/app/dashboard/products/aging/page.tsx` | 1 | search state + UI |
| `src/app/dashboard/orders/page.tsx` | 3 | dateFrom/dateTo/currency state + URL persistence + UI |

---

## Kapsam Dışı

- Customers sayfası filtreleri (ülke/gelir) — düşük operasyonel değer
- Production geçmiş filtreleri — production page ayrıca refactor gerektirir
- Range slider (miktar/tutar) — date+currency zaten yeterli, sonra eklenebilir
- Sayfa başına sonuç sayısı (pagination/page-size) — ayrı bir özellik
- Saved filter presets — karmaşıklık değere değmez şu an

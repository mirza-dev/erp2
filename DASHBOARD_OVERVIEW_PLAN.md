# Genel Bakış (Executive Dashboard) — Uygulama Planı

> ⚠️ **2026-06-09 GÜNCELLEME — TAM-SADIK YENİDEN KURULUM TAMAMLANDI (GREEN, PUSH BEKLİYOR).**
> Aşağıdaki "Faz 1 (gerçek paneller) + Faz 2 (sentetik ertelemesi)" planı **SUPERSEDED**.
> Kullanıcı Faz 1'i tasarıma uymuyor buldu (5/6 KPI, maliyet kapalı, Finansal Özet+Üretim
> panelleri yok, uydurma link kartları) → direktif: **tasarıma BİREBİR uy + eksik backend kur.**
> **Yapıldı (A→G):** mig.087 `dashboard_monthly_cogs` RPC + `GET /api/dashboard/finance`
> (gerçek COGS, **mig.087 APPLY EDİLDİ ✅** canlı API kanıtı); view-model **tek raporlama
> para birimine normalizasyon** + **6 KPI** + receivables(siparişten türev dürüst) + production
> good/scrap(gerçek `scrap_qty`); FinancePanel/ProductionPanel/AiPanel YENİ; page.tsx sadık
> `DashDetailed` düzeni (Finance·Production·Orders | Stock·Reorder·Alerts + AiPanel). HeatPanel/
> MarginGauge KURULMADI (tasarımda render edilmiyor). segment/Rapor-indir dekoratif. tsc/lint/build 0,
> **4962 test**. Görsel doğrulama (Playwright login→screenshot) = `DashDetailed` birebir, koyu+aydınlık+mobil.
> Detay: `memory/current_focus.md` + plan-modu MD (TAM-SADIK). **Sıradaki:** mirror push onayı.
>
> ---
>
> **Kalıcı plan dosyası** (proje konvansiyonu: `ALERTS_CALENDAR_PLAN.md`,
> `QUOTES_V2_PLAN.md`, `IMPORT_WRITE_UPGRADE_PLAN.md` gibi). Aşağısı tarihsel Faz 1/2 kaydı.

---

## Context — neden bu değişiklik

`roven-dashboard 2/` tasarım paketi (repo kökünde, lint/commit dışı "scraped junk")
mevcut `/dashboard` sayfasını **yönetici "Genel Bakış" paneline** dönüştürür. Şu anki
dashboard stok-tablosu merkezli (StatsCards + StockDataGrid + RecentOrders + import drop
zone). Tasarım ise **KPI şeridi + ciro/maliyet trendi + finans/üretim/stok/uyarı/sipariş
panelleri**ni tek yönetici ekranında toplayan premium bir bakış sunar.

**Tasarım paketi içeriği** (React 18 UMD + Babel tarayıcı-içi prototip, build adımı yok):
- `dashboard-app.jsx` (404 satır) — `Panel` (collapsible), `KpiCard` (sparkline+tone),
  `AiPanel`, `StockPanel` (donut), `ProductionPanel` (bar good/scrap), `ReorderPanel`,
  `FinancePanel` (brüt kâr + money-flow bar + aging), `AlertsPanel`, `HeatPanel`,
  `OrdersPanel`, `PageHeader` (Genel Bakış + tarih-aralığı segment + Rapor indir),
  `DashDetailed` düzeni, `App` (tweaks paneli + accent presets).
- `charts.jsx` (338 satır) — saf SVG: `Sparkline`, `TrendChart` (area+line+hover tooltip+
  crosshair), `Donut` (hover segment), `MarginGauge` (270° radial), `BarChart` (stacked
  good/scrap), `AgingBars` (yatay progress), `Heatmap` (istasyon×hafta). Dış kütüphane yok.
- `data.js` (446 satır) — `buildViewModel(entities)` gerçek REST şekillerinden hesaplar
  (`/api/products?all=1`, `/api/customers`, `/api/orders?all=1`, `/api/production`,
  `/api/alerts`, `/api/exchange-rates`). **USD raporlama.** Hem canlı-API loader hem
  offline fallback dataset.
- `roven-theme.css` (347 satır) — token sistemi (dark+light) + `.r-card`/`.badge`/`.seg`/
  `.kpi-strip`/`.row-link`/grid sınıfları.
- `shell.jsx` — Sidebar/Topbar/RovenLogo → **PORT EDİLMEZ** (gerçek `dashboard/layout.tsx`
  zaten Sidebar+Topbar+tema sahibi).

**Kritik gerçek:** Prototip mock veriyle çalışır; `data.js` bazı değerleri **uydurur**
(aşağıda "Veri gerçeği" tablosu). Bu iş prototipi körü körüne kopyalamak değil —
**tasarımı gerçek `useData()` verisine bağlamak**, gerçek-kaynağı olmayan panelleri
dürüstçe işaretlemek/çıkarmak, ve **finansal panelleri RBAC ile korumak**.

### Doğrulanan kod gerçekleri (grep'lendi)
- `useData()` (`src/lib/data-context.tsx`) sağlar: `products`, `customers`, `orders`,
  `uretimKayitlari`, `openAlerts`, `reorderSuggestions`, `activeAlertCount`, `loading`,
  `refetchAll` — **tasarımın hesapladığı tüm entity'ler hazır.** Yeni fetch GEREKMEZ.
- `globals.css`'te `--chart-grid` ve `--chart-track` **YOK** (grep boş) → iki temaya da
  eklenecek (charts.jsx bunları kullanır). Diğer tüm tasarım tokenları zaten var
  (`--accent`/`--surface-raised`/`--success-text`/`--accent-bg-strong`/`--accent-glow`...).
- `maskCurrency(amount, currency, canView)` `src/lib/utils.ts`'te mevcut (RBAC Faz 7).
- `usePermissions()` (`src/lib/auth/use-permissions.tsx`): `has(perm)` + `canViewSalesPrices`
  / `canViewPurchaseCosts` / `canViewFinancialSummary` türevleri hazır.
- `/api/exchange-rates/route.ts` mevcut (kur şeridi gerçek).
- `StockDataGrid` **yalnız** `src/app/dashboard/page.tsx`'te kullanılıyor → güvenle taşınır.
- `StatsCards` **yalnız** `src/app/dashboard/page.tsx`'te kullanılıyor → KPI şeridi ile
  değiştirilir (component dosyası repoda kalır = sessiz silme değil).
- Frontend `Product` zaten `promisable`/`available_now`/`quoted`/`forecasted`/`costPrice`
  taşır; `Order` `commercial_status`/`fulfillment_status`/`grandTotal`/`currency` taşır.

---

## Mimari kararlar (kilitli — danışman onaylı yön)

1. **Sadece içerik portu, kabuk değil.** Sidebar/Topbar/RovenLogo (`shell.jsx`)
   PORT EDİLMEZ — `dashboard/layout.tsx` zaten sahibi. `100vh`/`overflow:hidden`
   yok; içerik shell içinde doğal akar (Alerts Calendar dersi).
2. **Inline style + CSS var ZORUNLU.** Prototip zaten bu paterni kullanıyor
   (Tailwind/Framer yok) → birebir uyumlu. SVG grafikler saf, dış dep yok.
3. **Pure view-model helper.** `src/lib/dashboard-view-model.ts` — `data.js`'in
   `buildViewModel`'inden türetilir ama **tip-güvenli + test edilebilir**
   (precedent: `alert-calendar.ts`). UI bileşenleri hesaplama yapmaz; helper tek kaynak.
4. **RBAC finansal gating HARD gereksinim** (danışman: soru değil, zorunlu).
   `/api/products?all=1` viewer rolüne `price`/`cost_price` `null` döner (server redaction).
   Finansal paneller (KPI ciro/stok-değeri/alacak, Finans paneli, Donut $ değer, Orders
   tutar, Trend) **`usePermissions()` ile gate'lenir + `maskCurrency` ile maskelenir** →
   hem sızıntı önlenir hem NaN/0 çöp görünmez.
5. **Prototip-only kontroller DROP** (decide-and-document): tarih-aralığı segment
   (Bugün/Hafta/Ay/Çeyrek — backend yok), accent presetleri, Sade/Detaylı toggle, Tweaks
   paneli, "Rapor indir" butonu. Tema Topbar'daki mevcut `ThemeToggle`'dan gelir.
6. **Taşıma, silme değil** (`feedback_no_silent_deletes`): `StockDataGrid` →
   `/dashboard/products`'a link (zaten orada tam liste var); import drop zone →
   `/dashboard/import` linki (Genel Bakış'ta küçük bir kart olarak kalabilir).

---

## Veri gerçeği — tasarım alanı → gerçek kaynak

| Panel / alan | Gerçek kaynak | Durum |
|---|---|---|
| **KPI: Aylık Ciro** | `orders` (approved+pending, ay bazında `grandTotal` toplamı) | ✅ gerçek (RBAC-gated) |
| **KPI: Açık Siparişler** | `orders` (approved/pending & ≠shipped) sayısı + değeri | ✅ gerçek |
| **KPI: Stok Değeri** | `products` (`on_hand × price`) | ✅ gerçek (RBAC-gated) |
| **KPI: Bugünkü Üretim** | `uretimKayitlari` (bugün `adet` toplamı) | ✅ gerçek |
| **KPI: Açık Alacak** | **GERÇEK KAYNAK YOK** (cari/fatura alacak feed'i yok) | ⚠️ sentetik |
| **KPI: Kritik Uyarılar** | `openAlerts` / `activeAlertCount` | ✅ gerçek |
| **Ciro & Maliyet Trendi** | ciro `orders`'tan gerçek; **maliyet = ciro×0.71 UYDURMA** | 🟡 yarı-sentetik |
| **Stok Dağılımı (Donut)** | `products` (`on_hand × price`, kategori bazında) | ✅ gerçek (RBAC-gated) |
| **Satın Alma Önerileri** | `reorderSuggestions` (zaten `useData`'da) | ✅ gerçek |
| **Finansal Özet** | ciro gerçek; **maliyet/kâr/aging UYDURMA** | ⚠️ sentetik |
| **Üretim (good/scrap bar)** | good `uretimKayitlari` gerçek; **scrap = random 3-7% UYDURMA** | 🟡 yarı-sentetik |
| **Kritik Uyarılar** | `openAlerts` | ✅ gerçek |
| **Üretim Yoğunluğu (Heatmap)** | **TÜMÜYLE UYDURMA** (`rnd()`) | ⚠️ sentetik |
| **Son Siparişler** | `orders` (en yeni 5) | ✅ gerçek (RBAC-gated tutar) |
| **AI Operasyon Özeti** | mevcut `AISummaryCard` (`/api/ai/ops-summary`) reuse | ✅ gerçek |
| **Kur şeridi** | `/api/exchange-rates` | ✅ gerçek (Topbar'da zaten var) |

### Sentetik panel stratejisi (decide-and-document — uygulama anında onay noktası)
Gerçek kaynağı olmayan 4 alan (Açık Alacak KPI, Maliyet/Kâr trendi+Finans paneli,
Üretim scrap, Heatmap) için **önerilen yaklaşım: "Örnek veri / Tahmini" rozeti ile
göster** (tasarıma sadık + dürüst; kullanıcı yanıltılmaz). Alternatifler:
- **(A) "Örnek/Tahmini" rozeti** [ÖNERİLEN] — faithful görünüm, küçük `badge` + tooltip.
- **(B) Çıkar** — yalnız gerçek paneller; daha dürüst, tasarımdan sade.
- **(C) Backend kur** — gerçek alacak (Paraşüt fatura/ödeme), satır-maliyetinden kâr,
  `scrap_qty` kolonu+UI, üretim istasyon kaydı → ayrı büyük faz, dashboard gecikir.

**Faz 2 başında bu fork kullanıcıya tek soruyla netleştirilir** (AskUserQuestion); Faz 1
yalnız gerçek-veri panellerini içerdiği için fork Faz 1'i bloklamaz.

---

## Faz 1 — İskelet + view-model + gerçek-veri panelleri + RBAC

**Kapsam cümlesi:** Yeni Genel Bakış sayfasını gerçek `useData()` verisiyle kur; tüm
gerçek-kaynak paneller + RBAC gating + KPI şeridi + ciro trendi (maliyet hattı gizli/Faz 2).
Sentetik paneller Faz 2'de eklenir. StockDataGrid + import drop zone taşınır (silinmez).

### Pure view-model — `src/lib/dashboard-view-model.ts` (YENİ, test edilebilir)
`data.js buildViewModel` paterninden, gerçek frontend tiplerine (`Product`/`Order`/
`Customer`/`UretimKaydi`/`OpenAlert`) bağlı tip-güvenli helper'lar:
- `buildKpis(entities, perms)` → KPI dizisi (gerçek olanlar; finansal alanlar `canView`
  bayrağıyla maskeli değer + ham sayı ayrı taşınır ki sparkline/tone hesaplanabilsin).
- `stockValueByCategory(products)` → Donut segmentleri (`{name, value, color}`); renkler
  CSS var paleti (`var(--accent)`, `#9b8cff`, `var(--success)`, `var(--warning)`, ...).
- `monthlyRevenueTrend(orders)` → son 12 ay ciro dizisi + ay etiketleri (cancelled/draft
  hariç; `createdAt.slice(0,7)` gruplama).
- `recentOrdersView(orders, perms)` → en yeni 5 (`commercial_status`/`fulfillment_status`
  → TR durum etiketi + tone; tutar `maskCurrency`).
- `reorderView(reorderSuggestions)` → Satın Alma Önerileri satırları (urgency: promisable
  ≤0 danger / ≤min warning / else info).
- `todayProduction(uretimKayitlari)` → bugün toplam adet + tür sayısı.
- `alertsView(openAlerts)` → Kritik Uyarılar satırları (severity→tone, TR etiket).
- Saf yardımcılar: `fmtMoney`, `fmtMoneyM`, `fmtNum` (tr-TR; **proje TRY varsayılan** —
  prototipin USD'si reporting-currency varsayımıydı, gerçek veride `currency` alanı kullan).
- **Kritik:** `maskCurrency` UI'da uygulanır; helper ham sayı + `canView` bayrağı döner
  (test edilebilirlik + tek redaction sınıfı).

#### Çoklu para birimi — view-model API'sini ŞEKİLLENDİRİR (Faz 1, ertelenemez)
Tasarım USD-tek-para varsayar; gerçek veri **karışık** (`orders`/`products` `currency`
alanı taşır — Tüpraş TRY / Abdi İbrahim EUR / Enerjisa USD). TRY+USD+EUR'yu tek "Aylık
Ciro"ya toplamak yönetici panelinde **anlamsız sayı** üretir.
- **İlk adım — ayırt edici kontrol:** PMT siparişleri/ürünleri pratikte tek-para mı,
  gerçekten karışık mı? **Satın Alma Önerileri precedent'i karışık diyor** (memory:
  "€518.400 EUR / $133.600 USD" per-currency kırılım) → tek-para VARSAYMA.
- **Strateji (karışıksa) — `buildKpis`/`monthlyRevenueTrend`/`stockValueByCategory`
  imzaları buna bağlı:** ya **(i)** `/api/exchange-rates` ile tek raporlama para birimine
  normalize et (zaten kur şeridi için fetch'leniyor — ama alış/satış + hangi tarih kararı
  gerekir), ya **(ii)** Satın Alma precedent'i = per-currency kırılım (düşük risk, ama tek
  büyük KPI sayısı için tuhaf). **Uygulama anında bu seçilir** (öneri: çoğunluk-para baz +
  kalanı alt-satır kırılım, precedent'le tutarlı). `dashboard-view-model.test.ts` **karışık
  para girdisi** test case'i içerir.
- **RBAC null × agregasyon (aynı yerde fix):** viewer'a `price` `null` → `sum(on_hand ×
  price)` `maskCurrency`'den ÖNCE NaN. **Helper agregasyondan ÖNCE null/canView guard
  yapar** (null fiyatlı ürün toplama girmez, sonuç `canView=false` ise "—"); sadece son
  string'i maskelemek yetmez.

### Bileşenler — `src/components/dashboard/overview/` (inline style + CSS var)
`charts.jsx`'ten saf SVG kütüphanesi TS'e port (dış dep yok):
- `charts/Sparkline.tsx`, `charts/TrendChart.tsx`, `charts/Donut.tsx`,
  `charts/BarChart.tsx`, `charts/AgingBars.tsx`, `charts/Heatmap.tsx`,
  `charts/MarginGauge.tsx` (`useMeasure` ResizeObserver hook dahil; `toneVar`/`toneText`
  CSS-var map; `smoothPath` saf fonksiyon).
- `OverviewPanel.tsx` — `Panel` (collapsible card; başlık/sub/actions/chevron).
- `KpiCard.tsx` — hover state + opsiyonel Sparkline + tone (danger/accent/success/warning).
- `panels/`: `StockPanel`, `ReorderPanel`, `OrdersPanel`, `KpiStrip` (gerçek-veri Faz 1);
  `FinancePanel`, `ProductionPanel`, `HeatPanel`, `AiPanel` (Faz 2 / mevcut reuse).
- `AiPanel` = mevcut `AISummaryCard` reuse (yeniden yazma yok).

### Sayfa — `src/app/dashboard/page.tsx` yeniden yazımı
- **`StatsCards` → KPI şeridi ile DEĞİŞTİRİLİR** (silinmez — KPI strip zengin üst-küme;
  `StatsCards` yalnız dashboard'da kullanılıyor [grep doğrulandı], component dosyası repoda
  kalır, sayfa onu mount etmez = "replace, sessiz silme değil"). `feedback_no_silent_deletes`.
- `PageHeader` (yalnız başlık "Genel Bakış" + tarih satırı; segment/Rapor-indir DROP).
- `kpi-strip` (CSS sınıfı globals.css'e) → KpiCard'lar.
- Ciro Trendi paneli (`TrendChart`; maliyet hattı `showCost={false}` Faz 1, Faz 2'de açılır).
- `grid-1-1` iki kolon: sol (Finans→Faz2 / Üretim→Faz2 / Son Siparişler) ·
  sağ (Stok Donut / Satın Alma Önerileri / Kritik Uyarılar).
- `AiPanel` (collapsible, default kapalı — mevcut lazy-mount davranışı korunur).
- **RBAC:** finansal paneller `usePermissions()` ile sarılır; yetkisiz role panel ya
  "—" maskeli ya da gizli (KPI ciro/stok-değer/alacak → `maskCurrency`; Donut $ →
  `canViewSalesPrices` yoksa adet/oran fallback veya gizle).
- **Taşıma:** `StockDataGrid` blok → "Stok Envanteri → tümünü gör" küçük kart +
  `/dashboard/products` linki (tam liste orada). Import drop zone → `/dashboard/import`
  linki korunur. **Hiçbiri silinmez** (`feedback_no_silent_deletes`).

### globals.css
- `--chart-grid` + `--chart-track` her iki temaya (dark + light) ekle (değerler
  `roven-theme.css`:94-95, 168-169'dan birebir).
- `.kpi-strip` + `.grid-1-1` + (gerekirse `.grid-2-1`/`.grid-3`) + eksik
  `.r-card`/`.seg`/`.row-link`/`.panel-head`/`.panel-title`/`.panel-sub`/`.badge*`
  sınıfları kontrol edilir, eksikler eklenir (çoğu zaten var). Responsive breakpoint'ler
  (`@media max-width:1180px/760px/620px`) eklenir.

### Testler (Faz 1)
- `dashboard-view-model.test.ts` — `buildKpis` (gerçek alanlar + RBAC maskeleme bayrağı),
  `stockValueByCategory` (kategori toplama + sıralama), `monthlyRevenueTrend` (cancelled/
  draft hariç + ay gruplama), `recentOrdersView` (durum→tone + tutar maskeleme),
  `reorderView` (urgency eşikleri), `todayProduction`, `alertsView`, `fmt*` helper'lar,
  **karışık-para girdisi**.
- `dashboard-rbac-redaction.test.tsx` (RTL/jsdom) — **viewer rolü** (`perms` `view_*`
  içermez) → KPI ciro "—", Donut $ gizli/fallback, Orders tutar "—"; **admin** → tam
  değerler. (Danışman: bu RBAC testi hard gereksinim.)
- `overview-charts-render.test.tsx` — `renderToStaticMarkup` smoke: TrendChart/Donut/
  BarChart/AgingBars/Heatmap/Sparkline/MarginGauge boş+dolu veriyle crash etmez +
  `var(--chart-grid)`/`var(--chart-track)` kullanır (hex denetimi).
- `dashboard-overview-preservation.test.ts` — StockDataGrid `/dashboard/products`'a,
  import zone `/dashboard/import`'a link olarak korunur (no-silent-deletes regression).
- **Test migrasyonu:** mevcut `dashboard-collapsible-sections.test.ts` AiPanel/Alerts
  collapsible davranışını assert ediyor → yeni yapıya taşınır (AiPanel collapsible kalır).
  `stock-data-grid-limit.test.ts` StockDataGrid hâlâ var (taşındı) → yeşil kalır.

### Doğrulama (Faz 1)
- tsc 0 · `npm run lint` 0 · vitest yeşil (+yeni testler) · build 0 (`ƒ Proxy` + `○ /dashboard`).
- Tarayıcı smoke: KPI şeridi + ciro trendi + Donut + Öneriler + Uyarılar + Son Siparişler
  render; koyu+aydınlık tema; admin tam değer / viewer maskeli; hover tooltip'ler; mobil
  tek kolon (kırpılma yok); reduced-motion.

---

## Faz 2 — Sentetik paneller (strateji onaylı) + maliyet hattı + cila

**Kapsam:** Faz 2 başında sentetik-veri fork'u AskUserQuestion ile netleştir (A/B/C).
Seçime göre:
- **Finansal Özet paneli** (brüt kâr + money-flow bar + AgingBars) — RBAC-gated.
- **Üretim paneli** (BarChart good/scrap) — scrap stratejiye göre (label/çıkar/backend).
- **Üretim Yoğunluğu Heatmap** — stratejiye göre.
- **Ciro & Maliyet Trendi** maliyet hattı (`showCost`) — maliyet kaynağı kararına bağlı.
- **Açık Alacak KPI** — stratejiye göre.
- "Örnek veri/Tahmini" rozeti seçilirse: `badge` + `title` tooltip pure helper'ı.
- **MarginGauge** (270° radial brüt marj) — Finans paneliyle birlikte (opsiyonel).

**Cila:** responsive son rötuş, a11y (panel başlıkları, collapsible `aria-expanded`,
chart `role="img"`+`aria-label`), reduced-motion (globals.css global guard zaten var),
tema hex-yok denetimi (yalnız onaylı CSS var).

**Testler:** sentetik panel render + rozet + RBAC; davranışsal RTL (responsive değerler);
tema hex-yok kilidi.

**Doğrulama:** tsc/lint/build 0 · tarayıcı smoke (tüm paneller + rozet + tema + mobil).

---

## Entegrasyon tuzakları (planda kilitli)
- **`shell.jsx` PORT EDİLMEZ** — Sidebar/Topbar `dashboard/layout.tsx`'in. Yalnız içerik.
- **USD varsayımı YANLIŞ** — prototip USD reporting varsayar; gerçek veride `currency`
  alanı + `maskCurrency(amount, currency, canView)` kullan (proje TRY ağırlıklı, çok-kur var).
- **RBAC null sızıntısı** — `/api/products?all=1` viewer'a `price`/`cost_price` `null` →
  finansal hesaplar NaN/0 verir; `usePermissions()` gate + `maskCurrency` zorunlu.
- **`--chart-grid`/`--chart-track` eksik** — eklenmezse grafikler renksiz; ilk iş.
- **Pure SVG helper'ları lib/component'e çıkar** → `renderToStaticMarkup` ile test.
- **StockDataGrid + StatsCards yalnız dashboard'da** → taşıma/değiştirme güvenli ama
  StockDataGrid link olarak korunur, StatsCards dosyası repoda kalır.
- **AiPanel = mevcut AISummaryCard** → yeniden yazma yok, lazy-mount korunur.
- **Tarih-aralığı/accent/Sade-Detaylı/Tweaks/Rapor-indir** prototip-only → DROP
  (backend yok; over-engineering).

---

## Durum Takibi (her faz sonunda güncelle)
- [x] **Faz 0** — bu planı `DASHBOARD_OVERVIEW_PLAN.md` olarak repoya kaydet (2026-06-09)
- [x] **Faz 1** — iskelet + view-model + gerçek paneller + RBAC + charts port (2026-06-09;
  **CODE-COMPLETE + GREEN, PUSH BEKLİYOR**). Yapılanlar:
  - `globals.css` → `--chart-grid`/`--chart-track` (dark+light) + `.r-card`/`.kpi-strip`
    (auto-fit)/`.overview-grid-1-1`/`.row-link`/`.panel-*` + responsive (`<1180px` tek kolon).
  - `src/lib/dashboard-view-model.ts` (YENİ, saf) — `MoneyByCurrency` (karışık para),
    `buildKpis` (5 gerçek KPI, RBAC maskeli), `monthlyRevenueTrend`/`stockValueByCategory`
    (**baskın-para**), `reorderView`/`alertsView`/`recentOrdersView`/`todayProduction` + fmt.
  - `src/components/dashboard/overview/charts/*` — 7 saf SVG (Sparkline/TrendChart/Donut/
    BarChart/AgingBars/Heatmap/MarginGauge) + `chart-utils` (useMeasure/toneVar/smoothPath).
    BarChart/Aging/Heatmap/MarginGauge Faz 2 için hazır (wiring kaldı).
  - `OverviewPanel`(collapsible)/`KpiCard`(estimated rozet hazır)/`RealPanels`
    (Stock/Reorder/Alerts/Orders). `AiPanel` = mevcut `AISummaryCard` reuse (collapsible).
  - `page.tsx` tam yeniden yazıldı — StatsCards→KPI şeridi (replace, dosya kalır);
    StockDataGrid→`/dashboard/products` link kartı; import→`/dashboard/import` link kartı
    (no-silent-deletes; AIAlerts/RecentOrders/StatsCards/StockDataGrid dosyaları repoda).
  - RBAC: `usePermissions().canViewSalesPrices` → finansal KPI/Donut/Orders maskeli.
  - **+43 test** (`dashboard-view-model` 25 [karışık para + RBAC iki yön], `overview-charts-render`
    13 [renderToStaticMarkup smoke + token], `dashboard-overview-preservation` source-regress;
    `dashboard-collapsible-sections` migrate). tsc 0 · lint 0 · **4942 test** (4899→) · build 0
    (`○ /dashboard` + `ƒ Proxy`).
  - **Bilinen sınır (advisor, Faz 2 fork'a girdi):** Trend + Donut **yalnız baskın para**
    gösterir; baskın-olmayan ciro/stok görünmez (yalnız `· TRY` etiketli). PMT split 60/40
    gibi büyükse Donut stok karışımını yanlış temsil eder → smoke'ta baskın-olmayan oran
    ölçülmeli; büyükse Faz 2 currency-strategy = exchange-rates normalize.
  - **Sıradaki:** kullanıcı tarayıcı smoke + mirror push onayı.
- [ ] **Faz 2** — sentetik paneller (strateji onaylı) + maliyet hattı + cila · COMMIT/PUSH

### Faz 1 tarayıcı smoke checklist (kullanıcı)
- RBAC iki yön: admin → KPI ciro/stok + Donut + sipariş tutarları gerçek ₺/$; viewer
  (`view_sales_prices` yok) → her yerde "—"/kilitli, **`₺0,00` sızıntısı yok**.
- Karışık para: TRY/EUR/USD seed ile "Aylık Ciro" `(+ …)` kırılımı görünür.
- Boş durum: bu ay sipariş yok → "Bu ay sipariş yok" + `₺0,00` (crash/boş değil).
- Tema (koyu+aydınlık) + mobil tek kolon (`overview-grid-1-1` çöker) + hover tooltip'ler.
- **Donut baskın-olmayan oran:** stok karışımı büyük ölçüde tek parada mı? (Faz 2 kararı.)

**Sıradaki:** Faz 1 smoke (dev server `http://localhost:3000` ÇALIŞIYOR — `/dashboard`)
+ push (kullanıcı). Faz 2 başında sentetik-veri fork sorusu.

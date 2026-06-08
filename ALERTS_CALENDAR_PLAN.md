# Uyarılar → Takvim Görünümü (Alerts Calendar) — Uygulama Planı

> **Not (yeni chat devamı için):** Onay sonrası ilk iş bu içeriği repo köküne
> `ALERTS_CALENDAR_PLAN.md` olarak kaydetmek (proje konvansiyonu: `QUOTES_V2_PLAN.md`,
> `MODUL_REVIZE_PLAN.md`, `IMPORT_WRITE_UPGRADE_PLAN.md` gibi). Her faz sonunda
> `current_focus.md` + `CLAUDE.md` Mevcut Durum güncellenir. "Nerede kaldık?" =
> bu dosyadaki **Durum Takibi** bölümü.

---

## Context — neden bu değişiklik

`design_handoff_alerts_calendar/` tasarım paketi, `/dashboard/alerts` (Üretim & Stok
Uyarıları) sayfasının "karışık/düzensiz tablo+liste" yapısını **Apple Calendar tarzı
aylık takvime** dönüştürür: her uyarı tespit gününe yerleşir, hedef tarihi olanlar
(teslim/sevk/teklif geçerlilik/stok tükenme) ayrıca **kesik-çizgili "hedef" işaretiyle**
hedef gününde de görünür, gün tıklanınca o günün olayları kronolojik zaman çizelgesinde
listelenir, geçmiş aylar gezilebilir. Hedef: operatörün "hangi gün ne oldu / ne olacak"
sorusunu tek bakışta yanıtlayan, premium planlama arayüzü.

**Kritik gerçek:** Tasarım, mock veriyle çalışan bir prototip. Gerçek `alerts` satırları
prototipin dayandığı `dueDate`/`time`/`dueLabel`/`resolution` alanlarını taşımıyor. Bu iş
**prototipten sıfırdan kurmak değil**, mevcut 2.967 satırlık olgun sayfayı (RBAC + demo
guard + severity-escalation bypass + scan + AI-suggest + Faz 7 sevk/süre formları + Faz 10
shortage→üretim + sync retry) **takvim düzenine yeniden-derilemek** — tek kural baskın:
`feedback_no_silent_deletes`. Hiçbir mevcut davranış sessizce kaybolmaz.

## Kullanıcı kararları (kilitli)

1. **Hedef-tarih ekseni → İlk sürümde TAM.** Backend uyarıları `dueDate`/`dueLabel` ile
   zenginleştirir; kesik-çizgili hedef işaretleri Faz 1'de gelir.
2. **Drawer zenginliği → Ayrı faz.** Faz 1 drawer = durum aksiyonları (Kabul/Yoksay/Çöz)
   + sayfa linkleri + sync retry. Faz 2 = inline sevk formu + süre uzatma + shortage→üretim
   derin-linki birebir taşınır.
3. **Strateji → Fazlı.** Her faz ayrı commit/push. Detaylı plan bu MD'de kalıcı.

## Veri gerçeği — tasarım alanı → gerçek kaynak eşlemesi

`AlertRow` (database.types): `id, type, severity, title, description, entity_type,
entity_id, status, acknowledged_at, resolved_at, dismissed_at, dismissed_severity,
resolution_reason, ai_confidence, ai_reason, ai_model_version, ai_inputs_summary,
created_at, source`. **`time`/`dueDate`/`dueLabel` YOK.** AI uyarıları ayrı feed DEĞİL —
`source === "ai"` olan normal alert satırları.

| Tasarım alanı | Gerçek kaynak |
|---|---|
| `id/type/severity/status/title` | `AlertRow` doğrudan |
| `date` (olay günü) | `created_at` |
| `time` | `created_at`'tan `HH:MM` (yerel) türet |
| `reason` | `description` ya da `shortReason(alerts)` (alert-ui-helpers reuse) |
| `impact` | `shortImpact(...)` / `description` |
| `resolution` | `resolution_reason` |
| `product{name,sku,available,minStock,reserved,unit,coverageDays}` | `entity_type==='product'` → client `productMap` lookup (mevcut sayfa zaten products + coverageDays hesaplıyor) |
| `orderCode` | order/quote entity → sipariş no (server enrichment; fallback `title`) |
| `dueDate`/`dueLabel` | **Faz 1 server enrichment** (aşağıda) |

### Hedef tarih kaynakları (Faz 1 enrichment — tip başına)
> **Faz 1 ilk adım: `alert-service.ts` uyarı-yaratma noktalarını oku, her tipin
> gerçek `entity_type`/`entity_id`'sini DOĞRULA.** Aşağısı beklenen eşleme; koda karşı teyit edilecek.

- `overdue_shipment` → order entity → `sales_orders.planned_shipment_date` (dueLabel "Planlanan Sevk")
- `quote_expired` → order entity → `sales_orders.quote_valid_until` (dueLabel "Teklif Geçerlilik")
- `order_deadline` → product entity → ürün projeksiyon **stockoutDate** (dueLabel "Stok Tükenme") — mevcut enrichment'ta `stockoutDate`/`orderDeadline` var
- `stock_critical/stock_risk/purchase_recommended` → product entity → hedef İSTEĞE BAĞLI; v1'de yalnız anlamlı olanlarda (stockoutDate varsa) — aksi halde sadece olay günü
- `sync_issue` → hedef yok (yalnız olay günü)

---

## Faz 1 — Takvim iskeleti + gün paneli + temel drawer + hedef-tarih enrichment

**Kapsam cümlesi:** Sayfayı takvim düzenine çevir; tüm mevcut veri akışı/handler/RBAC/demo
korunur; her uyarı tespit gününde + (varsa) hedef gününde kesik-çizgili işaretle görünür;
drawer durum aksiyonları + sync retry içerir.

### Backend (additive — `/api/alerts` SÖZLEŞMESİNE DOKUNMA, 16 test kilitli)
- **Yeni `src/lib/services/alert-due-dates.ts`** (server): `enrichAlertsWithDueMeta(alerts, ctx)`
  → her alert için `{ due_date: string|null, due_label: string|null, order_code: string|null }`.
  - order-entity tipleri için `entity_id`'leri topla → tek `sales_orders` batch fetch
    (`order_number, planned_shipment_date, quote_valid_until`) → map.
  - product-entity `order_deadline` için ürün `stockoutDate` (mevcut product enrichment'tan).
- **Yeni `GET /api/alerts/calendar`** route: mevcut `/api/alerts` RBAC redaction/permission
  guard paterninin AYNISI + `enrichAlertsWithDueMeta` → `{ items: AlertWithDueMeta[] }`.
  Demo: GET read-only izinli (mevcut alerts GET paterni). Cron yok.
- Gerekçe: ayrı endpoint → mevcut `/api/alerts` + 16 test dokunulmaz; takvim sayfası tek
  zengin fetch alır (products + open-counts fetch'leri drawer stat/shortage için KORUNUR).

### Pure helper kütüphanesi — `src/lib/alert-calendar.ts` (unit test'lenebilir)
- `MONTH_NAMES_TR`, `DAY_NAMES_TR` (Pzt-başlangıçlı), `DAY_NAMES_FULL_TR`
- `parseTimeMinutes(hhmm)`, `isSameDate(a,b)`, `isToday(d)`, `timeFromCreatedAt(iso)`
- `CalendarAlert` view-model tipi + `Occurrence` (`occDate`, `occKind: 'event'|'due'`)
- `expandAlertOccurrences(alerts): Occurrence[]` (event + dueDate≠date ise due)
- `getOccurrencesForDate(occ, date)`, `getMonthDays(year,month)` (35/42 hücre, Pzt-başı)
- `topSeverity(list)`, `formatDateFull(d)`, `formatDateShort(d)`, `getCalendarStats(alerts)`
  (total = open+acknowledged, critical/warning, resolved)
- `severityConfig` (critical→danger / warning→warning / info→accent CSS var map)

### Bileşenler — `src/components/alerts/` (inline style + CSS var; **`@/components/ui/Button` reuse**, RovenBtn yeniden yazma)
- `CalendarHeader.tsx` — ay nav (‹ başlık ›) + Bugün + istatistik satırı + **Tara** (scan)
  + **✦ AI Analiz** (ai-suggest) butonları (ikisi de korunur).
- `ClassificationTabs.tsx` — `ALERT_CLASSES` (all/stock/order/shipment/system/ai) pill sekmeler
  + sayı rozeti. (Veri kaynağı: `source==='ai'` AI feed'i `ai` sekmesi `purchase_recommended`
  ile örtüşür; AI-flagged diğer tipler kendi sekmesinde — kabul.)
- `CalendarGrid.tsx` (+ `DayCell`, `DayPopover` portal) — 7 sütun `minmax(0,1fr)`, hücre
  `min-width:0`, olay önizleme çubukları (event dolgulu / due kesik-çizgili italik `◷`),
  `+N daha`, hover popover (Faz 3'te cilalanır — Faz 1'de temel).
- `DayDetailPanel.tsx` (+ `AlertCard`) — seçili gün zaman çizelgesi (saat rayı + kart),
  boş/bugün/geçmiş durumları, `N olay` rozeti.
- `AlertCalendarDrawer.tsx` — **Faz 1 temel**: SevBadge + tip + başlık + Neden + Etki +
  (product ise) Stok Durumu grid + Tarih&Saat + (dueDate ise) Hedef Tarih + geri sayım +
  (resolution ise) Sonuç + `DRAWER_ACTIONS_MAP` linkleri + sticky footer (Kabul/Yoksay/Çözüldü).
  **sync_issue aksiyonu = gerçek `POST /api/alerts/[id]/sync-retry`** (toast placeholder DEĞİL).
- `SevBadge.tsx`

### `page.tsx` yeniden yazımı
- Tüm state/handler/fetch/RBAC/demo KORUNUR; render takvim iskeletine döner.
- Layout: dashboard shell içinde — **literal `100vh` KULLANMA**; içerik-alanı yükseklik
  modeli (Faz 1 ilk adım: `dashboard/layout.tsx` yükseklik/scroll modelini oku, uyarla).
  İç bölgeler (grid, gün paneli) kendi içinde scroll.
- Grid: masaüstü `1fr 380px`, mobil tek kolon (responsive cila Faz 3).

### KORUMA KONTROL LİSTESİ (no-silent-deletes — Faz 1)
- [ ] scan (Tara) `POST /api/alerts/scan`
- [ ] AI üretme (✦ AI Analiz) `POST /api/alerts/ai-suggest` + AI drawer confidence/reason/model
- [ ] acknowledge `PATCH /api/alerts/[id] {acknowledged}`
- [ ] resolve `PATCH {resolved}`
- [ ] dismiss `PATCH {dismissed}` (severity-escalation bypass server-side → endpoint kullan, local filter DEĞİL)
- [ ] **dismissGroup** — mevcut "ürün/grup yoksay" davranışı; alert-seviyesi takvimde
      karşılığı: gün paneli "tümünü yoksay" veya drawer'da grup; **Faz 1'de açıkça ele al, düşürme**
- [ ] sync retry `POST /api/alerts/[id]/sync-retry`
- [ ] RBAC: hangi uyarılar görünür + hangi aksiyonlar açık (mevcut permission gating birebir)
- [ ] demo guard tüm mutasyonlarda (`useIsDemo` + `DEMO_BLOCK_TOAST` + disabled)
- [ ] product stok istatistikleri (available/minStock/reserved/coverageDays) drawer'da
- [ ] `formatRelTime` / göreli zaman, `alert-ui-helpers` (shortReason/shortImpact/extractShortageQty) reuse

### globals.css
- Keyframes ekle: `popIn`, `fadeInUp`, `calFade`, `toastIn` (`spin` zaten global).
  `prefers-reduced-motion: reduce` global guard zaten var (korunur).

### Testler (Faz 1)
- `alert-calendar.test.ts` — pure helper'lar: expandOccurrences (event/due/due=date skip),
  getMonthDays (35 vs 42, Pzt-başı, önceki/sonraki ay), getCalendarStats, isSameDate,
  parseTimeMinutes, timeFromCreatedAt, topSeverity, format*.
- `alert-due-dates.test.ts` — enrichment: tip başına doğru join (overdue→planned,
  quote→valid_until, order_deadline→stockout, sync→null), batch fetch tek çağrı, eksik order defansif.
- `alerts-calendar-route.test.ts` — `/api/alerts/calendar`: RBAC redaction parite, demo GET izinli,
  due-meta response shape.
- `alerts-calendar-render.test.ts` — `renderToStaticMarkup` smoke: CalendarGrid (hücre sayısı,
  event/due çubuk), DayDetailPanel (timeline, boş/bugün/geçmiş), DayCell (gün no, +N).
- `alerts-calendar-preservation.test.ts` — source-regression: scan/ai-suggest/ack/resolve/dismiss/
  sync-retry handler'ları + demo guard + RBAC gating page'de mevcut.
- **Migrasyon:** Eski `alerts-sync-retry.test.ts` page-source markup assertion'ları yeni
  bileşene taşınır (sync retry Faz 1'de geliyor). `alerts-order-shortage-drawer.test.ts` +
  `alerts-overdue-ship.test.ts` markup assertion'ları **Faz 2'ye** (davranış oraya taşınınca).
  Helper/service/endpoint testleri (alert-ui-helpers, alert-service, scan, ai-suggest) yeşil kalır.

### Doğrulama (Faz 1)
- tsc 0 · `npm run lint` 0 · vitest yeşil (+yeni testler) · build 0 (`ƒ Proxy` + yeni route)
- Manuel smoke: takvim render, ay gezinme, gün seç → panel, olay+hedef çubukları, drawer
  Kabul/Yoksay/Çöz, sync retry, Tara, AI Analiz, demo modda mutasyon bloklu, koyu+aydınlık tema.

---

## Faz 2 — Drawer zenginliği (mevcut Faz 7 + Faz 10 davranışları)

**Kapsam:** Faz 1 temel drawer'ına tip-özel zengin aksiyonları birebir taşı.
- **order_deadline** → inline **teslim süresi uzatma** formu (mevcut OrderAlertDrawer mantığı;
  `serviceUpdateQuoteDeadline` / ilgili endpoint) — quote_expired alert resolve davranışı korunur.
- **overdue_shipment** → inline **sevk formu** (shipDate/tracking/carrier → `POST /api/orders/[id]/ship`,
  Faz 7) — başarıda alert resolve + Paraşüt/email fire-and-forget korunur.
- **order_shortage** → **İLGİLİ SİPARİŞLER** bölümü (`GET /api/products/[id]/shortages`) +
  **üretim derin-linki** (`/dashboard/production?productId&qty`, yeni sekme, Faz 10) +
  "Satın alma planla" secondary.
- Drawer per-type bölüm mimarisi: ortak çerçeve + tipe göre aksiyon bloğu.

**Testler:** `alerts-overdue-ship.test.ts` + `alerts-order-shortage-drawer.test.ts` yeni
bileşene migrate (markup + fetch + handler); süre-uzatma davranış testi. Endpoint testleri değişmez.

**Doğrulama:** tsc/lint/build 0 · smoke (sevk et → resolve, süre uzat → resolve, shortage→üretim
deep-link prefill, demo guard).

---

## Faz 3 — Cila + responsive + a11y + animasyon

- Hover popover zamanlama (260ms) + portal konumlandırma (üst/alt otomatik) + `pointer-events:none`.
- Kart stagger `fadeInUp` (index×55ms), ay geçişi `calFade`, drawer `slideInRight`, toast `toastIn`
  — hepsi `prefers-reduced-motion: reduce` altında kapalı.
- Responsive: ≥768 iki kolon / <768 tek kolon (panel `max-height:50vh`).
- A11y: drawer `role=dialog`+`aria-modal`+ESC+focus dönüşü; gün hücreleri `aria-label`
  (tarih + olay sayısı); sekmeler `role=tablist`/`tab`/`aria-selected`; popover `aria-hidden`;
  `Button` reuse zaten a11y taşır.
- Tema denetimi: tüm renkler `var(--...)` (sabit hex yok); `#fff` yalnız `var(--accent)`/bugün
  dairesi gibi doygun yüzeyde (theming kuralı). Tweaks paneli **port EDİLMEZ** (prototip-only).

**Testler:** a11y source-regression (drawer/dialog/tablist/aria-label), reduced-motion guard,
tema sabit-hex-yok denetimi, responsive source-regression.

---

## Entegrasyon tuzakları (planda kilitli)
- **`100vh`/`overflow:hidden`** prototipi tam-viewport varsayar; dashboard Sidebar+Topbar
  kabuğunun içinde — içerik-alanı yükseklik modeline uyarla.
- **README "Tailwind v4" YANLIŞ** (bu repo inline style + CSS var; memory override). Plan boyunca inline.
- **RovenBtn = `@/components/ui/Button` kopyası** → mevcut Button kullan, yeniden yazma.
- Pure occurrence/grouping helper'ları lib'e çıkar (README de bunu istiyor) → unit test.
- AI feed ayrı yüzey değil (`source==='ai'` alert satırları) → takvimde doğal; yalnız üretme butonu korunur.
- `purchase_recommended` alert satırları gerçekten yaratılıyor (alert-service.ts:344) → "AI Öneriler" sekmesi boş değil.

---

## Durum Takibi (her faz sonunda güncelle)
- [x] **Faz 0** — bu plan `ALERTS_CALENDAR_PLAN.md` olarak repoya kaydedildi
- [x] **Faz 1** — iskelet + enrichment + temel drawer + koruma listesi ✅ (tsc 0 · lint 0 · build 0 [`ƒ /api/alerts/calendar` + `ƒ Proxy`] · +44 yeni test, 5 it.todo Faz 2). COMMIT/PUSH bekliyor.
- [x] **Faz 2** — drawer zenginliği (Faz 7 + Faz 10) ✅ — `AlertCalendarDrawer`'a 3 tip-özel zengin bölüm eklendi: **quote_expired** süre uzatma formu (PATCH `/api/orders/[id]` `{quote_valid_until}`; server `serviceUpdateQuoteDeadline`→`resolveQuoteExpiredAlerts` yeni-tarih≥bugün ise alert resolve eder → `onExtended`=refetch yeterli), **overdue_shipment** inline sevk formu (shipDate/trackingNumber/carrier → POST `/api/orders/[id]/ship`; endpoint Faz 7 awaited `dbBatchResolveAlerts` ile overdue resolve eder), **order_shortage** İLGİLİ SİPARİŞLER (GET `/api/products/[id]/shortages` → loading/error/empty/list + üretim derin-linki `/dashboard/production?productId&qty=totalShortage` yeni sekme). `onExtended`/`onShipped` parent callback'leri → `refetch()`+toast; tümü `!isResolved`+`entityId` guard'lı, mevcut nav linkleri korundu (`feedback_no_silent_deletes`); `Section` reuse (eski `DrawerSection` değil); üretim qty = endpoint canlı `totalShortage` (`extractShortageQty` AlertRow[] alıyordu, CalendarAlert taşımıyor → daha doğru/canlı). 5 it.todo → 5 gerçek source-regression. tsc 0 · my-files lint 0 · build 0 · 13 alert test dosyası/104 test yeşil. COMMIT/PUSH bekliyor.
- [ ] **Faz 3** — cila + responsive + a11y + animasyon · COMMIT/PUSH —

### Faz 1 — yapılan dosyalar (tamamlandı)
- **`src/lib/alert-calendar.ts`** (YENİ, pure) — takvim tarih matematiği + occurrence + CalendarAlert/Occurrence tipleri + SEVERITY_CONFIG + ALERT_CLASSES. (+24 test)
- **`src/lib/services/alert-due-dates.ts`** (YENİ) — `enrichAlertsWithDueMeta`: order-entity due (overdue→planned_shipment_date, quote→quote_valid_until) TEK batch join + order_code; order_deadline due'su client'ta türetilir. (+7 test)
- **`GET /api/alerts/calendar`** (YENİ) — /api/alerts paterni + enrichment. (+3 test)
- **`src/components/alerts/`** — CalendarHeader (Tara+AI Analiz), ClassificationTabs, CalendarGrid+DayCell+DayPopover, DayDetailPanel+AlertCard, AlertCalendarDrawer (nav + gerçek sync retry), SevBadge. `@/components/ui/Button` reuse.
- **`page.tsx`** tam yeniden yazıldı — `toCalendarAlert`/`applyClassFilter` (export, +13 test); tüm fetch/handler/demo/scan/ai-suggest/ack/resolve/dismiss/sync-retry KORUNDU; dismissGroup→**dismissDay** (24h bypass korundu); `calc(100vh - 52px - 36px)` içerik-alanı.
- **`globals.css`** — keyframes `cal-fade`/`cal-pop-in`/`cal-fade-up`.
- **Test migrasyonu:** sync-retry source-regression yeni yapıya migrate (davranış korundu); order-shortage + overdue-ship inline-form regression'ları → Faz 2 `it.todo` (endpoint testleri tam kapsamda).

**Sıradaki adım:** Faz 1 PUSH → Faz 2 (order_deadline süre uzatma + overdue_shipment inline sevk formu + order_shortage related-orders/üretim deep-link).

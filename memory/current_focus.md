---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-20 — Faz 2 artık bulgular temizlendi):**

1. Aging tab etiketleri güncellendi: "Mamul Eskimesi"→"İmalat Eskimesi", "Ticari Mal Eskimesi"→"Ticari Eskimesi" (page.tsx + aging.spec.ts)
2. SegmentBanner semantik düzeltme: seçili sekmeye göre count, commercial için doğru metin ("Satın alma siparişi bekleyen X ürün")
3. Aging API temizlik: `dbGetLastComponentUsageDates` + `computeAgingCategoryRaw` tamamen kaldırıldı (aging.ts, route.ts, 2 test dosyası)
4. Test izleri: eval-runner `productType: "raw_material"` → `"commercial"`, reorder-suggestions `isForPurchase` yorumu güncellendi
5. **76 test dosyası · 1480 test — 0 hata · 0 TS hatası**

**Önceki (2026-04-20 — Faz 2: raw_material tamamen kaldırıldı + migration uygulandı):**

1. `ProductType` → `"manufactured" | "commercial"` (3-değerli → 2-değerli)
2. DB migration **032 Supabase'e uygulandı**: raw_material ürünler silindi, CHECK constraint 2-değerli, `is_for_sales`/`is_for_purchase` kolonları DROP edildi
3. UI: Aging 3 tab → 2 tab; Purchase/suggested Hammadde tab kaldırıldı; products create/edit seçenekleri güncellendi
4. API: aging route ham mantığı kaldırıldı; purchase-copilot rawMaterialCount kaldırıldı
5. Types/Interfaces: database.types, mock-data, api-mappers, supabase/products, supabase/aging, stock-utils, ai-service
6. Seed: 5 hammadde ürünü + is_for_sales/is_for_purchase alanları kaldırıldı
7. Testler: raw_material test bloğu silindi; fixture'lar "commercial" olarak güncellendi; Playwright aging spec güncellendi
8. **76 test dosyası · 1489 test — 0 hata · 0 TS hatası**

**Önceki (2026-04-20 — İmalat/Ticari sınıflandırması + UI temizlik):**

1. `isForSales`/`isForPurchase` toggle konsepti UI ve servislerden kaldırıldı; `productType` tek otorite
2. Etiketler: "Mamul" → "İmalat", "Ticari Mal" → "Ticari" (products page, purchase/suggested)
3. Filtre butonları: `filterSales`/`filterPurchase` → `filterManufactured`/`filterCommercial` (productType'a göre)
4. Drawer'dan Satış/Satınalma toggle'ları kaldırıldı; create modal'dan checkbox'lar kaldırıldı
5. purchase-service, purchase-copilot, alerts page, stock-utils → productType kullanıyor
6. production/page.tsx: "Giren" kolonu kaldırıldı (hardcoded "Usta")
7. settings/page.tsx: "Demo Hazırlık" sekmesi kaldırıldı
8. **Faz 2 (hammadde kaldırma)** henüz yapılmadı — DB migrasyon gerekiyor

**Önceki (2026-04-17 — Faz 2 DB sorgu + client refresh optimizasyonu + bulgu fix):**

1. **Faz 2A** — `dbGetOrderById` 2 sıralı sorgu → 1 Supabase embedded JOIN (`select("*, order_lines(*)")`)
2. **Faz 2B** — `dbCreateOrder` RPC sonrası `SELECT *` ile tam `SalesOrderRow` döndürüyor; `data-context.addOrder` artık `GET /api/orders` refetch yapmıyor, POST response ile state prepend yapıyor
3. **Faz 2B bulgu fix** — `orders/page.tsx` mount fetch kaldırıldı; `useData().orders` (DataContext) ile init olur, `contextInitRef` ile tek seferlik geç yükleme sync'i; sipariş oluşturma sonrası `GET /api/orders` artık görünmüyor
4. **Faz 1** (önceki oturum) — 4 DB index, 30s server cache (`unstable_cache`), email cache 5dk, 9 route'a `revalidateTag`, 24 test, 031 duplicate index cleanup migration

**Önceki (2026-04-17 — navigasyon hızlandırma & donma önleme):**

Commit: `e293a9b perf: navigasyon hızlandırma ve donma önleme`

1. `npm uninstall framer-motion zustand` (kuruluydu ama import edilmiyordu)
2. `React.memo` ile 6 component sarıldı; `useMemo` ile filter/sort
3. Products page mount'ta `POST /api/alerts/scan` kaldırıldı

**Önceki (2026-04-17 — seed data + CI fix + partially_shipped):**

- Seed'e 5 hammadde (raw_material) ürünü eklendi; Hammadde tabı demo'da dolu
- `partially_shipped` badge kaldırıldı → "Sevk Edildi" gösterilir (durum DB'de var ama hiçbir RPC set etmiyor)
- 35 CI vitest hatası düzeltildi (`makeProduct` fixture'larına `is_for_purchase/is_for_sales` eklendi)

**Önceki (2026-04-16 — demo hazırlık & Sentry & smoke testler):**

- **2 kritik semantik hata** düzeltildi: Ship butonu (allocated yerine approved+non-shipped), promisable fallback (available_now - quoted)
- **Sentry** kod tarafı tamamlandı: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `next.config.ts` → `withSentryConfig` wrap, `error.tsx` → `Sentry.captureException`
- **k6 load testleri** eklendi: `tests/load/alert-scan.k6.js`, `tests/load/import-wizard.k6.js`; `.github/workflows/load-test.yml` (manual-trigger)
- **Smoke testler** 14 → 24'e genişletildi; her test gerçek bug senaryosunu hedefliyor
- **isForPurchase/isForSales** alan filtrelemesi (stock-utils, purchase-copilot, alerts, purchase-service)

**Bekleyen manuel adımlar:**
- Sentry DSN: sentry.io → `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` → `.env.local` ve GitHub Secrets
- Supabase local: `brew install supabase/tap/supabase` → `supabase init`
- k6 local: `brew install k6`

**Test:** 1489 vitest (0 fail) · Lint: 0 error

**Why:** Yeni session'da Claude aktif konuyu bilsin.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.

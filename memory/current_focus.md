---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---

## Son Tamamlanan İş — 2026-05-18

**Genel Pagination — 6 liste sayfasına sayfa başına 50 kayıt + numaralı sayfalama (2794 test)**

### Yeni Genel Kural
Tüm liste sayfalarında (ürün/sipariş/teklif/müşteri/tedarikçi/satın alma siparişi) **sayfa başına 50 kayıt**; 50'yi aşınca numaralı sayfalama (1, 2, 3 …) ile ilerler. Bu projede generic kural.

### Mimari
- **Client-side pagination** — DataContext zaten `?all=1` ile tüm aktif veriyi belleğe alıyor → API/backend/context değişikliği YOK
- Filtre+arama in-memory → pagination da filtre **sonrası** in-memory slice
- Hook generic return shape: ileride server-side'a geçilirse UI değişmez

### Dosyalar
- `src/hooks/usePagination.ts` (YENİ): `PAGE_SIZE=50`, `usePagination<T>(items, { pageSize?, resetKey? })`, pure helper'lar (`computeTotalPages`/`clampPage`/`slicePage`). "Adjusting state based on prop change" paterni (prev key state karşılaştırması) — React 19 `set-state-in-effect` kuralı için useEffect kullanılmıyor.
- `src/components/ui/Pagination.tsx` (YENİ): A11y-first numaralı sayfalama UI. `buildPageWindow` helper, `<nav aria-label="Sayfalama">`, ellipsis `<span aria-hidden>`, `aria-current="page"`, prev/next disabled. Inline CSS + CSS variables.
- 6 liste sayfasına kanonik entegrasyon: `usePagination(filtered, { resetKey })` + `pagedItems.map()` + Pagination component (`</table>` sonrasına).

### resetKey ingredients (sayfa başına)
| Sayfa | resetKey | itemLabel |
|---|---|---|
| vendors | `search\|showAll` | tedarikçi |
| purchase/orders | `search\|activeTab` | sipariş |
| quotes | `activeTab\|search\|currencyFilter\|dateFrom\|dateTo` | teklif |
| customers | `activeFilter\|search` | müşteri |
| orders | `activeTab\|search\|customerIdFilter\|dateFrom\|dateTo\|currencyFilter` | sipariş |
| products | `search\|alertFilter\|selectedCategories\|filterManufactured\|filterCommercial` | ürün |

### Test (+39)
- `use-pagination.test.ts` (16): PAGE_SIZE + pure helper davranış matrisi
- `pagination-component.test.ts` (17): module + buildPageWindow + renderToStaticMarkup smoke
- `pagination-integration.test.ts` (6): tüm liste sayfaları için source-regex regression lock

### Durum
180 dosya · 2794 test yeşil · TS clean · 0 lint warning · build OK

---

## Sıradaki İş

Kullanıcı kararı bekleniyor. Olası seçenekler:
- **Frontend Yenileme** (`frontend-renewal.md`) — DOM mutation fix (onMouseEnter 6 dosya), design token, component lib, a11y
- **Purchase Rol Matrisi** — vendor/PO granular RBAC (admin/purchaser/viewer); şu an minimum MVP mevcut
- **Paraşüt Faz 12 (Sandbox GATE)** — gerçek HTTP API geçişi öncesi doğrulama (sandbox credential gerektirir)
- **Tedarikçi Performansı** — düşük öncelik; suppliers tablosu schema değişikliği

---

## Önceki İşler (kısa kronoloji)

- Faz 10 Review (2026-05-18) — `dbGetOpenShortagesByProductId` DB hata yutma kapatıldı
- Faz 10 (2026-05-18) — order_shortage drawer M3 (bilgi yoğunluğu + iki yönlendirme)
- Faz 9 Review (2026-05-18) — Print sayfası veri minimizasyonu (ProductRef) + gerçek render testleri
- Faz 9 (2026-05-18) — PO PDF render (server-side HTML print)
- Faz 8 (2026-05-17) — AI rejection feedback prompt entegrasyonu
- Faz 7 (2026-05-16/17) — overdue_shipment alert inline ship form + P2/P3 kapanış
- Faz 6 (2026-05-16) — Suggested → PO köprüsü + review kapanış
- Faz 1-5 (purchase&alert) — sync_issue inline retry, vendor entity, PO schema/UI/mal kabul
- Paraşüt Faz 1-11 tam tamamlandı (Faz 11 önceki oturumda zaten bitmişti: `serviceRetryParasutStep` + `ParasutStepBadges` + `/api/orders/[id]/parasut-status`)

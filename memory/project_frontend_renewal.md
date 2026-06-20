---
name: roven-frontend-yenileme-plan
description: "frontend-renewal.md — DOM mutation fix, component lib, accessibility, görsel yenileme — plan var, uygulama başlamadı"
metadata: 
  node_type: memory
  type: project
  originSessionId: 14992303-287a-4b73-b0e6-d62dbec7425c
---

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/frontend-renewal.md` (2026-04-08, gitignore'da değil)

**Durum:** PLAN HAZIR — **kısmen turlarda uygulandı** (formal frontend-renewal commit'i yok ama maddeler ayrı turlarda kapatıldı). KAPANANLAR: DOM mutation fix (orders/quotes/products/customers/PO/production turlarında `hoveredId` state'e geçildi), a11y (modal `role=dialog`/`aria-modal`/`aria-labelledby` + aria-label çoğu sayfada), `prefers-reduced-motion` global guard (tema turunda `062bfa9`), Topbar yeniden tasarım ("Sakin düz" `bf28fb0` — breadcrumb yerine sola-başlık). **Faz B BAŞLADI — pilot + yayılım sürüyor:** `src/components/ui/` altına `DataTable<T>` (generic kolon/satır + thead/boş-durum/hizalama/footer + opsiyonel `onRowClick` satır navigasyonu; seçim mantığı caller'da kalır) + `Badge` (tone token çiftleri) + `Card`. Hover = globals.css `.erp-data-table tbody tr:hover` (rerender yok, DOM-mutation yok). DataTable ayrıca `minWidth?: string` + tablo `overflow-x:auto` wrapper + (globals.css) `.row-reveal` hover-reveal utility destekler. **Dönüştürülen listeler:** (1) **VendorsClient** (`c6f46fc` — pilot); (2) **PurchaseOrdersClient** (`931c62d` — onRowClick→router.push, STATUS_BG→STATUS_TONE+Badge); (3) **CustomersClient** (`64af65d` — onRowClick→setSelectedCustomer panel, minWidth=700px, 9 kolon); (4) **OrdersClient** (`024c2d8` — onRowClick→router.push, minWidth=740px, `.row-reveal` sil/chevron, `<EmptyState>` emptyMessage, `.badge` rozetleri korundu). Her dönüşüm: thStyle/tdStyle kaldırılır, tablo→Card+DataTable, hoveredId kaldırılır (hover/reveal CSS); davranış/RBAC/demo değişmez; migration yok. **PREMIUM LIGHT THEME** (`f550e83`, codex'ten entegre): DataTable/Card token bazlı (`--surface-raised/-border/-shadow`, `--table-header-bg/-row-hover`, `--line-width`, `--font-table-*`, `--input-bg/-border`); yeni dönüşümler bu token'ları otomatik miras alır. **AÇIK:** kalan ~20 liste; sıradaki = **QuotesClient** (Orders ikizi: router.push + `.row-reveal` hazır + `.badge` + geçerlilik alt-rozeti) → sonra settings tabloları + products + `Input`/`PageHeader`/`SectionHeader`/`NavLink`/`Stat` + drawer/form. **Not:** `rowStyle?(row)` HÂLÂ yok — OrdersClient'ta gerekmedi (cellBg yalnız hover'dı); gerçek seçili-satır-vurgusu olan liste çıkarsa eklenecek.

---

## Sorunlar (plan gerekçesi)

- 100+ inline `style={{}}` declaration — her sayfada sıfırdan yazılıyor, bakım yükü yüksek (KISMEN: tema turunda renkler CSS var/token'a taşındı, yapısal stiller hâlâ inline)
- ~~DOM mutation antipattern~~ → **ÇOĞU KAPANDI** (`onMouseEnter`'da `e.currentTarget.style.X`→`hoveredId` state; orders/quotes/products/customers/PO/production sayfalarında uygulandı)
- Erişilebilirlik: aria-label + modal a11y çoğu sayfada eklendi; ~~`prefers-reduced-motion` yok~~ → **EKLENDİ** (tema turu global guard); kalan: `sm` buton <44px, bazı skip-link/focus-trap

---

## Faz Özeti

| Faz | Konu | Açıklama |
|-----|------|----------|
| A | Design Token Genişletme | `globals.css`'e typography scale, spacing (4pt grid), z-index, hover tokens, skip-link, ~~reduced-motion~~ ✅ + tema token'ları (`--highlight-inset` vb. ✅) |
| B | Component Kütüphanesi | DataTable(+onRowClick+minWidth+`.row-reveal`), Card, Badge VAR; uygulandı: Vendors+PO+Customers+Orders (`c6f46fc`/`931c62d`/`64af65d`/`024c2d8`). Premium light theme entegre (`f550e83`). Sıradaki: Quotes. Input/PageHeader/SectionHeader/NavLink/Stat + kalan ~20 liste + drawer/form AÇIK |
| C | DOM Mutation Fix | `onMouseEnter` style mutation → `useState(hovered)` — **ÇOĞU YAPILDI** (orders/quotes/products/customers/PO/production) |
| D | Accessibility | Skip link, aria-label ✅(çoğu), focus trap (Sidebar mobile), form label-input bağlantısı — kısmen |
| E | Görsel Yenileme | Landing, Login split-screen, Sidebar, ~~Topbar breadcrumb~~ → **Topbar "Sakin düz" yapıldı** (`bf28fb0`, sola-başlık), Dashboard, Orders |

**Uygulama sırası:** globals.css → Button fix → DataTable oluştur → DOM mutation'ları kur → Accessibility → Görsel

---

## Review Bulgular (plana göre 3 revizyon gerekli)

1. **Kapsam eksik:** `products/page.tsx` ve `alerts/page.tsx` uygulama listesinde yok — bunlar da dahil edilmeli
2. **Hover useState riski:** Her satır için `useState` → gereksiz rerender; özellikle DataTable row highlight context riskli. Yumuşatılmalı
3. **Checklist'e build/typecheck ekle:** `npm run build` / `tsc --noEmit` yoktu

---

## Etkilenecek Dosyalar (mevcut)

Değiştirilecek: `globals.css`, `dashboard/layout.tsx`, `Button.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `StatsCards.tsx`, `StockDataGrid.tsx`, `dashboard/page.tsx`, `orders/page.tsx`, `page.tsx` (landing), `login/page.tsx`

Oluşturulacak (`src/components/ui/`): `DataTable.tsx`, `Card.tsx`, `Badge.tsx`, `Input.tsx`, `PageHeader.tsx`, `SectionHeader.tsx`, `NavLink.tsx`, `Stat.tsx`

**Why:** Plan hazır ve kullanıcı bu dosyayı "başka bir tane vardı" diyerek 2026-04-23'te sordu — aktif bir sonraki iş olabilir.
**How to apply:** Bu plana başlanmadan önce yukarıdaki 3 revizyon maddesini kullanıcıyla netleştir.

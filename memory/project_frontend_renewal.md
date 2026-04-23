---
name: KokpitERP — Frontend Yenileme Planı
description: frontend-renewal.md — DOM mutation fix, component lib, accessibility, görsel yenileme — plan var, uygulama başlamadı
type: project
---

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/frontend-renewal.md` (2026-04-08, gitignore'da değil)

**Durum:** PLAN HAZIR — hiç uygulanmadı (kod commit'i yok)

---

## Sorunlar (plan gerekçesi)

- 100+ inline `style={{}}` declaration — her sayfada sıfırdan yazılıyor, bakım yükü yüksek
- DOM mutation antipattern: `onMouseEnter`'da `e.currentTarget.style.X = ...` — React prensibine aykırı; etkilenen dosyalar: `Button.tsx`, `Sidebar.tsx`, `StatsCards.tsx`, `StockDataGrid.tsx`, `orders/page.tsx`
- Erişilebilirlik eksikleri: `cursor: pointer` eksik, `sm` buton <44px, `aria-label` yok, `prefers-reduced-motion` yok

---

## Faz Özeti

| Faz | Konu | Açıklama |
|-----|------|----------|
| A | Design Token Genişletme | `globals.css`'e typography scale, spacing (4pt grid), z-index, hover tokens, skip-link, reduced-motion |
| B | Component Kütüphanesi | DataTable, Card, Badge, Input, PageHeader, SectionHeader, NavLink, Stat (hepsi `src/components/ui/`) |
| C | DOM Mutation Fix | 6 dosyadaki `onMouseEnter` style mutation → `useState(hovered)` |
| D | Accessibility | Skip link, aria-label, focus trap (Sidebar mobile), form label-input bağlantısı |
| E | Görsel Yenileme | Landing, Login split-screen, Sidebar, Topbar breadcrumb, Dashboard, Orders |

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

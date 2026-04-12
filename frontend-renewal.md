# KokpitERP Frontend Yenileme Planı

_Oluşturulma: 2026-04-08_

---

## Genel Durum

ERP'nin frontend temeli sağlam — CSS variable sistemi, dark theme, layout mimarisi. Ama iki büyük sorun var:

1. **100+ inline `style={{}}` declaration** — Her sayfada kart, tablo, buton stilleri sıfırdan yazılıyor. Bakım yükü yüksek, tutarsızlık artıyor.
2. **DOM mutation antipattern** — `onMouseEnter` içinde `e.currentTarget.style.X = ...` ile hover yönetimi yapılıyor. React prensiplerini ihlal ediyor.

**Etkilenen dosyalar:**
- `src/components/ui/Button.tsx` (satır 86-97)
- `src/components/layout/Sidebar.tsx` (satır 127-138)
- `src/components/dashboard/StatsCards.tsx` (satır 138-149)
- `src/components/dashboard/StockDataGrid.tsx` (satır 56-79)
- `src/app/dashboard/orders/page.tsx` (satır 241-263)

**Ek sorunlar (ui-ux-pro-max analizi):**
- Birçok etkileşimli elementte `cursor: pointer` eksik
- `sm` buton yüksekliği ~30px → WCAG 44px touch minimum altında
- `prefers-reduced-motion` CSS kuralı eksik
- Icon-only butonlarda `aria-label` yok (hamburger, alert, avatar)
- `opacity: 0` ile gizlenen hover-only aksiyonlar keyboard/touch için erişilemez
- Skip link yok
- Body text `line-height: 1.4` → `1.5`'e çıkarılmalı

**Proje kısıtları (değişmez):**
- Sadece inline styles + CSS variables (`style={{}}`)
- Tailwind class kullanımı yasak
- Framer Motion import yasak
- `"use client"` tüm interaktif component'lerde zorunlu

---

## Faz A — Design Token Genişletme

**Dosya:** `src/app/globals.css` — `:root` bloğuna `--shadow-sm`'den sonra ekle

```css
/* Typography scale */
--text-xs:    11px;
--text-sm:    12px;
--text-base:  13px;
--text-md:    14px;
--text-lg:    16px;
--text-xl:    20px;
--text-2xl:   24px;
--text-3xl:   32px;

/* Font weights */
--font-normal:   400;
--font-medium:   500;
--font-semibold: 600;
--font-bold:     700;

/* Line heights */
--leading-tight:   1.25;   /* başlıklar */
--leading-snug:    1.4;    /* tablo hücreleri, badge */
--leading-normal:  1.5;    /* body text minimum (WCAG) */
--leading-relaxed: 1.6;    /* form alanları, açıklamalar */

/* Spacing — 4pt grid */
--space-1:  4px;   --space-2:  8px;   --space-3:  12px;
--space-4:  16px;  --space-5:  20px;  --space-6:  24px;
--space-8:  32px;  --space-10: 40px;  --space-12: 48px;
--space-16: 64px;

/* Z-index — tanımlı katman sistemi */
--z-base:     0;
--z-raised:   10;
--z-dropdown: 200;
--z-drawer:   300;
--z-modal:    400;
--z-toast:    9999;

/* Hover surface tokens */
--bg-hover:  rgba(255,255,255,0.04);
--bg-active: rgba(56,139,253,0.08);

/* Extended shadows */
--shadow-md: 0 4px 20px rgba(0,0,0,0.35);
--shadow-lg: 0 8px 40px rgba(0,0,0,0.5);

/* Extended radius */
--radius-xs: 3px;
--radius-xl: 12px;

/* Touch targets — minimum 44px (WCAG 2.5.5) */
--touch-min: 44px;
```

**Accessibility eklemeleri** (`.badge` bloğunun sonuna):

```css
/* Skip link */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--accent);
  color: white;
  padding: 8px 16px;
  z-index: var(--z-toast);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  text-decoration: none;
  transition: top 0.1s;
}
.skip-link:focus {
  top: 8px;
}

/* prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Faz B — Yeni Component Kütüphanesi

Tüm yeni dosyalar `src/components/ui/` altında.

---

### B.1 — `Button.tsx` (mevcut dosya, fix)

**Sorun:** `onMouseEnter/Leave` ile `e.currentTarget.style.background` mutation (satır 86-97). Ayrıca `sm` size touch target minimum altında.

**Fix özeti:**
```tsx
const [hovered, setHovered] = useState(false);

// style={{ background: (!isDisabled && hovered) ? v.hoverBg : v.bg }}
// onMouseEnter={() => !isDisabled && setHovered(true)}
// onMouseLeave={() => setHovered(false)}
// cursor: isDisabled ? "not-allowed" : "pointer"  ← her zaman pointer
// transition: "background 0.15s ease"             ← 150ms (WCAG önerisi)
```

---

### B.2 — `DataTable.tsx` (yeni)

En yüksek etkili component. 3 sayfadaki tablo kodunu birleştirir ve DOM mutation'ı tamamen ortadan kaldırır.

**Compound component API:**
```tsx
<DataTable>
  <DataTable.Thead>
    <DataTable.Tr>
      <DataTable.Th>SKU</DataTable.Th>
      <DataTable.Th align="right" width="80px">Stok</DataTable.Th>
    </DataTable.Tr>
  </DataTable.Thead>
  <DataTable.Tbody>
    {rows.map((row) => (
      <DataTable.Tr
        key={row.id}
        selected={selectedId === row.id}
        onClick={() => setSelectedId(row.id)}
      >
        <DataTable.Td muted>{row.sku}</DataTable.Td>
        <DataTable.Td align="right">{row.stock}</DataTable.Td>
      </DataTable.Tr>
    ))}
  </DataTable.Tbody>
</DataTable>
```

**TypeScript interfaces:**
```tsx
interface DataTableProps { children: ReactNode; minWidth?: string; style?: CSSProperties }
interface ThProps        { align?: "left"|"right"|"center"; width?: string; children: ReactNode }
interface TrProps        { onClick?: () => void; selected?: boolean; highlightBorder?: boolean; children: ReactNode }
interface TdProps        { muted?: boolean; accent?: boolean; danger?: boolean; align?: "left"|"right"|"center"; children: ReactNode; style?: CSSProperties }
```

**Hover mekanizması — React Context, sıfır DOM mutation:**
```tsx
const RowHighlightContext = createContext(false);

// Tr: useState(false) → RowHighlightContext.Provider value={selected || hovered}
// Td: useContext(RowHighlightContext) → background: highlighted ? "var(--bg-hover)" : "transparent"
```

`querySelectorAll("td")` çağrıları bu sayede gereksiz hale gelir.

---

### B.3 — `Card.tsx` (yeni)

20+ yerde tekrarlanan kart pattern'ini merkezileştirir.

```tsx
interface CardProps {
  children: ReactNode;
  padding?: string;           // default: "var(--space-4)"
  interactive?: boolean;      // hover state açar
  accentBorder?: "left" | "top" | false;
  accentColor?: string;       // default: "var(--accent)"
  onClick?: () => void;
  style?: CSSProperties;
}
// useState(hovered) → borderColor, background değişimi
// onClick varsa cursor: "pointer"
```

---

### B.4 — `Badge.tsx` (yeni)

Mevcut `.badge` CSS class'larını React component'e sarar.

```tsx
type BadgeVariant = "success" | "warning" | "danger" | "accent" | "neutral";

interface BadgeProps {
  variant: BadgeVariant;
  size?: "sm" | "md";
  children: ReactNode;
}
// → <span className={`badge badge-${variant}`}>
```

---

### B.5 — `Input.tsx` (yeni)

```tsx
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}
```

**Kritik:** `label` → `htmlFor` → `input id` ilişkisi zorunlu (WCAG `form-labels`).
`aria-invalid`, `aria-describedby` error/hint state'lerine göre otomatik set edilir.
Focus state: `useState(isFocused)` → `borderColor` değişimi.
Minimum height: `var(--touch-min)` (44px).

---

### B.6 — `PageHeader.tsx` (yeni)

```tsx
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}
```

Her sayfadaki başlık + eylem butonu satırını standardize eder.

---

### B.7 — `SectionHeader.tsx` (yeni)

```tsx
interface SectionHeaderProps {
  title: string;
  count?: number;    // örn: "Stok Envanteri (24/150)"
  action?: ReactNode;
}
```

---

### B.8 — `NavLink.tsx` (Sidebar için, dahili)

```tsx
interface NavLinkProps {
  href: string;
  active: boolean;
  count?: number;
  countVariant?: "warning" | "danger" | "accent";
  onNavigate?: () => void;
  children: ReactNode;
}
// useState(hovered)
// active   → accent-bg + borderLeft: "3px solid var(--accent)"
// hovered  → bg-hover (semi-transparent)
// default  → transparent
```

---

### B.9 — `Stat.tsx` (yeni, StatsCards için)

```tsx
interface StatProps {
  label: string;
  value: string | number;
  subtitle?: string;
  subtitleVariant?: "ok" | "warn" | "danger" | "muted";
  href?: string;     // Link olarak çalışır
  arrow?: boolean;
}
// useState(hovered) — arrow rengi hovered'dan türetilir
// data-arrow querySelector hack tamamen kaldırılır
```

---

## Faz C — DOM Mutation Düzeltmeleri

| # | Dosya | Satırlar | Sorun | Çözüm |
|---|-------|----------|-------|-------|
| C.1 | `Sidebar.tsx` | 127-138 | onMouseEnter style mutation | `NavLink` component (B.8) |
| C.2 | `StatsCards.tsx` | 138-149 | data-arrow querySelector | `Stat` component (B.9) |
| C.3 | `StockDataGrid.tsx` | 56-79 | applyHover/removeHover/applySelected | `DataTable` (B.2) |
| C.4 | `orders/page.tsx` | 241-263 | querySelectorAll("td") + [data-chevron] | `OrderRow` subcomponent |
| C.5 | `dashboard/page.tsx` | 276-281 | drop-zone borderColor mutation | `ImportDropZone` subcomponent |
| C.6 | `Button.tsx` | 86-97 | background mutation | useState (B.1) |

**C.4 — OrderRow subcomponent detayı:**
```tsx
function OrderRow({ order, ... }) {
  const [hovered, setHovered] = useState(false);
  return (
    <DataTable.Tr selected={...} onClick={...}>
      {/* opacity: hovered ? 1 : 0.3 — TAMAMEN 0 değil, keyboard için */}
      {/* delete button: aria-label={`Sipariş ${order.orderNumber} iptal et`} */}
    </DataTable.Tr>
  );
}
```

> **Not:** `opacity: 0` yerine `opacity: 0.3` — keyboard/touch kullanıcıları için element kaybolmamalı.

---

## Faz D — Erişilebilirlik (Accessibility)

| # | Nerede | Ne Yapılacak |
|---|--------|-------------|
| D.1 | `dashboard/layout.tsx` | Skip link ekle, `<main id="main-content">` |
| D.2 | `Topbar.tsx` | hamburger `aria-label="Menüyü aç"` + `aria-expanded`, alert `aria-label="{n} uyarı"`, avatar `aria-label` |
| D.3 | `orders/page.tsx` | Delete buton `aria-label="Sipariş X iptal et"` |
| D.4 | `Sidebar.tsx` | Mobil drawer: focus trap + Escape tuşu kapama + focus hamburger'a dön |
| D.5 | `login/page.tsx` | `<label htmlFor>` → `<input id>` bağlantısı (`Input` component bunu otomatik yapar) |
| D.6 | Tüm interaktif card/row | `cursor: "pointer"` — `Card`, `DataTable.Tr`, `Stat` |

---

## Faz E — Görsel Yenileme

### E.1 — Landing (`src/app/page.tsx`)

**Yapı:**
1. `<nav>` — logo + tek CTA (GitHub link footer'a)
2. `<section>` hero — yeni headline + metrics strip
3. `<section>` features — renk kodlu feature cards
4. `<footer>` minimal

**Copy değişiklikleri:**
- Eyebrow: `"Endüstriyel B2B Operasyon Yönetimi"` (müşteri adı kaldırılır)
- H1: `"Vana satışından muhasebaya, tüm operasyon tek ekranda."`
- Metrics strip (hard-coded, gerçek veriler): `18+ veritabanı tablosu` · `10 entegre modül` · `Claude AI ile ayrıştırma`

**Görsel:**
- Hero arka plan: `linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)`
- Feature cards: farklı `borderTop` rengi per kart (accent / success / warning)

---

### E.2 — Login (`src/app/login/page.tsx`)

**Layout:** Split-screen (büyük ekran) → tek sütun (mobile)
- Sol: logo + 3 fayda maddesi + ince grid pattern (CSS `repeating-linear-gradient`, external asset yok)
- Sağ: form — `Input` component, hata state `borderLeft: "3px solid var(--danger)"`
- Logo → `<Link href="/">` (landing'e dönüş)

---

### E.3 — Sidebar (`src/components/layout/Sidebar.tsx`)

- Aktif item: `borderLeft: "3px solid var(--accent)"` + `var(--accent-bg)` (6px dot → kaldır)
- Hover: `var(--bg-hover)` (solid `var(--bg-secondary)` yerine)
- Count badge renkleri: `pending_approval` → warning · `alerts` → danger · `reorder` → accent
- Logout button hover state ekle
- Grup arası: ilk grup hariç `paddingTop: "var(--space-5)"`

---

### E.4 — Topbar (`src/components/layout/Topbar.tsx`)

- **Merkez:** `usePathname` ile sayfa bağlamı — `"Operasyon / Siparişler"`
  - `navGroups` Sidebar'dan export edilir, label mapping Topbar'da kullanılır
- **Avatar:** `supabase.auth.getUser()` → email ilk 2 harf (hardcoded "CS" yerine)

---

### E.5 — Dashboard (`src/app/dashboard/page.tsx`)

- `StatsCards` → `Stat` component, durum renginde sol kenar (`borderLeft: "3px solid var(--X)"`)
- `AISummaryCard` → `borderLeft: "3px solid var(--accent)"` daha belirgin
- `SectionHeader` component ile "Stok Envanteri" + row sayısı
- Import drop-zone → `ImportDropZone` subcomponent
- `zIndex: 200` → `"var(--z-dropdown)"`

---

### E.6 — Orders (`src/app/dashboard/orders/page.tsx`)

- Raw `<table>` → `DataTable` compound component
- `PageHeader` component ile başlık
- `FilterTabs` subcomponent (tab + count badge)
- Arama kutusu → `Input` component

---

## Uygulama Sırası

```
1. globals.css token eklemesi (Faz A)          ← sıfır risk, additive
2. Button.tsx fix (B.1 / C.6)                  ← tüm uygulamayı etkiler
3. DataTable.tsx oluştur (B.2)                 ← C.3 ve C.4'ü açar
4. Badge.tsx oluştur (B.4)                     ← trivial
   ──────────────────────────────────────────
5. StockDataGrid → DataTable refactor (C.3)
6. orders/page → OrderRow + DataTable (C.4)
7. StatsCards → Stat component (C.2 + B.9)
8. Sidebar → NavLink (C.1 + B.8)
9. dashboard drop-zone (C.5)
   ──────────────────────────────────────────
10. Accessibility düzeltmeleri (Faz D)         ← bağımsız
    ──────────────────────────────────────────
11. Card, Input, PageHeader, SectionHeader (B.3, B.5, B.6, B.7)
12. Topbar yenileme (E.4)
13. Sidebar görsel (E.3)
14. Dashboard görsel (E.5)
15. Orders görsel (E.6)
16. Login split-screen (E.2)
17. Landing yenileme (E.1)                     ← en son
```

---

## Etkilenen / Oluşturulacak Dosyalar

### Değiştirilecek
| Dosya | Değişiklik |
|-------|-----------|
| `src/app/globals.css` | Token + skip-link + prefers-reduced-motion |
| `src/app/dashboard/layout.tsx` | Skip link, `main id` |
| `src/components/ui/Button.tsx` | DOM mutation fix + touch target |
| `src/components/layout/Sidebar.tsx` | NavLink + DOM fix + görsel |
| `src/components/layout/Topbar.tsx` | Breadcrumb + aria-labels + user avatar |
| `src/components/dashboard/StatsCards.tsx` | Stat component + DOM fix |
| `src/components/dashboard/StockDataGrid.tsx` | DataTable refactor + DOM fix |
| `src/app/dashboard/page.tsx` | ImportDropZone + SectionHeader + z-index token |
| `src/app/dashboard/orders/page.tsx` | OrderRow + DataTable |
| `src/app/page.tsx` | Landing yenileme |
| `src/app/login/page.tsx` | Split-screen + Input component |

### Oluşturulacak (hepsi `src/components/ui/`)
- `DataTable.tsx`
- `Card.tsx`
- `Badge.tsx`
- `Input.tsx`
- `PageHeader.tsx`
- `SectionHeader.tsx`
- `NavLink.tsx`
- `Stat.tsx`

---

## Pre-Delivery Checklist

Her fazın sonunda kontrol:

- [ ] Icon-only butonlarda `aria-label` var
- [ ] Tüm kliklenilebilir elementlerde `cursor: "pointer"` var
- [ ] Hover transition: 150-300ms, layout shift yok
- [ ] Focus ring görünür (globals.css `focus-visible` korunuyor)
- [ ] `prefers-reduced-motion` tüm animasyonları sıfırlıyor
- [ ] Skip link aktif (klavye Tab'da görünüyor)
- [ ] Kritik CTA touch height ≥ 44px
- [ ] Hover-only elementler `opacity: 0.3` (tamamen kaybolmuyor)
- [ ] Form `<label htmlFor>` → `<input id>` bağlı
- [ ] Responsive: 375px · 768px · 1024px · 1440px
- [ ] Mevcut backend testleri geçiyor (servis katmanı değişmiyor)


DÜZELTME :::


Findings

Yüksek: planın kapsamı “yenileme” hedefine göre eksik kalıyor. Dosya listesi yalnızca belli ekranları kapsıyor, ama en ağır ekranlardan products/page.tsx ve alerts/page.tsx gibi alanlar planın ana uygulama listesinde yok. Bu haliyle sonuç “kısmi cleanup” olur, tam frontend renewal değil. Bak: frontend-renewal.md (line 450).
Yüksek: DOM mutation’ı kaldırırken her hover için useState önermek bazı yerlerde fazla pahalı ve karmaşık. Özellikle tablo satırları, kartlar ve nav linklerde bu yaklaşım gereksiz rerender yükü oluşturabilir; sorun çözülür ama yerine daha masraflı bir pattern gelir. En riskli kısım DataTable + row highlight context önerisi. Bak: frontend-renewal.md (line 138), frontend-renewal.md (line 187), frontend-renewal.md (line 315).
Orta: “sadece inline styles + CSS variables” kısıtı korunursa plan bakım sorununu azaltır ama kök nedeni tam çözmez. Yani sistemleşme artar, fakat stil mantığı yine büyük ölçüde component içine gömülü kalır. Eğer bu kural gerçekten zorunlu değilse, planın en zayıf noktası bu. Bak: frontend-renewal.md (line 30).
Orta: erişilebilirlik fazı fazla geç sırada. Skip link, aria-label, drawer focus trap gibi şeyler ilgili component refactor’larıyla aynı anda gitse daha az geri dönüş olur. Şu an sırada biraz sonra geliyor. Bak: frontend-renewal.md (line 343), frontend-renewal.md (line 423).
Orta: pre-delivery checklist’te build/typecheck yok. Bu repo için bu önemli; test geçip build kırılabiliyor. npm run build veya en az tsc --noEmit mutlaka checklist’e girmeli. Bak: frontend-renewal.md (line 479).
Düşük: görsel yenileme bölümü mantıklı ama daha çok “UI sistem cleanup” seviyesinde. Eğer hedef kullanıcı gözüne çarpan bir yenilenme ise, tipografi, boşluk hissi, görsel dil ve marka tonu için daha net bir north star eksik. Bak: frontend-renewal.md (line 356).
Güçlü Taraflar

Fazlama iyi. Önce token, sonra tekrar eden UI primitive’leri, sonra ekran refactor’ı yaklaşımı sağlıklı.
Erişilebilirlik kısmı yüzeysel değil; skip link, focus trap, aria-label, reduced motion gibi doğru maddeler var. Bak: frontend-renewal.md (line 343).
DataTable, PageHeader, Input, Stat gibi parçalara ayırma fikri doğru; özellikle Button, Sidebar, StatsCards, orders/page mutation temizliği yüksek etki yaratır. Bak: frontend-renewal.md (line 128), frontend-renewal.md (line 315).
Verdict
Plan genel olarak iyi ve uygulanabilir. En büyük artısı “makyaj” değil, sistem ve erişilebilirlik borcunu hedeflemesi. Ama ben başlamadan önce 3 şeyi revize ederdim: kapsamı ağır ekranları da kapsayacak şekilde netleştirmek, hover çözümünde useState everywhere yaklaşımını yumuşatmak, checklist’e build/typecheck eklemek.

Yerimde olsam bu planı iyi ama bir tur daha sertleştirilmeli diye değerlendirirdim.
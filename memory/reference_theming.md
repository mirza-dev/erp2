---
name: Roven — Tema Sistemi (Koyu + Aydınlık)
description: data-theme token sistemi, FOUC bootstrap, ThemeToggle, tema-muaf yüzeyler — yeni renk eklerken kırılmayı önler
metadata:
  type: reference
---

Sistem **koyu + aydınlık** tema destekler (2026-06-05'te eklendi, `062bfa9`). Tüm renkler `globals.css` CSS değişkenlerinden gelir; `data-theme` attribute paleti seçer. İlgili: [[project_stack]] (kodlama kuralları), [[reference_worktree_branches]] (push).

## Mimari

- **`src/app/globals.css`** — palet `:root`'tan ayrıldı:
  - `:root, :root[data-theme="dark"]` → **KOYU** (varsayılan; mevcut değerler birebir korundu — koyu kullanıcıda sıfır değişiklik).
  - `:root[data-theme="light"]` → **AYDINLIK (Cool slate)**: `--bg-secondary:#f6f8fa` zemin / `--bg-primary:#ffffff` kart / `--text-primary:#1f2328` / `--accent:#0969da`; status renkleri beyazda kontrastlı (`--success #1a7f37`, `--warning #9a6700`, `--danger #cf222e`).
  - Her temada `color-scheme: dark|light` (native scrollbar/form uyumu).
  - Yeni **tema-bilir tokenlar** (her iki temada tanımlı): `--highlight-inset`, `--accent-bg-strong`, `--success-bg-strong`, `--danger-bg-strong`, `--accent-glow`.
  - Geçiş **anında swap** (transition YOK — yarım-fade içerik/zemin katmanını ayrıştırır). `@media (prefers-reduced-motion: reduce)` global guard mevcut.
- **`src/app/layout.tsx`** — `<head>` içinde **FOUC-suz bootstrap script** (`dangerouslySetInnerHTML`): boyamadan ÖNCE `data-theme` set eder (localStorage `'dark'|'light'`→onu, yoksa/`'system'`→`matchMedia('(prefers-color-scheme: dark)')`, catch→`'dark'`). `<html>`+`<body>` zaten `suppressHydrationWarning`.
- **`src/lib/theme/use-theme.tsx`** — `ThemeProvider` + `useTheme()`: `theme: 'system'|'dark'|'light'` + türetilmiş `resolved: 'dark'|'light'`. Tercih **yalnız localStorage** (`'theme'` anahtarı; backend YOK, migration YOK). İlk `resolved` **DOM'dan okunur** (`getAttribute('data-theme')`) = re-flash yok. `theme==='system'` iken `matchMedia` change canlı izlenir.
- **`src/components/layout/ThemeToggle.tsx`** — güneş/ay ikonu (Topbar'da avatar öncesi): **kısa tık** koyu↔aydınlık, **uzun bas (≥500ms)** → `setTheme('system')` + info toast. (2-durumlu ikon `'system'`'i ulaşılamaz yapardı → uzun-bas geri dönüş kancası.)
- **Mount:** `src/app/dashboard/layout.tsx`'te `ThemeProvider` en dış provider (zaten `"use client"`). Landing/login/error toggle'sız ama root bootstrap onları da global temalar.

## Kurallar (yeni renk eklerken)

- **Renkte HER ZAMAN `var(--...)` kullan** → otomatik temalanır. Sabit hex/rgba ekleme.
- Tema-ilgili tint gerekiyorsa yeni tokenları kullan (`--accent-bg-strong`, `--highlight-inset`, `--success/danger-bg-strong`).
- `#fff` metin yalnız **doygun yüzeyde** güvenli: `var(--accent)` (her iki temada doygun mavi) veya `rgba(0,0,0,0.x)` dark scrim. `var(--bg-*)` üzerinde beyaz metin = aydınlıkta görünmez → YASAK.

## TEMA-MUAF yüzeyler (sabit hex KASITLI — tokenize ETME)

- **Baskı belgeleri** `QuoteDocument.tsx` + `PurchaseOrderDocument.tsx` → beyaz kağıda baskı + PMT marka mavisi `#0072BC`; her iki temada beyaz kağıt kalır. (Dosya başında "TEMA-MUAF" yorumu var.)
- **Settings logo önizleme kutusu** (`settings/page.tsx`) — logolar açık zemin için, beyaz kalır.
- **Products lightbox kapat butonu** (`products/[id]/page.tsx`) — görsel üzerinde beyaz/siyah kontrast.

## Test
`src/__tests__/theme-system.test.ts` (18 test): bootstrap script, palet blokları+cool-slate değerleri, tokenlar, useTheme mantığı, ThemeToggle+Topbar, **baskı-belgeleri-tema-muaf regression**. Topbar/exchange testleri ThemeToggle için `useTheme`+`useToast` stub mock'lar.

---
name: Roven — Products Page Mimarisi
description: products/page.tsx veri akışı, tam ekran detay sayfası, kategori yönetimi ve önemli pattern'ler
type: project
originSessionId: 7a43eaa4-1c39-4659-9d1b-98c8a329ce4f
---
## Veri Akışı

- `products/page.tsx` DataContext'e bağımlı değil; kendi `/api/products` fetch'ini yapıyor
- `const [mockProducts, setMockProducts] = useState<Product[]>([])` + `refetch` useCallback
- "Yenile" butonu → `refetch()` → liste güncellenir
- `mapProduct` from `@/lib/api-mappers` kullanılır

## Drawer Kaldırıldı (Faz 2b — 2026-05-19)

Sağ `AIDetailDrawer` tamamen kaldırıldı. Satır tıklaması artık `router.push(/dashboard/products/${id})` yapıyor.
Drawer'a ait tüm state'ler (`selectedProductId`, `drawerEditMode`, `drawerSaving`, `drawerEditForm`, `commitments`, `quotes` vb.) ve `handleDrawerSave` handler'ı silindi (~1115 satır azalma).

## Tam Ekran Detay Sayfası — /dashboard/products/[id]

`src/app/dashboard/products/[id]/page.tsx` — client component, 7-sekme yapısı.

**Aktif sekmeler (6):** Genel / Teknik / Stok / Tedarik / Ticari / Ekler
**Faz 2e (Partiler) iptal edildi (2026-05-19):** parti/heat_no izlenebilirlik iş gereksinimi olmadığı için tab + product_batches tablosu + helper/route'lar tamamen silindi. Sertifika `product_attachments` kind=certificate ile ürüne bağlı. Geri alma: commit `b7c0227` (Faz 2a) git history'de.

**fetchProduct:** `GET /api/products/${productId}` → zenginleştirilmiş response (quoted/incoming/promisable/forecasted dahil) → `mapProduct(data)`.

**handleSave:** `PATCH /api/products/${product.id}` — clearable nullable alanlar `|| null` / `? ... : null` pattern (NOT NULL alanlar `|| undefined` kalır: name/unit/product_type/currency).

**Stok sekmesi kartları:** on_hand / promisable (satılabilir) / reserved / min_stock_level / quoted (teklifte) / incoming (bekleniyor). Hepsi GET response'tan geliyor (P2-001 fix).

## Liste Sayfası — 6 Sabit Kolon (+ seçim ve aksiyon)

SKU / Ürün Adı / Stok / Satılabilir / Fiyat / Min stok. Eski Kategori/Kapsam/Son Tarih/Sinyal kolonları kaldırıldı.

**Faz B #7 (2026-08-23, `2095ae2`) — tablo artık `Card` + ortak `DataTable`.** Sayfa `"use client"` KALIR (A1'de sunucu-sayfalı fetch'e geçmişti: `?paged=1` → `{rows,total}` + `/api/products/counts`); değişen yalnız sunum.
- Kolonlar `columns: DataTableColumn<Product>[]` dizisinde. `price`/`minStock` dar ekranda gizli → `wideOnlyColumns` spread'i (`...(isMobile ? [] : wideOnlyColumns)`), eski `{!isMobile && <th/>}` koşullarının karşılığı.
- Satır tıklaması `onRowClick={product => router.push(...)}` — **parametre adı `product` KALMALI**, `products-page-drawer-removed.test.ts` bu regex'i kilitliyor.
- Satır klavye erişimi artık DataTable'dan gelir (`tabIndex=0` + Enter/Space); erişilebilir ad `rowAriaLabel={product => \`${product.name} detayını gör\`}`. Eski elle yazılmış `tabIndex`/`role="button"`/`onKeyDown` kaldırıldı — `role="button"` bilinçli düşürüldü (tablo satırı semantiğini yok ediyordu).
- **Dikkat:** `cellStyle` kolona statiktir → Stok/Satılabilir'in satır bazlı koşullu rengi hücre içeriğinde `<span style>` ile. DataTable ortak stili `whiteSpace:nowrap` VERMEZ → kolon bazında `headerStyle`/`cellStyle` ile veriliyor (Ürün Adı'nın `textOverflow:ellipsis`'i buna bağlı).
- `hoveredId` + `onMouseEnter/Leave` + `rowBg` KALDIRILDI (hover globals.css `.erp-data-table`). Yerel `thStyle`/`tdStyle` KALDIRILDI; `modalInputStyle` KALDI.
- Boş durum `emptyMessage`, Pagination `footer` prop'unda. Boş durum artık `total===0` yerine `rows.length===0` ile render olur (bilinçli).

## Kategori Yönetimi

- **Hardcoded array YOK** — `categories` useMemo ile türetiliyor:
  ```tsx
  const categories = useMemo(
      () => ["Tümü", ...Array.from(new Set(mockProducts.map(p => p.category).filter(Boolean))).sort()],
      [mockProducts]
  );
  ```
- Create form: `<input type="text" list="product-categories-list">` + `<datalist>`

## Scan Lock

Alerts sayfasındaki "Tara" butonu: `?force=true` parametresi kullanıyor — takılı kalan advisory lock'u zorla açar.

## Mount Tarama Davranışı

- **Products page:** Mount'ta `POST /api/alerts/scan` YAPMAZ. Sadece `GET /api/alerts` çeker. Scan → sadece `handleRefresh()` butonuyla tetiklenir.

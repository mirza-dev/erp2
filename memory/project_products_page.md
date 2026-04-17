---
name: KokpitERP — Products Page Mimarisi
description: products/page.tsx veri akışı, drawer edit modu, kategori yönetimi ve önemli pattern'ler
type: project
---

## Veri Akışı (2026-04-15 refactor sonrası)

- `products/page.tsx` DataContext'e bağımlı değil; kendi `/api/products` fetch'ini yapıyor
- `const [mockProducts, setMockProducts] = useState<Product[]>([])` + `refetch` useCallback
- "Yenile" butonu → `refetch()` → liste güncellenir
- `mapProduct` from `@/lib/api-mappers` kullanılır

## Kategori Yönetimi

- **Hardcoded array YOK** — `categories` artık component içinde useMemo ile türetiliyor:
  ```tsx
  const categories = useMemo(
      () => ["Tümü", ...Array.from(new Set(mockProducts.map(p => p.category).filter(Boolean))).sort()],
      [mockProducts]
  );
  ```
- Create form: `<input type="text" list="product-categories-list">` + `<datalist>` → yeni kategori yazılabilir
- Import sonrası yeni kategoriler otomatik filtre seçeneklerine eklenir

## Drawer — Block 1 "Ürün Kimliği" Edit Modu

**State:** `drawerEditMode`, `drawerSaving`, `drawerEditForm` — component içinde
**Reset:** `selectedProductId` değişince `useEffect` ile sıfırlanır

**"Düzenle" butonu:** Block 1 başlığının sağında, `!drawerEditMode && !isDemo` koşuluyla gösterilir

**Editable alanlar:** ad, ürün tipi, kategori, alt kategori, ürün ailesi, sektör uygunluğu, sektörler, kullanım, malzeme, menşei, üretim tesisi, standartlar, sertifikalar, birim, depo, tedarikçi, tedarik süresi, ağırlık, satış fiyatı, maliyet, para birimi, notlar

**Kasıtlı düzenlenemeyen:** SKU — import dedup key olduğu için dışarıda bırakıldı

**Kaydet akışı:** `PATCH /api/products/{id}` → camelCase → snake_case dönüşümü → `await refetch()` → toast

**`drawerInputStyle`:** Modül seviyesinde sabit (12px, 4px 8px padding, border-secondary) — `modalInputStyle`'dan (13px, 6px 10px) farklı çünkü drawer daha dar

## Drawer — "Nerede Kullanılıyor?" Kaldırıldı

2026-04-15'te silindi. DB'de özel tablo yoktu, sadece hesaplanan frontend koduydu.

## Scan Lock

Alerts sayfasındaki "Tara" butonu ve DemoTab seed sonrası scan: `?force=true` parametresi kullanıyor — takılı kalan advisory lock'u zorla açar.

## Mount Tarama Davranışı (2026-04-17 değişti)

- **Products page:** Artık mount'ta `POST /api/alerts/scan` YAPMAZ. Sadece `GET /api/alerts` çeker. Scan → sadece `handleRefresh()` butonuyla tetiklenir.
  - **Why:** Her sayfa açılışında tam alert scan RPC çalışıyordu → freeze ve gecikme.
- **Diğer sayfalar:** Benzer şekilde useMemo ile filter/sort hesapları optimize edildi.

## Performance Optimizasyonları (2026-04-17)

`React.memo` ile sarılan componentler: Sidebar, Topbar, StatsCards, RecentOrders, AIAlerts, StockDataGrid.

`useMemo` ile sarılan hesaplamalar: Sidebar'daki navGroups + count'lar; products, orders, alerts, purchase/suggested sayfalarındaki `filtered`/`sorted` array'leri.

**Why:** Bu pattern'ler yeni bir session'da hızlıca hatırlanması gereken mimari kararlar.
**How to apply:** products/page.tsx'e dokunurken DataContext bağımlılığı arama; drawer edit modu state'leri component içinde. Mount'ta scan yok — handleRefresh'e bak.

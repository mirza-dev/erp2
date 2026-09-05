---
name: roven-frontend-yenileme-plan
description: "frontend-renewal.md — DOM mutation fix, component lib, accessibility, görsel yenileme — plan var, uygulama başlamadı"
metadata: 
  node_type: memory
  type: project
  originSessionId: 14992303-287a-4b73-b0e6-d62dbec7425c
---

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/frontend-renewal.md` (2026-04-08, gitignore'da değil)

**Durum:** PLAN HAZIR — **kısmen turlarda uygulandı** (formal frontend-renewal commit'i yok ama maddeler ayrı turlarda kapatıldı). KAPANANLAR: DOM mutation fix (orders/quotes/products/customers/PO/production turlarında `hoveredId` state'e geçildi), a11y (modal `role=dialog`/`aria-modal`/`aria-labelledby` + aria-label çoğu sayfada), `prefers-reduced-motion` global guard (tema turunda `062bfa9`), Topbar yeniden tasarım ("Sakin düz" `bf28fb0` — breadcrumb yerine sola-başlık). **Faz B BAŞLADI — pilot + yayılım sürüyor:** `src/components/ui/` altına `DataTable<T>` (generic kolon/satır + thead/boş-durum/hizalama/footer + opsiyonel `onRowClick` satır navigasyonu; seçim mantığı caller'da kalır) + `Badge` (tone token çiftleri) + `Card`. Hover = globals.css `.erp-data-table tbody tr:hover` (rerender yok, DOM-mutation yok). DataTable ayrıca `minWidth?: string` + tablo `overflow-x:auto` wrapper + (globals.css) `.row-reveal` hover-reveal utility destekler. **Dönüştürülen listeler:** (1) **VendorsClient** (`c6f46fc` — pilot); (2) **PurchaseOrdersClient** (`931c62d` — onRowClick→router.push, STATUS_BG→STATUS_TONE+Badge); (3) **CustomersClient** (`64af65d` — onRowClick→setSelectedCustomer panel, minWidth=700px, 9 kolon); (4) **OrdersClient** (`024c2d8` — onRowClick→router.push, minWidth=740px, `.row-reveal` sil/chevron, `<EmptyState>` emptyMessage, `.badge` rozetleri korundu); (5) **QuotesClient** (`cdb5be3` — Orders'ın birebir ikizi; onRowClick→router.push, minWidth=740px, 8 kolon, `.row-reveal` sil/chevron, `.badge` durum rozetleri + geçerlilik alt-rozeti korundu); (6) **3 settings tablosu** (`dceb9a8` — users/email-deliveries/product-types; Orders/Quotes ikizi DEĞİL: hover/satır-tıklama/seçim YOK → onRowClick yok; aksiyonlar her zaman görünür buton; product-types pasif-kayıt opacity için **DataTable YENİ `rowStyle?(row)`** eklendi). Her dönüşüm: thStyle/tdStyle kaldırılır, tablo→Card/DataTable, hoveredId (varsa) kaldırılır (hover/reveal CSS); davranış/RBAC/demo değişmez; migration yok. **DataTable API:** `columns/rows/rowKey/emptyMessage/footer/onRowClick/rowAriaLabel/minWidth/rowStyle`. `onRowClick` fare + **klavye** sözleşmesi verir (tabIndex=0 + Enter/Space); `rowAriaLabel` satırın erişilebilir adı. **PREMIUM LIGHT THEME** (`f550e83`, codex'ten entegre): DataTable/Card token bazlı (`--surface-raised/-border/-shadow`, `--table-header-bg/-row-hover`, `--line-width`, `--font-table-*`, `--input-bg/-border`); yeni dönüşümler bu token'ları otomatik miras alır. (7) **products/page.tsx** (`2095ae2` — Faz B #7, LİSTE TARAFINI KAPATAN dönüşüm; diğer 6'nın ikizi DEĞİLDİ: bkz. aşağıda). **LİSTE TARAFI BİTTİ 7/7** — repoda ham `<table>` tutan tek kalan yüzey `src/components/dashboard/StockDataGrid.tsx` (grid, liste değil; theme-system "temsilci tablolar" döngüsünde yalnız o kaldı).

**products dönüşümünün üç dersi (kalıbı körlemesine uygulama):**
1. **A11y sözleşmesi component'e ait.** products repodaki TEK klavye-erişilebilir liste satırıydı (`tabIndex`/`role`/`aria-label`/`onKeyDown` elle yazılmış). Düz dönüşüm regresyon olurdu → önce `DataTable`'a taşındı (`c98c579`): `onRowClick` verilince satır `tabIndex=0` + Enter/Space (`preventDefault`), YENİ `rowAriaLabel?: (row)=>string`. **`role="button"` EKLENMEDİ** — `<tr role="button">` satırı ekran okuyucuda "tablo satırı" olmaktan çıkarır. Kasıtlı yan etki: Orders/Quotes/Customers/PO da klavyeyle gezilebilir oldu.
2. **`cellStyle` KOLONA statiktir, satıra değil** → satır bazlı koşullu renk/stil hücre içeriğinde `<span style>` ile verilir (Stok/Satılabilir kritik-uyarı eşikleri).
3. **DataTable ortak stili `whiteSpace: nowrap` VERMEZ.** Sayfaların yerel tdStyle'ı çoğu zaman veriyordu → gerekiyorsa kolon bazında `headerStyle`/`cellStyle` ile geri ver (`textOverflow: ellipsis` nowrap olmadan çalışmaz). Global eklemek dönüşmüş tüm listelerin sarma davranışını değiştirir.

**Faz B #8 — DRAWER TARAFI KAPANDI (2026-09-05).** YENİ `ui/Drawer` + `ui/dialog-a11y.ts`; **YEDİ** yan çekmecenin hepsi taşındı (kayıtlı sayı 4'tü — ikisi sayfaların İÇİNE gömülüydü: `VendorsClient` `justifyContent:"flex-end"` ile, `email-deliveries` `<aside>` olarak; **çekmece sayımı imzaya göre yapılmalı**). Kusurlar: 4'ünde Escape, 6'sında odak tuzağı, 5'inde odak dönüşü yoktu ve **beşi buna rağmen `role="dialog"` İLAN EDİYORDU**; dört z-index katmanı (50'dekiler kabuğun mobil menüsünün ALTINDA); üç dikey teknik — `height:100vh` iOS Safari'de görüntü alanından büyüktür (panelin dibi erişilemez) ve **hiç ölçülmemişti**. `Drawer`da **`height` HİÇ yazılmaz** (`top:0`+`bottom:0` — `100dvh`ten de iyi), katman 200/201, yüzey `--surface-raised`+`--surface-border`; `padded={false}` `Modal`'dan farklı olarak **flex sütunu KORUR**. Davranış-nötrlük kanıtı: `modal-ui.test.tsx`'in 17 testi **dokunulmadan** yeşil. 24 tarayıcı ölçümü temiz. Rapor `docs/audit/2026-09-05-yan-cekmeceler.md`.

**FAZ B KAPANDI (2026-09-05).** Son üç bileşen tek turda, üç dilimde: `NavLink` (`4745cae`) · `SectionHeader` (`b05f23d`) · `Stat` (`497d717`). Rapor `docs/audit/2026-09-05-uc-bilesen.md`.

**ÜÇ KAYITLI SAYININ ÜÇÜ DE DÜŞÜKTÜ** (hepsi önceki turun ÖN TARAMASINDAN geliyordu): `SectionHeader` ~45 değil **85 çağrı / 42 varyant** · `Stat` ~28 değil **3 paylaşılan + 7 dosya-yerel + 26 elle / 20 değer tipografisi** · `NavLink` eksenleri ÇAPRAZ çıktı.

**`NavLink`:** görsel ikili Sidebar+Ayarlar (aynı üç nav token'ı + 2px sol accent şeridi, iki ayrı uygulama), mantık ikilisi Sidebar+Developer (`isActive` birebir iki kopya) → iki eksen AYRI çözüldü, Developer'ın alt-çizgi dili KASTEN korundu. Asıl kusur a11y: **Sidebar'ın 16-18 bağlantısında `aria-current` YOKTU**, altı işaret de yalnız görseldi. Hover'daki 6 satır DOM mutasyonu silindi, görünüm `.nav-rail-item` CSS sınıfına geçti. Altı ölçü kayması ölçümle tek değere indi.

**`SectionHeader`: GÖRÜNMEK ≠ OLMAK** (Drawer dersinin tersi). 44 bölüm etiketi `<div>`di → **`orders/[id]` ve `quotes/[id]`nin h1/h2/h3 sayısı SIFIRDI**. Dört rakip kanon, ikisi AYNI DOSYADA (`settings/page.tsx`). Üç rol/üç ölçek (`label` 11px BÜYÜK HARF / `title` 13px / `dialog` 16px); `Input.labelStyle()`ından TÜRETİLEMEZ (o `textTransform` taşımamaya kilitli). Tipografi imzası 42→4.

**`Stat`: kapının kanıtladığı kusur, kapının BAKMADIĞI yerde.** Beş yüzey kutu zemini olarak `--bg-secondary` kullanıyordu = görünmez kutu; kural 2026-08-31'de yazılmıştı ama beş sayfalık allowlist üzerinde. Ton haritası 4 KOPYA → 1 (`Badge.TONE_TOKENS` export). Değer tipografisi 20→1 (`21px/650/tabular-nums`). **Uyarı gerçekleşti:** `gate/surface-consistency`nin ≥7/≥3 sayacı kırıldı (Öneriler 3→0, üçü de stat kutusuydu) → yapı iddiasına çevrildi + eksik `stripComments` eklendi.

**DERSLER:** görünmek ≠ olmak · **bir kapı yalnız BAKTIĞI yerde koruma sağlar** (kanıtlı kuralın KAPSAMI da kanıtlanmalı) · bir kural iddia ettiğinden fazlasını söylememeli (negatif stat kuralı ilk yazımda sekme şeridini de yakaladı, stat imzasına daraltıldı) · ön tarama envanter değildir.

**Kapı:** `surface-consistency` +7 · `form-consistency` +4 (**`<h2>` için bugüne kadar HİÇ kapı yoktu**) · `console-consistency` ada değil tipografiye bağlandı · üç yeni davranış testi (47 test). 18/18 kırmızı-kanıtlı. 501 dosya / 7006 test · E2E 94/94 · tüketici tarafında net −187 satır.

**KAPSAM DIŞI, kayıtlı:** ~~`orders/[id]`+`quotes/[id]`ye `PageHeader`~~ → **EK TURDA KAPATILDI** (0→5 ve 0→1 başlık; `purchase/orders/[id]` emsali; kalan: `QuoteForm`un kendi bölüm başlıkları) · `KpiCard` (uçtan uca test kilidi) · `Fact` ×2 · `StatsCards` (ölü ama silinmesi yasak) · baskı belgeleri · landing. Kalan 4 DOM-mutasyonlu hover dosyası artık kapı allowlist'inde gerekçeli.

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
| B | Component Kütüphanesi | **KAPANDI 2026-09-05.** DataTable(+onRowClick[klavye dahil]+rowAriaLabel+minWidth+rowStyle+`.row-reveal`), Card, Badge VAR; **liste tarafı 7/7 BİTTİ**: Vendors+PO+Customers+Orders+Quotes+3 settings tablosu+products (`c6f46fc`/`931c62d`/`64af65d`/`024c2d8`/`cdb5be3`/`dceb9a8`/`2095ae2`). Premium light theme entegre (`f550e83`). **Drawer tarafı 2026-09-05'te KAPANDI** (`ui/Drawer`+`dialog-a11y`, 7 çekmece). **Son üç bileşen de 2026-09-05'te KAPANDI** (`ui/NavLink`+`SectionHeader`+`Stat`; `4745cae`/`b05f23d`/`497d717`). AÇIK MADDE YOK. |
| C | DOM Mutation Fix | `onMouseEnter` style mutation → `useState(hovered)` — **ÇOĞU YAPILDI** (orders/quotes/products/customers/PO/production) |
| D | Accessibility | Skip link, aria-label ✅(çoğu), focus trap (Sidebar mobile), form label-input bağlantısı — kısmen |
| E | Görsel Yenileme | Landing, Login split-screen, Sidebar, ~~Topbar breadcrumb~~ → **Topbar "Sakin düz" yapıldı** (`bf28fb0`, sola-başlık), Dashboard, Orders |

**Uygulama sırası:** globals.css → Button fix → DataTable oluştur → DOM mutation'ları kur → Accessibility → Görsel

---

## Review Bulgular (plana göre 3 revizyon gerekli)

1. ~~**Kapsam eksik:** `products/page.tsx` ve `alerts/page.tsx` uygulama listesinde yok~~ → products ✅ (`2095ae2`, Faz B #7); alerts hâlâ açık
2. **Hover useState riski:** Her satır için `useState` → gereksiz rerender; özellikle DataTable row highlight context riskli. Yumuşatılmalı
3. **Checklist'e build/typecheck ekle:** `npm run build` / `tsc --noEmit` yoktu

---

## Etkilenecek Dosyalar (mevcut)

Değiştirilecek: `globals.css`, `dashboard/layout.tsx`, `Button.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `StatsCards.tsx`, `StockDataGrid.tsx`, `dashboard/page.tsx`, `orders/page.tsx`, `page.tsx` (landing), `login/page.tsx`

Oluşturulacak (`src/components/ui/`): `DataTable.tsx`, `Card.tsx`, `Badge.tsx`, `Input.tsx`, `PageHeader.tsx`, `SectionHeader.tsx`, `NavLink.tsx`, `Stat.tsx`

**Why:** Plan hazır ve kullanıcı bu dosyayı "başka bir tane vardı" diyerek 2026-04-23'te sordu — aktif bir sonraki iş olabilir.
**How to apply:** Bu plana başlanmadan önce yukarıdaki 3 revizyon maddesini kullanıcıyla netleştir.

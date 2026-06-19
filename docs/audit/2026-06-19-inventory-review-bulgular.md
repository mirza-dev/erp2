# Stok Defteri / Inventory — Derin Denetim Bulguları

**Tarih:** 2026-06-19
**Kapsam:** Çekirdek stok defteri — `/api/inventory/movements`, `src/lib/stock-utils.ts`,
`src/lib/supabase/products.ts` (stok mutasyon yardımcıları), `src/lib/services/import-service.ts`
(stok yazma yolu), stok RPC'leri (`record_stock_movement`/`adjust_on_hand`/`increment_reserved`/
`decrement_on_hand`/`record_stock_transfer`/`recount_stock`).
**Yöntem:** REVIEW.md + domain-rules.md §5–6 kurallarıyla, kaynak koda karşı doğrulanarak
(naming-inference değil). Migration'lar uygulanmış kabul; bulgular TS koduna yönelik.

## Özet

**No blocking issues — K:0 Y:0 O:0.** Stok mutasyonlarının tamamı atomik, guard'lı RPC'lerden
geçiyor. 1 Düşük-Orta + 1 Düşük bulgu tespit edildi; ikisi de bu turda düzeltildi.

## Doğrulanan sağlamlık (bulgu DEĞİL)

- **`record_stock_movement`** (mig 004/008): ürün satırını `for update` kilitler, negatif-stok
  reddi (`on_hand + p_quantity < 0` → hata), insert + on_hand update tek transaction.
- **`increment_reserved`** (mig 002/003 → son hâli): `reserved = least(on_hand, reserved + p_qty)`
  — over-reserve cap.
- **`adjust_on_hand` / `decrement_on_hand`**: `greatest(0, …)` clamp → on_hand negatife düşmez.
- **`record_stock_transfer`** (mig 084): ayrı `stock_location_balances` tablosu, çıkış satırı
  `for update`, net-sıfır hareket çifti, **`products.on_hand`'e dokunmaz** (lokasyon-içi transfer
  çift saymaz). Tablo RLS açık (084:84). Çok-lokasyon domain non-goal'una (§15) rağmen transfer
  yolu tutarlı.
- **Demo-mode merkezi:** `proxy.ts:207-209` — demo cookie'li anonim kullanıcı için non-GET API
  → 403. Stok yazma route'larının kendi `isDemoMode()` kontrolü gerekmez (kod genelinde tutarlı;
  hiçbir route per-route demo guard kullanmıyor).
- **RBAC:** GET `/api/inventory/movements` → `view_products`; POST → `stock_adjust_general` |
  `stock_adjust_sales_context` (A3 turunda eklenmiş).
- **Import stok yazma:** `dbRecordMovementAtomic` (atomik RPC) + `dbRecordStockTransfer`
  kullanıyor; doğrudan TS-seviyesi `products.on_hand`/`reserved` UPDATE yok (tek istisna
  `seed-runner.ts:482` — seed/demo aracı, üretim yolu değil).

## Bulgular

### D-O1 — Import "stok sayımı" oku-sonra-delta: kayıp güncelleme (DÜZELTİLDİ)
- **Kanıt:** `src/lib/services/import-service.ts` (eski) — `delta = quantity - prod.on_hand`;
  `prod.on_hand` `dbFindProductBySku` ile, `record_stock_movement` çağrısından önce, RPC
  transaction'ının **dışında** okunuyordu. RPC delta'yı o anki on_hand'e eklediği için araya
  eşzamanlı bir dış stok hareketi girerse nihai `on_hand ≠ sayılan değer`.
- **Etki:** Stok **sayımı** otoriter olmalı (fiziksel sayım = mutlak gerçek), ama delta-temelli
  olduğundan eşzamanlılıkta sessizce yanlış sonuç. Olasılık düşük (import operatör-güdümlü,
  okuma-yazma penceresi dar, batch-içi sıralı `await` → intra-batch yarış yok) → D-O.
- **Düzeltme:** Yeni `recount_stock(p_product_id, p_counted_qty, p_notes, p_actor)` RPC
  (migration **105**) — satırı `for update` ile kilitler, delta'yı **transaction içinde**
  hesaplar, `on_hand`'i mutlak sayılan değere atar, delta hareketini kaydeder. Negatif sayım
  yine reddedilir; delta=0 no-op. TS wrapper `dbRecountStock` (`products.ts`); `import-service`
  stok sayımı dalı artık JS'te delta hesaplamadan bunu çağırır. Stok **hareketi** (in/out) hâlâ
  delta-temelli `dbRecordMovementAtomic`, transfer dalı değişmedi.
- **Efor:** 1 migration + 1 wrapper + import dal yeniden yapılandırma + 3 davranışsal test.

### D2 — Ölü, atomik-olmayan stok yardımcıları (DÜZELTİLDİ — kaldırıldı)
- **Kanıt (sıfır çağıran, grep + test doğrulandı):**
  - `products.ts` — `dbRecordMovement` (insert + `adjust_on_hand` iki ayrı `await`, atomik
    değil; ayrıca `adjust_on_hand` sessizce 0'a clamp eder → atomik yolun "reddet" invariant'ından
    sapar).
  - `orders.ts` `// Stock helpers (DEPRECATED)` bloğu tamamı — `StockConflict` interface,
    `dbGetProductStocks`, `dbReserveStock` (rezervasyonu tam qty ile yazar, oysa
    `increment_reserved` cap'lemiş olabilir → `products.reserved` ile tutarsız kayıt),
    `dbReleaseStock`, `dbShipOrder` (decrement_on_hand + ayrı insert + ayrı rezervasyon update,
    atomik değil).
- **Etki:** Canlı bug değil; gelecekte bir geliştirici bu `@deprecated` yardımcılardan birini
  çağırırsa atomiklik/cap invariant'ını sessizce bozar (footgun). Canonical atomik yollar:
  `dbRecordMovementAtomic`/`dbRecountStock`, `dbApproveOrder` (approve_order_with_allocation),
  `dbCancelOrder` (cancel_order), `dbShipOrderFull` (ship_order_full).
- **Düzeltme:** Tüm ölü yardımcılar silindi (`OrderLineRow` import'u korundu — başka kullanıcısı
  var; `StockConflict` artık hiçbir yerde referans edilmiyor). Plan'daki 4-fonksiyonluk liste,
  aynı kategorideki `dbShipOrder`'ı da kapsayacak şekilde genişletildi (bütün DEPRECATED blok
  tutarlı biçimde kaldırıldı).

## Gate / Test notları

- `recount_stock` tek migration'da tanımlı (yeniden tanımlama yok) → `sql-lint-baseline.ts`
  `REDEFINITION_CHAINS` (yalnız ≥2 migration'da tanımlı fonksiyonları izler) **GÜNCELLENMEZ**;
  eklenseydi "hayalet zincir" gate'ini bozardı. Migration `SECURITY DEFINER` kullanmaz → DEFINER
  hijyen gate'i de tetiklenmez.
- Doğrulama: tsc 0 · lint 0 · vitest **5581** (+1 net) · build 0.

## Kalan / kullanıcı-tarafı

- **Migration 105 APPLY BEKLİYOR** — Supabase Studio'da manuel uygulanmalı; sonra
  `npm run check-migrations` probe ile doğrulanır.

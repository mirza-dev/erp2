---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-08):**
1. **Faz 2 Bug Fix — 5 kritik hata düzeltildi:**
   - `forecasted` formülü düzeltildi: `p.available_now + incoming - quoted` (reserved çift sayılıyordu)
   - Alındı double-click race condition giderildi: `receivingId` state ile buton kilitleniyor
   - Create/cancel sonrası drawer grid stale kalıyordu: her mutation'da `window.location.reload()`
   - `dbCancelCommitment` 0-satır etkilense bile 200 dönüyordu: `.select("id")` + length kontrolü → throw
   - Demo mode silent fail: `isDemo` guard tüm commitment butonlarına eklendi
   - 7 test eklendi: forecasted formül testleri + cancel 0-satır testleri
   - **50 dosya · 1164 test**

2. **Faz 2 — Giriş Takibi (incoming/forecasted + purchase_commitments)** — 5 alt-faz:
   - DB migration: `purchase_commitments` tablosu + `receive_purchase_commitment` RPC (`020_purchase_commitments.sql`)
   - CRUD: `dbGetIncomingQuantities()`, `dbListCommitments`, `dbCreateCommitment`, `dbReceiveCommitment`, `dbCancelCommitment`
   - API: `/api/purchase-commitments` GET+POST, `/api/purchase-commitments/[id]` GET+PATCH
   - Products API: 3-way parallel fetch, `incoming` + `forecasted` enrich
   - `Product` interface: `incoming`, `forecasted` required alanlar; `mapProduct()` fallback
   - `data-context.tsx` Omit: `incoming` ve `forecasted` eklendi
   - Ürünler sayfası: stok kolonu "+X bekleniyor" yeşil, sinyal "ÖNGÖRÜLEN KRİTİK", drawer 8-cell grid
   - Drawer: Bekleyen Teslimatlar — liste + inline form + Alındı/İptal

3. **Faz 1 — Teklif Görünürlüğü (quoted/promisable)** — 5 alt-faz (2026-04-08)

**Sonraki adım:** Faz 3 — Stok Eskime Raporu (order_lines'tan hesaplanan son hareket tarihi, sermaye analizi)

**Blokör:** —

**Why:** Yeni session'da Claude aktif konuyu bilsin, context kaybı yaşanmasın.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.

# Purchase Modülü — Derin Denetim Bulguları

**Tarih:** 2026-06-19
**Kapsam:** Satınalma — `/api/purchase-orders` (+ alt route'lar: receive/cancel/confirm/send/revise/lines/from-recommendations),
`/api/purchase-commitments`, `/api/recommendations`, `purchase-order-service.ts`,
`supabase/purchase-orders.ts` + `purchase-commitments.ts`, `receive_po_lines`/`confirm_po`/
`cancel_po`/`replace_purchase_order_lines`/`receive_purchase_commitment` RPC'leri.
**Yöntem:** REVIEW.md + domain-rules.md §7 (purchase suggestion) / §13 (auditability) ile,
kaynak koda karşı doğrulanarak. Migration'lar uygulanmış kabul.

## Özet

**K:0 Y:0 — tek bulgu O1 (Orta), düzeltildi.** Yetki ve stok katmanı sağlam.

## Doğrulanan sağlamlık (bulgu DEĞİL)

- **13 route'un hepsi guard'lı:** GET'ler `view_purchase_orders`/`view_purchase_suggestions`;
  mutasyonlar `manage_purchase_orders`; `receive` + `from-recommendations`
  `requireRole(["admin","purchaser"])`; `cancel` `requireRole(["admin"])`; recommendations PATCH
  `manage_purchase_suggestions`. Guard'sız method YOK (A3 method-seviye bulgusu burada tekrar
  etmedi).
- **`receive_po_lines` RPC (mig 051) atomik + doğru:** PO + her satır `FOR UPDATE`; durum guard'ı
  (yalnız confirmed/partially_received); **aşırı-kabul reddi** (`received_qty + qty > quantity`
  → RAISE); `on_hand += qty` + line.received_qty + commitment senkronu + inventory_movement +
  audit_log hepsi tek transaction; PO header auto-status (received/partially_received). Y1 (orders
  denetimi) reallocation `serviceReceivePOLines`'ta `dbTryResolveShortages` ile bağlı →
  partially_allocated sipariş mal kabulle allocated'a yükselir.
- **Stok defteri invariant'ı:** PO mal kabul yalnızca `on_hand` artırır; rezervasyon/`reserved`'a
  dokunmaz (doğru — mal kabul tedarik girişidir). Negatif/aşırı kabul DB seviyesinde reddedilir.
- **Finansal redaction:** GET `redactPurchaseOrdersForPerms` — `view_purchase_costs` yoksa
  subtotal/vat_total/grand_total null (sales/production/viewer maliyeti görmez).
- **Idempotency / yarış:** `confirm_po`/`cancel_po`/`replace_purchase_order_lines` durum geçiş
  guard'lı; from-recommendations duplicate-PO guard'ı (cancelled hariç aktif PO'ya bağlı rec
  reddedilir). `revalidateTag(tag,"max")` repo-geneli konvansiyon — bulgu değil.

## Bulgu

### O1 — İstemci-beslemeli `actor`/`created_by` → audit + stok-hareketi atfı sahtelenebilir (DÜZELTİLDİ)

- **Kanıt (8 nokta, hepsi `src/app/api/purchase-orders/...`, düzeltme öncesi):**
  - `route.ts` POST create → `createdBy: body.created_by`
  - `[id]/receive/route.ts` → `actor = body.actor ?? "system"` → `serviceReceivePOLines` →
    `receive_po_lines(p_actor)` → **`inventory_movements.created_by` + `audit_log.actor`** (mig 051)
  - `[id]/cancel`, `[id]/confirm`, `[id]/send`, `[id]/revise`, `[id]/lines` → `actor = body.actor`
    → `dbTransitionPurchaseOrder`/`replace_purchase_order_lines` audit
  - `from-recommendations/route.ts` → `body.actor` → `dbCreatePurchaseOrder({createdBy})`
- **Etki:** Aktör istemcinin JSON gövdesinden alınıp stok hareketi `created_by` + `audit_log.actor`
  (+ `purchase_orders.created_by`) alanlarına yazılıyordu. Route'lar rol-gated → **yetki yükseltme
  DEĞİL**; ama yetkili bir kullanıcı işlemini başka bir kullanıcıya/"system"'e atfedebilir
  (non-repudiation / audit bütünlüğü kaybı). domain-rules §13.1–13.2 audit'i öncelik #2 yapar ve
  "satın alma önerisi kabulü / sevkiyat" için gerçek `actor` zorunlu. **Kodun geri kalanıyla
  tutarsızdı:** quotes/orders/rfqs/customers/vendors/import sunucu-otoriter `getCurrentUserId()`
  kullanıyor — özellikle orders `ship` (stok-çıkış) otoriterken PO `receive` (stok-giriş, **aynı
  defter**) istemci-beslemeliydi.
- **Düzeltme:** 8 route'un tamamı guard'dan sonra `getCurrentUserId()` (quotes `[id]`/send-email
  emsali) kullanır; `body.actor`/`body.created_by` okuması kaldırıldı. confirm/send/revise'de
  yalnız actor için yapılan `safeParseJson` çağrısı da kaldırıldı (sadeleşme). Servis/RPC imzaları
  DEĞİŞMEDİ → blast radius yalnız route katmanı; stok/aşırı-kabul/redaction davranışı aynı.
- **Test:** po-receive + po-from-recommendations'a "body.actor görmezden gelinir, actor =
  oturum kullanıcısı" davranışsal testleri eklendi; from-recommendations'ın eski `undefined` actor
  assertion'ı session-id'ye güncellendi; ilgili 4 test dosyasının role-guard mock'una
  `getCurrentUserId` eklendi.
- **Efor:** 8 route + 4 test dosyası (yeni assertion + mock); migration YOK.

## İkincil gözlem (Düşük — KAPSAM DIŞI, repo-geneli kalıp)

- `serviceReceivePOLines` mal kabul sonrası alert-scan'i `fetch(\`${NEXT_PUBLIC_APP_URL ?? ""}/api/alerts/scan\`)`
  ile tetikler → env yoksa relative URL fetch sunucuda sessiz fail olabilir. Best-effort
  (try/catch, mal kabulü bozmaz) ve production-service/inventory ile **aynı kabul edilmiş kalıp**
  → bu turda dokunulmadı. İleride merkezi bir absolute-URL helper'ı düşünülebilir (repo geneli).

## Doğrulama

- tsc 0 · lint 0 · vitest **5583** (+2) · build 0.
- Davranış: PO mal kabul/iptal/oluşturma → `audit_log.actor` + `inventory_movements.created_by`
  = oturum kullanıcısı (istemci `actor` yok sayılır). Stok/aşırı-kabul/redaction değişmez.

## Kalan

- Migration YOK → kullanıcı-tarafı APPLY yok.
- Backlog'da denetlenmemiş tek modül: **vendors** (+ product-vendor-links).

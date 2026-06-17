# Roven ERP — Orders (Satış Siparişi) Modülü Derin İnceleme Bulguları

_Tarih: 2026-06-17 · Ajan: `erp2-reviewer` · Kapsam: orders modülü derin denetim_

> **Kapsam:** `src/app/api/orders/**` · `src/app/dashboard/orders/**` (liste/new/[id]/OrderForm) · `src/lib/services/order-service.ts` · `src/lib/supabase/orders.ts` · orders RPC zinciri (011/023/051/081/082/088/093/094) · rezervasyon/tahsisat kesişimi. Mekanik araçlar (semgrep + gitleaks) orders kapsamında koşturuldu.

## Özet

| Seviye | Adet | Durum |
|--------|------|-------|
| Kritik (K) | 0 | — |
| Yüksek (Y) | 1 | ✅ Y1 düzeltildi (2026-06-17) |
| Orta (O) | 2 | ✅ O1+O2 düzeltildi |
| Düşük (D) | 1 | ✅ D1 kaldırıldı |
| Nit | 2 | ✅ N1+N2 temizlendi |

> **Düzeltme turu (2026-06-17, migration GEREKMEZ):** **Y1** `serviceReceivePOLines` mal kabulü sonrası alınan ürünler için `dbTryResolveShortages` (best-effort) → PO ile gelen stok onaylı `partially_allocated` siparişi otomatik `allocated`'a yükseltir (mevcut RPC promosyonu, mig.008). **O2** yeni `POST /api/orders/[id]/reallocate` + `serviceReallocateOrder` (siparişin açık shortage ürünlerini FIFO çözer) + UI "Yeniden Rezerve Et" butonu; "Sevket" artık yalnız `allocated`'da aktif (aksi tooltip'li disabled). **O1** orders GET'lerine `view_sales_orders` guard'ı (gate dosya-seviye kör nokta nedeniyle açıktı; PII redaction bilinçli eklenmedi — tüm order-viewing rolleri müşteri iletişimine meşru ihtiyaç duyar + demo verisi sentetik). **D1** `partially_shipped` TS seviyesinde tamamen kaldırıldı (tip/UI/view-model/seed→`shipped`/test; uygulanmış SQL dokunulmadı). **N1** OrderForm 3× `localISODate`. **N2** parasut-status `dbGetProductParasutIds` batch (N+1 giderildi). +10 yeni test (`orders-review-fixes.test.ts`) + 2 mevcut test güncellendi. tsc 0 · lint 0 · **5488 test** · build 0.
>
> **Açık follow-up (bu turda YAPILMADI):** gate `route-guard-matrix.test.ts:62` dosya-seviye `src.includes` guard tespiti → method-seviyeye yükseltme (100+ route reclass; ayrı tur).

**Bloklayan (K) bulgu yok.** Çift-eksen durum makinesi, mig.082/088/093 sonrası rezervasyon ve finansal-toplam-sunucu-otoritesi **sağlam**; redaction simetrik; ship/cancel/approve RPC'leri `FOR UPDATE` + status-guard ile atomik. Mekanik araçlar orders kapsamında **yeni gerçek bulgu üretmedi**.

### Sağlam doğrulanan temel (regresyon yok)
- K2 finansal toplamlar mig.093 ile **sunucu-otoriter** (istemci değerleri yoksayılır).
- mig.082 rezervasyon (`reserved = pending_approval + approved`) + mig.088 teklif-bağlı pending → çift-sayma yok.
- Y6 UTC: sunucu tarafı `order-service` `localISODate` kullanıyor (doğru).
- redaction finansal simetrisi (snake/camel), DEFINER-hijyen (mig.095).

### Mekanik araç sonucu (orders kapsamı)
- **semgrep** (`.semgrep/erp-rules.yml`): 4 hit, tümü `roven-utc-date-slice` → `ship/route.ts:45` (noon-anchored, güvenli) + `OrderForm.tsx:106/260/802` (client display) → **yeni bulgu yok**, önceki audit triyajıyla uyumlu.
- **gitleaks** (`--no-git`, orders dosyaları): **0 sızıntı.**

---

## YÜKSEK

### Y1 — `partially_allocated` sevk çıkmazı + yanıltıcı "Sevket" butonu
- **Kanıt:**
  - `supabase/migrations/011_fix_ship_order_uuid.sql:25` — `ship_order_full`: `if v_order.fulfillment_status <> 'allocated' then return ... 'Eksik stok tamamlanmadan sevk edilemez.'` → `partially_allocated` sevk EDİLEMEZ.
  - `partially_allocated → allocated` yükseltmesini yalnız `try_resolve_shortages` yapar; çağrı noktaları **sadece** üretim (`production-service.ts` → `dbTryResolveShortages`) ve manuel stok hareketi (`src/app/api/inventory/movements/route.ts:59`). **PO mal kabulü shortage çözmez** — `receive_po_lines` (mig.051) `try_resolve_shortages` çağırmaz; `purchase-order-service.ts:161` yalnız best-effort alert-scan tetikler.
  - UI `src/app/dashboard/orders/[id]/page.tsx:482-491` — `commercialStatus === "approved" && fulfillmentStatus !== "shipped"` koşuluyla "Sevket" butonu **her zaman aktif** (yalnız demo/loading disable). `partially_allocated`'de tık → `ship_order_full` reddi → hata toast'ı, ileri yol yok.
- **Etki:** Onaylı ama kısmi-rezerveli sipariş, eksik stok **bir PO ile tedarik edilse bile** otomatik `allocated`'a yükselmez → normal satın-alma tedarik yolunda sipariş **kalıcı sıkışır** (özellikle commercial/üretilmeyen ürünlerde tek tedarik yolu PO). Kullanıcıya yanıltıcı aktif buton + çıkışsız hata sunulur.
- **Düzeltme:** İki seçenek — (a) `receive_po_lines` (veya `purchase-order-service` mal kabul yolu) ilgili ürünler için `try_resolve_shortages` çağırsın (PO geldiğinde otomatik yeniden tahsisat; domain-rules §5.7 "allocation tekrar çalışır" ile hizalı); ve/veya (b) UI'da `partially_allocated` iken "Sevket" yerine "Yeniden Rezerve Et" aksiyonu göster, ham sevk butonunu yalnız `allocated`'a koşulla. (a) kök çözüm, (b) UX güvenliği.
- **Efor:** Orta (RPC/servis tetik + UI koşulu + test).

---

## ORTA

### O1 — `/api/orders` ve `/api/orders/[id]` GET'leri permission-guard'sız + müşteri PII redakte edilmiyor
- **Kanıt:** `src/app/api/orders/route.ts` + `src/app/api/orders/[id]/route.ts` GET method'ları route-içi `requirePermission` çağırmıyor; yalnız middleware session'ına güvenir. Gate bunu **yakalamaz**: `src/__tests__/gate/route-guard-matrix.test.ts:62` guard tespiti **dosya seviyesinde** (`src.includes`) — aynı dosyadaki POST/PATCH guard'ları tüm dosyayı "guarded" işaretler (kör nokta). `redactOrdersForPerms` (`src/lib/auth/redact.ts`) yalnız finansalları null'lar; `customer_tax_number`/`customer_email`/`notes` maskelenmez.
- **Etki:** Bugün her tanımlı rolde `view_sales_orders` var → fiilen istismar edilemez. Ancak demo-anon→viewer fallback müşteri VKN/e-postasını görür; `view_sales_orders`'suz bir rol eklenirse PII sızar (savunma-derinliği boşluğu + gate'in dosya-seviye körlüğü kalıcı risk).
- **Düzeltme:** GET'lere açık `requirePermissionFor(ctx, "view_sales_orders")` ekle; gate guard-matrix'ini method-seviye tespite yükselt (en az GET için ayrı kontrol). PII redaction'ı viewer için değerlendir.
- **Efor:** Küçük (route guard) + Orta (gate method-seviye iyileştirme).

### O2 — Yeniden tahsisat (re-allocate) kullanıcı aksiyonu yok
- **Kanıt:** Y1'in kök nedeni — shortage sonradan karşılandığında kullanıcıya manuel "yeniden rezerve et" düğmesi/endpoint'i sunulmuyor; yeniden tahsisat yalnız üretim tamamlama veya `/api/inventory/movements` (alakasız yüzey) üzerinden dolaylı tetiklenir. Domain-rules §5.7 (allocation tekrar çalışır) UI'da karşılanmıyor.
- **Etki:** Operatör, kısmi-rezerveli siparişi ileri taşımak için sezgisel bir yol bulamaz; iş akışı tıkanır (Y1 ile birleşince sipariş ölü kalır).
- **Düzeltme:** Sipariş detayında `partially_allocated`/`unallocated` + approved iken "Yeniden Rezerve Et" aksiyonu (allocate RPC'yi yeniden çağıran ince endpoint). Y1(a) ile birlikte tasarlanmalı.
- **Efor:** Orta.

---

## DÜŞÜK

### D1 — `partially_shipped` ölü durum
- **Kanıt:** Kısmi sevk RPC'si yok (`ship_order_full` yalnız tam sevk; `partially_shipped` hiçbir yerde set edilmez). Yine de liste filtre kovaları (`src/app/dashboard/orders/page.tsx:68-69`) ve `isOrderCancellable` (`page.tsx:76`) + `fulfillmentStatusConfig` (`[id]/page.tsx:64`) bu durumu varsayar.
- **Etki:** Ölü kod / yanıltıcı sözleşme; ileride kısmi-sevk eklenirse tutarsızlık riski. Davranışsal hata yok.
- **Düzeltme:** Ya `partially_shipped`'i sözleşmeden çıkar (yorum + kovalardan kaldır), ya da kısmi-sevk gerçekten planlanıyorsa TODO ile işaretle.
- **Efor:** Küçük.

---

## Nitler (2)
- **N1** — `OrderForm.tsx:106,260,802` client tarih `new Date().toISOString().slice(0,10)` (UI varsayılan/gösterim; sunucu `order-service` `localISODate` kullanıyor → güvenli). Tutarlılık için `localISODate` önerilir (N1-orders/[id] turunda yapılanla aynı desen).
- **N2** — `src/app/api/parasut-status/route.ts:45-52` satır başına `dbGetProductById` (N+1); küçük siparişlerde önemsiz, performans nit'i (batch fetch ile giderilebilir).

---

## Tekrar EDİLMEYEN (gate / önceki audit)
- K2 finansal toplamlar (mig.093 sunucu-otoriter, regresyon yok); Y6 UTC sunucu tarafı (`localISODate` doğru); 082/088 rezervasyon invariantları (atomik); redaction finansal simetrisi; DEFINER-hijyen (mig.095); önceki raporların (2026-06 + 2026-06-17 RFQ) bulguları.

## İlgili dosyalar
- `supabase/migrations/011_fix_ship_order_uuid.sql` (Y1 ship guard) · `supabase/migrations/051_po_receive_rpc.sql` (Y1 — shortage çözmez) · `src/lib/services/purchase-order-service.ts:161` (Y1 PO kabul, shortage tetiklemiyor) · `src/lib/services/production-service.ts` + `src/app/api/inventory/movements/route.ts:59` (try_resolve_shortages tek tetikler) · `src/app/dashboard/orders/[id]/page.tsx:482` (Y1 yanıltıcı Sevket) · `src/app/api/orders/route.ts` + `src/app/api/orders/[id]/route.ts` (O1 GET guard yok) · `src/lib/auth/redact.ts` (O1 PII) · `src/__tests__/gate/route-guard-matrix.test.ts:62` (O1 gate dosya-seviye kör nokta)

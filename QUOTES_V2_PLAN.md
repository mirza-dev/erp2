# Master Plan: Teklif Modülü Kapsamlı Revize (V7) — DÜZELTİLMİŞ 6. TUR

> **Durum:** Bu plan kullanıcı review 6. tur (2026-05-29) ile güncellendi — ilk okuma 7 düzeltme (3 P1 + 3 P2 + 1 bonus) + 2. okuma 5 düzeltme (V7-A8 order line master product, V7-A9 SalesOrderRow TS+mapper, V7-A5 RPC defansif RAISE, V7-A4 tek-davranış Paraşüt guard, test tablosu 422→502) + 3. okuma 5 düzeltme (V7-A8 güçlendirme [JOIN sessiz drop → NULL pre-check + ROW_COUNT verify], V7-A4 güçlendirme [Paraşüt guard claim-öncesi early return + zorunlu sync_issue alert], V7-A10 item_count, V7-A11 quantity integer) = **17 V7 düzeltmesi**. Güvenlik kararı korunur, satır vat_rate snapshot eklenir. **2 P2 kararı kullanıcı tarafından kesinleşti (2026-05-29):** (A5) PDF arşivi yoksa accept route'ta **recover/generate** (422 değil); (A4) header discount snapshot taşınır ama discount_amount>0'da Paraşüt **sessiz yanlış fatura göndermez** (claim-öncesi early return + zorunlu alert). **IMPLEMENT EDİLMEYECEK** — sadece referans.

## Context

V6 planı 5. tur düzeltmelerini içeriyordu (4 schema uyum); 6. tur review V6'nın RPC SQL örneklerinde güvenlik ve veri tutarlılığı problemleri yakaladı. Migration 036'da bilinçli kaldırılan `SECURITY DEFINER`'ın V6'da geri eklenmesi + satır seviyesi vat_rate snapshot eksikliği + accept öncesi PDF arşiv kontrolü + tablo adı hatası. Tüm bulgular kod referansıyla doğrulandı.

## V7 Toplam Düzeltme Sayacı

- V2 (1. tur): 5
- V3 (2. tur): 12
- V4 (3. tur): 13
- V5 (4. tur): 5
- V6 (5. tur): 4
- **V7 (6. tur): 17** (ilk okuma 7: 3 P1 + 3 P2 + 1 bonus; 2. okuma +5: V7-A8 master product, V7-A9 TS+mapper, V7-A5 RPC RAISE, V7-A4 tek-davranış, test 422→502; 3. okuma +5: V7-A8 güçlendirme [JOIN drop → NULL pre-check + ROW_COUNT, P1], V7-A4 güçlendirme [guard claim-öncesi early return, P1 + zorunlu sync_issue alert, P2], V7-A10 item_count [P2], V7-A11 quantity integer [P2])
- **Toplam: 56 düzeltme entegre**

## Schema Doğrulamaları (6. tur — yeni)

| Konu | Gerçek Durum | V6'da Yanlış |
|------|--------------|--------------|
| Quote RPC SECURITY | Migration 036 bilinçli kaldırdı — "Quote RPC'lerden security definer kaldır" | ❌ V6 örneğinde `SECURITY DEFINER` geri eklenmiş — güvenlik kararı bozulur |
| quote_date NULLIF | `NULLIF(p_header->>'quote_date', '')::date` (065:71, 132 hem create hem update) | ❌ V6 örneği direkt cast — boş string patlama |
| order_lines.vat_rate | `vat_rate numeric(5,2) NOT NULL DEFAULT 20` (039:56-57) — Paraşüt için satır bazlı | ❌ V6 sadece sales_orders.vat_rate header eklemiş; satır vat_rate quote'tan taşınmıyor |
| Paraşüt satır discount | `discount_value: line.discount_pct` (parasut-service:688) | ❌ V6 header discount taşıyor, Paraşüt etkileşimi belirsiz |
| Mevcut order line tablosu adı | `order_lines` (001:110) | ❌ V6 örneği `sales_order_lines` yazmış — tablo yok |
| PDF arşiv accept guard | YOK | ❌ V6 accept RPC `quote_pdf_archive_id` lookup null'a izinli |

## Review V7 — Düzeltmeler (6. tur: ilk okuma 7 + 2. okuma 5 + 3. okuma 5 = 17)

### V7-A1 (P1) — SECURITY DEFINER korunmaz, kaldırılır

**Mevcut güvenlik kararı:** Migration 036 (`036_fix_quote_rpc_security.sql:1-3`) açıkça quote RPC'lerden SECURITY DEFINER kaldırdı. Sebep: SECURITY DEFINER + dinamik SQL + search_path manipülasyonu privilege escalation riski yaratır (CVE pattern).

**V6 örneği (YANLIŞ):**
```sql
CREATE OR REPLACE FUNCTION create_quote_with_lines(...)
RETURNS uuid AS $$
...
$$ LANGUAGE plpgsql SECURITY DEFINER;  -- ❌ 036 kararını bozar
```

**V7 doğru:**
```sql
CREATE OR REPLACE FUNCTION create_quote_with_lines(...)
RETURNS uuid AS $$
...
$$ LANGUAGE plpgsql;  -- SECURITY INVOKER (default), 036 kararıyla uyumlu
```

**Diğer RPC'ler (`update_quote_with_lines`, `accept_quote_and_create_order`, `create_quote_revision`):** Aynı şekilde `SECURITY INVOKER` default kullanılır. Service role ile çağrıldıkları için RLS bypass zaten garantili; SECURITY DEFINER gereksiz risk.

**İstisna:** `next_quote_number()` ve `generate_order_number()` mevcut migration'larda SECURITY DEFINER kullanıyor olabilir (sequence INCREMENT için); bunlar mevcut hâlleriyle KORUNUR (V7 değişiklik yapmaz). Sadece quote DML RPC'leri için SECURITY INVOKER zorunlu.

**Test:** Migration 069 (V5-A2) + Migration 075 (V5-A4) RPC'leri için source-regex — `SECURITY DEFINER` literal yok; `SECURITY INVOKER` veya default kullanır.

### V7-A2 (P1) — quote_date NULLIF guard korunur

**Mevcut RPC paterni (065:71):**
```sql
NULLIF(p_header->>'quote_date', '')::date,
```

Boş string `''` → `NULLIF` → `NULL` → `::date` cast NULL döner (PG güvenli).

**V6 örneği (YANLIŞ):**
```sql
(p_header->>'quote_date')::date,  -- ❌ '' → cast hatası "invalid input syntax for type date"
```

**V7 doğru — Migration 069 RPC örneklerinin TÜM date/numeric/uuid cast'lerinde:**
```sql
NULLIF(p_header->>'quote_date', '')::date,
NULLIF(p_header->>'valid_until','')::date,
NULLIF(p_header->>'customer_id','')::uuid,
NULLIF(p_header->>'unit_weight_kg','')::numeric,
-- vb.
```

Bu pattern zaten 065 ve 035 RPC'lerinde tutarlı kullanılıyor; V7 sadece V6 örneğindeki kaymayı düzeltir.

**Test:** RPC argümanı `quote_date: ''` (boş string) — `payload PATCH /api/quotes/[id]` 200, quote.quote_date NULL.

### V7-A3 (P1) — order_lines.vat_rate satır snapshot taşınır

**Mevcut:** `order_lines.vat_rate numeric(5,2) NOT NULL DEFAULT 20` (039:56-57) — Paraşüt satır bazlı VAT zorunlu. parasut-service:686 `vat_rate: line.vat_rate ?? 20` — satır vat_rate okuyor.

**V6 problem:** Accept RPC sadece header'a `sales_orders.vat_rate` snapshot ekliyor (V6-A3); ama mevcut `order_lines` satır vat_rate taşımıyor. Quote vat_rate 18 veya 10 olsa bile yeni order line'lar 20 default ile yazılır → Paraşüt fatura yanlış VAT.

**V7 — Migration 075 + accept RPC güncellemesi:**

Migration 075:
- `sales_orders.vat_rate` header snapshot eklenir (V6-A3 korunur)
- **`order_lines` schema değişimi GEREK YOK** (vat_rate zaten 039'da var, DEFAULT 20)

Accept RPC `accept_quote_and_create_order` order line insert (V7-A3 vat_rate + V7-A8 master product + V7-A7 tablo adı):
```sql
-- V7-A7: tablo adı order_lines (sales_order_lines DEĞİL)
INSERT INTO order_lines (
  order_id, product_id, product_name, product_sku, unit,
  quantity, unit_price, discount_pct, line_total,
  vat_rate                              -- V7-A3 satır snapshot
)
SELECT v_order_id,
  qli.product_id,
  p.name,                                -- V7-A8: master product (qli.description DEĞİL)
  p.sku,                                 -- V7-A8: master product (qli.product_code DEĞİL)
  p.unit,                                -- V7-A8: master product
  qli.quantity, qli.unit_price,
  0,                                     -- V3-A4: satır discount kaldırıldı (header'da)
  qli.line_total,
  v_quote.vat_rate                       -- V7-A3: quote header vat_rate → her satıra
FROM quote_line_items qli
JOIN products p ON p.id = qli.product_id  -- V7-A8: order line kimliği master'dan
WHERE qli.quote_id = p_quote_id
ORDER BY qli.position;
```

**Karar:** Tek vat_rate header'dan her satıra kopyalanır. Çoklu VAT senaryosu yok (kullanıcı kararı #1: tek para birimi + #13: KDV ayarlardan tek default + teklif özelinde).

**Test:** Accept → order_lines.vat_rate her satırda quote.vat_rate'e eşit; Paraşüt sync `vat_rate: line.vat_rate` doğru taşır.

### V7-A8 (P1/P2, 6. tur 2. okuma) — Order line adı/SKU master product'tan (quote satırından DEĞİL)

**Sorun:** V7-A3'ün ilk snippet'i `qli.description → product_name`, `qli.product_code → product_sku` yazıyordu. `order_lines.product_name`/`product_sku` satış siparişi + Paraşüt fatura **kimliği** olarak kullanılıyor; `qli.description` ise kullanıcı tarafından override edilebilir + uzun teklif açıklaması (örn. "GATE VALVE A105 GÖVDE, CLASS 600 SW, SS TRİM") olabilir → fatura/sipariş kimliği bozulur.

**Mevcut doğru davranış:** `serviceConvertQuoteToOrder` (`quote-service.ts:143-150`) her satır için `dbGetProductById` → `{ name, sku, unit }` master product'tan çekiyor. Atomik RPC bu semantiği KORUMALI.

**Düzeltme:** Yukarıdaki V7-A3 snippet'i `JOIN products p ON p.id = qli.product_id` ile güncellendi → `p.name`/`p.sku`/`p.unit` yazılır.

**⚠️ KRİTİK — JOIN tek başına bloklamaz, sessizce DÜŞÜRÜR (3. okuma düzeltmesi):** `quote_line_items.product_id` **ON DELETE SET NULL** (034:107) — teklif send'de geçerliyken ürün accept'ten ÖNCE silinirse product_id NULL olur. INNER JOIN o satırı **sessizce insert dışında bırakır** (exception atmaz). Sonuç: order quote'tan eksik satırlı + header subtotal/grand_total snapshot'ı ≠ satır toplamı. **V4-A4 send-time check post-send silmeyi KAPSAMAZ.** Bu yüzden accept RPC iki katmanlı guard içerir:

```sql
-- (a) Insert ÖNCESİ — NULL product_id hard check (silinmiş ürün):
IF EXISTS (SELECT 1 FROM quote_line_items
           WHERE quote_id = p_quote_id AND product_id IS NULL) THEN
  RAISE EXCEPTION 'Quote line(s) have null product_id (product deleted after send)'
    USING ERRCODE = '23502';
END IF;

-- ... order_lines INSERT ... SELECT ... JOIN products ...

-- (b) Insert SONRASI — satır sayısı doğrulaması (039 GET DIAGNOSTICS precedent):
GET DIAGNOSTICS v_inserted = ROW_COUNT;
SELECT count(*) INTO v_expected FROM quote_line_items WHERE quote_id = p_quote_id;
IF v_inserted <> v_expected THEN
  RAISE EXCEPTION 'Order line count mismatch: % inserted, % expected (silent JOIN drop)',
    v_inserted, v_expected;  -- tüm transaction ROLLBACK
END IF;
```
(b) belt-and-suspenders: gelecekte JOIN'e `is_active` filtresi eklenirse veya başka drop sebebi çıkarsa yakalar; ayrıca header finansal snapshot ↔ satır toplamı tutarlılığını garanti eder. `v_inserted` V7-A10 item_count için de tek source olur.

**Quote açıklaması:** `order_lines`'ta ayrı açıklama alanı yok → bu fazda quote description order line'a taşınMAZ (master product adı authoritative; mevcut convert davranışıyla birebir). İstenirse ileride `order_line_description` alanı **ayrı faz** (scope dışı).

**Test:** Accept → order_lines.product_name/product_sku master product'a eşit (qli.description/product_code değil); bir satırda product_id NULL (silinmiş ürün) → 23502 RAISE + ROLLBACK; ROW_COUNT mismatch → RAISE + ROLLBACK.

### V7-A4 (P2) — Header discount Paraşüt scope kararı

**Mevcut Paraşüt davranışı:** `parasut-service:688` her order line için `discount_value: line.discount_pct` gönderir (satır bazlı discount %).

**V6 davranışı:** Quote'tan `discount_amount` header → sales_orders.discount_amount snapshot (V4-A8). Ama order_lines.discount_pct = 0 (V3-A4 header discount; satır discount kaldırıldı).

**Sorun:** Paraşüt fatura header discount görmez; satır discount = 0 görür → fatura toplamı quote'tan farklı.

**KULLANICI KARARI (2026-05-29, 6. tur kesinleşti): SNAPSHOT TAŞINIR + PARAŞÜT SESSİZ YANLIŞ TOPLAM GÖNDERMEZ.**

Tam Paraşüt iskonto implementasyonu (orantılı dağıtım vs ayrı iskonto satırı) bu faza şişirilmez (yuvarlama, KDV, çok satır, 0 fiyat, miktar hassasiyeti detayları çıkar). Ama saf "ertele" de KABUL DEĞİL — sessiz finansal hata yaratır (ERP toplamı ≠ Paraşüt faturası).

**Bu fazda yapılacak:**
1. `quotes.discount_amount → sales_orders.discount_amount` snapshot **mutlaka taşınır** (V4-A8 korunur; ERP içi veri doğru).
2. Paraşüt sync **guard (tek net davranış — 3. okuma düzeltmesi):** Guard `serviceSyncOrderToParasut` başında, order yüklendikten sonra ama `parasut_claim_sync` (parasut-service:1016) ÇAĞRILMADAN önce: `if (order.discount_amount > 0) return { success: false, error: "...", skipped: true }` — **throw DEĞİL, early return**.
   - **Neden throw değil:** Guard try bloğu içinde throw ederse `parasut-service:1092` catch → `classifyAndPatch` parasut_step/error_kind/error UPDATE + `dbCreateSyncLog` yazar → "marker yazılmaz" sözü bozulur + satır retry kuyruğuna girer. Early return claim'i ve catch path'ini tamamen atlar (lease churn yok, marker yok).
   - **invoice create çağrılMAZ**, `parasut_step`/retry/error_kind marker **yazılMAZ**.
3. **Görünürlük — ZORUNLU (3. okuma, P2):** Early return'den önce **zorunlu** `sync_issue` alert oluşturulur (entity = order, mesaj "Paraşüt iskonto aktarımı ayrı faz — fatura oluşturulmadı"; domain type+entity_id dedup korunur) → Alerts sayfasında görünür. **Opsiyonel değil** — ship route fire-and-forget (`route.ts:62`) olduğu için kullanıcı "sevk edildi" görür; sessiz false/log finansal block'u gizler. Önerilen ek: `sales_orders.parasut_error` görünür alanına aynı mesaj (order detayında görünür) — ama parasut_step/retry yazmadan.
4. order_lines.discount_pct = 0 kalır (V3-A4 header discount).

**Gelecek ayrı faz (scope dışı):** Paraşüt'e aktarım yöntemi seçilir — Seçenek A: orantılı satır iskontosu (`line.discount_pct = headerDiscount / subtotal * 100`); Seçenek B: negatif "İskonto" line item; Seçenek C: Paraşüt header discount API (varsa).

**V7 plan dokümantasyonu:** Migration 075 yorum bloğu + parasut-service guard:
```sql
-- Header discount (quotes.discount_amount → sales_orders.discount_amount):
-- Bu fazda Paraşüt fatura'ya AKTARILMAZ. discount_amount > 0 ise serviceSyncOrderToParasut
-- parasut_claim_sync ÖNCESİ early return (throw değil) + ZORUNLU sync_issue alert.
-- Sessizce yanlış toplamlı fatura oluşturmak YASAK (ERP ≠ muhasebe riski).
```

**Test:** discount_amount=0 → Paraşüt sync normal; discount_amount>0 → `parasut_claim_sync` **çağrılmaz** + parasut_step/error_kind/retry **UPDATE edilmez** + sync_log error yazılmaz + early return + **sync_issue alert OLUŞUR (zorunlu)**; sales_orders.discount_amount snapshot doğru taşınmış.

### V7-A5 (P2) — Accept öncesi PDF arşiv kontrolü zorunlu

**Mevcut V6 davranışı:** Accept RPC `quote_pdf_archive_id` lookup:
```sql
(SELECT id FROM quote_pdf_archives
   WHERE quote_id = p_quote_id ORDER BY revision_no DESC LIMIT 1)
```

Null dönerse `quote_pdf_archive_id = NULL` ile order yaratılır → kabul edilen sipariş PDF arşivsiz.

**Kullanıcı isteği:** "Resmi PDF arşivlenmiş sent teklif kilitli arşiv olmalı" (V4 review).

**KULLANICI KARARI (2026-05-29, 6. tur kesinleşti): RECOVER/GENERATE** — 422 hard-fail DEĞİL. Accept anında PDF arşivi eksikse otomatik üretilir, sonra sipariş oluşur. Kullanıcı akışı kesilmez.

**Mimari sonuç (önemli):** PDF üretimi server-side (Puppeteer/Docker chromium) → atomik SQL RPC İÇİNDE yapılamaz. Recover/generate **route/service katmanında**, `accept_quote_and_create_order` RPC çağrısından ÖNCE yapılır:

```
/api/quotes/[id]/accept route (V5-A4 atomik RPC'den önce):
  1. quote_pdf_archives son revizyon lookup
  2. NULL ise → serviceGenerateAndArchiveQuotePdf(quoteId)
     (Puppeteer render + quote_pdf_archives INSERT, V3-A5 immutable upsert=false)
  3. Üretim başarısız → 502 (accept çağrılmaz; geçici hata, kullanıcı tekrar dener)
  4. Arşiv hazır (mevcut veya yeni üretildi) → accept_quote_and_create_order RPC
     RPC içinde v_pdf_archive_id artık her zaman dolu (LIMIT 1 güvenli)
```

**RPC tarafı (son savunma — belt-and-suspenders):** Route normal akışta arşivi garanti eder; ama başka caller/bypass (manuel SQL, gelecekteki endpoint) route recover'ı atlayabilir. Bu yüzden atomik RPC **defansif hard-guard** içerir:
```sql
-- accept_quote_and_create_order, v_pdf_archive_id lookup'tan sonra:
IF v_pdf_archive_id IS NULL THEN
  RAISE EXCEPTION 'Quote has no PDF archive (recover route bypassed)'
    USING ERRCODE = '23514', DETAIL = 'quote_id:' || p_quote_id::text;
END IF;  -- tüm transaction ROLLBACK → PDF-arşivsiz accepted order İMKANSIZ
```
Net davranış: **Normal kullanıcı 422 görmez** (route PDF'i üretir → arşiv hazır). Yalnızca route recover'ı baypas eden yol RPC'de 23514 alır (route handler bunu da 422'ye map edebilir ama normal akışta tetiklenmez).

**Test:** (a) Accept öncesi quote_pdf_archives boş → route PDF üretir + arşivler → accept başarılı + order.quote_pdf_archive_id dolu; (b) PDF üretimi throw → 502, accept çağrılmaz; (c) RPC'ye doğrudan (route baypas) NULL arşivle gidilirse → 23514 RAISE + ROLLBACK (defansif guard testi).

### V7-A6 (P2) — Faz 1 başlangıcında ayrı tam plan zorunlu

**V6 yapısı:** Plan dosyası 344 satır; "IMPLEMENT EDİLMEYECEK — sadece referans" (V6:3). Sadece review düzeltmelerini içeriyor; V2-V5 düzeltmelerinin tam içeriği önceki memory turlarında.

**Sorun:** Faz 1'e başlanırsa V2-V6 boyunca biriken 46 düzeltmenin hepsi tek dosyada görünmüyor. Implementation sırasında V3-A4 productId paterni veya V4-A1 audit source detayı hatırlanmayabilir.

**V7 — Faz başlama prosedürü netleşir:**

Faz başlangıçlarında (yeni Plan modu oturumu) takip edilecek 3 adım:

1. **Önceki memory'lerden toplama:** `memory/project_quotes.md` V2-V7 tüm düzeltme listesini oku → ilgili faza ait olanları çıkar
2. **Faz-spesifik tam plan yaz:** `~/.claude/plans/faz-1-tam-plan.md` (örnek isim) — tüm migration SQL'leri, RPC bodylari, kod değişiklikleri, test listesi tek dosyada
3. **Master plan referans linki:** Faz planı `QUOTES_V2_PLAN.md` V2-V7 düzeltme ID'lerine (V3-A4, V4-A1 vb.) referans verir

**Bu yaklaşımın faydası:**
- Master plan delta olarak kalır (güncellemesi kolay)
- Faz planı self-contained olur (implementation sırasında geri dönüp aramaya gerek yok)
- Review/test kapsamı her faz için net listelenir

### V7-A7 (Bonus) — order_lines tablo adı doğru

**Mevcut tablo:** `order_lines` (001:110); `sales_order_lines` YOK.

**V6 yanlış:**
```sql
INSERT INTO sales_order_lines (...)  -- ❌ tablo yok, RPC patlar
```

**V7 doğru:**
```sql
INSERT INTO order_lines (...)  -- ✓ 001:110 + 039 vat_rate eklemesiyle uyumlu
```

**Tüm RPC + service kodlarında:** `sales_order_lines` → `order_lines` (V7-A3 örneğinde zaten düzeltildi).

### V7-A9 (P2, 6. tur 2. okuma) — SalesOrderRow TS + mapper Faz 6 kilidi

**Mevcut:** `database.types.ts:278-314` `SalesOrderRow` interface'inde Migration 075'in ekleyeceği alanlar YOK: `discount_amount`, `vat_rate`, `source_quote_revision_no`, `quote_pdf_archive_id`.

**Sorun:** Migration DB kolonlarını ekler ama TS tipi + mapper güncellenmezse: (a) V7-A4 Paraşüt guard'ı `order.discount_amount` okuyamaz (derlenmez), (b) V7-A5 `quote_pdf_archive_id` order detayında erişilemez.

**V7-A9 — Faz 6 görev listesine açıkça eklenir:**
- `src/lib/database.types.ts` → `SalesOrderRow`'a 4 alan (`discount_amount: number`, `vat_rate: number`, `source_quote_revision_no: number | null`, `quote_pdf_archive_id: string | null`).
- `src/lib/api-mappers.ts` → `mapOrderDetail` (gerekirse `mapOrder`) yeni alanları map eder.
- `src/lib/mock-data.ts` → frontend `OrderDetail` interface'i (UI'da gösterilecekse).

**Test:** mapper round-trip (DB row → OrderDetail 4 alan) + source-regex (SalesOrderRow 4 alan mevcut). Faz 6'ya +2-3 test.

### V7-A10 (P2, 6. tur 3. okuma) — Accept RPC item_count set eder

**Mevcut:** `sales_orders.item_count integer not null default 0` (001:93); `create_order` RPC (023) sales_orders INSERT'inde `item_count`'u satır sayısından set ediyor. V7 accept RPC özetinde item_count YOK → kabul edilen siparişin liste/detayında `item_count=0` görünür.

**V7-A10:** `accept_quote_and_create_order` RPC item_count'u **gerçek eklenen satır sayısından** set eder. V7-A8 `v_inserted` (ROW_COUNT) ile bağlanır → tek source:
```sql
-- order_lines insert + V7-A8 ROW_COUNT doğrulamasından sonra:
UPDATE sales_orders SET item_count = v_inserted WHERE id = v_order_id;
-- (veya INSERT anında item_count = (SELECT count(*) FROM quote_line_items WHERE quote_id = p_quote_id))
```

**Test:** accept → order.item_count = quote satır sayısı (0 DEĞİL).

### V7-A11 (P2, 6. tur 3. okuma) — Quantity pozitif integer (Faz 2 validator + accept RPC defansif)

**Mevcut çelişki:** `order_lines.quantity integer not null check (quantity > 0)` (001:10) ⟂ `quote_line_items.quantity numeric(12,4)` (034:111). QuoteForm qty input `type="number" step="any"` (QuoteForm.tsx:972) küsürat + 0 girişine izin veriyor. Küsüratlı qty accept'te order_lines.quantity'ye insert edilirken PG **sessizce yuvarlar** (2.5 → 2/3). Kullanıcı kararı: adet tam sayı.

**V7-A11 — iki katman:**
- **Faz 2 validator (birincil):** quote line `quantity` pozitif tam sayı şartı — `Number.isInteger(qty) && qty > 0`; değilse 422. (Opsiyonel UI: QuoteForm qty input `step="1"` + `min="1"`.)
- **Accept RPC (son savunma):** order_lines insert ÖNCESİ:
  ```sql
  IF EXISTS (SELECT 1 FROM quote_line_items
             WHERE quote_id = p_quote_id AND quantity <> trunc(quantity)) THEN
    RAISE EXCEPTION 'Quote line quantity must be integer';
  END IF;
  ```
  Sessiz cast/yuvarlamaya bırakılmaz.

**Test:** küsüratlı qty (2.5) → Faz 2 422 + accept RPC RAISE; tam sayı (3) → geçer.

## Önceki Düzeltmeler Korundu

**V6 (4):** quote_line_items kolon adları + generate_order_number + sales_orders.vat_rate + RPC extend (rewrite değil).
**V5 (5):** Migration sırası + RPC payload extension + Faz 2 validation order + accept atomik RPC + yearly counter backfill.
**V4 (13), V3 (12), V2 (5):** Tam liste önceki memory turlarında.

## Migration Sırası (V7 final)

V6 ile aynı (12 migration, 066-077); sadece içerik düzeltmeleri:

```
Faz 1 — DB foundation:
  066 → products.hs_code, size_text
  067 → quotes.customer_address, seller_* (7 alan)
  068 → quote_line_items.unit_weight_kg, kg_manual_override
  069 → RPC payload extension (V6-A4: mevcut RPC korunur + yeni alanlar;
        V7-A1: SECURITY DEFINER YOK; V7-A2: NULLIF guard'lar korunur)

Faz 3:
  070 → quotes.discount_amount, company_settings.default_vat_rate
  071 → RPC header discount + draft guard (V7-A1: SECURITY INVOKER)

Faz 5:
  072 → status CHECK + revision + sig backfill + prefix + quote_yearly_counters
        + RPC'ler V7-A1: SECURITY INVOKER

Faz 4:
  073 → quote_pdf_archives + RLS
  074 → storage quote-pdfs bucket

Faz 6:
  075 → sales_orders meta (+ V6-A3 vat_rate header snapshot)
        + accept_quote_and_create_order RPC:
          - V5-A4 atomik transaction
          - V6-A2 generate_order_number()
          - V7-A1 SECURITY INVOKER (DEFINER DEĞİL)
          - V7-A3 satır vat_rate quote'tan taşı
          - V7-A7 order_lines (sales_order_lines DEĞİL)
          - V7-A8 order line product_name/sku/unit master products JOIN'den (qli.description DEĞİL)
          - V7-A8 (3. okuma) JOIN sessiz drop koruması: insert öncesi product_id IS NULL → 23502 RAISE;
            insert sonrası GET DIAGNOSTICS ROW_COUNT = quote line count değilse RAISE + ROLLBACK
          - V7-A11 (3. okuma) qty integer defansif: quantity <> trunc(quantity) → RAISE
          - V7-A10 (3. okuma) item_count = v_inserted (ROW_COUNT) set
          - V7-A5 RPC defansif RAISE (quote_pdf_archive_id NULL → 23514 ROLLBACK, bypass koruması)
        + V7-A5 (karar) accept route'ta recover/generate PDF arşivi (RPC öncesi; fail→502)
        + V7-A4 (karar+3.okuma) Paraşüt guard: discount_amount>0 → parasut_claim_sync ÖNCESİ early return
          (throw değil; marker yazılmaz) + ZORUNLU sync_issue alert
        + V7-A9 SalesOrderRow TS + api-mappers (discount_amount/vat_rate/source_quote_revision_no/quote_pdf_archive_id)

Faz 7:
  076 → note_templates + RLS
  077 → quote_line_items_sort_order (koşullu)
```

## Risk Noktaları (V7 Güncel)

| Risk | Önlem |
|------|-------|
| **SECURITY DEFINER privilege escalation** | **V7-A1: SECURITY INVOKER default; 036 kararı korunur** |
| **Boş quote_date payload PATLAR** | **V7-A2: NULLIF guard pattern korunur** |
| **Paraşüt satır VAT yanlış (quote.vat_rate ≠ 20)** | **V7-A3: satır vat_rate snapshot accept RPC'de** |
| **Paraşüt header discount sessiz yanlış toplam** | **V7-A4 (karar): snapshot taşınır + discount_amount>0'da claim-öncesi early return + ZORUNLU sync_issue alert; aktarım ayrı faz** |
| **PDF arşivsiz kabul edilen sipariş** | **V7-A5 (karar): route accept öncesi recover/generate; üretim fail → 502** |
| **Delta plan implementation belirsizliği** | **V7-A6: faz başı 3-adım prosedür** |
| **order_lines tablo adı** | **V7-A7: sales_order_lines DEĞİL** |
| **Order line adı/SKU quote açıklamasından (yanlış kimlik)** | **V7-A8: master products JOIN → p.name/p.sku/p.unit** |
| **JOIN sessiz satır drop (silinmiş ürün → eksik/tutarsız order)** | **V7-A8 (3.okuma): product_id IS NULL pre-check + ROW_COUNT verify → RAISE/ROLLBACK** |
| **PDF arşiv route bypass'ında arşivsiz order** | **V7-A5: RPC defansif RAISE (23514) + ROLLBACK** |
| **Yeni sales_order alanları TS/mapper'da yok (derleme/okuma fail)** | **V7-A9: Faz 6 SalesOrderRow + mapOrderDetail kilidi** |
| **Sipariş item_count=0 (liste/detay yanlış)** | **V7-A10 (3.okuma): accept RPC item_count = v_inserted** |
| **Küsüratlı qty sessiz yuvarlanır** | **V7-A11 (3.okuma): Faz 2 integer validator + accept RPC trunc RAISE** |
| Önceki V6/V5/V4/V3/V2 düzeltmeler | Korundu |

## Faz Etkileri (V7 Test Sayıları)

V6 ile aynı migration sayısı (12); V7 sadece içerik düzeltmesi. Test sayıları:

| Faz | Migration | Yeni test |
|-----|-----------|-----------|
| 1 | 066-069 | ~29 (V6'dan +2: V7-A1 SECURITY INVOKER source-regex, V7-A2 boş quote_date 200) |
| 2 | YOK | ~22 (V7-A11 qty pozitif integer validator +1) |
| 3 | 070-071 | ~17 |
| 5 | 072 | ~35 |
| 4 | 073-074 | ~32 |
| 6 | 075 | ~41 (V7-A3 satır vat_rate, V7-A5 PDF recover/generate+502+RPC RAISE, V7-A7 tablo adı, V7-A1 INVOKER, V7-A8 master product + JOIN-drop NULL/ROW_COUNT, V7-A9 TS+mapper, V7-A10 item_count, V7-A11 qty integer RAISE, V7-A4 early-return no-marker + zorunlu alert) |
| 7 | 076-077 | ~15 |

**Toplam test:** ~192 (V6'dan +17; 2. okuma +4, 3. okuma +5: Faz 6 +4 + Faz 2 +1)

## V7 Verification Eklemeler

Faz 1 manuel smoke V7:
- 069 RPC apply sonrası `\df+ create_quote_with_lines` → Security: INVOKER (DEFINER değil)
- Form payload `quote_date: ''` → PATCH 200, quote.quote_date NULL (NULLIF guard)
- Mevcut create_quote_with_lines testleri yeşil (V6-A4 regression)

Faz 6 manuel smoke V7:
- Accept RPC SECURITY INVOKER
- Accept öncesi quote_pdf_archives boş → route PDF üretir + arşivler → accept başarılı (V7-A5 recover/generate); PDF üretimi fail → 502
- Accept sonrası order_lines.vat_rate her satırda quote.vat_rate'e eşit (Paraşüt sync doğru)
- Accept sonrası order.item_count = quote satır sayısı (V7-A10; 0 değil)
- Silinmiş ürünlü teklif (product_id NULL) → accept 23502 RAISE; ROW_COUNT mismatch → ROLLBACK (V7-A8)
- Küsüratlı qty teklif → Faz 2 422; accept RPC trunc RAISE (V7-A11)
- discount_amount>0 sipariş → parasut_claim_sync çağrılmaz + parasut_step/retry yazılmaz + sync_issue alert oluşur (V7-A4)
- Tablo adı `order_lines` (smoke testte `\d order_lines` ve `\d sales_order_lines` yok)

## Faz 1 Başlangıç Prosedürü (V7-A6)

Faz 1'e başlanırken (yeni Plan modu oturumu):

1. **Önceki düzeltmeleri topla:**
   - `memory/project_quotes.md` V2-V7 düzeltme listesi oku
   - Faz 1 ait olanları çıkar:
     - V2: prepared/approved serbest text
     - V3-A1 (GTİP soft), V3-A4 (productId hidden), V3-A6 (non-draft guard), V3-B1 (sig backfill — Faz 5'te ama Faz 1 hazırlık), V3-B5 (unitWeightKg)
     - V4-A1 (audit source='system'), V4-A2 (customer_address), V4-A3 (seller_*), V4-A4 (productId hard), V4-A7 (kg DB persist), V4-B3 (hs/size geniş)
     - V5-A1 (migration sırası 066-069), V5-A2 (RPC payload extension), V5-A3 (validation order)
     - V6-A1 (quote_line_items kolon adları), V6-A4 (RPC extend rewrite değil)
     - V7-A1 (SECURITY INVOKER), V7-A2 (NULLIF guard)

2. **Faz 1 tam plan yaz** (`~/.claude/plans/faz-1-tam-plan.md`):
   - Migration 066, 067, 068, 069 tam SQL (bu V7 dosyasından kopyala)
   - QuoteForm.tsx değişiklik listesi (satır numarası ile)
   - api-mappers.ts mapper güncellemeleri (V6-A1 product_code→productSku)
   - TeknikTab UI tasarımı
   - Test dosyaları (~29 yeni test)
   - Verification adımları (V7 ek)

3. **Master plan referans:** Faz 1 planı `QUOTES_V2_PLAN.md` V2-V7 düzeltme ID'lerine link verir.

## Çıktı Özeti

**V7'de eklenen 17 düzeltme (ilk okuma 7 + 2. okuma 5 + 3. okuma 5):**

| # | Düzeltme | Önlenen Risk |
|---|----------|--------------|
| V7-A1 (P1) | SECURITY DEFINER yok (036 kararı korunur) | Privilege escalation |
| V7-A2 (P1) | quote_date NULLIF guard korunur | Boş string cast PATLAR |
| V7-A3 (P1) | order_lines satır vat_rate snapshot quote'tan | Paraşüt yanlış VAT fatura |
| V7-A4 (P2) | Header discount snapshot + Paraşüt guard (claim-öncesi early return + zorunlu sync_issue alert) | Sessiz finansal hata + görünmeyen block + marker kirliliği |
| V7-A5 (P2) | Accept route recover/generate (422 değil) + RPC defansif RAISE | PDF arşivsiz kabul + akış kesintisi + bypass |
| V7-A6 (P2) | Faz başı tam plan prosedürü | Implementation kapsam belirsizliği |
| V7-A7 (Bonus) | order_lines tablo adı (sales_order_lines DEĞİL) | RPC patlar |
| V7-A8 (P1/P2) | Order line adı/SKU master products JOIN'den **+ NULL pre-check + ROW_COUNT verify** | Yanlış kimlik + JOIN sessiz drop (eksik/tutarsız order) |
| V7-A9 (P2) | SalesOrderRow + mapOrderDetail 4 yeni alan kilidi | Derleme/okuma fail (guard çalışmaz) |
| V7-A10 (P2) | Accept RPC item_count = v_inserted | Sipariş item_count=0 |
| V7-A11 (P2) | Qty pozitif integer (Faz 2 validator + accept RPC trunc RAISE) | Küsürat sessiz yuvarlama |

**2. okuma (6. tur) +5:** V7-A8, V7-A9 (yeni) + V7-A5 RPC defansif RAISE + V7-A4 tek-davranış guard + test tablosu 422→502.
**3. okuma (6. tur) +5:** V7-A8 güçlendirme (JOIN drop → NULL pre-check + ROW_COUNT), V7-A4 güçlendirme (claim-öncesi early return + zorunlu sync_issue alert), V7-A10 (item_count), V7-A11 (qty integer), P3 başlık/sayaç housekeeping.

**Toplam:** V7 = V2 (5) + V3 (12) + V4 (13) + V5 (5) + V6 (4) + V7 (17) = **56 düzeltme** entegre. **Kapsam:** 7 faz, 12 migration (066-077), ~192 yeni test, ~30 dosya.

## Bu Plan Sonrası Süreç

**Bu plan UYGULAMA İÇİN değildir** — V7 master roadmap.

1. `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` üzerine V7 yazıldı (bu dosya)
2. `memory/project_quotes.md` V7 başlığı güncellenir
3. `memory/current_focus.md` 6. tur kaydı eklenir
4. `CLAUDE.md` Mevcut Durum V7 detayları
5. Faz 1 başlama onayı bekleniyor — V7-A6 prosedürü ile faz-spesifik tam plan yazılır

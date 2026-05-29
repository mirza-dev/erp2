# Master Plan: Teklif Modülü Kapsamlı Revize (V7) — DÜZELTİLMİŞ 6. TUR

> **Durum:** Bu plan kullanıcı review 6. tur (2026-05-29) sonrası 7 düzeltme ile güncellendi (3 P1 + 3 P2 + 1 bonus tablo adı). Güvenlik kararı korunur, satır vat_rate snapshot eklenir. **2 P2 kararı kullanıcı tarafından kesinleşti (2026-05-29):** (A5) PDF arşivi yoksa accept route'ta **recover/generate** (422 değil); (A4) header discount snapshot taşınır ama discount_amount>0'da Paraşüt **sessiz yanlış fatura göndermez** (bloklar/uyarır, gerçek aktarım ayrı faz). **IMPLEMENT EDİLMEYECEK** — sadece referans.

## Context

V6 planı 5. tur düzeltmelerini içeriyordu (4 schema uyum); 6. tur review V6'nın RPC SQL örneklerinde güvenlik ve veri tutarlılığı problemleri yakaladı. Migration 036'da bilinçli kaldırılan `SECURITY DEFINER`'ın V6'da geri eklenmesi + satır seviyesi vat_rate snapshot eksikliği + accept öncesi PDF arşiv kontrolü + tablo adı hatası. Tüm bulgular kod referansıyla doğrulandı.

## V7 Toplam Düzeltme Sayacı

- V2 (1. tur): 5
- V3 (2. tur): 12
- V4 (3. tur): 13
- V5 (4. tur): 5
- V6 (5. tur): 4
- **V7 (6. tur): 7** (3 P1 + 3 P2 + 1 bonus)
- **Toplam: 46 düzeltme entegre**

## Schema Doğrulamaları (6. tur — yeni)

| Konu | Gerçek Durum | V6'da Yanlış |
|------|--------------|--------------|
| Quote RPC SECURITY | Migration 036 bilinçli kaldırdı — "Quote RPC'lerden security definer kaldır" | ❌ V6 örneğinde `SECURITY DEFINER` geri eklenmiş — güvenlik kararı bozulur |
| quote_date NULLIF | `NULLIF(p_header->>'quote_date', '')::date` (065:71, 132 hem create hem update) | ❌ V6 örneği direkt cast — boş string patlama |
| order_lines.vat_rate | `vat_rate numeric(5,2) NOT NULL DEFAULT 20` (039:56-57) — Paraşüt için satır bazlı | ❌ V6 sadece sales_orders.vat_rate header eklemiş; satır vat_rate quote'tan taşınmıyor |
| Paraşüt satır discount | `discount_value: line.discount_pct` (parasut-service:688) | ❌ V6 header discount taşıyor, Paraşüt etkileşimi belirsiz |
| Mevcut order line tablosu adı | `order_lines` (001:110) | ❌ V6 örneği `sales_order_lines` yazmış — tablo yok |
| PDF arşiv accept guard | YOK | ❌ V6 accept RPC `quote_pdf_archive_id` lookup null'a izinli |

## Review V7 — 7 Düzeltme (6. tur)

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

Accept RPC `accept_quote_and_create_order` order line insert (V7 düzelmiş):
```sql
-- BONUS: tablo adı order_lines (sales_order_lines DEĞİL, V7-A7)
INSERT INTO order_lines (
  order_id, product_id, product_name, product_sku, unit,
  quantity, unit_price, discount_pct, line_total,
  vat_rate                              -- V7-A3 satır snapshot
)
SELECT v_order_id,
  qli.product_id,
  qli.description,                       -- V6-A1: quote.description → order.product_name
  qli.product_code,                      -- V6-A1: quote.product_code → order.product_sku
  (SELECT unit FROM products WHERE id = qli.product_id LIMIT 1),
  qli.quantity, qli.unit_price,
  0,                                     -- V3-A4: satır discount kaldırıldı (header'da)
  qli.line_total,
  v_quote.vat_rate                       -- V7-A3: quote header vat_rate → her satıra
FROM quote_line_items qli
WHERE qli.quote_id = p_quote_id
ORDER BY qli.position;
```

**Karar:** Tek vat_rate header'dan her satıra kopyalanır. Çoklu VAT senaryosu yok (kullanıcı kararı #1: tek para birimi + #13: KDV ayarlardan tek default + teklif özelinde).

**Test:** Accept → order_lines.vat_rate her satırda quote.vat_rate'e eşit; Paraşüt sync `vat_rate: line.vat_rate` doğru taşır.

### V7-A4 (P2) — Header discount Paraşüt scope kararı

**Mevcut Paraşüt davranışı:** `parasut-service:688` her order line için `discount_value: line.discount_pct` gönderir (satır bazlı discount %).

**V6 davranışı:** Quote'tan `discount_amount` header → sales_orders.discount_amount snapshot (V4-A8). Ama order_lines.discount_pct = 0 (V3-A4 header discount; satır discount kaldırıldı).

**Sorun:** Paraşüt fatura header discount görmez; satır discount = 0 görür → fatura toplamı quote'tan farklı.

**KULLANICI KARARI (2026-05-29, 6. tur kesinleşti): SNAPSHOT TAŞINIR + PARAŞÜT SESSİZ YANLIŞ TOPLAM GÖNDERMEZ.**

Tam Paraşüt iskonto implementasyonu (orantılı dağıtım vs ayrı iskonto satırı) bu faza şişirilmez (yuvarlama, KDV, çok satır, 0 fiyat, miktar hassasiyeti detayları çıkar). Ama saf "ertele" de KABUL DEĞİL — sessiz finansal hata yaratır (ERP toplamı ≠ Paraşüt faturası).

**Bu fazda yapılacak:**
1. `quotes.discount_amount → sales_orders.discount_amount` snapshot **mutlaka taşınır** (V4-A8 korunur; ERP içi veri doğru).
2. Paraşüt sync **guard**: `sales_orders.discount_amount > 0` olan siparişlerde Paraşüt fatura **sessizce oluşturulMAZ**. Bunun yerine ya validation/409 ile bloklanır ya da açık alert/uyarı: **"Paraşüt iskonto aktarımı henüz desteklenmiyor (ayrı faz)"**. Böylece muhasebeye yanlış toplam gitmez.
3. order_lines.discount_pct = 0 kalır (V3-A4 header discount).

**Gelecek ayrı faz (scope dışı):** Paraşüt'e aktarım yöntemi seçilir — Seçenek A: orantılı satır iskontosu (`line.discount_pct = headerDiscount / subtotal * 100`); Seçenek B: negatif "İskonto" line item; Seçenek C: Paraşüt header discount API (varsa).

**V7 plan dokümantasyonu:** Migration 075 yorum bloğu + parasut-service guard:
```sql
-- Header discount (quotes.discount_amount → sales_orders.discount_amount):
-- Bu fazda Paraşüt fatura'ya AKTARILMAZ. discount_amount > 0 ise Paraşüt sync
-- bu siparişi atlar/bloklar + "Paraşüt iskonto aktarımı ayrı faz" uyarısı verir.
-- Sessizce yanlış toplamlı fatura oluşturmak YASAK (ERP ≠ muhasebe riski).
```

**Test:** discount_amount=0 → Paraşüt sync normal; discount_amount>0 → sync bloklanır/uyarı (sessiz fatura YOK), sales_orders.discount_amount snapshot doğru taşınmış.

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

**RPC tarafı:** Atomik RPC arşivin var olduğunu varsayar (route garanti etti); defansif olarak NULL kalırsa yine de order yaratılır (`quote_pdf_archive_id = NULL` kabul) — recover route'ta çözüldüğü için RPC'de hard-fail YOK.

**Test:** Accept öncesi quote_pdf_archives boş → route PDF üretir + arşivler → accept başarılı + order.quote_pdf_archive_id dolu; PDF üretimi throw → 502, accept çağrılmaz.

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
        + V7-A5 (karar) accept route'ta recover/generate PDF arşivi (RPC öncesi; 422 değil)
        + V7-A4 (karar) Paraşüt guard yorum bloğu: discount_amount>0 sessiz fatura YOK

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
| **Paraşüt header discount sessiz yanlış toplam** | **V7-A4 (karar): snapshot taşınır + discount_amount>0'da Paraşüt sync bloklar/uyarır; aktarım ayrı faz** |
| **PDF arşivsiz kabul edilen sipariş** | **V7-A5 (karar): route accept öncesi recover/generate; üretim fail → 502** |
| **Delta plan implementation belirsizliği** | **V7-A6: faz başı 3-adım prosedür** |
| **order_lines tablo adı** | **V7-A7: sales_order_lines DEĞİL** |
| Önceki V6/V5/V4/V3/V2 düzeltmeler | Korundu |

## Faz Etkileri (V7 Test Sayıları)

V6 ile aynı migration sayısı (12); V7 sadece içerik düzeltmesi. Test sayıları:

| Faz | Migration | Yeni test |
|-----|-----------|-----------|
| 1 | 066-069 | ~29 (V6'dan +2: V7-A1 SECURITY INVOKER source-regex, V7-A2 boş quote_date 200) |
| 2 | YOK | ~21 |
| 3 | 070-071 | ~17 |
| 5 | 072 | ~35 |
| 4 | 073-074 | ~32 |
| 6 | 075 | ~33 (V6'dan +5: V7-A3 satır vat_rate snapshot, V7-A5 PDF guard 422, V7-A7 order_lines tablo adı, V7-A1 SECURITY INVOKER) |
| 7 | 076-077 | ~15 |

**Toplam test:** ~182 (V6'dan +7)

## V7 Verification Eklemeler

Faz 1 manuel smoke V7:
- 069 RPC apply sonrası `\df+ create_quote_with_lines` → Security: INVOKER (DEFINER değil)
- Form payload `quote_date: ''` → PATCH 200, quote.quote_date NULL (NULLIF guard)
- Mevcut create_quote_with_lines testleri yeşil (V6-A4 regression)

Faz 6 manuel smoke V7:
- Accept RPC SECURITY INVOKER
- Accept öncesi quote_pdf_archives boş → route PDF üretir + arşivler → accept başarılı (V7-A5 recover/generate); PDF üretimi fail → 502
- Accept sonrası order_lines.vat_rate her satırda quote.vat_rate'e eşit (Paraşüt sync doğru)
- discount_amount>0 sipariş → Paraşüt sync sessizce fatura oluşturmaz (bloklar/uyarır; V7-A4)
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

**V7'de eklenen 7 düzeltme:**

| # | Düzeltme | Önlenen Risk |
|---|----------|--------------|
| V7-A1 (P1) | SECURITY DEFINER yok (036 kararı korunur) | Privilege escalation |
| V7-A2 (P1) | quote_date NULLIF guard korunur | Boş string cast PATLAR |
| V7-A3 (P1) | order_lines satır vat_rate snapshot quote'tan | Paraşüt yanlış VAT fatura |
| V7-A4 (P2) | Header discount snapshot + Paraşüt guard (discount>0 sessiz fatura YOK) | Sessiz finansal hata (ERP≠muhasebe) |
| V7-A5 (P2) | Accept route recover/generate (422 değil) | PDF arşivsiz kabul + akış kesintisi |
| V7-A6 (P2) | Faz başı tam plan prosedürü | Implementation kapsam belirsizliği |
| V7-A7 (Bonus) | order_lines tablo adı (sales_order_lines DEĞİL) | RPC patlar |

**Toplam:** V7 = V2 (5) + V3 (12) + V4 (13) + V5 (5) + V6 (4) + V7 (7) = **46 düzeltme** entegre. **Kapsam:** 7 faz, 12 migration (066-077), ~182 yeni test, ~30 dosya.

## Bu Plan Sonrası Süreç

**Bu plan UYGULAMA İÇİN değildir** — V7 master roadmap.

1. `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` üzerine V7 yazıldı (bu dosya)
2. `memory/project_quotes.md` V7 başlığı güncellenir
3. `memory/current_focus.md` 6. tur kaydı eklenir
4. `CLAUDE.md` Mevcut Durum V7 detayları
5. Faz 1 başlama onayı bekleniyor — V7-A6 prosedürü ile faz-spesifik tam plan yazılır

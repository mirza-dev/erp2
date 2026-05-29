# KokpitERP — Claude Code Rehberi

## Mevcut Durum
_Son güncelleme: 2026-05-29_

**Son tamamlanan iş:** Teklif V7 **Faz 3 review düzeltmeleri** (Bulgular P1-P3, 2 tur) — 3815 test, COMMIT+PUSH `6366cbd` + migration 072 APPLY BEKLİYOR (2026-05-29)

- **Round 1 (5 bulgu) + Round 2 (4 bulgu) kod karşısında doğrulandı + kapatıldı:**
  - **P1 (finansal):** `serviceConvertQuoteToOrder` iskontoyu yok sayıp order toplamını yüksek yazıyordu. `sales_orders`'ta header iskonto kolonu YOK (Faz 6/076) → "koru" imkânsız → **BLOCK**: `quote.discount_amount > 0` ise convert engellenir (clear error, convert route mevcut 400 yolu). UI: `[id]/page.tsx` iskontolu accepted → buton yerine not. Faz 6'da kalkar. +2 test.
  - **P2 (bütünlük):** `validateDiscount(disc, subtotal)` (quote-validation.ts) → negatif/subtotal-üstü/**non-finite (round2)** **422**. **Round2:** `Number.isFinite` guard (NaN/Infinity/`"abc"` helper'dan geçip RPC numeric cast'inde 500'e düşmesin). **Round2b (advisor):** route'lar `body.discount_amount`'ı validasyon sonrası **number'a normalize eder** (`""`→0, `"100"`→100) → dbCreate/Update'e raw string DEĞİL number gider; RPC `(''::numeric)` 500'ü önlenir (071 NULLIF'siz). `"abc"`→422 (dbCreate çağrılmaz). **Migration 072** `quotes_discount_nonneg check (discount_amount >= 0)` — pg_constraint guard'lı DO block (idempotent). `<= subtotal` route kuralı. **APPLY BEKLİYOR.**
  - **P2/P3:** autosave `teklif_v3` payload'ına `discount` eklendi (yazım+restore) → kaydetmeden refresh'te iskonto korunur.
  - **P3 (TR parse):** 4 toplam input (sub/vat/grand/discount) onFocus'ta **ham yuvarlı sayı** (`String(Math.round(eff*100)/100)`, formatlı değil) → `1.234,56`→`1.234` binlik-ayraç parse hatası giderildi + hesaplanan vat/grand'da uzun ondalık (246.912) görünmez.
  - **P3 (UI mesaj, round2):** iskontolu accepted not'undan "İskontoyu kaldırırsanız dönüştürebilirsiniz" kaldırıldı (accepted düzenlenemez — `isQuoteEditable("accepted")===false`, imkânsız aksiyon) → sade "sonraki fazda gelecek".
  - **P3 (doc):** lint kaydı düzeltildi (repo geneli 32 error / 0 warning; memory "3" QuoteForm dosya-bazlıydı).
- **Numbering:** 072 iskonto CHECK aldı → **Faz 5 = 073**, downstream +1. **QUOTES_V2_PLAN.md "Migration Sırası" hizalandı** (Faz3 070-072, Faz5→073, Faz4→074-075, Faz6→076, Faz7→077-078).
- **Test:** `quotes-faz3-discount` (round1 +13, round2 +malformed/idempotent/mesaj) + `quote-convert-service` +2 + faz4b/faz4a regex güncel. **3799 → 3815 yeşil** · tsc temiz · build OK (`ƒ Proxy`) · **lint 32 repo-geneli baseline / 0 warning** (bu turda yeni hata YOK — eklenenler validator/helper).
- **DURUM: COMMIT+PUSH EDİLDİ** (`6366cbd` → main, `b44ba39..6366cbd`, Coolify redeploy; 072 dahil 15 dosya) **+ migration 072 APPLY BEKLİYOR.** **Sıradaki:** 072 Supabase apply (idempotent) + UI smoke (iskontolu convert engeli+yeni mesaj; discount -10/subtotal-üstü/`"abc"` → 422; `""`→201; autosave restore; `1.234,56` focus→`1234.56`) + **Faz 5** (073).

<details><summary>Faz 3 ilk implement (`c5d8267`, migration 070/071 APPLY EDİLDİ)</summary>

- **Faz 3 = header iskonto (`discount_amount`).** Türk fatura standardı: Ara Toplam → İskonto → KDV Matrahı (subtotal − discount) → KDV → Genel Toplam (iskonto **KDV öncesi**). Plan: `~/.claude/plans/clever-dancing-owl.md`.
- **Kullanıcı kararı:** kapsam yalnız iskonto; `company_settings.default_vat_rate` **bu fazdan ÇIKARILDI** (iskontodan bağımsız + form KDV select sabit 0/10/20 → configurable default friction; ayrı "ayarlar" fazına ertelendi). Migration 070 = sadece `quotes.discount_amount`.
- **Migration:** `070_quotes_discount.sql` (kolon `numeric(15,2) default 0`); `071_quotes_rpc_discount.sql` (069 üzerine create/update RPC + `discount_amount` payload + **V3-A6 draft guard**: update_quote_with_lines non-draft → `42501` RAISE; V7-A1 SECURITY INVOKER, V7-A2 NULLIF korundu). **APPLY EDİLDİ** (kullanıcı Supabase editöründe çalıştırdı).
- **Form (QuoteForm.tsx):** `discount` state (override paterni DEĞİL, ↻ YOK); `effDisc = Math.min(Math.max(discount,0), effSub)` clamp; `effVat/effGrand = (effSub - effDisc)...`; **hydrate `setDiscount(initialData.discountAmount ?? 0)` (advisor must-have — atlanırsa edit+kaydet iskontoyu sessizce 0'a düşürür)**; payload `discount_amount: effDisc`; Subtotal–VAT arası İskonto `<tr>` (`aria-label="İskonto"`). autoSave+savePreviewData QuoteData bloklarına `discountAmount` enjekte + dep array'lere `discount`.
- **TS/PDF:** QuoteRow.discount_amount, QuoteDetail.discountAmount, CreateQuoteInput.discount_amount, mapQuoteDetail, QuoteData.discountAmount, BILINGUAL_LABELS.discount (İskonto/Discount); QuoteDocument koşullu İskonto satırı (`discountAmount > 0`, eksi işaretli — eski teklifler temiz). import-service iki literal'e discount_amount (update: existing koru, create: 0).
- **Test:** `quotes-faz3-discount.test.ts` (21: route passthrough + draft guard + formül referans + form/document/types source-regex). faz4a autoSave regex penceresi 2000→2600 (iskonto IIFE'leri uzattı). **3778 → 3799 yeşil** · tsc temiz · build OK (`ƒ Proxy`) · lint 3 baseline error 0 warning (yeni uyarı yok).
- **DURUM: COMMIT+PUSH EDİLDİ** (`c5d8267` → main, `62eeb8e..c5d8267`, Coolify redeploy) + migration 070/071 APPLY EDİLDİ.

</details>

<details><summary>Faz 2 (önceki, `afe936b`)</summary>

- **Faz 2 = tam master-plan Faz 2 (kullanıcı kararı, 4 düzeltme).** Migration YOK — saf uygulama katmanı (alanlar Faz 1a/1b'de hazırdı). Yeni `src/lib/quote-validation.ts` (3 pure helper: validateQuoteLineQuantities / validateQuoteForSend / findMissingHsLines + QuoteLineForValidation interface) route'lar + servis + form tarafından paylaşılır.
- **V7-A11 qty pozitif tam sayı:** `validateQuoteLineQuantities` — gerçek satırda (`product_id != null || unit_price > 0`) küsürat/0 → **422**. POST `/api/quotes` + PATCH document-update branch. Salt-açıklama/başlık satırı (qty 0) muaf (kullanıcı kararı). UI nudge qty input `min="1" step="1"`.
- **V4-A2 + V4-A4 send-time HARD check:** `validateQuoteForSend` — `serviceTransitionQuote`'ta yalnız `target==="sent"`: customer_address zorunlu + substantive satır (`price>0||qty>0`) product_id null → blok. `validationFailed` flag → PATCH transition mapping `notFound?404 : validationFailed?422 : 409`. **P2 fix (review): sent branch `validateQuoteLineQuantities(quote.lines)` de çalışır** → legacy/bypass draft küsüratlı/0 adetle sent OLAMAZ (qty 3 noktada). Faz 6 accept RPC `product_id IS NULL → RAISE` backstop'u planlı (henüz yok — Faz 6/075).
- **V3-A1 GTİP soft warn — formda inline (kullanıcı kararı):** `findMissingHsLines` derived; toolbar altı non-blocking `role="status"` + `var(--warning-text)` uyarı; **hiçbir butonu disable etmez** (regression test'li).
- **Test:** `quote-validation-helpers` (22) + `quotes-faz2-validation-routes` (12) + `quotes-faz2-form-warn` (7) + quote-service +7 (5 send-validation + 2 P2 bypass; stubQuote'a customer_address). **3731 → 3778 yeşil** (targeted Faz 2 = 74) · tsc temiz · build OK (`ƒ Proxy` korundu).
- **DURUM: COMMIT + PUSH EDİLDİ** (`afe936b` → main, `ff07a86..afe936b`, Coolify redeploy tetiklendi). React Doctor advisory baseline (skor 90/100; Faz 2'ye özel yeni bulgu yok).

</details>

**Önceki:** Teklif V7 **Faz 1b** implement edildi — QuoteForm entegrasyon (3729 test, migration apply EDİLDİ, 2026-05-29)

- **Faz 1 tamamlandı:** **1a (DB foundation)** ✅ commit `106686c` + **1b (QuoteForm/UI)** ✅ bu turda. 1b tek dosya `QuoteForm.tsx` — 1a alanlarını forma bağlar.
- **V3-A4 productId:** `QuoteRow.productId` + handleSelectProduct set + handleCodeChange temizle + payload `product_id` + hydrate. **069 RPC tüketimi doğrulandı** (product_id/unit_weight_kg/kg_manual_override her iki RPC INSERT kolon+value NULLIF guard'lı → kozmetik değil).
- **V4-A2 müşteri:** `custId`/`custAddress` + handleSelectCustomer capture + Address/Adres input + payload customer_id/customer_address + hydrate.
- **V4-B3/V3-B5/V4-A7:** handleSelectProduct hs/size/unitWeightKg auto-fill; `patchRow`+`round3`; handleQtyChange KG=qty×birim recompute; handleKgChange→`kgManualOverride`; payload unit_weight_kg/kg_manual_override.
- **V4-A3 satıcı freeze:** `hasSellerSnapshot` ayraç + company_settings effect `if(hasSellerSnapshot) return` (snapshot'lı quote'ta live fetch ATLA → donmuş gösterim); seller_* hydrate+persist; pre-1b snapshot'sız quote→live fetch fallback.
- **Regression:** faz4b desc bloğu BİREBİR korundu (konsolide refactor yok). **+27 test** (`quotes-faz1b-form-integration.test.ts`) · tsc temiz · **3729 test yeşil** (3702→+27) · build OK.
- **Migration apply EDİLDİ** (066-069 Supabase editöründe çalıştırıldı, 2026-05-29). UI smoke kullanıcı tarafında bekliyor (yeni teklif ürün seç→hs/size/KG; kaydet→reload→korunur; eski sent→satıcı donmuş).
- **Caveat:** hs/size auto-fill DORMANT (products'ta hs_code/size_text boş); handleSelectProduct hs'yi her seçimde set eder (dirty-guard YOK) → manuel HS yeniden-seçimde silinir. Products drawer hs/size edit UI 1b DIŞI.
- **DURUM: COMMIT + PUSH EDİLDİ** (main, Coolify redeploy tetiklendi) · migration apply EDİLDİ.
- **Sıradaki:** (1) UI smoke (yukarıda), (2) **Faz 2** (V3-A1 GTİP soft warn, V7-A11 qty pozitif integer validator).

**Önceki:** Bekleyen Teklifler UI/UX fix commit/push + Teklif V7 master plan bulguları kod karşısında doğrulandı (6. tur, 2026-05-29)

- **1) Bekleyen UI fix push edildi:** Teklifler UI/UX audit fix (DOM mutation→hoveredId state, hex→CSS var, a11y) önceki oturumdan main'de commit'siz duruyordu. `tsc --noEmit` temiz + **3682 test yeşil** doğrulandı. 2 commit (`12f7e23` fix + `d201c11` docs) → main push → Coolify redeploy. Lokal skill dizinleri (`.agents/`, `.claude/skills/`, `skills/`) commit dışı. React Doctor pre-commit hook uyarısı bloklamadı.
- **2) QUOTES_V2_PLAN.md zaten V7 (02:02'de, oturumdan önce yazılmış); memory V6'da staleydi.** Kullanıcının 6 bulgusu (3 P1 + 3 P2) + 1 bonus = V7-A1…A7 olarak plana zaten işlenmiş; bu turda hepsi kod karşısında doğrulandı:
  - V7-A1 SECURITY DEFINER kaldır (036:1-3 + 065 DEFINER yok) ✅
  - V7-A2 quote_date NULLIF guard (065:71,132) ✅
  - V7-A3 order_lines satır vat_rate snapshot (039:57 + parasut-service:686 `vat_rate: line.vat_rate ?? 20`) ✅
  - V7-A4 (P2) Paraşüt header discount (parasut-service:688) ✅ — **KULLANICI KARARI:** snapshot taşı + discount_amount>0'da Paraşüt SESSİZ fatura YOK (bloklar/uyarır); gerçek aktarım ayrı faz
  - V7-A5 (P2) accept öncesi PDF arşiv (quote_pdf_archives Faz 4'te) ✅ — **KULLANICI KARARI: RECOVER/GENERATE** (422 değil); accept route RPC öncesi eksik arşivi üretir, fail→502
  - V7-A7 order_lines tablo adı (001:110; sales_order_lines yok) ✅
  - V7-A6 faz başı tam plan prosedürü
- **6. tur 2. okuma — 5 düzeltme (plana işlendi):** V7-A8 (order line master JOIN), V7-A9 (SalesOrderRow+mapOrderDetail 4 alan kilidi), V7-A5 ek (RPC RAISE), V7-A4 netleşti, test 422→502.
- **6. tur 3. okuma — 5 düzeltme daha (kod karşısında doğrulandı, plana işlendi):**
  - **V7-A8 güçlendirme (P1):** INNER JOIN sessizce satır düşürür — `quote_line_items.product_id` ON DELETE SET NULL (034:107); send sonrası ürün silinirse NULL → JOIN drop → eksik/finansal tutarsız order. Önceki "V4-A4 garanti ediyor" notu YANLIŞTI (send-time check post-send silmeyi kapsamaz). Fix: insert öncesi `product_id IS NULL → 23502 RAISE` + insert sonrası `GET DIAGNOSTICS ROW_COUNT` verify (039 precedent).
  - **V7-A4 güçlendirme (P1+P2):** Guard throw ederse parasut-service:1092 catch parasut_step/marker yazar → "marker yazılmaz" bozulur. Fix: `parasut_claim_sync` (1016) ÖNCESİ early return (throw değil) + **ZORUNLU** sync_issue alert (ship route:62 fire-and-forget → sessiz block görünmez).
  - **V7-A10 (P2):** accept RPC `item_count = v_inserted` (create_order 023 ediyor; accept etmiyordu → item_count=0).
  - **V7-A11 (P2):** order_lines.quantity integer (001:10) ⟂ quote numeric(12,4) (034:111) + QuoteForm step="any" (972) → Faz 2 pozitif integer validator + accept RPC `trunc(quantity)` RAISE.
  - **P3:** stale başlıklar (Review V7 — 7 / eklenen 7) → 17.
- **Toplam 56 düzeltme (V2-V7; V7=17).** ~192 test. Implement EDİLMEDİ. Plan modunda onaylandı. Detay: `memory/project_quotes.md` V7 başlığı.
- **commit mesajı notu:** `d201c11` "V6 master plan" der ama içerik V7; pushed main, history rewrite yapılmadı.
- **Sıradaki:** Faz 1 başlama onayı (V7-A6: önce faz-spesifik self-contained tam plan).

**Önceki:** Teklif Modülü V6 Master Plan onaylandı (5. tur review), implement EDİLMEDİ (2026-05-29)

- **Trigger:** Kullanıcı V5 plan üzerinde 5. tur review yaptı; 4 schema uyum blocker. V5 RPC SQL örnekleri mevcut schema ile çelişiyordu.
- **Schema gerçekliği DOĞRULANDI (5. tur yeni):**
  - `quote_line_items` (034:108-115) = `product_id, product_code, description, quantity, unit_price, line_total, hs_code, weight_kg, position, lead_time` + 065 ile `size_text, delivery_method, payment_method` — **product_sku/product_name/discount_pct/notes YOK**
  - Order number RPC = `generate_order_number()` (003, 007, 023 + orders.ts:59) — **next_order_number YOK**
  - `sales_orders` finansal kolonlar (001:88-91) = `currency, subtotal, vat_total, grand_total` — **vat_rate YOK**
  - Mevcut `create_quote_with_lines` (065:42-65) = 27 alan (quote_number, status, customer_*, sales_rep, sales_phone, sales_email, currency, vat_rate, subtotal, vat_total, grand_total, notes, sig_*, quote_date, valid_until, delivery_method, payment_method, updated_at) — V5 örneği eksik gösteriyordu
- **4 düzeltme V6:**
  - V6-A1: quote_line_items mevcut kolon adları (`product_code` + `description`); mapper UI alanları (productSku/productName) translate eder; discount_pct kullanılmaz (V3'te zaten header'a taşınmıştı)
  - V6-A2: `generate_order_number()` doğru fonksiyon adı (RPC çağrısı düzeltildi)
  - V6-A3: **`sales_orders.vat_rate` snapshot kolonu eklenir** (Migration 075 ALTER, NOT NULL DEFAULT 20, CHECK 0-100, backfill mevcut order'lar) — finansal snapshot için kritik; quote.vat_rate dondurulmalı
  - V6-A4: RPC tam rewrite DEĞİL — mevcut 065 RPC korunur, sadece V5-A1 yeni alanları (customer_address, seller_*, unit_weight_kg, kg_manual_override) eklenir; Migration 069 başlığı bunu açıkça yazar
- **Migration sayısı:** 12 toplam, V5 ile aynı; sadece içerik düzeltildi
- **Önceki düzeltmeler korundu:** V5 (5), V4 (13), V3 (12), V2 (5) — **39 düzeltme entegre**
- **Master plan:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` (V6 versiyon)
- **Kapsam:** 7 faz · 12 migration · ~175 yeni test · 4-6 hafta tam zamanlı
- **Implement EDİLMEDİ** — master roadmap; her faz öncesi ayrı detay plan modu
- **Sıradaki:** Faz 1 başlama onayı bekleniyor

**Önceki:** Teklif Modülü V5 Master Plan onaylandı (4. tur review), implement EDİLMEDİ (2026-05-29)

- **Trigger:** Kullanıcı V4 plan üzerinde 4. tur review yaptı; 5 sıralama/atomicity düzeltmesi. Tutarsızlıklar plan içiydi (RPC payload DB schema'dan önce gelmiyordu, /accept atomicity belirsizdi).
- **5 düzeltme V5:**
  - V5-A1: **Migration sırası FIX** — Faz 1+2'nin ihtiyaç duyduğu tüm DB alanları Faz 1 grubunda (066: products hs/size, 067: quotes customer_address+seller_*, 068: line unit_weight_kg/kg_override, 069: RPC payload extension). Eski V4'te dağınıktı.
  - V5-A2: **Faz 1 Migration 069** — `create_quote_with_lines` + `update_quote_with_lines` RPC'leri yeni alanları payload'tan okur (customer_address, seller_*, unit_weight_kg, kg_manual_override). DB hazır → RPC tutarlı.
  - V5-A3: **Faz 2 validation order tutarlı** — Faz 1 migration'da DB hazır olduğundan customerAddress + productId hard check güvenle Faz 2'de.
  - V5-A4: **`accept_quote_and_create_order` RPC atomik** (Migration 075, Faz 6) — Tek PL/pgSQL transaction: SELECT FOR UPDATE quote → idempotency → status guard → productId defensive → sales_order insert → order lines → quote.status='accepted' → audit_log. Hata → tüm değişiklikler ROLLBACK.
  - V5-A5: **Yıllık counter backfill prefix/separator bağımsız** — `created_at`'tan yıl (quote_number format'tan değil); regex `\d+$` ile sondaki rakam dizisi (TKL-2026-001, PMT.2026.042, ABC_2026_100 hepsi destekli); revision quote'lar (revision_no>0) backfill'de sayılmaz.
- **Migration tahsisi V5 (12 toplam):**
  - 066-069: Faz 1 (DB foundation + RPC payload)
  - 070-071: Faz 3 (header discount + RPC)
  - 072: Faz 5 (status CHECK + revision + sig backfill + prefix + quote_yearly_counters)
  - 073-074: Faz 4c (PDF arşiv + bucket)
  - 075: Faz 6 (sales_orders meta + accept atomik RPC)
  - 076-077: Faz 7 (note_templates + sort_order)
- **Önceki düzeltmeler korundu:** V4 (13), V3 (12), V2 (5) — toplam **35 düzeltme entegre**
- **Master plan:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` (V5 versiyon)
- **Kapsam:** 7 faz · 12 migration · ~170 yeni test · 4-6 hafta tam zamanlı
- **Implement EDİLMEDİ** — master roadmap; her faz öncesi ayrı detay plan modu
- **Sıradaki:** Faz 1 başlama onayı bekleniyor

**Önceki:** Teklif Modülü V4 Master Plan onaylandı (3. tur review), implement EDİLMEDİ (2026-05-29)

- **Trigger:** Kullanıcı V3 plan üzerinde 3. tur review yaptı; 8 ana + 5 ikincil = 13 yeni düzeltme.
- **Yeni schema gerçekliği DOĞRULANDI:**
  - `audit_log.source` = `"ui"|"system"|"ai"|"integration"` enum (database.types.ts:387,424) — literal 'migration_069' PATLAR
  - `quotes.customer_address` — **YOK** (034:27-30: name/contact/phone/email var; address yok)
  - Firma bilgileri DB'de saklanmıyor (QuoteForm:242 yorumu açık)
  - PATCH `/api/quotes/[id]` `transition: 'accepted'` mevcut + `/convert` endpoint ayrı → **iki yol**
  - DELETE guard `["draft", "sent"].includes` (route.ts:106) — sent silinebilir
  - Quote sequence `quotes_number_seq` global (034:10) — yıllık reset YOK
- **8 ana düzeltme V4:**
  - V4-A1: audit_log.source='system' + migration adı after_state'e (literal kullanmak migration patlatır)
  - V4-A2: quotes.customer_address snapshot + zorunlu validator + backfill + PDF render
  - V4-A3: seller_* 7 snapshot alanı (name/phone/email/address/tax_id/website/logo_url) DB'de + sent'te dondur
  - V4-A4: productId send-time HARD check — `rows.every(productId !== null)` + convert defensive (custom satır izinsiz)
  - V4-A5: PDF arşiv 3 path resume strategy (idempotent / resume / fresh) — partial failure recovery
  - V4-A6: DELETE sadece draft (sent → 409 Conflict)
  - V4-A7: `unit_weight_kg` + `kg_manual_override` DB persist (reload sonrası KG korunur)
  - V4-A8: `/accept` tek yol; PATCH transition accepted → 410 Gone + `/convert` → 410 Gone
- **5 ikincil düzeltme V4:**
  - V4-B1: `quote_yearly_counters` tablo + atomik INSERT ON CONFLICT (yıllık counter reset)
  - V4-B2: RLS ENABLE her yeni tabloya (quote_pdf_archives, note_templates, quote_yearly_counters)
  - V4-B3: hs_code/size_text geniş entegrasyon (CreateProductInput + mapper + import wizard)
  - V4-B4: audit-source-enum.test.ts (migration/RPC source coverage)
  - V4-B5: memory update checklist faz sonu
- **Önceki düzeltmeler korundu:** V2 (5) + V3 (12) + V4 (13) = **30 düzeltme entegre**
- **Master plan:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` (V4 versiyon)
- **Kapsam:** 7 faz · 10 migration (066-075) · ~145 yeni test · 4-6 hafta tam zamanlı
- **Implement EDİLMEDİ** — master roadmap; her faz öncesi ayrı detay plan modu
- **Sıradaki:** Faz 1 başlama onayı bekleniyor

**Önceki:** Teklif Modülü V3 Master Plan onaylandı (2. tur review), implement EDİLMEDİ (2026-05-29)

- **Trigger:** Kullanıcı V2 plan üzerinde 2. tur review yaptı; schema gerçekliği uyuşmazlıkları + 12 düzeltme önerdi.
- **Schema gerçekliği DOĞRULANDI:**
  - `quotes.status` = `text NOT NULL DEFAULT 'draft'` + CHECK constraint (034:26, 91-92) — **enum DEĞİL**
  - `audit_log` kolonları = `action/entity_type/entity_id/before_state/after_state/source` (001:282-289) — **target_table/target_id/payload YANLIŞ**
  - `QuoteRow` (form state) — productId alanı **YOK** (QuoteForm:14)
  - `sig_prepared`, `sig_approved` mevcut (034:38-39, RPC parametre)
  - `company_settings.currency` = `char(3) NOT NULL DEFAULT 'USD'` (033:16) — duplicate `default_currency` GEREKSİZ
  - Middleware = **`src/proxy.ts`** (Next 16 convention) — NOT middleware.ts
- **6 ana düzeltme V3:**
  - V3-A1: GTİP SOFT warn (HARD değil), KG gibi yumuşak
  - V3-A2: Status migration text+CHECK constraint paterni (enum swap DEĞİL)
  - V3-A3: audit_log kolon isimleri doğru (entity_type/entity_id/before_state/after_state)
  - V3-A4: QuoteRow.productId hidden field Faz 1'de (convert flow için kritik — eksiksiz sipariş taşıma)
  - V3-A5: PDF immutable arşiv — INSERT-only, upsert=false; mevcut archive varsa signed URL döner
  - V3-A6: Non-draft update/delete HARD guard (helper JS + RPC SQL guard + 409)
- **6 ikincil düzeltme V3:**
  - V3-B1: sig_prepared/sig_approved → prepared_by_name/approved_by_name backfill
  - V3-B2: company_settings.currency reuse (default_currency DUPLICATE etme)
  - V3-B3: quote_number_prefix/separator migration SQL'e dahil edildi
  - V3-B4: src/proxy.ts (NOT middleware.ts — Next 16 convention)
  - V3-B5: unitWeightKg gizli alan KG = qty × unitWeightKg recompute için
  - V3-B6: 0 fiyat PDF "0.00" gösterir (mevcut "—" basıyor)
- **6 önceki V2 düzeltmesi korundu:** prepared/approved serbest text + audit user FK; expired→sent (rejected DEĞİL); root_quote_id zincir fix; discount data migration KALDIRILDI; preview hibrit (sessionStorage Mod A + DB Mod B)
- **Master plan:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` (V3 versiyon)
- **Kapsam:** 7 faz · 9 migration (066-074) · ~125 yeni test · 4-6 hafta tam zamanlı
- **Implement EDİLMEDİ** — master roadmap; her faz öncesi ayrı detay plan modu
- **Sıradaki:** Faz 1 başlama onayı bekleniyor

**Önceki:** Teklif Modülü V2 Master Plan onaylandı, implement EDİLMEDİ (2026-05-29 1. tur)

- **Trigger:** Kullanıcı kapsamlı revize istedi: ürün auto-fill (kod/ölçü/açıklama/fiyat/GTİP/KG), çift dilli kurumsal PDF, revizyon zinciri, immutable PDF arşivi, kabulde sipariş dönüşümü.
- **Süreç:** 3 paralel Explore agent + 1 Plan agent → master plan taslağı → kullanıcı 1. review turunda 6 kritik düzeltme önerdi → entegre edildi.
- **6 review düzeltmesi (entegre):**
  1. prepared_by/approved_by user FK DEĞİL → `prepared_by_name text` + `approved_by_name text` serbest metin; audit için ayrı `created_by`/`sent_by` user FK
  2. Legacy `expired` → `sent` (rejected DEĞİL — satış raporları bozulmasın); UI rozet `validUntil < today AND status='sent'`
  3. Revizyon zinciri bug → `root_quote_id uuid NULL` paterni; quote_number `root.quote_number || '-R' || revision_no` (zincir YOK, R1 → R2 değil R1-R2)
  4. Discount data migration KALDIRILDI; `quote_line_items.discount_pct` korunur (DEPRECATED comment); iki katmanlı formül (legacy compat + yeni header discount)
  5. Preview hibrit: Mod A sessionStorage (kaydedilmemiş) + Mod B server DB (kaydedilmiş)
  6. GTİP HARD validation (boşsa 422); KG SOFT warn (boşsa uyarı, gönderme bloklanmaz) — **NOT: V3-A1'de GTİP SOFT'a revize edildi; Faz 2'de SOFT warn olarak uygulandı (HARD DEĞİL). Bu satır V2 turunun tarihsel kaydıdır.**
- **Master plan:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` (24KB, ~600 satır)
- **Kapsam:** 7 faz · ~10 migration (066-074) · ~120 yeni test · ~30 yeni dosya · ~25 değişen dosya · 4-6 hafta tam zamanlı
- **Sıra:** Faz 1 (master alanlar) → 2 (validation: GTİP **soft** [V3-A1 revizyonu; V2'deki "hard" geçersiz], KG soft) → 3 (header discount + settings VAT/currency) → 5 (revision + status enum + root_quote_id + expired→sent) → 4 (Puppeteer PDF + arşiv + preview hibrit) → 6 (kabul → sales_order taşıma) → 7 (liste UX + autosave kaldır + note_templates)
- **Implement EDİLMEDİ** — sadece master roadmap. Her faz öncesi ayrı detay plan modu açılır.
- **Sıradaki:** Faz 1 başlama onayı bekleniyor.

**Önceki:** Teklifler modülü UI/UX eksiksiz düzeltme (2026-05-28; 3682 test)

- **Trigger:** Kullanıcı "teklifler sayfası, mevcut sorunları herhangi bir yerde eksiksiz düzelt" istedi. 7 dosyalık Explore audit → 5 yüksek + 11 orta sorun. Print PDF (`QuoteDocument.tsx`) bilinçli hex paleti — kapsam dışı.
- **A — DOM mutation antipattern (`quotes/page.tsx:429-454`):** `<tr>` `onMouseEnter`/`onMouseLeave` `querySelectorAll("td").style.background` + `querySelector("[data-chevron]"/"[data-delete]").style.opacity` ile doğrudan DOM yazıyordu. Fix: `hoveredId` state + tüm TD'lerde koşullu inline (`background`, `borderLeft`), chevron/delete opacity React state'den, `data-*` attribute'ları silindi.
- **B — UX bug (`quotes/page.tsx:452`):** `onMouseLeave` içinde `if (confirmId === q.id) setConfirmId(null)` — "Evet, sil" onay butonu fareyi başka satıra kaydırınca sıfırlanıyordu. Fix: A maddesiyle birlikte handler `() => setHoveredId(null)`'a indirgendi; satır otomatik gitti.
- **C — preview/page.tsx 9 hex → CSS var:** toolbar/btn/text/border/bg renkleri (`#1e2330/#2d3347/#0072BC/#9ca3b0/#373e47/#1a1d23/#e6edf3/#636d7c`) → `var(--bg-primary/border-tertiary/accent/text-secondary/border-secondary/text-primary/text-tertiary)`. Bilinçli korunan: `#d0d5dd` (PDF kağıt taklidi scroll bg, yorum eklendi) + `color: "white"` (accent zemin okunaklılığı).
- **D — QuoteForm.tsx INJECTED_CSS:** `var(--bg-hover, #2a2e37)` (2 yer) → `var(--bg-secondary)`. `--bg-hover` globals.css'te tanımlı değildi, her zaman hex fallback'e düşüyordu.
- **E — A11y:** `page.tsx` refresh + delete button `aria-label`, chevron `aria-hidden`. `[id]/page.tsx` confirm dialog `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + başlık `id` + SVG `aria-hidden`.
- **+15 source-regex test (`quotes-ui-audit-fix.test.ts`):** DOM mutation kaldırma (3), hoveredId state (1), handler simplification (1), data-attr temizliği (1), confirmId UX fix (1), aria-label (2), dialog a11y (3), preview hex temizliği (1), CSS var kullanımı (1), korunan #d0d5dd (1), QuoteForm bg-hover (1).
- 5 dosya · **3682 test yeşil** (önceki 3667 + 15) · TS clean · 0 yeni warning · build OK
- **Sıradaki:** Push + Coolify redeploy + manuel smoke (satır hover + "Evet, sil" stabilite + preview dark theme + screen reader dialog).

**Önceki:** SMTP smoke endpoint + deploy runbook (2026-05-28; 3667 test)

- **Trigger:** SMTP/Resend entegrasyonu 2026-05-06'dan beri kod tarafında hazır ama production deploy yapılmadı. Müşteri domain'i henüz belli olmadığı için Resend hesabı + DNS verify bloklu. Bu turda **kod tarafını deploy-ready hale getir** + **kullanıcı için adım adım runbook yaz**.
- **Kod tarafı 100% hazırdı (doğrulandı):**
  - Migration 047 (`email_logs` tablosu), `resend@^6.12.2` package, `.env.example` (4 değişken), `email-service.ts` (fail-safe pattern), `email-logs.ts` (dedup+retry), `templates.ts` (5 bildirim tipi inline HTML), `email/retry-failed/route.ts`, `crons.yml` `email_retry` job (her saat) — hepsi mevcut, trigger entegrasyonları yapılmış (alert-service stock_critical, vb.).
- **Bu turda eklenenler:**
  - **`POST /api/email/test`** (yeni admin-only smoke endpoint): `requireRole(["admin"])` guard + body validation (email regex + NotificationTypeKey whitelist) + config check (RESEND_API_KEY + EMAIL_FROM yoksa 503 `config_missing`) + 5 NOTIFICATION_TYPE için sample context + recipient lookup/dedup **bypass** (test için body.to'ya direkt) + email_logs `entity_type='test_email'` ile audit + Resend direct send. Kullanıcı tek browser console fetch ile test atabilir, gerçek alert tetiklemeden doğrulama.
  - **`docs/EMAIL_DEPLOY.md`** runbook: 7 faz — Resend hesap + DNS, Coolify env vars, Migration 047 uygulama, Coolify redeploy, smoke test (Yöntem A test endpoint + Yöntem B gerçek tetikleyici), troubleshooting tablosu, sağlık kontrolleri. Süre tahmini: ~30 dk (DNS propagation hariç).
- **Resend mock fix:** Test'te Resend class constructor olarak çağrılıyor (`new Resend(apiKey)`). `vi.fn().mockImplementation(() => ({...}))` constructor uyumlu değil → `class MockResend { emails = {...} }` pattern'i kullanıldı.
- **+10 yeni test (`email-test-endpoint.test.ts`):**
  - Auth: admin değil → 403 + Resend çağrılmaz (2)
  - Validation: geçersiz JSON / email / type → 400 (3)
  - Config: RESEND_API_KEY eksik → 503; EMAIL_FROM eksik → 503 (2)
  - Happy path: stock_critical → 200 sent + log + Resend args; 5 tip için kabul (2)
  - Error: Resend response.error → 502 failed; Resend throw → 502 error + log failed (2)
- 3 dosya (1 yeni route + 1 yeni test + 1 docs) · **3667 test yeşil** (önceki 3657 + 10) · TS clean · 0 yeni lint warning · build OK
- **Müşteri domain'i belirsiz** olduğu için Resend hesap açma + DNS verify + Coolify env set + Migration 047 uygulama tamamen kullanıcı tarafında bekliyor. Domain hazır olduğunda runbook ile ~30 dk'da deploy edilir.
- **Sıradaki:**
  1. **Kullanıcı tarafında (domain hazır olunca):** Faz 1-5 (`docs/EMAIL_DEPLOY.md`)
  2. Memory'deki kalan: Faz 12 Paraşüt Sandbox GATE, React Doctor kalan ~271 inline (düşük öncelik)

**Önceki:** Sesli giriş V3 — fireNotes → notlar entegrasyonu + Ctrl+M kısayolu (2026-05-28; 3657 test)

- **Trigger:** Memory'de "Kapsam Dışı (V3)" listesinde bekleyen 2 madde — sesli giriş feature'ı tamamlama turu.
- **Kullanıcı kararları (2026-05-28):**
  - Fire için ayrı UI sütunu **OLMAYACAK** (yeni form alanı istenmiyor)
  - `fireNotes` ("fire: 2 adet") mevcut Notlar alanına otomatik concat edilecek
  - Ctrl+M klavye kısayolu eklenecek
  - `scrap_qty` DB kolonu kullanılmayacak (raporlama gerekirse ileride)
  - Sessizlik algılama eklenmeyecek (üretim gürültüsü riski)
- **Plan revizyonu (3. tur kullanıcı bulgusu):**
  - **Client/server boundary korundu:** Pure helper `mergeFireIntoNote` yeni `src/lib/voice-note-helpers.ts` dosyasında. `voice-service.ts` Anthropic SDK + server env top-level init ediyor (line 8, 14); production page'den value import → bundle leak riski. Çözüm: ayrı pure helper dosyası, voice-service `import type` olarak kalır. **Bundle smoke geçti** — production chunk'larında "Anthropic" yok.
  - **Ctrl+M `isProcessing` race koruması:** Hook'tan dönen `isProcessing` state'i "Ses işleniyor..." sırasında button gizli. Handler `isRecording=false` görüp `startRecording()` çağırırsa ikinci kayıt başlar. Çözüm: `if (isProcessing) return` + `e.repeat` (held-down spam) guard'ları.
  - **Test ayrımı:** Mevcut `production-prefill.test.ts` ile karışmaması için yeni `voice-production-page.test.ts` ayrı dosyada.
- **Implementation:**
  - **`src/lib/voice-note-helpers.ts` (YENİ):** `mergeFireIntoNote(note, fireNotes)` pure helper. Kurallar: boş/dolu kombinasyonlar, orta nokta ayraç (` · `), case-insensitive duplicate guard, whitespace trim.
  - **`production/page.tsx` handleVoiceResult (line 132-142):** `notlar: entry.note || data.sessionNote` → `notlar: mergeFireIntoNote(entry.note || data.sessionNote || "", entry.fireNotes)`. `FormLine` interface DEĞİŞMEDİ.
  - **Ctrl+M `useEffect`:** `document.addEventListener("keydown", ...)` + cleanup. Guard zinciri: `e.ctrlKey + key m/M` → `e.repeat` → `isProcessing` → INPUT/TEXTAREA/SELECT focus → `isDemo` → toggle (start/stop). Cmd+M HANDLE EDİLMEZ (macOS pencere minimize sistem-wide shortcut'u).
  - **Mikrofon button title hint:** "Klavyeden Ctrl+M ile de başlatabilirsiniz" (a11y + keşfedilebilirlik).
- **+20 yeni test:**
  - `voice-note-helpers.test.ts` (7): boş kombinasyonlar (3), concat + whitespace trim (2), case-insensitive duplicate guard (2)
  - `voice-production-page.test.ts` (13): import boundary (mergeFireIntoNote @/lib/voice-note-helpers'tan + VoiceProductionEntry type-only + value-import yok regex), handleVoiceResult mergeFireIntoNote call, Ctrl+M guard'lar (addEventListener+removeEventListener pair, e.ctrlKey + e.key m/M, e.repeat, isProcessing, INPUT/TEXTAREA/SELECT, isDemo, e.metaKey handle edilmiyor), title hint
- 4 dosya (1 yeni helper + 1 yeni helper test + 1 yeni UI test + production page edit) · **3657 test yeşil** (önceki 3637 + 20) · TS clean · 0 yeni lint warning · build OK · **bundle leak yok** (production chunk'larında Anthropic geçmiyor)
- **Sıradaki:**
  1. Push + Coolify redeploy + manuel smoke (Ctrl+M davranışı + fire notlar entegrasyonu + V2 regression check)
  2. Memory'deki bekleyenler: SMTP production deploy (Migration 047 + Resend DNS + Coolify env), Faz 12 Paraşüt Sandbox

**Önceki:** React Doctor only-export-components ×22 fix (2026-05-28; 3637 test, skor 56 → 57, commit `dd53b36`)

- **Trigger:** Önceki commit'lerde "kapatıldı" denilen `only-export-components` ×23 hâlâ baseline'daydı — 22 re-export satırı (`export { X } from "@/lib/..."`) kuralı tetikliyordu. Önceki Bölüm 4 commit'inden sonra son temizlik.
- **Strateji:** Backward-compat re-export pattern'i söküldü. 9 test dosyasının import path'i doğrudan helper'lara yönlendirildi → component dosyalarındaki `export { ... } from` satırları kaldırıldı (internal `import` korundu).
- **Etki:**
  - 8 component dosyası: `DropZone`, `ClassifierQueue`, `ExtractionReview`, `Pagination`, `StockDataGrid`, `data-context`, `PurchaseOrderDocument`, `QuoteDocument` — re-export'lar uçtu
  - 9 test dosyası: `validateClassifyUpload`, `classifier-queue`, `extraction-review-helpers`, `pagination-component`, `purchase-order-document`, `quote-document-faz4c`, `customer-update-mapping`, `stock-data-grid-limit`, `dropzone-component` — helper'a yönlendirildi
  - `pagination-component` module-load testi 2'ye bölündü (component default + helper named export ayrı assertion)
  - `dropzone-component` + `stock-data-grid-limit` source-regex'leri helper file pattern'ine yönlendirildi
- **only-export-components: 22 → 0 (HEPSİ KAPANDI).** React Doctor full scan'de artık `only-export-components` errors yok.
- 17 dosya · **3637 test yeşil · TS clean · 0 yeni warning**
- **Skor toplam:** 51 (baseline) → 54 (Bölüm 1+2+3+5) → 56 (Bölüm 4 + OAuth fix) → 57 (re-export temizlik) = +6 toplam
- **Sıradaki:**
  1. Push + Coolify redeploy + smoke (görsel kontrol)
  2. Kalan ~50 `no-inline-exhaustive-style` (alerts drawer body + suggested table/drawer enrichment) — ayrı PR
  3. `react-hooks/set-state-in-effect` ×32 error — plan dışı; ayrı tur'da değerlendirilir (kullanıcı kararı)

**Önceki:** React Doctor Bölüm 4 — inline style extract + OAuth disable fix (2026-05-28; 3636 test, skor 54 → 56, commit `11fad03`)

- **Trigger:** Plan `mellow-plotting-ladybug.md` Bölüm 4 (no-inline-exhaustive-style ×301 — alerts 42 + suggested 23 = 65 blok hedef) + kullanıcı doğrulamasıyla ortaya çıkan baseline hatası: önceki commit'teki `// eslint-disable-next-line react-doctor/...` yorumu react-doctor tarafından **algılanmıyordu** (kendi sözdizimi: `// react-doctor-disable-next-line`).
- **OAuth disable directive fix (Bölüm 1 düzeltme):** `src/app/api/parasut/oauth/callback/route.ts` — disable yorumu `.upsert()` üstünden `export async function GET` öncesine taşındı + doğru sözdizimi (`// react-doctor-disable-next-line react-doctor/nextjs-no-side-effect-in-get-handler`). `nextjs-no-side-effect-in-get-handler` error kapandı (skor 54 → 56).
- **Önceki memory yanıltıcı düzeltildi:** Önceki commit'te "Bölüm 1+2 error'ları kapatıldı" yazıldı ama full scan hâlâ **23 error gösteriyordu** (22 only-export-components re-export + 1 OAuth). only-export-components ×22 hâlâ aktif — 7 dosyada `export { X } from "@/lib/..."` re-export pattern'ı kuralı tetikliyor. Çözüm: test'lerin import path'lerini helper'a yönlendirmek + re-export silmek (sonraki PR).
- **Bölüm 4 inline style refactor (alerts/page.tsx + suggested/page.tsx):**
  - alerts/page.tsx: 130+ module-level const eklendi (header butonlar, tabs, AI panel, drawer, alertRow, systemAlert, orderAlertSmall, severity badge). Pilot 2 (`tabButtonBaseStyle` spread Yol A) validation'da doğrulandı — conditional için spread pattern kullanıldı. AlertDetailDrawer body bölümü 200+ satır olduğu için bu tura sığmadı, sonraki tura.
  - suggested/page.tsx: 8 statik const + `AI_SIGNAL_BUTTON_STYLES` lookup map (AiSignalButton 3-urgency variant — helper fn DEĞİL, lookup map: critical/high/moderate 3 tam obje). C2/C3 büyük table/drawer blokları sonraki tura.
  - **no-inline-exhaustive-style: 301 → 271 (-30 uyarı, ~%10).** Hedef 65 idi ama 30 da anlamlı başlangıç; kalan ~50 nokta drawer body + suggested mobile card/desktop row/AI drawer enrichment.
- **Helper fn tuzağı dokümante edildi (plan §2):** `getX(args)` her render'da yeni `{...}` üretir, kuralı kandırır ama gerçek perf sorununu çözmez. Doğru pattern lookup map (`Record<Variant, React.CSSProperties>`). Plan'da pattern karar matrisi var.
- **3 dosya değişti** (OAuth + 2 page) · **3636 test yeşil · TS clean · 0 yeni lint warning · görsel regression beklenmiyor** (style değerleri aynı, sadece konum).
- **Sıradaki:**
  1. Push + Coolify redeploy + smoke (OAuth callback davranışı + alerts/suggested görsel kontrol)
  2. Sonraki tur: kalan ~50 inline style block (alerts drawer body + suggested table/drawer enrichment)
  3. Ayrıca: only-export-components ×22 fix — re-export'ları sil, test import path'lerini helper'a yönlendir

**Önceki:** React Doctor temizlik — error'lar + a11y + config (2026-05-27; 3636 test, skor 51 → 54, commit `e57361c`)

- **Trigger:** `npx react-doctor@latest` 51/100 skor + 1812 sorun. Plan `mellow-plotting-ladybug.md` 4 bölümlü temizlik.
- **Bölüm 2 — `only-export-components` ×23 kapatıldı (önceki session extract + bu session test fix + commit):**
  - 7 yeni helper dosya: `import-file-helpers.ts`, `classifier-helpers.ts`, `extraction-review-helpers.ts`, `po-document-helpers.ts`, `customer-helpers.ts`, `quote-document-helpers.ts`, `pagination-helpers.ts`.
  - 5 component'te non-component export'lar helper'lara taşındı + backward-compat re-export pattern (component içinde `import` + dış API için `export`).
  - 3 test güncellendi (`stock-data-grid-limit`, `dropzone-component`, `quotes-faz4a-helper-mapper`) — source-regex'ler re-export pattern + helper file'a yönlendirildi.
  - Fast Refresh artık 5 dosyada aktif (kaydet → tam remount yok).
- **Bölüm 1 — `nextjs-no-side-effect-in-get-handler` ×1 disable + gerekçe:** OAuth callback (`/api/parasut/oauth/callback`) GET handler içinde `.upsert()` çalışıyor — Paraşüt provider GET çağırıyor (POST imkânsız, endüstri standardı). Mevcut signed state cookie CSRF korur. `.upsert()` öncesi `eslint-disable-next-line react-doctor/nextjs-no-side-effect-in-get-handler` + yorum.
- **Bölüm 3 — `no-outline-none` ×29 (plan 19, gerçek 29):** `globals.css`'e global `input:focus-visible / select:focus-visible / textarea:focus-visible / button:focus-visible` ring (`outline: 2px solid var(--accent)`, `outline-offset: 1px`). 29 callsite'tan `outline: "none"` satır/inline kısımları sed ile temizlendi. A11y ring tek noktada — klavye Tab navigasyonunda görünür, mouse tıklama browser tarafından bastırılır (`:focus-visible` semantiği).
- **Bölüm 5 — Config sessizleştirme:** Yeni `react-doctor.config.json` kök dizinde:
  - `react-doctor/no-tiny-text` (434 occurrence) — PDF/print kasıtlı küçük font (QuoteDocument, PurchaseOrderDocument)
  - `react-doctor/no-giant-component` (32) — alerts/settings ERP sayfaları kasıtlı büyük, domain gereği
  - `react-doctor/prefer-useReducer` (29) — useState doğru tercih, fikir meselesi
  - `react-doctor/no-fetch-in-effect` (20) — SWR/React Query yok (CLAUDE.md proje sözleşmesi)
  - **Toplam 515 uyarı config'le bastırıldı.**
- **Bölüm 4 — `no-inline-exhaustive-style` ×301 ERTELENDİ:** alerts/page.tsx (42) + suggested/page.tsx (23) = 65 inline style block extract iş büyük + manuel + JSX context bağımlı. Skor etkisi tahminen +5 ama risk yüksek. Sonraki tura.
- **Yeni:** `.github/workflows/react-doctor.yml` (her PR otomatik tarama), `package.json` `"doctor": "npx react-doctor@latest"` script + `react-doctor@^0.2.9` dev dep.
- **45 dosya · 3636 test yeşil · TS clean · 0 yeni warning · skor 51 → 54** (33 mevcut `react-hooks/set-state-in-effect` error'ları plan dışı).
- **Sıradaki:**
  1. Coolify redeploy + smoke (OAuth callback davranışı korunmuş mu, focus ring tüm form alanlarında görünür mü)
  2. Bölüm 4 ayrı PR — alerts/page.tsx + suggested/page.tsx inline style → module-level const (65 block)
  3. Sonra kalan ~236 `no-inline-exhaustive-style` (diğer dosyalar, üçüncü tur)

**Önceki:** UX iyileştirme — sipariş adlandırma + dashboard stok widget limit (2026-05-27; 3636 test)

- **İki küçük UX problemi kapatıldı:**
  1. **Sipariş adları çakışıyordu:** Sidebar'da `/dashboard/orders` ve `/dashboard/purchase/orders` ikisi de "Siparişler" → kullanıcı sadece grup başlığından ayırıyordu. ERP norm (Sales Orders vs Purchase Orders) uygulandı.
  2. **Dashboard stok widget sınırsız:** `StockDataGrid` tüm aktif ürünleri gösteriyordu → PMT prod'unda 100+ ürün olunca dashboard scroll patlardı.
- **Sipariş adları:**
  - **Sidebar.tsx**: "Siparişler" → "Satış Siparişleri" (Operasyon) + "Satın Alma Siparişleri" (Satın Alma).
  - **`/dashboard/orders/page.tsx`**: div → h1 "Satış Siparişleri" + `useEffect document.title = "Satış Siparişleri · KokpitERP"` (browser tab).
  - **`/dashboard/purchase/orders/page.tsx`**: h1 zaten "Satın Alma Siparişleri"ydi, sadece document.title eklendi.
- **StockDataGrid (`src/components/dashboard/StockDataGrid.tsx`):**
  - Yeni opsiyonel prop: `limit?: number` + `showViewAllLink?: boolean`.
  - Yeni export `sortByStockPriority(products)` — tükendi → kritik → düşük → hazır, aynı status içinde available/min oranı ascending. **Dashboard'da en kritik 15 ürün** anlamlı (alfabetik 15 değil).
  - `filtered.slice(0, limit)` ile sınırlama, tablo altına Link "Tümünü gör (N) →" `/dashboard/products`'a yönlendirir (zaten 50/sayfa pagination + filtre + arama hazır).
  - **Backward-compat:** limit undefined → tüm filtered render (mevcut diğer kullanım yerleri etkilenmez); limit varsa sortByStockPriority uygulanır, yoksa eski mantık korunur.
  - Dashboard page'de `<StockDataGrid limit={15} showViewAllLink ... />`.
- **+22 yeni test:**
  - `stock-data-grid-limit.test.ts` (12): sortByStockPriority priority order + aynı status oran sort + immutable + boş array + minStockLevel=0 + source-regex (limit/showViewAllLink prop, slice, hasMore, Link, named export, backward-compat).
  - `sidebar-order-labels.test.ts` (3): "Satış Siparişleri" + /dashboard/orders pair, "Satın Alma Siparişleri" + /dashboard/purchase/orders pair, eski generic "Siparişler"+href YOK (regression).
  - `orders-page-title.test.ts` (5): /dashboard/orders h1 "Satış Siparişleri" + document.title + eski div başlığı YOK; /dashboard/purchase/orders h1 + document.title.
- **Mevcut test güncellemesi:** `purchase-orders-ui.test.ts` Sidebar label assertion "Siparişler" → "Satın Alma Siparişleri".
- 8 dosya (1 Sidebar + 2 sipariş page + 1 StockDataGrid + 1 dashboard page + 3 yeni test + 1 mevcut test update) · **3636 test yeşil** (önceki 3614 + 22) · TS clean · 0 lint warning · build OK (`ƒ Proxy (Middleware)` korundu)
- **Sıradaki — kullanıcı:** Coolify redeploy + UI smoke (sidebar "Satış Siparişleri" + "Satın Alma Siparişleri" görmeli, dashboard'da en fazla 15 ürün + "Tümünü gör" linki tıklayınca /dashboard/products'a gitmeli, browser tab başlığı doğru).

**Önceki:** AI rate limit advisor refinement — request-ip extract + limit 10 + 429 frontend (2026-05-26; 3614 test)

- **Trigger:** Önceki commit `c92ff9f` (route-level AI guard) deploy edildi, kullanıcı UI'da "AI önerisi oluşturulamadı" sarı banner gördü. Tanı: purchase-copilot 5/dk limiti sayfa açılışı + auto-reload + manuel yenile toplamında pratikte aşılıyordu; frontend 429'u generic "AI başarısız" olarak yutuyordu (yanıltıcı).
- **Advisor 3 düzeltme + kullanıcı keşfi 1 ek fix:**
  - **P3 — Redis bağımsızlık:** `extractClientIp` `src/lib/rate-limit.ts`'ten yeni `src/lib/request-ip.ts`'e taşındı. `rate-limit.ts` re-export ile backward-compat (proxy.ts + mevcut testler kırılmaz). `ai-route-limit.ts` artık `request-ip`'ten import — `ioredis`/`rate-limiter-flexible` runtime bağımlılığı yok. Upstash refactor'da `rate-limit.ts` silinse bile bu helper kalır.
  - **P3 — Validation öncesi guard:** `score` + `parse` route'larında guard `safeParseJson` + field validation sonrasına taşındı (kötü JSON / eksik body AI kotasını tüketmesin — semantik temizlik).
  - **P2 — Smoke test düzeltme:** Plan'da `/api/ai/score` auth'suz curl yanlış tarif edilmişti — proxy auth gate altında 401 alır, guard tetiklenmez. Authenticated session veya purchase-copilot (route-içi auth) ile UI'dan test edilmeli (memory'de belgelendi).
  - **Yeni fix — purchase-copilot limit 5→10 + frontend 429 handling:** Limit artırıldı + `aiRateLimited` state + spesifik banner ("AI istek limiti aşıldı. Lütfen yaklaşık X saniye bekleyip tekrar deneyin"). loadAiData 429 dalı eklendi (`res.status === 429` → setAiRateLimited, generic aiError set etmez). UI iki banner birden göstermesin diye `!aiRateLimited` koşulu mevcut aiError banner'ına eklendi.
- **+7 yeni test** (`request-ip.test.ts`): XFF zincir ilki, single IP trim, x-real-ip fallback, default 0.0.0.0, re-export aynı fn, request-ip.ts varlığı, ai-route-limit.ts redis bağımsız import + negatif assertion. integration test güncellendi: purchase-copilot limit 10.
- 10 dosya (1 yeni helper + 1 yeni test + 1 source-regex test güncel + 3 AI route düzenleme + 1 frontend page + 1 rate-limit re-export + 2 memory + CLAUDE.md) · **3614 test yeşil** (önceki 3606 + 8) · TS clean · 0 lint warning · build OK
- **Sıradaki — kullanıcı:** (1) Coolify redeploy + UI smoke (auth'lı dashboard → /dashboard/purchase/suggested → "↻ Yenile" 11 kez bas → 11. tıklamada artık spesifik "AI istek limiti aşıldı" banner görmeli — generic değil), (2) 1-2 hafta sonra Upstash REST migration ayrı PR.

**Önceki:** Route-level AI rate limit — Anthropic fatura amplifikasyonu koruması (2026-05-26; 3606 test)

- **Bağlam:** M-3 global Redis rate limit Coolify Docker network sorunlarıyla çıkmazda. REDIS_URL unset → fail-open path stabil. Kullanıcı kararı: A (Redis disable) + route-level AI guard (defense-in-depth). Upstash REST refactor 1-2 hafta sonra ayrı PR.
- **Tasarım kararı:** Guard MIDDLEWARE'de DEĞİL ROUTE içinde. Next 16 Turbopack proxy convention P0 bug'ından öğrenildi — route-içi guard middleware bypass olsa bile AI faturası korunur.
- **Yeni helper** `src/lib/ai-route-limit.ts`: `checkAiRateLimit(route, ip, limit=5)` pure rolling window 60sn + `guardAiRoute(request, route, limit)` NextResponse|null. Map cleanup amortize 5dk'da bir. 429 response: `Retry-After` + `X-RateLimit-*` header. `extractClientIp` reuse `@/lib/rate-limit`.
- **5 AI route entegrasyon (2-3 satır):** purchase-copilot 5/dk (POST `if (request)` backward-compat), stock-risk 5/dk (POST `request?` opsiyonel), parse 10/dk (import wizard çoklu), ops-summary 5/dk (POST `request?`), score 5/dk. **observability guard YOK** (Anthropic çağrısı yok).
- **purchase-copilot-auth.test.ts** `beforeEach` `__resetAiRateLimitForTests()` çağrısı eklendi (mock req'lerde x-forwarded-for yok → 0.0.0.0 IP'sinde 6. test 429 alıyordu).
- **Tehdit modeli (M-3 statüsü):** login (Supabase GoTrue), parasut sync (CRON_PATHS Bearer), products scrape (auth gate 401), demo mutation (403) — hepsi kapalı; **AI cost** bu PR ile kapatıldı. Memory: M-3 `✅ TAMAMLANDI` değil `🟡 AI cost mitigated / global Redis deferred`.
- **Single-container best-effort:** Map restart'ta sıfırlanır (Coolify rolling deploy = 5 yeni istek, pratikte sınırlı). Multi-instance scale-up Upstash refactor'u zorunlu yapar.
- **+25 yeni test:** `ai-route-limit.test.ts` (10): rolling window, 5+1=429, fake timer 61sn → ok, IP izolasyon, route izolasyon, cleanup Map.size, guardAiRoute null/429+headers, reset. `ai-route-limit-integration.test.ts` (15): 5 route'ta import/çağrı/limit/erken çıkış pattern + observability yokluğu.
- 8 dosya (1 source + 5 route + 2 test + 1 mevcut test reset + 3 memory) · **3606 test yeşil** (önceki 3581 + 25) · TS clean · 0 lint warning · build OK (`ƒ Proxy (Middleware)` korundu)
- **Sıradaki — kullanıcı tarafı:** (1) Coolify redeploy + smoke `for i in 1..6; curl /api/ai/score; done` → 6. 429 + auth/cron invariant doğrulama (/api/products 401, /api/parasut/sync-all 401), (2) 1-2 hafta sonra Upstash REST migration (`@upstash/redis` + `@upstash/ratelimit`, Docker networking yok, Coolify env tek tıkla). Route-level AI guard Upstash refactor'da KORUNUR (defense-in-depth).

**Önceki:** M-3 Rate Limiting Resilience fix — production outage (2026-05-26; 3581 test)

- **P0 Production outage:** Coolify deploy sonrası ERP container Redis Resource'a `connect ETIMEDOUT` — Docker network izolasyonu. Önceki ioredis options (`enableOfflineQueue:true`, `maxRetriesPerRequest:1`, `connectTimeout:3000`) her isteğe ~6s bloke ekliyordu → kullanıcı login OLAMIYORDU, OAuth refresh `Invalid Refresh Token` hataları. **Kök problem:** `rateLimitCheck` Redis kopukken kullanıcıyı bekletiyor. Aşamalı plan: (1) Acil unblock REDIS_URL env sil + redeploy → fail-open path, (2) Kalıcı kod resilience fix, (3) Uzun vadeli backend kararı (A disable / B Coolify network fix / C Upstash / D Cloudflare WAF) — kullanıcı seçimi pending.
- **Aşama 2 — Resilience fix:**
  - **ioredis options:** `enableOfflineQueue:false` + `maxRetriesPerRequest:0` (fail fast) + `connectTimeout:1500` + `lazyConnect:true` + fire-and-forget `_client.connect().catch(log)` + `retryStrategy:()=>null` (ioredis kendi reconnect denemesin, circuit breaker yönetir).
  - **Module-level circuit breaker:** `HARD_TIMEOUT_MS=200`, `CIRCUIT_OPEN_THRESHOLD=3`, `CIRCUIT_OPEN_DURATION_MS=30_000`. `_consecutiveFailures` + `_circuitOpenedAt` state. `isCircuitOpen()` erken return (Redis'e dokunmaz). `recordFailure` — counter++ + threshold'da console.error + timestamp YENİLE (probe fail timer reset eder). `recordSuccess` — counter sıfırla + circuit kapatma log. 429 (RateLimiterRes) `recordSuccess` sayar.
  - **Promise.race + hard timeout:** `setTimeout(()=>resolve(TIMEOUT_SENTINEL), 200)` ile yarış. Hanging consume için `.catch(()=>{})` no-op (unhandled rejection bastırma). `finally clearTimeout` (memory leak yok).
  - **Test-only export:** `__resetCircuitForTests` — test izolasyon.
- **Performans bütçesi:** Redis sağlıklı <5ms, circuit open <1ms, circuit closed+Redis kopuk <200ms (HARD_TIMEOUT_MS).
- **+6 yeni regression test** (`rate-limit-helper.test.ts`): (1) hard timeout fail-open gerçek elapsed 195-300ms ölçümü, (2) 3 fail → OPEN → 4. çağrı consume hiç çağrılmaz + circuit OPEN log, (3) OPEN+30sn sonra probe başarılı → CLOSE + console.info "circuit CLOSED", (4) probe BAŞARISIZ → timestamp yenilenir (10sn sonra hâlâ OPEN), (5) 429 RateLimiterRes recordSuccess sayar (counter reset, 4. fail circuit açmaz), (6) `finally clearTimeout` source-regex regression lock. Mock güncellemesi: `MockRedis.connect()` Promise.resolve eklendi (lazyConnect pattern için), `beforeEach` `__resetCircuitForTests()` çağrısı.
- **In-memory state notu:** Tek Next.js process içinde paylaşılır. Multi-instance scale-up'ta her instance ayrı circuit (3 instance × 3 fail = 9 timeout, her biri 200ms ile sınırlı). Mevcut single-instance Coolify için yeterli.
- 3 dosya (1 source [src/lib/rate-limit.ts ~+80 satır] + 1 test [+6 test + reset + MockRedis.connect] + 1 memory [project_security.md]) · **3581 test yeşil** (önceki 3575 + 6) · TS clean · 0 lint warning · build OK (`ƒ Proxy (Middleware)` manifest entry korundu)
- **Sıradaki — kullanıcı kararı (Aşama 3 Redis backend):**
  - **A — Disable:** REDIS_URL hiç set edilmez. Audit M-3 reopens ama Supabase GoTrue brute-force koruması + Hetzner firewall yeterli interim. 0 iş.
  - **B — Coolify network fix:** Redis Ports Mappings 6379 + REDIS_URL `redis://default:PASS@172.17.0.1:6379` (Docker bridge gateway). Hetzner Cloud Firewall'dan dış IP'ler kapatılmalı. Gateway IP doğru olmazsa `.18`/`.19`/server public IP dene.
  - **C — Upstash REST:** `ioredis` → `@upstash/redis` + `@upstash/ratelimit`. Docker networking yok. Code refactor 2-4 saat.
  - **D — Cloudflare WAF veya Traefik native:** Application code'dan tamamen ayır.

**Önceki:** M-3 Rate Limiting Review 2 — P0 production pipeline fix (2026-05-25; 3575 test)

- **P0 Bulgu (kullanıcı production smoke):** Review 1 commit'i sonrası tüm testler/build yeşil, ama production HTTP smoke kanıtları middleware'in HİÇ ÇAĞRILMADIĞINI gösterdi:
  - `.next/server/middleware-manifest.json` ve `.next/server/functions-config-manifest.json` boş (`functions: {}`)
  - GET /dashboard auth'suz `200` (login redirect olmalıydı)
  - GET /api/products auth'suz route handler'a kadar gitti (`401` değil)
  - POST /api/parasut/sync-all Bearer'sız `200` (CRON_SECRET 401 olmalıydı)
  - GET /api/auth/demo response'unda `X-RateLimit-*` header yok
  
  **Yani M-3 rate limit + auth gate + CRON gate + demo gate hepsi production'da bypass oluyordu.** Vitest/build yeşil olması yeterli güvence değildi — middleware fonksiyonunu direkt import edip çağırıyorlardı, gerçek Next.js request pipeline'ı test edilmemişti.
- **Tanı (Next 16 source incelendi):** `node_modules/next/dist/build/index.js:1535` build sırasında şu koşulu çalıştırır: `if (staticInfo.runtime === 'nodejs' || isProxyFile(page)) { functionsConfigManifest.functions['/_middleware'] = {...} }`. Bizim denemeler:
  - `middleware.ts` + `config = { runtime: "nodejs", matcher: [...] }` → Turbopack `getStaticInfoIncludingLayouts` runtime'ı parse etmedi
  - `middleware.ts` + top-level `export const runtime = "nodejs"` → aynı sonuç
  - `next.config.ts` `experimental.nodeMiddleware: true` → Next 16 `ExperimentalConfig` type'ında yok (artık değil)
  - `npx next build --webpack` → ayrı TS hatası (purchase-copilot route NextRequest|undefined), scope dışı
  
  **Anahtar bulgu:** Next 16 yeni **`PROXY_FILENAME = 'proxy'`** convention'ı tanıttı (`node_modules/next/dist/lib/constants.js`). `build/utils.js:1157` `isProxyFile()` proxy.ts'leri otomatik Node runtime'a alır, runtime export gerekmez. Build hatası: "Ensure this file has either a default or 'proxy' function export. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy" — yani middleware → proxy migration documented bir Next 16 değişikliği.
- **Çözüm — 2 önemli ayrıntı:**
  1. **Root-level `proxy.ts` Turbopack tarafından discover edilmedi** (functions-config-manifest yine boş kaldı). `src/proxy.ts` zorunlu — `node_modules/next/dist/build/index.js:589` discovery code'u `isAtConventionLevel = normalizedFileDir === '/' || normalizedFileDir === '/src'` der ama Turbopack pratikte sadece `src/` altını parse etti. Next 16 Turbopack için undocumented detay.
  2. **Function adı `proxy` olmalı.** `export async function middleware(...)` tanınmaz. Backward-compat için `export const middleware = proxy` alias eklendi → 4 mevcut middleware test dosyası import path'ini sadece `from "../proxy"` olarak güncelledi, davranış değişmedi.
- **Build doğrulama:** Yeni build log'u `ƒ Proxy (Middleware)` satırı içeriyor. `cat .next/server/functions-config-manifest.json` → `{"functions": {"/_middleware": {"runtime": "nodejs", "matchers": [{...regexp...}]}}}` — middleware Next runtime tarafından kaydedildi.
- **+6 regression test** (`proxy-build-manifest.test.ts`): src/proxy.ts varlığı + root middleware.ts yok + `export async function proxy(...)` pattern + `export const middleware = proxy` alias + config.matcher + post-build manifest assertion (functions-config-manifest.json /_middleware entry runtime nodejs). Build sonrası testte assertion otomatik kontrol edilir — gelecek bir Next upgrade'i bu pipeline'ı kırarsa CI yakalar.
- **Mevcut test importları güncel:** `demo-mode-middleware.test.ts`, `middleware-rate-limit.test.ts`, `middleware-auth.test.ts` → `from "../proxy"` (alias sayesinde davranış sözleşmesi aynı). `product-attachments-demo-guard.test.ts` source-regex `middleware.ts` → `src/proxy.ts` path update.
- **next.config.ts** rollback: `experimental.nodeMiddleware: true` denenmişti, Next 16 type'ında yok — geri alındı.
- 8 dosya değişen (1 source rename src/proxy.ts, 1 next.config rollback, 4 test import path, 1 source-regex path, 1 yeni regression test) · **3575 test yeşil** (önceki 3569 + 6 regression) · TS clean · 0 lint warning · build OK + manifest dolu
- **Sıradaki — kullanıcı tarafı deploy (artık gerçekten işlenir):**
  1. Coolify panel → New Resource → Database → Redis 7.x → `kokpit-redis`
  2. ERP project → Environment Variables → `REDIS_URL` doğrula
  3. Deploy
  4. Smoke:
     ```bash
     for i in {1..6}; do curl -I https://erp.getmedspace.com/api/auth/demo; done
     # 6. denemede HTTP/2 429 görmeli
     curl -I https://erp.getmedspace.com/api/health  # 200 (bypass)
     curl -I https://erp.getmedspace.com/dashboard   # 307 → /login (auth gate çalışıyor)
     curl -I https://erp.getmedspace.com/api/products  # 401 (anon gate)
     ```

**Önceki:** M-3 Rate Limiting Review 1 — 6 bulgu kapatma (2026-05-25; 3569 test)

- **P1 (Edge runtime risk):** Next 16 middleware default Edge runtime; `ioredis` TCP socket'i Edge'de çalışmaz. Build geçer ama runtime'da bağlantı patlardı. **Fix:** `middleware.ts` `export const config = { matcher: ..., runtime: "nodejs" }`. Build doğrulandı, ƒ Proxy (Middleware) Node runtime'da derlendi.
- **P1 (Login dead-code dokümante):** Login akışı `src/app/login/page.tsx:21` client-side Supabase SDK `signInWithPassword({email, password})` → middleware görmez, rate-limit kapsamı dışında. **Karar:** LOGIN policy `POLICIES` map'inde korundu + JSDoc + memory not (şu an effective değil, `/api/auth/login` server route veya server action eklenirse otomatik aktif olur — `selectPolicy("/login", "POST", ...)` zaten LOGIN döner). Brute-force koruması şu an Supabase GoTrue'nun built-in rate limit'inde (POST /auth/v1/token). Test eklendi (`selectPolicy` invariant).
- **P2 (Demo test POST→GET):** `/api/auth/demo` gerçek akışı GET (route handler `route.ts:10` GET-only, `DemoButton.tsx:16` `<Link href="/api/auth/demo">`). Eski test POST'tu — gerçek abuse yüzeyini ölçmüyordu. **Fix:** test method GET, smoke komutu güncel (`curl -I /api/auth/demo` × 6 → 6. 429).
- **P2 (Demo dashboard auto-reload 429 riski):** Demo mode `demo_mode=1` cookie, Supabase auth cookie yok → eski mantık API_ANON (30/dk) seçerdi. Dashboard auto-reload (alerts 60s, purchase 60s, vb. + sayfa-yükleme 5-10 endpoint) 1-2 dk sonra demo kullanıcısı yanlışlıkla 429 görebilirdi. **Fix:** middleware'de `isSessionLike = hasAuthCookie || hasDemoCookie` → demo da API_AUTH (300/dk) limit alır. Demo SESSION YARATMA (`/api/auth/demo`) yine DEMO policy'de (5/15dk) kalır — bu doğru kapsam çünkü abuse vector cookie yaratma olayı.
- **P2 (`withRateHeaders` helper):** İlk implementation rate-limit success header'larını yalnız `supabaseResponse` (auth gate başarı dalı) ve 429 response'ta set ediyordu; ALWAYS_PUBLIC bypass `NextResponse.next()`, demo gate, anon 401, redirect path'leri X-RateLimit-* alır almazdı. **Fix:** `withRateHeaders(response, rate)` helper — tüm rate-limit'ten geçmiş response'ları sarar (8 callsite). Test +2 (ALWAYS_PUBLIC bypass + anon 401 header coverage).
- **P3 (PARASUT_SYNC dead-code dokümante):** `/api/parasut/sync-all` middleware'de CRON_PATHS listesinde (sadece CRON_SECRET Bearer ile erişilir). UI `dashboard/parasut/page.tsx:161` `runSync` handler POST atıyor — şu an 401 alıyor olmalı (mevcut UX bug, M-3 ile ilgisiz, ayrı tur). **Karar:** PARASUT_SYNC policy `POLICIES` map'inde korundu + JSDoc dead-code notu. UI flow CRON_PATHS'ten çıkarılıp authenticated user için açılırsa `selectPolicy` zaten PARASUT_SYNC döner (30/dk).
- **+4 regression test** (`middleware-rate-limit.test.ts`): (1) demo_mode=1 → API_AUTH policy, (2) ALWAYS_PUBLIC bypass response X-RateLimit-* var, (3) anon /api/products 401 response X-RateLimit-* var, (4) LOGIN policy `selectPolicy("/login","POST",false)` invariant.
- **Smoke komutu güncellendi:** `for i in {1..6}; do curl -I https://erp.getmedspace.com/api/auth/demo; done` → 6. denemede 429 + `Retry-After: 900`. (Eski `POST /login` komutu kaldırıldı — login client-side SDK, middleware görmez.)
- 5 dosya (middleware.ts + src/lib/rate-limit.ts JSDoc + middleware-rate-limit.test.ts + 2 memory) · **3569 test yeşil** (önceki 3565 + 4 yeni regression) · TS clean · 0 lint warning · build OK (middleware Node runtime'da derlendi)
- **Sıradaki:** Coolify deploy + smoke (kullanıcı tarafı). Sonra: kullanıcı kararı.

**Önceki:** M-3 Rate Limiting — Coolify self-hosted Redis (2026-05-25; 3565 test)

- **Audit bulgu** (`memory/project_security.md:89`): M-3 Rate limiting Vercel'de built-in DDoS koruması nedeniyle ertelenmişti. 2026-05-13'te Coolify cutover sonrası Vercel platform katmanı yok → öncelik yükseldi. Saldırı yüzeyleri: login brute-force, demo abuse, AI cost amplification (Anthropic faturası), Paraşüt manuel sync, /api/products scrape.
- **Karar (Yaklaşım B):** Coolify Resource olarak self-hosted Redis kur (sıfır ek hosting maliyeti, same-VPS low latency, vendor-lock yok, code portable). Backend: `ioredis` (production Node.js Redis client) + `rate-limiter-flexible` (sliding window, atomic Lua scripts, mature ~1M weekly downloads).
- **Helper** (`src/lib/rate-limit.ts`): Singleton Redis lazy init (REDIS_URL env yoksa null → fail-open). `POLICIES` map:
  - **LOGIN**: 5/15dk + 15dk block — brute-force koruması
  - **DEMO**: 5/15dk — anon demo cookie abuse
  - **AI**: 10/dk — Anthropic cost amplification (kullanıcı "↻ Yenile" spam'i)
  - **PARASUT_SYNC**: 30/dk — manuel sync POST'lar
  - **API_AUTH**: 300/dk — authenticated kullanıcı normal API
  - **API_ANON**: 30/dk — anon read-only
- **`selectPolicy`** pathname + method + auth-cookie hibrit: en spesifik route önce (login/demo/ai/parasut), sonra genel /api/** auth/anon ayrımı. **`extractClientIp`**: Coolify Traefik X-Forwarded-For zinciri (virgül split, ilki client) + x-real-ip fallback + `0.0.0.0` default. **`detectSupabaseAuthCookie`**: `sb-*-auth-token(\.\d+)?` regex (chunked cookie suffix dahil) — getUser maliyetine girmeden hızlı auth proxy. Saldırgan fake cookie atarsa yüksek limit alır ama backend auth check 401 döner → resource consumption hâlâ sınırlı.
- **`rateLimitCheck`**: `consume(key, 1)` → success `{ok:true, remaining, fromRedis:true}`; `RateLimiterRes` throw → `{ok:false, retryAfter:Math.ceil(msBeforeNext/1000), fromRedis:true}`; non-RateLimiterRes throw → fail-open + console.error (Redis disconnect site'ı düşürmesin).
- **Middleware sıralaması** (`middleware.ts`):
  1. `/api/health` → ABSOLUTE bypass (monitoring/UptimeRobot kırılmasın)
  2. CRON_SECRET Bearer + CRON_PATHS → bypass (server-to-server meşru yüksek frekans)
  3. **Rate limit** — auth-cookie hibrit policy, `ip:${ip}` key. 429 → JSON `{error, retryAfter}` + `Retry-After` + `X-RateLimit-Limit/Remaining/Reset` header'lar
  4. ALWAYS_PUBLIC bypass (auth atlatır ama rate limit'ten geçti) — `/api/auth/demo` ve `/api/ai/purchase-copilot` artık rate limit'e tabi (eskiden full bypass'taydı, M-3 ile koruma altına alındı)
  5. CRON path ama SECRET yok → 401 (M-1 invariant korunur)
  6. Mevcut Supabase getUser + demo/auth gate akışı (değişmedi)
- Başarı response'larına `X-RateLimit-Limit` + `X-RateLimit-Remaining` header'lar eklenir (client observability).
- **+26 yeni test:**
  - `rate-limit-helper.test.ts` (+11): `selectPolicy` 5 senaryo + `rateLimitCheck` 5 (consume success, RateLimiterRes throw, multi-key isolation, multi-policy ctor distinct keyPrefix, non-RateLimiterRes fail-open + console.error) + fail-open invariant source-check. Mock paterni: `vi.hoisted` + class-based `MockRateLimiterRedis` (constructor invariant) + `MockRedis` (no-op on() listener).
  - `rate-limit-helpers.test.ts` (+6): `extractClientIp` 3 (xff zinciri + x-real-ip fallback + default 0.0.0.0); `detectSupabaseAuthCookie` 3 (standart `sb-abc-auth-token` + chunked `.0/.1` + diğer cookie'ler false).
  - `middleware-rate-limit.test.ts` (+9): `/api/health` absolute bypass, CRON_SECRET bypass, CRON_PATH 401 (M-1 korunur), `/api/auth/demo` artık rate-limit'te (DEMO policy), `/api/ai/purchase-copilot` AI policy, auth-cookie var → API_AUTH (300/dk + observability header), auth-cookie yok → API_ANON, 429 + Retry-After + auth gate kısa devre, fail-open Redis down → request geçer.
- **Mevcut testler etkilenmedi:** `middleware-auth.test.ts`, `demo-mode-middleware.test.ts`, vb. rate-limit'e header/cookie eklemiyor → mevcut assertion'lar geçer (rate limit fail-open path'inde varsayılan ok=true).
- **Deploy adımları (kullanıcı tarafı):**
  1. Coolify panel → New Resource → Database → Redis 7.x → resource adı `kokpit-redis` (auto password)
  2. Project Environment → `REDIS_URL` auto-inject veya manuel `redis://default:PASSWORD@kokpit-redis:6379`
  3. Redeploy → middleware Redis'e bağlanır
  4. Smoke: `curl -X POST https://erp.getmedspace.com/login -d 'wrong' --repeat 6` → 6. denemede 429 + `Retry-After: 900`; `curl /api/health` → 200 (bypass)
- **Lokal dev:** `docker run -d -p 6379:6379 redis:7-alpine` + `.env.local`'a `REDIS_URL="redis://localhost:6379"`. ENV boş ise rate limiter no-op (fail-open).
- **Plan-domain check:** Audit M-3 ✅ kapanır; `purchase_commitments` + `column_mappings` explicit RLS policy (son audit maddesi) hariç güvenlik audit tamamen kapalı. `feedback_no_silent_deletes` — mevcut middleware behavior'ı silinmedi, yeni guard layer eklendi.
- 6 dosya değişen + 3 yeni test (1 helper + 1 middleware + .env.example + 2 dependency + memory + CLAUDE.md) · **3565 test yeşil** (önceki 3539 + 26) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Coolify deploy + smoke test (kullanıcı tarafı). Sonra: kullanıcı kararı.

**Önceki:** Faz 4c Review 1 — plan wording + label semantik + print CSS coverage (2026-05-25; 3539 test)

- **P2/P3 (Geçerlilik label semantik tutarsızlığı):** `L.validity` label "Geçerlilik Süresi / Validity Period" idi ama data shape `validUntil` Faz 1'den beri ISO tarih (`2026-06-25`); değer `fmtDate(validUntil)` ile `25.06.2026` render ediliyordu — label "Süre" diyorken değer tarih. **Fix:** `L.validity = { tr: "Geçerlilik Tarihi", en: "Valid Until" }` (data semantiğine hizala). Plan §521 örneği "30 GÜN / 30 DAYS" süre tarif eder ama o ayrı feature — `quoteDate`→`validUntil` gün farkı helper Faz 4d'ye. Ayrıca `L.validUntil` ayrı key kaldırıldı (meta row da artık `L.validity` kullanır); konsolide tek source-of-truth, drift önlenir.
- **P3 (Title + QuoteNo wording planla uyumsuz):** Plan §503 PMT brand legal wording: "TEKLİF FORMU / COMMERCIAL OFFER", "Teklif No / Offer No". Kod "TEKLİF | QUOTATION" + "Quote No" kullanıyordu. **Fix:** `L.title = { tr: "TEKLİF FORMU", en: "COMMERCIAL OFFER" }`; `L.quoteNo.en = "Offer No"` (TR aynı). Title band ve meta row otomatik yansır.
- **P3 (Footer "Fabrika" scope kararı):** Plan §527 PMT brand footer 4 etiket (Fabrika | Merkez | Tel | Web), kod 3 (Merkez/HQ + Tel + Web) — `QuoteData.sellerAddr` tek alan, PMT'de tek operasyon adresi yeterli. **Karar:** Plan sapması olarak kabul edildi (kullanıcı onayı). Footer JSX yorumu genişletildi: "Faz 4d tetik kriteri — `sellerFactoryAddr: string` QuoteData genişletmesi + company_settings schema + form UI input alanı eklenirse açılır. Şu anda over-engineering riski nedeniyle bu Faz'a girilmedi". Memory'de scope kararı dokümante.
- **P3 (Gerçek print/PDF render testi):** Vitest `renderToStaticMarkup` HTML kontrolü güçlü ama browser print/screenshot baseline yok. Playwright smoke ayrı altyapı gerekir (preview UI flow + demo seed + viewport config) — bu Review turuna girmedi. **Pragmatik çözüm:** Vitest'te **3 PRINT_CSS yapısal assertion** eklendi: (1) `@page size: A4 portrait` PAGE_CSS'te tanımlı, (2) `#quote-document table tbody tr` için `break-inside: avoid` + `page-break-inside: avoid` (satır sayfa kenarında bölünmesin), (3) kritik section'larda `.doc-no-break` class kullanımı (header/title/meta/terms/notes/signatures = min 5 occurrence). Manuel browser print preview kontrolü kullanıcı checklist'inde (Faz 4c kapanış notu).
- **+5 yeni test** + **4 expected güncellemesi** (label flip etkisi):
  - `quote-document-faz4c.test.ts` (+5): (1) constant — `BILINGUAL_LABELS.validity.tr === "Geçerlilik Tarihi"`, `.en === "Valid Until"`, (2) constant — plan §503 wording: `title.tr === "TEKLİF FORMU"`, `title.en === "COMMERCIAL OFFER"`, `quoteNo.en === "Offer No"`, (3) constant — `L.validUntil` legacy key removed, (4) print CSS @page A4 portrait, (5) print CSS tbody break-inside + page-break-inside avoid, (6) `.doc-no-break` class coverage ≥5. Mevcut 3 testin "Geçerlilik Süresi" / "Validity Period" expected'ları "Geçerlilik Tarihi" / "Valid Until"e güncellendi.
  - `quotes-faz4a-helper-mapper.test.ts` (1 expected update): terms band conditional render testindeki "Geçerlilik Süresi" → "Geçerlilik Tarihi" (Faz 4c label flip sonrası).
- **Plan-domain check:** `feedback_plan_domain_check` — plan §503 (title + offer no) + §521 (validity semantik) hizalandı; §527 (Fabrika footer) açıkça scope karar olarak dokümante. `feedback_no_silent_deletes` — `L.validUntil` key kaldırıldı ama tüm callsite konsolide `L.validity`'ye yönlendirildi (silinmiş değil, tek source'a birleştirildi); davranış değişmedi (label metni semantik fix). Faz 4c sonrası mevcut layout struktur tam korundu.
- 3 dosya (1 source [QuoteDocument.tsx] + 2 test [quote-document-faz4c + quotes-faz4a-helper-mapper]) · **3539 test yeşil** (önceki 3534 + 5 yeni) · TS clean · 0 lint warning · build OK
- **Faz 4 zinciri tam tamamlandı:** 4a → 4a Review → 4b → 4b Review → 4c → 4c Review. **Teklif modülü revize bitti.**
- **Manuel print preview kontrolü (kullanıcı tarafı, kapanış checklist):** Yeni teklif → Preview → "TEKLİF FORMU | COMMERCIAL OFFER" header, lines table "Ürün Kodu" ana / "Product Code" italic alt, Totals "Ara Toplam" + "Subtotal" italic alt, Terms 3-col "Geçerlilik Tarihi / Valid Until" (tarih değer), Notes "NOTLAR & KOŞULLAR / Notes & Terms", Footer "Merkez/HQ: + Tel: + Web:" horizontal liste. Yazdır → A4 portrait sığar, tablo satırları sayfa kenarında bölünmez.
- **Sıradaki:** Kullanıcı kararı — Faz 5 alanı (henüz tanımlanmadı, MODUL_REVIZE_PLAN sona erdi) veya başka bir modülde Bulgular turu.

**Önceki:** Faz 4c — PDF PMT brand template rewrite (final visual) (2026-05-25; 3534 test)

- **Plan §490-546** (MODUL_REVIZE_PLAN.md): `QuoteDocument.tsx` görsel rewrite ile PMT brand template'ine tam uyum. Faz 4 zincirinin son halkası — veri kontratı Faz 4a Review'da kilitliydi (`QuoteData.deliveryMethod/paymentMethod`, `QuoteRow.size`), bu tur yalnız görsel hizalama.
- **`BILINGUAL_LABELS` constant export** (33 label pair): Tüm `{tr, en}` çiftleri tek noktada toplandı. 35+ noktada hard-coded "Müşteri / Customer" stringi → `L.customer.tr` + `L.customer.en` Map lookup. Drift tek noktada yakalanır (bir label silinirse undefined runtime crash; test 1.b coverage). Test edilebilirlik: `import { BILINGUAL_LABELS } from "@/app/dashboard/quotes/components/QuoteDocument"`.
- **TR ana / EN alt italic hierarchy flip:** 10 lines table header (`{tr: "Ürün Kodu", en: "Product Code"}` vb.) + 4 totals (Ara Toplam/Subtotal, KDV/VAT, Toplam Ağırlık/Total Weight, GENEL TOPLAM/GRAND TOTAL) + 2 meta sections (Müşteri/Customer, Teklif Detayları/Quote Details) + 7 meta rows (Firma, İlgili, Telefon, vb.) + 3 terms (Teslimat/Geçerlilik/Ödeme) + notes/signatures/empty-rows ≈ 30 noktada hierarchy flip. Eski: English ana / Türkçe italic alt (yanlış sıra). Yeni: TR ana / EN italic alt (PMT brand standardı, Türkçe müşteri-öncelikli teklif).
- **Terms band — 3-column grid rewrite:** Eski 2-row vertical (`Teslimat Şekli` 1. satır, `Ödeme Şekli` 2. satır; `Geçerlilik` header'da ayrı yerde) → tek conditional section, `grid-template-columns: 1fr 1fr 1fr` (Delivery | Validity | Payment). Conditional: `data.deliveryMethod || data.validUntil || data.paymentMethod` — en az biri dolu ise section render; üçü de boşsa hiç gösterilmez. Boş hücreler "—" placeholder (3-column tutarlılığı için). Validity hücresi `fmtDate(data.validUntil)` ile DD.MM.YYYY. Section başlığı `Teslimat, Geçerlilik & Ödeme / Delivery, Validity & Payment`.
- **Footer band — 2-row fabrika/merkez/tel/web:** Eski 3-span tek satır (sellerName + confidential + validity) → 2-row layout. **Satır 1:** `<strong>Merkez / HQ:</strong>` + `<strong>Tel:</strong>` + `<strong>Web:</strong>` horizontal liste (her biri conditional — alan boşsa hiç render edilmez). **Satır 2:** sellerName (sol) + bilingual confidential mesaj (orta) + validity prefix (sağ). Plan §527 PMT brand 3-line footer'ına yakın; "Fabrika" ayrı alan değil (sellerAddr tek, PMT tek-merkez). İleride factory ayrı alan istenirse Faz 4d.
- **Notes başlık + Signatures hierarchy:** "Notes & Terms / Notlar & Koşullar" → "NOTLAR & KOŞULLAR / Notes & Terms" (TR ana, EN italic suffix). Signatures rol etiketi `sig.role` (English) ana → `sig.roleTr` (Türkçe) ana, `sig.role` italic alt (PMT brand hierarchy).
- **+18 yeni test** (`quote-document-faz4c.test.ts`, Faz 9 PO Document `react-dom/server.renderToStaticMarkup` paterni):
  - **3 BILINGUAL_LABELS constant:** min 30 pair tanımlı + her pair `{tr, en}` non-empty string + PMT brand-critical label coverage (delivery/validity/payment/notes/signatures/termsTitle).
  - **3 TR ana / EN alt hierarchy:** lines table `Ürün Kodu` < `Product Code` index, totals `Ara Toplam` < `Subtotal`, notes `NOTLAR & KOŞULLAR` < `Notes & Terms`.
  - **5 Terms 3-column:** 3 alan dolu → grid + 6 etiket (3TR/3EN) + 3 değer render, yalnız delivery → diğer 2 "—", yalnız validity → fmtDate, üçü boş → section hidden, etiket pair proximity (TR<EN<300 char).
  - **4 Footer band:** sellerAddr → "Merkez/HQ:" prefix, sellerTel → "Tel:" prefix, sellerWeb → "Web:" prefix, 3 alan boş → defansif render (component crash yok, alt satır görünür).
  - **3 Faz 4a Review regression:** empty rows colSpan=10, Size kolonu header bilingual (Ölçü/Size), row.size cell render + fallback.
- **Mevcut Faz 4a Review test güncellemesi** (`quotes-faz4a-helper-mapper.test.ts`): 2 testte regex güncel — conditional `deliveryMethod || paymentMethod` → `deliveryMethod || validUntil || paymentMethod` (yeni 3-col); Size header inline string match → `BILINGUAL_LABELS.size: { tr: "Ölçü" }` Map constant kontrolüne dönüştürüldü (Faz 4c source-of-truth değişimi). Hiçbir test silinmedi, sadece şart güncellendi.
- **Plan-domain check:** `feedback_no_silent_deletes` — hiçbir data field veya conditional render silinmedi; mevcut layout struktur (header band, title band, meta grid, lines table, totals, notes, signatures, footer band) tamamen korundu, yalnız etiket hierarchy + terms visual yapı + footer içerik PMT brand'ine hizalandı. Print CSS (PAGE_CSS, PRINT_CSS, `.doc-brand-bg`, `.doc-zebra-even`, `.doc-no-break`) dokunulmadı — Faz 4a Review'da doğrulanan print breakpoint davranışı korundu. Plan §544 "HS code + weight per line korunur" — 10 kolon kararı sürdü (plan ASCII §508-510 7 kolon görünür ama metinsel detay layout çiziminde yer kısıtı; literal değil, kabul kriterleri authoritative). `feedback_plan_domain_check` — plan §490-546 + Faz 4a Review contract + PMT brand sözleşmesi tutarlı, helper ile doc tek source.
- 3 dosya (1 source rewrite + 1 mevcut test update + 1 yeni test) · **3534 test yeşil** (önceki 3516 + 18 yeni) · TS clean · 0 lint warning · build OK
- **Faz 4 zinciri tamamlandı:** 4a (DB + form) → 4a Review (preview/PDF contract lock + PATCH validation parity) → 4b (auto-build description) → 4b Review (parts-join + dirty Set persist) → 4c (PDF PMT brand template). **Teklif modülü revize tam tamamlandı.**
- **Manuel görsel kontrol (kullanıcı tarafında — UI değişimi):**
  - Yeni teklif aç → form doldur → Preview'a tıkla
  - Header bilingual: "TEKLİF | QUOTATION" (italic English)
  - Lines table: "Ürün Kodu" başlık ana, "Product Code" küçük italic alt
  - Totals: "Ara Toplam" ana + "Subtotal" italic alt
  - Terms 3-column: Delivery | Validity | Payment grid (boş alanlar "—")
  - Notes başlık: "NOTLAR & KOŞULLAR / Notes & Terms"
  - Footer: "Merkez/HQ:", "Tel:", "Web:" horizontal liste
  - Yazdır → A4 portrait sığar, kolon overflow yok
- **Sıradaki:** Kullanıcı kararı — Faz 5 alanı (henüz tanımlanmadı, MODUL_REVIZE_PLAN sona erdi) veya mevcut modüllerde Bulgular turu.

**Önceki:** Faz 4b Review 1 — 3 bulgu kapatma (P2-A, P2-B, P3) (2026-05-25; 3516 test)

- **P2-A (clearAll dirty Set sıfırlamıyor):** `QuoteForm.clearAll()` rows + nextId sıfırlıyordu ama `descDirtyRowIds` Set'i sıfırlamıyordu. Kullanıcı row 1 desc'ini elle düzenleyip "Temizle" der → yeni boş row 1 (`emptyRow(1)`) → ürün seçince eski dirty ID `1` hâlâ Set'te → `handleSelectProduct` auto-build atlanıyordu. **Fix:** `setDescDirtyRowIds(new Set())` çağrısı clearAll'a eklendi.
- **P2-B (refresh sonrası auto-generated desc → manuel sanılma, ticari risk):** localStorage restore tüm non-empty desc'leri dirty kabul ediyordu — kullanıcı ürün A seçip auto-desc geldi → refresh → ürün B seçince A'nın description'ı kalıyordu (yanlış ürün açıklaması teklifte). **Fix:** autoSave `teklif_v3` payload'ına `descDirty: boolean[]` index-aligned persist eder; restore `Array.isArray(saved.descDirty)` ise rebuild eder, yoksa eski payload için backward-compat fallback (non-empty desc → dirty filter). `autoSave` `useCallback` dep array'ine `descDirtyRowIds` eklendi (stale closure önlendi).
- **P3 (plan örneği vs şablon noktalama):** Plan §486 şablonu `{name} {body_material} {pn_class} {end_connection}, {trim_material} TRİM` virgülsüzken §487 örneği `GATE VALVE A105 GÖVDE, CLASS 600 SW, SS TRİM` body_material'dan sonra virgül istiyordu. İlk helper şablona uyup `A105 GÖVDE CLASS 600...` üretiyordu. PMT teklif diline uygun noktalama için **örnek authoritative kabul edildi**. **Fix:** helper literal template substitution'dan **parts-join paterniyle refactor edildi** — `part1 = [name, body].filter(Boolean).join(" ")`, `part2 = [pn, end].filter(Boolean).join(" ")`, `part3 = trim ? "${trim} TRİM" : ""`, sonuç `[parts].filter(Boolean).join(", ")`. Daha temiz, daha test edilebilir, eksik segment otomatik atlanır (noktalama temizliği için ek regex gerekmez). `QUOTE_DESCRIPTION_TEMPLATE` constant doc-only olarak yeni virgül yerleşimine güncellendi. **Plan §486 şablonu örneğe hizalandı** (`{name} {body_material}, {pn_class} {end_connection}, {trim_material} TRİM`) + per-row dirty Set localStorage persist notu eklendi.
- **+4 yeni regression testi** (`quotes-faz4b-form-integration.test.ts`):
  - P2-A: `clearAll` içinde `setDescDirtyRowIds(new Set())` çağrısı
  - P2-B: `autoSave` `const descDirty = rows.map(r => descDirtyRowIds.has(r.id))` + `setItem("teklif_v3", JSON.stringify({ currency, rows, descDirty }))`
  - P2-B: restore `Array.isArray(saved.descDirty)` branch + `saved.descDirty[i]` index-aligned lookup
  - P2-B: `autoSave` useCallback dep array'inde `descDirtyRowIds` var (regression — silinirse stale closure dönecek)
  - Mevcut 6 source-regex'ten 1'i güncellendi (eski non-empty filter testi → backward-compat fallback testine dönüştü).
- **Helper davranış testleri** (`quote-description-builder.test.ts`): tüm 13 expected output yeni parts-join sonuçlarına güncellendi — `"GATE VALVE A105 GÖVDE, CLASS 600 SW, SS TRİM"` (plan §487 birebir), `"BALL VALVE WCB, PN16 Flanşlı"` (trim boş), `"GLOBE VALVE, PN40 NPT, STELLITE TRİM"` (body boş), `"CF8M, PN25 Flanşlı, 13Cr TRİM"` (name boş), vb. Test sayısı sabit (1 constant doc + 12 davranış); sadece expected'lar plan örneğine birebir hizalı hale geldi.
- **Plan-domain check:** `feedback_no_silent_deletes` — helper'da hiçbir field/segment silinmedi, sadece noktalama düzeldi; clearAll'da var olan reset davranışı korundu, sadece Set sıfırlama eklendi. `feedback_plan_domain_check` — plan §486 şablonu örneğe (§487) hizalandı, helper ile doc tek source-of-truth.
- 5 dosya (1 helper refactor + 1 form fix [clearAll+autoSave+restore+deps] + 1 helper test güncelleme + 1 integration test eklemesi + 1 plan doc hizalama) · **3516 test yeşil** (önceki 3512 + 4 yeni integration test) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Faz 4c — PDF PMT brand template rewrite (logo, full bilingual header, lines tablosu Sıra/Ölçü/Tanım/Miktar/Birim/B.Fiyat/Toplam, footer band, signatures grid). Faz 4a Review'da veri kontratı kilitlendi → 4c yalnız görsel rewrite.

**Önceki:** Faz 4b — Auto-build description helper + form integration (2026-05-25; 3512 test)

- **Plan §484-488** (MODUL_REVIZE_PLAN.md): Teklif satırında ürün seçilince description PMT şablonuyla otomatik dolar — `{name} {body_material} {pn_class} {end_connection}, {trim_material} TRİM`. Örnek (Vana): "GATE VALVE A105 GÖVDE, CLASS 600 SW, SS TRİM". Kullanıcı override edebilir.
- **Pure helper** (`src/lib/quote-description-builder.ts`): `QUOTE_DESCRIPTION_TEMPLATE` constant + `buildQuoteLineDescription(product)`. Multi-type uyum (`project_pmt_multi_type`) — şablon Vana-merkezli ama PMT katalogda Conta/Flans/Fitting/... karışık; non-Vana ürünlerde Vana key'leri (`body_material`/`pn_class`/`end_connection`/`trim_material`) attribute'larda yoktur → helper graceful degrade eder, yalnız `name` çıkar. Post-processing: (a) `trim_material` boş ise trailing "TRİM" tek başına anlamsız → drop, (b) `\s{2,}` collapse, (c) `\s*,\s*,` → tek virgül, (d) leading/trailing virgül-boşluk trim. Defansif: array/object attribute boş muamelesi; number/boolean → String().
- **QuoteForm.tsx güncellemesi:** import + yeni `descDirtyRowIds = useState<Set<number>>(new Set())` state. `handleSelectProduct` `if (!descDirtyRowIds.has(rowId))` guard + `updateRow(rowId, "desc", buildQuoteLineDescription(p) || p.name)` (helper boş dönerse defansif fallback). Description input `onChange` `setDescDirtyRowIds(prev => prev.has(row.id) ? prev : new Set(prev).add(row.id))` — referans eşitliği sağlanır, gereksiz re-render yok. **2 hydration noktası:** (1) `initialData.lines` dolu ise `setDescDirtyRowIds(new Set(mapped.map(r => r.id)))` — DB'den gelen tüm desc'ler user-edited say (ürün değiştirsen bile override etmez); (2) localStorage `restored.filter(r => r.desc.trim().length > 0).map(r => r.id)` — yalnız non-empty desc'ler dirty kabul edilir. Refresh sonrası "auto vs user-edit" ayrımı kaybolur ama kullanıcı override'ı korunur (invariant doğru yönde fail).
- **+19 yeni test:**
  - `quote-description-builder.test.ts` (yeni, +13): template constant doc + plan örneği (Vana tam çıkış) + `trim_material` boş → TRİM düşer + `body_material` boş → çift boşluk collapse + Conta graceful degrade + attrs undefined/null/boş + name boş + number coercion (pn_class=150) + whitespace-only trim → TRİM düşer + array attr → boş muamelesi + name extra whitespace → tek boşluk.
  - `quotes-faz4b-form-integration.test.ts` (yeni, +6 source-regex): helper import + descDirtyRowIds state init + handleSelectProduct guard + helper çağrısı + onChange Set update paterni (immutable referans eşitliği) + initialData hydration tüm satırları dirty + localStorage hydration filter.
- **Plan-domain check:** `feedback_no_silent_deletes` — eski "desc = p.name" davranışı override edilebilir hâle gelir, hiçbir state silinmedi. `project_pmt_multi_type` — Vana dışı tipler graceful degrade, kullanıcı sürprizi yok. `feedback_plan_domain_check` — Vana seed (`057_seed_product_types.sql:30-44`) field_key'leriyle (body_material/pn_class/end_connection/trim_material) birebir uyumlu.
- 4 dosya (1 helper + 1 form değişim + 2 yeni test) · **3512 test yeşil** (önceki 3493 + 19) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Faz 4c — PDF PMT brand template rewrite (logo, full bilingual header, lines tablosu Sıra/Ölçü/Tanım/Miktar/Birim/B.Fiyat/Toplam, footer band, signatures grid). Faz 4a Review'da veri kontratı (`QuoteData` + `QuoteRow.size` + `deliveryMethod`/`paymentMethod`) kilitlendi → 4c yalnız görsel rewrite, minimal risk.

**Önceki:** Import E2E — banner testid scope (route announcer collision fix) (2026-05-25; 3493 test)

- **Açık E2E kırmızı (Faz 4a dışı):** `tests/import.spec.ts:68` "geçersiz dosya türü yüklenince hata mesajı" testi `page.getByRole("alert")` ile Next.js App Router prod build route announcer'ı (otomatik enjekte ikinci `<div role="alert">`) ile çakışıyordu → Playwright strict mode 2+ element → fail. E2E sonucu: 11 passed, 1 failed. Faz 3d Review 2'de tanınmıştı (kodda yorum bile vardı) ama testid taşıma adımı atlanmıştı.
- **Fix:** `src/app/dashboard/import/page.tsx:607` error banner div'ine `data-testid="import-error-banner"` eklendi. `role="alert"` + `aria-live="polite"` + close button `aria-label` korundu — a11y semantiği bozulmadı. `tests/import.spec.ts:68` `getByRole("alert")` → `getByTestId("import-error-banner")`; içerik regex (`toContainText(/desteklenmiyor|geçersiz|xlsx|excel/i)`) çift katmanlı güvence olarak kaldı (Aging E2E `getByTestId(...).toContainText(...)` paterniyle aynı).
- **+2 source-regex test** (`import-page-faz3d.test.ts`): (1) `page.tsx` `parseError &&` JSX bloğunda `data-testid="import-error-banner"` stringi var, (2) `tests/import.spec.ts` `getByTestId("import-error-banner")` içerir + `getByRole("alert")` içermez (regression — eski selector geri gelirse strict-mode collision döner).
- **Küçük not scope DIŞI (kullanıcı kendi belirtti):** Yeni teklif draft restore (refresh sonrası teslimat/ödeme alanları döner mi) — mevcut draft davranışıyla uyumlu, Faz 4A blocker değil. Draft restore UX genişletmesi ayrı tur.
- 3 dosya (1 source + 1 e2e spec + 1 test) · **3493 test yeşil** (önceki 3491 + 2) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Faz 4b — Auto-build description helper + form integration (ürün seçince satır description otomatik dolar; şablon `{name} {body_material} {pn_class} {end_connection}, {trim_material} TRİM`).

**Önceki:** Faz 4a Review — Preview/PDF contract lock + PATCH validation parity (2026-05-23; 3491 test)

- **P3-A (preview/PDF data contract eksikti):** Faz 4a form save path DB'ye `delivery_method`/`payment_method`/`size_text` yazıyordu ama preview/PDF render kontratı (`QuoteData` interface'i + `teklif_v3_full` localStorage shape) hâlâ Faz 4a alanlarını taşımıyordu → form'da girilen değerler preview'da "yok" görünür.
  - **Fix:** `quote-types.ts` — `QuoteData.deliveryMethod/paymentMethod: string` + `QuoteRow.size: string` eklendi. `QuoteForm.tsx` `autoSave()` + `savePreviewData()` payload'a 3 yeni alan eklendi + `useCallback` dep array (`deliveryMethod, paymentMethod`) → stale closure önlendi. `QuoteDocument.tsx` — Notes section'ından önce conditional render Teslimat/Ödeme bloğu (bilingual etiket "Teslimat Şekli / Delivery Method", "Ödeme Şekli / Payment Method", `whiteSpace: pre-wrap`, zebra bg, border) + lines tablosuna Lead Time'dan sonra "Size / Ölçü" kolonu + empty state `colSpan={10}` (eskiden 9).
  - **Not — minimal kapsam (4c'ye köprü):** Tam PMT brand layout (logo, full bilingual header, footer band) Faz 4c'de gelir; bu tur yalnız contract bağlandı ki preview "veri yok" göstermesin.
- **P3-B (PATCH validation parity yok):** `/api/quotes/route.ts` POST `validateStringLengths` çalıştırıyordu ama `/api/quotes/[id]/route.ts:75` PATCH draft-update branch body'yi doğrudan `dbUpdateQuote`'a iletiyordu. Faz 4a iki yeni serbest text alanı (10K char limit) için defense-in-depth gerek.
  - **Fix:** PATCH draft-update branch'inde `existing.status !== "draft"` guard'ından sonra `validateStringLengths(body)` çağrısı → 400. Helper recursive (`api-error.ts:90-97`) — `lines[].size_text` gibi nested alanları da kapsar.
- **P3-C (scope dışı, Next.js route announcer flake):** `tests/import.spec.ts:69` `page.getByRole("alert")` Next.js prod build route announcer ile çakışıyor — Faz 4a ile ilgisiz, ayrı tur (selector daha spesifik: `.filter({hasText: regex})` veya testid bazlı scope).
- **+11 yeni test:**
  - `quotes-faz4a-helper-mapper.test.ts` (+7): `QuoteData` deliveryMethod/paymentMethod, `QuoteRow.size`, autoSave/savePreviewData payload genişlemesi, useCallback dep array kilidi (stale closure), `QuoteDocument` conditional Teslimat/Ödeme render + bilingual etiketler + lines `row.size` render + `colSpan={10}`.
  - `quotes-faz4a-patch-validation.test.ts` (yeni, +4): delivery_method/payment_method 10001 char → 400 + dbUpdateQuote ÇAĞRILMAZ, nested `lines[].size_text` 10001 char → 400 (recursive validation lock), normal kısa body → 200 + dbUpdateQuote çağrılır (regression korunur).
- **Plan-domain check:** `feedback_no_silent_deletes` — hiçbir alan/state silinmedi, yalnız genişledi. Faz 4 plan §466 PDF brand rewrite 4c'de; bu Review turu **veri köprüsü** atıyor (kontrat hazır, 4c yalnız görsel rewrite).
- 6 dosya (4 source + 2 test) · **3491 test yeşil** (önceki 3480 + 11) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Faz 4b — Auto-build description helper + form integration (ürün seçince satır description otomatik dolar; şablon `{name} {body_material} {pn_class} {end_connection}, {trim_material} TRİM`).

**Önceki:** Faz 4a — Teklif modülü PMT brand alanları (DB + form) (2026-05-23; 3480 test)

- **Plan:** `MODUL_REVIZE_PLAN.md §466` Faz 4 — Teklif Modülü Revize. Alt-faz planı (kullanıcı kararı): 4a = DB + form, 4b = auto-build description, 4c = PDF PMT brand template rewrite.
- **Migration 065** (`065_quotes_faz4a_delivery_payment_size.sql`):
  - `quotes.delivery_method TEXT NULL` — "İSTANBUL PMT DEPO TESLİMİ / EXWORKS PMT İSTANBUL DEPO"
  - `quotes.payment_method TEXT NULL` — "%50 AVANS, %50 SEVKE HAZIR OLUNCA"
  - `quote_line_items.size_text TEXT NULL` — "3/4''", "DN50", "8\""
  - `create_quote_with_lines` + `update_quote_with_lines` RPC'leri yeniden tanımlandı (NULLIF empty string handling).
  - Idempotent (ADD COLUMN IF NOT EXISTS) + ROLLBACK SQL bloğu.
- **Type layer:** `QuoteRow + QuoteLineItemRow` (database.types.ts), `QuoteLineItem.sizeText + QuoteDetail.deliveryMethod/paymentMethod` (mock-data.ts), `mapQuoteDetail + mapQuoteLineItem` (api-mappers.ts) genişletildi.
- **Helper:** `CreateQuoteInput.delivery_method/payment_method` + `CreateQuoteLineInput.size_text` opsiyonel alanlar; mevcut `dbCreateQuote`/`dbUpdateQuote` RPC payload'a otomatik forward eder.
- **UI (QuoteForm.tsx):**
  - `QuoteRow` interface'ine `size: string` + `emptyRow()` factory güncel.
  - State: `deliveryMethod`, `paymentMethod` (default "").
  - `initialData` hydration: 3 yeni alan DB'den çekilir.
  - `buildQuotePayload`: 3 yeni alan payload'a `||undefined` ile eklendi.
  - Tablo: Lead Time'dan sonra yeni "Size / Ölçü" kolonu (placeholder `3/4'' / DN50`, aria-label).
  - Notes bloğunun üstünde 2-kolonlu Teslimat / Ödeme bloğu (bilingual etiket "Delivery Method / Teslimat Şekli", "Payment Method / Ödeme Şekli", textarea aria-label).
  - Notes placeholder güncellendi ("Diğer notlar, özel koşullar" — ödeme/teslimat bilgileri artık ayrı bloklarda).
- **+20 yeni test (2 dosya):** migration 7 (CHECK constraint genişlemesi + RPC sözleşme + ROLLBACK + idempotent) + helper/mapper/form 13 (mapper null/dolu, RPC payload forward, source-regex form lock'ları).
- **Plan-domain check:** `feedback_no_silent_deletes` — mevcut hiçbir alan/state silinmedi, yalnız genişletildi; eski quote'lar (NULL delivery/payment/size) boş string olarak hydrate olur (geriye uyumlu).
- 6 dosya (1 migration + 1 helper + 1 mapper + 1 type + 1 mock-data + 1 form + 2 yeni test) · **3480 test yeşil** (önceki 3460 + 20) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Faz 4b — Auto-build description helper + form integration (ürün seçince satır description otomatik doldur, override edilebilir; şablon `{name} {body_material} {pn_class} {end_connection}, {trim_material} TRİM`).

**Önceki:** Aging E2E 2 fail kapatma — tab + threshold testid (2026-05-23; 3460 test)

- **Kök problem:** `tests/aging.spec.ts` 2 fail (kullanıcı rapor etti). Analiz:
  - **Tab tıklama testleri** `getByText(/imalat eskimesi/i)` ile button içinde label + subtitle render edilen iki div'e Playwright strict mode'da çakışma riski (subtitle "Üretilen ama satılamayan ürünler" → "imalat" yok ama label birden fazla yere match olabiliyordu).
  - **`/45 gün/i` regex** tablo satırlarındaki `{row.daysWaiting} gün` rendering ile çakışma kaynağı: seed data'ya bağlı bir ürünün `daysWaiting === 45` olması veya avg bekleme süresinin 45 olması durumunda strict mode 2+ element bulup fail eder.
  - **Label tutarsızlığı:** Test'ler "Mamul" diyor, gerçek UI label "İmalat Eskimesi".
- **Fix:**
  - `page.tsx`: REPORT_TABS button'larına `data-testid={\`aging-report-tab-${tab.key}\`}` (manufactured/commercial). Eşik referansı div'ine `role="note"` + `data-testid="aging-threshold-hint"`.
  - `tests/aging.spec.ts`: 5 test güncellendi — tab tıklama `getByTestId("aging-report-tab-manufactured")`, eşik referansı `getByTestId("aging-threshold-hint")` + `toContainText(/45 gün/i)` (çift katmanlı: testid scope + içerik regex). "Mamul" → "İmalat" label hizalandı.
- **+3 source-regex test:** `aging-page-testids.test.ts` (yeni) — tab testid pattern + threshold hint role/testid + 45 gün referansı tutarlılığı. Gelecek regression'ı (biri testid silerse) yakalar.
- **E2E doğrulama (kullanıcı tarafı):** `npx playwright test tests/aging.spec.ts` → 8/8 passed beklenir (önceki 6/8).
- 3 dosya (1 yeni test) · **3460 test yeşil** (önceki 3457 + 3) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Faz 4 (teklif modülü revize) veya kullanıcı kararı.

**Önceki:** Faz 3d Review 2.tur — error banner role="alert" + accordion testid (2026-05-23; 3457 test)

- **P2 — Son E2E fail (`tests/import.spec.ts:60`):** Geçersiz dosya testi `page.getByText(/desteklenmiyor|geçersiz|xlsx|excel/i)` ile 7 element'e çakışıyordu (DropZone metni "Excel, CSV", empty state "Migration Excel", accordion summary "eski 7-adım Excel wizard", klasik input `accept=".xlsx,.xls,.csv"` vb.) → Playwright strict mode fail. Hata banner'ı görünüyordu ama assertion yanlış element'i (veya hepsini) yakalıyordu.
- **Fix — `role="alert"` + `aria-live="polite"`:** `page.tsx:599-608` error banner'a a11y semantic eklendi (`ExtractionReview` pattern tutarlılığı). Close button `&times;`'a `aria-label="Hata mesajını kapat"`. Test artık `page.getByRole("alert")` + `toContainText(/.../)` ile çift katmanlı assertion (banner var mı + içerik eşleşiyor mu). Strict + esnek.
- **P3 — Accordion locator stabilitesi:** `<details data-testid="classic-mode-accordion">` eklendi. `tests/import.spec.ts:38` `beforeEach` `document.querySelector("details")` → `[data-testid='classic-mode-accordion']` ile scope'landı (TS `HTMLDetailsElement` generic). Sayfaya başka `<details>` eklense bile bu locator stabil kalır.
- **+2 source-regex test:** `import-page-faz3d.test.ts` — error banner role/aria-live/aria-label + accordion data-testid kilitleme.
- **E2E doğrulama (kullanıcı tarafı):** `npx playwright test tests/import.spec.ts` → 12/12 passed beklenir (önceki 11/12; tek fail kapanır).
- 3 dosya · **3457 test yeşil** (önceki 3455 + 2) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Aging E2E 2 fail (Faz 3d ile ilgisiz, ayrı tur) veya Faz 4 (teklif modülü revize).

**Önceki:** Faz 3d Review — 3 bulgu kapatma + E2E adaptasyon (2026-05-23; 3455 test)

- **P3 typo (görünür metin):** `page.tsx:483` "ürün kataloğları" → "ürün katalogları" (commit `7bcb07b`'de doğru yazılmıştı, source kaçmış).
- **P3 scroll/focus (migration_excel CTA):** ClassifierQueue'dan tıklama tek başına `setShowClassic(true)` yapıyor; uzun queue altında kullanıcı klasik wizard'a görsel olarak inmiyordu. Yeni `openClassicFromCta` wrapper helper: `setShowClassic(true)` + `setTimeout(100ms) → classicDetailsRef.scrollIntoView({behavior:"smooth", block:"start"})`. Sadece CTA'dan tetiklenir; manuel `<summary>` tıklamada native browser scroll yeterli (extra scroll yok). `<details ref={classicDetailsRef}>` ile bağlı.
- **P2 E2E adaptasyon (9 fail):** Faz 3d sonrası sayfada iki `input[type='file']` var (AI DropZone + klasik wizard) → Playwright strict mode çakışıyordu. Klasik wizard input'una `data-testid="classic-import-file"` eklendi. `tests/import.spec.ts` tüm 11 file-input locator'ı `CLASSIC_FILE_INPUT` constant ile scope'landı. `beforeEach`'e accordion auto-open eklendi: `await page.evaluate(() => { const d = document.querySelector("details"); if (d && !d.open) d.open = true; })`. Geçersiz dosya testi `isVisible()` (input display:none → false dönerdi) yerine `isAttached()` kullanır.
- **Lint config ek:** Playwright artifact'ları (`playwright-report/**`, `test-results/**`) eslint global ignore'a eklendi — kullanıcı E2E koşumu sonrası oluşan generated JS dosyaları 185 error/2828 warning üretiyordu. `.gitignore`'da zaten ignored, eslint scope hizalandı.
- **+3 yeni test:** `import-page-faz3d.test.ts` — typo fix lock + openClassicFromCta scroll handler + classic-import-file testid (source-regress kilitleme). Mevcut 1 test güncellendi (inline arrow yerine helper referansı).
- **Ayrı task — `.claude/settings.local.json`:** `/permissions` ile yanlışlıkla silinen 49 allow rule geri yüklendi (önceki turda planlanıp uygulanmıştı).
- 5 dosya · **3455 test yeşil** (önceki 3452 + 3) · TS clean · 0 lint warning · build OK
- **Aging E2E (2 fail) scope dışı:** Kullanıcı raporladı ama "ayrı/global kırmızı" not düştü; Faz 3d ile ilgisiz, ayrı turda ele alınır.
- **Sıradaki:** Faz 4 (teklif modülü revize) veya kullanıcı kararı.

**Önceki:** Faz 3d — Klasik mod accordion + AI default akış polish (2026-05-23; 3452 test)

- **AI default akış:** Faz 3a'dan beri var olan `mode: "ai" | "classic"` tab toggle KALDIRILDI. AI akışı (DropZone + ClassifierQueue) artık sayfanın varsayılan + her zaman görünür içeriği. Header açıklama metni tek satır AI odaklı.
- **Empty state polish:** `aiFiles.length === 0` ise DropZone altında `role="status"` yardım bandı: "Henüz dosya yüklenmedi — PDF sertifika, Excel kataloğu, datasheet veya ürün resmi sürükle bırak. AI sınıflandırır, eşleşen ürünleri bulur, onayınla katalogu günceller." + Migration Excel için Gelişmiş/Klasik Mod yönergesi.
- **Klasik mod accordion:** Eski 7-adım wizard (sheets/columnMappings/preview/import) sayfanın altında `<details>` collapsible'a alındı. Summary: "▸ Gelişmiş: Klasik Mod — eski 7-adım Excel wizard (migration için)". Default kapalı; `showClassic: boolean` state + `onToggle` ile senkron. Tüm eski state'ler ve fonksiyonlar korundu (silinmedi).
- **migration_excel CTA aktif:** ClassifierQueue'ya `onOpenClassicMode?: () => void` opsiyonel prop eklendi. Callback verilirse migration_excel kartında eski disabled "Klasik Mod'a geçin" span'ı yerine tıklanabilir "Klasik Mod'a geç ↓" button render olur (aria-label "Klasik Mod accordion'unu aç"). Parent `setShowClassic(true)` ile accordion otomatik açılır. Callback yoksa eski disabled span davranışı korunur (backward compat).
- **+11 yeni test:**
  - `import-page-faz3d.test.ts` (yeni, 9): tab toggle kaldırma + `showClassic` state + AI guard kalkması + empty state + `<details>` + summary metni + header polish + migration_excel CTA prop geçişi (source-regex tarzı yapısal kilitleme).
  - `classifier-queue-interaction.test.tsx` (+2): migration_excel + onOpenClassicMode → tıklanabilir button + callback tetiklenir; onOpenClassicMode yok → eski disabled span davranışı (backward compat).
- **Plan-domain check:** `feedback_no_silent_deletes` paterni — klasik wizard'ın hiçbir state/fonksiyonu silinmedi, sadece UI'da accordion'a alındı. Migration Excel hâlâ destekleniyor; AI extraction "kapsam dışı" gördüğü doc'ları kullanıcıya net CTA ile klasik moda yönlendiriyor.
- 3 dosya + 1 yeni test + 1 yeni içerik test = 4 dosya · **3452 test yeşil** (önceki 3441 + 11) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Faz 4 (teklif modülü revize) veya başka bir alanda Bulgular turu — kullanıcı kararı.

**Önceki:** Faz 3c Review 5.tur — status_update_failed UI/API propagate (P2/P3 follow-up) (2026-05-22; 3441 test)

- **Bulgu:** 4.tur post-commit guard duplicate riskini engelliyordu ama route 200 + result olduğu gibi dönüyor, UI `successCount > 0` görünce `setDocStatus("applied")` çağırıyordu → kullanıcı "Belge uygulandı" toast'ı görüyor, oysa DB'de doc 'applying'de takılı. Refresh sonrası server'dan applying gelir, state tutarsız. `status_update_failed` flag sadece audit log'a yazılıyordu, frontend göremiyordu.
- **Fix:**
  - **Service shape:** `ApplyResult` interface'ine `status_update_failed: boolean` alanı eklendi (default false `emptyResult` factory'sinde). Post-commit catch'te `result.status_update_failed = true` set edilir → audit flag ile hizalı, response'a taşınır.
  - **UI shape:** `ApplyResultSummary` interface'ine `status_update_failed?: boolean` (opsiyonel — backward compat eski response'lar için undefined). `handleApply` kontrol sırası: önce `result.status_update_failed` → setDocStatus('applying') + warning toast "{N} işlem yazıldı ancak belge durumu güncellenemedi. Yönetici müdahalesi gerekiyor." + erken return (success/error toast'ları YOK).
  - **Result panel:** Yeni `role="alert"` admin recovery uyarı bandı (danger renkli, yalnız `applyResult.status_update_failed` true ise render): "İşlemler başarıyla yazıldı ancak belge durumu 'applied' olarak güncellenemedi (belge 'applying'de takılı kaldı). Duplicate apply engellenmiş durumda. Yönetici müdahalesi gerekiyor — belgeyi manuel olarak 'applied' durumuna alın."
- **+3 yeni test:**
  - `import-apply-service.test.ts` (+2): post-commit fail testi `r.status_update_failed === true` assertion eklendi; başarılı path testi `false` döner.
  - `extraction-review-apply.test.tsx` (+1): `result.status_update_failed: true` fixture → warning toast (yönetici/güncellenemedi mesajı), success toast YOK, `role="alert"` admin recovery bandı render, Uygula button disabled ("uygulanıyor" tooltip), "Belge uygulandı" mesajı görünmez.
- **Plan-domain check:** Bu invariant'ı sıkılaştırır — UI artık DB ile senkron (applying'i applied göstermez). Audit + UI iki kanal aynı flag'i kullanır → tek source of truth.
- 4 dosya · **3441 test yeşil** (önceki 3439 + 2) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Faz 3d — klasik mod toggle cleanup (eski 7-adım wizard "Klasik Mod" altına gizleme, AI default akış polish).

**Önceki:** Faz 3c Review 4.tur — Post-commit rollback fix (P2 duplicate engel) + applying state UX (P3) (2026-05-22; 3439 test)

- **P2 (kritik data integrity):** 3.tur outer catch `successCount>0` sonrası terminal status update fail'inde de 'classified'e rollback yapıyordu → ürün/cert ZATEN yazılmış, kullanıcı tekrar Apply → claim CAS başarılı → loop yeniden → **duplicate product/cert** (özellikle cert path orphan zinciri kirletir; SKU UNIQUE create path'i bloklar ama audit/state kirli).
- **Fix:** `successCount>0` sonrası `dbUpdateImportDocumentStatus("applied")` ayrı try/catch içinde; fail → `postCommitStatusFailed=true` flag set, throw YOK (outer catch'i tetiklemez), audit log `status_update_failed: true` ile yazılır. Doc 'applying'de takılı kalır → tekrar Apply çağrısı claim null → "hazır değil (applying)" → duplicate sıfır. Admin SQL ile manuel 'applied'a alır (recovery cron ileride opsiyonel).
- **P3 (UX):** UI ve API 'applying' state'i bilmiyordu — sayfa yenile/ikinci sekme sırasında generic 400 "hazır değil" alıyordu.
- **Fix:** Route — `msg includes "applying"` → **409 Conflict** + "Belge şu anda başka bir oturumda uygulanıyor" (Faz 8 yarış 409 paterni); diğer "hazır değil" 400'de kalır. UI — `isDocApplying = docStatus === "applying"` türevi; Yeniden Çıkar + Uygula buton disabled koşullarına eklenir; warning footer "Belge uygulanıyor — başka bir oturumda devam ediyor olabilir"; `handleApply` 409 yakalar → info toast + `setDocStatus("applying")` → UI senkron.
- **+7 yeni test:**
  - `import-apply-service.test.ts` (+3): post-commit fail rollback YOK + audit flag, duplicate engel (2. çağrı claim null), all-fail outer catch eski davranış korunur.
  - `apply-route.test.ts` (+2): applying → 409 + net mesaj, applied → 400 korunur (sadece applying 409'a maplenir).
  - `extraction-review-apply.test.tsx` (+2): doc.status='applying' fixture → buton disable + tooltip + warning footer + Yeniden Çıkar disable; handleApply 409 → info toast + setDocStatus + UI senkron.
- **Plan-domain check:** `domain-rules.md` özel kural yok; data integrity (zero-duplicate) genel ilke. Faz 8 import-batches `dbClaimBatchForConfirm` outer catch 'review'e rollback yapıyor ama orada side-effect atomic transaction içinde — apply'da her satır ayrı transaction olduğundan "applying'de bırak" doğru karar.
- 4 dosya · **3439 test yeşil** (önceki 3432 + 7) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Faz 3d — klasik mod toggle cleanup (eski 7-adım wizard "Klasik Mod" altına gizleme, AI default akış polish).

**Önceki:** Faz 3c Review 3.tur — Apply concurrency atomic claim + cert versioning identity karar (2026-05-22; 3432 test, 2 commit)

**Bulgu 1 (kullanıcı kararı: A — file_name only + dokümante; commit pending):**
- Versiyonlama identity `(product_id, kind=certificate, file_name)` olarak korundu (plan literal "ürün bazlı supersede" reddedildi).
- **Gerekçe:** PMT'de bir vananın aynı anda birden çok meşru aktif sertifikası olabilir (farklı heat no, farklı test type, EN10204 3.1 vs. 3.2 farklı standartlar). Plan'ın literal okuması seçilseydi bu paralel meşru cert'ler yanlışlıkla arşivlenir, regression yaratırdı.
- **Trade-off:** Aynı PDF dosyası tekrar yüklenirse versiyonlanır; isim değişen revize cert otomatik supersede etmez (paralel aktif kalır, kullanıcı manuel silebilir). AI extraction `metadata.cert_no` üretmeye başlarsa ileride kompozit identity (cert_no öncelikli + file_name fallback) ile genişletilebilir.
- **Değişiklikler:** `dbSupersedeCertificatesByName` helper JSDoc'una LIMITATION bloğu eklendi (file_name bağımlılığı + paralel meşru cert gerekçesi + future-proof kompozit identity notu). `MODUL_REVIZE_PLAN.md:418-422` "Versiyonlama Uygulaması" bölümü güncellendi — plan ↔ implementation hizalı.
- **+2 test:** JSDoc LIMITATION source-regression lock + file_name identity behavior lock (eq("file_name") filter'ı kaldırılırsa kırılır).

**Önceki bulgu — Apply concurrency atomic claim (commit `5f1dea0`):**

- **P2 (race condition):** `serviceApplyImportDocument` başta JS-side `doc.status !== "classified"` kontrol yapıyordu ama atomic claim/lock yoktu. Status okuma → AI/storage/DB iş → status yazma arasında TOCTOU race penceresi vardı. İki paralel apply (iki sekme, retry double-click) classified status'unu aynı anda görüp ikisi de işleme girebiliyordu → duplicate product/cert riski.
- **Çözüm — Faz 8 (Sprint B G3) `dbClaimBatchForConfirm` paterni:**
  - **Migration 064:** `import_documents.status` CHECK genişletildi → 'applying' ara state eklendi (mevcut 5 state korunur, idempotent ROLLBACK SQL).
  - **`ImportDocumentStatus` type + `VALID_STATUS_TRANSITIONS` array:** 'applying' eklendi.
  - **Yeni helper `dbClaimImportDocumentForApply(id)`:** Tek SQL'le `UPDATE import_documents SET status='applying' WHERE id=$1 AND status='classified' RETURNING *`. CAS — yarışı kazanan row alır, kaybeden null. `maybeSingle()` ile null-safe.
  - **Service refactor:** Eski 1-3 step (doc fetch + status check + lines fetch) → atomic claim. Null → `dbGetImportDocument` ile detail oku, "hazır değil (durum: X)" throw. Tüm processing (storage download, per-row loop, status finalize) try/catch içinde:
    - successCount > 0 → `dbUpdateImportDocumentStatus('applied')` (terminal)
    - successCount === 0 (all-fail) → `dbUpdateImportDocumentStatus('classified')` (lock serbest, retry mümkün)
    - eligible.length === 0 → `dbUpdateImportDocumentStatus('classified')` (lock serbest)
    - Outer exception (storage fail, status update fail) → catch: rollback 'classified' + throw propagate
  - **Audit log:** Exception path'inde audit yazılmaz (throw yukarıda); başarılı + all-fail apply'lar `success: boolean` ile loglanır.
- **+11 yeni test:**
  - `import-documents-applying-migration.test.ts` (yeni dosya, 4): CHECK constraint genişlemesi + 'applying' + ROLLBACK + race doc.
  - `import-documents-helper.test.ts` (+4): `dbClaimImportDocumentForApply` happy/race-lost/error + `dbUpdateImportDocumentStatus('applying')` valid; mock chain'e `maybeSingle()` + recursive `.eq().eq()` desteği.
  - `import-apply-service.test.ts` (+3 yeni, ~5 güncelleme): `mockClaim` mock'u eklendi; 20 mevcut `mockGetDoc.mockResolvedValueOnce(DOC|CERT_DOC)` çağrısı `mockClaim`'e taşındı; pre-check testleri (3): claim null + doc null/applied/applying → throw; rollback testleri (3): all-fail/eligible-0 → 'classified' geri çekilir, cert storage fail → throw + rollback + no audit.
- **Geriye uyumluluk:** Mevcut başarılı flow değişmedi; sadece status sırası `classified → applying → applied` (önceden `classified → applied`). UI'da fark görülmez (idempotency hâlâ aktif: applying'de iken 2. çağrı reddedilir).
- **Plan-domain check:** `domain-rules.md` özel kural yok; Faz 8 paterni (import_batches confirming) aynı disiplin.
- 7 dosya (1 commit) · **3430 test yeşil** (önceki 3419 + 11) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Bulgu 1 (cert versioning identity semantik) için kullanıcıya net seçenek sorusu (file_name only / product+kind / metadata.cert_no kompozit).

**Önceki:** Faz 3c Review 2.tur — UI sertifika geçmişi + Yeniden Çıkar applied guard (2026-05-22; 3419 test, 2 commit)

- **Bulgu 1 — Yeniden Çıkar applied guard (P3, commit `6a7cb39`):** ExtractionReview.tsx:380 disabled koşulu `isDemo || extracting || isDocApplied` oldu; title `isDocApplied ? "Belge uygulandı, tekrar çıkarılamaz" : ...`. "Uygula" butonuyla simetri (zaten applied'da disable). Extract route server-side guard zaten 4xx döner; bu UX'i hizalar. +1 RTL test (`extraction-review-apply.test.tsx`).
- **Bulgu 2 — Sertifika geçmiş görünümü (P2, commit `3440a5d`):** 1.tur supersede helper'ı UI'da görünür hale getirildi.
  - **Backend:** `dbListAttachmentsByProduct` opsiyonel `options?: { includeSuperseded? }` 3.param — default `superseded_by IS NULL` filter korunur (mevcut caller'lar etkilenmez), `includeSuperseded:true` ile filter UYGULANMAZ. `GET /api/products/[id]/attachments?includeSuperseded=1` query desteği → response `{ items: active, superseded: prev[], expires_in }` ayrı diziler; default shape geriye uyumlu (`{ items, expires_in }`).
  - **Mapper + interface:** `mapProductAttachment` ve `ProductAttachment` interface'ine `supersededBy: string | null` alanı eklendi (DB column zaten Faz 2a migration'da).
  - **UI (ürün detay → Ekler sekmesi):** Yeni pure helper export `parseSupersededAttachmentsResponse` (defansif shape parse, yoksa []). State: `supersededAttachments` + `showSuperseded` (default kapalı). `fetchAttachments` artık `?includeSuperseded=1` ile tek round-trip'te ikisini de getirir. Belgeler bloğunun hemen ardından "Önceki Sertifika Versiyonları (N)" başlığı + ▸/▾ collapsible (yalnız superseded.length > 0 olduğunda render). Liste opacity 0.7 faded; her satır dosya adı + "Önceki versiyon · X KB" + İndir butonu (handleDownloadDocument reuse, signed URL refresh). **Sil butonu YOK** — önceki versiyonlar forensic/audit için kalır.
  - **+16 test (5 dosya):** helper mock chain 3 (default/explicit false/true), mapper supersededBy 2 + toEqual güncelleme, route ?includeSuperseded=1 2 (default + flag shape), pure helper 5 (parseSupersededAttachmentsResponse drift defense + makeAtt factory'sine supersededBy:null), UI source-regex 5 (export, fetch URL, state setters, collapsible markup, aria-label).
- **Plan-domain check:** `feedback_no_silent_deletes` paterni — önceki versiyon silinmiyor, supersede ediliyor; forensic için saklanır.
- 12 dosya (2 commit) · **3419 test yeşil** · TS clean · 0 lint warning · build OK
- **Sıradaki:** Faz 3d — klasik mod toggle cleanup (eski 7-adım wizard "Klasik Mod" altına gizleme, AI default akış polish).

**Önceki:** Faz 3c Review 1.tur — 4 P2/P3 bulgu kapatma (2026-05-22; 3401 test, commit `14a7253`)

- **P2-1 (cert versiyonlama):** Önceki turdaki "supersede etme" kararı kullanıcı tarafından güncellendi → supersede ET. Yeni helper `dbSupersedeCertificatesByName(productId, fileName, newAttachmentId)`: aynı (product_id, kind=certificate, file_name) ile aktif (superseded_by IS NULL) cert'leri yeni cert id'ye bağlar; self-exclude (.neq("id", newId)). Apply service cert branch'inde `dbCreateAttachment` sonrası çağrılır; versiyonlama fail cert'i geri almaz, sadece warning errors[]'e eklenir. `ApplyResult.attachments_superseded` counter. UI sonuç paneline "N eski sertifika önceki versiyona alındı" satırı eklendi. UI Ekler sekmesi zaten `superseded_by IS NULL` filter'ı sayesinde sadece aktif olanı gösterir.
- **P2-2 (all-fail policy):** `successCount = products_created + products_updated + attachments_created`. successCount===0 → `dbUpdateImportDocumentStatus("applied")` çağrılmaz, doc 'classified' kalır, kullanıcı satırları düzeltip tekrar Uygula. UI: koşullu `setDocStatus`, warning toast "Hiçbir satır uygulanamadı — hataları inceleyip tekrar deneyin", button enabled kalır.
- **P3 (PATCH applied 409):** `line-patch route` `dbGetLine` sonrası parent doc fetch + `status === 'applied'` → 409 "Belge uygulandı, satır düzenlenemez". Extract route paterniyle uyumlu, UI tutarlılık.
- **P3 (aggregate audit):** Apply tamamlandığında `audit_log` insert: action='import_applied', entity_type='import_document', after_state={counts, errors_count, success boolean}, actor. All-fail dahil her apply denemesi loglanır (forensic). Audit insert fail silent (apply başarısı geri alınmaz).
- **+14 yeni test:** apply-service +7 (cert versioning happy/fail, all-fail status, partial success, aggregate audit success/all-fail/silent-fail), line-patch +2 (applied 409, classified mevcut path), RTL apply +2 (all-fail button enabled + warning, attachments_superseded panel), product-attachments-helper +3 (supersede happy/empty/error)
- 7 dosya · **3401 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 3c — Review screen apply pipeline (2026-05-21; 3387 test) · commit `d266718`

- **Service:** `serviceApplyImportDocument(documentId, actorUserId)` — doc.status='classified' pre-check (idempotency); eligible filter (matched|reviewed|new_product); cert flow varsa storage download bir kez; per-row try/catch loose (serviceConfirmBatch paterni); new_product → `dbCreateProduct` (+ untyped_products counter); matched|reviewed → `dbUpdateProduct` (attributes merge `{...current, ...new}`); cert+matched|reviewed → `dbCreateAttachment` (kind=certificate, Faz 2d 3-step orphan-safe helper); cert+new_product → error+skip; doc.status='applied' terminal. `ApplyResult` { products_created, products_updated, attachments_created, skipped, errors[], untyped_products }.
- **Helper:** `dbUpdateImportDocumentStatus(id, status)` (yeni) — generic status update + enum guard. `dbCreateProduct`/`dbUpdateProduct` mevcut (Faz 1) — reuse.
- **Route:** `POST /api/import/documents/[id]/apply` — requireRole admin|purchaser, service çağrısı, revalidateTag("products","max"), pre-check throw'ları 400 mapping (bulunamadı / hazır değil).
- **UI ExtractionReview:** "Uygula (Faz 3c)" placeholder → aktif `<Button>` (hasApplicable + applying + isDocApplied + isDemo guard); `handleApply` POST → `applyResult` state; sonuç paneli (counts breakdown + untyped warning + errors details accordion); doc.status='applied' → "Belge uygulandı" mesajı.
- **Cert versiyonlama:** Bu faz scope dışı — `superseded_by` yazılmaz, tüm cert'ler aktif kalır. UI Ekler sekmesi zaten `superseded_by IS NULL` filter'ı kullanıyor → yeni cert'ler doğrudan listelenir. Versiyonlama gelecek bir tura ertelendi.
- **NULL product_type_id:** Yeni ürün AI tip seçememişse `products.product_type_id=NULL` ile yarat (Faz 1 izin veriyor); UI warning bilgisi.
- **+27 yeni test:** apply-service (13) + apply-route (6) + RTL apply UI (6) + helper status (2)
- 6 yeni dosya · 3 değişen · **3387 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 3b Review 6.tur — Type-aware matcher + cert-flow per-row Tip kolonu (2026-05-21; 3360 test) · commit `ed36aaf`

- **P2 (matcher type-blind):** Faz 3b 3.tur multi-type extraction'da AI item başına `product_type_id` seçiyordu ama matcher bu bilgiyi kullanmıyordu. PMT multi-type firma — aynı DN/PN'li farklı tipte ürünler (vana DN50 vs conta DN50) yanlış top-candidate üretebiliyordu. **Soft boost + penalty paterni** eklendi: `MatchableProduct` ve `ExtractedRowInput` `product_type_id` alanları + `scoreProductMatch` aynı tip +20 / farklı tip -20 / her ikisi non-null değilse nötr. 0 floor eklendi (penalty düşük skoru negatife çekmesin), 100 clamp korundu. `loadActiveMatchables` mapper p.product_type_id forward eder.
- **Davranış doğrulaması:** Vana DN50 input → aynı katalogda vana DN50 (auto matched 85+) ve conta DN50 (penalty ile filter dışı veya pending'e düşer). SKU+name+type_mismatch hâlâ 85=matched (UNIQUE SKU anchor korunur). Cert-flow input.product_type_id null → tip katmanı atlanır, eski davranış.
- **P3 (cert-flow per-row Tip kolonu):** 5.tur header filter'ı gizledi ama tablo başlığında `<th>Tip</th>` + per-row `<select>` cert-flow için de render ediliyordu. Header + cell `!isCertFlow` guard'a alındı. Cert satırlarında semantik temizlik.
- **+10 yeni test:** matcher type-aware (8: aynı tip, farklı tip, null fallback, 0 floor, sınır cases, multi-type ranking 2 senaryo) + extract-route matcher input.product_type_id forward (1) + RTL cert-flow tablo Tip header/cell yok (1)
- 6 dosya · **3360 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 3b Review 5.tur — cert-flow productTypeId validation bypass (2026-05-20; 3350 test) · commit `79c3ed0`

- **P2 (cert-flow yanlış 400):** 4.tur'da eklenen early `bodyProductTypeId` validation `isProductFlow` ayrımı yapmıyordu. Sertifika belgesinde UI `doc.classification.suggested_product_type_id`'yi default'a aktarıyor, body'ye `productTypeId` ekliyor, classifier'ın önerdiği tip silinmişse route 400 dönüp cert extraction hiç çalışmıyordu. Halbuki cert-flow `product_type_id` kullanmıyor (hedef ürün matched üzerinden 3c'de belirlenir).
- **Backend:** Validation koşulu `bodyProductTypeId && isProductFlow` oldu — cert-flow'da silently ignore.
- **Frontend (ExtractionReview):** Yeni helper `isCertFlowDocumentType(t)` + `isCertFlow` bayrağı. Cert-flow'da: (a) filter `<select>` render edilmez, (b) `overrideTypeId` init "" (suggested aktarılmaz), (c) handleExtract body'ye `productTypeId` eklenmez (defansif).
- **+2 test:** extract-route (cert-flow + invalid bodyProductTypeId → 201 + mockGetProductType not called) + RTL (cert-flow render → filter yok + fetch body.productTypeId undefined)
- 4 dosya · **3350 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 3b Review 4.tur — 2 takip bulgu kapatma (2026-05-20; 3348 test)

- **P3 (early validation):** Invalid/stale `bodyProductTypeId` artık storage download + `loadActiveMatchables` ÖNCESİNDE doğrulanır. `dbGetProductTypeWithFields` erken çağrıldı; sonuç null ise 400 (kullanıcı bilinçli girdisi → fail-closed). Başarılı çağrıda `resolvedBodyType` reuse — gereksiz 2. fetch yok. Önceki davranış: doc + storage + cache yüklenip sonra 400'e düşülüyordu (gereksiz I/O).
- **P3 (bulk approve interaction test):** `handleApproveAll` optimistic state davranışı şimdiye dek sadece helper testleriyle kanıtlıydı. Yeni `extraction-review-interaction.test.tsx` (jsdom + RTL): (1) tüm matched satırlar başarılı PATCH → tümü "Onaylandı" badge'e geçer + 1 `router.refresh()`; (2) karışık başarı/hata → 1 reviewed + 1 matched, ayrı toast'lar; (3) matched satır yoksa info toast + fetch atmaz. Stale UI regression artık unit-test seviyesinde kilitli.
- **+1 mevcut test güncellemesi** (storage/cache çağrılmadığını doğrulayan extra assertion) **+3 yeni RTL test**
- 3 dosya · **3348 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 3b Review 3.tur — Multi-type extraction refactor (2026-05-20; 3345 test) · commit `fbf828f`

- **Kullanıcı feedback:** "PMT tek tip ürün katoloğu olan bir firma değil çeşitli ürünler var ve her tip ürün de girebilir sistemin bunlara hazır olması gerek." 2.tur'daki "tek-tip katalog assumption" düzeltildi; plan'ın orijinal multi-type tarifine uygun refactor yapıldı.
- **AI service:** `ExtractProductsInput.productTypeContext` (tek) → `availableProductTypes` (Array). System prompt her tip için `### {UUID} — {name}` başlığı altında fields listesi. AI item başına `product_type_id` (UUID, whitelisted) seçer. `parseExtractionResponse(text, availableProductTypes)` — `product_type_id` UUID + whitelist check; attributes filter item başına DİNAMİK (item.product_type_id'nin field_key'lerinden olmayan alanlar drop). Tip belirlenmediyse attributes boş set ile filter → free-form'a düşer.
- **Extract route:** `dbListProductTypes + Promise.all(dbGetProductTypeWithFields)` paralel multi-fetch (8 tip = 9 query). bodyProductTypeId artık "restrict semantiği" — availableProductTypes tek tipe filtrelenir ("sadece bu tip katalogu"). Uniform `injectedProductTypeId` KALDIRILDI — route AI'nın seçimini doğrudan persist eder (her satır kendi tipinde).
- **PATCH route + helper:** Body `product_type_id` parse (undefined/null/UUID) + UUID_RE check + `dbGetProductType` existence check. `UpdateLineMatchInput.product_type_id` opsiyonel (undefined = patch yok, null = clear, string = set). `dbUpdateLineMatch` patch'i koşullu ekler.
- **UI ExtractionReview:** Header filter "Otomatik (AI seçer)" default + "Sadece X" tip filtreleri. Yeni tablo kolonu **Tip** — her satırda dropdown ile override; PATCH `{product_type_id}` ile persist + optimistic local state update. Yeni pure helper `formatProductTypeName(id, types)`.
- **Plan doc:** `MODUL_REVIZE_PLAN.md` Type-Aware Extraction section multi-type uygulamasıyla uyumlu hale getirildi.
- **Memory feedback:** Yeni `project_pmt_multi_type.md` — PMT multi-product-type firma kuralı (gelecek tasarımlar için).
- **+16 yeni test:** parseExtractionResponse multi-type (9: per-item product_type_id whitelist, dinamik attribute filter, karışık tip mixed) + aiExtract multi-type prompt (1: tüm tipler + UUID'ler + product_type_id talimatı) + extract-route multi-type behavior (1: AI per-item seçim persist; 2 eski test güncellendi) + line-patch product_type_id override (6: happy/null/undefined/invalid UUID/not found/wrong type) + helper pass-through (3) + UI helper formatProductTypeName (4)
- 11 dosya · **3345 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 3b Review 2.tur — 4 yeni P2/P3 bulgu kapatma (2026-05-20; 3329 test) · commit `8a95a31`

- **P2 (SKU UNIQUE anchor):** `products.sku` UNIQUE DB constraint sayesinde exact SKU match aslında "kesinlikle aynı ürün" anlamına geliyor; eski +40 (new_product) yetersizdi. SKU exact +60 yapıldı → SKU-only 60 pending (AI halüsinasyon koruması), SKU+name 105 clamp 100 matched (cert flow auto-link). Plan tarifi (name+DN+PN=85 matched) korunur.
- **P2/P3 (multi-type type-aware):** Faz 3b mevcut sürümü **tek-tip katalog** varsayımı ile uygulandı (UI tek tip seçer, route uniform inject). Plan'daki `available_product_types` + item başına `product_type_id` çıktısı multi-type karışık katalog scope'u 3c+'a ertelendi (PMT tedarikçi kataloglarında tek-tip yaygın). `MODUL_REVIZE_PLAN.md` Type-Aware Extraction section'a uygulama notu eklendi.
- **P3 (bulk approve stale state):** `router.refresh()` Server Component'leri yeniler ama `useState(initialLines)` client state aynı kalır → kullanıcı "onaylandı" sonrası satırları "Eşleştirildi" görmeye devam ederdi. `ExtractionReview.handleApproveAll` artık `succeededIds` Set ile `setLines` optimistic update yapıyor (`match_action='reviewed'` + `reviewed_at` ISO) + router.refresh().
- **P3 (invalid productTypeId fail-closed):** Body'den gelen `productTypeId` `dbGetProductTypeWithFields` null dönerse artık 400 "Belirtilen ürün tipi bulunamadı" (stale UI cache / tampered POST / silinmiş tip). Classification suggestion'da (AI heuristic) best-effort free-form fallback davranışı korunur.
- **+3 yeni test:** SKU-only pending + SKU+name clamp 100 (matcher), invalid productTypeId 400 + stale classification suggestion best-effort 201 (extract-route)
- 6 dosya · **3329 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 3b Review — 6 P2/P3 bulgu kapatma (2026-05-20; 3326 test) · commit `6f8ea23`

- **P2-A (product_type_id taşıma):** Migration 063 ekledi `import_document_lines.product_type_id uuid NULL FK product_types(id) ON DELETE SET NULL` + index. `ImportDocumentLineRow` + `CreateExtractedLineInput` + `ExtractedProductLine` interface'lerine alan eklendi; route extract'ta her satıra `productTypeContext?.id ?? bodyOverride ?? null` inject ediliyor. 3c apply'da "yeni ürün hangi tipte yaratılacak?" belirsizliği kalktı.
- **P2-B (matcher formülü):** scoreProductMatch yeniden ağırlıklandırıldı — SKU+40 (aynı), name_high+45 (30→45), name_partial+15 (10→15), attr per-grup +20 (DN ve PN ayrı grup, max +40). KEY_ATTR_KEYS flat list → KEY_ATTR_GROUPS gruplu. Sonuç: SKU+name=85 matched (sertifika), name+DN+PN=85 matched (plan tarifi).
- **P2-C (empty re-extract silent silme):** Route'ta `linesToCreate.length === 0 && existingLines > 0` → 422 + "AI hiçbir satır çıkaramadı, mevcut satırlar korundu". Cert flow'da `target_name=null && target_sku=null && confidence=0` → linesToCreate'e push'lama. UI 422'yi info toast ile handle eder.
- **P2/P3-D (N full scan perf):** `loadActiveMatchables` yeni export; route extraction loop ÖNCESİ tek seferlik fetch + `findProductMatchCandidates`'a productsCache opsiyonel 3. arg. 100 satır × 1 fetch (eski 100 fetch).
- **P2-E (bulk approve sessiz fail):** `Promise.all(fetch(...))` → her sonuçta `res.ok` kontrolü + okCount/failedCount toast'ları. 400/403/500 sessiz başarı olmaz.
- **P3-F (PATCH validation):** UUID_RE check + `dbGetProductById` exists + is_active check + match_confidence 0-100 range. DB constraint 500 → 400 mapping.
- **+21 yeni test (1 yeni dosya + 5 dosya genişletme):** migration-063 (5) + matcher (3 yeni weight + plan tarifi + sertifika) + extract-route (3 empty + 1 cache + 3 product_type_id) + line-patch (6 validation) + extract-route (cert empty guard 1)
- 12 dosya · **3326 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 3b — Type-aware Extractor + Matching (2026-05-20; 3305 test) · commit `492fc0b`

- **Alt-faz şeması:** Faz 3a (classifier ✅) → 3b (extractor+matcher, BU) → 3c (review+apply) → 3d (klasik mod toggle cleanup).
- **Backend:**
  - Migration 062: `import_document_lines` (id, document_id FK CASCADE, line_number UNIQUE per doc, extraction_type CHECK, extracted_name/sku/attributes JSONB, candidate_matches JSONB, matched_product_id FK SET NULL, match_confidence 0-100, match_action CHECK 5-state, extracted_at/reviewed_at/reviewed_by) + pg_trgm GIN indexes products(name, sku) WHERE is_active.
  - Helper `src/lib/supabase/import-document-lines.ts`: dbCreateExtractedLines (bulk) + dbListLinesByDocument + dbGetLine + dbUpdateLineMatch (auto reviewed_at) + dbReplaceLinesForDocument + isValidMatchAction guard.
  - Matcher `src/lib/services/product-matcher.ts`: scoreProductMatch (SKU+40 / name_high+30 / attr_match+20 / name_partial+10, max 100) + rankProductCandidates (top-3) + decideMatchAction (≥85 matched / 60-84 pending / <60 new_product) + pure trigramSimilarity (Jaccard).
  - AI service +2 fonksiyon: `aiExtractProductsFromDocument` (multi-row catalog veya single datasheet, productType context'li system prompt + multimodal + JSON array parse + clamp + sanitize + AbortSignal forward + AbortError re-throw) + `aiExtractCertificateTarget` (single target). `parseExtractionResponse` + `parseCertificateTargetResponse` pure helper exports.
  - **AiFeature** union'a 2 yeni feature: `import_extract_products` + `import_extract_certificate` (database.types + ai-runs sync).
  - 3 yeni API route:
    - `POST /api/import/documents/[id]/extract` (requireRole admin|purchaser, doc_type routing: catalog/datasheet → product flow; certificate/compliance/test_report → cert flow; migration_excel → 400 Klasik Mod; diğer → 400 unsupported; storage download + re-extract + 4 katman hard cancel guard 499)
    - `GET /api/import/documents/[id]/lines` (auth required)
    - `PATCH /api/import/document-lines/[id]` (review override: matched/skipped/new_product/reviewed; matched zorunlu product_id; reviewed_by audit)
- **Frontend:**
  - `ClassifierQueue` "Devam Et" disabled → "İncele →" Link (extraction supported doc_type'larda) + "Klasik Mod'a geçin" CTA (migration_excel) + "Kapsam dışı" disabled (msds/vendor_profile/product_photo/unknown). Yeni pure helpers: isExtractionSupportedType, isMigrationExcelType.
  - Yeni route `/dashboard/import/extract/[documentId]` (RSC): paralel fetch doc + lines + productTypes → `ExtractionReview`.
  - `ExtractionReview` (client): doc header + product type override select + "Çıkar/Yeniden Çıkar" CTA + lines tablosu (# | name+sku | candidate dropdown | skor | durum badge | yeni/atla aksiyonu) + bulk "Eşleşmeleri Onayla" + Apply placeholder (3c). 3 pure helper exports: formatMatchAction, getMatchActionColor, pickSuggestedAction.
- **Demo + a11y:** tüm POST/PATCH demo guard'lı, aria-label tüm interaktif alanlarda, role/alert error banner.
- **AI cost:** catalog ~$0.03-0.05/extract, cert ~$0.01/extract → 100 doc/ay ~$5-10.
- **+105 yeni test (9 dosya):** migration (12) + helper (16) + matcher (18) + aiExtractProducts (16) + aiExtractCertificate (8) + extract-route (11) + lines-route (4) + line-patch (7) + helpers (13)
- 19 dosya · **3305 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 3a Review 3.e — Commit-point semantik netleştirme (2026-05-20; 3200 test)

- **P3 (commit point):** Hard cancel garantisi `dbCreateImportDocument` çağrısına KADAR geçerli. Helper başladıktan sonra 3-step orphan-safe transaction (INSERT pending → upload → UPDATE classified) kendi try/catch'i ile tamamlanır veya rollback eder; signal helper'a yayılmaz. Helper sonrası nadir orphan ihtimali 3c'deki 30-gün storage cron cleanup'ına bırakılmıştır.
- **Karar gerekçesi:** Helper'a signal yaymak ~5-10 satır + 2-3 test gerektirir ama storage cleanup async olduğu için race penceresini sıfırlamaz, sadece daraltır. Commit point semantiği daha temiz ve test yüzeyi küçük.
- **Dokümantasyon:** `dbCreateImportDocument` JSDoc'una commit-point note + `route.ts` pre-write guard yorumuna semantik açıklama. Kod davranışı değişmedi.
- 4 dosya · **3200 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 3a Review 3.d — Pre-write abort guard (auth.getUser race) (2026-05-20; 3200 test)

- **P3 (pre-write guard):** 3.c post-AI guard'dan sonra `createClient()` + `auth.getUser()` async; bu pencerede client koparsa DB+storage write yine olabiliyordu. `dbCreateImportDocument` hemen öncesi 4. signal guard eklendi → 499. Hard cancel 4 katman: pre-AI, in-AI catch, post-AI, pre-write.
- +1 test (`mockGetUser` getUser sırasında `ctl.abort()` → 499 + mockCreateDoc not called)

**Önceki:** Faz 3a Review 3.c — Server-side hard cancel (P3) + doc hijyen (2026-05-20; 3199 test)

- **P3 (server-side hard cancel):** Client `AbortController` (3.b) sadece best-effort idi — request route'a girdiyse AI çağrılır + token yakılır + DB/storage row yazılırdı. 3 katmanlı koruma:
  1. `route.ts` pre-AI guard: `req.signal.aborted` → 499, AI hiç çağrılmaz.
  2. `aiClassifyDocument(input, signal?)` → Anthropic SDK `client.messages.create(params, { signal })` (v0.80.0 RequestOptions); abort durumunda graceful fallback DEĞİL, AbortError re-throw.
  3. `route.ts` post-AI guard: AI bitti ama client gittiyse 499, `dbCreateImportDocument` çağrılmaz → orphan row yok.
- HTTP 499 ("Client Closed Request") nginx convention; client zaten response'u dinlemiyor, sadece log/telemetry için.
- +7 test (4 route + 3 ai-service)
- CLAUDE.md tarih hijyeni: `_Son güncelleme: 2026-05-19_` → `2026-05-20`.

**Önceki:** Faz 3a Review 3.b — In-flight fetch abort (P3) (2026-05-20; 3192 test)

- **P3 (in-flight fetch abort, client):** `ClassifierQueue` fetch'e `AbortSignal` geçmiyordu → classifying durumundaki kart kaldırılsa bile request devam ediyor, AI çalışıyor, `import_documents` + storage file yazılıyordu. **Çözüm (client kısmı):** per-item `AbortController` Map (`abortControllersRef`); `remove`/`clearAll`/unmount cleanup `ctl.abort()`. `uploadAndClassify` `signal.aborted` ise `{aborted:true}` döner, effect handler erken return ile yutar (UI'a hata yansımaz). Server tarafı 3.c'de tamamlandı.

**Önceki:** Faz 3a Review 3. tur — Stale file re-fetch (P2) + plan dokümanı drift (P3) (2026-05-19; 3190 test) · commit `444dced`

- **P2 (stale file re-fetch):** `ClassifierQueue.remove(id)` sadece internal queue'yu filtreliyor, parent `aiFiles` append-only. Kart × → yeni dosya ekleme → stale File parent'tan geri geliyor → duplicate POST + AI token + DB row. **Çözüm:** opsiyonel `onRemove?: (file: File) => void` prop; page.tsx `onRemove={file => setAiFiles(prev => prev.filter(f => f !== file))}`. File identity korunduğu için `!==` filter güvenli.
- **P3 (plan dokümanı drift):** `MODUL_REVIZE_PLAN.md` line 398 prompt taslağı `"confidence": 0-100` → `<0.0-1.0 float>`; `suggested_product_type` → `suggested_product_type_id` (gerçek prompt ai-service.ts:1181 ile aligned).
- **+2 test** (parent-wrapper RTL + onRemove opsiyonel backward-compat)

**Önceki:** Faz 3a Review 2. tur — 4 bulgu kapatıldı + cancelled-flag bug fix (2026-05-19; 3188 test)

- **P2 (render-phase fetch):** queue sync + concurrency driver useEffect içine taşındı; Strict Mode safety.
- **P2 yeni bug (cancelled-flag):** P2 fix sırasında useEffect cleanup `cancelled=true` her queue patch'inde in-flight fetch'leri iptal ediyordu (prod'u da kırıyordu) → `mountedRef = useRef(true)` paterni + unmount-only cleanup.
- **P3-008 ("Listeyi Temizle"):** `clearAll` handler internal `setQueue([])` + parent `onClear?.()`.
- **P3-009 (plan ↔ implementation):** `MODUL_REVIZE_PLAN.md` "sıralı" satırı bounded-parallel cap 3 olarak güncellendi.
- **P3-010 (UI interaction):** `@testing-library/react` + `jsdom` kuruldu; 5 RTL interaction testi (happy/Strict Mode/retry/remove/clear) + 7 `selectClassifyCandidates` pure helper testi (concurrency state machine extract).
- 6 dosya · +13 test · **3188 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 3a — AI Import drop-anywhere UI + multimodal classifier (2026-05-19; 3175 test) · commit `3757e48`

- **Alt-faz şeması:** Faz 3 → 3a (bu), 3b (extraction+matching), 3c (review+apply), 3d (klasik mod toggle).
- **Backend:** Migration 061 `import_documents` + helper (`dbCreateImportDocument` 3-step orphan-safe) + `aiClassifyDocument` multimodal (PDF document block, image content block, Excel text-first) + `POST /api/import/classify` (multipart, requireRole admin|purchaser).
- **Frontend:** `DropZone` + `ClassifierQueue` (concurrency cap 3, render-time scheduling — `started: boolean` flag + File identity dedup) + import sayfası tab toggle "AI ile Aktar" (default) / "Klasik Mod" (mevcut 7-adım korunur).
- **AiFeature** union'a `import_classify` (database.types + ai-runs sync). +6 pure helper export'u.
- **+77 yeni test (8 dosya, gerçek davranış — 2d Review dersi):** aiClassifyDocument (11) + pickContentBlockForMime (7) + validateClassifyUpload (10) + import-documents-helper (12) + classify-route (12) + classifier-queue (13) + dropzone-component (7) + import-documents-migration (9).
- 13 dosya · **3175 test yeşil** · TS clean · 0 lint · build OK

**Önceki:** Faz 2e İPTAL — Parti tablosu ve UI tamamen silindi (2026-05-19; 3098 test) · commit `4401d66`

- **Karar:** PMT ölçeğinde parti (heat lot / FIFO) iş gereksinimi yok; sertifika `product_attachments` ile zaten ürüne bağlı.
- **Silinenler:** Migration 060 (DROP product_batches CASCADE) + product-batches.ts helper + 2 route + ProductBatchRow type + detay sayfası partiler tabı (7→6 sekme) + 2 test dosyası.
- **Geri alma:** 059 migration + helper Faz 2a commit `b7c0227` git history'de.
- 8 dosya · **3098 test yeşil** (-21 batch test) · TS clean · 0 lint warning · build OK

**Önceki:** Faz 2d Review P3-007 — Demo guard davranış testleri (2026-05-19; 3119 test) · commit `05cc81e`

- **P3-007 KAPANDI:** `vi.stubEnv` + `@supabase/ssr` mock + gerçek `middleware(NextRequest)` koşumu ile 10 davranış testi. env true/false × demo cookie × auth user matrisi: 401 trigger doğru path'lerde, scope sızıntısı yok, default off, authenticated kullanıcı etkilenmez, literal "true" comparison.
- 1 dosya · **3119 test yeşil** (+10 davranış) · TS clean · 0 lint warning · build OK

**Önceki:** Faz 2d Review 2. tur — 3 residual kapatıldı (2026-05-19; 3109 test) · commit `6272759`

- **P3-006:** PDF/belge linki click-time refresh → `handleDownloadDocument` + `openSignedUrlInNewTab` helper; 1h TTL aşılsa da çalışır.
- **P3-005:** `ATTACHMENTS_BLOCK_DEMO_ANON` env flag — true ise middleware demo cookie + `/api/products/[id]/attachments**` 401. Default false (geriye uyumlu).
- **P3-004:** 3 yeni pure helper export (buildUploadFormData/parseAttachmentApiError/openSignedUrlInNewTab) + 13 davranış testi. Handler'lar artık extracted helper'ları çağırıyor — source-regex'ten çok güçlü.
- 7 dosya · **3109 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 2d Review — 5 P3 bulgu kapatıldı (2026-05-19; 3084 test)

- **P3-001:** `refreshSignedUrl` useCallback + header/grid/lightbox img `onError` → 1h TTL aşıldığında fresh signed URL alır, state günceller.
- **P3-002:** `attachmentsError` state + role=alert banner + "Yeniden dene" button; empty state error varken gizlenir.
- **P3-003:** `?kind=bad` → 400 (fail-closed), helper çağrılmadan reddedilir.
- **P3-004:** `parseAttachmentsResponse` + `findPrimaryImageWithUrl` pure helper export'ları + 25 yeni davranış/regression testi.
- **P3-005:** `/url` route'a SECURITY NOTE — demo + signed URL politika kararı dokümante edildi.
- 6 dosya · **3084 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 2d — Ekler sekmesi UI + signed URL endpoint (2026-05-19; 3059 test) · commit `99f3027`

- **Backend:** `dbGetSignedUrl` + `dbGetSignedUrlsForRows` (bulk `createSignedUrls`, N+1 önler) + `mapProductAttachment` mapper (file_path expose etmez; signedUrl opsiyonel 2. arg) + `ProductAttachment`/`ProductAttachmentKind` interface (`mock-data.ts`).
- **GET shape değişimi:** `/api/products/[id]/attachments` artık `{ items, expires_in: 3600 }` döner (eskiden raw array). Her item bulk signed URL ile enriched. `dynamic="force-dynamic"`.
- **Yeni endpoint:** `GET /api/products/[id]/attachments/[attachmentId]/url` — tekil signed URL (header img refresh için). 400/404/500 mapping.
- **Detay sayfası UI:** 5 pure helper export (formatFileSize/getKindLabel/getKindIcon/pickInitialKind/groupAttachments) + 6 state + fetchAttachments + header 80×80 görsel (primary varsa img, yoksa "Görsel yok") + Ekler tab (upload bar / images grid 140×140 thumbnails star+× / documents list İndir+Sil) + lightbox modal (role=dialog aria-modal, ESC + backdrop + scroll lock + focus return) + 3 demo guard'lı handler. Tab `locked: false`. `ATTACHMENT_ACCEPT` client-safe constant (server-only `ALLOWED_MIME` import EDİLMEDİ).
- **MIME→kind otomatik öneri:** file seçilince `pickInitialKind(f.type)` kind state'i override eder.
- **Versiyonlama Faz 3'e ertelendi:** helper `is("superseded_by", null)` zaten filtreliyor.
- **+44 test (5 dosya):** mapper (5) + helpers (18) + url-route (7) + list-signed-url (3) + page-ekler (14).
- 8 dosya · **3059 test yeşil** · TS clean · 0 lint warning · build OK

**Önceki:** Faz 2c Review — Tüm P3 bulgular kapatıldı (2026-05-19; 3015 test) · commit `e23baab`

- **P3-003 KAPANDI:** `getMissingRequiredAttributes` pure helper → `handleCreate` + `handleSave` zorunlu alan validasyonu (eksikse Türkçe toast).
- **P3-005 KAPANDI:** `createTypeFieldsError` state — fetch başarısız olursa `role="alert"` banner.
- **P3-004 KAPANDI:** Source-regex ağırlıklı testler → 15 gerçek mantık testi (undefined/null/empty/multiselect senaryoları).

**Önceki:** Faz 2c Review — P2-001 + P2-002 kapanış (2026-05-19; 2990 test) · commit `0c4cf39`

**Önceki:** Faz 2c — Teknik sekmesi dinamik alan rendering (2026-05-19; 2974 test) · commit `6846584`

**Önceki:** Faz 2b Review — 3 bulgu kapatma (2026-05-19; 2935 test) · commit `96d8371`

**Önceki önceki:** Faz 2b — Tam ekran ürün detay sayfası + drawer kaldırma (2026-05-19; 2930 test) · commit `9003044`

**Modül Revize Faz 1 (14 dosya: 2 migration + 2 yeni helper/route paketi + admin paneli + 3 test):**
- **Migration 056** (`supabase/migrations/056_product_types.sql`): `product_types` tablosu (id/name/description/icon/sort_order/is_system) + `product_type_fields` tablosu (id/product_type_id FK CASCADE/field_key regex CHECK/label_tr/label_en/field_type 7-enum CHECK/unit/options jsonb/required/placeholder/help_text/sort_order). RLS service_role + `updated_at` triggers. `products` ALTER: `product_type_id uuid FK ON DELETE SET NULL` (nullable, geriye uyumlu) + `attributes jsonb NOT NULL DEFAULT '{}'`. GIN index attributes üzerinde. Idempotent + ROLLBACK SQL bloğu.
- **Migration 057** (`supabase/migrations/057_seed_product_types.sql`): 8 hazır tip insert (Vana/Conta/Flans/Fitting/Bağlantı Elemanı/Enstrüman/Sızdırmazlık Malzemesi/Diğer) — deterministik UUID'ler `00000000-0000-4000-8000-00000000000{1..8}`. Vana 16 alan, Conta 13, Flans 9, Fitting 7, Bağlantı Elemanı 8, Enstrüman 8, Sızdırmazlık Malzemesi 7, Diğer boş. PN/sınıf select options (PN6-160, 150LB-4500LB), valve_type/flange_type/face_type/fitting_type select listeleri, approvals/standards multiselect listeleri. Idempotent `ON CONFLICT DO NOTHING`.
- **Database tipleri** (`src/lib/database.types.ts`): `ProductFieldType` enum + `ProductTypeRow` + `ProductTypeFieldRow` interface'leri eklendi. `ProductRow`'a `product_type_id: string | null` ve `attributes: Record<string, unknown>` alanları eklendi.
- **Frontend tipleri** (`src/lib/mock-data.ts`): `ProductType`, `ProductTypeField`, `ProductTypeWithFields` + `Product.productTypeId/attributes` alanları.
- **API-mappers** (`src/lib/api-mappers.ts`): `mapProductType()`, `mapProductTypeField()` fonksiyonları + `mapProduct()` extension (productTypeId, attributes).
- **Helper** (`src/lib/supabase/product-types.ts`): `dbListProductTypes`, `dbGetProductType`, `dbGetProductTypeWithFields`, `dbListProductTypeFields`, `dbCreateProductType`, `dbUpdateProductType`, `dbDeleteProductType` (sistem tipi + bağlı ürün guard'ları), `dbAddProductTypeField`, `dbUpdateProductTypeField`, `dbDeleteProductTypeField`, `dbReorderProductTypeFields`, `dbReorderProductTypes`. Validation: `isValidFieldKey` regex (`/^[a-z][a-z0-9_]*$/`), `isValidFieldType` (7 enum), options array check, name max 100 char. Audit log her CRUD'da. Sistem tipi düzenlenince `is_system=false` kilidi düşer.
- **API routes** (`/api/product-types/*`): GET liste (60s cache), POST/PUT admin, `[id]` GET (withFields=1 destekli) + PATCH + DELETE admin, `[id]/fields` GET+POST+PUT(reorder) admin, `[id]/fields/[fieldId]` PATCH+DELETE admin. `requireRole(["admin"])` mutasyon guard'ları, `handleApiError` mapping, 404/409/400 status'lar (sistem tipi → 409, bağlı ürün → 409, validation → 400).
- **Admin paneli** (`/dashboard/settings/product-types`): Liste sayfası — kart görünümü (icon + ad + alan sayısı + SİSTEM rozeti + açıklama), "Yeni Tip Ekle" modal'ı (ad + icon + açıklama). Detay sayfası — tip başlığı düzenleme + alanlar tablosu (anahtar/etiket TR-EN/tip/birim/zorunlu/yukarı-aşağı-sil işlemleri) + yeni alan ekle formu (dinamik: number → unit input, select/multiselect → options textarea). Demo guard + a11y (role="dialog"/aria-modal/aria-label/aria-live). Sidebar'a "Ürün Tipleri" linki.
- **+61 yeni test (3 dosya):** `product-types-helper.test.ts` (16: pure helpers 8 + create/field validation 5 + reorder 2 + delete guards 2), `product-types-route.test.ts` (33: GET 1 + POST 4 + PUT 4 + GET/[id] 2 + PATCH/[id] 3 + DELETE/[id] 4 + GET fields 2 + POST fields 5 + PUT fields 4 + PATCH field 3 + DELETE field 3), `product-types-seed.test.ts` (12: schema 4 + 8 hazır tip 6 — Vana/Conta/Flans/Fitting/Enstrüman alan setleri + idempotent guard).
- 183 dosya · **2855 test yeşil** · TS clean · 0 lint warning · build OK
- **Faz 1 hedefi:** Dinamik şema altyapısı — Faz 2 (ürün sayfası), Faz 3 (AI Import yenileme), Faz 4 (teklif modülü revize) bu altyapı üzerine inşa edilir.
- **Kalıcı plan dosyası:** `MODUL_REVIZE_PLAN.md` — Faz 2-4 detay şeması burada (DB tabloları, alan listeleri, akış diyagramları, kabul kriterleri).

**Önceki:** Genel Pagination — 6 liste sayfasına sayfa başına 50 kayıt + numaralı sayfalama (2026-05-18; 2794 test)

**Genel Pagination (8 dosya: 3 yeni + 5 modifiye + 1 + integration test):**
- **`src/hooks/usePagination.ts`** (YENİ): `PAGE_SIZE=50` sabit + generic `usePagination<T>(items, { pageSize?, resetKey? })` hook. Pure helper'lar export edilir: `computeTotalPages`, `clampPage`, `slicePage` (test edilebilir). `resetKey` değişince render-time "Adjusting state based on prop change" paterniyle page=1'e döner (React 19 `set-state-in-effect` kuralı için useEffect kullanılmıyor — `prevResetKey` state ile karşılaştırma). Filtre daraldığında `safePage = clampPage(currentPage, totalPages)` derived clamp (state yazımı yok).
- **`src/components/ui/Pagination.tsx`** (YENİ, client): A11y-first numaralı sayfalama UI. Pure helper export: `buildPageWindow(current, total): (number | "…")[]` — `total<=7 → tüm sayfalar`; aksi halde `1, current±2, total` + gap'lerde `"…"`. `totalPages<=1 → null` (auto-hide). Info text (sol): `{X}-{Y} / {total} {itemLabel}`. Kontroller (sağ): `‹ Önceki` · windowed numbers · `Sonraki ›` (prev/next disabled state). Aktif sayfa: `aria-current="page"` + `var(--accent-bg)`. Ellipsis: `<span aria-hidden>` (button değil). `<nav aria-label="Sayfalama">` wrapper. Inline CSS + CSS variables (proje paterni).
- **6 liste sayfasına entegrasyon** (kanonik 3-satır değişiklik: import + `usePagination` çağrısı + `filtered.map` → `pagedItems.map` + Pagination component'i `</table>` sonrasına):
  - `vendors/page.tsx` — `resetKey: search|showAll`, `itemLabel="tedarikçi"`
  - `purchase/orders/page.tsx` — `resetKey: search|activeTab`, `itemLabel="sipariş"`
  - `quotes/page.tsx` — `resetKey: activeTab|search|currencyFilter|dateFrom|dateTo`, `itemLabel="teklif"`
  - `customers/page.tsx` — `mockCustomers.filter(...)` inline çağrı `useMemo` ile sarmalandı (referans stabilitesi); `resetKey: activeFilter|search`, `itemLabel="müşteri"`
  - `orders/page.tsx` — `resetKey: activeTab|search|customerIdFilter|dateFrom|dateTo|currencyFilter`, `itemLabel="sipariş"`
  - `products/page.tsx` — multi-filter `resetKey: search|alertFilter|selectedCategories|filterManufactured|filterCommercial`, `itemLabel="ürün"`. Üst sayaçlar (kritik/risk/uyarı counts) `mockProducts` toplamlarından — sayfa başına değil, doğru UX.
- **+39 yeni test (3 dosya):** `use-pagination.test.ts` (16: PAGE_SIZE export + pure helper'lar — computeTotalPages 5, clampPage 4, slicePage 5), `pagination-component.test.ts` (17: module load 1 + buildPageWindow 5 + renderToStaticMarkup smoke 11 — null render, info text 4 varyant, a11y nav/aria-current/aria-label, prev/next disabled, ellipsis span), `pagination-integration.test.ts` (6: tüm liste sayfalarında `usePagination` + `Pagination` import + `pagedItems.map(...)` + `filtered.map(...)` regression lock + itemLabel kontrol).
- 180 dosya · **2794 test yeşil** · TS clean · 0 lint warning · build OK · Migration yok, API yok — sadece frontend client-side slicing
- **Karar — Client-side pagination:** DataContext zaten tüm aktif veriyi `?all=1` ile çekiyor; filtre/arama in-memory yapılıyor → pagination da in-memory. API/backend dokunulmadı. Hook generic return shape sayesinde server-side'a migrate edilirse UI değişmez.

**Önceki:** Faz 10 Review Bulgu — DB hata yutma kapatıldı (2026-05-18; 2755 test)

**Faz 10 Review (P2 reliability, 2 dosya):**
- **P2 KAPANDI — `dbGetOpenShortagesByProductId` hata yutma**: `if (error || !data) return []` → Supabase DB/permission/query hatası sessizce boş array dönüyordu; route 200 `{ items: [] }` üretiyor, drawer "Açık shortage kalmadı (uyarı yakında otomatik kapanacak)" empty branch'ine düşüp kullanıcıyı yanıltıyordu. **Düzeltme:** `if (error) throw new Error(...); if (!data) return [];` — error explicit throw, defensive `data=null` (beklenmeyen durum) için empty kalır. handleApiError zaten 500 maps; drawer `shortageError` set → "Açık shortage kalmadı" branch'i tetiklenmez ("eksik yok" ≠ "DB hatası").
- **Test güncellemesi**: `products-shortages-helper.test.ts` "supabase error → empty array" testi "supabase error → throw" olarak değiştirildi (`rejects.toThrow(/db fail/)`).
- 177 dosya · 2755 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Faz 10 — order_shortage drawer (M3: bilgi yoğunluğu + iki yönlendirme) (2026-05-18; 2755 test)

**Faz 10 (6 dosya: 4 yeni + 2 modifiye):**
- **`src/lib/supabase/products.ts`** (yeni helper): `dbGetOpenShortagesByProductId(productId): Promise<OpenShortageDetailRow[]>` — `shortages` + `sales_orders!inner` JOIN; filtreler: `status='open'`, `commercial_status='approved'`, `product_id=$1`. Sıralama: `createdAt DESC` (en yeni shortage üstte). PostgREST many-to-one ARRAY shape defensive normalize (`sales_orders` object|array hep tek nesne). `OpenShortageDetailRow` interface: `shortageId/orderId/orderNumber/customerId/customerName/requestedQty/availableQty/shortageQty/createdAt`.
- **`src/app/api/products/[id]/shortages/route.ts`** (YENİ): `GET` endpoint — helper'ı çağırır, `{ items, totalShortage }` döner. Auth: middleware `/api/**`; demo modda GET izinli (read-only). `handleApiError` mapping.
- **`src/app/dashboard/alerts/page.tsx`** (3 değişiklik):
  - **`drawerActionLinks` order_shortage güncellemesi:** Plan §9.4.4 — "Üretim emri başlat (yeni sekmede)" primary CTA → `/dashboard/production?productId={entityId}&qty={extractShortageQty}` + `newTab: true`. "Satın alma planla" secondary. Eski "Siparişleri incele" primary kaldırıldı. Link tipine `newTab?: boolean` eklendi.
  - **`AlertDetailDrawer` yeni İLGİLİ SİPARİŞLER bölümü** (yalnız `hasOrderShortage && !group.isOrphaned`): drawer açıldığında `fetch /api/products/{entityId}/shortages` (void async IIFE — `react-hooks/set-state-in-effect` kuralı için proje paterni; `cancelled` flag ile cleanup). 4 dal: loading → error (role=alert, aria-live) → empty (race) → list. Liste satırları: `order_number` (monospace) + `customer_name` + `{shortageQty} {unit} eksik` (danger color) + "İhtiyaç: X · Mevcut: Y →" alt satır + tüm satır clickable Link → `/dashboard/orders/{orderId}` (aria-label: `{orderNumber} siparişine git (eksik X)`). DoD: drawer "tek başına yeterli bilgi" — kullanıcı linke tıklamadan kararını verebilir.
  - **actionLink render:** `link.newTab` → `target="_blank"` + `rel="noopener"` + "↗" işareti (varsayılan "→").
- **`src/app/dashboard/production/page.tsx`** (Suspense wrapper + prefill):
  - Pure helper export: `prefillLineFromQuery(productId, qty, activeIds)` — productId aktif değilse veya yoksa `null`; qty pozitif int/decimal değilse `""` fallback; 0/negatif/alfa reddedilir.
  - `ProductionPage` → `ProductionPageInner` rename; default export Suspense wrapper (`useSearchParams` Next.js 15 requirement).
  - `useSearchParams` ile `?productId=...&qty=...` parse; `prefilledRef` guard ile tek seferlik prefill; products yüklendiğinde useEffect tetiklenir; ilk satır boşsa override, doluysa prepend; toast bilgilendirmesi.
- **+34 yeni test (4 dosya):** `products-shortages-helper.test.ts` (7: empty/error/null/DESC sıralama/PostgREST array shape/sales_orders null skip/alan mapping), `products-shortages-route.test.ts` (4: happy 2-row/empty/throw→500/totalShortage hesaplama), `alerts-order-shortage-drawer.test.ts` (9: drawerActionLinks order_shortage/eski Siparişleri incele kaldırıldı/hasOrderShortage state/fetch /api/products/X/shortages/İLGİLİ SİPARİŞLER conditional render/4 dal/list satır içeriği/aria-label/newTab target rel/orphan guard), `production-prefill.test.ts` (14: prefillLineFromQuery 7 pure helper davranış + production page 7 source-regex Suspense wrapper/useSearchParams/prefilledRef guard/products.length=0 erken return/firstEmpty pattern).
- 177 dosya · 2755 test yeşil · TS clean · 0 lint warning · build OK · yeni route: `GET /api/products/[id]/shortages` + `/dashboard/production?productId&qty` deep link

**Önceki:** Faz 9 Review Bulgular — P2 veri minimizasyonu + P3 gerçek render testi (2026-05-18; 2721 test)

**Faz 9 Review Bulgular (4 dosya):**
- **P2 KAPANDI — Veri minimizasyonu (gizlilik)**: `print/page.tsx` `dbListAllActiveProducts()` çağırıyordu — tüm aktif ürün kataloğu (35 alanlı `ProductRow`: `cost_price`, `parasut_*`, `on_hand`, `reserved`, `product_notes`, `daily_usage`, ...) RSC payload'ı üzerinden client'a serialize ediliyordu. Belge yalnızca PO satırlarındaki ürünlerin `id/sku/name/unit` 4 alanını kullanıyor. **Düzeltme:** `products.ts`'e yeni `dbGetProductRefsByIds(ids: string[]): Promise<ProductRef[]>` helper'ı eklendi (`.select("id, sku, name, unit").in("id", ids)`); empty ids → `[]` early return. `PurchaseOrderDocument` prop tipi `ProductRow[]` → `ProductRef[]` daraltıldı. `print/page.tsx` `dbListAllActiveProducts()` çağrısı `dbGetProductRefsByIds(Array.from(new Set(po.lines.map(l => l.product_id))))` ile değiştirildi (Set ile dedup; aynı ürün birden fazla satırda olabilir).
- **P3 KAPANDI — Gerçek render smoke testi (renderToStaticMarkup)**: Önceki testler source-regex'e dayanıyordu, JSX/DOM bug'ları, conditional render kırılmaları, leak regression'ları yakalamıyordu. **Düzeltme:** `react-dom/server.renderToStaticMarkup` kullanılarak vitest `environment: "node"` ortamında jsdom-free real render testleri eklendi (dep gerektirmez, mevcut Next.js dep'i yeterli). Test paterni: `vi.mock("next/link")` plain `<a>` stub + fixture helper'ları (`makePoFixture`/`makeVendorFixture`/`makeCompanyFixture`/`makeProductRefs`) + `renderDoc()` async helper'ı. Test grupları: (a) **render content** — po_number/vendor/SKU'lar/totaller HTML'de; (b) **conditional branches** — cancelled vs default (İPTAL EDİLDİ badge), cancel_reason var/yok, notes dolu/null, logo dolu/null/company null, vendor null; (c) **toolbar print-gizleme** — `po-no-print` class + window.print() button + Siparişe Dön href; (d) **leak absence (defense-in-depth)** — `secret-user-uuid-leakage-test`, `VENDOR_INTERNAL_NOTES_SHOULD_NOT_LEAK`, `received_qty`, `cost_price`, `parasut_product_id`, `on_hand`, `reserved`, `product_notes`, `daily_usage` substring'lerinin rendered HTML'de bulunmadığı assert edilir.
- **`purchase-order-print-page.test.ts`** — source-regex güncellendi: `dbListAllActiveProducts` import edilmemeli (P2 leak fix lock); `po.lines.map(l => l.product_id)` + `new Set` dedup pattern'i mevcut.
- **+24 yeni test:** Real render: PO bilgisi/vendor/satırlar (5), conditional branches (10), toolbar print-gizleme (3), leak absence (4) + paralel fetch + dedup source-regex (2).
- 173 dosya · 2721 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Faz 9 — PO PDF Render (server-side HTML print) (2026-05-18; 2697 test)

**Faz 9 (4 dosya: 3 yeni + 1 düzenleme):**
- **`src/components/purchase/PurchaseOrderDocument.tsx`** (YENİ, client component): A4 portrait print belgesi. Header (logo + şirket adı + V.D./VKN + adres + iletişim) → title band ("SATIN ALMA SİPARİŞİ") → meta grid (PO no/tarih/beklenen/durum/currency + tedarikçi adı/iletişim/VKN/ödeme vadesi) → lines tablosu (# / SKU / ürün / adet+unit / birim fiyat / iskonto / satır toplamı) → totals (ara toplam/KDV/genel toplam, currency-aware Intl) → notlar (po.notes varsa) → cancel sebebi (cancelled durumunda). `@page A4 portrait` + `@media print` CSS `dangerouslySetInnerHTML` ile. Logo: `<img>` (next/image yerine bilinçli — `QuoteDocument` paterniyle aynı, eslint-disable yorumu). Toolbar: "← Siparişe Dön" Link + "📄 Yazdır / PDF Olarak Kaydet" button (`window.print()`); print'te `.po-no-print` ile gizlenir. **Güvenlik (§12):** `po.created_by`, `audit_log`, `lines[].received_qty`, `vendor.notes`, `vendor.is_active` DOM'a yazılmaz. Cancelled PO: `İPTAL EDİLDİ` badge prominently + `cancel_reason` küçük not. Export'lu pure helper: `formatPoCurrency(amount, currency)` (Intl tr-TR + fallback) + `formatPoDate(iso)` (DD.MM.YYYY).
- **`src/app/dashboard/purchase/orders/[id]/print/page.tsx`** (YENİ, RSC): Server component. `dbGetPurchaseOrderById(id)` → null ise `notFound()`. Sonra `Promise.all([dbGetVendorById, dbGetCompanySettings, dbGetProductRefsByIds])` paralel fetch → `<PurchaseOrderDocument>` mount. `export const dynamic = "force-dynamic"`. Tek server round-trip.
- **`src/app/dashboard/purchase/orders/[id]/page.tsx`**: action button satırına Link butonu (📄 Yazdır / PDF, target=_blank, demo izinli).
- **+25 test (2 dosya):** module load + formatPoCurrency/formatPoDate pure + source-regex print CSS/status labels/conditional render/güvenlik (Faz 9 Review ile +24 gerçek render = toplam 49 yeni test).
- Migration yok. Yeni route: `/dashboard/purchase/orders/[id]/print`

**Önceki:** Faz 8 Review Bulgular — 5 bulgu + payload/slice testleri (2026-05-17–18; 2672 test)

**Faz 8 Review Bulgular (5 dosya + 2 migration güncelleme):**
- **P2 KAPANDI — zero-width/bidi bypass** (`src/lib/ai-guards.ts`): `sanitizeFeedbackForPrompt`'a step 1a eklendi: `ZERO_WIDTH_AND_BIDI_RE` → empty — `syste​m:` → `system:` → step 3 yakalar. +2 test (U+200B bypass + BOM/bidi).
- **P2 KAPANDI — PostgreSQL PUBLIC execute** (`supabase/migrations/054` + `055`): Migration 054'e `REVOKE ALL FROM public, anon, authenticated` eklendi (039 pattern). Migration 055 `public, anon, authenticated` üçünü revoke edecek şekilde genişletildi (önceki: sadece `authenticated`).
- **P3-001 KAPANDI — Plan-migration hizalandı**: `purchase-aksiyon-plan.md` line 261'deki `af.created_at >= now()` cutoff → `ar.decided_at >= now()`.
- **P3-003 KAPANDI — C0 kontrol karakterleri kaldırıldı**: `purchase-aksiyon-plan.md` line 1587'deki NUL (0x00) + Unit Separator (0x1F) → U+0000/U+001F escape sequence. `rg` artık dosyayı binary görmez.
- **P3-004 KAPANDI — Defense-in-depth re-sanitize** (`src/lib/services/ai-service.ts`): `sanitizedItems` map'inde `recentRejections` artık `sanitizeFeedbackForPrompt` ile yeniden geçiriliyor. Import eklendi.
- 172 dosya · 2672 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Faz 8 — AI rejection feedback prompt entegrasyonu (2026-05-17; 2665 test)

**Faz 8 (1 commit, 6 dosya + 1 migration):**
- **Migration 054** (`supabase/migrations/054_ai_feedback_recent_rejections_rpc.sql`): `get_recent_rejections_for_products(p_product_ids uuid[], p_limit int)` RPC — `ROW_NUMBER PARTITION BY entity_id` ile her ürün için son N (default 3) rejection notunu döner. SQL-side filtreler: `entity_type='product'`, `recommendation_type='purchase_suggestion'`, `feedback_type='rejected'`, `feedback_note IS NOT NULL AND <> ''`, `decided_at >= NOW() - INTERVAL '90 days'`. `STABLE` + `SECURITY DEFINER` + `REVOKE ALL FROM public, anon, authenticated` + `GRANT EXECUTE TO service_role`. Idempotent + ROLLBACK SQL.
- **`src/lib/ai-guards.ts`**: yeni `sanitizeFeedbackForPrompt(raw)` export — 5-katmanlı sanitize (C0+DEL+U+2028/U+2029 → boşluk, triple-backtick → `''`, role marker (system/assistant/user):* strip case-insensitive, whitespace normalize, 200-char cap + `…`). Mevcut `sanitizeAiInput`/`sanitizeAiOutput` regex'leri de `new RegExp(...)` constructor pattern'ine taşındı — kaynak dosyaya yanlışlıkla binary kontrol karakter sızması/destrüktif Write riskine karşı sağlamlaştırma.
- **`src/lib/supabase/ai-feedback.ts`** (yeni): `dbGetRecentRejectionsForProducts(productIds, limit=3): Promise<Map<string, string[]>>` — RPC çağrısı + per-row sanitize + boş sanitize sonuçları drop. Empty input → boş Map (RPC çağrılmaz).
- **`src/lib/services/ai-service.ts`**: `PurchaseSuggestionItem`'a opsiyonel `recentRejections?: string[]` alanı; `PURCHASE_COPILOT_SYSTEM` prompt'una "Bağlamsal not — recentRejections" clause'u (notları muhakemede kullan, çıktıya echo etme, alan yoksa kuralı yok say). `sanitizedItems` map'inde `recentRejections` `sanitizeFeedbackForPrompt` ile yeniden sanitize edilir (defense-in-depth; boş sonuçlar filter ile atılır).
- **`src/app/api/ai/purchase-copilot/route.ts`**: `aiEnrichPurchaseSuggestions(needsAiItems)` çağrısından önce `dbGetRecentRejectionsForProducts(needsAiItems.map(i=>i.productId), 3)` — try/catch içinde, başarısızlık non-fatal (graceful degradation, mevcut pattern). Map'ten alınan notlar items'a inject edilir; `notes.length > 0` koşulu — empty array durumunda alan JSON'a hiç yazılmaz (token tasarrufu).
- **+19 yeni test (3 dosya):** `ai-feedback-sanitize.test.ts` (9: 8 saldırı vektörü + 1 defansif join), `ai-feedback-bulk-fetch.test.ts` (6: empty/single/50-bulk/error/sanitize-drop/multi-note), `ai-feedback-prompt-integration.test.ts` (4: 0-rejection/3-rejection/RPC-throw-degrade/output-contract).
- 171 dosya · 2665 test (review + payload + slice testleri sonrası 2672) yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Faz 7 Kapanış — P2 takvim validasyonu + P3 server-side alert resolve (tam) (2026-05-17; 2646 test)

**Faz 7 Kapanış (1 commit, 5 dosya):**
- **P2 BUG FIX — Strict takvim validasyonu** (`src/app/api/orders/[id]/ship/route.ts`): `shipDate` için regex check'ten sonra Date roundtrip guard eklendi — `2026-02-31` (JS normalizasyonu → Mar 3) ve `2026-99-99` (RangeError) artık `dbShipOrderFull` RPC çalışmadan 400 döner.
- **P3 GÜVENİLİRLİK — İki katmanlı alert resolve:** (1) `route.ts`: `dbBatchResolveAlerts` fire-and-forget → `await .catch(log)` — normal başarı yolunda 200 dönmeden önce alert resolve garantili. (2) `alert-service.ts` `serviceCheckOverdueShipments`: güvenlik ağı eklendi — `dbListOverdueShipments` listesinde artık olmayan siparişlerin aktif `overdue_shipment` alertleri CRON'da toplu resolve edilir (Promise.all paralel fetch, `toResolve: BatchResolveEntry[]` liste). `{ alerted, resolved }` dönüş tipi. Ship endpoint başarısız olsa bile en geç 6 saatte temizlenir.
- Client-side `PATCH /api/alerts/${alert.id}` bloğu `alerts/page.tsx` `handleShip`'ten kaldırıldı.
- **+5 test:** `alerts-overdue-ship.test.ts` (+3: takvim overflow × 2, P3 resolved assert), `overdue-shipments-service.test.ts` (+2: stale alert resolve, stale+yeni mix) + mock güncelleme + 5 mevcut test `resolved` alanı için güncellendi.
- 168 dosya · 2646 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Faz 7 — overdue_shipment alert inline ship form (2026-05-16; 2641 test)

**Faz 7 (1 commit, 6 dosya + 1 migration):**
- **Migration 053** (`supabase/migrations/053_orders_ship_meta.sql`): `sales_orders.shipment_tracking_number TEXT NULL` + `shipment_carrier TEXT NULL`. Idempotent, ROLLBACK SQL yorum bloğu.
- **`database.types.ts`**: `SalesOrderRow`'a 2 yeni alan.
- **`ShipMeta` interface + `serviceTransitionOrder` genişletme** (`order-service.ts`): 3. opsiyonel param `shipMeta?: { shipDate?, trackingNumber?, carrier? }`. Shipped branch patch'i: `shipped_at` override + `shipment_tracking_number` + `shipment_carrier` persist. Geriye uyumlu (mevcut callers shipMeta undefined → eski davranış).
- **Yeni `POST /api/orders/[id]/ship`** endpoint (`src/app/api/orders/[id]/ship/route.ts`): body validation (shipDate ISO format zorunlu; trackingNumber/carrier max 100 char opsiyonel); `serviceTransitionOrder(id, "shipped", shipMeta)` çağrısı; Paraşüt sync + email notification fire-and-forget; `revalidateTag("products","max")`.
- **`/dashboard/alerts` güncellemesi** (`page.tsx`): `actionFor()` `overdue_shipment` case eklendi (plan §9.4.1 — "Sevkiyatı yönet" + "/dashboard/orders"). `OrderAlertDrawer`: `onShipped` callback prop, `isOverdueShipment` branch, inline ship form (shipDate/trackingNumber/carrier state, `handleShip` handler, demo guard, `aria-label` + `role="alert"` error, "Sevk Et" butonu). Best-effort alert PATCH resolve.
- **Test (`alerts-overdue-ship.test.ts`, 12 test):** 8 endpoint testi (shipDate eksik/geçersiz/trackingNumber uzun/carrier uzun/sipariş yok/approved değil/happy path + ShipMeta/Paraşüt sync) + 4 source-regression (actionFor case + drawer markup + onShipped prop).
- 168 dosya · 2641 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Faz 6 Kapanış — unit_price=0 bug fix + linkedPOs shape regression testleri (2026-05-16; 2629 test)

**Faz 6 Kapanış (1 commit, 4 dosya):**
- **P2 BUG FIX — unit_price=0 Modal bypass kapatıldı**: `PurchaseOrderModal.tsx` + `from-recommendations/route.ts` + `validatePoLines` içindeki `price < 0` guard'ları `price <= 0` yapıldı. Modal `Number("")=0` dönüştürmesi ile 0 TRY siparişi DB'ye yazılabiliyordu; backend artık 0'ı da reddediyor.
- **P3a — linkedPOs shape regression testleri (2 yeni)**: `dbGetPOsByRecommendationIds` PostgREST object-vs-array normalize kodu artık doğrudan test edildi — `purchase_order_lines` object shape + `purchase_orders` object shape edge case'leri.
- **P3b (vendor fallback)** ve **P3c (PO→öneri link)** plan kapsamı dışı — Faz 6 kapatıldı.
- 167 dosya · 2629 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Purchase&Alert Faz 6 Bulgular 1. Tur — duplicate guard + shape normalize + silent zero + UX (2026-05-16; 2626 test)

**Faz 6 Bulgular 1. Tur (1 commit, 6 dosya):**
- **P2.1 Duplicate PO guard** — 3 katmanlı: (1) service-side (`serviceCreatePOFromRecommendations`'da `dbGetPOsByRecommendationIds` kontrolü; cancelled PO bypass; "aktif siparişe bağlı" throw), (2) UI-side (`RecActionCell` `hasActivePO` guard; `disabled={isDemo || hasActivePO}`; tooltip), (3) bulk filter (`acceptedAndEditedCount` + `handleBulkPo` aktif PO'lu rec'leri dışlar).
- **P2.2 Response shape normalize** (`dbGetPOsByRecommendationIds`): PostgREST many-to-one select object veya array dönebilir; her iki shape defensive handle edildi (polArr + pos array normalization). Canlı sessiz boş Map riski kapatıldı.
- **P2.3 Silent zero reject** (`from-recommendations/route.ts`): `quantity` ve `unit_price` için `null`/`undefined`/`""` explicit reject eklendi (`Number(null)===0` tuzağı). `discount_pct === ""` reject. Catch block'a `"aktif siparişe bağlı"` → 400 eklendi.
- **P3.4 Service direkt testler** (3): `vi.importActual` ile gerçek `serviceCreatePOFromRecommendations`; `@/lib/supabase/recommendations` modül mock'u eklendi (`mockDbListRecs`, `mockDbUpdateRecStatus`). qty=suggestQty→accepted, qty≠suggestQty→edited, aktif PO→throw.
- **P3.4 Silent zero test coverage** (2): `unit_price: null → 400`, `unit_price: "" → 400`.
- **P3.4 Toast action prop** (`Toast.tsx`): opsiyonel `action?: { label: string; href: string }` alanı; render'da link. Geriye uyumlu.
- **P3.4 "Siparişe git" toast action** (`suggested/page.tsx` `onSuccess`): başarılı PO toast'ına `action: { label: "Siparişe git", href: /dashboard/purchase/orders/${poId} }`.
- 167 dosya · 2626 test yeşil · TS clean · 0 lint warning · build OK

**Faz 6 (1 commit, 9 dosya):**
- **`dbGetPOsByRecommendationIds`** (`purchase-orders.ts`): `LinkedPO` interface + junction reverse lookup helper (`po_line_recommendations → purchase_order_lines → purchase_orders`; single `.in()` query, JS-side PO dedup). Type cast `unknown` ile Supabase nested array uyumu sağlandı.
- **`serviceCreatePOFromRecommendations`** (`purchase-order-service.ts`): rec doğrulama (statusIn: suggested/accepted/edited, rec type=purchase_suggestion, entity_type=product) + `dbCreatePurchaseOrder` RPC çağrısı (`source_recommendation_ids: [recId]` ile junction atomik insert) + best-effort suggested→accepted/edited status patch (try/catch; PO atomik, patch fail izlenebilir).
- **`POST /api/purchase-orders/from-recommendations`** (yeni route): `requireRole(["admin","purchaser"])`, vendor_id UUID validation, currency whitelist (TRY/USD/EUR), lines array validation (recommendation_id UUID, qty pozitif integer, price≥0, discount_pct 0–100), `revalidateTag("purchase-orders","max")` + `revalidateTag("products","max")`, hata mapping (bulunamadı/pasif/purchase_suggestion/ürün ile ilişkili → 400).
- **`purchase-copilot/route.ts`** güncellendi: `LinkedPO` import + tüm rec ID'leri için `dbGetPOsByRecommendationIds` reverse lookup (try/catch non-fatal) + RecRef'e `linkedPOs: LinkedPO[]` alanı (4 return site).
- **`PurchaseOrderModal.tsx`** (yeni component): drawer-style modal (right-side fixed, z-index 201, backdrop). Props: `open, onClose, mode("single"|"bulk-vendor"|"bulk-orphan"), initialItems: ModalItem[], vendors: VendorOption[], onSuccess, lockedVendorId?`. Vendor auto-fill → currency + expectedDate. Submit → `POST /api/purchase-orders/from-recommendations` → onSuccess. Demo guard + a11y (role="dialog", aria-modal, aria-label tüm inputlarda, error role="alert" aria-live).
- **`mock-data.ts` + `api-mappers.ts`**: `Product.preferredVendorId?: string | null` eklendi; `preferred_vendor_id` uuid FK mapped.
- **`suggested/page.tsx`** güncellendi: `RecEntry.linkedPOs?: LinkedPO[]`; `loadAiData` linkedPOs mapping; vendors state + fetch; `poModalState` + `_bulkQueue` state; `handleOpenPoModal` / `handleBulkPo` / `advanceBulkQueue` handlers; `acceptedAndEditedCount` computed; Bulk CTA bar (acceptedAndEditedCount>0); RecActionCell `onOpenPoModal` prop + `linkedPOs` display + "📋 Sipariş Aç" button (suggested/accepted/edited); PurchaseOrderModal mount.
- **`po-from-recommendations.test.ts`** (yeni, 11 test): helper boş/dolu/dedup (3) + route viewer→403 + geçersiz UUID→400 + service throw→400 + vendor pasif→400 + başarı 201 + revalidateTag (2) + doğru argümanlar + currency whitelist.
- 167 dosya · 2621 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Purchase&Alert Faz 5 — PO Mal Kabul (2026-05-16; 2610 test)

**Faz 5 (1 commit, 6 dosya):**
- **Migration 051** (`supabase/migrations/051_po_receive_rpc.sql`): `receive_po_lines(p_po_id, p_lines jsonb, p_actor)` RPC — `FOR UPDATE` lock (aşırı kabul önleme), her line için `received_qty` artış + `on_hand` artış + `inventory_movements` ('purchase_order' referans tipi) + `purchase_commitments.received_qty` senkronu (B1). PO header status auto-update: `partially_received` / `received`. `audit_log` her geçiş için. ROLLBACK SQL bloğu yorum olarak eklendi.
- **`dbReceivePurchaseOrderLines`** (`purchase-orders.ts`): `ReceivePOLine` interface + `receive_po_lines` RPC wrapper helper.
- **`serviceReceivePOLines`** (`purchase-order-service.ts`): RPC çağrısı + best-effort `POST /api/alerts/scan` fire-and-forget (mal kabul sonrası stok alertları güncellenir).
- **`POST /api/purchase-orders/[id]/receive/route.ts`** (yeni): `requireRole(req, ['admin','purchaser'])` (B7); demo guard; body validation (line_id UUID regex, qty > 0 integer); 409 (wrong status), 404 (PO yok), 400 (validation), 200; `revalidateTag("purchase-orders", "max")` + `revalidateTag("products", "max")`.
- **PO detail UI** (`/dashboard/purchase/orders/[id]/page.tsx`): `receiveMode` state + `handleReceive` handler. "Mal Kabul" butonu `confirmed | partially_received` durumlarında görünür. Her satır için kalan miktar input'u (max=remaining, "Tümü" toggle), aria-label, aria-live. Demo guard.
- **Test (11 yeni, `po-receive.test.ts`):** helper RPC argümanları + hata propagation (2); route viewer→403, 404, 409 (draft status), qty=0→400, UUID→400, purchaser→200, revalidateTag (7); B1 kısmi/tam kabul çift sayım önleme (2).
- 166 dosya · 2610 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Coolify Faz D smoke — tüm otomatik kontroller yeşil (2026-05-16; 2599 test)

**Faz D smoke tam durum:**
- Staging URL: `https://erp.getmedspace.com` (sslip.io değil — Coolify'da yapılandırılan gerçek domain)
- `/api/health` → 200 `{"status":"ok"}` ✅
- `/login` → 200 ✅
- `/dashboard` auth gate → 307 ✅
- `/api/products` → 401 ✅
- CSP / HSTS / Permissions-Policy / X-Frame-Options tüm header'lar ✅
- `CRON_SECRET` set (değer: `kokpit-pmt-2026`) — 8 CRON endpoint 200 ✅
- `/api/health?detail=true` — tüm required env + migration kontrolleri OK ✅ (`PARASUT_CLIENT_ID` optional, bekleniyor)
- ⏳ Browser smoke: login + dashboard + vendors + purchase orders + products (kullanıcı tarafında)

**Önceki:** Coolify Faz D smoke fix — reverse-proxy redirect bug (3 endpoint) (2026-05-14; 2599 test)

**Faz D smoke fix (1 commit, 4 dosya):**
- Staging Coolify deploy yeşil çalışıyor. Smoke testlerde 2 sorun yakalandı:
- **Coolify Traefik X-Forwarded-Host pass-through eksik** → `new URL("/path", request.url)` veya `request.nextUrl.origin` container internal hostname'i (`0.0.0.0:3000`) veriyor → Location header public URL'e yönlendirmiyor. 3 endpoint etkileniyordu:
  - `/api/auth/demo` (Demo Gez → /dashboard)
  - `/api/parasut/oauth/start` (mock mode internal redirect)
  - `/api/parasut/oauth/callback` (success → /dashboard/settings)
- **Çözüm:** Same-origin redirect'ler için **relative Location header** kullanıldı (browser zaten same-origin'de follow eder; reverse proxy host header'ına ihtiyaç yok). `NextResponse.redirect(absoluteURL)` → `new NextResponse(null, { status: 307, headers: { Location: "/path" } })`. Bu Coolify/Traefik konfig değişikliği gerektirmez, code-side temiz.
- Test güncellemesi: `parasut-oauth.test.ts` `new URL(location, "http://localhost")` ile base URL eklendi (relative URL parse).
- 165 dosya · 2599 test yeşil · TS clean · 0 lint warning

**Devam eden — Faz D smoke checklist:**
- ✅ /api/health 200 OK
- ✅ /login 200 public
- ✅ /dashboard auth gate (307 → /login)
- ✅ /api/products auth zorunlu (401)
- ✅ CSP/HSTS/Permissions-Policy header'lar
- ✅ CRON_SECRET set + 8 CRON endpoint 200 OK
- ✅ /api/health?detail=true — tüm required checks OK
- ⏳ Browser smoke: login + dashboard + vendors + purchase orders + products (kullanıcı tarafında)

**Önceki:** Vercel → Coolify migration Faz A + cron workflow advisor fix (2026-05-13; 2599 test)

**Faz A advisor follow-up (1 commit, 1 dosya):**
- **P1 — Hidden green fail kapatıldı:** `crons.yml` step'lerine `id` eklendi; her job'ın Summary step'i `steps.<id>.outcome` aggregate yapıp 1+ failure varsa `exit 1` ile workflow'u doğru fail eder. Eski hâl: tüm step'ler `continue-on-error:true` olduğundan tüm endpoint'ler 401/500 verse bile workflow yeşil görünüyordu.
- **P2 — Cron 8 invocation → 4 düzeltildi:** `7,37 0,6,12,18 * * *` (her hedef saatte iki kez = günde 8) → `7 0,6,12,18 * * *` (her hedef saatte bir kez = günde 4). Plan yorumu ile cron string artık tutarlı (TR 03:07/09:07/15:07/21:07).


**Faz A — Coolify migration scaffolding (1 commit, ~10 dosya):**
- **Kök sorun:** Vercel Hobby tier cron sıklık limiti (minimum 1 day interval) `vercel.json`'daki `0 */6 * * *`'i reddediyor → 2026-05-09'dan beri tüm deploy'lar fail. Vercel CLI'sız log alınamadı; `vercel.link/3Fpeeb1` redirect'i cron pricing doc'una gidiyor (kanıt).
- **Çözüm yönü:** Coolify (self-hosted Docker PaaS, Hetzner/Vargonen VPS, ~€5/ay) + GitHub Actions cron (ücretsiz, sınırsız). Vercel paralel canlı tutulup risksiz cutover.
- **next.config.ts:** `output: "standalone"` + `images.unoptimized: true` (Next/image PDF yerinde, intentional `<img>`); CSP/HSTS header'lar aynı.
- **sentry.*.config.ts (3 dosya):** `environment: SENTRY_ENVIRONMENT ?? NODE_ENV` (staging/prod ayrımı için). Client tarafında `NEXT_PUBLIC_SENTRY_ENVIRONMENT`.
- **Dockerfile** (yeni, multi-stage, secret-free): deps → builder → runner. Sadece `NEXT_PUBLIC_*` build args (bundle'a yazılır). Server secret'ları (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `PARASUT_*`, `RESEND_API_KEY`) Coolify runtime env'inden enjekte. **SENTRY_AUTH_TOKEN Dockerfile'a hiç girmiyor** (advisor P1.3 — Docker secret yönergesi: build arg layer'a yazılır, leak riski). Source map upload ayrı GH Actions workflow'unda yapılır.
- **`.dockerignore`** (yeni): test artifact'ları, .env, dokümanlar, .vercel, .next dışlanır.
- **`.github/workflows/crons.yml`** (yeni): 8 endpoint envanteri (advisor P1.1 — eksikti `quotes/expire`). Her step `continue-on-error: true` + `curl --retry 3 --retry-delay 20 --max-time 60` + step `timeout-minutes: 5` (fail-isolation + retry). Off-peak dakika `7,37` (advisor P2.1 — top-of-hour drift'ten kaçınma). `workflow_dispatch` ile manuel tetikleme (job=all/six-hourly/hourly choice). Endpoint'ler: 6h → ai-suggest/alerts-scan/purchase-copilot/parasut sync-all/orders expire-quotes/quotes expire/check-shipments. 1h → email retry/parasut poll-e-documents.
- **`.github/workflows/sentry-release.yml`** (yeni): main push veya manual dispatch. GH Actions runner'da `npm ci && npm run build` çalıştırır; `SENTRY_AUTH_TOKEN`+`SENTRY_ORG`+`SENTRY_PROJECT` env ile `withSentryConfig` source map auto-upload yapar. Build iki kere yapılır (Coolify'da + GH Actions runner'da source map için); GH Actions free tier 2000 dk/ay, bu workflow ~30-50 dk/ay kullanır.
- **`.env.example`**: `SENTRY_ENVIRONMENT`/`NEXT_PUBLIC_SENTRY_ENVIRONMENT` notları; `NEXT_PUBLIC_APP_URL` Coolify URL'lerine güncellendi; `ADMIN_EMAILS` ek not; Coolify deployment GitHub Secrets gereksinimleri belgelendi.
- **package.json**: `docker:build` ve `docker:run` script'leri (local test için).
- **README.md**: yeni "Deployment (Coolify)" bölümü — mimari özet + secret listesi + local Docker test komutu.
- **vercel.json korunur** — Faz E cutover sonrası silinir (`chore(deploy): Coolify migration complete` commit'i).
- **`npm run build`** standalone output üretti (`.next/standalone/server.js` doğrulandı), 165 dosya · 2599 test yeşil · TS clean · 0 lint warning.

**Sıradaki adımlar (kullanıcı tarafında — Faz B-F):**
- **Faz B:** VPS al (Vargonen İstanbul önerili / Hetzner FSN1 alternatif) + Coolify install (`curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`)
- **Faz C:** Coolify'da `erp2-staging` Resource → GitHub bağla → env vars (staging için `PARASUT_ENABLED=false`, `RESEND_API_KEY=""`, advisor P1.2)
- **Faz D:** `erp-staging.kokpit.app` üzerinde 13 maddelik smoke test
- **Faz E:** DNS cutover `erp.kokpit.app` → Hetzner IP + GitHub Actions cron secret'ları set + Vercel pause
- **Faz F:** UptimeRobot health monitoring + Hetzner/Vargonen snapshot backup

**Önceki:** Purchase&Alert Faz 4 follow-up — UI gap'leri + Suspense fix (Vercel build kritik) (2026-05-13; 2599 test)

**Faz 4 follow-up (1 commit, ~10 dosya):**
- **CRITICAL Vercel build fix — `useSearchParams` Suspense wrap**: `new` page'e eklediğim `useSearchParams()` Next.js'in static prerender hatası vermesine sebep oluyordu (`Missing Suspense Boundary`). `NewPurchaseOrderPageInner` extract edildi + üstte `<Suspense>` wrapper. **Bu, May 6'dan beri Vercel build'lerinin de aynı tipte hata almasının kök nedeni olma ihtimali yüksek (kullanıcı Vercel CLI logu paylaşırsa kesin doğrulanır).** Mevcut `/dashboard/orders/page.tsx` ve `/dashboard/orders/new/page.tsx` zaten aynı pattern'i kullanıyor.
- **P2.1 fromDraft preload** (`new/page.tsx`): `useSearchParams.get("fromDraft")` ile gelen ID için `GET /api/purchase-orders/[id]` çağrısı + tüm form state'in (vendor, currency, expected_date, notes, lines) doldurulması. `expectedDateDirty=true` set edilerek preload'lanan tarih korunur.
- **P2.2 Revize endpoint + UI** (`[id]/revise/route.ts` yeni + detail page): `POST /api/purchase-orders/[id]/revise` → `serviceRevisePO` → sent→draft (CAS'lı UPDATE + sent_at=NULL). Detail UI'da `isSent` koşulunda "Revize Et" butonu (native confirm + transition).
- **P2.3 Audit timeline** (yeni `audit-log.ts` helper + `/api/audit-log` endpoint + detail UI): `dbListAuditLog(entityType, entityId)` chronological audit_log fetch. Generic GET endpoint: `?entity_type=...&entity_id=...`. Detail'de notes paneli altında dikey liste, `ACTION_LABELS` ile Türkçeleştirilmiş eventler (po_created/sent/confirmed/partially_received/received/cancelled/revised/lines_replaced). aria-label="Sipariş aktivite geçmişi".
- **P3.2 Vendor değişiminde stale expected_date** — `expectedDateDirty` flag pattern. Kullanıcı tarih değiştirirse korunur; vendor seçilirse otomatik fill.
- **P3.3 Double cancel toast fix** — `handleCancel`'de 403 dalı tek toast'a indirgendi (`const msg = ... ? ... : ...; toast({...msg})`).
- **Pure helper extraction** (`new/page.tsx`): `lineFromDraft(line) → LineDraft` ve `computeExpectedDate(leadTime, baseDate) → ISO` test-edilebilir helper'lar olarak export edildi.
- **Test (+17):** `audit-log.test.ts` yeni (4) + `purchase-orders-route.test.ts` revise endpoint (+3) + `purchase-orders-ui.test.ts` (+10): smoke (4) + lineFromDraft (2) + computeExpectedDate (3) + source-regex (5: Revize render condition, audit timeline mevcudiyeti + ACTION_LABELS, cancel 403 tek toast, fromDraft preload pattern, expectedDateDirty pattern).
- 165 dosya · 2599 test yeşil · TS clean · 0 lint warning · build OK

**Vercel deploy durumu (acil):** Son başarılı deploy 2026-05-06 (sha `d1ef1cd`). Sonraki Vercel deploy'ları `failure` (kullanıcı dashboard'dan `vercel.link/3Fpeeb1` log'unu paylaşırsa kök neden netleşir). Bu commit'le birlikte `useSearchParams` Suspense fix push edilince Vercel build'inin de geçme ihtimali yüksek — push sonrası `gh api repos/mirza-dev/erp2/commits/HEAD/statuses --jq '.[]|select(.context=="Vercel")'` kontrol edilmeli. Hâlâ fail ise kullanıcı `npm i -g vercel && vercel login && vercel inspect erp2-sigma.vercel.app --logs` çalıştırıp log'u paylaşmalı.

**Önceki:** Purchase&Alert Faz 4 — PO UI sayfaları + Faz 3 son advisor fix (source_recommendation_ids validation) (2026-05-12; 2582 test)

**Faz 4 (1 commit, ~6 dosya):**
- **Faz 3 cleanup — `source_recommendation_ids` validation gap kapatıldı**: `validatePoLines` artık opsiyonel `source_recommendation_ids` alanı için array + UUID regex check yapıyor. Defense-in-depth — Faz 6 service'i server-generated UUID kullanacak ama API boundary'de doğrulanır. +2 test (array değil → 400, geçersiz UUID → 400).
- **Sidebar** (`Sidebar.tsx`): "Satın Alma" grubuna "Siparişler" linki eklendi (Öneriler + Siparişler + Tedarikçiler).
- **`/dashboard/purchase/orders` (yeni)**: PO list sayfası. Status tab'ları (Tümü/Taslak/Gönderildi/Onaylandı/Kısmi Kabul/Tamamlandı/İptal), PO no + tedarikçi arama, durum badge, beklenen tarih, toplam (currency-aware), oluşturma tarihi. Row click → detail.
- **`/dashboard/purchase/orders/new` (yeni)**: PO oluşturma formu. Vendor select (vendor seçilince currency + expected_date `lead_time_days` ile auto-fill), satır ekleme/silme (product/qty/unit_price/discount_pct/notes), notlar, real-time KDV dahil toplam. JS-side validation (boş alan, qty/price tip), POST sonrası detail'e yönlendirme.
- **`/dashboard/purchase/orders/[id]` (yeni)**: PO detail. Header (PO no + status badge + vendor + expected_date), durum bazlı CTA'lar (Gönder/Onayla/İptal Et + Düzenle placeholder), summary cards (vendor, currency, ara toplam, KDV, genel toplam), lines table (ürün + qty + alındı/qty + birim fiyat + iskonto + satır toplamı; received_qty rengi kabul yüzdesine göre), notes paneli, cancel modal (reason zorunlu + admin uyarısı). NOT: mal kabul UI'ı Faz 5'te eklenecek.
- **Demo + a11y disiplini**: tüm mutasyon buton/inputları `useIsDemo` + `DEMO_BLOCK_TOAST` + `disabled` + `title`, form alanları `aria-label`, modal `role="dialog" aria-modal`, error mesajları `role="alert" aria-live`. Inline style + CSS variables (Tailwind kullanılmadı).
- **Smoke test (4 yeni, `purchase-orders-ui.test.ts`)**: 3 page module load + default export type check + Sidebar source contains "Siparişler" link regex check.
- 164 dosya · 2582 test yeşil · TS clean · 0 lint warning · build OK (3 yeni route: list/new/[id])

**Önceki:** Purchase&Alert Faz 3 advisor 2. tur — P2 follow-up + P3 regression lock (2026-05-12; 2576 test)

**Faz 3 advisor 2. tur (1 commit, ~5 dosya):**
- **P2 follow-up — `validatePoLines` sıkılaştırma** (`purchase-orders.ts`): (a) `unit_price` ve `quantity` için `null`/`undefined`/`""` explicit reject (`Number(null)===0` ve `Number("")===0` silent 0 tuzakları kapatıldı; eksik fiyat → 0 TRY siparişi sızıyordu); (b) `product_id` için UUID regex kontrolü (DB cast hatası 500 yerine 400'e map); (c) `discount_pct === ""` artık reject ediliyor (alan tamamen omitted olmalı).
- **P2 follow-up — Currency whitelist**: `isValidPoCurrency(c)` helper eklendi (`vendors.ts` paterniyle aynı). POST `/api/purchase-orders` ve PATCH `/api/purchase-orders/[id]` artık `currency`'yi whitelist'le doğruluyor (TRY/USD/EUR); whitelist dışı → 400 (önceden DB CHECK fail → 500).
- **P3 — Test regression lock**: `purchase-orders-route.test.ts`'te `next/cache` mock'u `mockRevalidateTag` module-level fn'e dönüştürüldü. confirm + cancel başarı testlerine `expect(mockRevalidateTag).toHaveBeenCalledWith("products", "max")` assertion eklendi — kod doğruydu, sadece regresyon kilidi zayıftı.
- **Test (+5):** `purchase-orders-route.test.ts` — unit_price=null/"" (Number silent 0 tuzakları, 2), invalid UUID product_id (1), POST currency=GBP (1), PATCH currency=GBP (1) + confirm/cancel cache regression assert'leri mevcut testlere eklendi. Mevcut fixture'larda `product_id: "p-1"` → valid UUID `PID = "00000000-0000-4000-8000-000000000001"`.
- 163 dosya · 2576 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Purchase&Alert Faz 3 advisor fix — P1+P2+P3 backend hardening (2026-05-11; 2571 test)

**Faz 3 advisor fix (1 commit, ~9 dosya):**
- **P1.1 (merge-blocker) — `role-guard.ts`**: `user.user_metadata?.role` → `user.app_metadata?.role`. Privilege escalation kapatıldı (Supabase'de `user_metadata` `auth.updateUser` ile kullanıcı tarafından yazılabilir; `app_metadata` sadece service_role ile yazılır).
- **P1.2 (merge-blocker) — `dbTransitionPurchaseOrder`**: (a) `partially_received`/`received` direct UPDATE branch'inden çıkarıldı, throw "mal kabul akışından (receive_po_lines RPC) geçilir" (Faz 5 receive RPC bu state'leri kendi içinde set edecek). (b) sent/draft direct UPDATE artık compare-and-set ile şartlı: `.eq("id", id).eq("status", current).select("id")` — 0 satır dönerse "yarış" hatası. Paralel send+confirm artık ikinci transition'ı kaybeder.
- **P2.1 (should-fix) — `dbDeactivateVendor`**: aktif PO guard eklendi. `purchase_orders` tablosundan `vendor_id=? AND status IN ('draft','sent','confirmed','partially_received')` count > 0 ise "aktif PO'su var" throw. DELETE route'un mevcut `aktif PO` regex'i 409'a map ediyor.
- **P2.2 (should-fix) — Line validation helper**: `validatePoLines(raw)` `purchase-orders.ts`'e eklendi (export). POST `/api/purchase-orders` + PUT `/api/purchase-orders/[id]/lines` `body.lines`'ı JS-side validate eder: array kontrol + `quantity > 0` integer + `unit_price >= 0` + `discount_pct ∈ [0,100]` + `product_id` non-empty. Hata → 400 (DB CHECK fail → 500 yerine).
- **P3 — cache invalidation**: confirm + cancel route'larına `revalidateTag("products", "max")` eklendi (`purchase-orders` revalidate'in yanına). `confirm_po` commitment seed → incoming/forecasted etkiler; `cancel_po` pending commitment cancel → incoming etkiler.
- **Test (+14, 4 dosya):** `role-guard.test.ts` (yeni, 4: app_metadata admin/purchaser/role-yok-fallback/user-null-viewer); `vendors.test.ts` (+2: dbDeactivateVendor aktif PO var → throw, yok → UPDATE+audit); `purchase-orders.test.ts` (+4: receive guard partially_received/received + CAS başarılı/race kaybı); `purchase-orders-route.test.ts` (+4: quantity=0/unit_price=-1/discount_pct=150/product_id eksik → 400).
- 163 dosya · 2571 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Purchase&Alert plan Faz 3 — Purchase Orders backend (2026-05-11; 2557 test)

**Faz 3 (1 commit, ~15 dosya):**
- **Migration 049** (`supabase/migrations/049_purchase_orders.sql`): `po_counters` tablosu + RLS (B6) + `generate_po_number()` RPC (B2) + `purchase_orders` tablosu (status: draft/sent/confirmed/partially_received/received/cancelled) + triggers (line_total, header totals, updated_at) + `purchase_order_lines` tablosu + `po_line_recommendations` junction tablosu (M2) + `create_purchase_order_with_lines` RPC (B3, B4 vendor active guard) + `replace_purchase_order_lines` RPC (B3). Tüm `audit_log` insert'leri `actor` kolonu kullanır (NOT `created_by`).
- **Migration 050** (`supabase/migrations/050_purchase_commitments_po_link.sql`): `purchase_commitments.po_line_id` FK + `received_qty` kolonu (B1) + `chk_pc_received_le_qty` constraint + `uniq_pc_active_po_line` partial unique index.
- **Migration 052** (`supabase/migrations/052_po_confirm_commitment_seed.sql`): `confirm_po` RPC (B4: expected_date, boş PO, inactive vendor guard + commitment otomatik seed) + `cancel_po` RPC (terminal state guard + pending commitment cancel).
- **DB Types** (`database.types.ts`): `PurchaseOrderStatus` type; `PurchaseOrderRow`, `PurchaseOrderLineRow`, `PoLineRecommendationRow`, `PoCounterRow` interface'leri; `PurchaseCommitmentRow`'a `po_line_id: string | null` ve `received_qty: number` eklendi.
- **`purchase-commitments.ts`** güncellendi: `CreateCommitmentInput`'a `po_line_id` eklendi; `dbGetIncomingQuantities` B1 fix — `incoming = SUM(quantity - received_qty) WHERE pending` (kısmi kabulde çift sayım önlenir).
- **`src/lib/auth/role-guard.ts`** (yeni): `getCurrentUserRole` (auth.users.user_metadata.role, fallback 'purchaser') + `requireRole` (admin/purchaser/viewer).
- **`src/lib/supabase/purchase-orders.ts`** (yeni): `VALID_PO_TRANSITIONS` + `dbListPurchaseOrders` + `dbGetPurchaseOrderById` (+ lines) + `dbCreatePurchaseOrder` (→ RPC) + `dbReplacePurchaseOrderLines` (→ RPC) + `dbTransitionPurchaseOrder` (state machine: confirm→RPC, cancel→RPC, sent/draft/others→UPDATE) + `dbPatchPurchaseOrder`.
- **`src/lib/services/purchase-order-service.ts`** (yeni): `serviceTransitionPO` + `serviceSendPO` + `serviceConfirmPO` + `serviceCancelPO` + `serviceRevisePO` (M1: sent→draft, sent_at=NULL).
- **API routes (6 yeni):** `GET/POST /api/purchase-orders` + `GET/PATCH /api/purchase-orders/[id]` + `PUT /api/purchase-orders/[id]/lines` + `POST /api/purchase-orders/[id]/send` + `POST /api/purchase-orders/[id]/confirm` + `POST /api/purchase-orders/[id]/cancel` (admin only — B7).
- **Test (50 yeni test, 3 dosya):** `purchase-orders.test.ts` (18) + `purchase-orders-route.test.ts` (14) + `purchase-order-service.test.ts` (12) + B1 incoming partial receive tests (2) + state machine terminal state tests.
- 162 dosya · 2557 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Purchase&Alert plan Faz 2 — Vendor entity (2026-05-10; 2498 test)

**Faz 2 (1 commit, ~8 dosya):**
- **Migration 048** (`supabase/migrations/048_vendors.sql`): `CREATE EXTENSION IF NOT EXISTS pg_trgm` (B5) + `vendors` tablosu (id/name/contact_email/contact_phone/contact_person/tax_number/address/currency/payment_terms_days/lead_time_days/notes/is_active/created_at/updated_at) + `updated_at` trigger + RLS + trigram index (name search) + `products.preferred_vendor_id uuid FK` (ON DELETE SET NULL).
- **DB Types** (`database.types.ts`): `VendorRow` interface eklendi; `ProductRow`'a `preferred_vendor_id: string | null` eklendi.
- **`src/lib/supabase/vendors.ts`** (yeni): `dbListVendors` (filter: isActive, search) / `dbGetVendorById` / `dbCreateVendor` (validation: name, email, tax_number 10/11 hane, currency whitelist, lead_time_days≥0 + audit_log) / `dbUpdateVendor` (partial patch + audit_log) / `dbDeactivateVendor` (soft delete + audit_log).
- **`/api/vendors`** GET (cache 60s, search/all param) + POST (validation error → 400).
- **`/api/vendors/[id]`** GET (404 yok) + PATCH (404 yok, 400 validation) + DELETE soft (404 yok, 409 zaten pasif).
- **`/dashboard/vendors/page.tsx`** (yeni): tablo (name, iletişim, currency, tedarik süresi, ödeme vadesi, durum) + search + pasif toggle + drawer form (tüm alanlar, aria-label/aria-live) + demo guard + deactivate confirm.
- **Sidebar** (`Sidebar.tsx`): "Satın Alma Önerileri" tek linki → "Satın Alma" grup (Öneriler + Tedarikçiler) olarak yeniden düzenlendi.
- **Test (17 yeni, `vendors.test.ts`):** 5 validation (name/email/tax/currency/lead_time), GET 200, POST 3 (name eksik 400, email 400, başarılı 201), GET/[id] 2 (404/200), PATCH/[id] 3 (404/email 400/200), DELETE/[id] 3 (404/zaten pasif 409/200).
- 159 dosya · 2498 test yeşil · TS clean · 0 lint warning

**Önceki:** Purchase&Alert plan Faz 1 + advisor P2/P3 fix (2026-05-10; 2481 test)

**Faz 1 advisor follow-up (1 commit, 4 dosya):**
- **P2 (parasut_auth filter bug):** `parasut-oauth.ts` CAS çakışmasında `entity_type='parasut_auth'` (snake_case) yazıyordu; UI sadece `entity_type='parasut'` filtreliyordu → bu alertler "Silinmiş Ürün" olarak ürün gruplarına düşebiliyordu, inline retry CTA'sı ulaşmıyordu. Fix: `parasut-constants.ts`'e `PARASUT_ALERT_ENTITY_TYPES` (parasut + parasut_auth) ve `PARASUT_SYNC_ALERT_ENTITY_IDS` (5 bilinen Paraşüt UUID) Set'leri eklendi. UI'daki `systemAlerts` ve `productSysAlerts` filter'ları iki katmanlı kontrol kullanır (entity_type **VEYA** entity_id whitelist) → her iki kategori kayıp olmaz.
- **P3 (endpoint type-only guard):** `/api/alerts/[id]/sync-retry` sadece `type === 'sync_issue'` kontrol ediyordu; gelecekte sync_issue başka entegrasyonlar için de yaratılırsa yanlışlıkla Paraşüt sync-all tetiklenebilirdi. Fix: defense-in-depth — `entity_type ∈ PARASUT_ALERT_ENTITY_TYPES` **VE** `entity_id ∈ PARASUT_SYNC_ALERT_ENTITY_IDS` guard. Bilinmeyen → 400 "Paraşüt sync alanına ait değil".
- **Test (+4):** `parasut_auth` AUTH alert oauth refresh; bilinmeyen entity_type whitelist dışı → 400; entity_type=parasut ama entity_id rastgele → 400 (defansif); constants whitelist source-regression.
- 158 dosya · 2481 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Purchase&Alert plan Faz 1 — sync_issue alert inline retry (2026-05-10)

**Faz 1 (1 commit, ~7 dosya):**
- **Yeni endpoint** `POST /api/alerts/[id]/sync-retry`: alert tipini doğrular, entity_id'ye göre dispatch eder. `ALERT_ENTITY_PARASUT_AUTH` → `serviceParasutOAuthRefresh` çağrılır; diğer Paraşüt entity'leri → `serviceSyncAllPending`. Başarılı her iki yolda alert `resolved` (reason='sync-retry-from-alert'). 404 (alert yok) / 400 (tip sync_issue değil ya da zaten resolved) / 409 (OAuth bağlantısı kurulmamış) / 502 (sync-all tamamen başarısız).
- **`serviceParasutOAuthRefresh` helper extract** (`parasut-oauth.ts`): `/api/parasut/oauth/refresh` admin endpoint'inin iç mantığı helper'a taşındı. Faz 1 sync-retry endpoint'i de aynı helper'ı kullanır → tek source-of-truth. `getParasutAdapter` çağrısı helper'ın içine alındı.
- **`/dashboard/alerts` UI**: `actionFor()` switch'ine `sync_issue` case (defansif fallback `/dashboard/parasut`); `productSysAlerts` filter genişletildi (`entity_type !== 'parasut'`) → sync_issue alertleri ürün gruplarından ayrıldı; yeni `systemAlerts` listesi (`entity_type='parasut'` && `type='sync_issue'`); yeni `SystemAlertCard` component'i ("Yeniden Dene" CTA + Paraşüt sayfa linki + Yoksay); sayfa üstünde "Paraşüt Sync Uyarıları" bölümü. `retrySyncAlert` handler optimistic resolve + toast; demo guard.
- **Test (11 yeni, `alerts-sync-retry.test.ts`):** 7 endpoint senaryo (404, tip 400, zaten resolved 400, AUTH→oauth refresh, notConnected→409, diğer→sync-all, sync-all fail→502) + 4 source-regression (actionFor case, SystemAlertCard, systemAlerts filter, productSysAlerts parasut exclusion).
- **Eski test güncel:** `parasut-oauth-refresh.test.ts` mock factory `vi.importActual` ile partial mock'a dönüştürüldü (helper extract sonrası testler kırılmasın).
- 158 dosya · 2477 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** G11 audit 12. tur — dbUpdateRecommendationMetadata yarış koruması (status=suggested guard) (2026-05-10; 2466 test)

**G11 audit 12. tur (1 commit, ~3 dosya):**
- **Fix (MEDIUM) — `dbUpdateRecommendationMetadata` race guard**: helper UPDATE'i `.eq("id", id)` ile filtre yapıyordu; status guard yoktu. Yarış: CRON levelSame metadata patch'i hesaplarken (rec suggested görüldü → `dbGetRecommendationById` → hesap → UPDATE) kullanıcı aynı rec'i kabul/red ederse, decided rec'in `metadata.suggestQty` (frozen miktar) CRON'un patch'i ile yenileniyordu → "decided rec frozen metadata" kuralı kırılıyor, UI'da yanlış miktar görünüyordu. `dbUpdateSuggestedRecommendation` zaten `.eq("status","suggested")` kullanıyordu — aynı disiplin metadata helper'a uygulandı: (1) `dbGetRecommendationById` sonrası `current.status !== "suggested"` ise erken return (defansif kısa devre), (2) UPDATE chain'ine `.eq("status","suggested")` SQL guard'ı (yarış pencerei kapatma).
- **route.ts:280** civarında yorum güncellendi (12. tur referansı).
- **Test (4 yeni):** `recommendations.test.ts` `dbUpdateRecommendationMetadata` test grubu — (1) status=suggested → UPDATE çalışır + .eq filtreler doğru sırayla, (2) status=accepted → UPDATE atılmaz (early return), (3) status=rejected → UPDATE atılmaz, (4) rec yok → UPDATE atılmaz.
- 157 dosya · 2466 test yeşil · TS clean · 0 lint warning · build OK

**Önceki:** Lint warning temizliği — 30 → 0 (config + dead code) (2026-05-10; 2462 test, 0 warning)

**Lint cleanup (1 commit, 13 dosya):**
- **Config-level fixes (16 warning):**
  - `eslint.config.mjs` `globalIgnores`'a `coverage/**` (Vitest/c8 artifacts) ve `tests/load/**` (k6 ayrı runtime) eklendi.
  - `@typescript-eslint/no-unused-vars` rule override: `argsIgnorePattern: "^_"`, `varsIgnorePattern: "^_"`, `caughtErrorsIgnorePattern: "^_"` — TS/JS topluluk konvansiyonu (parasut.ts mock adapter `_code/_input/_vkn`, voice-service.test.ts `_maxLen` zaten konvansiyon kullanıyordu, rule eksikti).
- **Test dosyalarında dead kod (7 warning, 6 dosya):** `parasut-mock-adapter.test.ts` `beforeEach` import; `parasut-oauth-refresh.test.ts` `mockGetUser` decl.; `parasut-oauth.test.ts` `req` ataması; `parasut-service-faz5/6.test.ts` `ParasutError` import; `parasut-service-faz8.test.ts` 2× `const result =`; `parasut-service-faz9.test.ts` `const result =`.
- **App/script dead atamalar (3 warning):** `seed-large.ts` ölü `tables` decl.; `alerts/page.tsx:149` ilk `const product = ...` (line 156'da yeniden atanıyor); `orders/[id]/page.tsx:1218` ölü `const err = isErrorOnStep(s)`.
- **Next.js Image (1 warning):** `QuoteDocument.tsx:318` PDF/print `<img>` bilinçli tercih (`next/image` PDF render'da lazy-load + extra request sorunu); inline `eslint-disable-next-line @next/next/no-img-element` yorumu eklendi.
- **Bonus:** Yeni rule sonrası `quotes.ts:68`'deki gereksiz `eslint-disable-next-line` kaldırıldı.
- **Test dokümantasyonu:** `purchase-suggested-frozen-qty.test.ts:55` "frozen 30" yanıltıcı başlık → "fallback computed 50" (kod davranışı 50, test başlığı 30 diyordu — bug yok, sadece dokümantasyon yanıltıcı).
- 157 dosya · 2462 test yeşil · TS clean · 0 lint warning · 0 lint error · build OK

**Önceki:** G11 audit 11. tur — AI fail recovery (aiPending flag) + frozen suggestQty UI + yorum bayatlığı (2026-05-10; 2462 test)

**G11 audit 11. tur (1 commit, ~5 dosya):**
- **Fix 1 (MEDIUM) — `aiPending` metadata flag**: `buildAiMetadata` AI fail durumunda eski metni fallback yapıyordu (Audit 6 Fix 4) ama `metadata.urgencyLevel`'i her zaman güncel hesapla yazıyordu → bir sonraki cron'da `readUrgencyLevelFromMeta` aynı level'ı okuyup `levelSame` der → fresh AI bir daha denenmiyordu (geçici hata kalıcılaşıyordu). Yeni: `buildAiMetadata` her zaman `aiPending: !ai` yazar; diff-merge sinyali (`existingLevel === currentLevel && !aiPending`) ile pending durumda levelChanged'a düşürür ve fresh AI dener. JSONB JS-merge sayesinde levelSame patch'i `aiPending` içermez → korunur; AI başarılı patch'inde false olarak yazılır → eski true silinir.
- **Fix 2 (MEDIUM) — Frozen suggestQty UI**: backend `outOfScopeDecidedItems` için `metadata.suggestQty` (frozen) yayınlıyordu ama UI satır render'ı her render'da `computeSuggestion(p)` ile güncel hesap yapıyordu — accepted toplamı stok değişiminde değişebiliyordu. Yeni: `selectDisplaySuggestQty(rec, computedQty)` helper karar mantığını tek noktada toplar; backend `RecRef`'e `frozenSuggestQty` alanı (decided rec metadata.suggestQty'sinden); UI `RecEntry`'ye eklenir; tüm callsite'lar (mobil 1290, masaüstü 1416, computeOrderTotals input, drawer 946) helper kullanır.
  - rec yok / suggested → güncel hesap; edited → editedQty; accepted/rejected → frozenSuggestQty; legacy fallback computed.
- **Fix 3 (LOW) — Yorum güncelleme**: `recommendations.ts:34-37` JSDoc + `route.ts:211` yorum `.gte → .or(...)` davranışına göre güncel; 10. tur Fix 1 referansı eklendi.
- **Yeni testler (14):** `purchase-copilot-ai-error-flag.test.ts` (+5 aiPending senaryosu); `purchase-suggested-frozen-qty.test.ts` (yeni dosya, 9 helper test).
- 157 dosya · 2462 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 10. tur — 2 düşük risk fix (legacy decided_at NULL, initial fetch behavior testi) (2026-05-10; 2448 test)

**G11 audit 10. tur (1 commit, ~5 dosya):**
- **Fix 1 (LOW) — Legacy `decided_at = null` defansif**: `dbListRecommendations.decidedAfter` filter eskiden `.gte("decided_at", X)` ile NULL kayıtları reddediyordu → eski test seed/manuel insert'le `decided_at=null, status='accepted'` rec'ler out-of-scope drift response'una hiç girmezdi. Yeni: helper `.or("decided_at.gte.X,decided_at.is.null")` ile NULL'ları kapsa; route JS-side fallback `r.decided_at === null` durumunda `created_at` ile 7-gün cutoff kontrolü. Mevcut akış için bug yok (yeni rec'lerde `decided_at` her zaman set), defansif legacy data koruması.
- **Fix 2 (LOW) — Initial fetch behavior testi**: Audit 9. tur Fix 1 source-regex testlere ek olarak `shouldTriggerFetch(productsLen)` pure helper testleri — fetch tetikleme koşulu (`products.length === 0 → return`) davranış matrisiyle çift sigorta. Mevcut testler de korundu.
- 156 dosya · 2448 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 9. tur — initial fetch chicken-and-egg, decidedAfter SQL, kart kırılımı, available clamp (2026-05-10; 2443 test)

**G11 audit 9. tur (1 commit, ~8 dosya):**
- **Fix 1 (HIGH) — İlk yükleme out-of-scope decided fetch**: useEffect'in dependency'si sadece `reorderSignature` idi → ilk açılışta recMap boş + reorderSuggestions boş → signatureSource boş → imza "" → effect skip → route hiç çağrılmıyor → recMap dolmuyor (chicken-and-egg). Çözüm: `[reorderSignature, products.length, loadAiData]` dependency, `if (products.length === 0) return` early-return. Products yüklendiğinde bir kez fetch tetiklenir, recMap dolunca signatureSource genişler ve effect tekrar çalışır.
- **Fix 2 (MEDIUM) — `decidedAfter` SQL filter**: route 7-gün cutoff'unu JS-side uyguluyordu (`for (r of allDecidedRecs) if (now - decided_at >= 7days) continue`). Decided rec'ler TTL'siz olduğu için ai_recommendations tablosu büyüdükçe gereksiz I/O. Helper'a `decidedAfter?: string` param + `.gte("decided_at", cutoff)` zinciri. Route ISO cutoff geçer; JS-side filter loop kaldırıldı.
- **Fix 3 (MEDIUM) — Özet kart kırılımı reorderSuggestions üzerinden**: "Toplam Kritik" sayısı `reorderSuggestions.length` (in-scope satın alma ihtiyacı), ama alt kırılım `manufacturedItems.length`/`commercialItems.length` (displayProducts üzerinden) idi → 1 ana sayı, 2 kırılım toplamı. Yeni `inScopeManufacturedCount`/`inScopeCommercialCount` useMemo (reorderSuggestions üzerinden) — kart başlığı + kırılım hizalı. Tab count'ları displayProducts'ta kalır (görünür ürün sayısı).
- **Fix 4 (LOW) — `available` clamped**: route items.map'inde `available: promisable` ham değer veriyordu — over-quoted (-5) durumunda AI prompt JSON içinde negatif görüyor, fallback body "Stok -5/20" yazıyordu. Yeni `available: stock` (= max(0, promisable)) — UI ile aynı görünüm.
- **Yeni 1 test dosyası (3 yeni test):** `purchase-suggested-initial-fetch.test.ts` (Fix 1 source-regression). `recommendations.test.ts` (+3 decidedAfter filter), `purchase-copilot-out-of-scope-decided.test.ts` (1 testi update — JS-side 7-gün test'i artık SQL cutoff geçişini doğrular), `purchase-suggested-tab-counts.test.ts` (+3 in-scope kırılım), `purchase-copilot-promisable-deep.test.ts` (+2 response available clamp).
- 156 dosya · 2443 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 8. tur — in-scope clamp, urgency pctFallback, tab counts, silinmiş ürün filter (2026-05-09; 2432 test)

**G11 audit 8. tur (1 commit, ~9 dosya):**
- **Fix 1 (HIGH) — Backend in-scope items clamp**: route `needed = max(0, target - promisable)` over-quoted ürünler için `suggestQty` şişiriyordu (UI 40, backend 50). Yeni: `stock = max(0, promisable)` + `needed = max(0, target - stock)` + `coverageDays = computeCoverageDays(stock, ...)`. Frontend `pickStock` paterniyle birebir → UI ile backend item.suggestQty eşit.
- **Fix 2 (HIGH) — `computeUrgencyLevel` pctFallback**: `coverageDays === null` (daily_usage yoksa) durumunda her zaman `moderate` dönüyordu; severity (`urgencyPct ≥ 80`) ile çelişkili rozet/AI metni. Yeni 3. opsiyonel param `pctFallback`: cov=null durumunda ≥80 → critical, ≥50 → high, else moderate. Route tüm caller'lar `computeUrgencyPct(stock, min)` geçer; `item.urgencyLevel` zaten hesaplandığı için diğer noktalar `item.urgencyLevel`'i tek source kullanır. `readUrgencyLevelFromMeta` `meta.urgencyPct` fallback alır. `ai-service.ts` yorumu güncel.
- **Fix 3 (MEDIUM) — Tab counts/pendingCount displayProducts üzerinden**: `tabs.count`, `manufacturedItems`/`commercialItems`, `pendingCount` `reorderSuggestions` üzerinden hesaplanıyordu → out-of-scope accepted ürünleri saymıyordu, `pendingCount` negatif çıkabiliyordu. Hepsi `displayProducts` üzerinden. `acceptedCount`/`rejectedCount` `displayIds` filtresiyle (recMap'te kalan silinmiş ürünleri sayma).
- **Fix 4 (LOW) — Silinmiş ürün entry filter**: `productMap.has(productId)` kontrolü `outOfScopeDecidedItems` ve `decidedRefs` filter'larında → orphan cleanup henüz tetiklenmediyse bile UI'a `productName: "—"` placeholder sızmaz.
- **Yeni 1 test dosyası (8 yeni test):** `purchase-suggested-tab-counts.test.ts`. `purchase-copilot-promisable-deep.test.ts` (+3 in-scope clamp), `compute-urgency-level.test.ts` (+9 pctFallback), `purchase-copilot-out-of-scope-decided.test.ts` (1 test güncellendi + 1 yeni "items'a girmez").
- 155 dosya · 2432 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 7. tur — auto-reload imzası displayProducts, items'a out-of-scope, statusIn helper (2026-05-09; 2411 test)

**G11 audit 7. tur (1 commit, ~7 dosya):**
- **Fix 1 (HIGH) — Auto-reload imzası `displayProducts`'ı kapsar**: `reorderSignature` `reorderSuggestions` üzerinden hesaplanıyordu → out-of-scope decided ürünlerin stok/quote değişimi imzayı değiştirmiyordu. Yeni `signatureSource` useMemo (= `displayProducts`) hem imza hem listeleme için tek source-of-truth. Out-of-scope ürün stok değişiminde auto-reload tetiklenir, drift güncellenir.
- **Fix 2 (HIGH) — Out-of-scope decided ürünler `data.items`'da**: backend `responseItems` sadece `items` (= needsPurchase) üzerinden kuruluyordu → UI `aiMap.get(p.id)` undefined → "✦ AI" rozeti gizli, drawer'da AI yorumu yok. Frozen metadata DB'de var ama UI'a ulaşmıyordu. Yeni: `outOfScopeDecidedItems` dizisi (decided rec metadata'sından `aiWhyNow/aiQuantityRationale/aiUrgencyLevel/suggestQty/targetStock/...` çıkarılır; `available` güncel state); `responseItems = items ∪ outOfScopeDecidedItems`. `productMap` lookup ile ürün adı/SKU vb. doldurulur.
- **Fix 3 (MEDIUM) — `dbListRecommendations` statusIn**: `ListRecommendationsFilter`'a `statusIn?: RecommendationStatus[]` eklendi; helper `.in("status", [...])` kullanır. Route `statusIn: ["accepted","edited","rejected"]` geçer → SQL-side filter, JS-side `if (r.status !== ...) continue` overhead yok. Büyük tabloda performans. `statusIn` `status`'tan öncelikli.
- **Fix 4 (LOW) — `displayProducts`/`signatureSource` runtime testi**: simülasyon helper'ı ile dedup, accepted/rejected/edited filter, stok değişimi → imza değişimi senaryoları test edildi.
- **Yeni 5 test (Fix 1) + 5 test (Fix 2) + 4 test (Fix 3):** `purchase-suggested-auto-reload.test.ts` (+5), `purchase-copilot-out-of-scope-decided.test.ts` (+6, statusIn dahil), `recommendations.test.ts` (+4 statusIn).
- 154 dosya · 2411 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 6. tur — decided drift kapsamı, UI clamp, sort/drawer pickStock, AI fallback, POST enrich (2026-05-09; 2396 test)

**G11 audit 6. tur (1 commit, ~10 dosya):**
- **Fix 1 (HIGH) — Decided rec drift kapsamı**: route `dbGetActiveRecommendationsForEntities` sadece needsPurchase ürünleri için decided rec çekiyordu → kullanıcı kabul + stok düzelmiş senaryosunda rec response/UI dışında kalıyor, drift rozeti hiç görünmüyordu. Yeni: `dbListRecommendations` ile tüm aktif decided rec'ler ayrıca yüklenir (7-gün window içinde); items dışı ürünler için drift hesabı `productMap` üzerinden güncel state'e göre yapılır. UI: `displayProducts = reorderSuggestions ∪ outOfScopeDecided` — decision filter `accepted/rejected` seçilince out-of-scope ürünler de listede görünür.
- **Fix 2 (MEDIUM) — UI promisable<0 clamp**: `computeRowStock` ve `computeSuggestion` `Math.max(0, promisable)` ile clamp; urgency formula `Math.min(100, ...)` — over-quoted ürünlerde negatif gün/%>100 urgency önlenir. Yeni `pickStock(p)` helper export'u (sort/mostUrgent/drawer için tek source).
- **Fix 3 (MEDIUM) — Sort/En Acil/AI drawer pickStock**: sort fallback (coverage/urgency), `mostUrgent`/`mostUrgentDays`, `aiDrawerCoverageDays`, drawer "Stok Durumu" gridi hep `pickStock` üzerinden — `(a|b|mostUrgent|aiDrawerProduct).available_now` doğrudan kullanım yok. Drawer "Açık" değeri `Math.max(0, min - drawerStock)` ile negatif görünmez.
- **Fix 4 (MEDIUM) — Level değişiminde AI fail fallback**: `buildAiMetadata(item, fallbackMeta)` — AI fail/empty olunca eski rec metadata'sındaki `aiWhyNow`/`aiQuantityRationale`/`aiUrgencyLevel` korunur. Geçici network/parse hatası eski iyi metni silmez.
- **Fix 5 (LOW) — POST /api/products enriched response**: yeni ürün yaratma response'u `enrichProducts` ile `quoted/promisable/incoming/forecasted/stockoutDate/orderDeadline` alanları içerir. DataContext ilk full refetch'e kadar tutarlı state.
- **Yeni 2 test dosyası (16 yeni test):** `purchase-copilot-out-of-scope-decided.test.ts` (6), `purchase-suggested-pickstock-regression.test.ts` (5). `purchase-suggested-promisable-ui.test.ts` (+9 clamp + pickStock), `purchase-copilot-diff-merge.test.ts` (+3 AI fallback), `api-products-quoted.test.ts` (+4 POST enrich).
- 154 dosya · 2396 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 5. tur — UI promisable, refetch ?all=1, signature quoted, ?all=1 filter (2026-05-09; 2369 test)

**G11 audit 5. tur (1 commit, ~9 dosya):**
- **Fix 1 (HIGH) — DataContext promisable filter**: `reorderSuggestions` `shouldSuggestReorder({ available: p.available_now })` çağırıyordu → quote'lu siparişler hesaba katılmıyordu, UI öneriyi kaçırıyordu. Yeni: `available: p.promisable ?? p.available_now` — backend `purchase-copilot/route.ts:124` ile semantik eşleşme.
- **Fix 2 (HIGH) — page.tsx tüm hesaplar promisable**: `computeSuggestion`, mobil kart, masaüstü tablo `p.available_now` kullanıyordu. UI'da gösterilen suggestQty/coverage/urgency backend'le çelişebilirdi (örn. backend 90 öneriyor, UI 10 gösteriyor). `computeSuggestion` ve yeni `computeRowStock` helper'ları artık `p.promisable ?? p.available_now` ile çalışır; ikisi de export'lu (test edilebilirlik). Mobil kart "Mevcut" sütunu + masaüstü "Stok" sütunu artık satılabilir stok (promisable) gösterir.
- **Fix 3 (MEDIUM) — reorderSignature quoted**: imza `id:available:min:daily:reserved` idi → quote eklenince available_now sabit kalsa bile imza değişmiyordu, auto-reload kaçıyordu. Yeni: `:quoted` suffix eklendi.
- **Fix 4 (MEDIUM) — Refetch ?all=1**: `data-context.tsx`'de 3 mutasyon path'i (uretimEkle, uretimSil, updateOrderStatus) çıplak `/api/products` çağırıyordu → 100+ ürünlü setlerde global state ilk 100'e düşüyordu. Hepsi `?all=1`'e geçirildi (ilk yükleme paterni).
- **Fix 5 (LOW) — `?all=1` filter desteği**: `?all=1` branch erken return; `category/product_type/is_active` parse edilmiyordu. Yeni `getCachedAllProducts(category, productType, isActive)` filter-aware (cache key `["products-all-filtered"]`); `dbListProducts({...filters, pageSize: 10000})` kullanır.
- **Yeni 4 test dosyası (25 yeni test):** `purchase-suggested-promisable-ui.test.ts` (12), `data-context-refetch-all.test.ts` (3), `data-context-reorder-promisable.test.ts` (2), `purchase-suggested-auto-reload.test.ts` quoted ekstreleri (4), `api-products-quoted.test.ts` filter-aware (4 ek + mock güncelleme).
- 152 dosya · 2369 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 4. tur — promisable filter+hesaplar, UI full scan, set imzası (2026-05-09; 2344 test)

**G11 audit 4. tur (1 commit, ~9 dosya):**
- **Fix 1 (HIGH) — Promisable filter**: route filtresi ilk dalında `available_now <= min_stock_level` kontrol ediyordu. Senaryo: available=50, quoted=40, min=20, daily_usage=null → promisable=10 ≤ min=20 ama eski filter pas geçiyor + deadline path daily_usage=null nedeniyle pasif → öneri kaybı. Fix: filter `promisable <= min` üzerinden bakar (`purchase-service.ts:81` paterniyle aynı).
- **Fix 2 (HIGH) — Promisable tüm hesaplara**: `suggestQty`, `coverageDays`, `available` (response'a), `urgencyPct`, `urgencyLevel` hâlâ `p.available_now` üzerindendi → quote'lu siparişlerde miktar yanlıştı (örn. 100 stok / 80 quoted / 110 target → eski 10 açık göziyor, gerçek 90). Fix: tüm hesaplar promisable; `item.available` artık promisable (UI'da "Stok" sütunu satılabilir miktarı gösterir).
- **Fix 3 (MEDIUM) — UI full active list**: `/api/products` default page=1+pageSize=100; DataContext sadece ilk 100 ürünü çekiyordu. Cron full scan, UI 100 sınırlı → 100+ ürünlü setlerde sayfa eksik gösteriyordu. `/api/products?all=1` opt-in eklendi (`dbListAllActiveProducts`, ayrı cache key); DataContext bu flag'i kullanıyor.
- **Fix 4 (MEDIUM/LOW) — Auto-reload set imzası**: `useEffect` dependency `reorderSuggestions.length` idi; aynı sayıda farklı ürün seti veya stok/quote değişimi auto-fetch tetiklemiyordu. Yeni: `reorderSignature = sort(map(p => id:available:min:daily:reserved)).join("|")` — değişen her şey effect'i tetikler.
- 149 dosya · 2344 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 3. tur — promisable, full-scan, AI hadError, stale TTL scope, levelChanged in-place (2026-05-09; 2325 test)

**G11 audit 3. tur (1 commit, ~13 dosya):**
- **Fix 1 (HIGH) — Promisable hesabı**: route ham `dbListProducts` çağırıp `p.promisable ?? p.available_now` fallback kullanıyordu; helper promisable üretmiyor → quote'lu siparişler hiç dikkate alınmıyordu. Yeni: `dbListAllActiveProducts` + `dbGetQuotedQuantities` paralel; `promisable = available_now - quoted` UI ile aynı semantikte.
- **Fix 2 (HIGH) — pageSize:500 → full scan**: 501. ürün hem öneri için skip hem cleanup'ta orphan sayılıp yanlış expire ediliyordu. `dbListProducts({pageSize:500})` → `dbListAllActiveProducts()` (pagination yok).
- **Fix 3 (MEDIUM) — AI hadError flag**: `aiEnrichPurchaseSuggestions` graceful catch içinde `enrichments:[]` dönüyordu ama route'un try/catch'i tetiklenmiyordu → production'da AI patlasa bile UI banner gösterilmiyordu. Servis result'ına `hadError: boolean` field'ı; route bunu okuyup `aiCallFailed` set eder.
- **Fix 4 (MEDIUM) — Stale TTL scope**: `dbExpireStaleRecommendations(48)` recommendation_type filtrelemiyor → purchase cron'u diğer rec türlerinin (varsa) suggested'larını da expire ediyordu. Helper'a opsiyonel 2. param eklendi; copilot route `"purchase_suggestion"` geçer.
- **Fix 5 (MEDIUM) — levelChanged in-place update**: expire+upsert dansı sessiz fail'de `dbUpsertRecommendation` mevcut suggested rec'i aynen döndürüyordu → yeni AI içeriği DB'ye yazılmıyor, her cron'da boşa AI çağrısı. Yeni `dbUpdateSuggestedRecommendation(id, {body, confidence, severity, model_version, metadata})` helper — tek atomik UPDATE'le rec içeriği yenilenir, ID stable kalır. `dbExpireEntityRecommendations` levelChanged flow'undan kaldırıldı (silme akışlarında hâlâ kullanılır + artık throw eder).
- **Yeni 2 test dosyası (9 yeni test):** `purchase-copilot-promisable.test.ts` (5), `purchase-copilot-ai-error-flag.test.ts` (4). `recommendations.test.ts`'e `dbExpireStaleRecommendations` recType + `dbUpdateSuggestedRecommendation` testleri (4). Mevcut diff-merge testleri yeni in-place update flow'una göre güncellendi.
- 147 dosya · 2325 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 2. tur — CSRF, expire scope defansif, empty list, lead-time, moq=0 (2026-05-09; 2312 test)

**G11 audit 2. tur (1 commit, ~10 dosya):**
- **Fix 1 (HIGH) — GET CSRF guard**: handler GET ile çağrıldığında session-cookie kabul ediyordu → `<img src>` ile yan etki tetiklenebilirdi. Yeni: GET sadece CRON_SECRET; POST hibrit (session VEYA Bearer). `checkAuth(request, method)` imzası, `GET/POST` ayrı arrow wrapper'larla export.
- **Fix 2 (MEDIUM defansif) — Helper status filter**: `dbExpireEntityRecommendations(id, type, recType?)` artık `recType` belirtildiyse SADECE `'suggested'` expire eder. Decided rec invariant kırılırsa bile dokunulmaz. Silme akışında (param geçmez) tüm aktif statüler korunur (regresyon yok).
- **Fix 3 (MEDIUM) — Boş ürün listesi**: tüm ürünler stok üstüne çıkıp `needsPurchase=[]` olduğunda eski `suggested` rec'ler 48h TTL'e kadar takılı kalıyordu. Yeni `dbExpireAllSuggestedRecommendations` helper + route koşullu fallback.
- **Fix 4 (MEDIUM) — Lead-time aware urgency**: `computeUrgencyLevel(cov, lead?)` artık `cov < lead` durumunda critical (Sprint A `computeStockRiskLevel` ile aynı semantik). Senaryo: cov=20, lead=45 → eskiden moderate, şimdi critical. `readUrgencyLevelFromMeta` backward-compat (eski rec'lerde `leadTimeDays` opsiyonel). Rec metadata'sına `leadTimeDays` field'ı yazılır.
- **Fix 5 (MEDIUM) — moq=0 NaN/Infinity guard**: route `moq = Math.max(1, p.reorder_qty ?? p.min_stock_level)` (frontend `page.tsx:226` paterniyle aynı). `reorder_qty=NULL && min=0` durumunda `Math.ceil(needed/0)=Infinity` riski kapatıldı.
- **Yeni 3 test dosyası (15 yeni test):** `purchase-copilot-empty-products.test.ts` (4), `purchase-copilot-moq-guard.test.ts` (6), `purchase-copilot-decided-defense.test.ts` (3). `compute-urgency-level.test.ts` lead-time kapsamıyla genişletildi (10 yeni). `purchase-copilot-auth.test.ts` Fix 1 testleri (CSRF guard).
- 145 dosya · 2312 test yeşil · TS clean · 0 lint hatası

**Önceki:** G11 audit 1. tur — Vercel CRON GET, expire scope, source-of-truth (2026-05-09; 2286 test)

**Önceki²:** G11 — AI öneri tutarlılığı (diff-merge + 6h CRON + manuel yenile) (2026-05-09)

**G11 (1 commit, ~10 dosya):**
- **Hibrit diff-merge** (`/api/ai/purchase-copilot/route.ts`): aktif `suggested` rec'in `urgencyLevel`'ı state'le aynıysa metadata in-place refresh; değiştiyse eski rec expire + AI yeniden çağrılır. Sayısal alanlar her CRON'da güncellenir; AI metni sadece level değiştiğinde yenilenir.
- **Drift detection (decided rec'ler):** accepted/edited/rejected rec'lerin metadata'sı dondurulur ama `currentDrift` field'ı response'a eklenir.
- **6 saatlik CRON:** `vercel.json` yeni dosya — schedule `"0 */6 * * *"`.
- **Hibrit auth:** `/api/ai/purchase-copilot` artık ALWAYS_PUBLIC; route içinde CRON_SECRET Bearer veya authenticated session kontrolü.
- **Frontend (`/dashboard/purchase/suggested`):** "↻ Yenile" butonuna demo guard + son güncelleme saati + toast. Decided rec'lerde drift varsa `<StaleDriftBadge>` rozeti.
- **4 yeni test dosyası (38 yeni test):** compute-urgency-level, purchase-copilot-auth, purchase-copilot-diff-merge, purchase-suggested-stale-badge.

**Önceki:** SMTP / e-posta gönderim altyapısı (Resend) — 5 bildirim türü tamamı (2026-05-06)

**SMTP entegrasyonu (1 commit):**
- Yeni: `resend` npm package; `.env.example`'a `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`.
- Migration 047: `email_logs` tablosu (audit + retry tracking) + 2 index (status/attempt + dedup) + RLS service_role.
- Yeni helper'lar: `email-logs.ts` (DB CRUD + dedup check + retry list), `users-with-prefs.ts` (auth.users + preferences join), `email/templates.ts` (5 türde HTML+text render), `email-service.ts` (notifyUsersByEmail + retryFailedEmails).
- Yeni endpoint: `/api/email/retry-failed` (CRON, middleware CRON_PATHS'e eklendi).
- 5 trigger noktası fire-and-forget entegrasyon: `alert-service.ts` (stock_critical), `order-service.ts` (order_pending), `orders/route.ts` (order_new), `orders/[id]/route.ts` (order_shipped — updated state ile), `parasut-service.ts` (sync_error).
- Dedup penceresi: 6 saat (entity+type+user); retry: max 3 deneme, son 24 saat.
- Fail-safe: `RESEND_API_KEY` veya `EMAIL_FROM` yoksa fonksiyon erkenden return (config eksikliği request'i bozmaz).
- 3 yeni test dosyası (27 test): email-logs (10), email-service (14), email-retry-failed (3). order-ship-parasut.test.ts'e email-service mock eklendi.
- 138 dosya · 2242 test yeşil · TS clean · 0 lint hatası

**Önceki:** Settings audit 2. tur — demo cookie temizleme + SVG sınırla + server validation (2026-05-05)

**Settings audit 2. tur (1 commit, 9 dosya):**
- **HIGH/Orta — Demo cookie geçişte temizlenmiyordu**: `clearDemoMode()` ne login submit'inde ne dashboard banner link'inde çağrılıyordu. Auth'lu kullanıcı dashboard'a girse bile `isDemoMode()` true kalıyor → settings demo gibi davranıyor. Fix: login `handleSubmit` başarılı dönünce `clearDemoMode()`; dashboard banner link'i `onClick` ile cookie temizler + router.push.
- **Orta — Avatar SVG kabul ediyordu**: Public bucket'tan kullanıcı kontrollü XML servis edildiğinde XSS riski. Fix: `ALLOWED_MIME` listesinden `image/svg+xml` çıkarıldı (avatar/route.ts), migration 045 + yeni migration 046 (idempotent update), UI accept attribute + format yazısı güncellendi. Şirket logosu (company-assets) farklı: admin yüklüyor, scope farklı, SVG kalır.
- **Düşük/Orta — Firma PATCH API tarafında validation yoktu**: UI inline validation vardı ama auth'lu biri doğrudan PATCH /api/settings/company çağırıp geçersiz email/VKN/URL yazabilirdi. Fix: `validateCompanyPatch` helper — required name, email regex, VKN 10/11 hane, URL formatı, currency whitelist (USD/EUR/TRY).
- **Düşük — Preferences PATCH boolean coercion**: `!!value` string `"false"`'u true'ya çeviriyordu. Fix: `typeof === "boolean"` strict kontrol — non-boolean değerlere 400 dön.
- 2 yeni test dosyası: `settings-company-route.test.ts` (10 test), `settings-user-preferences.test.ts` güncellendi (boolean strict + malformed type sanitization)
- 135 dosya · 2215 test yeşil · TS clean · 0 lint hatası

**Önceki:** Settings güvenlik + semantik audit fix'leri (2026-05-05)

**Settings audit fix'leri (1 commit, 6 dosya):**
- **HIGH — Avatar orphan file**: metadata güncellemesi başarısız olursa storage'daki dosya temizlenir (try/catch ile sb.storage.remove). Yoksa bucket'ta orphan kalırdı.
- **HIGH — patchUserMetadata race**: GET-merge-SET window dokümante edildi (Supabase admin updateUserById user_metadata'yı REPLACE ediyor — merge gerekli; race UI tarafından korunur).
- **MEDIUM — KullaniciTab concurrent mutation**: 3 handler (profile save / avatar upload / password change) global `isMutating` flag ile gate'li. Lost-update koruması.
- **MEDIUM — Type duplication**: UserProfile + NotificationPref `settings/page.tsx`'e import edildi (önce duplicate define).
- **MEDIUM — defaultPrefs() çift çağrı**: useState + useRef arasında shared ref ile tek instance.
- **LOW — Avatar tests**: 8 yeni test (MIME, size, path traversal, orphan cleanup, upload error).
- **Kod yorumları**: Password endpoint'a Supabase GoTrue rate-limit notu, avatar route ext sanitization açıklaması, user-profile.ts patchUserMetadata race window açıklaması.
- 134 dosya · 2202 test yeşil · TS clean · 0 lint hatası

**Önceki:** Ayarlar production-ready — Kullanıcı/Bildirimler API + validation + DemoBanner koşullu (2026-05-05)

**Ayarlar production-ready (1 commit, 12 dosya):**
- Migration 045: `user_notification_preferences` tablosu (user_id, notification_type, email_enabled, browser_enabled, unique constraint) + `user-avatars` storage bucket (1MB, public).
- Yeni 4 endpoint: `/api/settings/user/{profile,password,avatar,preferences}` — session auth, validation, audit_log entegrasyonu.
- `notification-types.ts` — 5 tip sabit liste (stock_critical, order_pending, order_new, sync_error, order_shipped).
- `validation.ts` — `isValidEmail`, `isValidTaxNumber` (10/11 hane), `isValidUrl`.
- `user-profile.ts` — Supabase `auth.users.user_metadata`'da full_name + avatar_url (yeni custom tablo gereksiz).
- `user-preferences.ts` — DB satırı yoksa default true/true virtual liste; PATCH'te whitelist + upsert.
- Şifre değişikliği: cookie'siz fresh anon client ile mevcut şifre doğrulaması (Supabase updateUser eski şifre sormuyor; çalınmış oturum riskine karşı koruma).
- Avatar upload: `/api/settings/company/logo` pattern paralel, path `${user.id}.{ext}`.
- KullanıcıTab + BildirimlerTab gerçek API'ye bağlandı (öncesi: `setTimeout` mock).
- FirmaTab inline validation: required name, email regex, VKN 10/11 hane, URL formatı; hatalı alanlarda border kırmızı + FieldError mesajı.
- DemoBanner artık `useIsDemo` ile koşullu — production'da görünmüyor (mevcut UX bug).
- 4 yeni test dosyası (36 test): profile, password, preferences, firma validation. 133 dosya · 2194 test yeşil · TS clean · 0 lint hatası.

**Önceki:** Production bulgular 1. tur — AI filtre + import UI + multi-currency netleştirme (2026-05-05)

**Production bulgular 1. tur (1 commit):**
- AI route filter aligned with frontend `shouldSuggestReorder`: `available <= min` veya `orderDeadline ≤ 7 gün` — AA-SOV gibi deadline-imminent ürünler artık öneri listesinde "Beklemede" değil aktif öneriyle gözüküyor (purchase-copilot/route.ts).
- `sourceChipLabel`: "?" yerine "fallback" → "Otomatik", bilinmeyen → "—" (import sayfası kolon eşleştirme rozetleri).
- `apply-mappings` route catch block: generic "başarısız" yerine actual error message dön ("Eşleştirme uygulanamadı: {detail}").
- Multi-currency tutarın "+" ön eki kaldırıldı; her tutar yanına currency code eklendi (€518.400,00 EUR / $133.600,00 USD). Başlık "Toplam Sipariş Tutarı" → "Önerilen Satın Alma Tutarı" + tooltip.
- Test güncellendi (1 ai-purchase-copilot test, 1 source-chips test). 129 dosya · 2158 test yeşil · TS clean · 0 lint hatası.

**Önceki:** Seed idempotent + UI tetikleyici — settings'te tek tıkla reset (2026-05-05)

**Seed idempotent + UI (1 commit):**
- `clearAllData` helper extract → DELETE handler ve POST handler ikisi de kullanıyor (DRY).
- POST artık idempotent: önce temizle, sonra yükle. Response: `{ ok, cleared: {...}, seeded: {...} }`. Tek çağrı = tam reset + seed.
- `checkAuth` genişletildi: `CRON_SECRET` **VEYA** authenticated session (`@/lib/supabase/server`). UI'dan Authorization header'sız çağrılabilir.
- Yeni `src/components/settings/ResetDemoSection.tsx` — kırmızı "Tehlikeli Bölge" kartı, confirm modal, busy state, toast, 2 sn sonra reload. Demo modda disabled.
- `/dashboard/settings` en altına mount edildi.
- 129 dosya · 2157 test yeşil · TS clean · 0 lint hatası

**Önceki tamamlanan iş:** Demo seed yenileme — sade öz boyut + tüm modüller dolu (2026-05-04)

**Demo seed rewrite (1 commit):**
- Mevcut seed (1613 satır, 39 ürün, 15 sipariş) müşteri turuna kalabalıktı; LOAD- prefix kalıntıları temizlenmiyordu; quotes/ai_recommendations/import_*/company_settings/parasut_oauth_tokens boş kalıyordu.
- Yeni seed: 8 ürün · 4 müşteri · 7 sipariş · 3 teklif · 5 AI öneri · 2 import batch · 3 üretim · 1 şirket ayarı + parasut stub. Her sayfada anlamlı veri, çift eksen sipariş matrisi tam (draft/pending/approved×{unallocated,partially_allocated,allocated,partially_shipped,shipped}/cancelled).
- DELETE: LOAD- temizliği (sales_orders.notes/customers.name/products.sku LIKE) + 25 demo tablosu + company_settings reset (silmez, sıfırlar) + order_counters reset.
- POST: company_settings UPDATE → parasut_oauth_tokens UPSERT → products → customers → quotes (TKL-2026-001/002/003: sent/expired/accepted) → orders (ORD-2026-0001..0007, TKL-003 → ORD-0003 quote_id) → reservations + shortages → BOM (KV-3P-DN50 ← CT-SS + BE-SC) → commitments → production → movements → shipments + invoices + payments → ai_recommendations + ai_feedback → import_batches + drafts → column_mappings + ai_entity_aliases → sync_logs + audit_log.
- Stok senaryoları: KV-DB-DN100 critical, KV-3P-DN80 warning, KB-WT-DN150 past deadline, AA-SOV-DN80 imminent 3 gün (Almanya 45 gün lead), CV-KV-DN65 imminent 1 gün, CT-SS-DN50 fiyat eksik (price=NULL).
- Müşteriler: Tüpraş (TRY), Abdi İbrahim (EUR), Enerjisa (USD), Ülker (VKN-eksik — Paraşüt preflight test).
- 129 dosya · 2157 test yeşil · TS clean · 0 lint hatası

**Önceki:** Sprint C bulgular 4. tur — G3 gerçek veri + G5 mobil + test tamamlama (2026-05-02)

**Sprint C bulgular 4. tur (1 commit `3e01cd0`):**
- G3 (HIGH): "Açık Sipariş" hardcoded 0 → gerçek sipariş sayısı (mount fetch + alerts pattern paralel; vurgu rengi). Backend helper + endpoint zaten hazırdı, sadece UI bağlantısı eksikti.
- G5 (MEDIUM): Mobil kart inline IIFE → `RecActionCell`; pending'de inline aksiyon, decided'da "Kararı geri al"; RejectMode input `maxLength={200}`
- G4: 2 yeni test — `refetch-after-mutation`, `demo-mode`. 2 helper extract: `scheduleRefetchAfterMutation` (4 handler debounce DRY), `shouldSkipAiFetch` (demo guard)
- `acik-column` testine `openOrderCount` regression notu + assertion
- "Undo başarı toast'ı yok" iddiası geçersiz — 3. turda eklenmişti (page.tsx:663)
- 129 dosya · 2157 test yeşil · TS clean · 0 lint hatası

**Önceki²:** Sprint C bulgular 3. tur — G1/G3/G5 fix + 3 adlandırılmış test (2026-05-02)

**Sprint C bulgular 3. tur (1 commit `52a082d`):**
- G1 (HIGH): `dbGetAllActiveProductIds` yeni helper — pageSize:500 truncation'ından bağımsız tam aktif ID seti ile orphan expire
- G3 (HIGH): "Stok Açığı" → "Açık Sipariş" (masaüstü + mobil; tooltip güncellendi; unused deficit hesabı kaldırıldı)
- G5 (MEDIUM): Masaüstü KARAR hücresi → inline `RecActionCell` (Kabul Et/Düzenle/Reddet); handleUndo başarı → "Karar geri alındı." toast
- 3 yeni test: multi-currency (8), on-product-delete (5), acik-column (5)
- 127 dosya · 2145 test yeşil · TS clean · 0 lint hatası

**Önceki²:** Sprint C bulgular 2. tur — 4 fix + 5 adlandırılmış test (2026-05-02)

**Sprint C bulgular 2. tur (1 commit):**
- Fix 1 (HIGH): NULL fiyat sıfıra düşüyor → `??` → `||` (page.tsx) — missingPriceCount artık doğru
- Fix 2 backend (HIGH): "Kararı geri al" akışı → VALID_TRANSITIONS'a reverse geçişler + ALLOWED_STATUSES'a "suggested"
- Fix 2 frontend (HIGH): handleUndo + optimistic rollback + "Kararı geri al" butonu (table + drawer)
- Fix 3 (MEDIUM): Ürün silinince/deaktif edilince rec'ler anında expire — dbExpireEntityRecommendations yeni helper
- Fix 4: 5 adlandırılmış test — action-feedback, cost-fallback, ai-banner, product-cleanup, empty
- 124 dosya · 2128 test yeşil · TS clean · 0 lint hatası

**Önceki:** Sprint B bulgular 2. tur — import sayfası 5 fix + 6 adlandırılmış test (2026-05-01)

**Sprint B bulgular 2. tur (1 commit):**
- Fix 1 (HIGH): Confirm API hatası UI'da yutulmuyordu → !confirmRes.ok dalı + hata parse + toast
- Fix 2 (MEDIUM): Kolon chip'leri AI confidence %'sini gösteriyor (sourceChipLabel helper export)
- Fix 3 (MEDIUM): order_line insert/update hataları kontrol ediliyor — lineInsertErr → rejected
- Fix 4 (LOW): Dosya boyutu aşımında inline hata + toast birlikte
- Fix 5 (LOW): validateFileSize() helper export (test edilebilirlik)
- 6 adlandırılmış test dosyası: file-size-limit, source-chips, inline-edit-rollback, confirm-race, order-line-sort-order, result-by-entity
- 119 dosya · 2092 test yeşil · TS clean · 0 lint hatası

**Önceki:** Sprint C — Satın Alma Önerileri stabilizasyonu (2026-05-01)

**Sprint C özet (3 commit):**
- Part 1: AI fail banner (büyük sarı, "Yeniden dene") + costPrice/price NULL → toplama dahil değil + "X üründe fiyat eksik" sayacı + karar sonrası loadAiData(300ms) + isDemo guard ile AI POST kapatma + mavi info banner. Backend route'a `ai_call_failed` flag eklendi.
- Part 2: `dbExpireRecommendationsForMissingEntities` yeni helper — silinmiş/deaktif ürünlerin TÜM aktif rec'lerini (suggested+accepted+edited+rejected) expire eder. Route scan başında entegre — alerts orphan cleanup ile paralel pattern.
- Part 3: "Açık" → "Stok Açığı" (header netleştirme + tooltip + 0 göster) + multi-currency TOPLAM SİPARİŞ TUTARI (currency'ye göre Map; tek currency mevcut görünüm, karışıksa "+ $X" alt satırlar).
- Atlandı: G5 (KARAR cell-içi buton seti) — mevcut "Karar ver →" drawer pattern korundu (plan'ın "mevcut tasarım korunur" hükmü).
- 106 dosya · 2003 test yeşil · TS clean.

**Önceki:** Sprint B — AI İçeri Aktar stabilizasyonu (2026-05-01)

**Sprint B özet (4 commit):**
- Part 1: file size limit (max 25 MB) + inline edit rollback (silent fail kaldırıldı)
- Part 2: Sonuç ekranında entity-bazlı kırılım tablosu (G6) — Türkçe etiket ile
- Part 3: order_line sort_order collision fix (per-order cache)
- Part 4: serviceConfirmBatch race condition (atomik CAS + 'confirming' status + rollback)
- Migration `043_import_batches_confirming_status.sql`
- 106 dosya · 1993 test yeşil · TS clean

**Önceki:** Sprint A — Üretim & Stok Uyarıları stabilizasyonu (2026-04-29)

**Sprint A özet (4 commit):**
- Part 1: Türkçe etiketler (quote_expired/overdue_shipment/order_deadline/sync_issue) + 24h dismiss açıklaması toast + dead code temizliği (import_review_required AlertType union'undan çıkarıldı)
- Part 2: Silinmiş ürün uyarılarının auto-cleanup'ı (G1) — scan başında orphan resolution (4 tip için, reason='product_deleted_or_deactivated')
- Part 3: AI servisi kullanılamıyor banner'ı (G3) — kırmızı toast yerine sayfa üstünde sarı banner + "Yeniden dene"
- Part 4a/4b/4c: AI önerilerinde "neden öneriliyor" şeffaflığı (G7), quote_expired drawer'ında inline "Süreyi Uzat" formu (G6), 24h dismiss dedup + severity escalation bypass (G8)
- Migration `042_alerts_dismissed_severity.sql` (dismissed_severity kolonu)
- 106 dosya · 1987 test yeşil · TS clean

**Önceki:** Paraşüt Faz 11 bulgular 3. tur (2026-04-29)

**Bulgular 3. tur fix:**
- **HIGH→MEDIUM (retry regression):** `serviceRetryParasutStep`'e `parasut_step='done'` guard eklendi — RPC'den bağımsız servis katmanı koruması. UI'da `canRetry` done (yeşil) ve edoc skipped badge'lerde `false`; yanıltıcı "başka işlem tutuyor" toastı ortadan kalktı.
- **MEDIUM (OAuth false-success):** `POST /api/parasut/oauth/refresh` içindeki `expires_at` update hatası artık `throw` ediyor → `success:true` false-success imkansız.
- **MEDIUM (intermediate step regression):** `serviceRetryParasutStep`'e `STEP_ORDER` map guard eklendi — `parasut_step='invoice'` iken `step='contact'` gibi geri adım istekleri servis katmanında bloklanıyor (RPC çağrılmadan).
- +5 test: 3 `parasut-retry-step-faz11.test.ts` + yeni `parasut-oauth-refresh.test.ts` (2 test).
- **104 dosya · 1975 test yeşil · TS clean.**

**Sıradaki:**
- Faz 12 — Sandbox GATE: gerçek Paraşüt API ile OAuth, list filtreleri, e-doc trackable_job, stok invariant doğrulamaları (PARASUT_PLAN.md §Faz 12)
- SMTP altyapısı production deploy: Migration 047 + Resend hesabı/domain + Vercel env + cron config (kod hazır 2026-05-06'da yapıldı; deploy eksik)

**Kalan / ertelendi:**
- ~~M-3: Rate limiting~~ ✅ TAMAMLANDI (2026-05-25). Coolify self-hosted Redis + `ioredis` + `rate-limiter-flexible`. Detay: `memory/project_security.md` + son tamamlanan iş bloğu yukarıda.
- `purchase_commitments` + `column_mappings` RLS — 029'da ENABLE ROW LEVEL SECURITY eklendi ✅ (explicit policy yok; proje genelinde aynı pattern — tüm erişim service_role'den)
- Sesli giriş V3: fireNotes → scrap_qty UI, Ctrl+M klavye kısayolu

**Test sayısı:** 106 dosya · 2003 vitest (hepsi yeşil)

---

## Proje Özeti
PMT Endüstriyel için yapay zeka destekli ERP sistemi. Endüstriyel vana satışı (B2B).
**Stack:** Next.js 15 · TypeScript · Supabase (aktif, 18+ migration) · Tailwind CSS kurulu ama kullanılmıyor (inline styles kullanıyoruz)

---

## Bu Projeyi İlk Açıyorsan

Okuma sırası:
1. `README.md` — kurulum + env + migration
2. `domain-rules.md` — sistemin ne yapması/yapmaması gerektiği (source of truth)
3. `src/lib/database.types.ts` — DB tablo şeması (snake_case)
4. `src/lib/api-mappers.ts` — DB ↔ frontend veri dönüşümleri

---

## Kritik Kodlama Kuralları

### Stil: Sadece Inline Styles + CSS Variables
```tsx
// DOĞRU
<div style={{ color: "var(--text-primary)", padding: "16px" }}>

// YANLIŞ — Tailwind class kullanma
<div className="text-white p-4">
```

### Animasyon Yasak
- Framer Motion **kurulu ama YASAK** — import etme
- CSS `animation` ve `transition` sadece gerekli yerde (hover, progress bar gibi)

### Her interaktif component için
```tsx
"use client";
```

### Renk değerleri: Her zaman CSS variable
```
var(--text-primary)    var(--text-secondary)   var(--text-tertiary)
var(--bg-primary)      var(--bg-secondary)      var(--bg-tertiary)
var(--border-primary)  var(--border-secondary)  var(--border-tertiary)
var(--accent)          var(--accent-bg)          var(--accent-text)     var(--accent-border)
var(--success)         var(--success-bg)         var(--success-text)    var(--success-border)
var(--warning)         var(--warning-bg)         var(--warning-text)    var(--warning-border)
var(--danger)          var(--danger-bg)          var(--danger-text)     var(--danger-border)
```

---

## Proje Yapısı

```
src/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx                    — Ana dashboard
│   │   ├── layout.tsx                  — Sidebar + Topbar wrapper
│   │   ├── orders/
│   │   │   ├── page.tsx                — Sipariş listesi
│   │   │   ├── new/page.tsx            — Yeni sipariş formu
│   │   │   └── [id]/page.tsx           — Sipariş detay + durum geçişleri
│   │   ├── products/page.tsx           — Stok & Ürünler
│   │   ├── customers/page.tsx          — Cariler
│   │   ├── production/page.tsx         — Üretim kaydı (ses + form)
│   │   ├── import/page.tsx             — AI dosya içe aktarma (7-adım wizard)
│   │   ├── alerts/page.tsx             — Üretim & Stok uyarıları
│   │   ├── parasut/page.tsx            — Muhasebe sync dashboard
│   │   ├── purchase/suggested/page.tsx — Yeniden sipariş önerileri
│   │   └── settings/page.tsx           — Firma + kullanıcı + API ayarları
│   ├── api/                            — Route handler'lar (Next.js App Router)
│   │   ├── health/                     — Sağlık kontrolü
│   │   ├── orders/                     — CRUD + durum geçişleri
│   │   ├── products/                   — CRUD
│   │   ├── customers/                  — CRUD
│   │   ├── production/                 — CRUD
│   │   ├── alerts/                     — CRUD + scan
│   │   ├── import/                     — Batch → drafts → confirm akışı
│   │   ├── ai/                         — parse + score endpoint'leri
│   │   └── parasut/                    — sync-all, retry, stats, invoices, logs
│   └── globals.css                     — CSS variables (dark theme)
├── components/
│   ├── layout/                         — Sidebar, Topbar
│   ├── dashboard/                      — StatsCards, RecentOrders, AIAlerts
│   ├── ui/                             — Button, Toast, DemoBanner
│   └── customers/                      — CustomerDetailPanel (sağ panel)
└── lib/
    ├── supabase/                        — DB client + tablo query fonksiyonları
    │   ├── service.ts                   — Supabase service client (RLS bypass)
    │   └── orders.ts, products.ts,      — Her tablo için query fonksiyonları
    │       customers.ts, alerts.ts,
    │       production.ts, sync-log.ts, import.ts
    ├── services/                        — İş mantığı katmanı
    │   ├── order-service.ts             — Sipariş geçişleri, rezervasyon tetikleme
    │   ├── alert-service.ts             — Alert yaşam döngüsü
    │   ├── production-service.ts        — BOM etkileri, üretim tamamlama
    │   ├── purchase-service.ts          — Yeniden sipariş önerisi hesaplama
    │   ├── parasut-service.ts           — Sync, retry, sync-all
    │   ├── import-service.ts            — Batch → draft → merge pipeline
    │   └── ai-service.ts               — Claude Haiku: parse, score, risk
    ├── database.types.ts                — Supabase tablo tipleri (snake_case)
    ├── api-mappers.ts                   — DB row → frontend model dönüşümleri
    ├── mock-data.ts                     — Frontend interface tanımları (camelCase)
    ├── data-context.tsx                 — Global React context (gerçek API'ye bağlı)
    ├── api-error.ts                     — Merkezi hata yönetimi
    └── stock-utils.ts                   — coverage_days, daysColor yardımcıları
supabase/
└── migrations/                          — SQL migration dosyaları (sırayla uygula)
```

---

## Veri Modelleri

### Mimari Katmanlar
- **DB katmanı** (`database.types.ts`): snake_case, nullable field'lar
- **Frontend katmanı** (`mock-data.ts`): camelCase interface'ler
- **Dönüşüm** (`api-mappers.ts`): `mapProduct()`, `mapCustomer()`, `mapOrderDetail()` vb.

```ts
// Product — DB-aligned field isimler
// productType: "manufactured" | "commercial"
Product: id, name, sku, category, unit, price, currency,
         on_hand, reserved, available_now,
         minStockLevel, isActive, productType, warehouse,
         reorderQty?, preferredVendor?, dailyUsage?

// Customer
Customer: id, name, email, phone, address, taxNumber, taxOffice,
          country, currency, notes, isActive,
          totalOrders, totalRevenue, lastOrderDate

// Order — ÇİFT EKSEN
Order: id, orderNumber, customerName,
       commercial_status,   // draft | pending_approval | approved | cancelled
       fulfillment_status,  // unallocated | partially_allocated | allocated | partially_shipped | shipped
       grandTotal, currency, createdAt, itemCount

// OrderLineItem
OrderLineItem: id, productId, productName, productSku, unit,
               quantity, unitPrice, discountPct, lineTotal

// OrderDetail extends Order
OrderDetail: ...Order, customerId, customerEmail, customerCountry,
             customerTaxOffice, customerTaxNumber, subtotal, vatTotal, notes,
             parasutInvoiceId?, parasutSentAt?, parasutError?,
             aiConfidence?, aiReason?, aiRiskLevel?,
             lines: OrderLineItem[]
```

---

## Sipariş Durumu (Çift Eksen)

```
commercial_status:
  DRAFT → PENDING_APPROVAL → APPROVED → CANCELLED

fulfillment_status (sadece APPROVED siparişlerde aktif):
  UNALLOCATED → PARTIALLY_ALLOCATED → ALLOCATED → PARTIALLY_SHIPPED → SHIPPED

Kural: Rezervasyon sadece commercial_status = APPROVED olunca tetiklenir.
```

---

## Sipariş Hesaplama
```ts
lineTotal  = quantity * unitPrice * (1 - discountPct / 100)
subtotal   = sum(lineTotals)
vatTotal   = subtotal * 0.20   // KDV %20
grandTotal = subtotal + vatTotal
```

---

## Stok Modeli
```
available_now = on_hand - reserved
// on_hand: fiziksel stok
// reserved: onaylı siparişler için ayrılmış
// available_now: satılabilir gerçek miktar (computed column)
```

---

## Stok Modeli (Detay)

```
on_hand        — fiziksel stok
reserved       — onaylı siparişler için ayrılmış
available_now  = on_hand - reserved              (computed column)
quoted         = draft + pending_approval siparişlerdeki toplam miktar
promisable     = available_now - quoted          (canonical; negatif olabilir — Math.max ile gizleme)
incoming       = açık purchase commitment toplamı
forecasted     = on_hand + incoming - reserved - quoted
```

---

## Domain Kuralları

### Teklif Süresi (quote_valid_until)
- `sales_orders.quote_valid_until date` — nullable, NULL = süresiz
- **Tarih karşılaştırma kuralı — ZORUNLU:**
  ```ts
  const todayStr = new Date().toISOString().slice(0, 10);
  const isExpired = !!date && date < todayStr;  // string karşılaştırma
  ```
  `new Date(date) < new Date()` KULLANMA — saat farkı nedeniyle ~24 saat kayar.
- Expire akışı: `serviceExpireQuotes()` (CRON) → expired draft → auto-cancel, pending → `quote_expired` alert

### Alert Tipleri

| Tip | Tetikleyici |
|-----|-------------|
| `stock_critical` | available_now ≤ 0 |
| `stock_risk` | available_now ≤ min_stock_level |
| `purchase_recommended` | reorder önerisi |
| `order_shortage` | onaylı sipariş için stok yetersiz |
| `order_deadline` | stok tükenme tarihi yakın |
| `quote_expired` | pending_approval + quote_valid_until geçmiş |
| `overdue_shipment` | approved + sevk edilmemiş, planlanan tarih geçmiş veya created_at+7 gün |
| `sync_issue` | Paraşüt sync hatası |
| `import_review_required` | import batch review gerekiyor |

**Dedup:** `dbListActiveAlerts()` → type+entity_id filtresi ile aktif alert varsa yeni yaratılmaz.
**Kapanma:** `dbBatchResolveAlerts([{ type, entityId, reason }])` — ID değil type+entity ile.

### CRON Endpoint'leri (`middleware.ts CRON_PATHS`)

| Endpoint | İşlev |
|----------|-------|
| `POST /api/alerts/scan` | Stok alert taraması |
| `POST /api/alerts/ai-suggest` | AI alert önerileri |
| `POST /api/parasut/sync-all` | Paraşüt sync |
| `POST /api/orders/expire-quotes` | Süresi dolan teklifleri işle |
| `POST /api/orders/check-shipments` | Geciken sevkiyat alertları |

### Import Servisi Kontratı
`serviceConfirmBatch` → `{ added, updated, skipped, errors }`
- Yeni SKU → `added` (on_hand dahil)
- Mevcut SKU → `updated` (on_hand dahil değil — master-data only)
- Eksik zorunlu alan (sku/name/unit) → `skipped`

---

## Güvenlik ve Demo Mode

### Auth Middleware (`middleware.ts` — proje kökünde)
- `/` ve `/login` → herkese açık; auth'd kullanıcı `/`'e gelirse `/dashboard`'a yönlendir
- `/dashboard/**` ve `/api/**` → oturum gerektirir
- Cron bypass: `CRON_SECRET` Bearer token → CRON_PATHS
- `/api/health` ve `/api/auth/demo` → her zaman public

### Demo Mode
**Entry:** Landing "Demo Gez" → `demo_mode=1` cookie → `/dashboard`

**`src/lib/demo-utils.ts`:** `useIsDemo()`, `DEMO_DISABLED_TOOLTIP`, `DEMO_BLOCK_TOAST`

**Middleware gate (demo_mode=1 + unauthenticated):**
- `GET /api/**` → izin ver
- `POST/PATCH/DELETE /api/**` → 403

**Client-side guard pattern:**
```tsx
const isDemo = useIsDemo();
if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
<Button disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
```

### Credential Güvenliği
- Auth'd kullanıcı: masked (ilk 4 kar + ••••••••) + boolean flag
- Demo/anon: null veya false
- Regression: `src/__tests__/credentials-no-leak.test.ts`, `demo-mode-middleware.test.ts`

---

## Entegrasyonlar

### Paraşüt
- `src/lib/parasut.ts` — şu an **MOCK** (%90 başarı, 1-1.8s rastgele gecikme)
- `PARASUT_ENABLED=true` → sync aktif; boş/false → erken döner
- Sipariş detay → sevk → `serviceSyncOrderToParasut(id)` (fire-and-forget değil)

### AI Katmanı (Claude Haiku — `claude-haiku-4-5-20251001`)
- Import: `aiDetectColumns()` — sheet başına TEK çağrı, kolon eşleştirme
- Order Review Risk, Ops Summary, Stock Risk Forecast, Purchase Copilot
- AI memory: `column_mappings` tablosu (kolon hafızası), `ai_entity_aliases` (isim öğrenme)
- Guardrails: G1-G4, run logging (`ai_runs` tablosu)
- `GET /api/ai/observability` → son 7 gün istatistik

### Test Altyapısı
- **Framework:** Vitest · `src/__tests__/` · node environment
- **63 dosya · 1274 test**
- Mock pattern:
  ```ts
  vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: vi.fn() }));
  vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }));
  ```

---

## Auth ve Kullanıcı Yönetimi

- `src/app/login/page.tsx` — Supabase `signInWithPassword`
- `src/app/api/admin/users/route.ts` — GET/POST (service role key)
- İlk admin: `npm run create-admin email şifre`
- Demo modda POST/DELETE → middleware 403

---

## Tamamlanan Fazlar

| Faz | Konu |
|-----|------|
| 0 | Domain Alignment |
| 1 | Frontend Stabilization |
| 2 | Core Domain Model (DB schema — 14+ tablo, 26 migration) |
| 3 | Orders Engine |
| 4 | Inventory & Reservation Engine |
| 5 | Critical Stock & Alerts Engine + Teklif Kırılımı |
| 6 | Purchase Suggestion Engine + Teklif Süresi + Geciken Sevkiyat |
| 7 | Production Engine |
| 8 | Import Flow → Kolon Eşleştirme + Hafıza + Inline Düzenleme |
| 9 | Paraşüt Integration |
| 10 | AI Layer (Claude Haiku) |
| + | Demo Mode, Güvenlik, Ürün Kullanım Bayrakları |

---

## Claude İçin Kurallar (Feedback)

1. **Sessiz silme yasak:** Kodu silmeden önce yerine ne geldiğini açıkla veya kullanıcıya sor. "Taşıdım" demek yeterli değil — eski işlevsellik tam karşılanmalı.

2. **Memory güncellemesi:** Proje durumu değiştiğinde (`current_focus.md`, bu dosyanın "Mevcut Durum" bölümü) otomatik güncelle — kullanıcı söylemeden.

3. **Context güncelleme:** İş commit'lendikten hemen sonra "Mevcut Durum"u ve `memory/current_focus.md`'yi güncelle.

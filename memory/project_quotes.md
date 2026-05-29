---
name: KokpitERP — Teklif Modülü Roadmap
description: Teklif (quotes) modülünün tamamlanan fazları, V2 master plan referansı, kalan işler
type: project
originSessionId: f2c7abb6-e108-4254-b294-f3de57424ee3
---
## Faz 5 infra dilim (2026-05-30) — numara katmanı (yıllık reset + configurable prefix), 3821 test, COMMIT BEKLİYOR + migration 073 APPLY BEKLİYOR

**Faz 5 master-plan'da 5 parça (status CHECK + revizyon + sig backfill + prefix + yearly_counters) tek satır, detay yok.** Kullanıcı kararı: **infra dilim** = sadece numara katmanı. Plan: `~/.claude/plans/clever-dancing-owl.md`.

- **ERTELENEN:** revizyon zinciri (root_quote_id/revision_no/`create_quote_revision` RPC+UI+status — büyük + underspec, kendi oturumu); sig_* rename (19 dosya/73 occ kozmetik); status CHECK (034:91 zaten 5 değer, yeni status yalnız revizyonda → no-op).
- **Migration 073 (YENİ, APPLY BEKLİYOR):** company_settings += quote_number_prefix('TKL')/separator('-'); quote_yearly_counters(year pk,last_seq)+RLS; backfill (034 defansif precedent `^TKL-\d{4}-\d+$` + gömülü-yıl split_part(,2) group + on conflict greatest); next_quote_number() rewrite (atomik on conflict last_seq+1 + prefix company_settings'ten). Signature `() returns text` KORUNDU (create RPC+seed değişmez). V7-A1 DEFINER YOK. Idempotent.
- **Güvenlik:** quote_number UNIQUE (012:9) → backfill miscompute sessiz dup DEĞİL, gürültülü UNIQUE violation (recoverable). Gömülü-yıl group (created_at değil) — next_quote_number now() yılını gömer.
- **Frontend YOK:** server-üretimli read-only; parser yok; dbFindQuoteByNumber .eq(). CompanySettingsRow TS += 2 alan. Sınırlama: tek separator çift görev.
- **Test:** quotes-faz5-numbering (6 source-regex) — **DRİFT-GUARD değil correctness** (DB-side; gerçek doğrulama manuel smoke). **3815→3821 yeşil** · tsc/build/lint temiz.
- **DURUM: COMMIT BEKLİYOR + 073 APPLY BEKLİYOR.** Sıradaki: commit/push + 073 apply + smoke + revizyon zinciri / Faz 4 (074-075).

---
## Faz 3 REVIEW DÜZELTMELERİ (2026-05-29) — Bulgular P1-P3 (2 tur), 3815 test, COMMIT+PUSH 6366cbd+11c5079 + migration 070-072 APPLY EDİLDİ

İlk implement (c5d8267) sonrası kullanıcı review'unda 5 bulgu; hepsi kod karşısında doğrulandı + kapatıldı. Plan: `~/.claude/plans/clever-dancing-owl.md`.

- **P1 convert iskonto block:** `serviceConvertQuoteToOrder` iskontoyu yok sayıp order toplamını yüksek yazıyordu; `sales_orders`'ta header iskonto kolonu Faz 6'ya kadar yok → "koru" imkânsız → `discount_amount > 0` ise convert BLOCK (already-converted kontrolünden sonra). UI `[id]/page.tsx` iskontolu accepted → buton yerine not. Faz 6'da kalkar.
- **P2 server/DB validasyon:** `validateDiscount(disc, subtotal)` (quote-validation.ts) negatif/subtotal-üstü/**non-finite (round2)** → route 422 (POST+PATCH). **Round2:** `Number.isFinite` guard (NaN/`"abc"` RPC numeric 500'e düşmesin) + POST `Number()` cast. migration 072 `check (discount_amount >= 0)` — **round2: pg_constraint guard'lı DO block (idempotent)**. `<= subtotal` DB değil route kuralı.
- **P2/P3 autosave restore:** teklif_v3 payload'a `discount` eklendi (yazım+restore) → kaydetmeden refresh'te korunur.
- **P3 TR parse:** 4 toplam input onFocus'ta ham `String(Math.round(eff*100)/100)` (formatlı değil) → `1.234,56`→`1.234` binlik parse hatası + uzun ondalık görünümü giderildi. Parser değişmedi.
- **P3 UI mesaj (round2):** iskontolu accepted not'undan "kaldırırsanız dönüştürebilirsiniz" çıktı (accepted düzenlenemez, imkânsız aksiyon).
- **P3 doc:** lint repo geneli 32 error / 0 warning (memory "3" QuoteForm dosya-bazlıydı); bu turda yeni hata yok.
- **Numbering:** 072 iskonto CHECK aldı → Faz 5 = 073, downstream +1. QUOTES_V2_PLAN.md "Migration Sırası" hizalandı.
- **Test:** quotes-faz3-discount (r1 +13, r2 malformed/idempotent/mesaj) + quote-convert-service +2 + faz4b/faz4a regex. **3799 → 3815 yeşil** · tsc temiz · build OK · lint 32 baseline.
- **DURUM: COMMIT+PUSH EDİLDİ** (`6366cbd`, 072 dahil 15 dosya) **+ migration 072 APPLY BEKLİYOR.** Sıradaki: 072 apply (idempotent) + UI smoke + Faz 5 (073).

---
## Faz 3 IMPLEMENT EDİLDİ (2026-05-29) — header iskonto, 3799 test, COMMIT+PUSH c5d8267 + migration APPLY EDİLDİ

**Faz 3 = header iskonto (`discount_amount`).** quotes'a İLK iskonto alanı (mevcut `discount_pct` order_lines'a ait, quote'a değildi). Türk fatura standardı: Ara Toplam → İskonto → KDV Matrahı (subtotal − discount) → KDV → Genel Toplam (iskonto **KDV ÖNCESİ**; standart, kullanıcı seçimi değil). Plan: `~/.claude/plans/clever-dancing-owl.md`.

- **Kullanıcı kararı:** kapsam **yalnız iskonto**; `company_settings.default_vat_rate` bu fazdan ÇIKARILDI (iskontodan bağımsız + form KDV select sabit 0/10/20 → friction → ayrı "ayarlar" fazı). Migration 070 = sadece `quotes.discount_amount`. (Master-plan 070 satırı default_vat_rate öngörüyordu — ileride QUOTES_V2_PLAN.md:325 hizalanmalı.)
- **Migration (APPLY EDİLDİ — kullanıcı Supabase editöründe çalıştırdı):** `070_quotes_discount.sql` (`alter table quotes add column discount_amount numeric(15,2) not null default 0`; mevcut teklifler 0 → legacy snapshot korunur, subtotal iskonto-ÖNCESİ kalır, grand=subtotal−discount+vat). `071_quotes_rpc_discount.sql` (069 create/update RPC üzerine CREATE OR REPLACE — `discount_amount` payload COALESCE 0 + **V3-A6 draft guard**: update_quote_with_lines başı `status<>'draft' → 42501 RAISE`, route 409 ön-kapısının belt-and-suspenders'ı; create_* guard'sız; V7-A1 INVOKER, V7-A2 NULLIF korundu).
- **Form toplam modeli:** mevcut `comp*`/`ov*`→`eff*` iki katman korundu. İskonto **override paterni DEĞİL** (↻/ov üçlüsü YOK) — doğrudan `discount` state. `effDisc = Math.min(Math.max(discount,0), effSub)` clamp (0 ≤ disc ≤ subtotal); `effVat = ov ?? (effSub-effDisc)*rate/100`; `effGrand = ov ?? (effSub-effDisc)+effVat`.
- **KRİTİK hydrate (advisor must-have):** `setDiscount(initialData.discountAmount ?? 0)` init'te. Atlanırsa iskontolu mevcut teklif edit+kaydet'te **sessizce 0'a düşer + grand_total değişir** (finansal hata) — re-save source-regex testi kilitledi.
- **Dokunulan dosyalar:** 070+071 migration; database.types (QuoteRow.discount_amount); mock-data (QuoteDetail.discountAmount); quotes.ts (CreateQuoteInput.discount_amount required — dbCreate/dbUpdate `...header` spread otomatik geçirir, gövde değişmedi); api-mappers (mapQuoteDetail); QuoteForm (state+formül+hydrate+payload+autoSave/savePreviewData IIFE+dep+İskonto satırı); quote-types (QuoteData.discountAmount); quote-document-helpers (BILINGUAL_LABELS.discount=İskonto/Discount); QuoteDocument (koşullu satır `discountAmount>0`, eksi işaretli); import-service (2 literal: update existing.discount_amount koru, create 0). preview/page.tsx değişmedi (localStorage cast otomatik; eski payload undefined>0=false → satır gizli).
- **Test:** `quotes-faz3-discount.test.ts` (21: POST/PATCH passthrough + non-draft 409 regression + formül referans + form/document/types/migration source-regex). faz4a autoSave regex penceresi 2000→2600 (iskonto IIFE'leri bloğu uzattı; amaç korundu, zayıflatma değil). **3778 → 3799 yeşil** (faz3=21) · tsc temiz · build OK (`ƒ Proxy`) · lint 3 baseline error 0 warning.
- **DURUM: COMMIT+PUSH EDİLDİ** (`c5d8267` → main, `62eeb8e..c5d8267`, Coolify redeploy) + migration APPLY EDİLDİ. Sıradaki: UI smoke + Faz 5 (072) / Faz 4 (PDF arşiv).

---
## Faz 2 IMPLEMENT EDİLDİ (2026-05-29) — validasyon katmanı, 3778 test, COMMIT+PUSH afe936b

**Faz 2 = tam master-plan Faz 2 (kullanıcı kararı: dar 2-madde değil, 4 düzeltme).** Migration YOK (alanlar Faz 1a/1b'de hazırdı). Yeni `src/lib/quote-validation.ts` (3 pure helper: validateQuoteLineQuantities / validateQuoteForSend / findMissingHsLines + QuoteLineForValidation interface) tek source-of-truth; route'lar + servis + form paylaşır. Plan: `~/.claude/plans/clever-dancing-owl.md`.

- **V7-A11 (qty pozitif tam sayı, create/edit 422):** `validateQuoteLineQuantities` — predicate "gerçek satır" = `product_id != null || unit_price > 0`. POST `/api/quotes` + PATCH document-update branch'te `validateStringLengths` yanına; küsürat/0 → 422, dbCreate/Update çağrılmaz. Salt-açıklama/başlık satırı (qty 0, product/fiyat yok) **muaf** (kullanıcı kararı — buildQuotePayload code VEYA desc'i olan satırı tutup qty:0 gönderdiği için başlık satırlarını 422'lememek). UI nudge QuoteForm:1084 `min="1" step="1"`.
- **V4-A2 (customer_address) + V4-A4 (product_id) send-time HARD check:** `validateQuoteForSend` — `serviceTransitionQuote`'ta **yalnız `target==="sent"`**. customer_address zorunlu; substantive satır (`unit_price>0 || quantity>0`) product_id null → blok. `QuoteTransitionResult.validationFailed:true` → PATCH transition mapping `notFound?404 : validationFailed?422 : 409`. accepted/rejected geçişleri etkilenmez (yalnız sent). **P2 fix (review): sent branch'inde `validateQuoteLineQuantities(quote.lines)` da çalışır** (validateQuoteForSend'den önce) → legacy/bypass draft küsüratlı/0 adetle sent OLAMAZ; qty validator 3 noktada (POST + PATCH doc-update + sent transition). Faz 6 accept RPC `product_id IS NULL → RAISE` backstop'u **planlı (henüz yok — Faz 6/075)**; bu send-time check kullanıcı-dostu erken kapı.
- **V3-A1 (GTİP soft warn) — formda inline (kullanıcı kararı):** `findMissingHsLines` derived (state YOK); toolbar altı non-blocking `role="status"` + `var(--warning-text)` uyarı. **Hiçbir butonu disable etmez** (soft; regression test `not.toMatch(/disabled=\{[^}]*missingHs/)`). Send detay sayfasında transition ile yapıldığı için form-side warn = veri-tamlık önerisi (gönderim blokları send-time server-side).
- **Substantive predicate kuraldan kurala farklı (plan'da kilitli):** qty → product||price; product_id send-check → price||qty; GTİP → product||price||qty. Üçü ayrı; helper'larda izole.
- **Test:** `quote-validation-helpers.test.ts` (22 pure), `quotes-faz2-validation-routes.test.ts` (12 route — POST/PATCH qty + transition mapping; serviceTransitionQuote mock'lu), `quotes-faz2-form-warn.test.ts` (7 source-regex). `quote-service.test.ts` `stubQuote`'a customer_address eklendi (yeni send-check mevcut draft→sent başarı testlerini kırmasın) + bu fazda quote-service **+7 test** (5 send-validation + 2 P2 bypass). **3731 → 3778** (targeted Faz 2 = 74) · tsc temiz · build OK.
- **DURUM: COMMIT + PUSH EDİLDİ** (`afe936b` → main, `ff07a86..afe936b`, Coolify redeploy). React Doctor advisory baseline (skor 90/100, Faz 2'ye özel yeni bulgu yok). Sıradaki: UI smoke + Faz 3 (070-071 header discount).

---
## Faz 1b IMPLEMENT EDİLDİ (2026-05-29) — QuoteForm entegrasyon, 3729 test, COMMIT+PUSH+APPLY EDİLDİ

Faz 1 → **1a (DB foundation)** ✅ + **1b (QuoteForm/UI)** ✅ tamamlandı. 1b tek dosya `QuoteForm.tsx` + `quotes-faz1b-form-integration.test.ts` (+27 test, source-regex):
- **V3-A4** productId gizli yakalama (select→p.id, manuel kod→temizle, payload product_id, hydrate). **069 RPC tüketimi DOĞRULANDI** — product_id+unit_weight_kg+kg_manual_override her iki RPC'de INSERT kolon+value NULLIF guard'lı (kozmetik değil).
- **V4-A2** custId/custAddress state + handleSelectCustomer capture + Address/Adres input + payload customer_id/customer_address + hydrate.
- **V4-B3/V3-B5/V4-A7** handleSelectProduct hs/size/unitWeightKg auto-fill; patchRow+round3 helper; handleQtyChange KG=qty×birim recompute; handleKgChange→kgManualOverride; payload unit_weight_kg/kg_manual_override.
- **V4-A3 satıcı freeze:** `hasSellerSnapshot` ayraç + company effect `if(hasSellerSnapshot) return` (snapshot'lı quote'ta live fetch ATLA → donmuş); seller_* hydrate + persist; snapshot'sız eski quote→live fetch fallback.
- **Regression:** faz4b desc bloğu BİREBİR korundu (konsolide refactor yok) — faz4b:30 + guard test yeşil. tsc temiz · 3729 test · build OK.
- **Migration apply EDİLDİ** (066-069 Supabase editöründe). Runtime UI smoke kullanıcı tarafında bekliyor.
- **Caveat:** hs/size auto-fill DORMANT (products'ta veri yok); handleSelectProduct hs'yi her seçimde set eder (dirty-guard YOK) → manuel HS yeniden-seçimde silinir. Products drawer hs/size edit UI 1b DIŞI (Faz 2/products-page).
- **DURUM: COMMIT + PUSH EDİLDİ** (main, Coolify redeploy) · migration apply EDİLDİ. Sıradaki: UI smoke + **Faz 2** (V3-A1 GTİP soft warn, V7-A11 qty validator).

### Faz 1a (önceki dilim) — commit `106686c` + doc-sync `c9f2bc8`, push/apply EDİLMEDİ
- Migration 066-069 + TS (database.types/mock-data/api-mappers/quotes/products) + 20 test. V7-A1 INVOKER, V7-A2 NULLIF korundu.

## V7 Master Plan — diskte mevcut, 6 bulgu kod karşısında DOĞRULANDI (2026-05-29 6. tur) — Implement EDİLMEDİ

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` zaten V7 (02:02'de yazılmış, bu oturumdan önce). Kullanıcının "Kısa Review" 6 bulgusu (3 P1 + 3 P2) + 1 bonus = **7 düzeltme** V7-A1…A7 olarak plana işlenmiş. Bu oturumda 6 bulgunun tamamı kod karşısında doğrulandı (geçerli):

- **V7-A1 (P1) SECURITY DEFINER kaldırılır:** `036_fix_quote_rpc_security.sql:1-3` bilinçli kaldırmış; 065 RPC'lerinde de DEFINER yok → V7 SECURITY INVOKER (default) korur. ✅ doğrulandı.
- **V7-A2 (P1) quote_date NULLIF guard:** `065:71,132` `NULLIF(p_header->>'quote_date','')::date`. ✅ doğrulandı (direkt cast boş string'te patlar).
- **V7-A3 (P1) order_lines satır vat_rate snapshot:** `039:57` `order_lines.vat_rate numeric(5,2) NOT NULL DEFAULT 20`; `parasut-service.ts:686` `vat_rate: line.vat_rate ?? 20`. Accept RPC `v_quote.vat_rate`'i her satıra yazmalı. ✅ doğrulandı.
- **V7-A4 (P2) header discount Paraşüt:** `parasut-service.ts:688` `discount_value: line.discount_pct`. ✅ doğrulandı. **KULLANICI KARARI (kesinleşti 2026-05-29):** snapshot `sales_orders.discount_amount` MUTLAKA taşınır; AMA `discount_amount>0` siparişte Paraşüt fatura SESSİZCE oluşturulMAZ — sync bloklar/uyarır ("Paraşüt iskonto aktarımı ayrı faz"). Saf "ertele" reddedildi (sessiz ERP≠muhasebe finansal hata riski). Gerçek aktarım yöntemi (orantılı/ayrı satır) ayrı faz.
- **V7-A5 (P2) accept öncesi PDF arşiv guard:** `quote_pdf_archives` henüz yok (Faz 4 migration 073). ✅ bulgu geçerli. **KULLANICI KARARI (kesinleşti 2026-05-29): RECOVER/GENERATE** (422 değil). Accept route'ta RPC'den ÖNCE: arşiv yoksa Puppeteer üret + arşivle (immutable upsert=false), sonra atomik accept RPC. PDF üretimi fail → 502 (accept çağrılmaz). PDF üretimi server-side olduğu için atomik SQL RPC içinde DEĞİL route/service katmanında.
- **V7-A7 (bonus) order_lines tablo adı:** `001:110 create table order_lines`; `sales_order_lines` hiçbir migration'da YOK. ✅ doğrulandı (V6 örneği yanlış tablo adı kullanmış).
- **V7-A6 (P2) faz başı tam plan prosedürü:** delta plan → Faz 1'de self-contained tam plan yaz (3 adım).

**2 P2 kararı KESİNLEŞTİ (2026-05-29):** (A4) snapshot taşı + Paraşüt discount>0 sessiz fatura YOK; (A5) accept route recover/generate (422 değil). Plan dosyası bu kararlarla güncellendi.

**6. tur 2. okuma — 5 düzeltme daha (kullanıcı, kod karşısında doğrulandı):**
- **V7-A8 (P1/P2):** Accept RPC order line `product_name`/`product_sku`/`unit` → `JOIN products p` master'dan (qli.description/product_code DEĞİL). Mevcut `quote-service.ts:143-150` zaten master'dan çekiyor; atomik RPC bu semantiği korumalı. Quote açıklaması order line'a taşınmaz (order_line_description ayrı faz).
- **V7-A9 (P2):** Migration 075 sonrası `SalesOrderRow` (database.types.ts:278-314) + `mapOrderDetail` (api-mappers.ts) 4 yeni alan (discount_amount/vat_rate/source_quote_revision_no/quote_pdf_archive_id) Faz 6'da kilitli. V7-A4 guard `order.discount_amount` okuyacak → tip şart.
- **V7-A5 ek (P1):** Route recover/generate'e EK olarak RPC içinde `quote_pdf_archive_id IS NULL → RAISE 23514 ROLLBACK` (route bypass koruması, belt-and-suspenders).
- **V7-A4 netleşti (P2):** "409 ya da uyarı" belirsizliği → tek davranış: `discount_amount>0 → ParasutError("validation")`, invoice create çağrılmaz, marker yazılmaz.
- **Test tablosu fix (P2):** Faz 6 "PDF guard 422" → "recover/generate + fail→502".

**6. tur 3. okuma — 5 düzeltme daha (kod karşısında doğrulandı):**
- **V7-A8 güçlendirme (P1):** JOIN tek başına bloklamaz, **sessizce satır düşürür**. `quote_line_items.product_id` ON DELETE SET NULL (034:107) → send sonrası ürün silinirse NULL → INNER JOIN o satırı atlar (eksik/finansal tutarsız order). Önceki "V4-A4 garanti ediyor" notu YANLIŞTI (send-time check post-send silmeyi kapsamaz). Fix: accept RPC insert öncesi `product_id IS NULL → RAISE 23502`; insert sonrası `GET DIAGNOSTICS ROW_COUNT` ≠ quote line count → RAISE+ROLLBACK (039 precedent). `v_inserted` V7-A10'a da source.
- **V7-A4 güçlendirme (P1+P2):** Guard `parasut-service.ts:1092` catch'i `classifyAndPatch` parasut_step/error/sync_log yazıyor → throw "marker yazılmaz" sözünü bozar. Fix: guard `parasut_claim_sync` (1016) ÖNCESİ **early return** (throw değil) → claim alınmaz, catch path'ine düşmez. + Görünürlük: **ZORUNLU** sync_issue alert (opsiyonel değil; ship route:62 fire-and-forget olduğu için sessiz block görünmez).
- **V7-A10 (P2):** Accept RPC `item_count` set etmiyor (create_order 023 ediyor) → sipariş liste/detay item_count=0. Fix: `item_count = v_inserted`.
- **V7-A11 (P2):** order_lines.quantity integer (001:10) ⟂ quote numeric(12,4) (034:111) + QuoteForm step="any" (972) → küsürat sessiz yuvarlanır. Fix: Faz 2 validator pozitif integer + accept RPC `quantity <> trunc(quantity) → RAISE`.
- **P3 housekeeping:** "Review V7 — 7 Düzeltme" + "eklenen 7" stale başlıklar 17'ye düzeltildi.

**Toplam: V7 = V2(5)+V3(12)+V4(13)+V5(5)+V6(4)+V7(17) = 56 düzeltme.** ~192 test · 12 migration (066-077) · 7 faz.
**Not:** V7 plan dosyası `d201c11`'de commit edildi (mesaj yanlışlıkla "V6" der; içerik V7); 2 P2 kararı + 2./3. okuma sonraki commit'lerle işlendi. Memory V7'ye hizalı.
**Sıradaki:** Faz 1 başlama onayı bekleniyor (V7-A6 prosedürü: önce faz-spesifik self-contained tam plan).

---

## V6 Master Plan ONAYLANDI (2026-05-29 5. tur) — Implement EDİLMEDİ

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` — V6 versiyona güncellendi

**Kapsam:** 7 faz · 12 migration (066-077) · ~175 yeni test · 4-6 hafta tam zamanlı.

**4 düzeltme V6 (5. tur — schema uyum):**
- V6-A1: quote_line_items kolon isimleri **mevcut schema'ya bire bir** — `product_code` (product_sku DEĞİL), `description` (product_name DEĞİL); discount_pct/notes/product_sku/product_name kolonları DB'de yok → RPC'den kaldırıldı. Mapper UI alanları (productSku/productName) translate eder.
- V6-A2: Order number RPC adı **`generate_order_number()`** (next_order_number değil). 003/007 migration'larda tanımlı + orders.ts:59 kullanıyor.
- V6-A3: `sales_orders.vat_rate` snapshot kolonu eklenir — Migration 075 ALTER (DEFAULT 20, CHECK 0-100). Mevcut sales_orders'da vat_total var ama oran yok; quote'tan donmuş snapshot olmadan ileride VAT değişiminde eski siparişler bozulur.
- V6-A4: RPC'ler **tam rewrite DEĞİL** — mevcut create_quote_with_lines (065, 27 alan) + update_quote_with_lines korunur, sadece V5 yeni alanları (customer_address, seller_*, unit_weight_kg, kg_manual_override) eklenir. Migration 069 başlığı bunu açıkça yazar.

**Önceki düzeltmeler korundu:**
- V5 (5): Migration sırası FIX, RPC payload extension, Faz 2 validation order, accept atomik RPC, yearly counter backfill
- V4 (13): audit source, customer_address, seller snapshot, productId hard, PDF resume, DELETE draft, kg DB persist, /accept tek yol, quote_yearly_counters, RLS, hs/size geniş, audit source test, memory checklist
- V3 (12) + V2 (5): GTİP soft, status CHECK, audit kolonlar, productId hidden, PDF immutable, non-draft guard, sig backfill, currency reuse, prefix, src/proxy.ts, unitWeightKg, 0 fiyat 0.00, prepared/approved serbest text, expired→sent, root_quote_id, discount migration kaldırıldı, preview hibrit

**Toplam: V6 = V2 (5) + V3 (12) + V4 (13) + V5 (5) + V6 (4) = 39 düzeltme** entegre.

**Sıradaki:** Faz 1 başlama onayı bekleniyor. Her faz öncesi ayrı detay plan modu açılır.

---

## V5 Master Plan ONAYLANDI (2026-05-29 4. tur) — Implement EDİLMEDİ

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` — V5 versiyona güncellendi

**Kapsam:** 7 faz · 12 migration (066-077) · ~170 yeni test · 4-6 hafta tam zamanlı.

**5 düzeltme V5 (4. tur):**
- V5-A1: Migration sırası — Faz 1+2'nin ihtiyaç duyduğu tüm DB alanları Faz 1 migration grubunda (066-069). customer_address, seller_*, unit_weight_kg artık Faz 1'de hazır. Faz 5 069 ayrıştırıldı.
- V5-A2: Faz 1 yeni Migration 069 — create_quote_with_lines + update_quote_with_lines RPC'leri Faz 1 yeni alanları (customer_address, seller_*, unit_weight_kg, kg_manual_override) payload'tan okur. DB hazır, RPC tutarlı.
- V5-A3: Faz 2 validation order — schema Faz 1'de hazır olduğundan customerAddress + productId hard check güvenle Faz 2'de.
- V5-A4: `/accept` atomik RPC `accept_quote_and_create_order(quote_id, actor)` — Migration 075. Tek PL/pgSQL transaction içinde: SELECT FOR UPDATE quote → idempotency check → status guard → productId defensive → sales_order insert → order lines insert → quote status='accepted' → audit_log. Hata → tüm değişiklikler ROLLBACK.
- V5-A5: Yıllık counter backfill prefix/separator bağımsız — created_at'tan yıl, regex `\d+$` ile son rakam dizisi (TKL/PMT/ABC + -/. tüm formatlar destekli). Revision quote'lar (revision_no>0) backfill'de sayılmaz.

**Migration tahsisi V5:**
- 066: products.hs_code + size_text (Faz 1)
- 067: quotes.customer_address + seller_* 7 alan (Faz 1)
- 068: quote_line_items.unit_weight_kg + kg_manual_override (Faz 1)
- 069: Faz 1 RPC payload extension (V5-A2)
- 070: quotes.discount_amount + company_settings.default_vat_rate (Faz 3)
- 071: RPC header discount + draft guard (Faz 3)
- 072: status CHECK + revision + sig backfill + prefix + quote_yearly_counters (Faz 5)
- 073: quote_pdf_archives + RLS (Faz 4c)
- 074: storage quote-pdfs bucket (Faz 4c)
- 075: sales_orders meta + accept_quote_and_create_order RPC (Faz 6, V5-A4)
- 076: note_templates + RLS (Faz 7)
- 077: quote_line_items_sort_order (Faz 7, koşullu)

**Önceki düzeltmeler korundu:**
- V4 (13 düzeltme): audit_log.source='system', customer_address+validator, seller_* snapshot, productId hard, PDF 3 path resume, DELETE draft, kg DB persist, /accept tek yol, quote_yearly_counters, RLS, hs/size geniş, audit source test, memory checklist
- V3 (12 düzeltme): GTİP soft, status CHECK constraint, audit_log kolonları, productId hidden, PDF immutable INSERT-only, non-draft guard, sig backfill, currency reuse, prefix migration, src/proxy.ts, unitWeightKg, 0 fiyat 0.00
- V2 (5 düzeltme): prepared/approved serbest text, expired→sent, root_quote_id, discount migration kaldırıldı, preview hibrit

**Toplam: V5 = V2 (5) + V3 (12) + V4 (13) + V5 (5) = 35 düzeltme** entegre.

**Sıradaki:** Faz 1 başlama onayı bekleniyor. Her faz öncesi ayrı detay plan modu açılır.

---

## V4 Master Plan ONAYLANDI (2026-05-29 3. tur) — Implement EDİLMEDİ

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` — V4 versiyona güncellendi

**Kapsam:** 7 faz · 10 migration (066-075) · ~145 yeni test · 4-6 hafta tam zamanlı.

**Sıra:** Faz 1 → 2 → 3 → 5 → 4 → 6 → 7 (V3 ile aynı bağımlılık zinciri).

**8 ana düzeltme V4 (3. tur):**
- V4-A1: audit_log.source='system' (enum uyumu; AuditSource = "ui"|"system"|"ai"|"integration"; literal 'migration_069' patlardı)
- V4-A2: quotes.customer_address snapshot + zorunlu validator + backfill + PDF render + müşteri seçiminde auto-fill
- V4-A3: seller_* 7 snapshot alanı DB'de (name/phone/email/address/tax_id/website/logo_url) + sent'te dondur
- V4-A4: productId send-time HARD check (rows.every productId) + convert defensive check (custom satır izinsiz)
- V4-A5: PDF arşiv 3 path resume strategy (idempotent/resume/fresh; partial failure recovery)
- V4-A6: DELETE sadece draft (mevcut sent silinebilir, V4'te 409)
- V4-A7: unit_weight_kg + kg_manual_override DB persist (reload sonrası korunur)
- V4-A8: /accept tek yol; PATCH transition accepted 410 Gone + /convert 410 Gone

**5 ikincil düzeltme V4:**
- V4-B1: quote_yearly_counters tablo + atomik INSERT ON CONFLICT (mevcut quotes_number_seq global, yıllık reset yok)
- V4-B2: RLS ENABLE her yeni tabloya (quote_pdf_archives, note_templates, quote_yearly_counters)
- V4-B3: hs_code/size_text geniş entegrasyon (CreateProductInput + mapper + import wizard)
- V4-B4: audit-source-enum.test.ts (migration/RPC source enum coverage)
- V4-B5: Memory update checklist faz sonu

**Önceki düzeltmeler korundu:**
- V3 (12 düzeltme): GTİP soft, status text+CHECK, audit_log kolon isimleri, productId hidden, PDF immutable INSERT-only, non-draft guard, sig backfill, currency reuse, prefix migration, src/proxy.ts, unitWeightKg gizli, 0 fiyat 0.00
- V2 (5 düzeltme): prepared/approved serbest text + user FK audit, expired→sent, root_quote_id zincir fix, discount migration KALDIRILDI, preview hibrit

**Toplam: V4 = V2 (5) + V3 (12) + V4 (13) = 30 düzeltme** entegre.

**Sıradaki:** Faz 1 başlama onayı bekleniyor. Her faz öncesi ayrı detay plan modu açılır.

---

## V3 Master Plan ONAYLANDI (2026-05-29 2. tur) — Implement EDİLMEDİ

**Dosya:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` — V3 versiyona güncellendi

**Kapsam:** 7 faz · 9 migration (066-074) · ~125 yeni test · 4-6 hafta tam zamanlı tahmin.

**Sıra:** 1 (master + productId + unitWeightKg) → 2 (validation: hs+kg soft, draft guard) → 3 (header discount + currency reuse) → 5 (CHECK constraint update + revision + root_quote_id + expired→sent + sig backfill + prefix) → 4 (PDF + INSERT-only arşiv + preview hibrit + 0.00 fmt) → 6 (kabul → sales_order + productId) → 7 (liste UX, autosave, note_templates).

**6 ana düzeltme V3 (2. tur):**
- V3-A1: GTİP soft warn (HARD değil), KG gibi yumuşak
- V3-A2: Status migration text+CHECK constraint paterni (enum DEĞİL — quotes.status text)
- V3-A3: audit_log kolon isimleri (`entity_type/entity_id/before_state/after_state/source`; target_*/payload YANLIŞ)
- V3-A4: QuoteRow.productId hidden field Faz 1'de (convert flow için kritik)
- V3-A5: PDF immutable arşiv — INSERT-only, upsert=false; varsa mevcut signed URL döner
- V3-A6: Non-draft update/delete HARD guard (helper + RPC SQL guard + 409)

**6 ikincil düzeltme V3:**
- V3-B1: sig_prepared/sig_approved → prepared_by_name/approved_by_name backfill
- V3-B2: company_settings.currency reuse (default_currency DUPLICATE etme)
- V3-B3: quote_number_prefix/separator migration SQL'e dahil
- V3-B4: src/proxy.ts (NOT middleware.ts — Next 16 convention)
- V3-B5: unitWeightKg gizli alan KG recompute için
- V3-B6: 0 fiyat PDF "0.00" (mevcut kod "—" basıyor)

**6 önceki V2 düzeltmesi korundu:** prepared/approved serbest text + user FK audit; legacy expired → sent; root_quote_id zincir fix; discount migration YOK (legacy snapshot); preview hibrit.

**Sıradaki:** Faz 1 başlama onayı bekleniyor. Her faz öncesi ayrı detay plan modu açılır.

**Why:** Kullanıcı kapsamlı revize istedi: ürün auto-fill + çift dilli kurumsal PDF + revizyon + immutable arşiv + kabulde sipariş dönüşümü. Mevcut Faz 1-8 üzerine inşa edilir.
**How to apply:** Faz başlangıçlarında bu dosyayı oku → ilgili fazın migration/dosya/test detayını master plandan çek → faz-spesifik plan yaz → implement et.

---

## Faz 1 — Temel Form UI ✅
- [x] `/dashboard/quotes/new` sayfası
- [x] `QuoteForm.tsx` — müşteri, satıcı, kalem ekleme, KDV hesaplama

## Faz 2 — PDF Önizleme ✅
- [x] `QuotePDFPreview.tsx` — inline preview component
- [x] Yazdır / PDF export butonu

## Faz 3 — Müşteri Entegrasyonu ✅
- [x] Müşteri seçici (customers tablosundan)
- [x] Müşteri bilgileri otomatik doldurma

## Faz 4 — Ürün Entegrasyonu ✅
- [x] Kalem satırlarında ürün arama (products tablosundan)
- [x] SKU, birim fiyat otomatik doldurma

## Faz 5 — DB Persistence + Otomatik Numara ✅ (2026-04-21)
- [x] Migration 034: `quotes` ALTER, `quote_line_items`, `quotes_number_seq`, `next_quote_number()`, RLS
- [x] Migration 035: `create_quote_with_lines` + `update_quote_with_lines` atomic RPC'ler
- [x] Migration 036: security definer fix
- [x] `database.types.ts`, `mock-data.ts`, `api-mappers.ts` güncellemeleri
- [x] `supabase/quotes.ts`: full CRUD + `dbFindQuoteByNumber`
- [x] `GET/POST /api/quotes` + `GET/PATCH/DELETE /api/quotes/[id]`
- [x] Edit modu, read-only Quote No, `window.history.replaceState`

## Faz 5.5 — Güvenlik + Test ✅ (2026-04-21)
- [x] `api/seed`: CRON_SECRET Bearer zorunlu
- [x] `api/admin/users`: `requireAdmin()` — `ADMIN_EMAILS` env guard
- [x] `next.config.ts`: X-Content-Type-Options, X-Frame-Options, Referrer-Policy

---

## Faz 6 — Teklif Listesi Sayfası ✅
- [x] `/dashboard/quotes` liste sayfası (`page.tsx` mevcut)
- [x] Filtreleme: status tabları (draft/sent/accepted/rejected/expired) + arama + tarih aralığı + para birimi
- [x] Teklif satırı: teklif no, müşteri, durum badge, geçerlilik badge, tarih, tutar
- [x] Satır hover → delete butonu + chevron
- [x] Soft-delete confirm (inline "Evet, sil")
- [x] Sidebar navigasyonuna "Teklifler" linki

---

## Faz 7 — Durum Yönetimi ✅ (2026-04-21)
- [x] Durum geçiş butonları: draft→sent, sent→accepted/rejected
- [x] CRON: `POST /api/quotes/expire` → `serviceExpireQuotes()`, middleware CRON_PATHS'e eklendi
- [x] Teklif detay sayfası: status bar + aksiyon butonları + confirm dialog
- [x] QuoteForm readOnly prop: non-draft teklifler kilitli
- [x] Bulgular fix: PATCH draft guard, CRON revalidateTag, autoSave readOnly guard

## Faz 8 — Sipariş Dönüşümü ✅ (2026-04-22)
- [x] `serviceConvertQuoteToOrder`: accepted teklif → draft sipariş
- [x] `dbFindOrderByQuoteId`: idempotency kontrolü
- [x] `POST /api/quotes/[id]/convert`: 201/400/404/409 + cache invalidation
- [x] GET /api/quotes/[id]: `convertedOrderId` + `convertedOrderNumber` (accepted için)
- [x] Quote detail: "Siparişe Dönüştür" butonu + confirm dialog + "Sipariş oluşturuldu" badge
- [x] Order detail: "Kaynak Teklif" linki (`quoteId` varsa)
- [x] `OrderDetail.quoteId` + `mapOrderDetail` mapper

## Faz 8 Bulgular Fix ✅ (2026-04-22) — commit `3634b1c`
- [x] `037_unique_quote_id.sql`: `sales_orders.quote_id` partial UNIQUE index (race condition)
- [x] `quote-service.ts`: 23505 violation catch → `alreadyConverted`; `createdBy` param
- [x] `quote-service.ts`: geçmiş `valid_until` → soft 400 (serviceCreateOrder'a varmadan)
- [x] `quote-service.ts`: atlanan satırlar sipariş `notes`'una ekleniyor
- [x] `convert/route.ts`: session extract → `created_by`; 409'da `existingOrderNumber`
- [x] `page.tsx`: 409 handler `setConvertedOrderNumber` (badge order number gösteriyor)
- [x] `QuoteForm.tsx`: `position: i+1` (1-based satır numaraları)
- [x] +5 test (T15 race, T16–T19 valid_until + notes)
- [x] **83 dosya · 1609 test — 0 hata · 0 TS hatası**

---

## Teknik Notlar

- Quote number format: `TKL-YYYY-NNN` (sıra DB sequence'den)
- Status değerleri: `draft | sent | accepted | rejected | expired`
- DELETE sadece `draft` ve `sent` statüsünde mümkün (409 otherwise)
- RPC'ler atomic: `create_quote_with_lines`, `update_quote_with_lines`
- Migrations: `034_quotes.sql`, `035_quote_rpcs.sql`, `036_fix_quote_rpc_security.sql`, `037_unique_quote_id.sql`
- Dönüşüm idempotency: `dbFindOrderByQuoteId` + DB UNIQUE index ikili güvence
- `serviceConvertQuoteToOrder(quoteId, createdBy?)` — ikinci parametre opsiyonel
- Geçmiş `valid_until` olan accepted teklif dönüştürülemez → 400
- Ürün eşleşmesi olmayan satırlar atlanır, warnings + notes'a yazılır

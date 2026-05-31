---
name: KokpitERP — Teklif Modülü Roadmap
description: Teklif (quotes) modülünün tamamlanan fazları, V2 master plan referansı, kalan işler
type: project
originSessionId: f2c7abb6-e108-4254-b294-f3de57424ee3
---
## Faz 8 — Ertelenen Borçlar Kapanışı (2026-05-31) — 5 alt-faz/5 commit, 4098 test, COMMIT+PUSH EDİLDİ · **migration 080 APPLY BEKLİYOR** — **V7 + tüm ertelenen borçlar TAMAMLANDI**

**Kullanıcı "ertelenenleri halledelim" → V7 fazları boyunca biriken bilinçli borçlar kapatıldı.** Kararlar: Paraşüt iskonto **orantılı per-satır yüzde** / sig rename **ATLA** / drag-reorder **ERTELE**. 5 bağımsız kalem, ayrı commit. Plan: `~/.claude/plans/clever-dancing-owl.md`. Advisor: audit RPC değil helper-seviyesi (migration elendi) + Paraşüt guard→reconciliation.

- **8a — Quotes RBAC (`4935e88`, migration YOK):** accept precedent'i (requirePermission) yazma uçlarına: `POST /api/quotes` + `PATCH [id]` (update+transition) + `POST revise` → `manage_quotes`; `DELETE [id]` → `delete_quotes`. GET'ler **auth-only KALDI** (view_quotes geniş blast radius → ayrı pas). quotes-rbac.test.ts (5: viewer→403 + mutasyon helper çağrılmaz); 7 mevcut route testine role-guard mock (varsayılan izinli).
- **8b — Convert ölü kod temizliği (`71a22cd`, migration YOK):** `serviceConvertQuoteToOrder` + `ConvertResult` kaldırıldı (çağrılmıyordu; yerini Faz 6 atomik accept aldı). 4 import temizlendi. **`dbFindOrderByQuoteId` KORUNDU** (quotes/[id] GET kullanıyor); **`/convert` 410 stub KALDI**. quote-convert-service.test.ts silindi; quotes-faz3 obsolete convert-block testi çıkarıldı.
- **8c — Quotes audit katmanı (`034f8ea`, migration YOK):** **advisor: helper-seviyesi (RPC değil)** → RPC repro riski elendi. dbCreateQuote/dbUpdateQuote/dbCreateQuoteRevision → audit_log (quote_created/updated/revised, source ui, after_state, best-effort, **actor'sız**=codebase-tutarlı; trigger ayrı faz). quotes-audit.test.ts (3); faz4a mock'una audit chain.
- **8d — order_line_description — Migration 080 (`4218d3e`, APPLY BEKLİYOR):** order_lines += description (nullable). accept RPC = **078 gövdesi BİREBİR + tek delta** (CREATE OR REPLACE, DROP yok): order_lines INSERT'e description + SELECT'e qli.description; master p.name/sku/unit KORUNDU. TS/mapper/order-detay-UI. Paraşüt fatura description'ı değişmedi. order-line-description.test.ts (6: tüm accept invariant source-assert + delta + mapper). İdempotent + ROLLBACK.
- **8e — Paraşüt iskonto orantılı (`4b9c938`, migration YOK):** Faz 6 V7-A4 blanket-guard → reconciliation. `computeHeaderDiscountPct`=discount/subtotal*100 → builder per-satır `line.discount_pct + headerPct` (order_lines MUTATE EDİLMEZ). `reconcileParasutDiscount`: orantılı toplam **kendi kodumuzda** (mock net_total iskonto yok sayıyor) vs grand_total tolerans (0.01×satır+0.01); aşım/subtotal=0 → claim öncesi early return + zorunlu sync_issue alert (throw değil), uyuşursa **fatura OLUŞUR**. parasut-discount-guard FLIP (pure 6 + integration 4).
- **Doğrulama: 4098→4098 (8e builder drift-guard +2)** · tsc temiz · npm run lint 0 · build OK. **DURUM: 5 commit COMMIT+PUSH EDİLDİ · migration 080 APPLY BEKLİYOR (yalnız 8d).**
- **Kapsam dışı (kullanıcı kararı):** sig_* rename ATLA (kabul edilen isimlendirme); drag-reorder ERTELE. Kalan (quotes borcu DEĞİL): audit actor (trigger), GET view_quotes RBAC, Paraşüt Sandbox GATE.

---

## Faz 7 — Not Şablonları (note_templates) (2026-05-31) — migration 079, 4098 test, COMMIT+PUSH EDİLDİ (Faz 7 + Bulgular 1.+2.tur) · **079 APPLY EDİLDİ ✅** — **V7 master-plan TAMAMLANDI**

**Bulgular 2. tur (kullanıcı review, P1 yok; 1 yeni P2 + 1 P3 fix + 3 zaten-düzeltilmiş doğrulama):**
- **#1 (YENİ P2 FIX) Unsaved draft restore'da not/teslimat/ödeme kaybı:** `autoSave` `teklif_v3` draft key'ine yalnız `{currency,rows,descDirty,discount}` yazıyordu (`QuoteForm.tsx:494`); notes/deliveryMethod/paymentMethod sadece `teklif_v3_full`'da (preview için). Yeni teklif restore (`teklif_v3` okur, 272-304) bu 3 alanı yüklemiyordu → kullanıcı şablon seçip/yazıp kaydetmeden refresh veya "Formu Düzenle" (preview→/new) yapınca metin kayboluyordu. Faz 7'nin "hazır şablon + teklif özelinde düzenle" deneyimini doğrudan etkiliyordu. **Fix:** `teklif_v3` payload'a `notes/deliveryMethod/paymentMethod` eklendi + restore `setNotes/setDeliveryMethod/setPaymentMethod` (Faz 3 `discount` precedent'i, autoSave dep'leri zaten içeriyordu). **+2 drift-guard test** (autoSave payload + restore); 3 mevcut regex güncellendi (quotes-faz4b:75 `}` zorunluluğu kalktı, quotes-faz3:312 çok-satır, quotes-faz4a:237 pencere 2600→3100).
- **#2 (P3 FIX) Settings liste tüm body'yi basıyordu:** `page.tsx` body max 5000 char pre-wrap → uzun şart metni ayar sayfasını şişiriyordu. **Fix:** `-webkit-line-clamp: 3` (display -webkit-box + box-orient vertical + overflow hidden) önizleme.
- **#3-#5 (ZATEN DÜZELTİLDİ — `0b9398c` / Bulgular 1.tur):** Rapor P2 (DB hata→404 maskeleme), P3 (geçersiz ?kind→tüm liste), doc/plan migration drift'i **tekrar** gündeme getirdi. Bunlar 1. turda kapatılmıştı; kod karşısında yeniden doğrulandı: `note-templates.ts` maybeSingle (87/134/170), route `?kind` invalid→400 (24), QUOTES_V2_PLAN final numbering + historical SUPERSEDED markerlar mevcut. **Ek değişiklik gerekmedi** — rapor `0b9398c` öncesi snapshot'a dayanıyordu.
- **#6 (P3 no-op, tekrar):** `[id]` GET inactive döndürüyor — tüketici yok + hassas değil → bırakıldı (1. tur kararı geçerli).
- **Ek not (no-op):** audit insert error-kontrolsüz — mevcut pattern, Faz 7 regresyonu değil (1. turda da belirtildi).
- **Doğrulama:** **4096→4098** · tsc temiz · npm run lint 0 · build OK. **079 kullanıcı tarafından APPLY EDİLDİ ✅.**

---

**Bulgular 1. tur (kullanıcı review, P1 yok; 2 fix + 3 double-check):**
- **#1 (P2 FIX) DB hatası → 404 maskeleniyordu:** `dbGetNoteTemplate` + update/deactivate ön-okumaları `.single()` + `if(error||!data) return null` ile gerçek DB/RLS hatasını not-found'a düşürüyordu → route 500 yerine 404. **Fix:** `.maybeSingle()` + `if(error) throw` (not-found=null, gerçek hata=throw→500). +2 test (0 satır→null / permission denied→throw).
- **#2 (P3 FIX) Geçersiz `?kind=` tüm şablonları döndürüyordu:** route GET `kind=delivary` typo'su → undefined → filtresiz tam liste (footgun). **Fix:** `?kind=` verildi ama geçersizse **400** (fail-closed); param yoksa filtresiz. Test 400 bekleyecek şekilde flip edildi. (Not: QuoteForm picker zaten `?kind`'siz fetch edip client-side `templatesForField` ile gruplar → mevcut tüketiciyi etkilemez.)
- **#3 (P3 double-check, no-op) `[id]` GET inactive döndürüyor:** liste aktif filtreli; `[id]` GET pasifi de map'liyor. Mevcut tüketici YOK (settings edit modal listeden açılır, picker liste kullanır) + şablon hassas veri değil → id-lookup'ın spesifik satırı dönmesi meşru, bırakıldı.
- **#4 (P3 ertelendi) UI'da pasifleri görme/geri alma yok:** soft-delete DB'de korunuyor ama reaktivasyon yolu yok (PATCH `is_active` kabul etmiyor). Gelecek küçük geliştirme: pasifler sekmesi + reaktivate (PATCH is_active). Bu turda kapsam dışı, dokümante.
- **#5 (P3 FIX) Doc/plan migration drift:** `QUOTES_V2_PLAN.md` final numbering'e hizalandı (079 note_templates + 080 düşürüldü gerekçesiyle); historical V5 blokları (project_quotes/CLAUDE migration tahsisi) "⟵ SUPERSEDED" işaretlendi; stale "079-080" referansları "079 (080 düşürüldü)".
- **Ek not (no-op):** audit insert error kontrolsüz — mevcut product-types/vendors paterniyle uyumlu, Faz 7'ye özel regresyon değil; "audit garanti" istenirse ayrı tur.
- **Doğrulama:** **4094→4096** · tsc temiz · npm run lint 0 · build OK.

---


**V7'nin SON fazı.** PMT teklif formunun 3 serbest-metin alanı (Notlar & Şartlar / Teslimat Şekli / Ödeme Şekli) için tekrar kullanılabilir not şablonları (admin CRUD + QuoteForm picker). Plan: `~/.claude/plans/clever-dancing-owl.md`.

- **080 KALICI DÜŞÜRÜLDÜ (koşullu değil — koşulsuz gereksiz):** master-plan `079→quote_line_items_sort_order (koşullu)` öngörüyordu. Doğrulandı: `quote_line_items.position integer not null default 0` zaten var (034:106), `QuoteForm` `position:i+1` yazıyor, `quotes.ts:88` `position`'a göre sıralıyor, accept RPC (V7-A8) `position`'a göre order'lıyor → yeni kolon gereksiz; drag-reorder UX eklense bile reorder = mevcut `position` yeniden atama. Kullanıcı: drag-reorder **ertelendi**. → Faz 7 = **tek migration 079** (memory'deki "079-080" güncellendi).
- **Migration 079** (`079_note_templates.sql`, kullanıcı apply eder): `note_templates` (kind `notes|delivery|payment|general` CHECK + title/body non-empty CHECK + sort_order + is_active soft-delete) + RLS ENABLE (explicit policy yok, 056 paterni) + `note_templates_set_updated_at` trigger + `idx_note_templates_kind_active` partial index + **PMT standart seed** (deterministik UUID a-prefix node band `000000a000NN`, ON CONFLICT DO NOTHING; update YOK → kullanıcı düzenlemesi ezilmez): delivery 2 / payment 3 / notes 3 satır. İdempotent + ROLLBACK.
- **TS/mapper:** `NoteTemplateKind`+`NoteTemplateRow` (database.types), `NoteTemplate` (mock-data), `mapNoteTemplate` (api-mappers).
- **Helper** `note-templates.ts` (product-types paterni): `dbListNoteTemplates({kind,includeInactive})` / `dbGetNoteTemplate` / `dbCreateNoteTemplate` / `dbUpdateNoteTemplate` / `dbDeactivateNoteTemplate` (soft-delete, **hard-delete YOK** — sessiz silme yasağı) + `isValidNoteTemplateKind` + validation (title 120 / body 5000 / sort_order int≥0) + audit_log (created/updated/deactivated).
- **Route (erişim ayrımı LOAD-BEARING — naif product-types kopyasından fark):** `GET /api/note-templates` **requireRole YOK** (satış kullanıcısı QuoteForm picker'ında tüketir) + `?kind=` passthrough + `force-dynamic`; `POST` admin (201, geçersiz kind 400); `[id]` `GET` (404) + `PATCH` admin (400/404) + `DELETE` admin **soft-delete** (404 / 409 zaten pasif).
- **Settings sayfası** `/dashboard/settings/note-templates`: `KIND_META` export + kind filtre sekmeleri (Tümü/Notlar/Teslimat/Ödeme/Genel) + liste (kind rozeti + body önizleme) + create/edit modal (kind select + title + body + sort_order) + pasifleştir confirm; demo guard + a11y (role=dialog/alert, aria-label). Sidebar "Ayarlar"a "Not Şablonları" linki.
- **QuoteForm picker:** 3 textarea (Notlar/Teslimat/Ödeme) üstünde "+ Şablon ekle…" select (`renderTemplatePicker(kind, value, setter)`); mount'ta `/api/note-templates` fetch (fetch-in-effect konvansiyonu + cancelled guard); `templatesForField(templates, kind)` (kind+general filtre, sort_order sıralı); `applyTemplateToField(current, body)` (boş→doldur / dolu→append `\n`, **sessiz üzerine-yazma YOK**); `readOnly`'de picker gizli (early return). Setter'lar (`setNotes`/`setDeliveryMethod`/`setPaymentMethod`) zaten autoSave/savePreviewData dep array'inde → Faz 3/4'teki "UI alanı eklendi ama autoSave dep'inde yok → sessiz veri kaybı" drift trap'ine düşmez.
- **Test (+51):** `note-templates-migration` (8 drift-guard: tablo/kind CHECK/index/RLS/trigger/seed/ROLLBACK) + `quote-note-templates` (12: applyTemplateToField + templatesForField pure + QuoteForm wiring source-regex [fetch + 3 picker call site + readOnly early return]) + `note-templates-helper` (16: isValidKind + mapNoteTemplate + validation throws + list/create/deactivate chain) + `note-templates-route` (15: GET requireRole-çağrılmaz + kind passthrough + POST/PATCH/DELETE admin/validation/404/409). **4043→4094** · tsc temiz · npm run lint 0 · build OK (`ƒ /api/note-templates` + `[id]` + settings + `ƒ Proxy`).
- **DURUM: COMMIT+PUSH EDİLDİ (3551302) · migration 079 APPLY EDİLDİ ✅.** Manuel smoke: admin Not Şablonları CRUD; seed görünür; teklif formu 3 alan picker doğru kind (boş→doldur/dolu→append); non-draft picker kilitli; viewer POST→403.
- **V7 master-plan Faz 1-7 + tüm Bulgular turları TAMAMLANDI.** ERTELENEN borçlar: Paraşüt iskonto aktarım, order_line_description, serviceConvert tam temizlik, quotes audit katmanı (modül-geneli), drag-reorder UX.

---

## Faz 6 Bulgular 3. tur — 3 P3 bulgu (2026-05-31) — 4043 test, COMMIT+PUSH EDİLDİ + 077/078 APPLY EDİLDİ ✅

**Kullanıcı review (3 P3 — convergence; hepsi kod karşısında doğrulandı):**
- **#1 (P3) Doc drift:** `9a57d66` push edildi (HEAD=origin/main) ama CLAUDE.md/current_focus/project_quotes hâlâ "COMMIT+PUSH BEKLİYOR" + 078 "APPLY BEKLİYOR" diyordu → "EDİLDİ" hizalandı (078 kullanıcı tarafından uygulandı).
- **#2 (P3) Archive route stale yorum:** `archive/route.ts:34` "recover/generate Faz 6'da gelecek" diyordu — Faz 6'da geldi (`serviceArchiveQuotePdf` tri-state self-heal). Yorum güncellendi (lookup-only sözleşme gerekçesiyle; bu GET route üretmez, accept yolu self-heal eder).
- **#3 (P3, kullanıcı kararı: emoji kalsın) Order arşiv buton emoji:** `📄 Belgeyi Aç →` — doğrulama emoji'nin proje-geneli konvansiyon (`📄 Arşivlenmiş Teklif` kardeş buton, `📄 Yazdır/PDF`, `📦`/`↻`/`✦ AI`) + `lucide-react` 0 kullanım (Tailwind/Framer gibi kurulu-ama-kullanılmaz) gösterdi → emoji tutarlı, kod değişmez.
- **DURUM: COMMIT+PUSH EDİLDİ; 077/078 APPLY EDİLDİ ✅.** Kod değişimi yalnız #2 (yorum); test 4043 sabit. Faz 6 tam kapandı. Faz 7 → note_templates **079** (080 KALICI DÜŞÜRÜLDÜ — bkz. en üstteki Faz 7 bloğu).

---

## Faz 6 Bulgular 2. tur — 5 bulgu (2026-05-31) — 4043 test, COMMIT+PUSH EDİLDİ `9a57d66` + 077/078 APPLY EDİLDİ ✅

**"Önce doğrula sonra düzelt" — 5 bulgu doğrulandı; arşiv invariant'ı sıkılaştırıldı:**
- **#1 (P2) Arşiv create-race obje-doğrulamadan başarı:** `serviceArchiveQuotePdf` create-catch'i UNIQUE 23505'te satır görünce direkt success dönüyordu; kazanan henüz upload etmemiş/fail edip silmek üzere olabilir → accept arşivsiz referansa kayar. Fix: catch'te satır + OBJE present birlikte; değilse throw (accept 502→retry self-heal); yeniden ÜRETMEZ (UNIQUE slot dolu).
- **#2 (P2/P3) Accept fail-open → fail-closed (advisor: tek doğru cevap):** RPC 23514 guard'ı arşiv SATIRINA bakar, OBJEYE erişemez → `serviceArchiveQuotePdf` "dosya gerçekten var mı" invariant'ının TEK noktası. Üç-durumlu `dbArchiveObjectStatus` (present|missing|unknown): present→ok, missing→sil+üret, **unknown→throw (502 retryable)**. Yıkma yalnız missing (sağlam arşiv korunur). `dbArchiveObjectConfirmedMissing` kaldırıldı→tri-state; `dbArchiveObjectExists` (GET lenient) tri-state'ten türer.
- **#3 (P3) Order detail arşiv PDF linki:** `quotePdfArchiveId` taşınıyordu ama UI'da yoktu → "Arşivlenmiş Teklif → 📄 Belgeyi Aç" (GET /api/quotes/{quoteId}/archive signed URL, handleViewArchive reuse).
- **#4 (P3) Doc drift:** dddb1f9 push'tan sonra hâlâ BEKLİYOR + 4034 diyen tüm doc'lar hizalandı.
- **#5 (P3) Lint:** kullanıcı b17181e'de (lint fix öncesi) review yapmış → 3 set-state hata görmüş; HEAD'de npm run lint=0; b17181e "31/0" o commit için dürüsttü. Kod değişmez.
- **Test:** tri-state helper + create-race obje + unknown→throw + #3 UI. **4040→4043** · tsc temiz · npm run lint 0 · build OK.
- **DURUM: COMMIT+PUSH EDİLDİ (`9a57d66`); 077/078 APPLY EDİLDİ ✅.** Faz 6 yakınsadı. Faz 7 → 079-080. (3. tur yukarıda.)

---
## Faz 6 Bulgular 1. tur — 5 bulgu review tur (2026-05-31) — 4034 test, COMMIT+PUSH EDİLDİ (`b17181e`) + migration 077 APPLY EDİLDİ ✅ / 078 APPLY BEKLİYOR

**"Önce doğrula sonra düzelt" — 5 bulgu (4×P2 + 1×P3), hepsi kod karşısında doğrulandı + kapatıldı:**
- **#1 (P2) Phantom recover accept'te:** Faz 4 "kalıcı recover Faz 6'da" vaadi tam kapanmamıştı. `serviceArchiveQuotePdf` existing-row path yalnız DB satırına bakıyordu → phantom (satır var/obje yok) accept'te eksik-dosyalı arşive sipariş bağlıyordu. **Fix:** existing path `dbArchiveObjectExists` doğrular; obje yoksa `dbDeleteQuoteArchive(id,filePath)` (stale sil + best-effort storage remove) → fall-through yeniden üret (sent donmuş → HTML birebir). Hem send hem accept iyileşti.
- **#2 (P2) Sipariş detay finansal özet:** `orders/[id]/page.tsx` "KDV (%20)" hardcoded + iskonto satırı yoktu (Faz 6 discountAmount/vatRate mapper'da hazır). **Fix:** dinamik IIFE — Ara Toplam → İskonto (>0) → KDV Matrahı → KDV (%vatRate) → Genel Toplam.
- **#3 (P2) Accept route RBAC:** proxy yalnız page-gate → viewer API'ye POST atıp sipariş açabilirdi. **Fix:** `requirePermission(req, "manage_quotes")` (admin+sales; diğerleri 403).
- **#4 (P2/P3) RPC qty + 23514 map:** RPC yalnız küsürat kontrol → qty=0/negatif order_lines check(quantity>0)→23514; service jenerik 23514'ü "arşiv bulunamadı" diye map ediyordu. **Fix:** Migration 078 (CREATE OR REPLACE) qty `<=0 OR <>trunc`→22003; service 23514→archive map'i kaldırıldı (kalan check ihlalleri dürüstçe 500).
- **#5 (P3) Doc drift:** "077 APPLY BEKLİYOR" → kullanıcı uyguladı → "077 ✅ + 078 BEKLİYOR".
- **Test (+13):** phantom (service+faz4-archive) + dbDeleteQuoteArchive helper (4) + order summary regex (2) + accept 403 (1) + 078 drift-guard (4) + service map güncel. **4021→4034** · tsc/build temiz · eslint src 31/0.
- **⚠️ Deploy:** 078 apply edilene kadar legacy qty<=0 → eski RPC 23514 → unmapped → 500 (422 yerine; düşük risk). 078'i bu deploy'la apply et.
- **DURUM: COMMIT+PUSH EDİLDİ (`b17181e`); 077 ✅ / 078 BEKLİYOR.** (2. tur yukarıda.) Faz 7 → 079-080.

---
## Faz 6 — Accept → Sipariş (atomik) (2026-05-30) — `accept_quote_and_create_order` RPC (077), 4021 test, COMMIT+PUSH EDİLDİ (`d4988ca`) + migration 077 APPLY EDİLDİ ✅

**V7 master-plan'ın son büyük halkası (V5-A4 + V4-A8): kabul edilen teklifi TEK atomik transaction'da taslak siparişe dönüştür.** Eski iki adım (PATCH `transition:accepted` + POST `/convert`) birleştirildi → ikisi de **410 Gone**. Plan: `~/.claude/plans/clever-dancing-owl.md`.

- **Doğrulanan kritik gerçek:** `sales_orders`/`order_lines`'ta header-totals recompute trigger'ı YOK (sadece `trg_sales_orders_updated_at`) → RPC quote'un **donmuş** subtotal/discount/vat/grand totallerini birebir kopyalar (arşiv PDF ile bayt-bayt tutarlı; recompute yuvarlama drift'i getirirdi). Faz 3 iskonto-convert-bloğu KALKTI.
- **Migration 077 (kullanıcı apply eder):** `sales_orders` += `discount_amount`/`vat_rate`/`source_quote_revision_no`/`quote_pdf_archive_id` (V7-A9 FK→quote_pdf_archives SET NULL). `accept_quote_and_create_order(p_quote_id, p_actor)` (V7-A1 SECURITY INVOKER): FOR UPDATE quote → idempotency (mevcut sipariş→`already:true`) → status guard sent|accepted (else 42501) → null product_id (23502) + küsürat qty (22003) pre-check → arşiv defansif NULL→23514 → order INSERT (donmuş totaller + `LEFT JOIN customers` country/tax + revision_no + v_pdf) → order_lines INSERT…SELECT `JOIN products` (V7-A8 p.name/sku/unit) + `v_quote.vat_rate` (V7-A3) → ROW_COUNT verify mismatch→ROLLBACK (V7-A8) → item_count=v_inserted (V7-A10) → quote sent→accepted → audit_log `quote_accepted_order_created`. REVOKE/GRANT + idempotent + ROLLBACK.
- **Service/route:** `dbAcceptQuoteAndCreateOrder` (RPC helper); `serviceAcceptQuoteToOrder` (status guard → valid_until → **V7-A5 arşiv recover/generate** `serviceArchiveQuotePdf` reuse [eksikse üret; throw→502, RPC çağrılmaz] → RPC → kod map P0002/42501/23502/22003/23514); `POST /api/quotes/[id]/accept` (201 {orderId,orderNumber,already}; status map; revalidateTag quotes/quote-id/orders/products).
- **Deprecation (V4-A8):** PATCH transition:accepted→410 (serviceTransitionQuote çağrılmaz); `/convert` route→410; `QuoteTransition` "accepted" çıkarıldı (`sent:["rejected"]`); `serviceConvertQuoteToOrder` silinmedi (deprecate+korundu, JSDoc).
- **Paraşüt iskonto guard (V7-A4, COUPLED):** `serviceSyncOrderToParasut` `discount_amount>0` → `parasut_claim_sync` ÖNCESİ early return (throw değil; marker/lease/sync_log yazılmaz) + ZORUNLU sync_issue alert (entity=sales_order). Aktarım yöntemi ayrı faz.
- **UI:** tek "Kabul Et ve Siparişe Dönüştür"→`/accept`; already→mevcut order; legacy accepted+siparişsiz→`/accept` (recover); Faz 3 iskonto-not kaldırıldı.
- **TS/mapper (V7-A9):** SalesOrderRow +4 alan; mapOrderDetail map; OrderDetail interface UI alanları.
- **Test (+47 net):** quotes-accept-order-migration (drift-guard ~14) + quotes-accept-service + quotes-accept-route + parasut-discount-guard (3) + order-mapper-faz6 + quotes-accept-ui; flip'ler: quote-convert-route→410, quote-service accepted geçersiz, quotes-id-route transition:accepted→410, quotes-faz2-validation 'rejected'→409, quotes-faz3-discount UI-not kaldırıldı. **3974→4021 yeşil** · tsc temiz · build OK (`ƒ Proxy` + `/api/quotes/[id]/accept`) · eslint src 31/0.
- **DURUM: COMMIT+PUSH EDİLDİ (`d4988ca`) + 077 APPLY EDİLDİ ✅.** (Bulgular turu yukarıda: 078 + 5 fix.) Sıradaki: manuel smoke + Faz 7 (note_templates **079**; 080 düşürüldü).

---
## Faz 4 — PDF Arşiv (2026-05-30) — dondurulmuş HTML snapshot + Bulgular 1.+2.+3.+4. review tur, 3974 test, COMMIT+PUSH EDİLDİ (`6c9c317`) + migration 075/076 APPLY EDİLDİ ✅

**Review 4. tur (3 P3, convergence):** **P3-1 (doc-only)** stale "BEKLİYOR" → da09dce push + 075/076 apply EDİLDİ, hizalandı. **P3-2 (orphan phantom, contained fix)** insert-sonra-upload (concurrency bilinçli, reorder yok) → nadir crash'te DB satırı/dosya tutarsızlığı; phantom bugün kullanıcı-görünür (signed URL → 404 window.open sonrası → kırık sekme). Fix: `dbArchiveObjectExists` → archive GET varlık kontrolü → graceful 404. Kalıcı recover (object-existence) Faz 6. **P3-3 (kullanıcı: caveat kabul)** logo byte-freeze: arşiv URL saklar (byte değil), `upsert:true` overwrite riski → caveat kabul (base64-inline reddedildi). **3969 → 3974.**

**Review 3. tur (3 bulgu):** **P2-A (regresyon)** toplu silme yalnız başarılı id'yi düşürsün (`pickSucceededIds`) + seçim sadece draft (sent draft-only kilidinin yan etkisi). **P2-B (kabul edilen boşluk)** send-archive fail + accept → arşivsiz accepted; Faz 6 recover kapatacak (kod yorumu, bloklamaz — karar A asimetrisi). **P3 (doc-only)** stale "BEKLİYOR" hizalandı. **3960 → 3969.**

**Review 1. tur (5 bulgu doğrulandı+düzeltildi):** P1 upload MIME `text/html` (charset drop; bucket allowlist eşleşmesi). P2 send arşiv fail → görünür `archiveWarning` toast (kullanıcı kararı A, non-blocking+sessiz değil). P2 concurrency: serviceArchiveQuotePdf create fail → re-read existing (UNIQUE 23505 idempotent). P2 doc drift: QUOTES_V2_PLAN V7-A5 Puppeteer→frozen-HTML (Faz 6 reuse). P3 explicit git add. **3880→3951.**


**Gönderilmiş teklifin immutable "kilitli arşivi".** Mimari karar (kullanıcı): **dondurulmuş HTML snapshot** (Puppeteer/binary-PDF DEĞİL — Coolify chromium yükü + Faz 6'nın erken yükü; JSON snapshot DEĞİL — template drift). Plan: `~/.claude/plans/clever-dancing-owl.md`.

- **Akış:** send → `QuoteDocument` server-side `renderToStaticMarkup` → self-contained `.html` → 'quote-pdfs' private bucket (immutable). View = signed URL ile donmuş HTML (template drift'e bağışık). PDF = browser-print.
- **Phase 0 (kritik):** `QuoteDocument` `"use client"` KALDIRILDI (saf fonksiyon). Next App Router server graph `"use client"` → client-reference proxy → renderToStaticMarkup BOŞ çıktı (vitest direkt-import maskeler). Kaldırma deterministik çözer; client preview shared component'i import etmeye devam (tek template). `PAGE_CSS`/`PRINT_CSS` export.
- **Build engeli:** route graph'inde `react-dom/server` statik import Turbopack reddi → async + dinamik `await import("react-dom/server")`.
- **Migration 075:** `quote_pdf_archives` + **UNIQUE(quote_id, revision_no)** (V3-A5 INSERT-only backstop) + RLS. **076:** `quote-pdfs` private bucket (text/html).
- **Kod:** `quote-archive-html.ts` (buildQuoteDataFromDetail [QuoteDetail→QuoteData server tek source; seller snapshot/company fallback; currency/status defansif map] + renderQuoteArchiveHtml [async, font wrapper]); `quote-pdf-archives.ts` (dbGetQuoteArchive/dbCreateQuoteArchive orphan-safe/dbGetArchiveSignedUrl); `serviceArchiveQuotePdf` (idempotent; send hook NON-FATAL → Faz 6 recover telafi); `GET /api/quotes/[id]/archive` (lookup-only, file_path SIZMAZ); UI Mod B buton (status≠draft). V3-B6 (isRealRow 0→"0,00").
- **Logo:** company-assets PUBLIC bucket → public absolute URL → arşivde faithful (caveat: aynı path re-upload eski arşivi etkiler, nadir).
- **Self-containment sınırı:** Google Fonts `<link>` view-time external (tam offline değil — kabul). İleride @font-face inline ile kapatılabilir.
- **Test:** Faz 4 (43) + 1. review + 2. review. **2. review (+9):** quote-archive-html custAddress (3) + quotes-faz4a-helper-mapper Bulgu 1 (4) + canDeleteQuote revised (1) + faz4 toast (1); sent-delete flip. **→ 3960** · tsc/build temiz · eslint src 31/0.
- **Review 2. tur (Bulgular, 2026-05-30) — 5 bulgu, 2 ürün kararı:** **B1 (P2)** müşteri adresi gönderimde zorunlu ("resmi PDF") ama belgede yoktu → **EKLE** (4 nokta: QuoteData.custAddress + BILINGUAL_LABELS.address + QuoteDocument satır + buildQuoteDataFromDetail + **QuoteForm autoSave/savePreviewData** — advisor drift trap yakaladı). **B2 (P2)** sent silinebiliyordu → **SADECE DRAFT** (canDeleteQuote + DELETE route; immutable arşiv ON DELETE CASCADE koruması; regression flip). **B3 (P2/P3)** archive-fail toast yanıltıcı "otomatik denenecek" kaldırıldı (recover yalnız Faz 6). **B4 (P3)** buton arşivsiz statüde → graceful 404 zaten var (`sentAt` map'siz, P3 kabul). **B5 (P3)** doc sayı hizalandı.
- **DURUM: 1.+2.+3.+4. tur push edildi (`6c9c317`) + 075/076 APPLY EDİLDİ ✅.** Sıradaki: smoke (Adres/Address satırı + önizleme drift yok; signed URL inline render; draft hariç Sil yok; bulk delete yalnız draft + başarısız ekranda kalır; phantom→graceful 404) + Faz 6 (077 accept→sipariş; serviceArchiveQuotePdf reusable, object-existence recover — V7-A5).

---
## Revizyon Zinciri (2026-05-30) — Faz 5'ten ertelenen büyük özellik, 3837 test, COMMIT+PUSH 1d96211 + migration 074 APPLY EDİLDİ + review pass

**sent/rejected/expired teklifin düzenlenebilir kopyası (revizyon).** Plan: `~/.claude/plans/clever-dancing-owl.md`.

> **ERTELENEN — Quotes audit katmanı (modül-geneli, gelecek faz):** Doğrulandı (074 review): quotes modülünün HİÇBİR RPC'si (create/update/convert/revise) `audit_log` yazmıyor — 001 domain kuralı state-change için audit ister, quotes baştan beri bu borcu taşıyor. `create_quote_revision` (kaynağı `revised` yapar + yeni teklif yaratır) de yazmıyor; bu revizyona özel regresyon DEĞİL. Sadece revizyona audit eklemek yarım/tutarsız iz üretir (revize loglanır ama oluştur/dönüştür loglanmaz). **Kullanıcı kararı (2026-05-30): kabul + dokümante** → modül-geneli tek faz olarak ele alınmalı (create+update+convert+revise audit_log insert'leri birden, AuditSource enum uyumlu — V4-A1 deseni).

- **Kullanıcı kararları:** revize edilebilir=sent+rejected+expired; kaynak→`revised` (terminal); numara=kök+suffix (-R2/-R3); revizyon valid_until=NULL (CRON re-expire + mid-edit 409 önlemi).
- **Migration 074 (APPLY EDİLDİ):** revision_no/root_quote_id + status CHECK +revised + `create_quote_revision` RPC (V7-A1 INVOKER, chain max+1, header+satır kopya). V2 flat chain (köke işaret). quote_number UNIQUE backstop.
- **Review P1 fix (atomik consume):** ilk versiyon kaynağı kilitsiz okuyup sonda flip ediyordu → aynı kaynağa eşzamanlı çift revize mümkündü. Fix: `update quotes set status='revised' where id=p_source_id and status in (...) returning * into v_src` (eligibility+flip atomik; ikinci eşzamanlı → 42501) + kök FOR UPDATE (revision_no serialize). 074 apply edilmediği için yerinde düzeltildi.
- **Review P3 UI hardening:** anyMutating (loading/converting/revising) → 3 buton grubu da disable.
- **Service/route:** serviceCreateQuoteRevision (42501→invalidStatus/409, P0002→notFound/404); POST /api/quotes/[id]/revise → 201 {newQuoteId}; dbCreateQuoteRevision + dbListQuoteChain.
- **GET enrichment:** revisedBy (revised→zincir en yenisi) + revisionOf (revision_no>1→kök).
- **UI:** getQuoteReviseEligible → Revize Et butonu → router.push(yeni draft); revisedBy/revisionOf rozetleri. STATUS_META+tab revised; QUOTE_TRANSITIONS revised:[] terminal.
- **TS:** QuoteStatus +revised (tsc touch-point: QuoteSummary.status union→QuoteStatus tipine); QuoteRow/QuoteDetail/mapper revision alanları.
- **Bilinen sınırlama:** tek revizyon silme kökü dead-end bırakır (nadir); revisedBy=en-yeni (bilinçli).
- **Test:** quotes-revision (13, +071 omission regression) + quotes-revise-route (3). **3821→3837 yeşil** · tsc/build/lint temiz.
- **Numbering:** revizyon=074 → Faz 4=075-076, Faz 6=077, Faz 7=078-079.
- **DURUM: COMMIT+PUSH EDİLDİ** (`cb061c8` ilk + `1d96211` review fix [P1/P3]) **+ 074 (DÜZELTİLMİŞ) APPLY EDİLDİ + review pass** (4 bulgu doğrulandı; audit borcu kabul+dokümante; RBAC merge notu; doc hijyeni). Sıradaki: manuel smoke + Faz 4 (075-076 PDF arşiv).

---
## Faz 5 infra dilim (2026-05-30) — numara katmanı (yıllık reset + configurable prefix), 3821 test, COMMIT+PUSH 942ee0d + migration 073 APPLY EDİLDİ

**Faz 5 master-plan'da 5 parça (status CHECK + revizyon + sig backfill + prefix + yearly_counters) tek satır, detay yok.** Kullanıcı kararı: **infra dilim** = sadece numara katmanı. Plan: `~/.claude/plans/clever-dancing-owl.md`.

- **ERTELENEN:** revizyon zinciri (root_quote_id/revision_no/`create_quote_revision` RPC+UI+status — büyük + underspec, kendi oturumu); sig_* rename (19 dosya/73 occ kozmetik); status CHECK (034:91 zaten 5 değer, yeni status yalnız revizyonda → no-op).
- **Migration 073 (APPLY EDİLDİ):** company_settings += quote_number_prefix('TKL')/separator('-'); quote_yearly_counters(year pk,last_seq)+RLS; backfill (034 defansif precedent `^TKL-\d{4}-\d+$` + gömülü-yıl split_part(,2) group + on conflict greatest); next_quote_number() rewrite (atomik on conflict last_seq+1 + prefix company_settings'ten). Signature `() returns text` KORUNDU (create RPC+seed değişmez). V7-A1 DEFINER YOK. Idempotent.
- **Güvenlik:** quote_number UNIQUE (012:9) → backfill miscompute sessiz dup DEĞİL, gürültülü UNIQUE violation (recoverable). Gömülü-yıl group (created_at değil) — next_quote_number now() yılını gömer.
- **Frontend YOK:** server-üretimli read-only; parser yok; dbFindQuoteByNumber .eq(). CompanySettingsRow TS += 2 alan. Sınırlama: tek separator çift görev.
- **Test:** quotes-faz5-numbering (6 source-regex) — **DRİFT-GUARD değil correctness** (DB-side; gerçek doğrulama manuel smoke). **3815→3821 yeşil** · tsc/build/lint temiz.
- **DURUM: COMMIT+PUSH EDİLDİ** (`942ee0d`, 073 dahil 8 dosya) **+ 073 APPLY EDİLDİ + smoke geçti.** Sonraki: revizyon zinciri (074, yukarı bkz).

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
- **DURUM: COMMIT+PUSH EDİLDİ** (`6366cbd`, 072 dahil 15 dosya) **+ migration 070-072 APPLY EDİLDİ.** Sonraki: Faz 5 (073, yukarı bkz).

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
- 076: note_templates + RLS (Faz 7)  ⟵ SUPERSEDED: final = **079_note_templates** (UYGULANDI 2026-05-31; üstteki Faz 7 bloğu)
- 077: quote_line_items_sort_order (Faz 7, koşullu)  ⟵ SUPERSEDED: KALICI DÜŞÜRÜLDÜ (position zaten var, yeni kolon yok)

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

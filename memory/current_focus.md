---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---
**Aktif:** Sıradaki — Faz 12 (gerçek Paraşüt API) ve SMTP production deploy (kod hazır, env/migration/cron eksik)
**Son:** G11 audit 8. tur KAPALI (2026-05-09; 2432 test) — in-scope clamp, urgency pctFallback, tab counts, silinmiş ürün filter
**Önceki:** G11 audit 7. tur KAPALI (2026-05-09; 2411 test) — auto-reload imzası displayProducts, items'a out-of-scope, statusIn helper
**Önceki²:** G11 audit 6. tur KAPALI (2026-05-09; 2396 test) — decided drift kapsamı, UI clamp, sort/drawer pickStock, AI fallback, POST enrich
**Önceki²:** G11 audit 5. tur KAPALI (2026-05-09; 2369 test) — UI promisable, refetch ?all=1, signature quoted, ?all=1 filter
**Önceki²:** G11 audit 4. tur KAPALI (2026-05-09; 2344 test) — promisable filter+hesaplar, UI full scan, auto-reload imzası
**Önceki²:** G11 audit 3. tur KAPALI (2026-05-09; 2325 test) — promisable, full-scan, AI hadError, stale TTL scope, levelChanged in-place
**Önceki:** G11 audit 2. tur KAPALI (2026-05-09; 2312 test) — CSRF guard, defansif expire, boş list, lead-time aware, moq=0
**Önceki²:** G11 audit 1. tur KAPALI (2026-05-09; 2286 test) — Vercel CRON GET, expire scope, SoT coverage-based, false-success toast
**Önceki³:** G11 — AI öneri tutarlılığı KAPALI (2026-05-09; 2280 test) — hibrit diff-merge + 6h Vercel CRON + manuel yenile + decided drift rozeti
**Önceki⁴:** SMTP/Resend e-posta altyapısı — kod commit edildi (2026-05-06; 2242 test), production deploy EKSİK
**Önceki:** Settings audit 2. tur KAPALI (2026-05-05; 2215 test) — demo cookie geçiş + SVG kısıt + server validation
**Önceki²:** Settings audit 1. tur KAPALI (2026-05-05; 2202 test) — avatar orphan + concurrent lock + type dedup

---

## G11 Audit 8. Tur (2026-05-09) — KAPALI

**Hedef:** 7. turdan sonra incelemeci 4 yeni bulgu çıkardı: backend in-scope clamp eksik (over-quoted suggestQty UI ile farklı), `computeUrgencyLevel` cov=null durumunda severity ile çelişiyor, tab counts displayProducts'ı yansıtmıyor, silinmiş ürün placeholder sızıntısı.

**1 commit, ~9 dosya:**

- **Fix 1 (HIGH) — In-scope items max(0, promisable)**: route items.map içinde `stock = max(0, promisable)` ve `needed = max(0, target - stock)`. Frontend `pickStock` paterniyle aynı clamp. UI ↔ backend `suggestQty` eşit (örn. promisable=-5, target=40, moq=10 → 40).
- **Fix 2 (HIGH) — `computeUrgencyLevel` pctFallback**: 3. opsiyonel param. cov=null + pctFallback≥80 → critical, ≥50 → high. Route caller'ları `computeUrgencyPct(stock, min)` geçer; diff-merge/drift/buildAiMetadata `item.urgencyLevel`'i tek source kullanır. `readUrgencyLevelFromMeta` `meta.urgencyPct` fallback. `ai-service.ts` yorum güncel.
- **Fix 3 (MEDIUM) — Tab counts displayProducts**: `tabs[i].count`, `manufacturedItems`/`commercialItems`, `pendingCount` `reorderSuggestions` yerine `displayProducts` üzerinden. `acceptedCount`/`rejectedCount` `displayIds` filter ile recMap'teki dış ürünleri saymaz. `pendingCount` artık asla negatif değil (out-of-scope accepted senaryosunda 0+).
- **Fix 4 (LOW) — Silinmiş ürün filter**: `outOfScopeDecidedItems` ve `decidedRefs` `productMap.has(productId)` filter ile. Orphan cleanup henüz tetiklenmediyse UI'da "—" placeholder görünmez.

**Test (21 yeni):**
- `purchase-suggested-tab-counts.test.ts` (8): tab/pendingCount senaryoları (out-of-scope accepted/rejected, silinmiş ürün, edited rec)
- `purchase-copilot-promisable-deep.test.ts` (+3): in-scope over-quoted clamp, coverageDays=0, pozitif promisable regresyon
- `compute-urgency-level.test.ts` (+9): pctFallback boundary'ler, coverage öncelik, ai-service senaryosu
- `purchase-copilot-out-of-scope-decided.test.ts` (1 testi update + 1 yeni): silinmiş ürün response.recommendations VE response.items'a girmez

**Domain kuralı:**
- Stock clamp (`Math.max(0, ...)`) UI ve backend tüm hesap noktalarında zorunlu invariant — over-quoted durumunda needed/coverageDays/urgency tutarlı kalır.
- `urgencyLevel` ile `severity` farklı kavramlar olsa bile UI'a tutarlı görünmek için `coverageDays=null` durumunda `urgencyPct` fallback kullanılır.
- React effect dependency'lerinde tek bir liste/set kavramı (displayProducts) hem render hem sayım hem imza için tek source-of-truth.
- Mutation endpoint'leri response'unda silinmiş entity placeholder'larıyla data dönmemeli; lazy cleanup'a güvenmek UI tutarsızlığı yaratır.

**Test:** 155 dosya · 2432 test yeşil · TS clean · 0 lint hatası

---

## G11 Audit 7. Tur (2026-05-09) — KAPALI

**Hedef:** 6. turdan sonra incelemeci 4 yeni bulgu çıkardı: out-of-scope decided ürünler için auto-reload sinyali eksik (imza), `data.items` boşluğu (UI aiMap erişemez), `dbListRecommendations` performans, runtime test boşluğu.

**1 commit, ~7 dosya:**

- **Fix 1 (HIGH) — Auto-reload imzası displayProducts**: `signatureSource` useMemo = `[...reorderSuggestions, ...products.filter(out-of-scope decided)]`. Hem imza hem `displayProducts` aynı kaynaktan. Out-of-scope ürün stok değişimi → imza değişir → AI auto-reload.
- **Fix 2 (HIGH) — Out-of-scope responseItems**: backend `outOfScopeDecidedItems` decided rec metadata'sından `items` benzeri entry üretir (frozen `suggestQty/targetStock/aiWhyNow/aiQuantityRationale/aiUrgencyLevel`; `available` = güncel promisable). `responseItems = items + outOfScopeDecidedItems`. UI'da `aiMap.get(productId)` artık out-of-scope için de doludur → AI rozeti + drawer çalışır.
- **Fix 3 (MEDIUM) — statusIn**: `ListRecommendationsFilter.statusIn?: RecommendationStatus[]` + helper `.in("status", [...])`. Route `statusIn: ["accepted","edited","rejected"]` geçer. SQL-side filter, ai_recommendations tablosu büyüse de JS overhead yok. `statusIn` `status`'tan öncelikli.
- **Fix 4 (LOW) — Runtime test**: `purchase-suggested-auto-reload.test.ts`'e `signatureSource` simülasyon mantığı (dedup, status filter, stok değişimi) test edildi.

**Test (15 yeni):**
- `purchase-suggested-auto-reload.test.ts` (+5): signatureSource displayProducts simulation
- `purchase-copilot-out-of-scope-decided.test.ts` (+6): items'a out-of-scope (aiWhyNow, frozen suggestQty, current available, dedup, in-scope+out-scope mix); statusIn arg geçişi
- `recommendations.test.ts` (+4): statusIn filter `.in()` çağrısı, boş array, `status` ile çakışma, eski `status` davranış regresyonu

**Domain kuralı:**
- Stable string imzası `displayProducts`'tan türeyebilir (UI scope = state imzası); ayrı list ve imza tutmak DRY ihlali ve sinyal kaybı.
- Backend mutation endpoint'leri response'unda UI'nın gösterebilmesi gereken tüm alanları kapsamalı; aksi halde "data var ama UI gösteremez" boşluğu olur.
- `dbList*` helper'larında çoklu status (`statusIn`) varsa `.in()` kullan; SELECT-then-JS-filter overhead'i kabul edilemez büyük tablolarda.

**Test:** 154 dosya · 2411 test yeşil · TS clean · 0 lint hatası

---

## G11 Audit 6. Tur (2026-05-09) — KAPALI

**Hedef:** 5. turdan sonra incelemeci 5 yeni bulgu çıkardı. En kritik: kullanıcı öneriyi kabul etti, sonra stok düzeldi → rec response'a girmiyor, drift rozeti hiç görünmüyor (G11'in decided drift hedefinde en büyük boşluk).

**1 commit, ~10 dosya:**

- **Fix 1 (HIGH) — Decided rec drift kapsamı**: `dbListRecommendations({entity_type, recommendation_type})` ile tüm aktif decided rec'ler yüklenir; 7-gün window dışı/items içi olanlar atlanır. Out-of-scope için drift hesabı `productMap` üzerinden güncel state ile yapılır (item bazlı değil). Response'taki `decidedRefs` artık `decidedRecMap.entries()` üzerinden — items'a bağımlı değil. UI `displayProducts = reorderSuggestions ∪ outOfScopeDecided` ile filter sayfasında out-of-scope ürünleri de gösterir.
- **Fix 2 (MEDIUM) — UI clamp**: `computeRowStock`, `computeSuggestion` `Math.max(0, promisable)` (yeni `pickStock` helper). `urgency = Math.min(100, ...)`. Backend `route.ts:147` ile aynı semantik. Negatif gün/%>100 urgency UI'da imkansız.
- **Fix 3 (MEDIUM) — Sort/Drawer pickStock**: 4 lokasyon (`sorted` fallback, `mostUrgent`, `aiDrawerCoverageDays`, drawer Stok grid + progress bar) `pickStock(p)` üzerinden. Drawer "Açık" `Math.max(0, min - drawerStock)`. Source-regression testi: `(a|b|mostUrgent|aiDrawerProduct).available_now` doğrudan kullanım yok.
- **Fix 4 (MEDIUM) — AI fail fallback**: `buildAiMetadata(item, fallbackMeta?)` — AI null ise `fallbackMeta.aiWhyNow/aiQuantityRationale/aiUrgencyLevel` kullanılır. `levelChangedItems.map`'te `suggestedRecMap.get(productId)?.metadata` fallback geçilir. Geçici hata eski iyi AI metnini silmez.
- **Fix 5 (LOW) — POST enrich**: `dbCreateProduct` sonrası `enrichProducts([product], quotedMap, incomingMap)[0]` döner — quoted/promisable/incoming/forecasted/stockoutDate/orderDeadline alanları yeni ürün için anında doludur (yeni ürün için 0/null değerler).

**Test (16 yeni + 12 ek):**
- `purchase-copilot-out-of-scope-decided.test.ts` (6): accepted/rejected out-of-scope, currentDrift hesabı, ürün silinmiş, in-scope regresyon, 7-gün window
- `purchase-suggested-pickstock-regression.test.ts` (5): source-level pattern check
- `purchase-suggested-promisable-ui.test.ts` (+9): clamp + pickStock
- `purchase-copilot-diff-merge.test.ts` (+3): AI throw/empty/success metadata davranışı
- `api-products-quoted.test.ts` (+4): POST response enrichment

**Domain kuralı:**
- Decided rec'ler items'dan bağımsız: stok düzelse bile kullanıcının önceki kararı UI'da takip edilebilir (drift rozetiyle), kullanıcı stok dengesini manuel doğrulayana kadar.
- `Math.max(0, ...)` clamp UI hesaplarında bir invariant: stok asla negatif görünmez, urgency asla %100 üstüne çıkmaz; backend ile aynı semantik.
- `buildAiMetadata` fallback: state-based update'lerde AI metni veri kaynağı olduğundan, AI fail = eski içerik kalır.
- Mutation endpoint'leri (POST/PATCH) response'ları full enrichment ile dönmeli — ilk refetch'e kadar UI tutarsızlığı önlenir.

**Test:** 154 dosya · 2396 test yeşil · TS clean · 0 lint hatası

---

## G11 Audit 5. Tur (2026-05-09) — KAPALI

**Hedef:** 4. turdan sonra incelemeci frontend tarafında 5 yeni bulgu çıkardı: UI promisable kullanmıyor, hesaplar available_now üzerinden, auto-reload imzası quoted'a duyarsız, refetch'lerin bir kısmı paginated, `?all=1` filter ignore.

**1 commit, ~9 dosya:**

- **Fix 1 (HIGH) — DataContext promisable**: `reorderSuggestions` `available: p.promisable ?? p.available_now` — backend filter ile semantik eşleşme. Quote'lu siparişlerle promisable<min olan ürünler artık UI listesinde de görünür.
- **Fix 2 (HIGH) — page.tsx hesaplar**: `computeSuggestion` (target-promisable), `computeRowStock` (yeni helper: stock/urgency/daysLeft promisable bazlı). Mobil kart + masaüstü tablo "Stok" sütunu artık satılabilir stok gösterir; tooltip "Mevcut − teklif verilen" açıklaması ekledi. Backend route ile UI sayıları tutarlı.
- **Fix 3 (MEDIUM) — reorderSignature quoted**: imzaya `:${quoted}` eklendi. Quote eklendiğinde available_now sabit kalsa bile imza değişir → AI/recMap auto-reload tetiklenir.
- **Fix 4 (MEDIUM) — Refetch ?all=1**: 3 mutasyon path'i (uretimEkle, uretimSil, updateOrderStatus) çıplak `/api/products` yerine `/api/products?all=1` kullanır. Global state 100+ ürünlü setlerde tutarlı kalır.
- **Fix 5 (LOW) — `?all=1` filter-aware**: `getCachedAllProducts(category, productType, isActive)` cache key filter dahil; `dbListProducts({...filters, pageSize: 10000})` ile pagination'sız çağrı. Eski `getCachedAllActiveProducts` (filter'sız) silindi.

**Test (25 yeni):**
- `purchase-suggested-promisable-ui.test.ts` (12): computeSuggestion + computeRowStock promisable senaryoları
- `data-context-refetch-all.test.ts` (3): kaynak dosyada `?all=1` tutarlılığı
- `data-context-reorder-promisable.test.ts` (2): `available: p.promisable ?? p.available_now` regression
- `purchase-suggested-auto-reload.test.ts` (+4): quoted değişimi imza testleri
- `api-products-quoted.test.ts` (+4): filter-aware ?all=1 testleri

**Domain kuralı:**
- "Promisable" hesabı UI ile backend için tek source-of-truth — DataContext, page.tsx hesapları, route'lar hep `available_now - quoted` kullanır.
- React effect dependency'leri için stable string imzası; promisable'ı dolaylı etkileyen tüm field'ları (available_now + quoted + reserved + min + dailyUsage) dahil etmeli — aksi halde signal kaçar.
- "?all=1" gibi pagination opt-out flag'leri her zaman diğer filtreleri korur; erken return cache key/filter parse'i atlamamalı.

**Test:** 152 dosya · 2369 test yeşil · TS clean · 0 lint hatası

---

## G11 Audit 4. Tur (2026-05-09) — KAPALI

**Hedef:** 3. turdan sonra incelemeci 4 yeni bulgu çıkardı: promisable hesabı yarım kalmış (sadece filter'ın 2. dalında kullanılıyor), UI tüm aktif ürünleri çekmiyor, auto-reload sınırlı.

**1 commit, ~9 dosya:**

- **Fix 1 (HIGH) — Promisable filter ilk dalı**: route'ta `if (available_now <= min) return true` quote'tan bağımsız. available=50/quoted=40/min=20 → eski: pas (50>20), yeni: promisable=10≤20 → öneri. Filter `purchase-service.ts:81` ile hizalandı.
- **Fix 2 (HIGH) — Tüm hesaplar promisable**: items.map içindeki `suggestQty` hesabı `target - p.available_now`, `coverageDays` `p.available_now`, response.available `p.available_now`, urgencyPct/severity `item.available` üzerinden — hepsi promisable'a geçirildi. `item.available = promisable` set edildi → urgencyPct/severity zincirini de otomatik düzeltti.
- **Fix 3 (MEDIUM) — UI full active list**: `/api/products?all=1` opt-in flag — `dbListAllActiveProducts` çağırır, ayrı cache key. DataContext `?all=1` kullanır. 100+ ürünlü production setlerinde UI'da gizli kalan ürünler artık görünür.
- **Fix 4 (MEDIUM/LOW) — Auto-reload imzası**: `reorderSignature = sort(map(p => id:available:min:daily:reserved)).join("|")` useMemo. useEffect dep'i bu imza → set/state değişiminde otomatik AI/recMap fetch.

**Test (19 yeni):**
- `purchase-copilot-promisable-deep.test.ts` (8): filter promisable bazlı 3 senaryo + tüm hesaplar promisable 5 senaryo
- `purchase-suggested-auto-reload.test.ts` (8): signature stable/değişen/boundary
- `api-products-quoted.test.ts` (+3): `?all=1` flag, default regresyon, enrichment

**Domain kuralı:**
- "Promisable" hesabı domain genelinde tek kavram: alert servisi, purchase servisi, AI route, UI hep `available_now - quoted` kullanır. Filter eşiği de promisable bazlı (available_now değil).
- Background CRON ile global UI state aynı set'i kapsamalı: cron tüm aktif ürünleri tarıyorsa UI'nın da pagination'sız fetch yapması gerekir, aksi halde rec ile UI sapması olur.
- React effect dependency'leri primitif `length`'le sınırlı tutulmamalı: aynı kardinalitedeki içerik değişimleri kaçar. Stable string imzası deterministik signal sağlar.

**Test:** 149 dosya · 2344 test yeşil · TS clean · 0 lint hatası

---

## G11 Audit 3. Tur (2026-05-09) — KAPALI

**Hedef:** 2. tur sonrası dış inceleme 5 yeni bulgu çıkardı. Promisable, full-scan, AI hadError sinyali, stale TTL global etki, levelChanged silent fail.

**1 commit, ~13 dosya:**

- **Fix 1 (HIGH) — Promisable**: Route ham `dbListProducts` çağırıp `p.promisable ?? p.available_now` fallback kullanıyordu — helper promisable üretmiyordu. UI quote'lu siparişlere göre proaktif öneri listeliyor ama AI route hesaplamadan eski sayılarla çalışıyordu. Çözüm: `dbListAllActiveProducts()` + `dbGetQuotedQuantities()` paralel; `promisable = available_now - quoted` (UI ile aynı). `/api/products` route'undaki pattern paraleli.
- **Fix 2 (HIGH) — Full scan**: `dbListProducts({pageSize:500})` ilk 500 ürünle sınırlı. Cleanup'ta `activeProductIds` da bu listeden geliyordu → 501. ürün için yanlış expire / hiç öneri. `dbListAllActiveProducts()` pagination'sız tüm aktif ürünleri çeker.
- **Fix 3 (MEDIUM) — AI hadError**: `aiEnrichPurchaseSuggestions` graceful catch içinde `enrichments:[]` dönüyordu, route'un try/catch'i tetiklenmiyordu → production'da AI patlasa bile `ai_call_failed=false` kalıyordu. Servis result'ına `hadError: boolean`; route okur. UI banner doğru tetiklenir.
- **Fix 4 (MEDIUM) — Stale TTL scope**: `dbExpireStaleRecommendations(48)` `recommendation_type` filtrelemiyor → 6 saatte bir purchase cron'u global TTL worker'a dönüşüyordu (diğer rec tiplerinin suggested'larını da expire ediyordu). Helper'a opsiyonel 2. param; copilot route `"purchase_suggestion"` geçer.
- **Fix 5 (MEDIUM) — levelChanged in-place**: Expire+upsert dansı sessiz fail'de `dbUpsertRecommendation` mevcut suggested rec'i aynen döndürüyor → yeni AI içeriği yazılmıyor, her cron'da boşa AI çağrısı. Yeni helper `dbUpdateSuggestedRecommendation(id, {body, confidence, severity, model_version, metadata})` — tek atomik UPDATE rec ID stable. `dbExpireEntityRecommendations` artık throw eder + levelChanged flow'undan kaldırıldı (silme akışlarında kalır).

**Test (9 yeni + 6 ek):**
- `purchase-copilot-promisable.test.ts` (5): no-quote pass, quote → öneri girişi, çift-call regresyon, helper çağrısı, available<=min bypass
- `purchase-copilot-ai-error-flag.test.ts` (4): hadError true/false → ai_call_failed mapping, throw fallback, partial success defansif
- `recommendations.test.ts`: dbExpireStaleRecommendations recType filter (2), dbUpdateSuggestedRecommendation (2)
- `purchase-copilot-diff-merge.test.ts`: levelChanged testleri update-in-place flow'una göre yeniden yazıldı

**Domain kuralı:**
- Promisable hem `/api/products` UI'sı hem `/api/ai/purchase-copilot` AI'sı için ortak: `available_now - quoted`. İki taraf aynı semantiği paylaşmalı.
- Background CRON helper'ları default olarak ilgili scope'a (recommendation_type) bağlanmalı; aksi halde "global TTL worker"a dönüşürler.
- Graceful degradation yapan servisler caller için `hadError`/`ok` boolean sinyali döndürmeli — try/catch sadece exceptional path'i yakalar, expected hata path'leri için flag gerekli.
- Aynı entity için içeriği yenilenecek bir aktif rec varsa "expire+insert" yerine in-place UPDATE daha güvenli: silent dedupe yan etkisi yok, rec ID stable.

**Test:** 147 dosya · 2325 test yeşil · TS clean · 0 lint hatası

---

## G11 Audit 2. Tur (2026-05-09) — KAPALI

**Hedef:** 1. tur sonrası dış inceleme 5 yeni bulgu çıkardı. CSRF, decided rec defansif koruma, orphan suggested cleanup, lead-time risk, moq=0 NaN/Inf riski.

**1 commit, ~10 dosya:**

- **Fix 1 (HIGH) — CSRF guard**: `route.ts:29-46` — `checkAuth(request, method)` iki argümanlı; GET sadece CRON_SECRET, POST hem CRON_SECRET hem session. `<img src="...purchase-copilot">` ile session-cookie'li yan etki tetikleme imkansızlaştırıldı. Export'lar `(req?: NextRequest) => handler(req, "GET"|"POST")` arrow wrapper.
- **Fix 2 (MEDIUM defansif) — Helper status filter**: `dbExpireEntityRecommendations` artık `recommendationType` belirtildiyse SADECE `'suggested'` filtreliyor. Aynı entity için (invariant kırılırsa) decided rec varsa expire edilmez. Silme akışı (param yok) tüm aktif statüleri kapsamaya devam eder.
- **Fix 3 (MEDIUM) — Boş aktif liste**: `dbExpireSuggestedRecommendations` boş entity ID listesinde no-op olduğundan, tüm ürünler healthy olunca eski suggested DB'de takılı kalıyordu. Yeni `dbExpireAllSuggestedRecommendations(entityType, recType)` helper + route'da `activeProductIds.length===0` koşullu fallback.
- **Fix 4 (MEDIUM) — Lead-time aware urgency**: `computeUrgencyLevel(cov, lead?)` — `cov < lead` durumunda critical (Sprint A `computeStockRiskLevel` ile aynı semantik). cov=20/lead=45 → critical, cov=20/lead=14 → moderate. `readUrgencyLevelFromMeta` eski rec'lerde `leadTimeDays` opsiyonel okur. Yeni rec metadata'sına `leadTimeDays` field'ı yazılır.
- **Fix 5 (MEDIUM) — moq guard**: `moq = Math.max(1, p.reorder_qty ?? p.min_stock_level)` (frontend `page.tsx:226` paterni). `reorder_qty=NULL && min=0` senaryosunda `Math.ceil(needed/0)=Infinity` riskini kapatır.

**Test (15 yeni + 10 ek):**
- `purchase-copilot-empty-products.test.ts` (4): healthy → dbExpireAll çağrılır, needsPurchase var → dbExpireSuggested
- `purchase-copilot-moq-guard.test.ts` (6): NaN/Infinity guard, fallback chain, JSON serializable
- `purchase-copilot-decided-defense.test.ts` (3): helper recType varsa `.eq("status","suggested")`, yoksa `.in("status",[...])`
- `compute-urgency-level.test.ts` (+10): lead-time risk kombinasyonları (cov<lead → critical, boundary, lead=null/0)
- `purchase-copilot-auth.test.ts` (+5): GET+session 401, GET+Bearer 200, POST+session 200, POST+Bearer 200
- `purchase-copilot-diff-merge.test.ts` ve diğer 7 mevcut test: `dbExpireAllSuggestedRecommendations` mock eklendi

**Domain kuralı:**
- HTTP method'a göre auth: state değiştiren handler GET'te session kabul edemez (CSRF). Cron-tetiklenen mutation endpoint'leri GET kullanıyorsa Bearer-only.
- `recommendation_type` filtresine sahip helper'larda status range'i de daraltmak (`'suggested'` only) "decided rec frozen" invariant'ını defansif olarak korur.
- Boş aktif liste senaryosu (zero-in-clause) her zaman ayrı bir code path: ya tüm aktiflerden ya hiç birinden işlem yap, asla "boş clause = noop" varsayma.
- `computeUrgencyLevel`'a lead-time arg geçilmesi tek source-of-truth: AI rozeti, diff-merge sinyali ve domain stok risk bildirimi aynı semantiği taşır.

**Test:** 145 dosya · 2312 test yeşil · TS clean · 0 lint hatası

---

## G11 Audit 1. Tur (2026-05-09) — KAPALI

**Hedef:** İlk G11 commit'inden sonra dış audit 5 bulgu tespit etti. Hepsi sırayla doğrulandı + düzeltildi.

**1 commit, ~10 dosya:**

- **Fix 1 (HIGH) — Vercel CRON GET vs POST**: `route.ts` sadece POST export ediyordu, Vercel Cron Jobs **GET** request gönderir → production cron 405 Method Not Allowed → otomatik refresh çalışmaz. Çözüm: `async function handler(...)` rename + `export const GET = handler; export const POST = handler;`. Auth testine 3 yeni test eklendi (GET+Bearer/no-auth, GET===POST identity).
- **Fix 2 (HIGH) — Expire scope çok geniş**: `dbExpireEntityRecommendations(entityId, entityType)` `recommendation_type` filtrelemiyordu → level değişiminde aynı ürünün diğer rec türleri (varsa: stock_risk, order_review_risk vb.) yanlışlıkla expire olabilirdi. Helper'a opsiyonel 3. parametre `recommendationType?: RecommendationType` eklendi. Copilot route artık `"purchase_suggestion"` geçiyor; product delete/deactivate akışları (`/api/products/[id]/route.ts:56,74`) parametresiz çağrıyor → tüm tipleri expire (semantik beklenti).
- **Fix 3 (MEDIUM) — Plan deviation dokümanı**: Plan `aiUrgencyLevel` (AI subjective) okumayı söylüyordu; kod `urgencyLevel` (deterministik) okuyor. Kasıtlı sapma — LLM non-determinism aynı state'te bile farklı level üretebilir; deterministik karşılaştırma daha güvenilir "state değişti mi" sinyali. `readUrgencyLevelFromMeta` üstüne açıklayıcı yorum eklendi.
- **Fix 4 (MEDIUM) — Source-of-truth ayrışması**: AI prompt `urgencyLevel` kuralları **coverage-based** (< 7 critical, 7-14 high, > 14 moderate); `computeUrgencyLevel(urgencyPct)` ise **pct-based** (≥80/≥50). UI rozeti `aiUrgencyLevel`'ı render ediyordu → state değişimi rozet ile diff-merge sinyali arasında drift. Çözüm:
  - `computeUrgencyLevel(coverageDays | null)` artık coverage-based (null → moderate)
  - `PurchaseSuggestionItem.urgencyLevel` zorunlu input field
  - AI prompt'tan `urgencyLevel` output schema'sı çıkarıldı; `itemUrgencyMap` ile input echo'lanıyor (`ai-service.ts:944-955`)
  - Prompt: "Bu seviyeyi yeniden hesaplama; metnin tonunu bu seviyeye göre ayarla"
  - `readUrgencyLevelFromMeta` fallback: `coverageDays` (eski rec'lerde her zaman var, urgencyPct yerine)
  - Eval fixtures (`purchase-fixtures.ts`) urgencyLevel input field'ı ile güncellendi
- **Fix 5 (LOW/MED) — handleRefresh false-success**: AI POST 500 dönse bile yeşil "Öneriler güncellendi" toast çıkıyordu (yan yan sarı aiError banner ile çelişki). `loadAiData` artık `Promise<boolean>` dönüyor (success=true; ok=false ise setAiError(true) + return false). `handleRefresh` aiOk false ise "AI önerileri yenilenemedi — sayfa verisi güncel" hata toast'ı.

**Test güncellemeleri:**
- `compute-urgency-level.test.ts` — coverage-based testlere yeniden yazıldı (9 test)
- `purchase-copilot-diff-merge.test.ts` — fixture metadata `urgencyLevel/coverageDays` field'larıyla güncellendi (mevcut testler korundu, expire helper signature 3-arg oldu)
- `purchase-copilot-auth.test.ts` — 3 yeni GET test
- `ai-purchase-copilot.test.ts` — `makePurchaseItem` urgencyLevel field'ı, "input urgencyLevel echo" testleri (eski "missing urgencyLevel defaults to moderate" yerine)
- `fixtures/purchase-fixtures.ts` — 4 archetype urgencyLevel field'ı

**Domain kuralı:**
- `computeUrgencyLevel` artık coverage-based: < 7 critical, 7-14 high, > 14 / null moderate
- `urgencyLevel` deterministik input olarak hesaplanır → AI'ye geçirilir → AI echo eder, hesaplamaz
- Vercel Cron path'leri **hem GET hem POST** export etmeli (Vercel GET gönderir; manuel curl POST kullanır)
- `dbExpireEntityRecommendations` 3. parametre opsiyonel: belirtilirse o tipi, aksi halde tüm tipleri expire eder

**Test:** 142 dosya · 2286 test yeşil · TS clean · 0 lint hatası

---

## G11 — AI Öneri Tutarlılığı (2026-05-09) — KAPALI

**Hedef:** Aktif `suggested` rec'lerin metadata'sı state ile uyumsuz kalıyordu (route'un "aktif rec varsa AI'yi atla" optimizasyonu yüzünden). Stok geldiyse, daily_usage düştüyse, lead_time uzadıysa eski sayılar UI'da kalıyordu. Plan: hibrit diff-merge + 6 saatlik Vercel CRON + sayfa içi görünür yenile butonu.

**1 commit, ~10 dosya:**

**Backend:**
- `src/lib/stock-utils.ts` — `computeUrgencyLevel(urgencyPct)` yeni export. Tek source-of-truth: rec metadata'daki `urgencyLevel` ile route severity hesabı arasında tutarlı kalsın diye.
- `src/lib/supabase/recommendations.ts` — `dbUpdateRecommendationMetadata(id, patch)` yeni helper. GET → JS-merge → UPDATE (JSONB tüm key'leri overwrite etmesin diye). Best-effort: rec yoksa veya update fail olursa sessizce çıkar.
- `src/app/api/ai/purchase-copilot/route.ts` — full refactor:
  - **Hybrid auth (line 28-41):** `checkAuth(request)` — CRON_SECRET Bearer veya authenticated session. Middleware ALWAYS_PUBLIC'e taşındı, route kendi auth'unu yapar.
  - **Suggested rec sınıflandırma (line 119-144):** `suggestedRecMap` ve `decidedRecMap` ayrı. Her item için: suggested rec varsa level karşılaştır → aynı ise `levelSameItems`, farklı ise `levelChangedItems`; decided rec varsa skip; yoksa `noRecItems`.
  - **Diff-merge (line 146-164):** levelChanged → `dbExpireEntityRecommendations` paralel; levelSame → `dbUpdateRecommendationMetadata` paralel (suggestQty, moq, urgencyPct, urgencyLevel, coverageDays, targetStock, formula).
  - **Drift detection (line 167-181):** decided rec'lerde frozen suggestQty/urgencyLevel vs current → fark varsa `driftMap.set(productId, { suggestQty, urgencyLevel })`.
  - **AI çağrısı:** Sadece `needsAiItems = noRecItems + levelChangedItems` için. Level-aynı rec'ler AI atlama optimizasyonunu korur.
  - **Response:** `recommendations[]` array entry'lerine `currentDrift` field'ı eklendi. Suggested ve fresh-upsert için null; decided için `driftMap` lookup.
  - Yeni rec metadata'sına `urgencyLevel` field'ı yazılır (deterministik, urgencyPct'ten türetilmiş).
- `middleware.ts` — `/api/ai/purchase-copilot` ALWAYS_PUBLIC'e eklendi.

**Vercel CRON:**
- `vercel.json` yeni dosya: `{ "crons": [{ "path": "/api/ai/purchase-copilot", "schedule": "0 */6 * * *" }] }` — 4×/gün UTC. Vercel CRON otomatik `Authorization: Bearer ${CRON_SECRET}` gönderir.

**Frontend (`src/app/dashboard/purchase/suggested/page.tsx`):**
- `RecEntry` tipine `currentDrift?: { suggestQty, urgencyLevel } | null` eklendi.
- Yeni `<StaleDriftBadge>` component — `var(--warning-bg)` arka plan, "Stok değişti — güncel: X adet, Yüksek aciliyet" yazısı.
- `handleRefresh` — demo guard + `setLastRefreshed` + success/error toast.
- Sayfa başlığı yanındaki yenile butonu — `disabled={isDemo || refreshing || aiLoading}`, `title={isDemo ? DEMO_DISABLED_TOOLTIP : "Verileri yenile"}`, `opacity:0.6` demo'da. Yan tarafta "Son güncelleme: HH:MM" yazısı.
- `RecActionCell` — accepted/edited/rejected branch'lerinin her birinde `driftBadge` render edilir. Suggested branch'inde gösterilmez (UI guard).

**Tests (4 yeni dosya, 38 yeni test):**
- `compute-urgency-level.test.ts` (7): boundaries 50/80, 0%, 30%/60%/90%, 100%
- `purchase-copilot-auth.test.ts` (7): Bearer CRON_SECRET, session, no-auth (401), wrong secret + session, empty CRON_SECRET env, createClient throws
- `purchase-copilot-diff-merge.test.ts` (14): level-same → metadata refresh + AI skip, level-changed → expire + AI re-call, eski sürüm metadata (urgencyLevel field eksik), boş metadata, decided drift suggestQty/urgencyLevel/no-drift, frozen metadata immutable
- `purchase-suggested-stale-badge.test.ts` (8): recMap populate kontratı, currentDrift null/dolu, suggested guard, edited editedQty extract

**Mevcut test güncellemeleri (5 dosya):**
- `ai-purchase-copilot-route.test.ts`, `purchase-suggested-acik-column.test.ts`, `purchase-suggested-ai-banner.test.ts`, `purchase-suggestions-on-product-delete.test.ts`, `ai-cross-capability.test.ts` — `dbExpireEntityRecommendations`, `dbUpdateRecommendationMetadata` ve `@/lib/supabase/server` (createClient) mock'ları eklendi.
- `demo-mode-middleware.test.ts` — `/api/ai/purchase-copilot` ALWAYS_PUBLIC olarak hareket etti; sensitiveWrites'tan çıkarıldı, alerts/scan paralelinde 200 testi eklendi.

**Domain kuralı:**
- Tek source-of-truth: rec metadata'daki `urgencyLevel` ile route severity hesabı `computeUrgencyLevel(urgencyPct)` üzerinden aynı eşikleri (≥80 critical, ≥50 high) kullanır.
- Diff-merge optimizasyonu: AI çağrısı maliyetli olduğundan level değişmiyorsa metni yeniden üretmiyoruz; sayısal alanları her CRON'da güncelleyerek tutarlılığı sağlıyoruz.
- Decided rec'ler dokunulmaz (frozen) — kullanıcı kararını verdiği andaki bağlamı saklıyor; UI'da drift rozeti ile durumu bilgilendiriyoruz.
- Vercel CRON otomatik Authorization header gönderir; ek setup gerekmez.

**Test:** 142 dosya · 2280 test yeşil · TS clean · 0 lint hatası

---

## SMTP / E-posta Altyapısı (Resend) (2026-05-06) — KOD TAMAM / PRODUCTION EKSİK

**Hedef:** Settings → Bildirimler `email_enabled` toggle'ı sembolik olmaktan çıkıp gerçek e-posta göndersin. 5 bildirim türü için fire-and-forget entegrasyon.

**1 commit, ~15 dosya:**

**Backend:**
- Migration 047 (`email_logs`): user_id+notification_type+entity_type+entity_id (dedup index) + status+last_attempt_at (retry index) + RLS service_role
- `src/lib/notification-types.ts` zaten vardı; whitelist kontrol burada
- `src/lib/supabase/email-logs.ts` — dbCreateEmailLog (status='pending'), dbUpdateEmailLogStatus (sent/failed + attempt_count++), dbCheckRecentDuplicate (composite filter, status in ['pending','sent']), dbListFailedEmailsForRetry (failed + attempt<3 + last 24h)
- `src/lib/supabase/users-with-prefs.ts` — `dbListUsersForEmailNotification(type)` auth.admin.listUsers + user_notification_preferences join (DB satırı yoksa default email_enabled=true)
- `src/lib/email/templates.ts` — 5 render fonksiyonu (StockCritical/OrderPending/OrderNew/SyncError/OrderShipped) inline HTML + plain-text. `renderEmail({ type, ctx })` dispatch fonksiyonu
- `src/lib/services/email-service.ts` — `notifyUsersByEmail({ notificationType, entityType, entityId, render })` ve `retryFailedEmails()`. Resend client cached + key-aware (env değişiminde reset). Fail-safe: API_KEY/EMAIL_FROM eksikse erken return.
- `/api/email/retry-failed/route.ts` — CRON endpoint, middleware CRON_PATHS'e eklendi

**Trigger entegrasyonları (fire-and-forget):**
- `alert-service.ts:142` — stock_critical alert oluşunca
- `order-service.ts:198` — pending_approval transition'da
- `orders/route.ts:65` — order_new POST sonrası
- `orders/[id]/route.ts:80` — shipped transition + parasut sync sonrası, `updated` state ile
- `parasut-service.ts:153` — auth threshold alert sonrası

**Dedup penceresi:** 6 saat. CRON tekrar tarayıp aynı entity için tekrar bildirim üretirse spam atılmaz.

**Domain kuralı:**
- Tüm trigger noktaları `.catch(err => console.error(...))` ile fire-and-forget; request response'u bekletilmez.
- `dbCheckRecentDuplicate` 'pending' veya 'sent' status'ları sayıyor ('failed' dedup'a dahil değil — yeniden denenmesi gerek).
- Resend client module-level cache + key-aware: env değişimi (test ortamı) cache invalidate.
- Avatar/notification gibi user-scoped işlemlerde her zaman session'dan user.id alınır; ID input'lanmaz.

**Test (27 yeni):**
- `email-logs.test.ts` (10): create/update/checkDup/listFailed + error truncation
- `email-service.test.ts` (14): config fail-safe, recipient resolution, dedup, Resend success/error/throw, multi-recipient, retry (boş/happy/error)
- `email-retry-failed.test.ts` (3): CRON happy/empty/throw

**Test:** 138 dosya · 2242 test yeşil · TS clean · 0 lint hatası

---

## Production Setup (kullanıcı tarafında)
1. Migration 047 → Supabase dashboard'a uygula
2. resend.com hesap + domain verify (test için: `EMAIL_FROM="KokpitERP <onboarding@resend.dev>"`)
3. Vercel env: `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`
4. Vercel cron: `/api/email/retry-failed` saatte bir tetiklensin (vercel.ts crons config — sonraki tur)

---

## Settings Audit 2. Tur (2026-05-05) — KAPALI

**Hedef:** Audit'te bulunan demo cookie kalıntısı + avatar SVG + server-side validation eksiklikleri.

**1 commit, 9 dosya:**

**HIGH — Demo cookie geçişte temizlenmiyordu** (`login/page.tsx`, `dashboard/layout.tsx`):
- `clearDemoMode()` ne login submit'inde ne dashboard banner link'inde çağrılmıyordu.
- Senaryo: kullanıcı demo modda gez → "giriş yapın" link'ine tıkla → login → auth ol → dashboard'a geç. Bu süreçte `demo_mode` cookie hâlâ set'li, `isDemoMode()` true → settings'te Firma/Kullanıcı/Bildirimler sekmeleri demo guard mesajı gösterir.
- Fix: login `handleSubmit` başarılı `signInWithPassword` sonrası `clearDemoMode()`. Dashboard banner link'i `onClick={(e) => { e.preventDefault(); clearDemoMode(); router.push("/login"); }}` — kullanıcı login'e gidince cookie zaten temizlenmiş, login submit ek olarak güvence katmanı.

**Orta — Avatar SVG XSS riski** (`avatar/route.ts:7`, `045_user_preferences_avatars.sql:31`, yeni `046_user_avatars_no_svg.sql`):
- Public bucket'tan kullanıcı kontrollü `image/svg+xml` servis edildiğinde XSS riski (`<script>` embedded). `<img src>` çoğu browser'da script çalıştırmasa da production avatar için gereksiz risk.
- Fix: `ALLOWED_MIME` listesinden çıkarıldı, hata mesajı "PNG, JPEG veya WebP yükleyin" oldu. Migration 045 yeni deploy'lar için güncellendi; production'daki mevcut bucket için yeni migration 046 (`update storage.buckets set allowed_mime_types = ...`).
- UI: `accept="image/png,image/jpeg,image/webp"`, format açıklaması "PNG, JPEG, WebP · Maks 1MB".
- Şirket logosu (company-assets) farklı bağlam: admin yüklüyor, scope farklı, SVG hâlâ kabul.

**Düşük/Orta — Firma PATCH API validation eksik** (`/api/settings/company/route.ts`):
- UI'da inline validation vardı ama auth'lu biri endpoint'i doğrudan PATCH ile çağırıp geçersiz email/VKN/URL/currency yazabilirdi.
- Fix: `validateCompanyPatch` helper eklendi — required name (boş/200+ char red), email (`isValidEmail`), tax_no (10/11 hane), website (`isValidUrl`), currency (USD/EUR/TRY whitelist). Hata varsa 400 + Türkçe mesaj.

**Düşük — Preferences PATCH boolean coercion** (`/api/settings/user/preferences/route.ts:38`):
- `!!value` string `"false"` veya number `1`'i true'ya çeviriyordu. Garbage input sessizce kabul ediliyordu.
- Fix: `typeof === "boolean"` strict kontrol; her satırda emailEnabled/browserEnabled boolean değilse 400 + alan adı/index belirtilen hata mesajı.

**2 yeni / güncellenen test:**
- `settings-company-route.test.ts` (yeni, 10 test): boş/uzun name, geçersiz email, VKN 9/10/11, geçersiz website, currency whitelist, happy path, logo_url drop
- `settings-user-preferences.test.ts` (güncellendi): malformed boolean → 400 (önceki "sanitize edilir" testi kaldırıldı, strict kontrat).

**Domain kuralı:**
- Demo→login geçişinde `clearDemoMode()` zorunlu — yoksa auth sonrası UI demo gibi davranır.
- Public storage bucket'larda SVG MIME yalnızca admin-yüklü içerik için kabul edilebilir; kullanıcı yükleyebileceği bucket'larda raster sınırla.
- API tarafında validation defense-in-depth: UI validation tek başına yetmez (auth'lu kullanıcı endpoint'i doğrudan çağırabilir).
- Boolean kontratlar strict (`typeof === "boolean"`); coercion (`!!value`) garbage input sessizce yutar.

**Test:** 135 dosya · 2215 test yeşil · TS clean · 0 lint hatası

---

## Settings Audit Fix'leri (2026-05-05) — KAPALI

**Hedef:** Audit'te bulunan HIGH/MEDIUM güvenlik + semantik sorunları kapatmak.

**1 commit, 6 dosya:**
- **HIGH — Avatar orphan**: `avatar/route.ts:42-49` — `dbUpdateUserAvatarUrl` fail'inde storage'dan dosya temizlenir (try/catch + sb.storage.remove([path]).catch). Best-effort cleanup; throw metaErr yine yapılır.
- **HIGH — patchUserMetadata race**: `user-profile.ts:26-41` JSDoc + race açıklaması. Supabase admin updateUserById `user_metadata`'yı REPLACE eder (client-side updateUser merge yapar, admin REPLACE). GET-merge-SET zorunlu; race window UI mutation lock ile kapatılır.
- **MEDIUM — KullaniciTab concurrent lock**: `settings/page.tsx` 3 handler (profile/avatar/password) `isMutating = isSavingProfile || avatarUploading || isChangingPw` ile gate. Avatar butonu disabled. Lost-update korumalı.
- **MEDIUM — Type dedup**: UserProfile + NotificationPref artık `@/lib/supabase/user-profile` ve `@/lib/supabase/user-preferences`'tan import (settings/page.tsx duplicate kaldırıldı).
- **MEDIUM — defaultPrefs çift çağrı**: `initialPrefsRef` shared instance — useState + useRef aynı array'i kullanır.
- **LOW — Avatar test**: `settings-user-avatar.test.ts` 8 test (401, dosya yok, MIME, 1MB+ size, happy path, path traversal sanitize, orphan cleanup, upload error).
- **Kod yorumları**: password rate-limit (Supabase GoTrue ~30/15dk), avatar ext sanitization açıklaması, patchUserMetadata race window.

**Atlanan (audit'te bulunan ama scope dışı):**
- Atomic JSONB merge RPC migration (overkill — UI lock yeterli)
- Upstash rate-limit altyapısı (Supabase GoTrue throttle yeterli; ek katman ayrı altyapı)
- Storage policy granularity (033 pattern korunur)

**Domain kuralı:**
- Supabase admin `updateUserById({ user_metadata })` REPLACE eder (NOT merge). Manual GET → merge → SET zorunlu, race window UI mutation lock ile kapatılır.
- Avatar/dosya upload'larında metadata persist fail'inde orphan cleanup zorunlu (storage leak engellemek için).

**Test:** 134 dosya · 2202 test yeşil · TS clean · 0 lint hatası

---

## Ayarlar Production-Ready (2026-05-05) — KAPALI

**Hedef:** Settings sayfası 5 sekmeli ama Kullanıcı/Bildirimler tamamen mock + Firma validation yok + DemoBanner her zaman görünüyordu. Production-ready hale getirmek.

**1 commit, 12 dosya:**

**Backend:**
- Migration `045_user_preferences_avatars.sql`: `user_notification_preferences` tablosu (auth.users FK + UNIQUE user_id+notification_type) + `user-avatars` storage bucket (1MB, public, RLS service_role only).
- `src/lib/notification-types.ts`: 5 tip sabit liste (stock_critical, order_pending, order_new, sync_error, order_shipped) + her birinin label/desc'i.
- `src/lib/validation.ts`: isValidEmail (regex), isValidTaxNumber (10/11 hane filter), isValidUrl (protokol opsiyonel).
- `src/lib/supabase/user-profile.ts`: dbGetUserProfile / dbUpdateUserFullName / dbUpdateUserAvatarUrl — Supabase `auth.users.user_metadata` üzerinde merge update (admin API).
- `src/lib/supabase/user-preferences.ts`: dbListUserPrefs (DB satırı yoksa default virtual list) / dbUpsertUserPrefs (whitelist + onConflict upsert).

**API endpoints:**
- `GET/PATCH /api/settings/user/profile` — session auth, fullName 2-100 char validation, trim
- `POST /api/settings/user/password` — cookie'siz anon client ile signInWithPassword doğrulaması → updateUser({ password }) → audit_log entry. Supabase updateUser mevcut şifre sormuyor; manuel doğrulama zorunlu.
- `POST /api/settings/user/avatar` — multipart, image MIME, ≤1MB, path `${user.id}.{ext}`, cache-bust ?t={ts}
- `GET/PATCH /api/settings/user/preferences` — session auth, sanitize+whitelist, upsert

**Frontend:**
- KullanıcıTab: tüm mock kaldırıldı, gerçek API'ye bağlandı. Avatar upload, profile save, password change tam akış. Demo modda guard mesajı korundu.
- BildirimlerTab: mock kaldırıldı, NOTIFICATION_TYPES'a göre render, GET/PATCH wire. Demo modda toggle disabled.
- FirmaTab: inline validation eklendi (required name, email/VKN/URL format). Hatalı alanlarda border kırmızı + FieldError component. Save anında validate, hata varsa toast + bloklu.
- DemoBanner: `useIsDemo` koşulu — production'da hiç render edilmiyor.

**Yeni 4 test dosyası (36 test):**
- `settings-user-profile.test.ts` (8 test): GET 401/200, PATCH 401/400 (boş, kısa, uzun)/200, trim
- `settings-user-password.test.ts` (7 test): 401, current empty, < 8 char, same as new, wrong current, happy path + audit_log, updateUser error
- `settings-user-preferences.test.ts` (5 test): GET 401/200, PATCH 401/400 (non-array)/200/sanitize
- `settings-firma-validation.test.ts` (16 test): EMAIL_RE valid/invalid, taxNumber 10/11/9/12 + non-digit filter, URL with/without protocol/path

**Domain kuralı:**
- User profile data Supabase `auth.users.user_metadata`'da tutulur (full_name, avatar_url) — custom tablo gereksiz
- Şifre değişikliğinde mevcut şifre doğrulaması ZORUNLU (Supabase updateUser eski şifre sormuyor — çalınmış oturum riskine karşı). Cookie'siz fresh anon client kullan, persistSession:false.
- DemoBanner her zaman koşullu — `useIsDemo()` üzerinden, sayfa içi if/return ile değil.
- NOTIFICATION_TYPES tek source of truth (frontend display + backend whitelist).

**Test:** 133 dosya · 2194 test yeşil · TS clean · 0 lint hatası

---

## Kapsam Dışı (Sonraki turlar)
- E-posta değiştirme (Supabase auto-confirm + grace period UX)
- SMTP gönderim altyapısı (Resend/SendGrid) — preferences kaydedilir, gönderim ayrı iş
- Browser push notifications (service worker + Web Push API)
- Locale/timezone, role-based access

---

## Production Bulgular 1. Tur (2026-05-05) — KAPALI

**Hedef:** Production deploy sonrası kullanıcı tarafından bildirilen 4 sorun.

**1 commit, 6 dosya:**
- **Bulgu 1 — "Beklemede" ghost satır (HIGH):** Frontend `reorderSuggestions` filtresi `available ≤ min` VEYA `orderDeadline ≤ 7 gün` listesi gösteriyordu, ama `/api/ai/purchase-copilot` route sadece `available ≤ min` filtresi kullanıyordu. Frontend'de listelenen ama AI'da olmayan ürünlerin (örn. AA-SOV-DN80: available=14, min=6, ama deadline geçmiş) suggested rec'leri her load'da expire oluyor → UI "Beklemede" gösteriyor. Fix: AI route'a `computeOrderDeadline` + `dateDaysFromToday` import edildi, filtre `shouldSuggestReorder` ile aligned.
- **Bulgu 2 — Import "Kaynak ?" rozet (MEDIUM):** `sourceChipLabel` sadece "memory"/"ai"/"user" tanırdı; detect-columns route'unun döndürdüğü `"fallback"` (FALLBACK_FIELD_MAP hit) için "?" gösteriyordu. Fix: "fallback" → "Otomatik", default → "—".
- **Bulgu 3 — Apply-mappings sessiz hata (MEDIUM):** Route catch block generic `"Eşleştirme uygulaması başarısız."` döndürüyordu, debugging için kötü. Fix: actual error message propagate (`Eşleştirme uygulanamadı: ${err.message}`).
- **Bulgu 4 — Multi-currency tutar netleştirme (LOW):** `+ $133.600,00` formatı kullanıcılarda toplama gibi algılanıyordu. Fix: "+" kaldırıldı, her tutar yanına currency code eklendi (`€518.400,00 EUR` / `$133.600,00 USD`); başlık "Toplam Sipariş Tutarı" → "Önerilen Satın Alma Tutarı" + tooltip.

**Domain kuralı:** AI öneri filtresi UI filtresiyle aynı kapsamda olmalı. Aksi halde "stok ≥ min ama deadline geçmiş" ürünler için frontend liste gösterirken AI sürekli expire ederek "Beklemede" placeholder'a düşüyor — kullanıcı confused.

**Test güncellemeleri:**
- `ai-purchase-copilot-route.test.ts:110-118` — "healthy" product fixture'da `daily_usage: null` ekle (deadline path'i devre dışı bırak)
- `import-source-chips-ai-percent.test.ts:35-37` — fallback test güncelle, bilinmeyen test ayrıldı

**Test:** 129 dosya · 2158 test yeşil · TS clean · 0 lint hatası

---

## Seed Idempotent + UI Tetikleyici (2026-05-05) — KAPALI

**Hedef:** Production DB hâlâ eski junk veriyle dolu (811 alert, silinmiş ürünler, "cart curt" siparişleri) — seed endpoint hiç manuel curl ile çağrılmamıştı. Tek tıkla "tüm veri temiz + demo seed yükle" akışı gerekti.

**1 commit, 3 dosya:**
- **`src/app/api/seed/route.ts`** —
  - `clearAllData(supabase)` helper extract (DELETE flow tek yerden, DRY).
  - `POST` artık idempotent: önce `clearAllData`, sonra seed insert. Response'a `cleared: { load_orders, demo_tables }` eklendi.
  - `checkAuth` genişletildi: `CRON_SECRET` Bearer **VEYA** authenticated user session (`@/lib/supabase/server` `createClient`). UI'dan tetikleme için.
- **`src/components/settings/ResetDemoSection.tsx`** (yeni) — kırmızı "Tehlikeli Bölge" kartı + confirm modal + busy state + toast + 2 sn sonra reload. Demo modda disabled (DEMO_DISABLED_TOOLTIP).
- **`src/app/dashboard/settings/page.tsx`** — 2-kolon layout altına `<ResetDemoSection />` mount.

**Domain kuralı:** Seed endpoint authenticated user **veya** CRON_SECRET bearer ile tetiklenebilir. UI tarafından çağrı için Authorization header gerekmez (cookie-based session). Demo cookie kabul edilmez (sadece gerçek auth). Tek admin kullanan iç araç olduğu için ek role kontrolü yok.

**Test:** 129 dosya · 2157 test yeşil · TS clean · 0 lint hatası

---

## Demo Seed Yenileme (2026-05-04) — KAPALI

**Hedef:** Müşteri turuna uygun sade öz boyut + her sayfada anlamlı veri.

**1 commit — `src/app/api/seed/route.ts` rewrite:**
- Mevcut: 1613 satır, 39 ürün, 15 sipariş — kalabalık + LOAD- kalıntısı temizlenmiyor + quotes/ai_recommendations/import_*/company_settings/parasut_oauth_tokens boş
- Yeni: 8 ürün · 4 müşteri · 7 sipariş · 3 teklif · 5 AI öneri · 2 import batch · 3 üretim · 1 şirket ayarı + parasut stub

**Veri tasarımı:**
- 8 ürün (her biri tek senaryo): KV-3P-DN50 normal/manufactured/BOM kaynağı, KV-DB-DN100 CRITICAL, KV-3P-DN80 WARNING, KB-WT-DN150 past deadline, AA-SOV-DN80 imminent 3 gün (45 gün Almanya lead), CV-KV-DN65 imminent 1 gün, CT-SS-DN50 fiyat eksik (price=NULL → Sprint C sayacı), BE-SC-M24x100 BOM bileşeni
- 4 müşteri: Tüpraş (TRY), Abdi İbrahim (EUR), Enerjisa (USD), Ülker (VKN-eksik — Paraşüt preflight)
- 7 sipariş: çift eksen matrisi tam (draft+unallocated, pending+expired_quote, approved+allocated quote_id'li, partially_allocated+shortage, partially_shipped, shipped+parasut_error, cancelled)
- 3 teklif: TKL-2026-001 sent (geçerli), TKL-2026-002 expired (alert), TKL-2026-003 accepted (ORD-2026-0003'e bağlı)
- 5 AI öneri: 2 suggested, 1 accepted, 1 rejected, 1 edited + ai_feedback satırları
- 2 import batch: confirmed + 3 merged draft / review + 4 mixed-status draft
- 3 üretim: KV-3P-DN50 (today, normal), KV-3P-DN50 (daysAgo(2), 2 fire), KB-WT-DN150 (daysAgo(5), normal)
- BOM: KV-3P-DN50 ← CT-SS-DN50 (1) + BE-SC-M24x100 (8)

**DELETE akışı:**
- Aşama 1 (yeni): LOAD- prefix temizliği — sales_orders.notes/customers.name/products.sku LIKE
- Aşama 2: 25 demo tablo (FK alt → üst sırasıyla; quotes/quote_line_items/ai_*/import_*/column_mappings/parasut_oauth_tokens dahil)
- Aşama 3: company_settings UPDATE ile sıfırla (singleton invariant)
- Aşama 4: order_counters reset (last_seq=0)

**POST akışı:** company_settings UPDATE → parasut_oauth_tokens UPSERT → products → customers → quotes + quote_line_items → sales_orders (quote_id refs) + order_lines → reservations + shortages + product.reserved sync → BOM → commitments → production → movements → shipments + invoices + payments → ai_recommendations + ai_feedback → import_batches + drafts → column_mappings + ai_entity_aliases → sync_logs + audit_log + order_counters

**Domain kuralı:** ai_recommendations.entity_id text kolonu (UUID değil); products.id'yi string olarak insert edilmeli. Active suggested için entity başına 1 satır constraint var (idx_recs_active_unique). company_settings singleton — DELETE değil UPDATE ile sıfırla. parasut_oauth_tokens singleton_key UNIQUE → upsert onConflict.

**Test:** 129 dosya · 2157 test yeşil · TS clean · 0 lint hatası (test mock'lar DB'ye dokunmuyor).

**Manuel doğrulama (curl + demo cookie):**
1. `curl -X DELETE /api/seed -H "Authorization: Bearer $CRON_SECRET"` → tüm veri temiz
2. `curl -X POST /api/seed -H "Authorization: Bearer $CRON_SECRET"` → response: `{ products: 8, customers: 4, orders: 7, quotes: 3, ai_recommendations: 5, import_batches: 2, ... }`
3. Demo cookie ile gez: /dashboard, /dashboard/products, /dashboard/orders, /dashboard/customers, /dashboard/quotes, /dashboard/purchase/suggested, /dashboard/import, /dashboard/settings, /dashboard/parasut, /dashboard/alerts — her sayfa dolu

---

---

## Sprint C Bulgular 4. Tur Özet (2026-05-02) — KAPALI

**Hedef:** 3. tur sonrası kalan G3/G5/G4 bulgularını kapatmak.

**1 commit (`3e01cd0`):**
- **G3 (HIGH):** "Açık Sipariş" sütunu hardcoded `0` → gerçek sayı. `page.tsx`'e `openOrderCounts` state + mount fetch (alerts sayfası pattern paralel: `fetch("/api/orders/open-count-by-product")`). Mobil + masaüstü cell'ler vurgu rengi (>0 ise accent-text). Backend helper (`dbGetOpenOrderCountByProduct`) ve endpoint zaten hazırdı.
- **G5 (MEDIUM):** Mobil kart pending state'inde inline IIFE + "Karar ver →" → `<RecActionCell>` (drawer açmadan inline aksiyonlar). Decided'da "Kararı geri al" linki otomatik (RecActionCell zaten içeriyor). RejectMode input'una `maxLength={200}` (plan G5 line 136).
- **G4 (MEDIUM/LOW):** 2 yeni test dosyası — `purchase-suggested-refetch-after-mutation` (6 test, fake timers + debounce), `purchase-suggested-demo-mode` (5 test, helper kontrat + frontend simülasyonu). 2 helper extract → `purchase-utils.ts`:
  - `scheduleRefetchAfterMutation(timerRef, loadFn, delayMs=300)` — 4 handler'da duplicate olan debounce pattern
  - `shouldSkipAiFetch(isDemo)` — demo modda AI fetch kısa devresi (page.tsx loadAiData içinde tek noktaya alındı)
- `acik-column` testine `openOrderCount` field'ı route response'unda olmadığını doğrulayan regresyon eklendi.

**Geçersiz iddia:** "Undo başarı toast'ı yok" — `page.tsx:663`'te VAR (3. turda eklenmiş).

**Domain kuralı:** UI mount'ta endpoint çağrısı yaparken AbortController kullan (re-mount/dependency change'de pending fetch iptal edilsin). Best-effort fail handling: hata durumunda boş object/array → 0 default.

**Test:** 129 dosya · 2157 test yeşil · TS clean · 0 lint hatası

---

## Sprint C Bulgular 3. Tur Özet (2026-05-02) — KAPALI

**Hedef:** G1/G3/G5 bulgularını kapatmak.

**1 commit (`52a082d`):**
- **G1 (HIGH):** `dbGetAllActiveProductIds` yeni helper (`products.ts`) — copilot route artık pageSize:500 truncation'ından bağımsız tam aktif ID setiyle orphan expire yapıyor. Eski kod: `products.map(p => p.id)` (500 limitli). Yeni: ayrı SELECT id sorgusu, tüm aktif ürünler.
- **G3 (HIGH):** "Stok Açığı" → "Açık Sipariş" — masaüstü header + tooltip + hücre (0 göster); mobil kart etiketi. Tooltip: "Bu üründe açık (onaylı + sevk edilmemiş) sipariş sayısı". Kullanılmayan `deficit` değişkenleri silindi.
- **G5 (MEDIUM):** Masaüstü KARAR hücresi inline IIFE'den `<RecActionCell>` bileşenine geçirildi — pending satırlar artık doğrudan Kabul Et/Düzenle/Reddet chiplerini gösteriyor (drawer açmak gerekmez). `handleUndo` başarı yoluna `toast({ type: "success", message: "Karar geri alındı." })` eklendi.
- **3 yeni test:** `purchase-suggested-multi-currency` (8 test), `purchase-suggestions-on-product-delete` (5 test), `purchase-suggested-acik-column` (5 test)
- **Güncellenen testler:** `ai-purchase-copilot-route.test.ts` + `purchase-suggested-ai-banner.test.ts` — `dbGetAllActiveProductIds` mock eklendi.

**Domain kuralı:** PostgREST `.range()` ile pageSize:N limiti, expire için gereken "tüm aktif ID" listesini kesiyor. Expire işleminde her zaman ayrı `SELECT id` sorgusu kullan (pagination yok).

**Test:** 127 dosya · 2145 test yeşil · TS clean · 0 lint hatası

**Plan `03-purchase-suggested-implementation.md`'de eksik kalan test dosyaları:**
- `purchase-suggested-refetch-after-mutation.test.ts` — frontend-only (jsdom gerektirir), node env'de test edilemez
- `purchase-suggested-demo-mode.test.ts` — frontend-only (middleware + demo cookie), node env'de test edilemez

---

## Sprint C Bulgular 2. Tur Özet (2026-05-02) — KAPALI

**Hedef:** /dashboard/purchase/suggested sayfasının tasarımını koruyup eksik işlevsellik + bug + lifecycle.

**1 commit:**
- Fix 1 (HIGH): NULL fiyat sıfıra düşüyor → `??` → `||` (page.tsx) — missingPriceCount artık doğru
- Fix 2 backend (HIGH): "Kararı geri al" akışı → VALID_TRANSITIONS'a reverse geçişler + ALLOWED_STATUSES'a "suggested"
- Fix 2 frontend (HIGH): handleUndo + optimistic rollback + "Kararı geri al" butonu (table + drawer)
- Fix 3 (MEDIUM): Ürün silinince/deaktif edilince rec'ler anında expire — dbExpireEntityRecommendations yeni helper
- Fix 4: 5 adlandırılmış test — action-feedback, cost-fallback, ai-banner, product-cleanup, empty
- 124 dosya · 2128 test yeşil · TS clean · 0 lint hatası

---

## Sprint C Özet (2026-05-01) — KAPALI

**Hedef:** /dashboard/purchase/suggested sayfasının tasarımını koruyup eksik işlevsellik + bug + lifecycle.

**3 commit:**
- Part 1 (`2816193`): AI fail banner + costPrice NULL fallback + 300ms refetch + isDemo guard. Backend route'a `ai_call_failed` flag.
- Part 2 (`27ca6b6`): `dbExpireRecommendationsForMissingEntities` — silinmiş ürünün suggested+decided rec'lerini expire eder; route scan başında çağrı (Sprint A G1 alerts pattern paralel).
- Part 3 (`d45bd2b`): "Açık" → "Stok Açığı" (header + tooltip + 0); multi-currency TOPLAM (Map ile group; tek currency mevcut görünüm, karışıksa "+ $X" alt satır).

**Test:** 106 dosya · 2003 test yeşil · TS clean.

---

## Sprint B Özet (2026-05-01) — KAPALI

**Hedef:** /dashboard/import wizard'ı tasarımını koruyup eksik işlevsellik + bug + veri bütünlüğü.

**4 commit:**
- Part 1 (`3e0a196`): file size limit (25 MB) + inline edit rollback (sessiz fail kaldırıldı)
- Part 2 (`8e6a1ca`): Sonuç ekranında entity-bazlı kırılım tablosu (G6) — Türkçe etiket
- Part 3 (`6c266d7`): order_line sort_order collision fix — per-order cache
- Part 4 (this): race condition CAS + migration 043 + rollback

**Migration:** `043_import_batches_confirming_status.sql` — status enum'una 'confirming' eklendi.

**Test:** 106 dosya · 1993 test yeşil · TS clean.

# KokpitERP — Claude Code Rehberi

## Mevcut Durum
_Son güncelleme: 2026-05-10_

**Son tamamlanan iş:** Purchase&Alert plan Faz 1 — sync_issue alert inline retry (2026-05-10)

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
- M-3: Rate limiting (Upstash Redis — altyapı kararı bekliyor)
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

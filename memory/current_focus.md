---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---

## Son Tamamlanan İş — 2026-06-03 (**Cariler (Müşteriler) sayfası — final ürün (toplu-silme bayat satır + hover antipattern + modal a11y + validation parity)**)

Kullanıcı "sırada cariler sayfası var son ürün haline eksiksiz hatasız bugsuz hale gelsin her işlevi hatasız çalışmalı e2e test et gör ultrathink" dedi. Kapsam: `/dashboard/customers` (liste + filtre/arama + Pagination + toplu silme + Yeni Müşteri modalı + `CustomerDetailPanel` slide-in görüntüle/düzenle) + `customers.ts` servis + 2 route + `data-context` müşteri fonksiyonları. "Önce doğrula sonra düzelt" + danışman triyajı. **Sayfa olgun — güvenlik/veri-bütünlüğü bug'ı YOK** (RBAC `manage_customers` POST/PATCH, `delete_customers` DELETE, GET `redactCustomersForPerms`, DELETE order-409 pre-check + audit-after-success Faz 6, demo guard, POST `validateStringLengths`). Bu tur = **1 fonksiyonel bug + 3 disiplin boşluğu (danışman triyajından geçen, hepsi adlandırılmış precedent'li):**
- **#1 (MED — headline) Toplu silme bayat satır bırakıyordu (FONKSİYONEL — danışman yakaladı, kendi self-check'imde kaçtı):** `handleBulkDelete` (`page.tsx:126`) ham `fetch` DELETE'ler atıp `clearAll()` yapıyordu → **yalnız SEÇİMİ temizler, `customers` state'inden silinen satırları KALDIRMAZ, refetch yok** → kullanıcı "N müşteri silindi" toast'ı görür, satırlar tabloda durmaya devam eder. Tek-satır silme (`handleDelete`→context `deleteCustomer`→`setCustomers(prev=>filter)`) DOĞRU çalışıyor → asimetri = gözden kaçma. "her işlevi hatasız çalışmalı" görevinde görünür-bozuk toplu silme tüm kozmetiklerin önünde. Fix: bulk context `deleteCustomer(id)` üzerinden (`Promise.allSettled(ids.map(id=>deleteCustomer(id)))` — her başarı kendi satırını `setCustomers` filter'ıyla kaldırır, fail rejected→sayılır [`deleteCustomer` `!ok`→throw, eski `fulfilled&&!ok` semantiği artık `rejected`]); açık `selectedCustomer` dahilse kapatılır (tek-silme paritesi). **Paired (danışman):** `DELETE /api/customers/[id]` `revalidateTag("customers")` YOK'tu (POST'ta var `route.ts:42`) → silinen satır 30s `unstable_cache`'ten sonraki refetch'te geri servis edilebilir → eklendi.
- **#2 (MED) Liste hover DOM-mutation antipattern:** `<tr>` (`page.tsx:311`) `onMouseEnter/Leave` ile `querySelectorAll("td").forEach(td=>td.style.background=...)` doğrudan DOM yazıyordu (kodbazda defalarca düzeltilmiş — orders/quotes/products/PO). Fix: `hoveredId` state + koşullu `<tr>` background (`hoveredId===id ? bg-secondary : transparent`); `confirmDeleteId` korunur.
- **#3 (MED) Modal/panel a11y — 3 çıplak modal:** toplu-silme onay modalı (`page.tsx:482`) + Yeni Müşteri modalı (`:535`) + `CustomerDetailPanel` slide-in (`:127`) hiçbiri `role="dialog"`/`aria-modal`/`aria-labelledby` taşımıyordu (üçünün de hedeflenebilir başlığı vardı). Fix: üçüne `role=dialog`+`aria-modal=true`+`aria-labelledby` (başlık id'li: `bulk-delete-customers-title`/`add-customer-title`/`customer-detail-title`). **DROP:** focus-trap/Escape (vendors/PO/production turlarıyla tutarlı — evrensel eklenmedi). Bu sayfada "geçen turun aynısı değil" — 3 ayrı çıplak panel.
- **#4 (LOW-MED) validation parity:** (a) `PATCH /api/customers/[id]` name+country doğruluyordu ama `validateStringLengths` YOK'tu (POST'ta var) → düzenleme panelinin sınırsız notes/address 10k+ char geçebiliyordu → eklendi (recursive helper nested kapsar). (b) `addCustomer` (`data-context.tsx`) `!res.ok`→`throw new Error(await res.text())` → POST `{error:"..."}` JSON döndüğünden kullanıcıya ham `{"error":…}` stringi toast'lanıyordu; kardeş `updateCustomer`/`deleteCustomer` zaten `errBody?.error` parse ediyor (danışman: "minor değil, create akışında gerçek defect") → parse'a hizalandı.
- **Bilinçli DROP (danışman doğruladı):** header "{N} aktif müşteri" alt-yazısı **DOĞRU** — `dbListCustomers` `.eq("is_active",true)` + DELETE hard-delete → liste yalnız aktif taşır (benim "mislabeled" varsayımım YANLIŞTI, DOKUNMA); Pasif tab/`passiveCount` vestigial (her zaman 0, ileriye dönük iskele — DOKUNMA); Vergi Dairesi precedence kozmetiği (`CustomerDetailPanel:331`); servis/RBAC/redaction (denetlendi → kapsam dışı).
- **Test (+13):** yeni `src/__tests__/customers-ui.test.ts` (9 source-regex — bulk context-delete 2, hoveredId 2, 3 modal a11y 4, addCustomer parse 1) + `customer-patch-route.test.ts` (+4 — PATCH 10k→400 + regresyon 200, DELETE 409 + başarı→`revalidateTag("customers")`; `next/cache`+`getCurrentUserId`+`dbCountOrdersByCustomer` mock). Mevcut `customer-update-mapping.test.ts`/`customer-nav.test.ts` DOKUNULMADI. tsc temiz · lint 0 · build OK (`ƒ Proxy`, `/dashboard/customers`). **4426→4439 test yeşil (303 dosya).**
- **CANLI E2E — GÜVENLİ salt-okuma probe** (prod `ryvxpolvhvsycuqyphoa`, Playwright login→cookie, kendi dev server :3000). **MUTASYON YOK** — müşteri create/update/delete ASLA: create kalıcı `customers` satırı + delete kalıcı `audit_log customer_deleted` (hard-delete, geri-alınamaz): login→/dashboard · `GET /dashboard/customers` 200 + başlık "Cariler" · `GET /api/customers` admin → **200, 4 müşteri** · loadError yok + arama input · satır tıkla → **`CustomerDetailPanel` `role=dialog` CANLI render** (Finding 3 a11y kanıtı) → 🎉 **PROBE PASSED (7/7).** Bulk-stale/PATCH-10k/validation yalnız offline vitest (prod'da zorlanamaz).
- **DURUM: çalışıldı, offline+canlı yeşil; COMMIT/PUSH kullanıcı onayı bekliyor.** Değişen: `dashboard/customers/page.tsx` (bulk+hover+2 modal a11y) + `CustomerDetailPanel.tsx` (panel a11y) + `api/customers/[id]/route.ts` (DELETE revalidateTag + PATCH validateStringLengths) + `data-context.tsx` (addCustomer parse) + yeni `customers-ui.test.ts` + `customer-patch-route.test.ts` genişletildi + CLAUDE.md + 2 memory. Plan: `~/.claude/plans/stok-r-nler-sayfas-n-detayl-calm-charm.md` (Cariler içeriğiyle güncel).

---

## Önceki — 2026-06-03 (**Üretim Girişi sayfası — final ürün (BOM eksik-bileşen şeffaflığı + silme onayı + a11y)**)

Kullanıcı "sırada üretim girişi sayfası var son ürün haline eksiksiz hatasız bugsuz hale gelsin her işlevi hatasız çalışmalı e2e test et gör ultrathink" dedi. Kapsam: `/dashboard/production` (çok-satırlı form + sesli giriş + bugünkü/geçmiş kayıt tabloları + kayıt silme) + `production-service.ts` + atomik RPC (`complete_production`/`reverse_production`) + 3 route. "Önce doğrula sonra düzelt" + danışman triyajı. **Sayfa zaten çok olgun (Sesli Giriş V1–V3 + Faz 10 prefill) — güvenlik/veri-bütünlüğü bug'ı YOK** (RBAC `manage_production` POST / `delete_production` DELETE, atomik FOR UPDATE bileşen kilidi + deterministik sıra → deadlock yok, demo guard page+middleware, shortage resolution non-fatal). Bu tur = **3 gerçek ama küçük boşluk (danışman triyajından geçen):**
- **#1 (MED — headline) BOM eksik-bileşen detayı UI'a HİÇ ulaşmıyordu (fonksiyonel):** imalat ürününde bileşen yetersizse `complete_production` (008 hotfix `:158-172`) **zengin 409** döner: `error:'Yetersiz bileşen stoğu.'` + `shortages:[{component_product_id, component_name, required_qty, available_qty}]`. Route (`/api/production:56`) olduğu gibi geçirir. Ama `addUretimKaydi` (`data-context.tsx:339`) `!res.ok` dalında **yalnız `errBody.error`'ı** alıp throw ediyor → `shortages` (hangi bileşen, gerekli/mevcut) **tamamen düşüyor** → kullanıcı hangi hammaddeyi tedarik edeceğini bilemiyor (veri mevcut, UI'a taşınmıyor). **+Danışman yakaladı (yarı-çalışan headline tuzağı):** zengin mesaj `handleSave`'de yalnız **hepsi-başarısız** dalında (`firstError`) gösteriliyor; **kısmi** dal (`succeeded>0&&failed>0`, `:255`) jenerik "N başarılı, M başarısız" → çok-satırlı partide bir satır BOM-short olursa mesaj **sessizce kaybolur**. Fix: yeni **client-safe pure** `src/lib/production-shortage-helpers.ts` `buildShortageMessage(shortages, fallback)` (her bileşen `{component_name ?? component_product_id} (gerekli X, mevcut Y)`; boş/eksik→fallback; `voice-note-helpers.ts` client/server boundary precedent'i — server-only `production-service.ts`'e KOYMA, `createServiceClient` sızar); `addUretimKaydi` `errBody.shortages` ile zengin mesaj (untyped okuma yeterli, tip değişikliği şart değil); `handleSave` **kısmi dal** toast'ına `firstError`.
- **#2 (MED) Silme = tek-tıkla sessiz stok geri-alımı, onay YOK:** bugünkü kayıt `×` (`page.tsx:589`) tek tıkta `deleteUretimKaydi`→`DELETE /api/production/[id]`→`reverse_production` RPC → **bitmiş ürün stoğu düşer + BOM bileşenleri geri yüklenir** (gerçek envanter ters hareketi, domain §8.1); yalnız `deletingId` çift-tık koruması, onay diyaloğu YOK → yanlışlıkla tek tık → geri-dönüşü-zor mutasyon. Fix (native `confirm()` DEĞİL — proje paterni inline modal): `confirmDeleteId` state + `role="dialog"`+`aria-modal="true"`+`aria-labelledby="delete-production-title"` (başlık id'li) + ürün/adet özeti + "Vazgeç"/"Evet, sil (stok geri alınır)"; × yalnız `setConfirmDeleteId` (silmez); `performDelete` handler; demo+`deletingId` korunur. **Bonus (danışman):** bu modal Finding 3'ün a11y'sine **gerçek `role=dialog` hedefi** kazandırır (PO `470578c` precedent) — bu sayfada başka modal yoktu, "geçen turun aynısı" değil.
- **#3 (LOW) a11y — etiketsiz kontroller:** (a) başlık tarih input (`:311`) label/aria-label yok → `aria-label="Üretim tarihi"`; (b) satır-kaldır × (`:493`) yalnız "×", `title` bile yok → `aria-label={\`${idx+1}. satırı kaldır\`}`; (c) silme × `title` var ama aria yok → `aria-label={\`${kaydi.productName} üretim kaydını sil\`}`.
- **Bilinçli DROP (danışman):** gelecek-tarihli üretim guard'ı — `domain-rules.md` §8 production_date için tavan belirtmiyor → "bug" spekülatif (feedback_plan_domain_check, bu tur domain-rules okundu); ondalık adet (`"2.5"`→`parseInt`→2) reddi — DB integer, ayrık mamulde zayıf; servis/RBAC/RPC/migration denetlendi → kapsam dışı.
- **+Danışman (done-öncesi) — tip yalan footgun:** `component_name` RPC→servis→route zincirinde **runtime** taşınıyordu (referansla, çalışıyordu) ama `ComponentShortage` (production-service.ts) + `CompleteProductionResult.shortages` (production.ts:107) tipleri alanı **omit** ediyordu → gelecekteki bir "tip temizliği" (`shortages.map(s=>({id,req,avail}))`) headline'ın yük-taşıyan alanını sessizce düşürür + TS refactor'cıya yardım eder + tüm testler yeşil kalır → headline jenerik "Yetersiz bileşen stoğu."a geri döner. Fix (≈5 satır): iki tipe `component_name?: string` (tip artık doğru söyler) + `production-service.test.ts`'e davranışsal sözleşme testi (mock 409 shortage `component_name` ile → `serviceCreateProductionEntry` → `result.shortages[0].component_name` korunur).
- **Test (+16):** yeni `src/__tests__/production-shortage-helpers.test.ts` (6 saf davranış — boş→fallback, tek/çok bileşen, component_name yoksa id'ye düş, hepsi atlanırsa fallback, sayısal-olmayan→?) + yeni `src/__tests__/production-ui.test.ts` (9 source-regex — BOM import+firstError 2, modal a11y role/aria-modal/aria-labelledby+id 4, 3 aria-label 3) + `production-service.test.ts` (+1 component_name sözleşme; diğer mevcut testler korundu). Mevcut `voice-production-page.test.ts` DOKUNULMADI. tsc temiz · lint 0 · build OK (`ƒ Proxy`, `/dashboard/production`). **4410→4426 test yeşil (302 dosya).**
- **CANLI E2E — GÜVENLİ salt-okuma probe** (prod `ryvxpolvhvsycuqyphoa`, Playwright login→cookie, kendi dev server :3000). **MUTASYON YOK** — üretim create/delete ASLA: create kalıcı `production_entries`+`inventory_movements` satırı bırakır **ve BOM bileşen stoğunu tüketir**; delete ters hareketle stoğu geri alır → ikisi de envanteri kalıcı değiştirir, geri-alınamaz (danışman): login→/dashboard · `GET /dashboard/production` 200 + başlık "Üretim Girişi" · `GET /api/production` admin → **200, 3 kayıt** (gerçek render) · ürün select + 🎤 Sesli Giriş + Kaydet boş-form disabled (happy path) + "Bugünkü Üretim Kayıtları" bölümü → 🎉 **PROBE PASSED (8/8).** BOM-409/kısmi-toast/silme-onay yalnız offline vitest (prod'da zorlanamaz/temizlenemez).
- **DURUM: COMMIT+PUSH EDİLDİ (`0504bdc` → main, `95ad46e..0504bdc`, Coolify deploy tetiklendi).** React Doctor advisory bloklamadı; "test" status check bypass. Değişen: `dashboard/production/page.tsx` (3 fix) + `data-context.tsx` (addUretimKaydi) + yeni `production-shortage-helpers.ts` + `production-service.ts`+`supabase/production.ts` (tip) + 2 yeni test + 1 mevcut test + CLAUDE.md + 2 memory.

---

## Önceki — 2026-06-03 (**Tedarikçiler sayfası — final ürün (a11y modal + görünür yükleme hatası + toplu-seçim kapsamı)**)

Kullanıcı "sırada tedarikçiler sayfası var son ürün haline eksiksiz hatasız bugsuz hale gelsin her işlevi hatasız çalışmalı e2e test et gör ultrathink" dedi. Kapsam: `/dashboard/vendors` (liste + drawer create/edit + bulk deactivate) + `vendors.ts` servis + 2 route. "Önce doğrula sonra düzelt" + danışman triyajı. **Sayfa zaten çok olgun — güvenlik/veri-bütünlüğü bug'ı YOK** (RBAC `view/manage/delete_vendors`, validation parity `validateStringLengths`+servis `validateVendorInput`, soft-delete + **aktif-PO guard** 409, audit-actor `getCurrentUserId`, demo guard, RLS). Bu tur = **3 gerçek ama küçük boşluk (danışman triyajından geçen):**
- **#1 (MED — headline) a11y modal/drawer:** bulk-deactivate confirm modal (`page.tsx:559`) **iki çıplak `<div>`** — `role="dialog"`/`aria-modal`/`aria-labelledby` HİÇ yok; drawer (`:609`) `role="dialog"`+`aria-label` var ama `aria-modal` yok. Fix: modal panel `role="dialog"`+`aria-modal="true"`+`aria-labelledby="bulk-deactivate-title"` (başlık div'i `id` aldı); drawer `aria-modal="true"`. **Precedent: PO turn1 `470578c`** bulk-cancel modalına tam bu üçlüyü eklemişti — kabul edilmiş disiplin.
- **#2 (LOW-MED) görünür yükleme hatası — DÜRÜST: bu "sessiz hata" DEĞİL.** `loadVendors` (`:149`) zaten `!res.ok`→throw→catch→`toast`. PO listesindeki sessiz yutma BURADA YOK. Gerçek (dar) boşluk: toast geçici; söndükten sonra `vendors=[]`→tablo "Henüz tedarikçi eklenmemiş" (`:392`) gösterir = **yükleme hatasında yanıltıcı "hiç yok" durumu.** Fix (PO 2.tur `loadError` paterni): yeni `loadError` state (try başında false, catch'te true); `role="alert"`+`aria-live="polite"` banner + **"Yeniden dene"** (`loadVendors` refetch); empty-state dalı `!loadError`'a gate (loadError→empty'den ÖNCE); Pagination de `!loadError`. Toast korundu (anlık katman) — banner kalıcı katman.
- **#3 (LOW) toplu-seçim aktif tedarikçilere kısıtlandı — PO drop'u BURADA GEÇERSİZ.** Ayraç: PO'da bulk-cancel re-validate DROP edilmişti çünkü checkbox **yalnız cancellable satırda** render ediliyordu (seçim zaten gate'li). Burada per-row checkbox (`:428`) **HER satırda** `is_active` guard'sız. "Pasifleri göster" AÇIK iken zaten-pasif seçilip "Pasife Al"→DELETE→**409 "zaten pasif"**→failed→"N pasife alınamadı" gürültüsü. Ulaşılabilir UX çukuru, defense-in-depth değil. Fix (PO `cancellablePageIds` aynası): `pageIds = pagedItems.filter(v=>v.is_active).map(v=>v.id)` + per-row checkbox `{v.is_active && (<input...>)}`. Bulk bar/modal mantığı değişmez. **Empty-`pageIds` güvenli** (danışman flag): all-pasif sayfada `pageIds=[]` → `computeIsPageAllSelected` `length>0 &&` → false (header checkbox unchecked), `computeIsPageIndeterminate` `length===0→false` → wart yok.
- **Bilinçli DROP (danışman):** drawer Escape/focus-trap (PO turn'ünde de evrensel eklenmedi, blocker değil); client email/tax format ipucu (servis `validateVendorInput` doğruluyor + `formError` banner → gold-plating); servis/RBAC/migration (denetlendi → kapsam dışı).
- **Test (+8):** yeni `src/__tests__/vendors-ui.test.ts` (source-regex, PO `purchase-orders-ui.test.ts` aynası) — modal/drawer a11y (3: role/aria-modal/aria-labelledby+id, başlık id, drawer aria-modal) + `loadError` (3: state, banner+Yeniden-dene, empty/Pagination `!loadError` gate) + toplu-seçim (2: aktif `pageIds`, per-row `is_active` gate). Mevcut `vendors.test.ts` (route/servis 30) DOKUNULMADI. tsc temiz · lint 0 · build OK (`ƒ Proxy`, `/dashboard/vendors`). **4402→4410 test yeşil (300 dosya).**
- **CANLI E2E — GÜVENLİ salt-okuma probe** (prod `ryvxpolvhvsycuqyphoa`, Playwright login→cookie, kendi dev server :3000). **MUTASYON YOK** — vendor create/update/deactivate ASLA (create kalıcı `audit_log` satırı bırakır, deactivate sonrası bile geri alınamaz; products-page ZZTEST-cleanup precedent'i burada uygulanmaz — danışman): login→/dashboard · `GET /dashboard/vendors` 200 + başlık "Tedarikçiler" görünür · `GET /api/vendors` admin → **200, 0 kayıt** (prod boş — empty path doğal; detay/satır probe atlandı) · drawer açıldı "Yeni Tedarikçi" formu render + **loadError banner YOK** (happy path) → 🎉 **PROBE PASSED (7/7).** Hata/409/bulk-noise yalnız offline vitest (prod'da zorlanamaz/temizlenemez — danışman).
- **DURUM: COMMIT+PUSH EDİLDİ (`95ad46e` → main, `448c548..95ad46e`, Coolify deploy tetiklendi).** Değişen: `dashboard/vendors/page.tsx` (3 fix), yeni `src/__tests__/vendors-ui.test.ts` + CLAUDE.md + 2 memory. React Doctor advisory uyarısı bloklamadı; "test" status check bypass edildi. Plan: `~/.claude/plans/stok-r-nler-sayfas-n-detayl-calm-charm.md` (Tedarikçiler içeriğiyle güncel).

---

## Önceki — 2026-06-03 (**Satın Alma Siparişleri sayfası — final ürün 2. tur (sessiz yükleme hatası + tarih tutarlılığı)**)

Kullanıcı "sırada satın alma siparişleri sayfası eksiksiz detaylı incele kullan e2e test et son ürün olarak ultrathink" dedi. **Dürüst çerçeve:** sayfa **zaten `470578c`'de final ürün gönderilmişti** (1. tur). Bu tur yüzeyler yeniden okundu (liste/detay/new/print + 9 route + servis + 4 migration) + danışman triyajı. **Güvenlik/veri-bütünlüğü bug'ı YOK.** Bu tur = küçük ama gerçek güvenilirlik boşluğu + minör polish. **2 düzeltme (danışman triyajından geçen):**
- **#1 (MED — headline) Sessiz yükleme hatası → görünür error state:** liste `loadOrders` (`page.tsx:82`) `if (ordersRes.ok)`/`if (vendorsRes.ok)` ile sarılıydı; `catch` yalnız network throw'da. Server 401/403/500 → toast YOK, bayat/boş `orders` + `vendorMap` HİÇ dolmaz (tedarikçi "—") → kullanıcı finansal sayfada yanıltıcı "Henüz sipariş yok" görür. **Detay `loadPO` zaten dürüst ele alıyordu** (404 toast + setPo null) → tutarsızlık. New form (`new/page.tsx`) `if (vRes.ok)`/`if (pRes.ok)` aynı şekilde yutuyordu (boş dropdown, neden bilinmez). **Fix (ürün-detay `attachmentsError` paterni):** liste `loadError` state → `!ordersRes.ok` → `setLoadError(true)`+early return; tablo bölgesinde `role="alert"` banner + **"Yeniden dene"** (`loadOrders` refetch); empty state dalı `loadError`'dan SONRA (MED-1 belirsizliği bununla kapanır — error≠empty); Pagination de `!loadError` gate. New form `loadData` `useCallback`'e çıkarıldı (retry için) + `!vRes.ok||!pRes.ok`→error + sayfa-üstü banner + retry.
- **#2 (LOW) expected_date ham ISO → tr-TR:** liste:337 + detay:230 `2026-05-15` basıyordu (aynı satırdaki created_at tr-TR iken). Yeni export `formatExpectedDate(iso)` (`+"T00:00:00Z"` UTC midnight → gün kayması yok, null→"—"), iki noktada da.
- **Bilinçli DROP (danışman):** **LOW-2** clear-butonu aria-label — buton zaten "Seçimi Temizle" metni = erişilebilir ad → audit agent uydurma boşluk, eklemek gürültü. **MED-3** bulk-cancel re-validate — checkbox zaten yalnız `cancellable` PO'larda render + seçim `search|activeTab` key'li + backend guard'lı → non-issue, backend kapsıyor.
- **Test (+9, 4393→4402):** `purchase-orders-ui.test.ts` genişletildi — `formatExpectedDate` pure helper (3: dolu/null/UTC-no-shift) + liste `loadError`+banner+Yeniden-dene+empty-ayrı-dal+expected_date-helper (3) + new form `loadError`+`(!vRes.ok||!pRes.ok)`+banner+retry (2) + detay formatExpectedDate (1). Mevcut 6 PO test dosyası yeşil. tsc temiz · lint 0 · build OK (`ƒ Proxy`).
- **CANLI E2E — GÜVENLİ salt-okuma probe** (prod `ryvxpolvhvsycuqyphoa`, Playwright login→ssr-cookie, kendi dev server :3001). **MUTASYON YOK** — create/confirm/receive ASLA (confirm commitment seed'ler, receive `on_hand`+`inventory_movements` mutasyonu → prod veri geri alınamaz; öneriler'deki accept→undo gibi güvenli döngü yok): login→/dashboard · liste 200 + başlık "Satın Alma Siparişleri" görünür (login'e düşmedi) · `GET /api/purchase-orders` admin → **200, 0 kayıt** (prod boş — empty path doğal; detay+redaction probe atlandı) · new form 200 + başlık + **loadError banner YOK** (vendor/product yüklendi, happy path) → 🎉 **PROBE PASSED (7/7).** Hata-path (#1) yalnız offline vitest ile kanıtlanır (prod'da 500 zorlanamaz — danışman).
- **DURUM: COMMIT+PUSH EDİLDİ (`448c548` → main, Coolify deploy tetiklendi).** Değişen: `purchase/orders/page.tsx`, `[id]/page.tsx`, `new/page.tsx`, `purchase-orders-ui.test.ts` (genişletildi). Plan: `~/.claude/plans/stok-r-nler-sayfas-n-detayl-calm-charm.md` (PO 2.tur içeriğiyle güncel).

---

## Önceki — 2026-06-03 (**Paraşüt Sync sayfası — final ürün (kritik: kırık manuel sync + dürüst durum)**)

Kullanıcı "paraşüt sync sayfasını şimdi detaylı eksiksiz incele ÇOK KRİTİK çünkü muhasebeye fatura/e-fatura/irsaliye/tüm mali belgeler buradan gidiyor ultrathink" dedi. Kapsam: `/dashboard/parasut` (914 satır) + 9 API route + proxy middleware + servis imzaları. "Önce doğrula sonra düzelt" + danışman (tam transcript). **Kapsam sınırı (AÇIK):** bu tur = sync **sayfası** UI + endpoint kablolaması + durum göstergelerinin dürüstlüğü; **servis katmanı finansal doğruluğu** (fatura/e-belge/irsaliye/iskonto mutabakatı, `parasut-service.ts` 1626 satır) Faz 1-11 + çok sayıda Bulgular turunda denetlendi → bu turda KAPSAM DIŞI (kullanıcı servis re-audit isterse ayrı tur).
- **#1 (HIGH GERÇEK BUG) Kırık Manuel Sync:** `runSync` (+ 3 scope-kart "Sync Et") `POST /api/parasut/sync-all` çağırıyordu; ama `sync-all` `CRON_PATHS`'te (`proxy.ts:23`) → tarayıcıdan CRON_SECRET Bearer yok → `proxy.ts:129` dalı **401 "CRON_SECRET gerekli"** → sayfanın **ana eylemi tamamen çalışmıyordu** ("Sync başarısız" toast'ı her seferinde). M-3 review'da dokümante-edilip ertelenen bilinen bug; "final ürün" turunun tam hedefi. **Fix:** yeni **`POST /api/parasut/sync-pending`** (`requirePermission(manage_parasut)` → `serviceSyncAllPending()` → `{synced,failed,errors}`; per-order `/api/parasut/sync` paterninin toplu aynası). UI fetch hedefi `sync-all`→`sync-pending`. **`sync-all` route + CRON_PATHS + middleware güvenlik path'i DOKUNULMADI** (GitHub Actions cron Bearer ile kullanmaya devam).
- **#2 (MED YANILTICI) Sahte "Son sync" zamanı:** `page.tsx:102` `lastSyncTime` hardcoded `"17 Mar 2026 · 14:30"` (bağlantı kartı + 3 scope-kartında; finansal sayfada yanıltıcı). **Danışman uyarısı:** `logs[0]` filtreye bağlı (`logsParams` step/error/status taşır) → "status=error" seçilince son *hatayı* gösterirdi. **Filtresiz kaynak:** `stats/route.ts`'e `last_sync_at` (en yeni `integration_sync_logs.requested_at`, `order desc limit 1 maybeSingle`). UI `lastSyncTime = stats.last_sync_at ? formatDateTime(...) : "Henüz sync yapılmadı"`. Hardcoded başlangıç + `setLastSyncTime` hack kaldırıldı (sync sonrası `fetchAll` stats'ı tazeler).
- **#3 (MED SEMANTİK) Sahte ilerleme tiyatrosu:** `syncStepLabel` = "Cariler/Faturalar/**Ödemeler** sync ediliyor" (gerçek akış contact→product→shipment→invoice→edoc; **ödeme HİÇ sync edilmiyor**) + `setSyncProgress(20/50/80/100)` tek fetch etrafında senkron. → tek dürüst belirsiz "Senkronize ediliyor…" durumu; `syncStep`/`syncProgress`/`syncStepLabel` state kaldırıldı; bar syncing'de belirsiz (sahte yüzde yok), done'da dolu. "✓ Sync tamamlandı" korundu.
- **#4 (LOW TUTARLILIK) config RBAC paritesi:** `GET /api/parasut/config` kardeşlerinden (stats/logs/invoices hepsi `view_parasut` guard'lı) farklı guard'sızdı → `requirePermission(req, "view_parasut")` (demo branch guard ÖNCESİ korundu — demo enabled-only davranışı değişmez, `feedback_no_silent_deletes`).
- **#5 (LOW a11y):** hata-mesajı genişletme `<span onClick>` (`:867`) klavye erişilemezdi → `role="button"`+`tabIndex={0}`+`onKeyDown`(Enter/Space)+`aria-expanded`. 3 log filtre `<select>` → `aria-label`.
- **Kapsam dışı (bilinçli):** bağlantı "Bağlı" `config.enabled` (PARASUT_ENABLED) türevli; geçerli OAuth token olmasa da yeşil olabilir → altındaki "OAuth Token: Geçerli/Yok" satırı telafi ediyor; token'a göre gate'lemek mock/dev akışını bozar → bırakıldı. `sync-all`+CRON_PATHS+middleware güvenlik path'i dokunulmadı.
- **Test (+11, 4382→4393):** yeni `parasut-sync-pending-route.test.ts` (viewer→403 servis çağrılmaz / guard manage_parasut ile / admin→200+shape / throw→500) + `parasut-stats-route.test.ts` (last_sync_at gerçek + null) + yeni `parasut-sync-page.test.ts` (source-regex: sync-pending hedefi + sync-all yok / last_sync_at türevi + "17 Mar 2026" yok / dürüst progress / a11y). **Kırılan 3 mevcut test düzeltildi:** `parasut-disabled.test.ts` + `credentials-no-leak.test.ts` (config guard mock eklendi), `parasut-stats-faz11-bulgular.test.ts` (`integration_sync_logs` mock branch + 9. response + order/limit chain). tsc temiz · lint 0 · build OK (`ƒ /api/parasut/sync-pending` + `ƒ Proxy`).
- **CANLI E2E — GÜVENLİ probe** (prod `ryvxpolvhvsycuqyphoa`, ssr-cookie, kendi dev server :3100). **`PARASUT_ENABLED=` boş (doğrulandı) → `serviceSyncAllPending` `isParasutEnabled()` false'ta erken döner → SIFIR fatura/e-belge/irsaliye yan etkisi.** Çalışan sync geri alınamaz mali belge üretir → PARASUT ASLA enable edilmedi, gerçek sync ASLA tetiklenmedi, /api/seed ASLA: sayfa 200 · stats 200 + **last_sync_at GERÇEK değer `2026-05-26` (sahte "17 Mar 2026" DEĞİL)** · **POST /api/parasut/sync-pending → 200 (401 DEĞİL — kırık-buton fix CANLI KANIT)** · shape `{synced:0,failed:0,errors:[]}` · **sync-all hâlâ 401 (cron-only, regresyon yok)** → 🎉 **6/6 SMOKE PASSED.** Hiçbir mali belge oluşturulmadı.
- **DURUM: COMMIT+PUSH EDİLDİ (`ca34198` → main).** Değişen: `dashboard/parasut/page.tsx`, yeni `api/parasut/sync-pending/route.ts`, `api/parasut/stats/route.ts`, `api/parasut/config/route.ts`, +2 yeni test + 3 mevcut test düzeltme.

---

## Önceki — 2026-06-03 (**Satın Alma Siparişleri sayfası — final ürün (eksik kapatma + salt-okuma canlı E2E)**)

Kullanıcı "satın alma siparişleri sayfasını da aynı şekilde incele ultrathink" dedi (öneriler turunun paterni). Kapsam: `/dashboard/purchase/orders` liste + `[id]` detay + `new` form + `[id]/print` + 9 API route. "Önce doğrula sonra düzelt" + danışman (tam transcript). Sayfa ÇOK olgun (Faz 3-9 + Bulgular turları) → **güvenlik/veri-bütünlüğü bug'ı YOK** (CAS race guard `dbTransitionPurchaseOrder`, RPC guard'ları confirm/cancel/receive_po_lines, RBAC redaction, print veri-minimizasyonu hepsi sağlam). Bulgular polish seviyesinde — bu olgunlukta doğru okuma.
- **#1 (GERÇEK BUG) Liste hover DOM-mutation → hoveredId state:** `page.tsx:283-285` `<tr>` `e.currentTarget.style.background` doğrudan yazıyordu (orders/quotes/products migrasyonunu almamış). `hoveredId` state + `isHovered` koşullu background. Tek hedef (`<tr>`), `confirmDeleteId` tuzağı yok (toplu iptal = modal) → products'taki tuzak geçerli değil.
- **#2 (GERÇEK GAP) Validation parity:** `notes` (üst-seviye + `lines[].notes`) doğrulamasız DB'ye gidiyordu. `POST /api/purchase-orders` + `PATCH [id]` + `PUT [id]/lines` üçüne `validateStringLengths(body)` (safeParseJson HEMEN sonrası, vendor/currency/lines + RPC ÖNCESİ). Recursive → top-level + array-of-objects `lines[].notes` KAPSANIR (danışman doğruladı; öneriler'deki plain-nested-object durumundan farklı). Kardeş `from-recommendations` zaten taşıyordu (öneriler turu). Erken yerleştirme → canlı probe yazma yapmadan 400.
- **#3 (PARİTE) Toplu iptal seçimi:** select-all+satır checkbox `pageIds` (tüm satırlar) kullanıyordu; received/cancelled PO seçilince `handleBulkCancel` döngüsünde 409 → "{N} iptal edilemedi" gürültüsü. `isPoCancellable(po)` export (= `!["received","cancelled"].includes(status)`, detay `isCancelable` yüklemi) + `cancellablePageIds` → select-all (`disabled` boşsa) + satır checkbox koşullu render. Satış siparişleri `isOrderCancellable` paritesi birebir.
- **#4 (GERÇEK TUTARSIZLIK) Client/server fiyat:** `new/page.tsx:161` `handleSubmit` `price < 0` reddediyordu → `unit_price=0` client'tan geçiyor ama server `validatePoLines:216` `price <= 0` reddediyor (Faz 6 Kapanış kararı) → 0 fiyatlı satır formu temizleyip sunucuda kafa karıştırıcı 400. Client `<= 0`'a + mesaja hizalandı.
- **#5 (a11y) Dialog polish:** liste toplu-iptal modalı `role="dialog"` HİÇ taşımıyordu → `role/aria-modal/aria-labelledby="bulk-cancel-title"` + başlık `id`. Detay iptal modalı `role/aria-modal` vardı, `aria-labelledby="po-cancel-title"` + h2 `id` eklendi.
- **Kapsam dışı (bilinçli):** RBAC — tüm route guard'lı; `requireRole` (cancel=admin, receive=admin|purchaser) vs `requirePermission` ayrımı = B7 tasarımı (değiştirmek matrisi bozar). `window.location.href` satır nav = minör.
- **Test (+12, 4370→4382):** `purchase-orders-route.test.ts` (POST/PATCH/PUT-lines 10k+ notes→400 + servis ÇAĞRILMAZ + kısa→201) + `purchase-orders-ui.test.ts` (`isPoCancellable` pure helper davranışı + hover/cancellablePageIds/modal-a11y/fiyat `<=0` source-regex). tsc temiz · lint 0 · build OK (`ƒ Proxy`).
- **CANLI E2E — SALT-OKUMA + 400 probe** (prod `ryvxpolvhvsycuqyphoa`, kullanıcı kararı). **PO mutasyonu (oluştur/gönder/onayla/mal kabul) ASLA** — geri alınamaz kalıcı yan etki (po_number sayacı, junction, commitment, inventory_movements; öneriler'deki accept→undo gibi güvenli döngü yok). ssr-cookie tekniği (E2E_USER_* creds, kendi dev server :3100): sayfa 200 · liste 200 · **POST 10k+ üst-seviye notes→400 + nested lines[].notes→400 (yeni guard CANLI kanıt, DB write yok — validateStringLengths RPC öncesi tetikler) + currency=GBP→400** → 🎉 **5/5 SMOKE PASSED.** Hiçbir PO oluşturulmadı.
- **DURUM: çalışıldı, OFFLINE+CANLI yeşil; COMMIT/PUSH kullanıcı onayı bekliyor.** Değişen: `purchase/orders/page.tsx`, `[id]/page.tsx`, `new/page.tsx`, `api/purchase-orders/route.ts` + `[id]/route.ts` + `[id]/lines/route.ts`, +2 test dosyası genişletildi. Plan: `~/.claude/plans/stok-r-nler-sayfas-n-detayl-calm-charm.md` (PO içeriğiyle güncel).

---

## Önceki — 2026-06-02 (**Öneriler (Satın Alma Önerileri) sayfası — eksik kapatma + canlı E2E**)

Kullanıcı `/ultraplan` ile "öneriler sayfasını detaylı incele, e2e test et, eksik/semantik/frontend iyileştirmeleri, final ürün" dedi. Sayfa `/dashboard/purchase/suggested` (Sidebar "Öneriler"). 3 Explore agent + kod doğrulaması ("önce doğrula sonra düzelt"). Sayfa ZATEN çok olgun (G11 audit 12 tur + Sprint C, 30+ test dosyası) → gerçek liste kısa.
- **Çürütülen iddialar (ajan yanlış raporladı):** demo guard "eksik" (middleware `src/proxy.ts` demo+unauth POST/PATCH/DELETE 403'lüyor + client `isDemo` guard var), PurchaseOrderModal a11y "eksik" (`PurchaseOrderModal.tsx:244-246` role/aria-modal/aria-label zaten var), AIDetailDrawer a11y "eksik" (`:33,83-85` role/aria-modal/aria-label/Escape var), "parallel PATCH race (HIGH)" (DB-katmanı `VALID_STATUS_TRANSITIONS` + G11 12.tur `dbUpdateRecommendationMetadata` status-CAS guard'ı zaten serileştiriyor) — HEPSİ no-op.
- **#1 (GERÇEK GAP) Validation parity:** `PATCH /api/recommendations/[id]` `feedbackNote` (`:39,57-61`) + `POST /api/purchase-orders/from-recommendations` `notes`/`lines[].notes` (`:75,84`) doğrulamasız `dbUpdate`/servise gidiyordu → her ikisine body parse'tan sonra tek `validateStringLengths(body)` (standalone `@/lib/validation/string-lengths`'ten, mock-blast-radius dersi). Recursive → PO `lines[].notes` (array-of-objects) kapsanır; plain nested obj (editedMetadata.note) KAPSANMAZ = projenin paylaşılan helper davranışı, BİLİNÇLİ genişletilmedi (advisor: ürünler fix'ini birebir yansıt).
- **#2 (HARDENING) RBAC:** `GET /api/purchase/suggestions` kardeşleri `view_purchase_suggestions` isterken guard'sızdı; signature `GET()`→`GET(req)` + `requirePermission`. Route **orphan** (frontend fetch/cron/server-component yok; yalnız route + 1 passthrough test) → user-facing değil, defense-in-depth. SİLİNMEDİ (`feedback_no_silent_deletes`).
- **#3 (a11y):** arama input (`page.tsx:1536`) `aria-label="Ürün adı veya SKU'ya göre ara"`.
- **#4 (kozmetik):** 2× hardcoded `rgba(248,81,73,0.04)` (`:1625` mobil kart + `:1785` masaüstü satır) → yeni `var(--danger-bg-subtle)` (globals.css `:root`, görsel birebir).
- **Test (+11, 4359→4370):** `recommendations-validation-parity.test.ts` (7: PATCH feedbackNote 10k→400 dbUpdate çağrılmaz + kısa→200; POST notes/lines[].notes 10k→400 servis çağrılmaz + kısa→201; GET suggestions guard→403 servis çağrılmaz + null→200) + `purchase-suggested-ui-polish.test.ts` (4 source-regex: aria-label + rgba yok + var≥2 + globals var). tsc temiz · lint 0 · build OK (`ƒ Proxy`).
- **CANLI E2E smoke** (prod `ryvxpolvhvsycuqyphoa`, kullanıcı kararı=salt-okuma+accept→undo; /api/seed ASLA; PO OLUŞTURMAZ — kalıcı yan etki). ssr-cookie tekniği (npm run start localhost:3000): sayfa 200 · copilot 200 (4 öneri, ai_available true) · `GET /api/purchase/suggestions` admin→200 (yeni RBAC) · **PATCH feedbackNote 10k→400 + POST notes 10k→400 (yeni guard CANLI kanıt)** · accept→200→undo→200 status=suggested'a döndü → 🎉 **8/8 SMOKE PASSED**. Not: accept zararsız bir `ai_feedback` audit satırı bırakır (undo status'u geri alır; prod verisi bozulmaz).
- **DURUM: çalışıldı, OFFLINE+CANLI yeşil; COMMIT/PUSH kullanıcı onayı bekliyor.** Değişen: `api/recommendations/[id]/route.ts`, `api/purchase-orders/from-recommendations/route.ts`, `api/purchase/suggestions/route.ts`, `dashboard/purchase/suggested/page.tsx`, `globals.css`, +2 yeni test. Plan: `~/.claude/plans/oneriler-sayfasi-final-urun.md`.

---

## Önceki — 2026-06-02 (**Stok & Ürünler sayfası — eksik kapatma + canlı E2E**)

Kullanıcı "stok ürünler sayfasını detaylı incele, eksikleri/bugları kapat, canlı e2e test et" dedi. 3 Explore agent + doğrudan kod doğrulaması ("önce doğrula sonra düzelt"): agent'ların "8 UX bug + eksik enrichment" iddialarının ÇOĞU YANLIŞ çıktı (handleSave edit-mode'dan çıkıyor `:754`, kaydet loading var `:950`, create form resetleniyor `:511/:399`, POST enrichment tam `route.ts:150`, detay GET stockout/deadline UI'da kullanılmıyor → no-op). Sayfa olgun; **2 gerçek düzeltme:**
- **#1 (GERÇEK BUG) Liste hover DOM-mutation → hoveredId state:** `products/page.tsx:832` `<tr>` `onMouseEnter/Leave` doğrudan `td.style.background` yazıyordu (orders/quotes'ta zaten düzeltilen antipattern, ürünlerde atlanmış). `hoveredId` state + 7 td'ye koşullu `background: rowBg`. `confirmDeleteId` inline silme onayına DOKUNULMADI (mouse-leave confirm sıfırlamaz).
- **#2 (GERÇEK GAP) PATCH/POST validation parity:** `PATCH /api/products/[id]` HİÇ doğrulama yapmıyordu (POST'ta vardı); ek olarak POST negatifleri geçiriyordu. Yeni saf modül `src/lib/validation/product-input.ts` `validateProductInput(body, {requireCore})` — string uzunluğu + numeric `>MAX` **ve yeni `<0` guard** (8 numeric alan); POST `requireCore:true`, PATCH `false`. **Mock blast-radius çözümü:** helper'ı products.ts'e KOYMA (62 test onu mock'luyor → `undefined` patlardı); `validateStringLengths` de `src/lib/validation/string-lengths.ts`'e ayrıldı (api-error.ts re-export eder, request-ip precedent'i) — api-error mock'layan tek product-route testi (`product-delete-resolves-alerts`) kırılmasın.
- **#3 (NON-ISSUE doğrulandı):** detay 3 dialog ZATEN `role=dialog`+`aria-modal=true`+`aria-label` taşıyor; değişiklik gerekmedi (ilk grep `head` ile truncated'dı).
- **Test (+20):** `product-input-validation.test.ts` (15: pure + PATCH/POST route davranış), `products-list-hover.test.ts` (5: source-regex + DOM-mutation YOK regression). **4339→4359 yeşil · tsc temiz · lint 0 · build OK (`ƒ Proxy`).**
- **CANLI E2E (prod Supabase, ZZTEST prefix + temizlik; /api/seed ASLA):** Playwright `products.spec.ts` auth setup `@supabase/ssr` session-replay quirk'i yüzünden /login'e düşüyor (creds GEÇERLİ — auth 200; pre-existing env sorunu, kodla ilgisiz). Bunun yerine team'in "canlı E2E smoke" tekniği (gerçek session→ssr cookie→gerçek route'lar, dev server localhost:3000): GET list 200 (84 ürün, enriched) · POST create 201 · PATCH edit 200 (price 150 persisted) · **PATCH negatif fiyat→400 "Fiyat negatif olamaz." (YENİ guard canlı kanıt)** · PATCH 10k string→400 · POST negatif on_hand→400 · DELETE soft 200 · `/dashboard/products` authenticated 200. **🎉 SMOKE PASSED.** Temizlik: tek ZZTEST satırı soft-deleted (is_active=false, 0 aktif leftover; app zaten hard-delete YAPMAZ).
- **DURUM: çalışıldı, OFFLINE+CANLI yeşil; COMMIT/PUSH kullanıcı onayı bekliyor.** Değişen: `products/page.tsx`, `api/products/route.ts`, `api/products/[id]/route.ts`, `api-error.ts` (re-export), +2 yeni validation modülü, +2 yeni test. Plan: `~/.claude/plans/stok-r-nler-sayfas-n-detayl-calm-charm.md`.

---

## Önceki — 2026-06-02 (**Satış Siparişleri Faz 3 — HARD rezervasyonu "Bekliyor"a (pending_approval) taşı**)

Ürün sahibi kararı: rezervasyon onayda DEĞİL, **onaya gönderirken** olsun (müşteriye teklif → stok kilitle → aşırı-satış yok). **domain-rules §5.1 BİLİNÇLİ DEĞİŞTİ.** Yeni akış: Taslak → "Onaya Gönder" (confirm + HARD rezervasyon + shortage uyarısı, alt-not "Teklif yapıldı") → Bekliyor (fulfillment=allocated → "Rezerveli" otomatik) → "Onayla" (light, alt-not "Stok rezerve edildi") → Onaylı.
- **Migration 082** (`082_reservation_at_pending.sql`): `allocate_order_lines` helper (saf rezervasyon, statüye dokunmaz) + `submit_order_for_approval` (draft guard, zero-stock reddi, hedef pending_approval) + `approve_order` (light flip; legacy `fulfillment='unallocated'` pending → fallback allocation) + backfill DO-block (rezervsiz pending = ORD-0001/0002) + ROLLBACK. Eski `approve_order_with_allocation` health-check (route 138) için KORUNDU.
- **Çift sayma fix:** `dbGetQuotedQuantities` + `dbGetQuotedBreakdownByProduct` filtresi `['draft','pending_approval']`→`'draft'`. pending artık `reserved`'da; `quoted`=draft. Net `promisable=available_now-quoted` invariant korunur (kova değişir).
- **Servis:** `dbSubmitOrderForApproval` (yeni) + `dbApproveOrder`→`approve_order` RPC. order-service: pending dalı allocate+shortages döner, approved light. `dbUpdateOrderStatus`/`dbLogOrderAction` import'ları kaldırıldı (unused).
- **POST /api/orders:** pending istenince DRAFT oluştur→`serviceTransitionOrder(pending_approval)` allocate; shortages/`submitError` (zero-stock→draft kalır) yanıtta.
- **UI** (`[id]/page.tsx`): STATUS_META pending="Teklif yapıldı"; "Onaya Gönder"→`requestTransition` (confirm "stok kontrol+rezervasyon"); "Onayla" sade confirm; shortage dialog pending dalına; "Onayla" loading "Onaylanıyor...".
- **cancel_order/ship_order_full DEĞİŞMEDİ** (cancel pending rezervi release eder; ship `approved` guard korunur). Teklif accept order'ı zaten draft oluşturur (uyumlu).
- **Test 4334 yeşil:** DR-5.1 invariant TERSİNE (rezervasyon pending'de); db-quoted-quantities + quoted-breakdown mock `.in`→`.eq`; YENİ order-submit-allocation-migration (082 drift) + order-service pending describe + orders-route create-and-send. tsc temiz · lint 0 · build OK (`ƒ Proxy`).
- **Faz 3 Bulgular (082 harici riskler kapatıldı):** (1) **pending shortage uyarısı** — `dbGetOpenShortagesByProduct` + `dbGetOpenShortagesByProductId` filtresi `approved`→`['pending_approval','approved']` (shortage artık pending'de oluşuyor, order_shortage uyarısı + drawer onaya kadar görünmüyordu). (2) **create-and-send tek e-posta** — POST `order_new`'i başarılı onaya-gönderimde atlar (geçişin `order_pending`'i tek bildirim; draft/submit-fail'de order_new gönderilir). DEĞİŞTİRİLMEDİ (gerekçeli): partially_allocated sevk (by-design), 082 backfill FOR UPDATE (tek-sefer, güvenli). +db-open-shortages-status-filter testi + orders-route email dedup + products-shortages-helper `.in` fix. **4339 test · tsc · lint 0 · build OK.**
- **DURUM: COMMIT+PUSH EDİLDİ (`40731af` Faz 3 + `5b53bd1` bulgular → main). ✅ Migration 082 APPLY EDİLDİ + CANLI E2E SMOKE GEÇTİ:** admin SSR cookie ile gerçek route'lar — draft (rezervasyon yok) → Onaya Gönder (PATCH pending_approval: reserved 13→23, available 155→145, fulfillment=allocated) → Onayla (PATCH approved: reserved 23→23 DEĞİŞMEZ = çift rezerve YOK, light) → İptal (reserved 23→13 release) → kalıcı sil (reserved başlangıca döndü). 082 fonksiyonları canlıda mevcut (probe); **backfill çalıştı** (ORD-2026-0002 pending+allocated+açık rezervasyon; ORD-0001 aradan shipped olmuş → doğru atlandı). **+codex-experiment main ile güncellendi** (merge `670f07b`, çakışma yok — dosya kesişimi boş; tsc/lint/4365 test/build temiz; push edildi). HER ŞEY PUSH'LANDI + SENKRON. (082 backfill ORD-0001/0002'yi rezerve eder; eski kod hâlâ quoted=draft+pending sayarsa geçici çift-sayma penceresi). Plan: `~/.claude/plans/tingly-herding-pony.md`. Canlı DB-katmanı smoke (submit reserve / approve light / cancel release / backfill) 082 apply sonrası yapılacak.

---

## Önceki — 2026-06-02 (**Satış Siparişleri Faz 1+2 — migration 081 APPLY EDİLDİ ✅ + canlı doğrulama**)

Satış Siparişleri Faz 1 (bug fix: `?all=1` 50-cap, DOM-mutation hover→state, soft-DELETE=iptal dürüst sözcük) + Faz 2 (taslak düzenleme: migration **081 `update_order_with_lines`** RPC + `OrderForm` paylaşılan new/edit + `PUT /api/orders/[id]` + `/[id]/edit` sayfası) main'de (`e9c6ac6`, origin/main). **Bu oturum:** kullanıcı 081'i Supabase'de çalıştırdı; **canlı E2E smoke yapıldı** (admin oturum cookie'si `@supabase/ssr` formatında elle kuruldu — login→base64url session→chunked `sb-<ref>-auth-token`). Sıfır-mutasyon: PUT kimliksiz→401, demo→403, non-draft RPC→guard RAISE+rollback. **Tam happy-path E2E (gerçek route'lar):** POST taslak oluştur (ORD-2026-0009) → PUT düzenle (1→2 satır) → **total yeniden-hesap DOĞRU** (subtotal 8100/vat 1620/grand 9720, item_count 2, satırlar replace) → audit_log `order_lines_replaced` actor=user_id/source=ui → guard E2E (pending_approval'da PUT→409 "Yalnızca taslak") → temizlik (DELETE soft+permanent, sales_orders/order_lines/draft hepsi boş, test öncesi duruma dönüldü). Yan etki: ORD-2026-0009 numara sayacı tüketildi (sonraki gerçek sipariş 0010). **151 order testi yeşil · tsc temiz · lint 0.** Kullanıcı kararıyla ATLANAN (borç değil): sevk modalı + planned_shipment_date (B/C kapsamı). **Satış siparişleri sayfası: yapılması gerekenler tamam, hata yok.**

---

## Önceki — 2026-05-31 (**Teklif V7 Faz 8 Bulgular 1. tur — Paraşüt reconcile retry-bypass + doc/P3**, 2 commit, 4215 test)

"önce doğrula sonra düzelt" — 3 bulgu kod karşısında doğrulandı, üçü de geçerli.
- **P1/P2 (FİNANSAL, `f7fc9f8`):** Faz 8e reconciliation guard yalnız ana sync'teydi (`serviceSyncOrderToParasut`). Manuel invoice retry (`serviceRetryParasutStep`, step=invoice → `upsertInvoice` header iskontoyu `discount_value`'ya uygular) guard'sız claim alıp **sessiz yanlış fatura** üretebiliyordu — canlı ama `checkStepDeps("invoice")` shipment dep'i arkasında latent. **Fix (advisor):** `guardDiscountReconciliation` helper'ı çıkarıldı (inline blok birebir), her iki yolda claim ÖNCESİ; retry'da **`step==="invoice"` gating** (edoc'ta fatura zaten oluşmuş → strand etmemek için). upsertInvoice'a gömülmedi (throw kontratı korundu). Test: invoice retry mismatch/subtotal=0 → claim YOK + alert (`parasut_shipment_document_id` ile honest reachability), discount=0 → claim çağrılır.
- **P2 doc:** migration 080 APPLY EDİLDİ (kullanıcı onayı) → tüm "080 BEKLİYOR" referansları hizalandı.
- **P3 (kozmetik):** convert/route.ts stale yorum (serviceConvertQuoteToOrder 8b'de silindi) + quote-service.ts üst yorum "sent→accepted" düzeltildi + quotes-faz4-archive.test.ts stale `accepted` çağrısı → `rejected`.
- **4215 test · tsc temiz · lint 0 · build OK (`ƒ Proxy`).** Kullanıcı tarafı: manuel smoke (iskontolu sipariş invoice retry → uyuşursa fatura, bozuk→blok+alert).

---

## Önceki — 2026-05-31 (**RBAC Faz 4 TAMAMLANDI — quotes + PO redaction + archive gate**, commit `1db5865`, 4197 test)

Plan (role-based-access-plan.md) Faz 4'ün açık kalemleri kapatıldı. Önceki tur sadece products/customers/orders redакteliydi.
- `redact.ts` +4 fn: quotes (CAMELCASE — mapper'lı; grandTotal/subtotal/vatTotal/discountAmount+satır unitPrice/lineTotal ← `view_sales_prices`), PO (SNAKE_CASE raw row; subtotal/vat_total/grand_total+satır unit_price/line_total ← `view_purchase_costs`).
- Wiring: quotes+PO list/detail GET. quote **archive** (donmuş HTML PDF) → `view_sales_prices` yoksa tüm belgeye 403.
- Sınıf ayrımı: sales PO maliyeti GÖRMEZ / purchasing quote fiyatı GÖRMEZ. Sızıntı yüzeyi (advisor): preview=localStorage Mod A (yazarın taslağı), [id] inline PDF render ETMEZ → server-fetch saklı PDF yolu YOK.
- +23 test (redact unit camelCase+snake_case regresyon kilidi + route diskriminatif + archive gate). **tsc temiz · 4197 test · lint 0 · build OK (`ƒ Proxy`)**.
- **KALAN: Faz 6 (delete policy) + Faz 7 (dashboard maskeleme + null finansal `--`).** Detay: [[project_rbac]].

---

## Önceki — 2026-05-31 (**RBAC Faz 4 (R1-R5) MAIN'E MERGE + PUSH** — merge commit `234d8d9`, 4174 test, build OK)

**Rol bazlı erişim tamamlandı.** `worktree-rbac-foundation` (7 commit) güncel main'e merge edildi (foundation Faz 1+2+5 zaten main'deydi, merge-base `a0130de`).
- **R3 finansal redaction** (route seviyesi, snake_case): products `price`/`cost_price`, customers `total_revenue`, orders `grand_total`/`subtotal`/`vat_total`+satır fiyatları → yetkiye göre null. Per-request, cache key'e girmez.
- **R1** ~40 mutation `requirePermission` · **R2** vendors/PO/commitments/recommendations + parasut invoices/stats/logs GET · **R4/R5** fail-closed · product-types `requireRole(admin)`→`requirePermission(manage_product_types)`.
- **Çakışma:** 11 quotes dosyası main'in **Faz 8a** RBAC'ını korudu (DELETE→`delete_quotes`, `/convert`→410, `accepted`→410, sent→409). Faz 4 quotes guard'ları gereksizdi. `rbac-mutation-guards` convert testi 403→410. Branch+worktree temizlendi.
- **Bilinen kapsam:** quotes GET redaction YOK (`view_quotes` tam fiyat görür — Faz 4 bilinçli). **Faz 6 (delete policy) + Faz 7 (dashboard kart maskeleme) hâlâ ertelendi.** Detay: [[project_rbac]].
- tsc temiz · **4174 test** · lint 0 · build OK (`ƒ Proxy`).

---

## Önceki — 2026-05-31 (Teklif V7 **Faz 8 — Ertelenen Borçlar Kapanışı** — 5 alt-faz/5 commit, 4098 test, COMMIT+PUSH EDİLDİ · **migration 080 APPLY EDİLDİ ✅**)

**V7'nin tüm ertelenen borçları kapatıldı (5 bağımsız kalem, ayrı commit'ler). Kullanıcı kararları: Paraşüt orantılı / sig rename ATLA / drag-reorder ERTELE.**
- **8a (`4935e88`) Quotes RBAC:** yazma uçlarına guard (accept precedent'i) — POST/PATCH/revise → `manage_quotes`, DELETE → `delete_quotes`; GET'ler auth-only. quotes-rbac.test.ts (5) + 7 mevcut route testine role-guard mock (varsayılan izinli).
- **8b (`71a22cd`) Convert ölü kod temizliği:** `serviceConvertQuoteToOrder` + `ConvertResult` kaldırıldı (hiç çağrılmıyordu; yerini Faz 6 atomik accept aldı). `dbFindOrderByQuoteId` KORUNDU (route kullanıyor), `/convert` 410 stub KALDI. quote-convert-service.test.ts silindi.
- **8c (`034f8ea`) Quotes audit katmanı:** helper seviyesi (RPC değil — product-types paterni; advisor) — dbCreateQuote/dbUpdateQuote/dbCreateQuoteRevision → audit_log (quote_created/updated/revised, source ui, best-effort, actor'sız [codebase-tutarlı]). RPC repro riski elendi. quotes-audit.test.ts (3).
- **8d (`4218d3e`) order_line_description — Migration 080 (APPLY EDİLDİ ✅):** order_lines += description; accept RPC = 078 gövdesi BİREBİR + tek delta (qli.description taşı; master p.name KORUNDU). TS/mapper/order-detay-UI. order-line-description.test.ts (6: invariant koruması + delta + mapper).
- **8e (`4b9c938`) Paraşüt iskonto orantılı aktarım:** guard → reconciliation. `computeHeaderDiscountPct` (discount/subtotal*100) builder'da per-satır discount_value; `reconcileParasutDiscount` orantılı toplamı kendi kodumuzda kurup grand_total ile tolerans dahilinde karşılaştırır (mock net_total iskonto yok sayıyor). Tolerans aşımı/subtotal=0 → blok+alert (guard ruhu); uyuşursa fatura OLUŞUR. order_lines mutate edilmez. parasut-discount-guard FLIP (pure 6 + integration 4).
- **Doğrulama:** **4098→4098 (8e builder drift-guard +2)** (8b −22 convert-service +sonra net) · tsc temiz · npm run lint 0 · build OK (`ƒ /api/note-templates` + `ƒ Proxy`).
- **DURUM: 5 commit COMMIT+PUSH EDİLDİ · migration 080 APPLY EDİLDİ ✅ (kullanıcı, 2026-05-31).** Diğer 4 kalem migration'sız.
- **Kapsam dışı (kullanıcı kararı):** sig_* rename ATLA (kabul edilen isimlendirme); drag-reorder ERTELE. **V7 master-plan + tüm ertelenen borçlar TAMAMLANDI** (kalan: audit actor [trigger ayrı faz], GET view_quotes RBAC, Paraşüt Sandbox GATE — hiçbiri quotes modülü borcu değil).

---

## Önceki — 2026-05-31 (Teklif V7 **Faz 7 — Not Şablonları (note_templates)** + Bulgular 1.+2.tur — migration 079, 4098 test, COMMIT+PUSH EDİLDİ · **079 APPLY EDİLDİ ✅**)

**Bulgular 2. tur (P1 yok; 1 yeni P2 fix + 1 P3 fix + 3 zaten-düzeltilmiş doğrulama):**
- **#1 (YENİ P2 FIX) Unsaved draft restore'da not/teslimat/ödeme kaybı:** `autoSave` `teklif_v3` draft key'ine yalnız `{currency,rows,descDirty,discount}` yazıyordu; notes/delivery/payment sadece `teklif_v3_full`'da (preview için). Yeni teklif restore `teklif_v3` okuduğundan, şablonla eklenen (veya elle yazılan) metin kaydetmeden refresh/preview-dönüşünde kayboluyordu. **Fix:** `teklif_v3` payload'a `notes/deliveryMethod/paymentMethod` eklendi + restore bunları geri yükler (Faz 3 `discount` precedent'i). +2 drift-guard test; 3 mevcut regex (faz4b/faz3/faz4a) yeni payload'a göre güncellendi.
- **#2 (P3 FIX) Settings liste tüm body'yi basıyordu:** 5000 char'a kadar pre-wrap → uzun şart metni sayfayı şişiriyordu. **Fix:** `-webkit-line-clamp: 3` önizleme.
- **#3-#5 (ZATEN DÜZELTİLDİ — `0b9398c`):** Rapor P2 (DB hata→404), P3 (geçersiz ?kind→tüm liste), doc/plan drift'i tekrar gündeme getirdi; bunlar 1. turda zaten düzeltildi (maybeSingle satır 87/134/170, ?kind→400 satır 24, QUOTES_V2_PLAN final + SUPERSEDED). Kod karşısında doğrulandı, ek değişiklik yok. (Rapor `0b9398c` öncesi snapshot'a dayanıyordu.)
- **#6 (P3 no-op, tekrar)** `[id]` GET inactive: tüketici yok + hassas değil → bırakıldı (1. tur kararı).
- **Doğrulama:** **4096→4098** · tsc temiz · npm run lint 0 · build OK.

---

**Bulgular 1. tur (P1 yok; 2 fix + double-check):** **#1 (P2 FIX)** `dbGetNoteTemplate`+update/deactivate ön-okuma `.single()`→`.maybeSingle()`+`if(error)throw` (gerçek DB/RLS hatası artık 404 değil 500). **#2 (P3 FIX)** geçersiz `?kind=`→**400** (fail-closed; eskiden sessizce tüm liste). **#3 (no-op)** `[id]` GET inactive döndürüyor ama tüketici yok + hassas değil → bırakıldı. **#4 (ertelendi)** pasif görme/reaktivate UI yok (soft-delete DB'de korunur; PATCH is_active gelecek tur). **#5 (FIX)** doc/plan migration drift hizalandı (QUOTES_V2_PLAN final + historical bloklar SUPERSEDED). **4094→4096** · tsc/lint/build temiz.

---


**Faz 7 = V7 master-plan'ın SON fazı. Not şablonları CRUD + QuoteForm picker.**
- **080 KALICI DÜŞÜRÜLDÜ:** master-plan `079 → quote_line_items_sort_order (koşullu)` diyordu; doğrulandı ki `quote_line_items.position` zaten var (034:106), `quotes.ts:88` ona göre sıralıyor, accept RPC ona göre order'lıyor → yeni kolon koşulsuz gereksiz. Drag-reorder UX **ertelendi** (eklenirse `position` yeniden atama, şema değişikliği DEĞİL). → Faz 7 = **tek migration 079** (memory'deki "079-080" güncellendi: 080 yok).
- **Migration 079** (`079_note_templates.sql`, kullanıcı apply eder): `note_templates` tablosu (kind `notes|delivery|payment|general` CHECK + title/body non-empty + sort_order + is_active soft-delete) + RLS ENABLE + updated_at trigger + kind/sort_order partial index + **PMT standart seed** (deterministik UUID a-prefix band, ON CONFLICT DO NOTHING): delivery "İSTANBUL PMT DEPO TESLİMİ"/"EXWORKS…", payment "%50 AVANS %50 SEVK"/"%100 PEŞİN"/"30 GÜN VADELİ", notes geçerlilik/KDV/teslim metinleri.
- **TS/mapper:** `NoteTemplateKind`+`NoteTemplateRow` (database.types), `NoteTemplate` (mock-data), `mapNoteTemplate` (api-mappers).
- **Helper** `note-templates.ts`: dbList(kind/includeInactive)/dbGet/dbCreate/dbUpdate/dbDeactivate (soft-delete, hard-delete YOK) + isValidNoteTemplateKind + audit_log + validation (title 120 / body 5000 / sort_order int≥0).
- **Route** (erişim ayrımı LOAD-BEARING): `GET /api/note-templates` **requireRole YOK** (satış kullanıcısı picker'da okur) + `?kind=`; `POST/PATCH/DELETE` `requireRole(["admin"])`; DELETE soft-delete (404/409 zaten pasif).
- **Settings sayfası** `/dashboard/settings/note-templates`: kind filtre sekmeleri + liste + create/edit modal + pasifleştir confirm; demo guard + a11y; Sidebar "Not Şablonları" linki.
- **QuoteForm picker:** 3 textarea (Notlar/Teslimat/Ödeme) üstünde "+ Şablon ekle…" select; mount'ta `/api/note-templates` fetch (cancelled guard); `templatesForField` (kind+general filtre); `applyTemplateToField` (boş→doldur / dolu→append `\n`, sessiz üzerine-yazma YOK); readOnly'de picker gizli. Setter'lar zaten autoSave/savePreviewData dep array'inde → drift trap yok.
- **Test (+51):** migration drift-guard (8) + picker pure+wiring (12) + helper/validation/mapper (16) + route (15). **4043→4094** · tsc temiz · npm run lint 0 · build OK (`ƒ /api/note-templates` + `[id]` + settings sayfası + `ƒ Proxy`).
- **DURUM: COMMIT+PUSH EDİLDİ (3551302) · migration 079 APPLY EDİLDİ ✅.** Manuel smoke: admin Not Şablonları CRUD; seed görünür; teklif formunda 3 alan picker doğru kind filtreler (boş→doldur, dolu→append); non-draft picker kilitli; viewer POST→403.
- **V7 master-plan TAMAMLANDI** (Faz 1-7 + tüm Bulgular turları). Ertelenen borçlar: Paraşüt iskonto aktarım, order_line_description, serviceConvert temizlik, quotes audit katmanı (modül-geneli), drag-reorder UX.

---

## Önceki — 2026-05-31 (Teklif V7 **Faz 6 Bulgular 3. tur — 3 P3 bulgu** + 2. tur, 4043 test, COMMIT+PUSH EDİLDİ + 077/078 APPLY EDİLDİ ✅)

**3. tur (kullanıcı review, 3 P3 — convergence, hepsi kod karşısında doğrulandı):**
- **#1 (P3) Doc drift:** `9a57d66` push edildi (HEAD=origin/main) ama CLAUDE.md/current_focus/project_quotes hâlâ "COMMIT+PUSH BEKLİYOR" + 078 "APPLY BEKLİYOR" diyordu → tümü "EDİLDİ" olarak hizalandı (078 kullanıcı tarafından uygulandı).
- **#2 (P3) Archive route stale yorum:** `archive/route.ts:34` yorumu "recover/generate Faz 6'da gelecek" diyordu — Faz 6'da geldi (`serviceArchiveQuotePdf` tri-state ile self-heal eder). Davranış doğru, yorum güncellendi (lookup-only sözleşme gerekçesiyle).
- **#3 (P3, kullanıcı kararı: emoji kalsın) Order arşiv butonu emoji:** `📄 Belgeyi Aç →` — doğrulama emoji'nin proje-geneli konvansiyon olduğunu (`📄 Arşivlenmiş Teklif` kardeş buton, `📄 Yazdır/PDF`, `📦`/`↻`/`✦ AI`) + `lucide-react`'in 0 kullanımı (Tailwind/Framer gibi kurulu-ama-kullanılmaz) gösterdi → emoji konvansiyonla tutarlı, kod değişmez. **Kod değişimi yalnız #2 (yorum).**

---

## Önceki — 2026-05-31 (Teklif V7 **Faz 6 Bulgular 2. tur — 5 bulgu**, 4043 test, COMMIT+PUSH EDİLDİ `9a57d66` + 077/078 APPLY EDİLDİ ✅)

**"Önce doğrula sonra düzelt" — 5 bulgu (2×P2 + 1×P2/P3 + 2×P3), hepsi kod karşısında doğrulandı:**
- **#1 (P2) Arşiv create-race obje doğrulamadan başarı dönüyordu:** `serviceArchiveQuotePdf` create-catch'inde UNIQUE 23505 → re-read → satır görünce direkt success dönüyordu. Kazanan istek satırı insert edip henüz upload etmemiş/upload fail edip silmek üzere olabilir → accept arşivsiz/404'lü referansa kayar. **Fix:** catch'te satır + **OBJE present** birlikte doğrulanır; present değilse throw (accept 502→retry, self-heal). Yeniden ÜRETMEZ (kazananın satırı UNIQUE slot'u tutar → 23505 re-collide; advisor).
- **#2 (P2/P3) Accept storage belirsizliğinde fail-open'dı:** `dbArchiveObjectConfirmedMissing` list hatasında false dönüyordu (yıkma açısından doğru) ama existing-row path'te false→success → "arşiv varlığını doğrulayamadık ama sipariş açıyoruz". RPC'nin 23514 guard'ı arşiv SATIRINA bakar, OBJEYE erişemez → bu, "dosya gerçekten var mı" invariant'ının TEK uygulama noktası. **Karar (advisor: tek doğru cevap, AskUserQuestion yok): accept fail-closed.** Üç-durumlu `dbArchiveObjectStatus` (present|missing|unknown): present→ok, missing→sil+yeniden üret, **unknown→throw** (accept 502 retryable; send hook archiveWarning'e indirir non-fatal). Yıkma yalnız missing (sağlam arşiv korunur — advisor'ın önceki fail-safe kararı). `dbArchiveObjectConfirmedMissing` kaldırıldı (tri-state'e taşındı); `dbArchiveObjectExists` (GET route lenient) tri-state'ten türer.
- **#3 (P3) Order detail arşiv PDF linki yoktu:** `quotePdfArchiveId` mapper'da taşınıyor ama UI kullanmıyordu. **Fix:** `orders/[id]/page.tsx` `quotePdfArchiveId` varsa "Arşivlenmiş Teklif → 📄 Belgeyi Aç" butonu → `GET /api/quotes/{quoteId}/archive` signed URL → window.open (`handleViewArchive` reuse; demo OK read-only).
- **#4 (P3) Doc drift:** `dddb1f9` push edildi ama MEMORY.md/project_quotes.md/CLAUDE.md/current_focus.md:27 hâlâ "COMMIT+PUSH BEKLİYOR" + 4034 (gerçek 4040→şimdi 4043) diyordu → tümü hizalandı.
- **#5 (P3) Lint iddiası:** kullanıcı `b17181e`'de (lint fix `dddb1f9` ÖNCESİ) review yaptığı için orders sayfasında 3 set-state-in-effect görmüş. HEAD'de `npm run lint` = 0; `b17181e` kapanışındaki "31/0" o commit için dürüsttü. Kod değişmez (açıklama).
- **Test:** tri-state helper + create-race obje + unknown→throw (service+faz4-archive) + #3 UI regex. **4040 → 4043 yeşil** · tsc temiz · `npm run lint` 0 · build OK.
- **078 APPLY EDİLDİ ✅** (qty<=0 edge live'da kapalı).
- **DURUM: COMMIT+PUSH EDİLDİ (`9a57d66`).** Faz 6 yakınsadı. Faz 7 → 079-080.

---

## Lint sinyali düzeltmesi — 2026-05-31 (npm run lint artık güvenilir + 0 sorun)

- **Sorun:** `npm run lint` (`eslint .`) ~32.108 sorun üretiyordu; 32.077'si `.claude/worktrees/<x>/.next` (stale worktree build artifact'ı) kaynaklı sahte. Kök `.next/**` ignore yalnız kökü kapsıyordu. Gerçek `src` = 31.
- **Fix 1 (artifact noise):** `eslint.config.mjs` globalIgnores += `**/.next/**`, `.claude/**`, `.agents/**`, `skills/**` → `npm run lint` == `eslint src`.
- **Fix 2 (31 baseline, kullanıcı kararı: config justify+suppress → yeşil):** react-hooks@7.1.1 (React Compiler-era) `set-state-in-effect` (28) + `refs` (2) + `purity` (1) kuralları config'te `"off"` + gerekçe yorumu. Proje SWR/React Query KULLANMIYOR (CLAUDE.md) → mount-time fetch-in-effect bilinçli konvansiyon; react-doctor kardeş kural `no-fetch-in-effect` zaten suppress'liydi. ClassifierQueue.tsx'teki 2 artık-ölü `eslint-disable-next-line` direktifi temizlendi (gerekçe yorumu korundu).
- **Sonuç:** `npm run lint` **EXIT 0, 0 sorun.** tsc temiz · 4040 test · build OK. **Gelecek için:** `npm run lint` artık güvenilir tek sinyal; "eslint src 31/0 baseline" notu eskidi. Gerçek hook düzeltmeleri [[project_frontend_renewal]] planında.

---

## Son Tamamlanan İş — 2026-05-31 (Teklif V7 **Faz 6 Bulgular — 5 bulgu review tur**, 4034 test, COMMIT+PUSH EDİLDİ + migration 077 APPLY EDİLDİ ✅ / 078 APPLY BEKLİYOR)

**Faz 6 Bulgular ("önce doğrula sonra düzelt") — 5 bulgu (4×P2 + 1×P3), hepsi kod karşısında doğrulandı:**
- **#1 (P2) Phantom recover Faz 6'da kapanmamıştı:** Faz 4 GET route `dbArchiveObjectExists` ile graceful 404 dönüyordu, ama accept yolundaki `serviceArchiveQuotePdf` (line 137) yalnız DB satırına bakıp `existing` dönüyordu → phantom (satır var/obje yok) teklifte accept eksik-dosyalı arşive sipariş bağlıyordu. **Fix:** existing-row path'inde `dbArchiveObjectExists(existing.file_path)` doğrulaması; obje yoksa yeni `dbDeleteQuoteArchive(id, filePath)` (stale row sil, storage remove best-effort) → fall-through render+create (sent quote donmuş → HTML birebir). Hem send hem accept'i iyileştirir. Test: phantom → delete+regenerate.
- **#2 (P2) Sipariş detay finansal özet eksik:** `orders/[id]/page.tsx` "KDV (%20)" hardcoded + iskonto satırı yok; Faz 6 `order.discountAmount`/`vatRate` mapper'da hazırdı ama UI göstermiyordu. **Fix:** dinamik özet (IIFE) — Ara Toplam → İskonto (discountAmount>0) → KDV Matrahı → KDV (%{vatRate}) → Genel Toplam. Türk fatura standardı.
- **#3 (P2) Accept route RBAC'siz:** `POST /accept` yalnız auth user alıp servisi çağırıyordu; proxy sadece `/dashboard/**` page-gate yapar → viewer (view_quotes) API'ye POST atıp sipariş açabilirdi. **Fix:** `requirePermission(req, "manage_quotes")` (admin+sales var; viewer/accounting/production/purchasing → 403). Test mock blast-radius: requirePermission→null default + viewer 403.
- **#4 (P2/P3) RPC qty yalnız küsürat kontrolü + 23514 yanlış map:** RPC `quantity <> trunc` (yalnız küsürat) → legacy qty=0/negatif satır order_lines `check(quantity>0)` → 23514; service TÜM 23514'ü "arşiv bulunamadı" diye map ediyordu (23514 = jenerik check_violation). **Fix:** Migration 078 (CREATE OR REPLACE) qty check `<= 0 OR <> trunc` → 22003 "pozitif tam sayı"; service'ten 23514→archive map'i KALDIRILDI (kalan check ihlalleri dürüstçe 500'e throw; arşiv-yok RPC guard zaten yalnız bypass'ta tetiklenir).
- **#5 (P3) Memory drift:** "077 APPLY BEKLİYOR" → kullanıcı 077'yi uyguladı → "077 ✅ + 078 BEKLİYOR" hizalandı.
- **Test (+13):** phantom recover (service + faz4-archive + dbDeleteQuoteArchive helper 4) + order summary source-regex (2) + accept route 403 (1) + 078 migration drift-guard (4) + service 23514-throw/22003-msg güncel. **4021 → 4034 yeşil** · tsc temiz · build OK (`ƒ Proxy` + `/api/quotes/[id]/accept`) · eslint src 31/0.
- **⚠️ Deploy sırası:** 078 apply edilene kadar legacy qty<=0 satır eski RPC'de 23514 → artık unmapped → 500 (nice 422 yerine). Düşük risk (legacy data). 078'i bu deploy'la apply et.
- **DURUM: COMMIT+PUSH EDİLDİ (`b17181e`); 077 APPLY EDİLDİ ✅, 078 APPLY BEKLİYOR.** Faz 7 → migration 079-080 (note_templates; 078 bu fix'e gitti).

---

## Önceki — 2026-05-30 (Teklif V7 **Faz 6 — Accept → Sipariş (atomik)**, 4021 test, COMMIT+PUSH EDİLDİ + migration 077 APPLY EDİLDİ ✅)

**Faz 6 = V7 master-plan'ın son büyük halkası: kabul edilen teklifi TEK atomik işlemde taslak siparişe dönüştürmek (V5-A4 + V4-A8).** Eski iki adım (PATCH `transition:accepted` + POST `/convert`) birleştirildi; ikisi de **410 Gone**.

- **Migration 077** (`077_quotes_accept_order.sql`, kullanıcı apply eder): `sales_orders` += `discount_amount`/`vat_rate`/`source_quote_revision_no`/`quote_pdf_archive_id` (V7-A9). `accept_quote_and_create_order(p_quote_id, p_actor)` atomik RPC (V7-A1 SECURITY INVOKER): FOR UPDATE quote → idempotency (mevcut sipariş→`already:true`) → status guard `sent|accepted` (else 42501) → null product_id (23502) + küsürat qty (22003) pre-check → arşiv defansif `v_pdf NULL→23514` → order INSERT (**donmuş totaller kopyalanır**, recompute YOK — `sales_orders`'ta totals trigger'ı yok, doğrulandı; `LEFT JOIN customers` ile country/tax) → order_lines INSERT…SELECT `JOIN products` (V7-A8 master kimlik) + `v_quote.vat_rate` satır snapshot (V7-A3) → ROW_COUNT verify (mismatch→ROLLBACK, V7-A8) → `item_count=v_inserted` (V7-A10) → quote sent→accepted flip → audit_log (`quote_accepted_order_created`). REVOKE/GRANT service_role + idempotent + ROLLBACK.
- **Kritik karar (advisor + doğrulandı):** order totalleri quote'tan **birebir kopyalanır** (arşiv PDF ile bayt-bayt tutarlı; yeniden hesap yuvarlama drift'i getirir). Faz 3 iskonto-convert-bloğu KALKTI (sipariş artık `discount_amount` taşır).
- **TS/mapper (V7-A9):** `SalesOrderRow` +4 alan; `mapOrderDetail` map; `OrderDetail` interface UI alanları.
- **Service/route:** `dbAcceptQuoteAndCreateOrder` helper (RPC) + `serviceAcceptQuoteToOrder` (status guard → valid_until kontrolü → **V7-A5 arşiv recover/generate** `serviceArchiveQuotePdf` reuse [eksikse üret, throw→502] → RPC → hata kodu HTTP map: P0002→404/42501→409/23502,22003,23514→422) + `POST /api/quotes/[id]/accept`.
- **Deprecation (V4-A8):** PATCH `transition:accepted`→410; `/convert` route→410; `serviceTransitionQuote` `QuoteTransition` "accepted" çıkarıldı (`sent: ["rejected"]`); `serviceConvertQuoteToOrder` **silinmedi** (deprecate+korundu, JSDoc not).
- **Paraşüt iskonto guard (V7-A4, COUPLED):** `serviceSyncOrderToParasut` — `discount_amount>0` → `parasut_claim_sync` ÖNCESİ **early return** (throw değil, marker/lease/sync_log yazılmaz) + **ZORUNLU sync_issue alert** (entity=sales_order). İskonto aktarım yöntemi ayrı faz.
- **UI:** tek "Kabul Et ve Siparişe Dönüştür" butonu → `/accept`; `already`→mevcut order; legacy accepted+siparişsiz "Siparişe Dönüştür" de `/accept` (recover); Faz 3 iskonto-not kaldırıldı.
- **Test (+47 net):** migration drift-guard (~14) + service (sent/accepted/already/recover/archiveFailed/valid_until/RPC kodları) + route (status map + revalidateTag) + parasut-discount-guard (3) + order-mapper-faz6 + accept-ui source-regex; flip'ler: quote-convert-route→410, quote-service accepted-transition geçersiz, quotes-id-route transition:accepted→410, quotes-faz2-validation 'rejected' ile 409, quotes-faz3-discount UI-not kaldırıldı. **3974 → 4021 yeşil** · tsc temiz · build OK (`ƒ Proxy` + `/api/quotes/[id]/accept`) · eslint src 31/0.
- **DURUM: COMMIT+PUSH EDİLDİ (`d4988ca`); migration 077 APPLY EDİLDİ ✅.** (Bulgular turu yukarıda — 078 + 5 fix.)
- **Ertelenen (kayıt):** Paraşüt iskonto AKTARIM yöntemi (orantılı/ayrı satır) ayrı faz; `order_line_description`; `serviceConvertQuoteToOrder` tam temizlik; quotes audit katmanı (modül-geneli); RBAC accept route.

---

## Önceki — 2026-05-30 (Teklif V7 Faz 4 — Bulgular 4. review tur, COMMIT+PUSH `6c9c317` + migration 075/076 APPLY EDİLDİ ✅)

**4. review tur (Bulgular, "önce doğrula sonra düzelt") — 3 P3 bulgu; convergence (5→5→3→3-P3):**
- **P3-1 (doc-only) Stale status:** 3. tur (`da09dce`) push edildi + 075/076 APPLY EDİLDİ (kullanıcı), ama 4 doc hâlâ "COMMIT+PUSH BEKLİYOR / APPLY BEKLİYOR" diyordu → hizalandı.
- **P3-2 (orphan phantom — contained fix) Arşiv DB-satırı/dosya tutarlılığı:** `dbCreateQuoteArchive` insert-sonra-upload (concurrency için bilinçli — round-1 23505 re-read mantığı korunmalı, **reorder ETMEDİK**). Nadir crash/timeout penceresinde DB satırı var ama dosya yok ("phantom"). **Advisor düzeltmesi:** P2-B'den FARKLI — phantom **bugün kullanıcı-görünür** (archive butonu signed URL üretir, 404 storage'da window.open SONRASI patlar → kırık sekme; `handleViewArchive` graceful toast'ı KAPSAMAZ). **Contained fix:** yeni `dbArchiveObjectExists(filePath)` (storage `.list` + ad eşleşmesi) → archive GET route signed URL'den ÖNCE varlık kontrolü → phantom'da graceful 404 (UI info toast). Create-path/concurrency DOKUNULMADI. Kalıcı recover/generate (eksik dosyayı yeniden üret, **row-existence DEĞİL object-existence**) Faz 6'da.
- **P3-3 (kullanıcı kararı: caveat kabul) Logo byte-freeze:** arşiv logo URL'sini saklar, byte'ını gömmez; logo aynı path'e `upsert:true` → eski arşiv yeni logoyu gösterebilir. **AskUserQuestion → "caveat kabul"** (frozen-HTML pragmatik tercihiyle tutarlı; Google Fonts link'i de external; logo değişimi nadir). Kod değişmez. (base64-inline alternatifi reddedildi.)
- **Test:** dbArchiveObjectExists helper (4) + archive route phantom→404 (1) = +5. **3969 → 3974 yeşil** · tsc/build temiz · eslint src 31/0.

---

## Önceki — 2026-05-30 (Teklif V7 Faz 4 — Bulgular 3. review tur, COMMIT+PUSH `da09dce`)

**3. review tur (Bulgular, "önce doğrula sonra düzelt") — 3 bulgu; 1 gerçek regresyon, 1 doc-only, 1 kabul edilen boşluk:**
- **P2-A (regresyon — 2. turun yan etkisi) Toplu silme yanıltıcı UI temizliği:** sent draft-only kilidi sonrası, liste checkbox'ı hâlâ tüm statüleri seçiyordu + `handleBulkDelete` `succeeded>0` ise **tüm** seçili id'leri local state'ten düşürüyordu → 1 draft + 1 sent seçilince sent 409 alıyor ama UI ikisini de kaldırıyor (refresh'te geri gelir). **Fix (advisor: ikisi de):** (a) **load-bearing** — `pickSucceededIds(ids, results)` pure helper → yalnız fulfilled+`res.ok` id'ler düşürülür (sent 409 + network fail dahil tüm hata modları); (b) seçim yalnız silinebilir (draft) satırlarla sınırlı — per-row checkbox `{deletable && ...}`, select-all `deletablePageIds` (3 helper de; hepsi `length>0` guard'lı). Test: `pickSucceededIds` 5 davranış (1 ok+1 !ok→yalnız ok) + page source-regex.
- **P2-B (kabul edilen boşluk, BLOKLAMAZ) Faz 6 öncesi accepted arşivsiz kalabilir:** arşiv yalnız SEND'te üretilir; send fail (archiveWarning) + kullanıcı yine "Kabul Et" → accepted arşivsiz. **Karar: kabul + dokümante** (kod yorumu `quote-service.ts` accept gap + bu not). Accept'i bloklamak, "send'te arşiv non-blocking" kararı A ile asimetrik olur; gerçek çözüm = Faz 6 recover/generate (V7-A5 serviceArchiveQuotePdf reuse). Bugünkü etki sıfır (arşivi tüketen akış yok). **AskUserQuestion sorulmadı** (advisor: "yes" seçeneği önceki karar A ile çelişirdi).
- **P3 (doc-only) Stale "COMMIT+PUSH BEKLİYOR":** 2. tur push edilmişti (`bb3b3f2`) ama memory/CLAUDE.md "BEKLİYOR" diyordu → hizalandı.
- **Test:** pickSucceededIds (5) + selection-gating source-regex (4) = +9. **3960 → 3969 yeşil** · tsc/build temiz · eslint src 31/0.
- **Smoke (kullanıcı):** liste: sadece draft satırlarda checkbox; 1 draft+1 sent seçilemez (sent checkbox yok); çoklu draft sil → başarısız olan ekranda kalır.

---

## Önceki — 2026-05-30 (Teklif V7 Faz 4 — Bulgular 2. review tur, COMMIT+PUSH `bb3b3f2` + migration 075/076 APPLY BEKLİYOR)

**2. review tur (Bulgular, "önce doğrula sonra düzelt") — 5 bulgu doğrulandı; 2 ürün kararı (AskUserQuestion):**
- **B1 (P2) — Müşteri adresi resmi belgede yok:** `validateQuoteForSend` (quote-validation.ts:50) `customer_address`'i ZORUNLU tutar (gerekçe koddaki yorumda: "resmi PDF") ama `QuoteData`'da `custAddress` alanı YOKtu → arşiv + canlı önizleme + PDF müşteri bloğunda adres hiç görünmüyordu. **Kullanıcı kararı: EKLE.** **4 nokta** (advisor "drift trap" yakaladı — yalnız arşivi yamamak Faz 4a Review P3-A drift'ini geri getirirdi): `quote-types.ts QuoteData.custAddress` + `quote-document-helpers.ts BILINGUAL_LABELS.address` (Adres/Address) + `QuoteDocument` müşteri satırı `[L.address, data.custAddress]` (boş→render yok) + `quote-archive-html.ts buildQuoteDataFromDetail` (`detail.customerAddress`) + **`QuoteForm.tsx` autoSave + savePreviewData payload + her iki dep array** (canlı önizleme; state zaten vardı). Veri: `QuoteDetail.customerAddress` (mock-data.ts:246).
- **B2 (P2) — Sent silinebiliyor:** `canDeleteQuote` draft+sent (quote-display.ts:15) + DELETE route `["draft","sent"]` (route.ts:143); migration 075 arşiv FK `ON DELETE CASCADE` → sent silinince immutable arşiv metadata da düşer. **Kullanıcı kararı: SADECE DRAFT.** `canDeleteQuote`→`status==="draft"`; DELETE route→`!== "draft"` (409); sent-deletable regression testi (quotes-id-route.test.ts) tersine çevrildi (sent→409). **DOKUNULMADI:** `dbListExpiredQuotes` (`.in(["draft","sent"])`) — bu expiry akışı, silme değil.
- **B3 (P2/P3) — Yanıltıcı "otomatik denenecek":** archive GET route lookup-only (üretmez), gerçek recover yalnız Faz 6 accept'te (reject/expire'da hiç denenmez). page.tsx:122 toast → vaadi kaldırıldı: "Teklif gönderildi ancak arşiv oluşturulamadı."
- **B4 (P3) — Buton arşivsiz statüde 404:** CRON draft→expired yapabilir → hiç gönderilmemiş expired teklifin arşivi yok ama buton görünür. `handleViewArchive` 404'ü ZATEN graceful (info toast). Ucuz status-gate yok (`sentAt` QuoteDetail'a map'siz; sadece `parasutSentAt`). **Kod değişmez** — P3 kabul.
- **B5 (P3) — Doc test sayısı drift:** detay satırlar 3837→3880, üst 3951 → nihai **3960**'a hizalandı.
- **Test:** quote-archive-html custAddress builder/render (3) + quotes-faz4a-helper-mapper Bulgu 1 source-regex (4: QuoteData/BILINGUAL_LABELS/QuoteDocument satır/QuoteForm 4-nokta) + canDeleteQuote revised (1) + faz4 toast no-"otomatik denenecek" (1); sent-delete testi flip. **3951 → 3960 yeşil** · tsc/build temiz (`ƒ Proxy` + archive route) · eslint src 31/0.
- **Smoke (kullanıcı):** sent teklif arşivinde **Adres/Address satırı dolu**; canlı önizlemede adres görünür (drift yok); draft hariç Sil butonu yok (sent→409); arşiv fail→warning toast ("otomatik denenecek" YOK); eski adressiz teklif→arşivde Adres satırı yok.

---

## Önceki — 2026-05-30 (Teklif V7 Faz 4 — PDF Arşiv: dondurulmuş HTML snapshot + Bulgular 1. review tur, 3951 test, COMMIT+PUSH b8c1613 + migration 075/076 APPLY BEKLİYOR)

**1. review tur (Bulgular, "önce doğrula sonra düzelt") — 5 bulgu doğrulandı + düzeltildi:**
- **P1 Storage MIME:** upload `contentType: "text/html; charset=utf-8"` ⟂ bucket allowlist `['text/html']` → Supabase exact-match'te her upload fail + send hook yutar (sent ama arşivsiz). **Fix:** contentType → `"text/html"` (charset zaten `<meta charset>`'te). Test güncellendi.
- **P2 Send arşiv (sessiz yutma):** **Kullanıcı kararı A** — non-blocking AMA görünür: `QuoteTransitionResult.archiveWarning` flag → route sent response → UI **warning toast** ("gönderildi ancak arşiv oluşturulamadı"). serviceTransitionQuote catch'te `archiveWarning=true`. Faz 6 recover backstop korunur.
- **P2 Concurrency idempotency:** `serviceArchiveQuotePdf` create'i try/catch'e alındı → UNIQUE(23505) yarışında **re-read** (`dbGetQuoteArchive`); varsa idempotent `existing:true`, yoksa gerçek hata rethrow. Faz 6 recovery güvenli.
- **P2 Master plan drift:** `QUOTES_V2_PLAN.md` V7-A5 "Puppeteer/Docker chromium + binary PDF" → frozen-HTML mimarisine hizalandı (Faz 4 implement notu + Faz 6 `serviceArchiveQuotePdf` reuse).
- **P3 Commit hijyeni:** 8 yeni dosya untracked → explicit `git add` (straggler'lar hariç).
- **İyi bulunanlar (kullanıcı):** XSS temiz, route file_path/hash sızdırmıyor, server-renderable, totaller DB snapshot'tan, memory yakalanmış.
- **Test:** concurrency idempotent/rethrow (2) + archiveWarning (1 yeni + 1 güncel) + route/UI source-regex (2) + MIME assertion güncel. **3880 → 3951 yeşil** · tsc/build temiz · eslint src 31/0.

---

**Faz 4 = gönderilmiş (sent) teklifin immutable "kilitli arşivi".** Mimari karar (kullanıcı): **dondurulmuş HTML snapshot** (chromium/Puppeteer DEĞİL — Faz 6'nın derdi). Plan: `~/.claude/plans/clever-dancing-owl.md`.

- **Karar gerekçesi:** Send anında `QuoteDocument` server-side `renderToStaticMarkup` → self-contained statik HTML → 'quote-pdfs' bucket'a immutable `.html`. Görüntüleme = signed URL ile donmuş HTML (template sonradan değişse bile arşiv aynen kalır — drift'e bağışık). PDF = browser-print. Reddedilenler: binary PDF (Coolify imajına chromium ~300MB), JSON snapshot (template drift → zayıf immutability).
- **Phase 0 (BLOCKING, çözüldü):** `QuoteDocument`'ten `"use client"` KALDIRILDI — saf fonksiyon (hook/browser API yok). Sebep: Next App Router server graph'inde `"use client"` modülü client-reference proxy'ye çevrilir → `renderToStaticMarkup` boş çıktı verir (vitest direkt-import yeşil olurken prod boş = "testte geçer prod'da patlar"). Kaldırınca server'da gerçek render; client preview (Mod A) shared component'i sorunsuz import eder (tek template). `PAGE_CSS`/`PRINT_CSS` export edildi.
- **Build engeli (çözüldü):** Next App Router route graph'inde `react-dom/server` STATİK import'u Turbopack reddediyor → `renderQuoteArchiveHtml` async + **dinamik import** `await import("react-dom/server")` (statik analizi atlar). Servis `await renderQuoteArchiveHtml(data)`.
- **Migration 075 (APPLY BEKLİYOR):** `quote_pdf_archives` (quote_id FK cascade, revision_no, file_path, content_hash sha256, byte_size) + **UNIQUE(quote_id, revision_no)** (V3-A5 immutability backstop) + RLS service_role + idempotent + ROLLBACK.
- **Migration 076 (APPLY BEKLİYOR):** storage `quote-pdfs` **private** bucket (text/html, 5MB) + storage.objects service_role policy.
- **`src/lib/quote-archive-html.ts` (YENİ, 2 pure fn):** `buildQuoteDataFromDetail(detail, company?)` — DB QuoteDetail → QuoteData (server-side tek source; seller snapshot öncelikli, company_settings fallback; currency/status defansif map — bilinmeyen→TRY, revised→sent). `renderQuoteArchiveHtml(data)` (async) — renderToStaticMarkup + self-contained wrapper (`:root --font-doc-*` + Google Fonts link + PAGE_CSS). Renkler concrete hex (✅), uygulama tema var'ları sızmaz. **Self-containment sınırı (dürüst):** Google Fonts `<link>` view-time external bağımlılık — "tam offline" DEĞİL (kabul edildi).
- **`src/lib/supabase/quote-pdf-archives.ts` (YENİ):** dbGetQuoteArchive (eq+eq+maybeSingle) + dbCreateQuoteArchive (orphan-safe: insert→upload→fail'de row delete; path deterministik `quotes/{id}/r{rev}.html`) + dbGetArchiveSignedUrl. (mapQuoteArchive EKLENMEDİ — dead code olurdu; file_path sızıntısı route response testiyle kapatıldı.)
- **Servis (`serviceArchiveQuotePdf`, quote-service.ts):** revision_no oku → dbGetQuoteArchive VARSA idempotent (V3-A5, üretmez) → yoksa build+render+sha256+create. **Send hook:** `serviceTransitionQuote` sent geçişi SONRASI çağrılır, **NON-FATAL** (try/catch+log) — arşiv fail'i send'i bozmaz, Faz 6 accept recover/generate telafi eder.
- **`GET /api/quotes/[id]/archive` (YENİ):** lookup-only (üretmez); arşiv var→200 {url, expires_in, revision_no}; yok/teklif yok→404. **file_path/content_hash SIZDIRMAZ** (test'le kilitli). Demo GET izinli.
- **UI ([id]/page.tsx):** status≠draft → "📄 Arşivlenmiş Teklif" butonu (handleViewArchive fetch→window.open; 404→info toast). V2-5 Mod B. (Preview Mod A değişmedi.)
- **V3-B6:** QuoteDocument satır fiyat/toplam — `isRealRow` gate'i (içerikli satırda 0 fiyat "0,00", boş filler "—").
- **Logo faithfulness (advisor):** `logo_url` = company-assets **public** bucket getPublicUrl → tam public absolute URL → donmuş arşivde `<img>` standalone çalışır (faithful). Minör caveat: aynı path'e logo re-upload eski arşivlerin logosunu değiştirir (nadir).
- **Test (+43):** quote-archive-html (13: builder + render/self-containment + Phase 0 gerçek render + V3-B6) + quote-pdf-archives (10: helper orphan-safe/signed) + quotes-faz4-archive (21: service idempotent/notFound/revizyon + send hook non-fatal + route 200/404/no-leak + migration 075/076 + UI source-regex + Phase 0 lock). **3837 → 3880 yeşil** · tsc temiz · build OK (`ƒ Proxy` + archive route) · lint 32 baseline/0 warning (`eslint src`; bare `eslint` .next artefaktı tarar).
- **DURUM: COMMIT+PUSH EDİLDİ** (`b8c1613` → main; Faz 4 + Bulgular review pass tek commit; React Doctor pre-commit advisory bloklamadı) **+ migration 075/076 APPLY BEKLİYOR.** **Sıradaki — kullanıcı:** commit+push + Supabase'de 075/076 apply + **manuel smoke (load-bearing gate, build/test kapsamı DIŞI):** teklif gönder→detay "Arşivlenmiş Teklif"→signed URL yeni sekmede donmuş HTML **inline render eder** (download DEĞİL — Supabase Content-Disposition kontrolü) + renkler/fontlar/logo doğru + A4 yazdırılır; template sonradan değişse arşiv aynen (drift); tekrar gönder/revize→ikinci arşiv yok (idempotent)/revizyon ayrı; draft→buton yok/route 404. Sonra: Faz 6 (accept→sipariş, 077).

## Önceki — 2026-05-30 (Teklif V7 Revizyon Zinciri — Faz 5'ten ertelenen, 3837 test, COMMIT+PUSH 1d96211 + migration 074 APPLY EDİLDİ + review pass)

**Review pass (074 apply sonrası, Bulgular 4 madde, "önce doğrula sonra düzelt"):** Hepsi kod karşısında doğrulandı; kod/migration/test DEĞİŞMEDİ.
- **P1 (074 düzeltilmiş hali DB'de mi):** 074 `create or replace function` + `add column if not exists` + constraint DO-block → idempotent; orijinal 074 DB'ye HİÇ girmemişti (atomik-consume fix yerinde yapıldı) → kullanıcının apply ettiği dosya zaten düzeltilmiş gövde. Patch migration GEREKMEZ. DB onayı: `\df+ create_quote_revision` → atomik consume `update ... returning * into v_src` + INVOKER.
- **P2 (audit):** Doğrulandı — 069/071/074'te sıfır `audit_log`; convert/create/update RPC'leri de yazmıyor → **modül-geneli mevcut borç**, revizyona özel regresyon değil. **Kullanıcı kararı: kabul + dokümante** (sadece revizyona eklemek yarım/tutarsız iz olur) → "quotes audit katmanı" gelecek faz (create+update+convert+revise birden). Bkz. project_quotes.md.
- **P2 (RBAC):** Doğrulandı — hiçbir quotes route `requireRole` kullanmıyor; revise route convert'in birebir aynası (ikisi de proxy.ts auth+demo ile korunuyor) → tutarlı pattern. RBAC merge'de `POST /api/quotes/[id]/revise` permission matrix'e eklenecek. Bkz. project_rbac.md.
- **P3 (memory drift):** 073+074 (ve 072) artık APPLY EDİLDİ; CLAUDE.md/current_focus/MEMORY.md/QUOTES_V2_PLAN.md hizalandı (kod commit `1d96211`; bu doc hijyeni commit'i **`70c4a12`** → main). RBAC stragglers (MEMORY.md project_rbac ref + project_rbac.md) bilinçli hariç tutuldu — RBAC branch merge'ine ait.

**Revizyon zinciri: sent/rejected/expired teklifin düzenlenebilir kopyası.** Plan: `~/.claude/plans/clever-dancing-owl.md`.

- **Kullanıcı kararları:** revize edilebilir = **sent+rejected+expired**; kaynak → yeni **`revised`** status (terminal, kilitli, rozet); numara = **kök + suffix** (`TKL-2026-001`→`-R2`/`-R3`); revizyon **`valid_until=NULL`** (advisor blocker: expired kaynağın geçmiş tarihi yeni draft'ı CRON'da re-expire eder + mid-edit 409 → NULL = expiry dışı).
- **Tasarım:** V2 root_quote_id **flat chain** (tüm revizyonlar köke; original NULL+revision_no=1). `create_quote_revision(p_source_id)` RPC (074, atomik, V7-A1 INVOKER): kök `FOR UPDATE` → status guard 42501 → `revision_no=chain max+1` → suffix `-R{n}` → tüm header (discount_amount dahil)+satır kopya → kaynak `revised`. quote_number UNIQUE backstop.
- **Migration 074 (APPLY EDİLDİ):** revision_no(default 1)/root_quote_id(FK on delete set null, idx_quotes_root) + status CHECK `+revised` (034 deseni drop+add, idempotent) + create_quote_revision RPC. valid_until=NULL + current_date hardcoded.
- **Review P1 fix (atomik consume):** İlk versiyon kaynağı kilitsiz SELECT+guard ile okuyup sonda flip ediyordu → aynı kaynağa iki eşzamanlı revize ikisi de eligibility'i geçip ÇİFT revizyon üretebiliyordu (kök kilidi yalnız revision_no'yu serialize ediyordu). Fix: kaynak **atomik consume** — `update quotes set status='revised' where id=p_source_id and status in (...) returning * into v_src`; 0 satır → varlık kontrolü → 42501/P0002. İkinci eşzamanlı istek aynı satırda bloklanır, commit sonrası status='revised' → WHERE eşleşmez → 42501. Sondaki ayrı flip kaldırıldı. 074 apply EDİLMEDİĞİ için yerinde düzeltildi (yeni migration yok).
- **Service:** `serviceCreateQuoteRevision` (quote-service.ts) — RPC code 42501→invalidStatus, P0002→notFound, başka→throw. `dbCreateQuoteRevision` + `dbListQuoteChain` (quotes.ts, .or(id.eq/root_quote_id.eq) order revision_no).
- **Route:** `POST /api/quotes/[id]/revise` (convert mirror) → notFound?404:invalidStatus?409:201 {newQuoteId,newQuoteNumber}.
- **GET enrichment ([id]/route.ts):** revisedBy (status=revised → zincirin en yenisi, "en güncele git" UX — süperseden değil) + revisionOf (revision_no>1 → kök) via dbListQuoteChain. QuoteDetailWithConversion'a QuoteChainRef alanları.
- **UI ([id]/page.tsx):** `getQuoteReviseEligible(status)` (sent/rejected/expired) → "Revize Et" butonu (secondary) → confirm action "revise_quote" → handleRevise → router.push(newQuoteId). revisedBy rozeti (warning, →en yeni) + revisionOf rozeti (accent, →kök). quote state QuoteDetailWithConversion'a çevrildi. **Review P3 UI hardening:** `anyMutating = loading!==null || converting || revising` → 3 buton grubu (transition/convert/revise) hepsi `disabled={isDemo || anyMutating}` (eşzamanlı çift mutasyon kafa karışıklığı önlendi).
- **TS:** `QuoteStatus += "revised"` → **tsc touch-point'leri ortaya çıkardı:** QuoteSummary.status inline union (mock-data) → `QuoteStatus` tipine çevrildi (circular yok, type import); detail/list quoteStatusConfig Record + FilterTab + QUOTE_TRANSITIONS `revised:[]`. QuoteRow += revision_no/root_quote_id; QuoteDetail+mapper revisionNo/rootQuoteId. STATUS_META+tab "Revize Edildi". isQuoteEditable/canDeleteQuote/dbListExpiredQuotes → revised doğal kilitli/expiry-dışı (değişmedi).
- **Bilinen sınırlama:** tek revizyon R2 silinirse kök revised dead-end (nadir, kabul); revisedBy=en-yeni (bilinçli).
- **Test:** `quotes-revision.test.ts` (13: service RPC mock + migration 074 drift-guard + UI source-regex + **071 omission regression** — advisor: revizyon draft edit→save 071 UPDATE üzerinden geçer, revision_no/root_quote_id o kolon listesinde OLMAMALI [omission koruması, yazılırsa meta sessizce ezilir]) + `quotes-revise-route.test.ts` (3: route 201/409/404). vi.mock global olduğu için route ayrı dosyada (aynı dosyada gerçek+mock service çakışır). **3821 → 3837 yeşil** · tsc temiz · build OK (`ƒ Proxy`) · lint 32 baseline / 0 warning.
- **Numbering:** revizyon=074 → Faz 4 PDF=075-076, Faz 6=077, Faz 7=078-079. QUOTES_V2_PLAN.md hizalandı.
- **DURUM: COMMIT+PUSH EDİLDİ** (`cb061c8` ilk + **`1d96211` review fix** [P1 atomik consume + P3 UI hardening + doc hizalama] → main) **+ migration 074 (DÜZELTİLMİŞ hali) APPLY EDİLDİ + review pass doc hijyeni.** **Sıradaki:** manuel smoke (sent→Revize Et→TKL-2026-001-R2 draft valid_until boş; kaynak Revize Edildi+rozet; **R2 edit→kaydet→reload revision_no/root korunur+rozet çözülür** [advisor]; expired→revize→CRON expire ETMEZ; R2→R3=`-R3` kökten taban; draft/accepted buton YOK; **aynı kaynağa hızlı çift-tık/eşzamanlı revize → tek revizyon + ikincisi 42501** [P1 atomik consume]) + Faz 4 (075-076 PDF arşiv).

## Önceki — 2026-05-30 (Teklif V7 Faz 5 infra dilim — numara katmanı, 3821 test, COMMIT+PUSH 942ee0d + migration 073 APPLY EDİLDİ)

**Faz 5 = infra dilim (kullanıcı kararı): numara katmanı (yıllık reset + configurable prefix).** Revizyon zinciri + sig rename + status CHECK ERTELENDİ. Plan: `~/.claude/plans/clever-dancing-owl.md`.

- **Kapsam kararları:** (1) revizyon zinciri (root_quote_id/revision_no/`create_quote_revision` RPC+UI+revize status'u) → kendi plan oturumu (büyük + master-plan'da detay yok). (2) sig_* rename (sig_prepared→prepared_by_name) → ERTELENDİ (19 dosya/73 occ, 5 RPC rewrite, kozmetik). (3) status CHECK → no-op (034:91 zaten 5 değer; yeni status yalnız revizyonda).
- **Problem:** `next_quote_number()` (034:14) global `quotes_number_seq` → `TKL-YYYY-NNN` ama NNN yılbaşında sıfırlanmıyor (yıl kozmetik latent bug).
- **Migration 073 (YENİ, APPLY EDİLDİ):** (a) company_settings += `quote_number_prefix`('TKL')/`quote_number_separator`('-'), mevcut singleton default alır → davranış korunur; (b) `quote_yearly_counters(year int pk, last_seq int)` + RLS service_role policy; (c) backfill — **034:73-78 defansif precedent mirror** (`where quote_number ~ '^TKL-\d{4}-\d+$'`, gömülü-yıl `split_part(,2)` group, trailing seq `split_part(,3)`, `on conflict greatest`); (d) `next_quote_number()` rewrite (atomik `insert...on conflict(year) do update last_seq+1 returning` + prefix/sep company_settings'ten `coalesce(nullif(...),'TKL'/'-')`). Signature `() returns text` KORUNDU. V7-A1 SECURITY DEFINER YOK. quotes_number_seq DROP edilmedi (rollback güvenliği). Idempotent (add column/create table if not exists, policy duplicate_object guard).
- **Backfill güvenlik temeli (advisor):** `quote_number` zaten UNIQUE (012:9 + idx_quotes_number) → miscompute sessiz duplicate DEĞİL; next_quote_number mevcut numara üretirse create INSERT gürültülü UNIQUE violation (recoverable). Gömülü-yıl gruplama (created_at değil) çünkü next_quote_number now() yılını gömer → collision uzayı gömülü-yıl.
- **Frontend etkisi YOK:** quote_number server-üretimli read-only; split/slice parser yok; `dbFindQuoteByNumber` (quotes.ts:162) `.eq()` equality. `CompanySettingsRow` (database.types:707) += `quote_number_prefix`/`quote_number_separator` (DB senkron; düzenleme UI ertelendi — admin SQL). purchase-order-document.test fixture'a 2 alan eklendi (tsc). **Bilinen sınırlama:** tek separator çift görev (`pfx∥sep∥yıl∥sep∥seq`).
- **Test:** `quotes-faz5-numbering.test.ts` (6 source-regex) — **DRİFT-GUARD, correctness DEĞİL** (numara DB-side; "6 test geçti = numara çalışıyor" DENMEZ; gerçek doğrulama manuel smoke). **3815 → 3821 yeşil** · tsc temiz · build OK (`ƒ Proxy`) · lint 32 baseline / 0 warning.
- **DURUM: COMMIT+PUSH EDİLDİ** (`942ee0d` → main, `11c5079..942ee0d`, 073 dahil 8 dosya, Coolify redeploy) **+ migration 073 APPLY EDİLDİ.** (Sıradaki o tarihte: revizyon zinciri → 074 ile tamamlandı.)

## Önceki — 2026-05-29 (Teklif V7 Faz 3 REVIEW DÜZELTMELERİ — Bulgular P1-P3, 2 tur, 3815 test, COMMIT+PUSH 6366cbd+11c5079 + migration 070-072 APPLY EDİLDİ)

**Round 1 (5 bulgu) + Round 2 (4 bulgu) kod karşısında doğrulandı + kapatıldı** (önce doğrula sonra düzelt). Plan: `~/.claude/plans/clever-dancing-owl.md`.

**Round 2 (commit öncesi, 4 bulgu):**
- **P2 (072 untracked):** migration git'te untracked → commit'te explicit `git add` zorunlu (yoksa CI'da test+CHECK ship olmaz). Commit adımında `git status` ile 072 staged doğrulanacak.
- **P2 (validateDiscount non-finite):** `NaN`/`"abc"`/`Infinity` helper'dan geçip RPC numeric cast'inde 500'e düşüyordu (`NaN<0`=false, `NaN>subtotal`=false → null). Fix: `Number.isFinite` guard (disc + subtotal) → 422. **Round2b (advisor):** ilk fix `""`→201 testi mock-masked'di — route `body`'ye hâlâ `""` gidiyordu, gerçek RPC `(''::numeric)`→500. Düzeltme: route'lar validasyon sonrası `body.discount_amount = Number(...)` ile payload'ı **normalize eder** (`""`→0, `"100"`→100); test artık geçen değerin `number 0` olduğunu assert eder (mock-masked değil). `"abc"`→422 (dbCreate çağrılmaz). 071 NULLIF'siz olduğu için RPC değil route normalize çözümü (072 zaten apply bekliyor, 071 apply edildi).
- **P3 (072 idempotent):** plain `add constraint` → `pg_constraint where conname='quotes_discount_nonneg'` guard'lı DO block → Supabase manuel double-apply patlamaz.
- **P3 (UI mesaj):** "İskontoyu kaldırırsanız dönüştürebilirsiniz" kaldırıldı (`isQuoteEditable("accepted")===false`, imkânsız aksiyon) → sade "sonraki fazda gelecek".
- **Round2 test:** validateDiscount NaN/Infinity pure + POST/PATCH `"abc"`→422 + `""`→201 + 072 pg_constraint guard regex + mesaj negatif regex. **3812 → 3815 yeşil** · tsc temiz · build OK · lint 32 baseline.

**Round 1 (5 bulgu):**

- **P1 (kritik, finansal):** `serviceConvertQuoteToOrder` (`quote-service.ts:193-195`) order toplamını subtotal+vat ile hesaplayıp `quote.discount_amount`'ı yok sayıyordu → iskontolu accepted teklif siparişe dönüşünce iskonto kaybolup grand_total quote'tan **yüksek** oluyordu. **Kısıt:** `sales_orders`/`CreateOrderInput`'ta header iskonto kolonu YOK (Faz 6/075) → "koru" imkânsız. **Karar: BLOCK** — `Number(quote.discount_amount) > 0` ise convert engellenir (already-converted kontrolünden sonra, clear error). Convert route mevcut generic→400 yoluna düşer (flag yok). UI `[id]/page.tsx`: iskontolu accepted → "Siparişe Dönüştür" butonu yerine not (`quote.discountAmount > 0` vs `<= 0` ayrımı). Faz 6'da kalkar. +2 test (T01b block, T01c regression).
- **P2 (bütünlük):** UI clamp bypass edilebiliyordu (POST/PATCH/RPC negatif/subtotal-üstü yazabilir). Yeni pure `validateDiscount(discountAmount, subtotal)` (quote-validation.ts) — negatif → "İskonto negatif olamaz"; subtotal-üstü → "İskonto ara toplamı aşamaz"; sınır (disc==subtotal) dahil OK. POST (`route.ts`) + PATCH document-update (`[id]/route.ts`) → **422** (qty validator yanına; PATCH'te `Number(body.x)` cast). **Migration 072** (YENİ `072_quotes_discount_check.sql`): `alter table quotes add constraint quotes_discount_nonneg check (discount_amount >= 0)` (belt-and-suspenders; `<= subtotal` DB'de DEĞİL, route kuralı — subtotal override esnekliği). **APPLY EDİLDİ.**
- **P2/P3:** autosave `teklif_v3` payload (`:470`) `{currency, rows, descDirty}` → `discount` eklendi; restore (`:269`) `if (typeof saved.discount === "number") setDiscount(...)`. Kaydetmeden refresh'te iskonto artık korunur. (autoSave dep'inde discount zaten vardı.)
- **P3 (TR parse):** 4 toplam input (sub/vat/grand/discount) onFocus'ta `${sym} ${fmt(eff*)}` formatlı değeri koyuyordu → parser `replace(",",".")` binlik `.`'i decimal sanıp `1.234,56`→`1.234` okuyordu. **Fix: onFocus'ta ham sayı `String(Math.round(eff*100)/100)`** → binlik ayraç edit buffer'ına hiç girmez (parse fix) + hesaplanan vat/grand'da uzun ondalık (246.912) görünmez (advisor notu). Blur'da yine `fmt` formatlı. Parser (onChange) değişmedi.
- **P3 (doc):** memory "lint 3 baseline error" yanlıştı (o QuoteForm dosya-bazlıydı) → **repo geneli `npm run lint` = 32 error / 0 warning** (React Hooks set-state-in-effect/exhaustive-deps, eslint-disable'lı). Bu turda yeni hata YOK (eklenenler validator/helper, hook değil).
- **Numbering kayması:** 072 bu turda iskonto CHECK aldı → **Faz 5 = 073** (status CHECK/revision/prefix), downstream 074-078. **QUOTES_V2_PLAN.md "Migration Sırası" bu turda hizalandı** (072=iskonto CHECK, Faz5→073, Faz4→074-075, Faz6→076, Faz7→077-078) → V7-A6 Faz 5 başında master plan tutarlı.
- **Test (round1):** `quotes-faz3-discount` +13 + `quote-convert-service` +2 + faz4b payload regex. (Round2 ekleri yukarıda.) **3799 → 3815 (round2 dahil) yeşil.**
- **DURUM: COMMIT+PUSH EDİLDİ** (`6366cbd` → main, `b44ba39..6366cbd`, 15 dosya/072 dahil, Coolify redeploy) **+ migration 070-072 APPLY EDİLDİ** (round1+round2 tek commit'te; round1 hiç commit edilmemişti). (Sıradaki o tarihte: Faz 5 (073) → tamamlandı.)

## Önceki — 2026-05-29 (Teklif V7 Faz 3 IMPLEMENT EDİLDİ — header iskonto, 3799 test, COMMIT+PUSH c5d8267 + migration APPLY EDİLDİ)

**Faz 3 = header iskonto (`discount_amount`).** Türk fatura standardı: Ara Toplam → İskonto → KDV Matrahı (subtotal − discount) → KDV → Genel Toplam (iskonto **KDV ÖNCESİ** — kullanıcı seçimi değil, standart). Plan: `~/.claude/plans/clever-dancing-owl.md`.

- **Kullanıcı kararı:** kapsam **yalnız iskonto**. `company_settings.default_vat_rate` bu fazdan ÇIKARILDI (iskontodan bağımsız + form KDV select sabit 0/10/20 → configurable default friction; ayrı "ayarlar" fazına ertelendi). Migration 070 = sadece `quotes.discount_amount`. Master-plan 070 satırı buna göre hizalanmalı (QUOTES_V2_PLAN.md:325, ileride).
- **Migration (APPLY EDİLDİ — kullanıcı Supabase'de çalıştırdı):** `070_quotes_discount.sql` kolon `numeric(15,2) not null default 0` (mevcut teklifler 0 → etkilenmez, legacy snapshot korunur). `071_quotes_rpc_discount.sql` 069 RPC'leri üzerine CREATE OR REPLACE — `discount_amount` payload (COALESCE 0) + **V3-A6 draft guard** (update_quote_with_lines başı: status<>'draft' → `42501` RAISE, belt-and-suspenders; route zaten 409 ön-kapısı koyuyor [id]/route.ts:80). V7-A1 SECURITY DEFINER YOK, V7-A2 NULLIF korundu.
- **Toplam modeli (QuoteForm.tsx):** mevcut iki katman `comp*`/`ov*`→`eff*` korundu; iskonto **override paterni DEĞİL** (↻/ov YOK) — doğrudan `discount` state. `effDisc = Math.min(Math.max(discount,0), effSub)` clamp; `effVat = ov ?? (effSub-effDisc)*rate/100`; `effGrand = ov ?? (effSub-effDisc)+effVat`. subtotal iskonto-ÖNCESİ kalır; grand iskonto-dahil.
- **KRİTİK hydrate (advisor must-have):** init bloğunda `setDiscount(initialData.discountAmount ?? 0)`. Atlanırsa iskontolu mevcut teklif edit+kaydet'te **sessizce 0'a düşer + grand_total değişir** (finansal hata). Re-save testi var.
- **buildQuotePayload:** `discount_amount: effDisc`. autoSave+savePreviewData QuoteData bloklarına `discountAmount` IIFE enjekte + dep array'lere `discount` (exhaustive-deps; 0 yeni warning).
- **JSX:** Subtotal–VAT arası İskonto `<tr>` (`aria-label="İskonto"`, `q-total-inp`, ↻ revert YOK, readOnly parent `pointerEvents:none` ile kilitli). PDF (QuoteDocument): koşullu İskonto satırı `discountAmount > 0` (eski teklifler temiz), eksi işaretli, `BILINGUAL_LABELS.discount` (İskonto/Discount).
- **TS/dosyalar:** QuoteRow.discount_amount, QuoteDetail.discountAmount (mock-data), CreateQuoteInput.discount_amount (required — dbCreate/dbUpdate `...header` spread → otomatik geçer), mapQuoteDetail, QuoteData.discountAmount (quote-types), BILINGUAL_LABELS.discount. import-service 2 literal: update existing.discount_amount koru, create 0. preview/page.tsx değişmedi (localStorage cast → otomatik; eski payload undefined>0=false → satır gizli).
- **Test:** `quotes-faz3-discount.test.ts` (21: route passthrough POST/PATCH + draft guard 409 regression + formül referans matematik + form/document/types source-regex). faz4a autoSave regex 2000→2600 (iskonto IIFE'leri uzattı; amaç korundu). **3778 → 3799 yeşil** (faz3 = 21) · tsc temiz · build OK (`ƒ Proxy`) · lint 3 baseline error 0 warning.
- **DURUM: COMMIT+PUSH EDİLDİ** (`c5d8267` → main, `62eeb8e..c5d8267`, Coolify redeploy) + migration APPLY EDİLDİ. **Sıradaki:** UI smoke (iskontolu yeni teklif→matrah düşer/kaydet→reload korunur; iskontolu mevcut teklif edit→kaydet SIFIRLANMAZ; PDF İskonto satırı subtotal–KDV arası eksi; non-draft edit 409) + **Faz 5** (072) / Faz 4 (PDF arşiv).

## Önceki — 2026-05-29 (Teklif V7 Faz 2 IMPLEMENT EDİLDİ — validasyon katmanı, 3778 test, COMMIT+PUSH afe936b)

**Faz 2 = tam master-plan Faz 2 (4 düzeltme, kullanıcı kararı).** Migration YOK — saf uygulama katmanı (alanlar Faz 1a/1b'de eklendi). Yeni dosya `src/lib/quote-validation.ts` (3 pure helper: validateQuoteLineQuantities / validateQuoteForSend / findMissingHsLines + QuoteLineForValidation interface) + 2 route + servis + form + 3 test dosyası.

- **V7-A11 qty pozitif tam sayı:** `validateQuoteLineQuantities` — gerçek satırlarda (`product_id != null || unit_price > 0`) `Number.isInteger && >0`, değilse **422**. POST `/api/quotes` + PATCH `/api/quotes/[id]` document-update branch (validateStringLengths yanına). Salt-açıklama/başlık satırları (qty 0, product/fiyat yok) **muaf** (kullanıcı kararı). UI nudge: qty input `min="0" step="any"` → `min="1" step="1"` (KG/fiyat ondalık kalır).
- **V4-A2 + V4-A4 send-time hard check:** `validateQuoteForSend` — `serviceTransitionQuote` içinde **yalnız `target==="sent"`** iken: customer_address zorunlu (resmi PDF) + her substantive satır (`unit_price>0 || quantity>0`) ürüne bağlı olmalı (custom/manuel satır izinsiz). `QuoteTransitionResult.validationFailed` flag → PATCH transition mapping `notFound?404 : validationFailed?422 : 409`.
- **P2 fix (review):** sent branch'inde `validateQuoteForSend`'den ÖNCE `validateQuoteLineQuantities(quote.lines)` de çalışır (defense-in-depth) → POST/PATCH qty guard'ından geçmemiş legacy/bypass draft küsüratlı (2.5)/0 adetle **sent OLAMAZ**. qty validator artık 3 noktada: POST, PATCH document-update, sent transition.
- **V3-A1 GTİP soft warn (formda inline, kullanıcı kararı):** `findMissingHsLines` derived (state YOK); toolbar altında non-blocking `role="status"` + `var(--warning-text)` uyarı ("N satırda GTİP kodu eksik — gönderimi engellemez"). **Hiçbir butonu disable ETMEZ** (regression test ile kilitli).
- **Fixture fix:** `quote-service.test.ts` `stubQuote`'a `customer_address` eklendi (yoksa yeni send-validation mevcut draft→sent başarı testlerini kırardı). quote-service bu fazda **+7 test** (5 send-validation başlangıç + 2 P2 bypass review).
- **Test:** 3 yeni dosya — `quote-validation-helpers.test.ts` (22 pure), `quotes-faz2-validation-routes.test.ts` (12 route behavior), `quotes-faz2-form-warn.test.ts` (7 source-regex) + quote-service +7. **3731 → 3778 yeşil** (targeted Faz 2 = 74) · tsc temiz · build OK (`ƒ Proxy` korundu).
- **Accept RPC `trunc(quantity)`/`product_id IS NULL` RAISE → Faz 6 (075), bu fazda DEĞİL.**
- **DURUM: COMMIT + PUSH EDİLDİ** (`afe936b` → main, `ff07a86..afe936b`, Coolify redeploy). React Doctor advisory baseline (skor 90/100, Faz 2'ye özel yeni bulgu yok). Plan: `~/.claude/plans/clever-dancing-owl.md`.
- **Sıradaki:** UI smoke (küsüratlı adet 422; HS boş→sarı uyarı kaydet çalışır; adressiz sent→engel; custom satırlı sent→engel; **pre-Faz-1b adressiz draft kurtarma**: aç→adres gir→gönder geçer) + **Faz 3** (header discount 070-071).

## Önceki — 2026-05-29 (Teklif V7 Faz 1b IMPLEMENT EDİLDİ — QuoteForm entegrasyon, 3729 test, COMMIT+PUSH+APPLY EDİLDİ)

**Faz 1b uygulandı — tek dosya `QuoteForm.tsx` + 1 test dosyası (faz başı V7-A6 kod doğrulaması yapıldı).** 1a DB foundation'ı (066-069 + type/mapper/input) forma bağlandı.

- **V3-A4 productId:** local `QuoteRow`'a `productId` alanı; `handleSelectProduct`→`p.id` set, `handleCodeChange` manuel yazımda temizler; `buildQuotePayload`→`product_id: r.productId || null`; initialData hydrate `l.productId`.
- **V4-A2 müşteri:** `custId`/`custAddress` state; `handleSelectCustomer`→`c.id`+`c.address`; `handleCustCompanyChange` manuel yazımda custId temizler; meta grid'e **Address/Adres** input; payload `customer_id`+`customer_address`; hydrate.
- **V4-B3 + V3-B5/V4-A7 hs/size/KG:** `handleSelectProduct`→`hs=p.hsCode`, `size=p.sizeText`, `unitWeightKg=p.weightKg` (override sıfırlanır); yeni `patchRow` helper + `round3`; `handleQtyChange` KG=qty×birim recompute (`!kgManualOverride && unitWeightKg`); `handleKgChange` manuel→`kgManualOverride=true`; payload `unit_weight_kg`/`kg_manual_override`.
- **V4-A3 satıcı freeze:** `hasSellerSnapshot = !!initialData && sellerName.trim()!==""`; company_settings effect başına `if(hasSellerSnapshot) return` (snapshot'lı quote'ta live fetch ATLANIR → donmuş); initialData seller_* hydrate; payload seller_* (7). Pre-1b snapshot'sız quote → live fetch fallback.
- **Regression koruması:** faz4b desc bloğu **BİREBİR** korundu (konsolide refactor YAPILMADI) — faz4b:30 regex + yeni guard test ikisi de yeşil. faz4a-patch-validation tam-alan assert'i yok → additive güvenli (doğrulandı).
- **069 RPC tüketimi DOĞRULANDI (advisor blocker):** `product_id`+`unit_weight_kg`+`kg_manual_override` her iki RPC'de (create+update) satır INSERT kolon listesi VE value'larında NULLIF guard'lı → V3-A4 round-trip uçtan uca bağlı, kozmetik DEĞİL.
- **+27 test** `quotes-faz1b-form-integration.test.ts` (source-regex, faz4b modeli).
- **Doğrulama:** tsc temiz · **3729 test yeşil** (3702→+27) · build OK.
- **React Doctor temizliği (2026-05-29):** QuoteForm staged scan regression'ı giderildi. Kapsam (kullanıcı kararı): `control-has-associated-label` için 31 input/select/buton'a aria-label + boş silme-kolonu `<th>`'ye `.q-sr-only` "İşlemler" + boş toplam-spacer `<td>`'lere `&nbsp;` (→ 34→0). `no-initialize-state`+`no-derived-state` react-doctor.config.json'da off (init-effect SSR hydration kasıtlı). 164→56 (kalan tamamı kapsam-dışı baseline: no-inline-exhaustive-style 23 = proje inline-style konvansiyonu, vb.). aria-hidden/role=presentation denendi → no-aria-hidden-on-focusable/interactive-role tetikledi, geri alındı; doğru çözüm aria-label/sr-only/nbsp. **2. tur (kullanıcı kararı):** konvansiyon kuralları da config'de off — `no-inline-exhaustive-style` (CLAUDE.md inline-style mandate, Tailwind yasak) + `design-no-em-dash-in-jsx-text` (saf stil). QuoteForm full-file 56→30. Kalan 30 (button-has-type 5, js-combine-iterations 5, no-event-handler 4, exhaustive-deps 3 vb.) substantive baseline — kullanıcı tek-tek incelemeyi (Seçenek 3) seçmedi; hook advisory kalır, az sayıda uyarı verir. react-doctor.config.json artık 6 kural off.
- **Review düzeltmeleri (P1/P2/P3, 2026-05-29):** P1 — `handleSelectProduct` ağırlıksız üründe `kg` koşulsuz set (`kg: unit != null && qtyN > 0 ? round3(qtyN*unit) : ""`); eski `if (unit != null) patch.kg` koşulu eski ürün KG'sini taşıyordu → yanlış weight_kg persist düzeltildi. P2 — company_settings effect dep array `[hasSellerSnapshot]` (yeni exhaustive-deps warning giderildi; lint 3 baseline error, 0 warning). P3 — memory "+24" → "+27" (gerçek test sayısı). +2 test → 1b 29; full **3731 yeşil**; build OK.
- **Migration apply EDİLDİ** (066-069 Supabase editöründe çalıştırıldı). Runtime UI smoke kullanıcı tarafında bekliyor — koddan kanıtlı round-trip henüz çalışma anında test edilmedi.
- **hs/size auto-fill DORMANT + caveat:** products'ta hs_code/size_text boş (1a backfill yok, products drawer edit UI 1b DIŞI). `handleSelectProduct` hs'yi `p.hsCode ?? ""` ile **her seçimde set eder** (dirty-guard YOK, desc'ten farklı) → manuel girilmiş HS, ürün yeniden seçilirse silinir. Products bu alanları taşıyana dek beklenen; ileride dirty-guard gerekebilir.
- **DURUM: COMMIT + PUSH EDİLDİ** (main, Coolify redeploy) · migration apply EDİLDİ.
- **Sıradaki:** (1) UI smoke (yeni teklif ürün seç→hs/size/KG; kaydet→reload→korunur; eski sent→satıcı donmuş), (2) **Faz 2** (V3-A1 GTİP soft warn, V7-A11 qty validator).

### Önceki dilim — Faz 1a (DB foundation, commit `106686c`, doc-sync `c9f2bc8`)
- 4 migration (066-069) + TS katmanı (database.types/mock-data/api-mappers/quotes/products) + 20 test. **V7-A1** SECURITY DEFINER YOK, **V7-A2** NULLIF guard korundu. Commit edildi (main), push/apply EDİLMEDİ.

## Önceki — 2026-05-29 (6. tur: bekleyen UI fix commit/push + V7 bulgu doğrulama)

**1) Bekleyen Teklifler UI/UX audit fix commit + push edildi (3682 test)**
- Önceki oturumdan main'de commit'siz duruyordu (DOM mutation→hoveredId state, hex→CSS var, a11y). Doğrulama: `tsc --noEmit` temiz + `npm test` **3682 yeşil**.
- 2 commit: `12f7e23` fix(quotes) UI/UX audit (4 quotes dosyası + `quotes-ui-audit-fix.test.ts`) + `d201c11` docs (QUOTES_V2_PLAN.md + memory + CLAUDE.md). `d201c11..` main'e push edildi, Coolify redeploy tetiklendi. Untracked lokal skill dizinleri (`.agents/`, `.claude/skills/`, `skills/`) commit DIŞI bırakıldı.
- **React Doctor pre-commit hook uyarı verdi (bloklamadı)** — `react-doctor --staged --fail-on warning` ile sonra incelenebilir.
- **commit mesajı hatası:** `d201c11` "V6 master plan" der ama plan dosyası içeriği V7 (aşağı bkz). Pushed main, history rewrite yapılmadı; memory bu turda V7'ye hizalandı.

**2) Diskteki QUOTES_V2_PLAN.md zaten V7 — kullanıcının 6 bulgusu kod karşısında DOĞRULANDI**
- Plan dosyası 02:02'de (bu oturumdan önce) V7'ye yazılmış; memory V6'da kalmıştı (stale). Kullanıcı bu turda 6 bulgu (3 P1 + 3 P2) iletti; hepsi V7-A1…A7 olarak plana zaten işlenmiş + kod karşısında geçerli olduğu teyit edildi:
  - V7-A1 SECURITY DEFINER kaldır (036:1-3 + 065 DEFINER yok) ✅
  - V7-A2 quote_date NULLIF guard (065:71,132) ✅
  - V7-A3 order_lines satır vat_rate snapshot (039:57 + parasut-service:686) ✅
  - V7-A4 (P2) Paraşüt header discount (parasut-service:688 discount_pct) ✅ — **KULLANICI KARARI (kesinleşti):** snapshot taşı + discount_amount>0'da Paraşüt SESSİZ fatura YOK (bloklar/uyarır); gerçek aktarım ayrı faz
  - V7-A5 (P2) accept öncesi PDF arşiv (quote_pdf_archives Faz4'te) ✅ — **KULLANICI KARARI (kesinleşti): RECOVER/GENERATE** (422 değil); accept route RPC öncesi eksik arşivi üretir, fail→502
  - V7-A7 order_lines tablo adı (001:110; sales_order_lines yok) ✅
  - V7-A6 faz başı tam plan prosedürü
- **6. tur 2. okuma — 5 düzeltme (plana işlendi):** V7-A8 (order line product_name/sku master JOIN'den), V7-A9 (SalesOrderRow+mapOrderDetail 4 alan kilidi), V7-A5 ek (RPC defansif RAISE), V7-A4 netleşti, test 422→502.
- **6. tur 3. okuma — 5 düzeltme daha (kod karşısında doğrulandı, plana işlendi):**
  - **V7-A8 güçlendirme (P1):** INNER JOIN sessizce satır düşürür (product_id ON DELETE SET NULL 034:107; send sonrası ürün silinirse NULL → JOIN drop → eksik/finansal tutarsız order). Önceki "V4-A4 garanti ediyor" notu YANLIŞTI. Fix: insert öncesi product_id IS NULL → 23502 RAISE + insert sonrası GET DIAGNOSTICS ROW_COUNT verify (039 precedent).
  - **V7-A4 güçlendirme (P1+P2):** Guard throw ederse parasut-service:1092 catch parasut_step/marker yazar → "marker yazılmaz" bozulur. Fix: parasut_claim_sync (1016) ÖNCESİ early return (throw değil) + **ZORUNLU** sync_issue alert (ship route:62 fire-and-forget; sessiz block görünmez).
  - **V7-A10 (P2):** accept RPC item_count = v_inserted (yoksa sipariş item_count=0).
  - **V7-A11 (P2):** order_lines.quantity integer ⟂ quote numeric(12,4) + QuoteForm step="any" (972) → Faz 2 pozitif integer validator + accept RPC trunc RAISE.
  - **P3:** stale başlıklar (Review V7 — 7 / eklenen 7) → 17.
- **Toplam 56 düzeltme** (V2-V7; V7=17). ~192 test. Implement EDİLMEDİ. Plan modunda onaylandı + plan dosyası güncellendi.
- **Sıradaki:** Faz 1 başlama onayı (V7-A6: önce faz-spesifik self-contained tam plan).

## Önceki — Teklif Modülü V6 Master Plan (5. tur review, 2026-05-29)

**Teklif Modülü V6 Master Plan ONAYLANDI (implement edilmedi)**

- **Trigger:** Kullanıcı V5 plan üzerinde 5. tur review yaptı; 4 schema uyum blocker. V5 RPC SQL örnekleri mevcut schema'yla uyumsuzdu (yanlış kolon adları + yanlış fonksiyon adı + mevcut RPC alanları silinmiş gibi gösteriliyordu).
- **4 düzeltme V6:**
  - V6-A1: quote_line_items mevcut kolon adları — `product_code` (034:108, product_sku DEĞİL), `description` (034:110, product_name DEĞİL); discount_pct/notes/product_sku/product_name kolonları DB'de YOK; mapper UI alanlarına translate.
  - V6-A2: `generate_order_number()` doğru fonksiyon adı (003/007 + orders.ts:59); next_order_number YOK.
  - V6-A3: `sales_orders.vat_rate` snapshot kolonu Migration 075'e eklendi (NOT NULL DEFAULT 20, CHECK 0-100). Mevcut tabloda yoktu; finansal snapshot eksik kalırdı.
  - V6-A4: RPC tam rewrite DEĞİL — mevcut 065 create_quote_with_lines (27 alan: quote_number/sales_rep/sig_*/delivery/payment) korunur, sadece yeni alanlar (customer_address, seller_*, unit_weight_kg, kg_manual_override) eklenir.
- **Migration:** 12 toplam (V5 ile aynı); sadece içerik düzeltildi.
- **Toplam düzeltme:** V2 (5) + V3 (12) + V4 (13) + V5 (5) + V6 (4) = **39**.
- **Test:** ~175 (V5'ten +5).
- **Master plan:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` V6 versiyonu.
- **Implement EDİLMEDİ** — master roadmap; her faz öncesi ayrı detay plan modu.
- **Sıradaki:** Faz 1 başlama onayı bekleniyor.

## Önceki — Teklif Modülü V5 Master Plan (4. tur review, 2026-05-29)

**Teklif Modülü V5 Master Plan ONAYLANDI (implement edilmedi)**

- **Trigger:** Kullanıcı V4 plan üzerinde 4. tur review yaptı; 5 sıralama/atomicity düzeltmesi. Hepsi plan içi tutarsızlıklardı (RPC payload vs DB schema sırası).
- **5 düzeltme V5:**
  - V5-A1: Migration sırası — Faz 1+2 ihtiyacı olan tüm DB alanları Faz 1 grubunda (066-069). customer_address ve seller_* artık Faz 1 067'de, unit_weight_kg 068'de. Eski V4'te 069 (Faz 5) ve 075'te dağınıktı.
  - V5-A2: Faz 1 yeni Migration 069 — RPC'lere yeni alan payload genişletmesi (DB hazır, RPC tutarlı).
  - V5-A3: Faz 2 validation order tutarlı — DB Faz 1'de hazır olduğundan validator güvenle ekler.
  - V5-A4: `/accept` atomik RPC `accept_quote_and_create_order` — tek PL/pgSQL transaction (lock + idempotency + status + productId + insert + audit). Hata → ROLLBACK.
  - V5-A5: Yıllık counter backfill prefix/separator bağımsız — created_at yılı + regex `\d+$` son rakam.
- **Migration:** 10 → 12 (V4'te 10; V5'te 12 — 066-077). Faz 1 grubu 4 migration, Faz 6 atomik RPC eklendi.
- **Toplam düzeltme:** V2 (5) + V3 (12) + V4 (13) + V5 (5) = 35.
- **Test:** ~170 (V4'ten +25).
- **Master plan:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` V5 versiyonu.
- **Implement EDİLMEDİ** — master roadmap; her faz öncesi ayrı detay plan modu.
- **Sıradaki:** Faz 1 başlama onayı bekleniyor.

## Önceki — Teklif Modülü V4 Master Plan (3. tur review, 2026-05-29)

**Teklif Modülü V4 Master Plan ONAYLANDI (implement edilmedi)**

- **Trigger:** Kullanıcı V3 plan üzerinde 3. tur review yaptı; 8 ana + 5 ikincil = 13 yeni düzeltme. Hepsi kod referansıyla doğrulandı.
- **Yeni schema bulguları:** audit_log.source enum sınırlı ("ui"|"system"|"ai"|"integration"; literal 'migration_069' patlardı); quotes.customer_address YOK (034:27-30); QuoteForm:242 firma bilgisi DB'de saklanmaz; route.ts:62 PATCH transition accepted ayrı + /convert ayrı (iki yol); route.ts:106 DELETE sent izinli; 034:10 quotes_number_seq global (yıllık reset yok).
- **8 ana düzeltme V4:** audit source='system' + after_state'e migration adı; customer_address DB+validator+backfill; seller_* 7 snapshot alanı; productId send-time hard check; PDF arşiv 3 path resume (idempotent/resume/fresh); DELETE sadece draft; unit_weight_kg + kg_manual_override DB persist; /accept tek yol + eski 410 Gone.
- **5 ikincil düzeltme V4:** quote_yearly_counters yıllık reset; RLS ENABLE her yeni tabloya; CreateProductInput hs/size geniş entegrasyon; audit source enum coverage testi; memory checklist.
- **Master plan:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` V4 versiyonuna güncellendi (449 satır).
- **Toplam düzeltme:** V2 (5) + V3 (12) + V4 (13) = 30.
- **Kapsam:** 7 faz · 10 migration (066-075) · ~145 yeni test · 4-6 hafta tam zamanlı.
- **Implement EDİLMEDİ** — master roadmap; her faz öncesi ayrı detay plan modu.
- **Sıradaki:** Faz 1 başlama onayı bekleniyor.

## Önceki — Teklif Modülü V3 Master Plan (2. tur review, 2026-05-29)

**Teklif Modülü V3 Master Plan ONAYLANDI (implement edilmedi)**

- **Trigger:** Kullanıcı V2 plan üzerinde 2. tur review yaptı; schema gerçekliği uyuşmazlıkları + 6 ana + 6 ikincil = 12 düzeltme.
- **Schema gerçekliği doğrulandı:** quotes.status = text+CHECK (enum DEĞİL), audit_log = entity_type/entity_id/before_state/after_state (target_* YANLIŞ), QuoteRow.productId YOK, sig_prepared/sig_approved mevcut, company_settings.currency mevcut, middleware src/proxy.ts (NOT middleware.ts).
- **6 ana düzeltme V3:** GTİP soft warn (HARD değil); status CHECK constraint update (enum swap değil); audit_log kolon isimleri doğru; QuoteRow.productId hidden field Faz 1'de; PDF immutable arşiv INSERT-only (upsert=false); non-draft update/delete HARD guard (helper + RPC).
- **6 ikincil düzeltme V3:** sig_* backfill prepared_by_name'e; company_settings.currency reuse (default_currency duplicate etme); quote_number_prefix/separator migration SQL'e dahil; src/proxy.ts (NOT middleware.ts); unitWeightKg gizli alan KG recompute için; 0 fiyat PDF "0.00".
- **Master plan:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` V3 versiyonuna güncellendi.
- **Implement EDİLMEDİ** — sadece master roadmap. Her faz öncesi ayrı detay plan modu açılır.
- **Sıradaki:** Faz 1 başlama onayı bekleniyor.

## Önceki — Teklif Modülü V2 Master Plan (1. tur review, 2026-05-29)

**Teklif Modülü V2 Master Plan ONAYLANDI (implement edilmedi)**

- **Trigger:** Kullanıcı kökten revize istedi: ürün seçilince auto-fill (kod/ölçü/açıklama/fiyat/GTİP/KG), çift dilli kurumsal PDF, revizyon zinciri, immutable PDF arşivi, kabulde sipariş dönüşümü.
- **3 paralel Explore agent + 1 Plan agent ile master plan çıkarıldı.** Kullanıcı 1. review turunda 6 kritik düzeltme istedi, hepsi entegre edildi.
- **Net kararlar:** Server-side Puppeteer PDF (Docker chromium), expired enum'dan kaldırılır → UI rozet, GTİP HARD validation + KG SOFT warn [**NOT: GTİP V3-A1'de SOFT'a revize edildi, Faz 2'de SOFT uygulandı — bu V2 turunun tarihsel kaydı**], prepared/approved serbest text + audit için ayrı user FK, legacy expired → sent (rejected DEĞİL — satış raporları bozulmasın), root_quote_id paterni (revizyon zinciri R1-R2 bug fix), discount data migration KALDIRILDI (legacy snapshot korunur, iki katmanlı formül), preview hibrit (sessionStorage + DB).
- **Master plan dosyası:** `/Users/mirzasaribiyik/Projects/erp2/QUOTES_V2_PLAN.md` (24KB, ~600 satır, kalıcı projeye yazıldı).
- **Kapsam:** 7 faz · ~10 migration (066-074) · ~120 yeni test · ~30 yeni dosya · ~25 değişen dosya · 4-6 hafta tam zamanlı.
- **Sıra:** 1 → 2 → 3 → 5 → 4 → 6 → 7 (Faz 4 PDF revision_no ve discount_amount'a bağımlı).
- **Implement EDİLMEDİ** — sadece master roadmap. Her faz öncesi ayrı detay plan modu açılır.
- **Sıradaki:** Faz 1 (products.hs_code + size_text master alan, QuoteForm auto-fill genişletme, dirtyField refactor) başlama onayı.

## Önceki — Teklifler modülü UI/UX eksiksiz düzeltme (3682 test, 2026-05-28)

- **Trigger:** Kullanıcı "teklifler sayfası üzerine, mevcut sorunları herhangi bir yerde eksiksiz düzelt" istedi. 7 dosyalık audit yapıldı (Explore agent), 5 yüksek + 11 orta sorun bulundu; print PDF (`QuoteDocument.tsx`) bilinçli hex paleti — kapsam dışı.
- **A — DOM mutation antipattern fix** (`quotes/page.tsx:429-454`): `<tr>` `onMouseEnter`/`onMouseLeave` `querySelectorAll("td")` + `.style.background`, `querySelector("[data-chevron]").style.opacity`, `querySelector("[data-delete]").style.opacity` ile doğrudan DOM yazıyordu. **Fix:** `hoveredId` state + `setHoveredId(q.id)` / `setHoveredId(null)`; tüm TD `background` ve borderLeft koşullu inline (`isHovered ? "var(--bg-secondary)" : "transparent"`); chevron + delete button opacity React state'den. `data-chevron`/`data-delete` attribute'ları silindi.
- **B — UX bug** (`quotes/page.tsx:452`): `onMouseLeave` içinde `if (confirmId === q.id) setConfirmId(null)` vardı — kullanıcı "Sil" basıp "Evet, sil" görünce fareyi başka satıra kaydırınca onay sıfırlanıyordu. **Fix:** A maddesiyle birlikte handler `() => setHoveredId(null)`'a indirgenince satır otomatik gitti.
- **C — preview/page.tsx 9 hex → CSS var:** `#1e2330/#2d3347/#0072BC/#9ca3b0/#373e47/#1a1d23/#e6edf3/#636d7c` → `var(--bg-primary/border-tertiary/accent/text-secondary/border-secondary/text-primary/text-tertiary)`. **Bilinçli korunan:** `#d0d5dd` (PDF kağıt taklidi scroll arkaplanı — yorum eklendi) ve `color: "white"` (accent zemin üstü okunaklılık; `--accent-text` projede farklı amaçta).
- **D — QuoteForm.tsx INJECTED_CSS:** `var(--bg-hover, #2a2e37)` (2 yer) → `var(--bg-secondary)`. `--bg-hover` globals.css'te tanımlı değildi → her zaman hex fallback'ine düşüyordu.
- **E — A11y aria-label'lar:** `page.tsx` refresh button + delete trash button → `aria-label`; chevron `<span>` → `aria-hidden="true"`. `[id]/page.tsx` confirm dialog: `role="dialog"` + `aria-modal="true"` + `aria-labelledby="quote-confirm-dialog-title"` (başlık div'ine de `id` eklendi); SVG'ye `aria-hidden`.
- **+15 source-regex test** (`quotes-ui-audit-fix.test.ts`): DOM mutation kaldırma (3), hoveredId state (1), handler simplification (1), data-attr temizliği (1), confirmId UX fix (1), aria-label (2), dialog a11y (3), preview hex temizliği (1), preview CSS var kullanımı (1), bilinçli #d0d5dd korunması (1), QuoteForm bg-hover temizliği (1).
- 5 dosya · **3682 test yeşil** (önceki 3667 + 15) · TS clean · 0 yeni warning · build OK
- **Sıradaki:** Push + Coolify redeploy + manuel smoke (satır hover + "Evet, sil" stabilite testi + preview renkleri dark theme tutarlı + screen reader confirm dialog "dialog" olarak okur).

## Önceki — SMTP smoke endpoint + deploy runbook (3667 test, 2026-05-28)

- **Trigger:** SMTP/Resend entegrasyonu 2026-05-06'dan beri kod hazır; production deploy yapılmadı. Müşteri domain'i belirsiz → Resend hesap + DNS verify bloklu. Bu turda kod tarafını deploy-ready yap + runbook yaz.
- **Kod 100% hazırdı (doğrulandı):** Migration 047, `resend@^6.12.2`, `.env.example` (RESEND_API_KEY/EMAIL_FROM/NEXT_PUBLIC_APP_URL/ADMIN_EMAILS), email-service (fail-safe), email-logs (dedup+retry), templates (5 tip), retry-failed cron, trigger entegrasyonları (alert-service vb.).
- **Eklenenler:**
  - `POST /api/email/test` (admin-only smoke): requireRole admin + body validation (email regex + type whitelist) + config check (RESEND_API_KEY/EMAIL_FROM yoksa 503 config_missing) + 5 NOTIFICATION_TYPE için sample context + recipient lookup/dedup BYPASS (body.to'ya direkt) + email_logs entity_type='test_email' audit + Resend direct send. Browser console fetch ile test edilir.
  - `docs/EMAIL_DEPLOY.md` runbook: Resend hesap + DNS verify (subdomain + DKIM kritik) + Coolify env vars + Migration 047 + redeploy + smoke (Yöntem A endpoint, Yöntem B gerçek tetik) + troubleshooting tablosu. ~30 dk.
- **Resend mock fix:** `new Resend(apiKey)` constructor; `vi.fn().mockImplementation(() => ({...}))` uyumsuz → `class MockResend` pattern.
- **+10 test:** auth (2), validation (3), config (2), happy (2), error (2).
- 3 dosya · **3667 test yeşil** · TS clean · 0 yeni warning · build OK
- **Domain henüz belirsiz** → Resend hesap + DNS + Coolify env + Migration kullanıcı tarafında bekliyor.
- **Sıradaki:** Domain hazır olunca runbook Faz 1-5 (~30 dk); Faz 12 Paraşüt Sandbox.

## Önceki — Sesli giriş V3 (3657 test, 2026-05-28)

**Sesli giriş V3 — fireNotes → notlar entegrasyonu + Ctrl+M kısayolu (3657 test)**

- **Trigger:** Memory'de "Kapsam Dışı (V3)" listesinde bekleyen 2 madde tamamlama.
- **Kullanıcı kararları (2026-05-28):** Fire için ayrı UI sütunu yok; fireNotes notlar alanına concat; scrap_qty DB kullanılmaz; Ctrl+M shortcut eklenir; sessizlik algılama hâlâ kapsam dışı.
- **3 plan revizyonu (kullanıcı bulgusuyla):**
  - Client/server boundary korundu: `voice-service.ts` top-level Anthropic SDK + env init ediyor. Pure helper yeni `src/lib/voice-note-helpers.ts` dosyasında (voice-service.ts'ten ayrı). voice-service import type kalır. Bundle smoke geçti (production chunk'larında Anthropic yok).
  - Ctrl+M `isProcessing` race koruması: "Ses işleniyor..." sırasında ikinci kayıt başlamasın → `isProcessing` early return + `e.repeat` (held-down spam) guard.
  - Test ayrımı: `production-prefill.test.ts` ile karışmasın → yeni `voice-production-page.test.ts`.
- **Implementation:**
  - `mergeFireIntoNote(note, fireNotes)`: pure helper — boş/dolu kombinasyonlar, orta nokta ayraç, case-insensitive duplicate guard, whitespace trim.
  - `handleVoiceResult`: `notlar: mergeFireIntoNote(entry.note || data.sessionNote || "", entry.fireNotes)`. FormLine DEĞİŞMEDİ.
  - Ctrl+M `useEffect`: `e.ctrlKey + key m/M` → `e.repeat` → `isProcessing` → INPUT/TEXTAREA/SELECT focus → `isDemo` → toggle. Cmd+M handle edilmez (macOS minimize çakışması).
  - Button title hint: "Klavyeden Ctrl+M ile de başlatabilirsiniz".
- **+20 yeni test:** voice-note-helpers (7) + voice-production-page source-regex (13).
- 4 dosya · **3657 test yeşil** · TS clean · 0 yeni warning · build OK · bundle leak yok
- **Sıradaki:** Push + Coolify redeploy + manuel smoke (Ctrl+M + fire notlar + V2 regression).

## Önceki — React Doctor only-export-components ×22 fix (3637 test, 2026-05-28)

**React Doctor only-export-components ×22 fix (56 → 57, commit `dd53b36`)**

- **Trigger:** Önceki commit'lerde "kapandı" yazılmıştı ama `only-export-components` ×22 hâlâ baseline'daydı — 22 re-export (`export { X } from "@/lib/..."`) kuralı tetikliyordu.
- **Fix:** Backward-compat re-export sökme. 9 test dosyası import path'i doğrudan helper'a yönlendirildi → component dosyalarındaki re-export satırları silindi (internal `import` korundu).
- **Etki:** 8 component (`DropZone`, `ClassifierQueue`, `ExtractionReview`, `Pagination`, `StockDataGrid`, `data-context`, `PurchaseOrderDocument`, `QuoteDocument`) + 9 test güncellendi. `pagination-component` module-load testi 2'ye bölündü. `dropzone` + `stock-data-grid` source-regex'leri helper pattern'ine geçti.
- **only-export-components: 22 → 0** (full scan'de artık yok).
- 17 dosya · **3637 test yeşil · TS clean · 0 yeni warning**
- **Skor toplam:** 51 → 57 (+6, dört tur birikimi)
- **Sıradaki:** kalan ~50 inline style block + react-hooks/set-state-in-effect ×32 değerlendirmesi.

## Önceki — React Doctor Bölüm 4 (3636 test, 2026-05-28)

**React Doctor Bölüm 4 — inline style extract + OAuth disable fix (54 → 56, commit `11fad03`)**

- **Trigger:** Bölüm 4 (no-inline-exhaustive-style ×301, alerts 42 + suggested 23 hedef) + önceki commit'teki disable directive sözdizimi hatasının düzeltilmesi.
- **OAuth disable fix:** Önceki `// eslint-disable-next-line react-doctor/...` react-doctor tarafından algılanmıyordu (kendi sözdizimi var: `// react-doctor-disable-next-line`). Yorum `.upsert()` üstünden `export async function GET` öncesine taşındı + doğru sözdizimi. `nextjs-no-side-effect-in-get-handler` kapandı.
- **Önceki memory "kapatıldı" yanıltıcıydı:** Full scan hâlâ 23 error gösteriyordu (22 only-export-components re-export + 1 OAuth). only-export-components ×22 hâlâ aktif — re-export'lar tetikliyor; sonraki PR'da test import path'leri helper'a yönlendirilip re-export silinmeli.
- **Bölüm 4 refactor:**
  - alerts/page.tsx: 130+ module-level const (header, tabs, AI panel, alertRow, systemAlert, orderAlertSmall, severity badge). Pilot 2 spread (Yol A) validation'da doğrulandı.
  - suggested/page.tsx: 8 statik const + `AI_SIGNAL_BUTTON_STYLES` lookup map (3-urgency variant). Helper fn DEĞİL — Record<Variant, CSSProperties>.
  - 301 → 271 (-30 uyarı). Hedef 65 idi; kalan ~50 nokta drawer body + suggested table sonraki tur.
- **Helper fn tuzağı plan'da dokümante edildi:** `getX(args)` her render yeni obje üretir, kural kandırır ama perf sorununu çözmez. Lookup map önerilen.
- 3 dosya · **3636 test yeşil · TS clean · 0 yeni warning**
- **Sıradaki:** Push + redeploy + smoke; sonraki tur kalan ~50 inline + 22 re-export fix.

## Önceki — React Doctor temizlik (3636 test, 2026-05-27)

**React Doctor temizlik — error'lar + a11y + config (51 → 54, commit `e57361c`)**

- **Trigger:** `npx react-doctor@latest` 51/100 skor + 1812 sorun. Plan'a göre 4 bölümlü temizlik (`mellow-plotting-ladybug.md`).
- **Bölüm 2 — `only-export-components` ×23 (önceki session'da extract edildi, bu session test fix + commit):**
  - 7 yeni helper dosya: `import-file-helpers.ts`, `classifier-helpers.ts`, `extraction-review-helpers.ts`, `po-document-helpers.ts`, `customer-helpers.ts`, `quote-document-helpers.ts`, `pagination-helpers.ts`.
  - 5 component dosyada non-component export'lar helper'lara taşındı + backward-compat re-export pattern (component'in kendi içinde import + dış API için re-export).
  - 3 test güncellendi (`stock-data-grid-limit`, `dropzone-component`, `quotes-faz4a-helper-mapper`) — source-regex'ler re-export pattern'ine + helper file'a yönlendirildi.
- **Bölüm 1 — `nextjs-no-side-effect-in-get-handler` ×1:** OAuth callback (`src/app/api/parasut/oauth/callback/route.ts`) GET handler içinde `.upsert()` — Paraşüt provider'ı GET çağırır (POST imkânsız). Mevcut signed state cookie CSRF korur. `.upsert()` öncesi eslint-disable yorum + gerekçe.
- **Bölüm 3 — `no-outline-none` ×29 (plan tahmini 19, gerçek 29):** `globals.css`'e global `:focus-visible` ring (`outline: 2px solid var(--accent)`, `outline-offset: 1px`). 29 callsite'tan `outline: "none"` satırları/inline kısımları sed ile temizlendi (`outline: "none",\n` standalone satırlar silindi, `outline: "none", ` inline parçalar kesildi). A11y ring tek noktada, klavye Tab navigasyonunda görünür.
- **Bölüm 5 — Config sessizleştirme:** Yeni `react-doctor.config.json` (kök):
  - `react-doctor/no-tiny-text` — print/PDF kasıtlı küçük font (QuoteDocument, PurchaseOrderDocument).
  - `react-doctor/no-giant-component` — alerts/settings ERP sayfaları kasıtlı büyük (domain gereği).
  - `react-doctor/prefer-useReducer` — useState doğru tercih, fikir meselesi.
  - `react-doctor/no-fetch-in-effect` — SWR/React Query yok (proje sözleşmesi, CLAUDE.md feedback'i).
  - 515 uyarı (tiny-text 434 + giant 32 + useReducer 29 + fetch 20) config'le bastırıldı.
- **Bölüm 4 — `no-inline-exhaustive-style` ×301 ERTELENDİ:** alerts/page.tsx (42) + suggested/page.tsx (23) = 65 inline style block extract işi büyük ve manuel — JSX context, conditional render, prop spread her birinde farklı. Risk/efor dengesi sonraki tura.
- **Yeni:** `.github/workflows/react-doctor.yml` (PR'larda otomatik tarama), `package.json` `"doctor": "npx react-doctor@latest"` script + `react-doctor` dev dep.
- **45 dosya · 3636 test yeşil · TS clean · 0 yeni warning · skor 51 → 54** (Bölüm 4 yapılırsa ~59 beklenir).
- **Sıradaki:**
  1. Coolify redeploy + smoke (sidebar, dashboard 15 ürün, OAuth callback davranışı, focus ring görsel kontrol)
  2. Bölüm 4 — alerts/page.tsx + suggested/page.tsx inline style → module-level const refactor (65 block, ayrı PR)
  3. Bölüm 4 sonrası kalan ~236 `no-inline-exhaustive-style` (diğer dosyalar)

## Önceki — UX iyileştirme (3636 test, 2026-05-27)

**UX iyileştirme — sipariş adlandırma + dashboard stok widget limit**

- **Trigger:** Kullanıcı iki UX problemi: (1) sidebar'da iki "Siparişler" çakışıyor, (2) dashboard'da stok envanteri sınırsız → PMT prod 100+ ürün scroll'u patlatır.
- **Kararlar (AskUserQuestion):** A — "Satış Siparişleri" + "Satın Alma Siparişleri" (ERP norm) + A — 15 ürün + "Tümünü gör" link (dashboard summary widget pattern).
- **Sipariş adları:** Sidebar 2 label + `/dashboard/orders` div → h1 "Satış Siparişleri" + useEffect document.title + `/dashboard/purchase/orders` (h1 zaten vardı) sadece document.title.
- **StockDataGrid:** opsiyonel `limit` + `showViewAllLink` prop. Yeni export `sortByStockPriority` (tükendi → kritik → düşük → hazır + aynı status'ta available/min oranı ascending → en kritik 15 ürün dashboard'da anlamlı). `filtered.slice(0, limit)` + "Tümünü gör (N) →" Link `/dashboard/products`'a yönlendirir. Backward-compat: limit yoksa eski mantık + sort YOK.
- **Dashboard page:** `<StockDataGrid limit={15} showViewAllLink ... />`.
- **+22 yeni test:** stock-data-grid-limit (12 — priority order, oran sort, immutable, source-regex), sidebar-order-labels (3 — yeni pair, regression eski yok), orders-page-title (5 — h1 + document.title + eski div başlığı yok). purchase-orders-ui.test.ts Sidebar assertion güncellendi.
- 8 dosya · **3636 test yeşil** (önceki 3614 + 22) · TS clean · 0 lint warning · build OK (`ƒ Proxy (Middleware)` korundu)

## Önceki — AI rate limit advisor refinement (3614 test, 2026-05-26)

**AI rate limit advisor refinement — request-ip extract + limit 10 + 429 frontend (3614 test)**

- **Trigger:** `c92ff9f` deploy sonrası kullanıcı "AI önerisi oluşturulamadı" sarı banner gördü. purchase-copilot 5/dk limiti pratikte aşılıyordu, frontend 429'u generic AI hatası olarak yutuyordu.
- **3 advisor + 1 kullanıcı bulgu fix:**
  - **Redis bağımsızlık (P3):** `extractClientIp` → yeni `src/lib/request-ip.ts`. `rate-limit.ts` re-export. `ai-route-limit.ts` direkt request-ip'ten import → ioredis runtime bağımlılığı yok.
  - **Validation öncesi guard (P3):** score + parse'ta guard `safeParseJson` + field validation sonrasına taşındı.
  - **Smoke test düzeltme (P2):** Plan'da `/api/ai/score` auth'suz curl yanlıştı (proxy 401). UI'dan authenticated session veya purchase-copilot ile test edilmeli — belgelendi.
  - **Yeni fix:** purchase-copilot limit 5→10 + frontend 429 spesifik handling (`aiRateLimited` state + spesifik banner mesajı). loadAiData 429 dalı eklendi, mevcut aiError banner `!aiRateLimited` koşullu (çift banner yok).
- **+7 yeni test** `request-ip.test.ts` (XFF zincir, trim, x-real-ip fallback, default, re-export, dosya varlığı, ai-route-limit redis bağımsız + negatif assertion). integration test purchase-copilot limit 10 güncel.
- **10 dosya** (1 yeni helper + 1 yeni test + 1 source-regex update + 3 AI route + 1 frontend page + 1 rate-limit re-export + 3 memory) · **3614 test yeşil** (önceki 3606 + 8) · TS clean · 0 lint warning · build OK (`ƒ Proxy (Middleware)` korundu)
- **Sıradaki:** (1) Coolify redeploy + UI smoke (auth'lı /dashboard/purchase/suggested → 11. yenile → spesifik 429 banner görmeli, generic değil), (2) 1-2 hafta sonra Upstash REST migration ayrı PR.

## Önceki — Route-level AI rate limit (3606 test, 2026-05-26)

**Route-level AI rate limit — Anthropic fatura amplifikasyonu koruması (3606 test)**

- **Karar bağlamı:** M-3 global Redis rate limit Coolify Docker network sorunlarıyla çıkmaza girdi (terminal yok, debug zor). REDIS_URL env unset → fail-open path stabil, sistem normal hızda. Kullanıcı kararı: A (disable Redis) + route-level AI guard (defense-in-depth). 1-2 hafta sonra Upstash REST refactor (ayrı PR).
- **Tasarım kararı (kritik):** Guard MIDDLEWARE'de değil ROUTE içinde. Sebep: Next 16 Turbopack proxy convention bug'ı bizi zaten ısırdı (P0 — middleware INVOKE EDİLMEMİŞTİ). Route-içi guard middleware bypass olsa bile çalışmaya devam eder — Anthropic fatura riski tüm koşullarda kapalı.
- **Yeni helper** `src/lib/ai-route-limit.ts`:
  - `checkAiRateLimit(route, ip, limit=5)` — pure rolling window. Map `${route}:${ip}` → timestamp[]. Window 60sn. Cleanup amortize her 5dk'da bir (expired ts + boş entry sil).
  - `guardAiRoute(request, route, limit)` — tek-satır NextResponse|null helper. 429 response: `Retry-After` + `X-RateLimit-Limit/Remaining/Window` header.
  - `__resetAiRateLimitForTests` + `__getAiRateLimitMapSize` test-only export.
  - `extractClientIp` reuse `@/lib/rate-limit` (Coolify Traefik X-Forwarded-For).
- **5 AI route entegrasyon (her birinde 2-3 satır):**
  - purchase-copilot 5/dk — `if (request) guard` (POST type backward-compat)
  - stock-risk 5/dk — POST signature `request?: NextRequest` (test compat)
  - parse 10/dk — import wizard satır parse sırasında daha cömert
  - ops-summary 5/dk — POST signature `request?` (test compat)
  - score 5/dk
  - observability — guard YOK (Anthropic çağrısı yok, sadece DB)
- **purchase-copilot-auth.test.ts** güncellendi — `beforeEach` `__resetAiRateLimitForTests()` çağrısı (testler aynı 0.0.0.0 IP'sini kullanıyor, 6. test 429 alıyordu).
- **+25 yeni test:**
  - `ai-route-limit.test.ts` (10): rolling window, 5 ardışık + 6. 429, vi.useFakeTimers 61sn ileri → ok, IP izolasyon, route izolasyon, cleanup Map.size azalır, guardAiRoute null/429 + header'lar, __reset.
  - `ai-route-limit-integration.test.ts` (15): 5 route'ta `guardAiRoute` import + çağrı + limit + erken çıkış pattern + observability'de YOKLUĞU.
- **Tehdit modeli (M-3 statüsü):** login (Supabase GoTrue built-in), parasut sync (CRON_PATHS Bearer), products scrape (auth gate 401), demo mutation (403) — hepsi kapalı; **AI cost** bu PR ile kapatıldı. Tek kalan global Redis (Upstash 1-2 hafta).
- **Single-container best-effort notu:** Map process restart'ta sıfırlanır (Coolify rolling deploy = saldırgan 5 yeni istek alır, pratikte cost sınırlı). Multi-instance scale-up Upstash refactor zorunlu hale getirir.
- 8 dosya (1 source helper + 5 route + 2 test + 1 mevcut test reset + 3 memory) · **3606 test yeşil** (önceki 3581 + 25) · TS clean · 0 lint warning · build OK (`ƒ Proxy (Middleware)` korundu)
- **Sıradaki:** (1) Production smoke — auth/cron invariant doğrulama + AI guard 6. istekte 429 testi, (2) 1-2 hafta sonra Upstash REST migration ayrı PR.

## Önceki — M-3 Resilience fix (3581 test, 2026-05-26)

**M-3 Rate Limiting Resilience fix — production outage (3581 test)**

- **P0 Production outage:** Coolify deploy sonrası Redis Docker network izolasyonu — `connect ETIMEDOUT`. Önceki ioredis options (`enableOfflineQueue:true`, `maxRetriesPerRequest:1`, `connectTimeout:3000`) her isteğe ~6s bloke ekliyordu → kullanıcı login olamıyordu, OAuth refresh fail (`Invalid Refresh Token`). Coolify Terminal kullanılamadığı için network debug imkânsız.
- **Plan 3 aşamalı:** (Aşama 1) Acil unblock — `REDIS_URL` env sil + redeploy → `if (!url) return null` fail-open. (Aşama 2) Kalıcı resilience fix kod. (Aşama 3) Uzun vadeli Redis backend kararı (A disable / B Coolify network fix / C Upstash / D Cloudflare WAF) — kullanıcı seçimi pending.
- **Aşama 2 implementation:**
  - **ioredis options sıkılaştırma:** `enableOfflineQueue:false` (queue şişmesin) + `maxRetriesPerRequest:0` (fail fast) + `connectTimeout:1500` (HARD_TIMEOUT'tan kısa) + `lazyConnect:true` + fire-and-forget `_client.connect().catch(log)` + `retryStrategy:()=>null` (ioredis kendi reconnect denemesin — circuit breaker yönetir).
  - **Module-level circuit breaker:** `HARD_TIMEOUT_MS=200`, `CIRCUIT_OPEN_THRESHOLD=3`, `CIRCUIT_OPEN_DURATION_MS=30_000`. `_consecutiveFailures` + `_circuitOpenedAt` state. `isCircuitOpen()` erken return (Redis'e dokunmaz). `recordFailure(reason)` — counter++ + threshold'da console.error + timestamp YENİLE (probe fail de timer reset eder). `recordSuccess()` — counter sıfırla + circuit kapatma log. 429 (RateLimiterRes) `recordSuccess` sayar (Redis cevabı).
  - **Promise.race + hard timeout:** `setTimeout(()=>resolve(TIMEOUT_SENTINEL), 200)` ile yarış. Hanging consume promise için `.catch(()=>{})` no-op handler (unhandled rejection bastırma). `finally` `clearTimeout` (memory leak yok).
  - **Test-only export:** `__resetCircuitForTests` — test izolasyon için.
- **Performans bütçesi:** sağlıklı <5ms, circuit open <1ms, circuit closed+Redis kopuk <200ms.
- **+6 yeni test** (`rate-limit-helper.test.ts`): hard timeout fail-open (gerçek elapsed ölçümü 195-300ms), 3 fail → OPEN → 4. çağrı consume hiç çağrılmaz, OPEN+30sn sonra probe başarılı → CLOSE + circuit CLOSED log, probe BAŞARISIZ → timestamp yenilenir (re-OPEN 30sn), 429 RateLimiterRes recordSuccess sayar (counter reset), `finally clearTimeout` source-regex kilidi. Mock güncellemesi: `MockRedis.connect()` eklendi (yeni `lazyConnect:true` + `_client.connect()` pattern için), `beforeEach` `__resetCircuitForTests()` çağrısı.
- **In-memory state notu:** Tek Next.js process — multi-instance scale-up'ta her instance ayrı circuit (3 instance × 3 fail = 9 timeout, her biri 200ms ile sınırlı). Mevcut Coolify single-instance için yeterli; gelecek scale-up'ta Redis-backed shared state.
- 3 dosya (1 source [src/lib/rate-limit.ts +60 satır] + 1 test [+6 test + beforeEach reset + MockRedis.connect] + 1 memory [project_security.md]) · **3581 test yeşil** (önceki 3575 + 6 regression) · TS clean · 0 lint warning · build OK (manifest dolu, `ƒ Proxy (Middleware)` satırı korundu)
- **Sıradaki — kullanıcı kararı (Aşama 3):** Redis backend yaklaşımı — A (disable) / B (Coolify network fix + Hetzner firewall) / C (Upstash REST + code refactor) / D (Cloudflare WAF rate limit). Tüm seçenekler artık güvenli — kod fail-open ile hazır.

## Önceki — M-3 Review 2 (3575 test, 2026-05-25)

**M-3 Rate Limiting Review 2 — P0 production pipeline fix (3575 test)**

- **P0 Kanıt (kullanıcı smoke):** Review 1 sonrası testler/build yeşil ama production HTTP smoke kırmızı. `.next/server/functions-config-manifest.json` BOŞ (`functions: {}`), `.next/server/middleware-manifest.json` BOŞ. Production gözlem: GET /dashboard auth'suz 200 (login redirect olmalıydı), GET /api/products 401 değil, POST /api/parasut/sync-all Bearer'sız 200, X-RateLimit-* header yok. Yani middleware production'da INVOKE EDİLMİYORDU — auth/cron/rate-limit gate'leri tamamen bypass.
- **Tanı (Next 16 source):** `build/utils.js:1535` `if (staticInfo.runtime === 'nodejs' || isProxyFile(page)) { functionsConfigManifest.functions['/_middleware'] = { runtime: 'nodejs', matchers } }`. Bizim `middleware.ts` + `config.runtime = "nodejs"` veya `export const runtime = "nodejs"` denendi → ikisi de Turbopack tarafından parse edilmedi → koşul sağlanmadı → manifest boş kaldı. Test ettim: `experimental.nodeMiddleware: true` Next 16 ExperimentalConfig type'ında yok (artık değil). Webpack build TS hatasıyla fail oldu (ayrı route sorunu, scope dışı). **Anahtar bulgu:** Next 16 yeni `PROXY_FILENAME = 'proxy'` convention'ı tanıttı — `isProxyFile(page)` otomatik true, runtime export gerekmez.
- **Çözüm:** `middleware.ts` → `src/proxy.ts` rename. **İki önemli ayrıntı:** (1) Root-level `proxy.ts` Turbopack tarafından discover edilmedi, **`src/proxy.ts`** zorunlu. (2) Function adı `export async function proxy(...)` olmalı (Next "Ensure this file has either a default or 'proxy' function export" error verir); backward-compat için `export const middleware = proxy` alias eklendi → mevcut testler bozulmadı.
- **Doğrulama:** Build artık `ƒ Proxy (Middleware)` satırı içeriyor. `functions-config-manifest.json` dolu — `/_middleware` entry `runtime: "nodejs"` + matcher regex.
- **+6 yeni regression test** (`proxy-build-manifest.test.ts`): src/proxy.ts varlığı, root middleware.ts yok, `export async function proxy` pattern, `export const middleware = proxy` alias, matcher tanımı, post-build manifest assertion (`functions["/_middleware"].runtime === "nodejs"`).
- **Mevcut test importları güncel:** 4 test dosyası `from "../../middleware"` → `from "../proxy"` (alias sayesinde davranış aynı). 1 source-regex test dosyası `middleware.ts` → `src/proxy.ts` path update.
- **next.config.ts:** `experimental.nodeMiddleware` (denenmişti) geri alındı — Next 16 type'ında yok, gereksiz.
- 8 dosya (1 rename src/proxy.ts, 1 next.config rollback, 4 test import update, 1 source-regex path update, 1 yeni test) · **3575 test yeşil** (önceki 3569 + 6 regression) · TS clean · 0 lint · build OK (manifest dolu)
- **Sıradaki:** Coolify deploy + smoke (kullanıcı tarafı). Bu sefer gerçekten çalışır.

## Önceki — M-3 Review 1 (3569 test)

**6 bulgu kapatma (P1-P3) — runtime nodejs config, login dead-code, demo GET, demo cookie, withRateHeaders, PARASUT_SYNC**

- **P1 Edge runtime fix:** Next 16 middleware default Edge → ioredis TCP socket'i çalışmaz (build geçer, runtime patlar). `middleware.ts` `config.runtime = "nodejs"` eklendi. Build doğrulandı.
- **P1 Login dead-code dokümante:** Login akışı (`login/page.tsx:21`) client-side Supabase SDK `signInWithPassword` → middleware görmez. LOGIN policy `selectPolicy` map'inde korundu ama JSDoc + memory'de "şu an etki yok, /api/auth/login server route eklenirse aktif" notu. Brute-force koruması Supabase GoTrue built-in limit'inde.
- **P2 Demo test POST→GET:** `/api/auth/demo` gerçek akışı GET (`DemoButton.tsx:16` Link, `route.ts:10` GET handler). Test ve smoke komutu güncel.
- **P2 Demo cookie auth-like detection:** demo_mode cookie de "session-like" sayılır → API_AUTH (300/dk). Demo dashboard auto-reload trafiği (alerts 60s, purchase 60s) anon 30/dk limitine takılmaz. Demo session yaratma (`/api/auth/demo`) yine DEMO 5/15dk.
- **P2 `withRateHeaders` helper:** Rate-limit allow path'lerinin TÜMÜ (`NextResponse.next` bypass, `redirect`, `401`, `403`) X-RateLimit-Limit/Remaining header alır. 429 zaten kendi set'iyle dönüyor. Tutarlı client observability.
- **P3 PARASUT_SYNC dead-code dokümante:** `/api/parasut/sync-all` CRON_PATHS'te → UI buton POST atsa 401 alır (mevcut UX bug, ayrı tur). PARASUT_SYNC policy `selectPolicy` map'inde korundu; UI flow CRON'dan çıkarılırsa aktif olur.
- **+4 regression test** (`middleware-rate-limit.test.ts`): demo cookie API_AUTH policy + ALWAYS_PUBLIC bypass X-RateLimit-* header + anon 401 X-RateLimit-* header + LOGIN policy selectPolicy invariant.
- 5 dosya (middleware + rate-limit helper JSDoc + 1 test güncellemesi + 2 memory) · **3569 test yeşil** (önceki 3565 + 4) · TS clean · 0 lint · build OK
- **Smoke komutu güncellendi:** `for i in {1..6}; do curl -I https://erp.getmedspace.com/api/auth/demo; done` → 6. denemede 429.

## Önceki — M-3 ilk implementasyon (3565 test)

**Coolify self-hosted Redis (ioredis + rate-limiter-flexible)**

- **Audit M-3 ✅:** Güvenlik audit'inde ertelenmiş bulgu. Coolify cutover sonrası Vercel platform katmanı yok → öncelik yükseldi. Saldırı yüzeyleri: login brute-force, demo abuse, AI cost amplification, Paraşüt sync, scrape.
- **Yaklaşım B:** Coolify Resource olarak self-hosted Redis. Backend: `ioredis` + `rate-limiter-flexible` (sliding window, atomic Lua). Sıfır ek hosting, same-VPS low latency.
- **Helper** (`src/lib/rate-limit.ts`): Singleton Redis lazy init (REDIS_URL yoksa fail-open). POLICIES: LOGIN 5/15dk+15dk block, DEMO 5/15dk, AI 10/dk, PARASUT_SYNC 30/dk, API_AUTH 300/dk, API_ANON 30/dk. `selectPolicy` pathname+method+auth-cookie hibrit. `extractClientIp` Coolify Traefik XFF. `detectSupabaseAuthCookie` getUser maliyetine girmeden auth proxy (sb-*-auth-token regex).
- **Middleware sıralaması:** (1) /api/health absolute bypass, (2) CRON_SECRET bypass, (3) rate-limit (IP-anchor key, hibrit policy), (4) ALWAYS_PUBLIC bypass — /api/auth/demo ve /api/ai/purchase-copilot artık koruma altında, (5) CRON 401 (M-1), (6) mevcut Supabase auth gate. 429 → JSON + Retry-After + X-RateLimit-* header'lar.
- **+26 test:** helper 11 (mock pattern: vi.hoisted + class-based MockRateLimiterRedis/MockRedis constructor invariant) + pure helper 6 + middleware 9. Mevcut middleware testleri etkilenmedi (fail-open path varsayılan ok=true).
- **Plan-domain check:** Audit M-3 kapandı, son kalan `purchase_commitments`+`column_mappings` explicit RLS policy. `feedback_no_silent_deletes` korundu.
- 6 dosya · **3565 test yeşil** (önceki 3539 + 26) · TS clean · 0 lint · build OK
- **Sıradaki:** Coolify deploy (kullanıcı tarafı — Redis Resource ekle + REDIS_URL doğrula + redeploy + smoke 6 hızlı POST /login → 6. 429).

- **P2/P3 — Geçerlilik label semantik:** `L.validity` label "Geçerlilik Süresi / Validity Period" idi ama data shape `validUntil: ISO date` (Faz 1'den beri); değer 25.06.2026 render ediliyordu — label/değer tutarsızlığı. Fix: `L.validity = { tr: "Geçerlilik Tarihi", en: "Valid Until" }` (data semantiğine hizala). `L.validUntil` ayrı key kaldırıldı; meta row + terms band + footer hepsi tek source. Süre/duration konsepti (örn. "30 GÜN / 30 DAYS") farklı feature — Faz 4d'ye (quoteDate→validUntil gün farkı helper).
- **P3 — Title + QuoteNo wording:** Plan §503 PMT brand legal wording. Fix: `L.title = { tr: "TEKLİF FORMU", en: "COMMERCIAL OFFER" }` (eskiden "TEKLİF | QUOTATION"); `L.quoteNo.en = "Offer No"` (eskiden "Quote No"). Tr aynı kaldı.
- **P3 — Footer "Fabrika" scope kararı:** Plan §527'de 4 etiket (Fabrika | Merkez | Tel | Web), kod 3 (Merkez/HQ + Tel + Web). `QuoteData.sellerAddr` tek alan (PMT'de tek operasyon adresi yeterli). Plan sapması olarak dokümante; ileride Fabrika ayrı alan istenirse Faz 4d (QuoteData genişletmesi + company_settings schema + form UI). Footer yorum genişletildi.
- **P3 — Print test:** Playwright screenshot smoke ayrı altyapı (preview UI flow + demo seed) — bu tur kapsam dışı. Yerine vitest'te **3 PRINT_CSS yapısal assertion** eklendi: (1) `@page size: A4 portrait`, (2) tbody tr break-inside avoid + page-break-inside avoid, (3) kritik section'larda `.doc-no-break` class kullanım coverage (min 5 occurrence). Manuel print preview kontrolü kullanıcı checklist'inde.
- **+5 yeni test** (2 yeni constant assertion + 3 print CSS) + 4 expected güncellemesi (Geçerlilik Süresi → Tarihi). Toplam test sayısı 3534 → 3539.
- **Plan-domain check:** `feedback_plan_domain_check` — plan §503/§521 wording hizalandı. `feedback_no_silent_deletes` — L.validUntil key kaldırıldı ama tüm callsite L.validity'ye yönlendirildi (silinmiş değil, konsolide); davranış değişmedi (label metni güncellendi). Footer Fabrika scope sapması açıkça dokümante.
- 3 dosya (1 source + 2 test) · **3539 test yeşil** (önceki 3534 + 5) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Manuel print preview kontrolü (kullanıcı tarafı) → kapanış. Veya kullanıcı kararı.

## Önceki — Faz 4c (3534 test)

**PDF PMT brand template rewrite (final visual)**

- **Plan §490-546:** QuoteDocument.tsx görsel rewrite — bilingual TR ana / EN alt italic hierarchy + Terms 3-column grid + Footer fabrika/merkez/tel/web. Faz 4 zincirinin son halkası; veri kontratı 4a Review'da kilitliydi.
- **`BILINGUAL_LABELS` constant export** (33 label pair): tüm `{tr, en}` çiftleri tek noktada. 35+ hard-coded label string → `L.x.tr` + `L.x.en` Map lookup. Drift tek noktada yakalanır, test edilebilir.
- **TR ana / EN alt italic flip:** 10 lines table header + 4 totals + 2 meta sections + 7 meta rows + 3 terms + notes/signatures/empty-rows başlık ≈ 30 noktada hierarchy flip (eski English ana / Türkçe italic alt → TR ana / EN italic alt; PMT brand standardı).
- **Terms band 3-column rewrite:** Eski 2-row vertical (Delivery + Payment ayrı satır, Validity header'da) → tek section, `grid-template-columns: 1fr 1fr 1fr` (Delivery | Validity | Payment). Conditional: en az biri dolu ise section render; boş hücreler "—" placeholder (3-column tutarlılık). Validity fmtDate ile DD.MM.YYYY.
- **Footer band 2-row layout:** Eski 3-span tek satır → (1) `<strong>Merkez/HQ:</strong>` + `<strong>Tel:</strong>` + `<strong>Web:</strong>` horizontal liste, (2) sellerName + bilingual confidential + validity prefix.
- **Notes başlık:** "Notes & Terms / Notlar & Koşullar" → "NOTLAR & KOŞULLAR / Notes & Terms" (TR ana). Signatures rol etiketi: `sig.roleTr` ana, `sig.role` italic alt.
- **+18 yeni test** (`quote-document-faz4c.test.ts`, Faz 9 PO Document paterni `renderToStaticMarkup`): 3 constant (kapsam + shape + critical labels) + 3 hierarchy (TR<EN idx kontrol) + 5 terms (3-col grid, single-fill placeholder, validUntil fmtDate, hepsi boş hidden, etiket pair proximity) + 4 footer (HQ/Tel/Web prefix + boş alanlarda defansif render) + 3 regression (Faz 4a Review Size kolonu + colSpan 10).
- **Mevcut Faz 4a Review test güncellemesi:** `quotes-faz4a-helper-mapper.test.ts` 2 testte conditional regex `deliveryMethod || paymentMethod` → `deliveryMethod || validUntil || paymentMethod` (yeni 3-col); Size header regex source string match → `BILINGUAL_LABELS.size: { tr: "Ölçü" }` constant kontrolüne dönüştürüldü.
- **Plan-domain check:** `feedback_no_silent_deletes` — hiçbir data field veya conditional render silinmedi; mevcut layout struktur korundu, yalnız etiket hierarchy + terms visual yapı + footer içerik PMT brand'ine hizalandı. Plan §544 "HS code + weight per line korunur" — 10 kolon korundu (plan ASCII §508-510 yedi kolon literal değil; kabul kriterleri authoritative). `feedback_plan_domain_check` — plan §490-546 + Faz 4a Review contract + PMT brand sözleşmesi tutarlı.
- 2 dosya değişen + 1 dosya yeni (1 source rewrite + 1 mevcut test update + 1 yeni test) · **3534 test yeşil** (önceki 3516 + 18) · TS clean · 0 lint warning · build OK
- **Faz 4 zinciri tamamlandı:** 4a (DB) → 4a Review (preview/PDF contract) → 4b (auto-build desc) → 4b Review (parts-join + dirty persist) → 4c (PDF PMT brand template). Teklif modülü revize tam tamamlandı.
- **Manuel görsel kontrol (kullanıcı tarafında):** Yeni teklif aç → Preview → Header TEKLİF | QUOTATION, lines table "Ürün Kodu" ana + "Product Code" alt, Totals "Ara Toplam" ana, Terms 3-col Delivery|Validity|Payment, Notes başlık NOTLAR & KOŞULLAR, Footer Merkez/HQ/Tel/Web horizontal. Yazdır → A4 sığar.
- **Sıradaki:** Kullanıcı kararı — Faz 5 alanı (henüz tanımlanmadı) veya mevcut modüllerde Bulgular turu.

## Önceki — Faz 4b Review 1 (3516 test)

**3 bulgu kapatma (P2-A, P2-B, P3)**

- **P2-A (clearAll dirty Set):** `QuoteForm.clearAll()` rows + nextId sıfırlıyordu ama `descDirtyRowIds` Set'i sıfırlamıyordu. Kullanıcı row 1 desc'ini düzenleyip Temizle → yeni boş row 1'de ürün seçince eski dirty ID 1 hâlâ Set'te → auto-build atlanıyordu. Fix: `setDescDirtyRowIds(new Set())` çağrısı clearAll'a eklendi.
- **P2-B (refresh sonrası auto-gen sanılma — ticari risk):** localStorage restore'da non-empty desc'lerin hepsi dirty kabul ediliyordu — kullanıcı ürün A seçip auto-desc geldi → refresh → ürün B seçince A'nın desc'i kalıyordu (yanlış ürün açıklaması). Fix: autoSave `teklif_v3`'e `descDirty: boolean[]` index-aligned persist eder; restore `Array.isArray(saved.descDirty)` ise ondan rebuild eder, yoksa eski payload için backward-compat fallback (non-empty filter). useCallback dep array'ine `descDirtyRowIds` eklendi (stale closure önlenir).
- **P3 (plan örneği vs şablon noktalama):** Plan §486 şablonu `body_material` sonrası virgülsüzdü, §487 örnek `A105 GÖVDE, CLASS 600...` ile virgül istiyordu. PMT teklif diline uygun olarak **örnek authoritative kabul edildi**. Helper literal template substitution'dan **parts-join paterniyle refactor edildi**: `part1 = name+body`, `part2 = pn+end`, `part3 = trim+TRİM` → `parts.filter(Boolean).join(", ")`. Constant `QUOTE_DESCRIPTION_TEMPLATE` doc-only olarak `{name} {body_material}, {pn_class} {end_connection}, {trim_material} TRİM` ile güncellendi. Plan §486 hizalandı.
- **+4 yeni regression testi** (`quotes-faz4b-form-integration.test.ts`): clearAll dirty reset, autoSave descDirty boolean[] write, restore `Array.isArray(saved.descDirty)` yeni payload, useCallback dep'inde `descDirtyRowIds`. Mevcut 6 source-regex korundu (1 update — backward-compat fallback paterni); helper'ın 13 davranış testinin expected output'ları yeni parts-join sonuçlarına güncellendi (örnek § 487 birebir).
- **Plan-domain check:** `feedback_no_silent_deletes` — eski parts'tan hiçbir field silinmedi, sadece noktalama düzeldi. `feedback_plan_domain_check` — plan §486 şablonu örneğe (§487) hizalandı, helper ile doc tek source.
- 5 dosya (1 helper refactor + 1 form fix + 1 test güncelleme + 1 test eklemesi + 1 plan doc) · **3516 test yeşil** (önceki 3512 + 4 yeni integration; helper test sayısı sabit) · TS clean · 0 lint · build OK
- **Sıradaki:** Faz 4c — PDF PMT brand template rewrite.

## Önceki — Faz 4b (3512 test)

**Auto-build description helper + form integration**

- **Plan §484-488:** Teklif satırında ürün seçilince description otomatik dolar; şablon `{name} {body_material} {pn_class} {end_connection}, {trim_material} TRİM`. Vana-merkezli — multi-type uyum için graceful degrade (non-Vana ürünlerde yalnız `name` çıkar).
- **Pure helper** `src/lib/quote-description-builder.ts`: template constant + `buildQuoteLineDescription(product)`. Post-processing: `trim_material` boş ise trailing "TRİM" düşer; çift boşluk collapse; leading/trailing virgül-boşluk trim. Number/boolean attribute string'e çevrilir; array/object boş muamelesi (defansif).
- **QuoteForm güncellemesi:** import + yeni `descDirtyRowIds: useState<Set<number>>` state. `handleSelectProduct` `!descDirtyRowIds.has(rowId)` guard + helper çağrısı (fallback `|| p.name`). Description input onChange ilk manuel düzenlemede `prev.has(row.id) ? prev : new Set(prev).add(row.id)` paterniyle Set'e ekler (referans eşitliği — gereksiz re-render yok). 2 hydration noktası: initialData (tüm satırlar dirty — DB desc'leri korunur) + localStorage (non-empty desc filter).
- **+19 test:**
  - `quote-description-builder.test.ts` (yeni, +13): template constant doc + Vana tam/eksik trim/eksik body, Conta degrade, attrs null/undefined, name boş, hepsi boş, number coercion, whitespace-only trim, array attr, name extra whitespace.
  - `quotes-faz4b-form-integration.test.ts` (yeni, +6): helper import + dirty Set state + handleSelectProduct guard + onChange Set update + initialData hydration dirty + localStorage hydration filter.
- **Plan-domain check:** `project_pmt_multi_type` — Vana dışı tipler graceful degrade ediyor, kullanıcı sürprizi yok. `feedback_no_silent_deletes` — eski "desc = p.name" davranışı override edilebilir hâle gelir, hiçbir state silinmedi. `feedback_plan_domain_check` — Vana seed (`057_seed_product_types.sql:30-44`) field_key'leriyle birebir uyumlu.
- 4 dosya (1 helper + 2 yeni test + 1 form güncelleme) · **3512 test yeşil** (önceki 3493 + 19) · TS clean · 0 lint · build OK
- **Sıradaki:** Faz 4c — PDF PMT brand template rewrite (logo, bilingual full header, lines tablosu Sıra/Ölçü/Tanım/Miktar/Birim/B.Fiyat/Toplam, footer band, signatures grid). Veri kontratı (Faz 4a Review'da kilitlendi) hazır.

## Önceki — Import E2E (3493 test)

**Banner testid scope (route announcer collision fix)**

- **Açık E2E kırmızı (Faz 4a dışı):** `tests/import.spec.ts` "geçersiz dosya türü yüklenince hata mesajı" testi `page.getByRole("alert")` ile Next.js App Router prod build route announcer'ı (otomatik enjekte `<div role="alert">`) ile çakışıyordu → Playwright strict mode 2+ element → fail. E2E: 11 passed, 1 failed.
- **Fix:** `page.tsx:607` error banner div'ine `data-testid="import-error-banner"` eklendi (`role="alert"` + `aria-live="polite"` korundu — a11y semantiği bozulmadı). `tests/import.spec.ts:68` `getByRole("alert")` → `getByTestId("import-error-banner")`; içerik regex assertion (`toContainText(/desteklenmiyor|geçersiz|xlsx|excel/i)`) çift katmanlı güvence olarak kalır. Aging E2E (testid + içerik regex) ile uyumlu desen.
- **+2 source-regex test** (import-page-faz3d.test.ts): banner testid present + tests/import.spec.ts getByTestId kullanımı + eski getByRole alert regression'ı kapatan defense-in-depth.
- **Küçük not scope DIŞI (kullanıcı kendi belirtti):** Yeni teklif draft restore (refresh sonrası teslimat/ödeme döner mi) — mevcut draft davranışıyla uyumlu, Faz 4A blocker değil. Ayrı tur.
- 3 dosya · **3493 test yeşil** (önceki 3491 + 2) · TS clean · 0 lint · build OK
- **Sıradaki:** Faz 4b — auto-build description helper + form integration (`{name} {body_material} {pn_class} {end_connection}, {trim_material} TRİM` şablonu).

## Önceki — Faz 4a Review (3491 test)

**Preview/PDF contract + PATCH validation**

- **P3-A:** Form DB'ye yazıyordu ama preview/PDF kontratı (`QuoteData`) Faz 4a alanlarını taşımıyordu. Fix: `quote-types.ts` genişlet, `QuoteForm` autoSave + savePreviewData payload + useCallback dep, `QuoteDocument` Notes öncesi conditional Teslimat/Ödeme bloğu + lines `Size/Ölçü` kolonu (colSpan 9→10). Minimal — 4c full PMT brand rewrite gelecek.
- **P3-B:** PATCH draft branch'inde POST ile parity yoktu; `validateStringLengths(body)` eklendi (recursive nested `lines[].size_text` dahil).
- **+11 test** (contract source-regex 7 + PATCH validation 4).
- 6 dosya · **3491 test yeşil** · TS clean · 0 lint · build OK

## Önceki — Faz 4a (3480 test)

**Teklif modülü PMT brand alanları (DB + form)**

- Plan §466 Faz 4 — alt-faz: 4a (DB+form, şimdi), 4b (auto-build desc), 4c (PDF PMT brand rewrite).
- Migration 065: quotes.delivery_method/payment_method TEXT + quote_line_items.size_text TEXT (idempotent + ROLLBACK). RPC'ler güncellendi.
- Type+helper+mapper genişletildi (`QuoteRow`, `QuoteLineItemRow`, `QuoteDetail.deliveryMethod/paymentMethod`, `QuoteLineItem.sizeText`).
- QuoteForm: `size` per-row state + tablo kolonu + 2-kolonlu bilingual Teslimat/Ödeme textarea bloğu (notes üstünde). buildQuotePayload 3 yeni alanı yollar.
- **+20 test** (migration 7 + helper/mapper/form source-regex 13).
- 7 dosya · **3480 test yeşil** · TS clean · 0 lint · build OK
- **Sıradaki:** Faz 4b — auto-build description (ürün seçince `{name} {body_material} {pn_class} {end_connection}, {trim_material} TRİM` doldur, override edilebilir).

## Önceki — Aging E2E 2 fail kapatma (3460 test)

**Tab + threshold testid**

- **Kök:** Tab `getByText` label+subtitle render çakışma riski; `/45 gün/i` tablo `daysWaiting} gün` ile strict mode collision (seed-dependent); "Mamul" vs gerçek "İmalat" label tutarsızlığı.
- **Fix:** REPORT_TABS button'lara `data-testid="aging-report-tab-{key}"`; threshold div'e `role="note"` + `data-testid="aging-threshold-hint"`. Test'ler `getByTestId(...).toContainText(/45 gün/i)` çift katmanlı. "Mamul" → "İmalat".
- **+3 test** (aging-page-testids.test.ts source-regex lock).
- 3 dosya · **3460 test yeşil** · TS clean · 0 lint · build OK
- E2E (sende): 8/8 passed beklenir (önceki 6/8).

## Önceki — Faz 3d Review 2.tur (3457 test)

**error banner role="alert" + accordion testid**

- **P2 son E2E fail:** Geçersiz dosya testi geniş regex 7 element'e çakışıyordu (DropZone/empty/summary/accept attribute). Error banner'a `role="alert"` + `aria-live="polite"` + close button `aria-label`. Test artık `getByRole("alert") + toContainText(regex)` ile çift katmanlı.
- **P3 accordion stabilite:** `<details data-testid="classic-mode-accordion">`; beforeEach testid scope (sayfaya başka details eklense bile stable).
- **+2 test** (source-regex lock).
- 3 dosya · **3457 test yeşil** · TS clean · 0 lint · build OK
- **Sıradaki:** Aging E2E 2 fail (ayrı tur) veya Faz 4.

## Önceki — Faz 3d Review 1.tur (3455 test)

**3 bulgu + E2E adaptasyon**

- **P3 typo:** "ürün kataloğları" → "ürün katalogları" (page.tsx:483).
- **P3 scroll/focus:** Yeni `openClassicFromCta` helper — migration_excel CTA'sından accordion açılınca smooth scroll. `<details ref={classicDetailsRef}>`. Manuel summary tıklamada native scroll yeterli.
- **P2 E2E (9 fail):** Klasik wizard input'una `data-testid="classic-import-file"` + `tests/import.spec.ts` `CLASSIC_FILE_INPUT` constant ile tüm locator'lar scope'landı. `beforeEach` accordion auto-open (`details.open = true` evaluate). `isVisible()` → `isAttached()` (input display:none).
- Eslint config: `playwright-report/**` + `test-results/**` global ignore (185 error/2828 warning fix).
- **+3 test** (import-page-faz3d source-regex lock).
- 5 dosya · **3455 test yeşil** · TS clean · 0 lint · build OK
- **Sıradaki:** Aging E2E (2 fail) scope dışı; Faz 4 veya kullanıcı kararı.

## Önceki — Faz 3d (3452 test)

**Klasik mod accordion + AI default akış polish**

- Faz 3a tab toggle ("AI ile Aktar" / "Klasik Mod") kaldırıldı; AI artık varsayılan + her zaman görünür akış. Header tek satır AI odaklı.
- Empty state: `aiFiles.length === 0` ise yardım metni (role="status") + Migration Excel için Gelişmiş Mod yönergesi.
- Klasik 7-adım wizard `<details>` collapsible'a alındı (`showClassic` state, default kapalı, summary "Gelişmiş: Klasik Mod — eski 7-adım Excel wizard"). Eski state'ler/fonksiyonlar silinmedi (no_silent_deletes).
- ClassifierQueue `onOpenClassicMode?: () => void` opsiyonel prop: migration_excel kartında tıklanabilir "Klasik Mod'a geç ↓" button; parent setShowClassic(true) ile accordion auto-open. Callback yoksa eski disabled span (backward compat).
- **+11 test** (import-page-faz3d source-regex 9 + classifier-queue-interaction onOpenClassicMode 2).
- 4 dosya · **3452 test yeşil** · TS clean · 0 lint · build OK
- **Sıradaki:** Faz 4 (teklif modülü revize) veya kullanıcı karar.

## Önceki — Faz 3c Review 5.tur (3441 test)

**status_update_failed UI/API propagate**

- **Bulgu:** 4.tur post-commit guard duplicate engelliyordu ama route 200 + result olduğu gibi dönüyor, UI successCount>0 görüp `setDocStatus("applied")` çağırıyordu → yanıltıcı "Belge uygulandı" + refresh sonrası DB/UI state tutarsız. `status_update_failed` audit'te vardı ama frontend göremiyordu.
- **Fix:** `ApplyResult` shape'ine `status_update_failed: boolean` (default false). Service post-commit catch'te `result.status_update_failed = true` set eder. UI: flag true → `setDocStatus("applying")` + warning toast "{N} işlem yazıldı ama güncellenemedi, yönetici müdahalesi gerek" + result panel'de role="alert" admin recovery uyarı bandı. Success toast YOK. `ApplyResultSummary` opsiyonel `status_update_failed?: boolean` (eski response backward compat).
- **+3 test** (service result alan happy/fail + UI conditional render).
- 4 dosya · **3441 test yeşil** · TS clean · 0 lint · build OK
- **Sıradaki:** Faz 3d — klasik mod toggle cleanup.

## Önceki — Faz 3c Review 4.tur (3439 test)

**Post-commit rollback fix (P2 duplicate engel) + applying state UX (P3)**

- **P2 (kritik):** 3.tur outer catch successCount>0 sonrası status fail'inde de 'classified'e rollback yapıyordu → duplicate apply riski (ürün/cert zaten yazılmış). Fix: applied UPDATE ayrı try/catch, fail → `postCommitStatusFailed=true`, doc 'applying'de takılı, audit `status_update_failed: true`. Tekrar Apply → claim null → "hazır değil (applying)" → duplicate sıfır. Admin manuel SQL ile düzeltir.
- **P3 (UX):** Route applying → 409 + "başka oturum uygulanıyor"; UI `isDocApplying` derive + buton/footer + handleApply 409 handler (info toast + setDocStatus).
- **+7 test** (apply-service 3, route 2, RTL 2).
- 4 dosya · **3439 test yeşil** · TS clean · 0 lint · build OK
- **Sıradaki:** Faz 3d — klasik mod toggle cleanup (eski 7-adım wizard "Klasik Mod" altına gizleme).

## Önceki — Faz 3c Review 3.tur (3432 test, 2 commit)

**Apply concurrency + cert versioning identity**

- **Bulgu 1 (cert versioning identity, kullanıcı kararı A):** file_name bazlı supersede korundu — plan literal "ürün bazlı" reddedildi. Gerekçe: PMT'de bir vananın paralel meşru aktif cert'leri (heat/test/standart) olabilir; literal supersede regression yaratırdı. Helper JSDoc'una LIMITATION + plan dokümanına identity kararı eklendi. +2 test (source lock + behavior lock).

**Önceki bulgu — Apply concurrency atomic claim (commit `5f1dea0`):**

- **P2 (TOCTOU race):** `serviceApplyImportDocument` başta JS-side status check yapıyordu, atomic lock yoktu. İki paralel apply çağrısı classified status'unu aynı anda görüp duplicate product/cert riski. Faz 8 `dbClaimBatchForConfirm` paterni uygulandı.
- Migration 064 → `import_documents.status` CHECK genişledi (+ 'applying' ara state).
- Yeni helper `dbClaimImportDocumentForApply(id)`: tek SQL CAS `classified → applying RETURNING`. Null = race lost.
- Service: claim (null → "hazır değil" throw); try block içinde lines/storage/per-row/finalize. Final: success→'applied', all-fail/eligible-0→'classified' (lock serbest), exception→catch rollback 'classified' + throw.
- **+11 test** (migration 4, helper 4, service 3 yeni + 5 mevcut güncelleme; 20 `mockGetDoc` → `mockClaim` taşındı).
- 7 dosya (1 commit) · **3430 test yeşil** · TS clean · 0 lint · build OK
- **Sıradaki:** Bulgu 1 (cert versioning identity) — file_name match plan'la uyumsuz (plan ürün bazlı diyor). Kullanıcıya 3 seçenek: A) file_name only (mevcut + dokümante), B) product+kind literal (plan reading), C) metadata.cert_no kompozit. AskUserQuestion ile karar.

## Önceki — Faz 3c Review 2.tur (3419 test, 2 commit)

**UI sertifika geçmişi + Yeniden Çıkar applied guard**

- **Bulgu 1 (P3, commit `6a7cb39`):** ExtractionReview "Yeniden Çıkar" butonu docStatus=applied iken disabled + "Belge uygulandı, tekrar çıkarılamaz" tooltip. Uygula butonuyla simetri. +1 RTL test.
- **Bulgu 2 (P2, commit `3440a5d`):** Sertifika geçmiş görünümü — 1.tur supersede helper'ı UI'da görünür hale geldi. dbListAttachmentsByProduct opsiyonel `{ includeSuperseded }` 3.param (geriye uyumlu); GET route `?includeSuperseded=1` query → `{ items, superseded, expires_in }` shape; mapper + ProductAttachment.supersededBy alanı; UI Ekler sekmesinde "Önceki Sertifika Versiyonları (N)" collapsible (default kapalı, ▸/▾ toggle, faded liste, İndir butonu reuse handleDownloadDocument, Sil yok — forensic). +16 test.
- **Toplam +17 test** (8→25 attachment-domain test artışı)
- 12 dosya (2 commit) · **3419 test yeşil** · TS clean · 0 lint · build OK
- **Sıradaki:** Faz 3d — klasik mod toggle cleanup (eski 7-adım wizard "Klasik Mod" altına gizleme, AI default akış polish).

## Önceki — Faz 3c Review 1.tur (2026-05-22; 3401 test, commit `14a7253`)

- **P2-1 (cert versiyonlama):** Yeni `dbSupersedeCertificatesByName` helper'ı (ad bazlı eşleşme, self-exclude). Apply cert branch'inde dbCreateAttachment sonrası çağrılır; fail warning olarak errors[]. UI'da "N eski sertifika önceki versiyona alındı".
- **P2-2 (all-fail policy):** successCount===0 ise doc 'classified' kalır, retry mümkün. UI button enabled + warning toast.
- **P3 (PATCH 409):** Applied belgede satır PATCH'i 409. Parent doc fetch eklendi.
- **P3 (aggregate audit):** Tek audit_log entry action='import_applied' (success/all-fail dahil). Insert fail silent.

---

## Önceki — Faz 3c (3387 test)

**Faz 3c — Review screen apply pipeline (3387 test)**

- **Service:** `serviceApplyImportDocument` — eligible filter (matched|reviewed|new_product), per-row try/catch loose; new_product → dbCreateProduct (+ untyped_products counter), matched|reviewed → dbUpdateProduct (attributes merge), cert+matched → dbCreateAttachment kind=certificate. Doc terminal state 'applied' (idempotency guard).
- **Cert versiyonlama:** scope dışı — superseded_by yazılmaz, tüm cert'ler aktif (UI zaten filter'lı).
- **NULL type:** Faz 1 izin veriyor → ürün yaratılır, UI warning toast.
- **Route:** POST /apply, requireRole admin|purchaser, revalidateTag, pre-check 400 mapping.
- **UI:** "Uygula" aktif button + applyResult sonuç paneli (counts + untyped warning + errors accordion) + isDocApplied → "Belge uygulandı".
- **+27 test** (service 13 + route 6 + RTL 6 + helper 2)
- 6 yeni · 3 değişen · **3387 test yeşil** · TS clean · 0 lint · build OK
- **Sıradaki:** Faz 3d — klasik mod toggle cleanup (eski 7-adım wizard "Klasik Mod" altına gizleme, AI default akış).

---

## Önceki — Faz 3b Review 6.tur (3360 test)

**Faz 3b Review 6.tur — Type-aware matcher + cert-flow per-row Tip kolonu (3360 test)**

- **P2 (matcher type-aware):** Multi-type extraction'da AI seçtiği `product_type_id` matcher'a forward edilmiyordu. Soft boost (+20) / penalty (-20) paterni: `MatchableProduct` + `ExtractedRowInput` + `scoreProductMatch` + 0 floor. Vana DN50 ile Conta DN50 ayırt edilir; SKU+name=85 (UNIQUE anchor) tip mismatch'le bile auto-match kalır.
- **P3 (cert-flow per-row Tip kolonu):** Header filter 5.tur'da gizlendi ama tablo başlığı + cell hâlâ render ediliyordu — `!isCertFlow` guard ile temizlendi.
- **+10 test:** matcher (8 senaryo: aynı tip / farklı tip / null fallback / 0 floor / 2 multi-type ranking) + route forward + RTL cert tablo Tip yok
- 6 dosya · **3360 test yeşil** · TS clean · 0 lint · build OK

---

## Önceki — Faz 3b Review 5.tur (3350 test)

**Faz 3b Review 5.tur — cert-flow productTypeId validation bypass (3350 test)**

- **P2:** 4.tur early validation cert-flow'u da etkiliyordu — stale suggested_product_type_id ile sertifika 400 alıyordu. Validation `bodyProductTypeId && isProductFlow` koşuluna alındı. UI'da cert-flow'da filter `<select>` gizlendi + `overrideTypeId` init boş + handleExtract body'ye productTypeId eklemiyor.
- **+2 test:** extract-route (cert-flow invalid id → 201, mockGetProductType not called) + RTL (cert-flow render → filter yok + body productTypeId undefined)
- 4 dosya · **3350 test yeşil** · TS clean · 0 lint · build OK

---

## Önceki — Faz 3b Review 4.tur (3348 test)

**Faz 3b Review 4.tur — Early validation + bulk approve RTL test (3348 test)**

- **P3 (early validation):** Invalid `bodyProductTypeId` storage download + `loadActiveMatchables` öncesinde 400 döner. Gereksiz I/O atlanır. `resolvedBodyType` reuse → ek fetch yok.
- **P3 (bulk approve RTL):** Yeni `extraction-review-interaction.test.tsx` (jsdom). 3 senaryo: tümü başarılı → tümü Onaylandı + 1 router.refresh; karışık → reviewed/matched ayrı badge + ayrı toast; matched yoksa → info toast, fetch atmaz. Stale UI regression unit-test'le kilitli.
- 3 dosya · **3348 test yeşil** · TS clean · 0 lint · build OK

---

## Önceki — Faz 3b Review 3.tur (3345 test)

**Faz 3b Review 3.tur — Multi-type extraction refactor (3345 test)**

- **Kullanıcı feedback:** "PMT tek tip ürün katoloğu olan bir firma değil" → 2.tur'daki tek-tip assumption düzeltildi
- **AI service:** productTypeContext → availableProductTypes Array; AI item başına product_type_id seçer; parseExtractionResponse dinamik field whitelist (item.product_type_id'ye göre)
- **Extract route:** dbListProductTypes + Promise.all multi-fetch; bodyProductTypeId artık "restrict" (filter); uniform inject KALDIRILDI — AI'nın seçimi doğrudan persist
- **PATCH route + helper:** product_type_id override (UUID + existence check); UpdateLineMatchInput koşullu pass-through
- **UI ExtractionReview:** "Otomatik (AI seçer)" default header + tablo'ya "Tip" kolonu dropdown + formatProductTypeName helper
- **Plan doc + memory:** MODUL_REVIZE_PLAN multi-type uyumlu; project_pmt_multi_type.md memory eklendi
- **+16 test** · 11 dosya · **3345 test yeşil** · TS clean · 0 lint · build OK

---

## Önceki — Faz 3b Review 2.tur (3329 test)

**Faz 3b Review 2.tur — 4 yeni P2/P3 bulgu kapatma (3329 test)**

- **P2 (SKU UNIQUE anchor):** SKU exact +40 → +60. `products.sku` UNIQUE constraint sayesinde güvenli; SKU-only 60 pending (AI halüsinasyon koruması), SKU+name 105 clamp 100 matched (cert auto-link).
- **P2/P3 (multi-type):** Faz 3b tek-tip katalog varsayımıyla uygulandı; plan dokümanına uygulama notu eklendi, multi-type karışık katalog 3c+'a ertelendi (PMT için pratik gereklilik düşük).
- **P3 (bulk approve stale state):** `router.refresh()` client state'i tutmuyordu; `setLines` optimistic update eklendi (`succeededIds` Set + `match_action='reviewed'` + `reviewed_at` ISO).
- **P3 (invalid productTypeId fail-closed):** Body'den gelen id helper null dönerse 400 "Belirtilen ürün tipi bulunamadı". Classification suggestion'da best-effort davranış korunur.
- **+3 test:** matcher (SKU-only pending + SKU+name 100) + extract-route (invalid 400 + stale classification 201)
- 6 dosya · **3329 test yeşil** · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 3b Review (3326 test)

**Faz 3b Review — 6 P2/P3 bulgu kapatma (3326 test)**

- **P2-A** (product_type_id taşıma): Migration 063 + interface + helper + route inject → 3c "yeni ürün hangi tipte?" belirsizliği kalktı
- **P2-B** (matcher formülü): SKU+40, name_high+45, attr per-grup +20 (KEY_ATTR_GROUPS); plan'ın "DN+sınıf+isim → auto" tarifi karşılandı (85 puan)
- **P2-C** (empty re-extract silent silme): Route 422 guard + cert flow null-signal guard; UI info toast handler
- **P2/P3-D** (N full scan perf): `loadActiveMatchables` cache + matcher `productsCache` param → N satır × 1 fetch
- **P2-E** (bulk approve sessiz fail): `Promise.all` → res.ok kontrolü + okCount/failedCount toast
- **P3-F** (PATCH validation): UUID_RE + dbGetProductById exists/active + confidence 0-100 range
- **+21 test** (5 yeni dosya yok ama 1 yeni: migration-063, kalan 5 dosya genişletme)
- 12 dosya · **3326 test yeşil** · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 3b (3305 test)

**Faz 3b — Type-aware Extractor + Matching (3305 test)**

- **Backend:** Migration 062 (`import_document_lines` + pg_trgm indexes products(name, sku)). Helper (`dbCreateExtractedLines`, `dbListLinesByDocument`, `dbReplaceLinesForDocument`, `dbUpdateLineMatch`). Matcher (`scoreProductMatch` SKU+40/name+30/attr+20/partial+10; `decideMatchAction` 85/60 thresholds; trigramSimilarity Jaccard). 2 yeni AI fn: `aiExtractProductsFromDocument` (productType context, multimodal, JSON array, hard cancel) + `aiExtractCertificateTarget` (single target). AiFeature +2 entries.
- **Routes:** POST extract (doc_type routing catalog/datasheet/cert/compliance/test_report; migration_excel→400 Klasik Mod; storage download + 4 katman 499 hard cancel), GET lines, PATCH line-match (reviewed_by audit).
- **Frontend:** ClassifierQueue "İncele →" Link (extraction supported) + "Klasik Mod'a geçin" CTA + "Kapsam dışı" disabled. Yeni route `/dashboard/import/extract/[documentId]` (RSC + ExtractionReview client component: tablo + candidate dropdown + bulk approve + Apply 3c placeholder).
- **+105 test (9 dosya):** migration (12) + helper (16) + matcher (18) + AI products (16) + AI cert (8) + extract route (11) + lines route (4) + line patch (7) + UI helpers (13).
- 19 dosya · **3305 test yeşil** · TS clean · 0 lint warning · build OK
- **Sıradaki:** Faz 3c — Review screen + apply pipeline (matched → product update; new_product → product create; cert → product_attachments + superseded_by versiyonlama). Sonra Faz 3d (klasik mod toggle cleanup).

---

## Önceki — Faz 3a Review 3.e (3200 test)

**Faz 3a Review 3.e — Commit-point semantik netleştirme (3200 test)**

- **P3 KAPANDI** (commit point): Hard cancel garantisi `dbCreateImportDocument` çağrısına KADAR. Helper başladıktan sonra 3-step orphan-safe transaction (INSERT pending → upload → UPDATE classified) kendi try/catch'i ile tamamlanır; signal helper'a yayılmaz. Nadir orphan 3c'deki 30-gün cron'a bırakıldı.
- **Karar:** Helper'a signal yaymak storage cleanup async olduğu için race penceresini sıfırlamaz, sadece daraltır. Commit point semantiği temiz; doc'a netleştirildi (`dbCreateImportDocument` JSDoc + route.ts pre-write yorum). Kod davranışı değişmedi.
- 4 dosya · **3200 test yeşil** · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 3a Review 3.d (3200 test)

**Faz 3a Review 3.d — Pre-write abort guard (auth.getUser race) (3200 test)**

- **P3 KAPANDI** (pre-write guard): 3.c post-AI guard'dan sonra `createClient()` + `auth.getUser()` async; bu pencerede client koparsa DB+storage write yine olabiliyordu. `dbCreateImportDocument` hemen öncesi 4. signal guard eklendi → 499. Hard cancel garantisi 4 katmana çıktı (pre-AI / in-AI / post-AI / pre-write).
- **+1 test:** `mockGetUser` module-level fn'e dönüştürüldü; getUser içinde `ctl.abort()` ile race simüle.
- 3 dosya · **3200 test yeşil** · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 3a Review 3.c (3199 test)

**Faz 3a Review 3.c — Server-side hard cancel (P3) + doc hijyen (3199 test)**

- **P3 KAPANDI** (server-side hard cancel): Client `AbortController` (3.b) sadece best-effort — request route'a girdiyse AI hâlâ çalışıyordu (orphan row + token yakımı). 3 katmanlı koruma: (1) `route.ts` pre-AI `req.signal.aborted` → 499; (2) `aiClassifyDocument(input, signal?)` → Anthropic SDK `client.messages.create(params, {signal})` (v0.80.0 RequestOptions); abort durumunda graceful fallback DEĞİL, AbortError re-throw; (3) `route.ts` post-AI guard → DB write skip. HTTP 499 (Client Closed Request) — log/telemetry için.
- **CLAUDE.md tarih hijyeni:** `_Son güncelleme: 2026-05-19_` → `2026-05-20`.
- **+7 test** (4 route + 3 ai-service)
- 4 dosya · **3199 test yeşil** · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 3a Review 3.b (3192 test)

**Faz 3a Review 3.b — In-flight fetch abort (P3) (3192 test)**

- **P3 KAPANDI** (in-flight fetch abort): `ClassifierQueue` `uploadAndClassify` fetch'e `AbortSignal` geçmiyordu → kullanıcı classifying durumundaki kartı kaldırırsa (× veya "Listeyi Temizle") `/api/import/classify` request'i devam ediyor, AI çalışıyor, `import_documents` row + storage file yazıyordu. UI'da dönüş yolu yok → orphan kayıt + boşa AI cost. **Çözüm:** per-item `AbortController` Map (`abortControllersRef`); fetch `signal` parametresi alır; `remove`/`clearAll`/unmount cleanup'ta `ctl.abort()` + Map'ten temizle. `uploadAndClassify` `signal.aborted` ise `{ ok: false, aborted: true }` döner; effect handler aborted result'ı erken return ile yutar (UI'a hata yansımaz, kart zaten state'ten silindi).
- **+2 test**: classifying sırasında remove → signal.aborted=true; clearAll → tüm signals abort
- 2 dosya · **3192 test yeşil** (+2) · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 3a Review 3. tur (3190 test, commit `444dced`)

**Faz 3a Review 3. tur — Stale file re-fetch (P2) + plan dokümanı drift (P3) (3190 test)**

- **P2 KAPANDI** (stale file re-fetch): `ClassifierQueue.remove(id)` sadece internal queue'yu filtreliyor, parent `aiFiles` state'inden düşürmüyordu → kullanıcı bir kartı × ile kaldırdıktan sonra yeni dosya ekleyince stale File referansı parent'tan gelip useEffect'te yeniden "uploading" item olarak ekleniyor → duplicate POST `/api/import/classify` + AI token + `import_documents` row. **Çözüm:** `onRemove?: (file: File) => void` opsiyonel prop; `remove()` handler önce File ref'i bulup parent'a bildirir; page.tsx `onRemove={file => setAiFiles(prev => prev.filter(f => f !== file))}`. File identity (referans eşitliği) korunduğu için `!==` filter güvenli.
- **P3 KAPANDI** (plan dokümanı drift): `MODUL_REVIZE_PLAN.md` line 398 `"confidence": 0-100` → `<0.0-1.0 float>`; `suggested_product_type` → `suggested_product_type_id` (gerçek prompt `ai-service.ts:1181` ile aligned). Kod tutarlıydı, sadece 3b/3c yazımını yanıltacak dokümantasyon.
- **+2 test**: parent-wrapper RTL (A kaldır → B ekle → fetch sayısı 2; A geri dönmemeli) + onRemove opsiyonel backward-compat
- 4 dosya · **3190 test yeşil** (+2) · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 3a Review 2. tur (3188 test)

**Faz 3a Review — 4 P2/P3 bulgu kapatıldı + cancelled-flag bug fix (3188 test)**

- **P2 KAPANDI** (render-phase fetch): `ClassifierQueue` queue sync + concurrency driver useEffect içine alındı; render-phase'de network çağrısı yok → Strict Mode/concurrent render güvenliği.
- **P2 yeni bug (cancelled-flag)** — P2 fix sırasında ortaya çıktı + KAPANDI: useEffect cleanup `cancelled = true` her queue patch'inde re-run sonrası tüm in-flight fetch.then()'leri iptal ediyordu → state `classifying`'de takılı kalıyordu (prod'u da kırıyordu). **Çözüm:** `mountedRef = useRef(true)` paterni + ayrı unmount-only cleanup useEffect; queue-dep effect cleanup'sız (re-render iptal etmesin diye).
- **P3-008 KAPANDI** ("Listeyi Temizle"): `clearAll` handler internal `setQueue([])` + parent `onClear?.()`; kullanıcı listeyi temizlediğini sanıp kartların kalmasını engellendi.
- **P3-009 KAPANDI** (plan ↔ implementation çelişkisi): `MODUL_REVIZE_PLAN.md` "SIRALI işlenir" satırı bounded-parallel cap 3 olarak güncellendi (gerekçe: Anthropic Haiku 50 req/min güvenli; UX kayba değmez).
- **P3-010 KAPANDI** (UI interaction testleri): `@testing-library/react` + `jsdom` kuruldu; `vitest.config.ts` `.test.tsx` glob eklendi; `cleanup()` afterEach pattern (RTL v15+ Vitest auto-cleanup yok). 5 RTL interaction testi (happy/Strict Mode/retry/remove/clear) + 7 `selectClassifyCandidates` pure helper testi (concurrency state machine inline mantığı extract edildi).
- **+13 test** (5 RTL + 7 selectClassifyCandidates + 1 küçük) · 3188 test yeşil · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 3a — AI Import drop-anywhere UI + multimodal classifier (3175 test, commit `3757e48`)

**Faz 3a — AI Import drop-anywhere UI + multimodal document classifier (3175 test)**

- **Alt-faz şeması:** Faz 3 → 3a (drop-anywhere + classifier — bu), 3b (type-aware extraction + matching), 3c (review + apply pipeline), 3d (klasik mod toggle + cleanup).
- **Kararlar:** Tam multimodal (PDF document block + image content block + Excel text-first), eski 7-adım "Klasik Mod" toggle altında, mevcut `product-files` bucket reuse (yeni bucket yok), inline base64 (Files API 3b'ye ertelendi).
- **Backend:**
  - Migration 061: `import_documents` tablo (batch_id NULL'a izinli, classification jsonb, status enum: pending/classifying/classified/error/applied, file_size>0 CHECK, idx batch + idx status+created, RLS service_role).
  - Helper `src/lib/supabase/import-documents.ts`: `CLASSIFIER_ALLOWED_MIME` (Excel/CSV genişletmesi), 3-step orphan-safe `dbCreateImportDocument` (insert → upload → patch, fail → DB+storage cleanup), `dbGetImportDocument`/`dbListImportDocumentsByBatch`/`dbUpdateImportDocumentClassification`/`dbMarkImportDocumentError`.
  - AI service: `aiClassifyDocument` (multimodal, graceful fail), `pickContentBlockForMime` pure helper export, `parseClassifierResponse` pure helper. System prompt: 10 doc_type + product_types context + JSON-only. `logAiRun` feature="import_classify".
  - Route `POST /api/import/classify`: multipart, `requireRole(["admin","purchaser"])`, validate (size/MIME), Excel için `extractExcelTextSample` server-side parse, AI graceful fail → status='classified' + document_type='unknown'.
- **Frontend:**
  - `src/components/import/DropZone.tsx`: drop-scope sınırlı, multi-file, accept whitelist, drag-over visual, `validateClassifyUpload`/`pickAcceptForMime`/`formatBytes` pure helpers.
  - `src/components/import/ClassifierQueue.tsx`: render-time queue sync (Adjusting state based on prop change paterni — lint kuralı için `started: boolean` flag + File identity dedup), concurrency cap 3, kart UI (kind ikonu, confidence/language/suggested_type rozetleri, summary, "Devam Et" disabled 3b'ye), retry/remove, `chunkBy`/`documentTypeLabel`/`documentTypeIcon`/`formatLanguage`/`confidenceColor`/`classifierResultBadge` pure helpers.
  - Import sayfası `/dashboard/import`: tab toggle "AI ile Aktar" (default) / "Klasik Mod" (mevcut 7-adım korunur). Product types `dbListProductTypes` ile mount'ta cache (badge labels için).
- **Type'lar:** `AiFeature` union'a `import_classify` (database.types.ts + ai-runs.ts sync), `DocumentType` (10 kind), `DocumentClassification`, `ImportDocumentStatus`, `ImportDocumentRow`.
- **+77 yeni test (8 dosya):** aiClassifyDocument davranış (11) + pickContentBlockForMime (7) + validateClassifyUpload (10) + import-documents-helper (12) + classify-route (12) + classifier-queue (13) + dropzone-component (7) + import-documents-migration (9).
- 13 dosya · **3175 test yeşil** (+77 yeni) · TS clean · 0 lint warning · build OK
- **Sıradaki:** Faz 3b — type-aware extraction + matching (büyük scope).

---

## Önceki — Faz 2e İPTAL (3098 test, commit `4401d66`)

**Faz 2e İPTAL — Parti tablosu ve UI tamamen silindi (3098 test)**

- **Karar:** PMT ölçeğinde parti (heat lot / FIFO izlenebilirlik) iş gereksinimi yok. Sertifika dosyaları `product_attachments` (kind=certificate) ile zaten ürüne bağlanıyor; ayrı `product_batches` tablosu bakım yükü oluşturuyordu.
- **Silinenler:**
  - Migration 060: `DROP TABLE product_batches CASCADE` + index/trigger/policy/function temizliği
  - `src/lib/supabase/product-batches.ts` helper
  - `/api/products/[id]/batches/route.ts` + `/[batchId]/route.ts`
  - `database.types.ts` `ProductBatchRow` interface
  - Detay sayfası: TabKey'den `partiler` çıkarıldı, tab tanımı + placeholder render silindi (7 sekme → 6 sekme)
  - 2 test dosyası (`product-batches-helper.test.ts`, `product-batches-route.test.ts`)
- **Güncellenenler:** `product-detail-page.test.ts` — "6 tab key" + "no tabs are locked" assertion'ları
- **Geri alma:** 059 migration + helper Faz 2a commit `b7c0227` git history'de — ileride istenirse oradan restore.
- 8 dosya silindi/değişti · **3098 test yeşil** (-21 batch test) · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 2d Review P3-007 (3119 test, commit `05cc81e`)

**Faz 2d Review P3-007 — Demo guard davranış testleri (3119 test)**

- **P3-007 KAPANDI** (middleware guard'ın gerçek koşumu): Mevcut source-regex testlerinin yanına 10 davranış testi eklendi — `@supabase/ssr` mock'lu, gerçek `middleware()` + `NextRequest` ile env true/false × demo cookie × auth user kombinasyonları:
  - env=true + demo + GET attachments list → **401**
  - env=true + demo + GET `/url` endpoint → **401**
  - env=true + demo + GET `/attachments/{id}` PATCH path → **401** (regex subtree)
  - env=true + demo + GET `/api/products` (unrelated) → **200** (scope sızıntısı yok)
  - env=true + demo + GET `/api/orders` → **200** (sadece attachments)
  - env=true + authenticated + GET attachments → **200** (auth wins, demo branch skip)
  - env=true + authenticated + demo cookie + GET attachments → **200** (auth branch'ine düşmeden 401 dönmüyor)
  - env UNSET + demo + GET attachments → **200** (default off)
  - env="false" + demo + GET attachments → **200** (literal "true" karşılaştırması)
  - env="1" + demo + GET attachments → **200** (sadece "true" literal'i tetikler)
- 1 dosya · **3119 test yeşil** (+10 davranış) · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 2d Review 2. tur (3109 test, commit `6272759`)

**Faz 2d Review 2. tur — 3 residual kapatıldı (3109 test)**

- **P3-006 KAPANDI** (PDF/belge linki refresh): `<a href={doc.signedUrl}>` → `<button onClick={handleDownloadDocument(id)}>`. Handler `/url` endpoint'ten fresh URL alır + `openSignedUrlInNewTab` (window.open `noopener,noreferrer`) ile yeni sekmede açar; başarıdan sonra liste state'i de güncellenir (sonraki tıklama için cache). 1h TTL aşılsa da çalışır.
- **P3-005 KAPANDI** (ENV opt-in demo guard): `ATTACHMENTS_BLOCK_DEMO_ANON=true` env flag — middleware'de demo cookie + `/api/products/[id]/attachments**` path'i = 401. Default false (geriye uyumlu, demo turunu kırmaz). `.env.example` + `/url` route SECURITY NOTE güncellendi.
- **P3-004 KAPANDI** (handler logic davranış testleri): 3 yeni pure helper export — `buildUploadFormData(file, kind)`, `parseAttachmentApiError(res, fallback)`, `openSignedUrlInNewTab(url, windowOpen)`. handleUpload/handleSetPrimary/handleDelete bu helper'ları çağırıyor; testler gerçek davranışı doğruluyor (FormData içeriği, JSON error parse 5 vaka, window.open args 4 vaka). Page-ekler regression lock'ları helper kullanımına yöneldi.
- **+25 test** (helper davranış 13 + page-ekler P3 lock 6 + demo guard 6)
- 7 dosya · **3109 test yeşil** · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 2d Review 1. tur (3084 test, commit `2b4dd0a`)

**Faz 2d Review — 5 P3 bulgu kapatıldı (3084 test)**

- **P3-001 KAPANDI** (signed URL refresh): `refreshSignedUrl(attId)` useCallback `/url` endpoint'i çağırır; header img + grid img + lightbox img `onError={() => refreshSignedUrl(...)}` ile fresh URL alır. State'te attachment + aktif lightbox güncellenir. 1h TTL aşıldıktan sonra UI kendi kendini iyileştirir.
- **P3-002 KAPANDI** (sessiz fetch hatası): `attachmentsError` state + role="alert" banner + "Yeniden dene" button. fetchAttachments `!res.ok` ve catch dallarında hata set ediliyor; başarıda null'a sıfırlanır. Empty state koşulu `&& !attachmentsError` ile genişletildi — "Henüz ek dosya yok" yanılsaması yok.
- **P3-003 KAPANDI** (fail-open invalid kind): `?kind=bad` artık 400 döner; helper çağrılmadan reddedilir (fail-closed). `kindParam !== null` ise whitelist kontrolü zorunlu.
- **P3-004 KAPANDI** (source-regex ağırlıklı testler): 2 yeni pure helper export — `parseAttachmentsResponse` (defensive shape) + `findPrimaryImageWithUrl` (header logic + non-image defense). +10 helper davranış testi + 3 url-route invalid-kind testi + 16 page-ekler P3 regression lock.
- **P3-005 KAPANDI** (demo + signed URL politika kararı): `/url` route'a SECURITY NOTE yorumu — demo bucket SADECE seed/fake data ise risk yok; prod ile paylaşılırsa `requireAuthenticatedUser` guard eklenmeli.
- 6 dosya · **3084 test yeşil** (+25 P3 review) · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 2d (3059 test, commit `99f3027`)

**Faz 2d — Ekler sekmesi UI + signed URL endpoint (3059 test)**

- **Backend (3 dosya):** `dbGetSignedUrl` + `dbGetSignedUrlsForRows` (bulk `createSignedUrls`, N+1 önler) + yeni `mapProductAttachment` (file_path expose etmez, signedUrl opsiyonel 2. arg) + yeni `ProductAttachment`/`ProductAttachmentKind` interface (`mock-data.ts`).
- **GET /attachments shape değişimi:** raw array → `{ items, expires_in: 3600 }` (her item enriched signedUrl ile, bulk fetch). `export const dynamic = "force-dynamic"` defansif.
- **Yeni endpoint:** `GET /api/products/[id]/attachments/[attachmentId]/url` → tekil signed URL (header img refresh için). 400/404 (ek yok / cross-product / file_path boş) / 500 (createSignedUrl null).
- **Detay sayfası UI (`[id]/page.tsx`):** 5 pure helper export (formatFileSize/getKindLabel/getKindIcon/pickInitialKind/groupAttachments) + 6 state + fetchAttachments useEffect + header 80×80 görsel (primary image varsa img, yoksa "Görsel yok" placeholder) + Ekler tab içeriği (upload bar kind+file+button / images grid 140×140 thumbnails star+× / documents list İndir+Sil) + lightbox modal (role="dialog" aria-modal aria-label, ESC + backdrop + scroll lock + focus return) + 3 handler (upload/setPrimary/deleteAttachment, hepsi demo guard'lı). Tab `locked: false` (artık tıklanabilir). `ATTACHMENT_ACCEPT` client-safe constant (server-only `ALLOWED_MIME` import edilmedi).
- **MIME→kind otomatik öneri:** file seçilince `pickInitialKind(f.type)` ile kind state'i override edilir; kullanıcı dropdown'dan değiştirebilir.
- **Lightbox PDF için kullanılmaz:** PDF "İndir" link'i `target=_blank rel=noopener` ile yeni sekmede açılır.
- **Versiyonlama Faz 3'e ertelendi:** helper `is("superseded_by", null)` zaten filtreliyor; 2d UI yalnız aktif version'ı görür.
- **+44 test (5 dosya):** mapper (5) + helpers (18) + url-route (7) + list-signed-url (3) + page-ekler (14)
- **Eski test güncellemesi:** `product-detail-page.test.ts` "Faz 2d placeholder" assert'i kaldırıldı (Ekler artık aktif).
- 8 dosya · **3059 test yeşil** · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 2c Review P3 (3015 test)

**Faz 2c Review — Tüm P3 bulgular kapatıldı**

- **MR-F2C-P3-003 ✅ KAPANDI:** `getMissingRequiredAttributes(fields, attributes)` pure helper eklendi (her iki page dosyasında export). `handleCreate` (create drawer) + `handleSave` (detay edit) her ikisi de kaydetmeden önce zorunlu alanları kontrol ediyor; eksikse `"Zorunlu alanlar eksik: X, Y"` toast'ı.
- **MR-F2C-P3-004 ✅ KAPANDI:** Testler source-regex'ten gerçek mantık testlerine geçirildi. `getMissingRequiredAttributes` için 9+6 pure helper test (8 senaryo: undefined/null/empty string/empty array/multiselect/multi-missing). Source-regex lock'ları korundu.
- **MR-F2C-P3-005 ✅ KAPANDI:** `createTypeFieldsError` state eklendi. `handleCreateTypeChange`'de `!res.ok` ve `catch` dalları `"Alan şablonu yüklenemedi…"` set ediyor; yeni tip seçilince `null` ile temizleniyor. JSX'te `role="alert"` banner render'ı.
- **+25 test** (product-create-type-selector.test.ts: +15 yeni, product-detail-page-faz2c.test.ts: +10 yeni)
- **3015 test yeşil · TS clean · 0 lint warning · Faz 2c tamamen kapalı**

---

## Önceki — Faz 2c — Teknik sekmesi dinamik alan rendering + tip seçici (2974 test) · commit `6846584`

- Genel sekmesinde "Tip Şablonu" selector (`/api/product-types` listesinden, edit mode)
- Teknik sekmesi aktif: seçili tipin `product_type_fields` alanları `withFields=1` ile fetch, alan tipine göre render
- `DynamicFieldEdit` component'i: 7 field_type variant (text/number/select/multiselect/boolean/date/longtext) + unit suffix/pill toggle/checkbox/textarea
- `handleSave` body'sine `product_type_id` + `attributes` JSONB eklendi
- Tip değişiminde `computeLostAttributeKeys` ile yeni tipte olmayan attribute key'leri tespit edilir → uyarı modalı; onaylanınca filtre uygulanır
- +20 test · 2974 test yeşil

---

## Önceki — Toplu Seçme ve Silme — Tüm 6 Liste Sayfası (2954 test) · commit `c043636`

- Yeni `src/hooks/useSelection.ts`: resetKey render-phase sıfırlama, 4 pure helper export, UseSelectionResult interface
- 6 sayfa: products / orders / customers / vendors / quotes / purchase/orders
- Her tabloya checkbox kolonu (select-all + indeterminate + per-row)
- Bulk action bar: seçilen count + işlem butonu + Seçimi Temizle
- Inline confirm modal: her sayfada bağımsız `bulkDeleteConfirm` state
- Products/Orders/Customers/Quotes → DELETE endpoint
- Vendors → DELETE (soft deactivate, "Pasife Al", warning rengi)
- Purchase Orders → POST cancel `{ reason: "Toplu iptal" }`, "İptal Et" etiketi
- +19 test (use-selection.test.ts)
- 8 dosya · **2954 test yeşil** · TS clean · 0 lint warning

---

## Önceki — Faz 2b Review — 3 bulgu kapatma (2935 test)

---

## Önceki — Faz 2b — Tam ekran ürün detay sayfası + drawer kaldırma (2930 test)

- **Yeni sayfa `/dashboard/products/[id]`:** Client component, 7-sekme yapısı. 4 aktif sekme (Genel/Stok/Tedarik/Ticari) + 3 placeholder 🔒 (Teknik→Faz 2c, Ekler→Faz 2d, Partiler→Faz 2e). Header: 80×80 görsel placeholder + ürün adı + SKU mono + Aktif/Pasif + Manufactured/Commercial rozetleri. Düzenle/Devre Dışı Bırak butonları (demo guard). Save handler PATCH /api/products/[id] (24 alan: name/category/subCategory/productFamily/productType/sector/industries/useCases/material/origin/site/standards/certifications/unit/warehouse/preferredVendor/leadTimeDays/weightKg/price/currency/costPrice/productNotes/minStockLevel/dailyUsage/reorderQty). Deactivate handler `is_active:false` → router.push liste. Stok sekmesinde 6 metric card + Bekleyen Teslimatlar tablosu + Aktif Uyarılar banner; Ticari sekmesinde Aktif Teklifler tablosu (order linkleri). role="tablist"/tab + aria-selected/controls + 404 + loading branch'leri.
- **Liste sayfası `page.tsx`:** AIDetailDrawer + tüm drawer state'leri (selectedProductId/drawerEditMode/drawerSaving/drawerEditForm/rejectMode/rejectNote/drawerAlerts/commitments/showCommitmentForm/commitmentForm/quotes/extendingId) + drawer-only useEffect'leri (commitments/quotes/alerts fetch) + handleDrawerSave/handleAccept/handleReject/extendQuote handler'ları kaldırıldı (~1115 satır net azalma). Tablo 6 sabit kolona indirildi: SKU/Ad/Stok/Satılabilir/Fiyat/Min stok. Eski Kategori/Kapsam/Son Tarih/Sinyal kolonları kaldırıldı. Satır onClick `router.push(/dashboard/products/{id})`.
- **aging/page.tsx:** ESLint için `<a href="/dashboard/products">` → `<Link>` (yeni `[id]` route eklenince Next.js shadowing tetiklenmiş; lint hatası giderildi).
- **+19 test:** `product-detail-page.test.ts` (11: module load + useParams/Router/fetch + 7 sekme key + 3 placeholder + PATCH wiring + deactivate + loading/404 + demo + ops sections + header + ARIA), `products-page-drawer-removed.test.ts` (8: drawer regresyon kilidi — AIDetailDrawer yok, drawer state'leri yok, handleDrawerSave yok, selectedProductId yok, router.push paterni, 6 kolon header'lar, eski kolonlar kaldırılmış, useRouter import).
- 5 dosya · **2930 test yeşil** · TS clean · 0 lint warning · build OK · commit `9003044`

**Sıradaki:** Faz 2c — Teknik sekmesi dinamik alan rendering + tip seç + attributes JSONB write/read + tip değiştirme uyarısı.

---

## Önceki — Faz 2a Review — Tüm Bulgular Kapandı (2026-05-19; 2911 test)

- **MR-F2A-P2-001 KAPANDI:** `dbCreateBatch`/`dbUpdateBatch` `certificate_attachment_id` sahiplik + kind kontrolü. +3 test. commit `4977603`
- **MR-F2A-P3-002 KAPANDI:** 058+059 migration policy create'leri `DROP POLICY IF EXISTS` guard'lı. commit `4977603`
- **MR-F2A-P3-003 KAPANDI:** POST + PATCH catch blokları "bulunamadı"→404, "ait değil"/"türünde olmalıdır"→400 olarak eşlendi (önceden 500'e düşüyordu). +5 route testi. commit `5743bd1`

---

## Önceki — Faz 2a — Batches + Attachments DB Foundation (2903 test)

Faz 2 (ürün bilgileri sayfası) alt-fazlara bölündü: 2a (DB+backend, BU), 2b (sayfa skeleton), 2c (Teknik dinamik form), 2d (Ekler UI), 2e (Partiler UI).

**2a kapsamı (13 dosya):**
- **Migration 058:** `product_attachments` tablosu (kind enum: image/datasheet/certificate/manual/drawing/other; versiyonlama `superseded_by`; `is_primary_image` unique partial index — ürün başına 1 primary) + `storage.buckets product-files` (private, 10MB, image+PDF whitelist) + RLS service_role.
- **Migration 059:** `product_batches` (heat_no/batch_date/initial_qty/remaining_qty + `certificate_attachment_id` → attachments FK) + CHECK `remaining_qty <= initial_qty` + updated_at trigger.
- **DB types:** `ProductAttachmentRow` + `ProductBatchRow` + `ProductAttachmentKind` enum.
- **Helper `product-attachments.ts`:** `dbListAttachmentsByProduct(productId, kind?)` (superseded_by NULL filter), `dbGetAttachment`, `dbCreateAttachment` (atomik DB insert → storage upload `{productId}/{id}.{ext}` → fail ise DB row sil; avatar paterni), `dbDeleteAttachment` (DB sil → storage best-effort cleanup), `dbSetPrimaryImage` (clear-all then set-one). Export: `ALLOWED_MIME` (png/jpeg/webp/pdf), `MAX_FILE_SIZE = 10MB`, `isValidAttachmentKind`, `isAllowedMime`.
- **Helper `product-batches.ts`:** CRUD + validation (heat_no non-empty, initial_qty > 0, remaining_qty ≥ 0, remaining ≤ initial, batch_date YYYY-MM-DD).
- **API routes (4 dosya):** `/api/products/[id]/{attachments,batches}` ailesi — GET (auth) + POST/PATCH/DELETE (admin|purchaser via requireRole). Attachments POST multipart/form-data; PATCH `{is_primary_image:true}` (sadece image kind). Cross-tenant guard (batch/attachment.product_id !== url.id → 404). `revalidateTag("products","max")`.
- **+29 yeni test (4 dosya):** product-attachments-helper (9: pure validators 3 + dbCreate validation 3 + dbSetPrimary 1 + dbDelete 1 + isAllowedMime 1), product-attachments-route (7: viewer/MIME/size/kind/happy/PATCH primary+image/PATCH non-image), product-batches-helper (8: validation 5 + sıralama 1 + update validation 2), product-batches-route (5: viewer/heat_no boş/happy/DELETE/cross-product 404).
- 197 dosya · **2903 test yeşil** · TS clean · 0 lint warning · build OK · commit `b7c0227`

**Sıradaki:** Faz 2b — Tam ekran `/dashboard/products/[id]` skeleton + 4 statik sekme (Genel/Stok/Tedarik/Ticari) + eski drawer kaldırma. Liste sayfası satır click → tam sayfa.

---

## Önceki — Faz 1 Review P2 Tam Kapanış (2026-05-19; 2874 test)

`dbReorderProductTypeFields` reorder sırasında parent `is_system=true` ise `is_system=false` UPDATE + audit_log yazmıyordu → eklendi. +1 source-regex test. MR-F1-P2-001 kapatıldı.
- 184 dosya · 2874 test · TS clean · 0 lint warning · build OK

---

## Önceki — Faz 1 Review — 3 bulgu kapatma (2026-05-19; 2873 test)

Kullanıcı Faz 1 commit'ini (`67708d1`) review etti, 3 açık bulgu buldu:
- **P2 (kısmi):** field add/update/delete sistem kilidini düşürmüyordu → 3 helper'a parent fetch + `is_system=false` UPDATE eklendi
- **P3 (route):** `[id]/fields/[fieldId]` route'u `id`'yi destructure etmiyordu → cross-tenant açığı vardı. Helper'lara opsiyonel `expectedTypeId` parametresi eklendi.
- **P3 (products):** `CreateProductInput` `product_type_id`/`attributes` içermiyordu → tip + insert güncellendi
- +18 test · 2873 test · TS clean · 0 lint warning · build OK

---

## Önceki — Modül Revize Faz 1 (2026-05-19; 2855 test)

### Bağlam
Kullanıcı 35 soruluk Q&A ile 3 modülün revizesini kararlaştırdı:
1. **AI Import** — multimodal kapı (PDF/Excel/foto/scanned), document classifier, type-aware extraction, hibrit matching, versiyonlama, vendor master
2. **Ürün bilgileri** — dinamik şema (admin paneli ile kullanıcı tipi tanımlar), 8 hazır tip, 7 sekmeli tam sayfa
3. **Teklif modülü** — PMT brand PDF, Ölçü/Teslimat/Ödeme alanları, bilingual TR/EN, auto-build description

**Sıra:** Faz 1 (dinamik tip altyapısı) → Faz 2 (ürün sayfası) → Faz 3 (AI Import) → Faz 4 (teklif). Sebep: Import + Teklif Faz 1+2'ye bağımlı.

### Faz 1 Tamamlandı
- **Migration 056 + 057**: `product_types` + `product_type_fields` tabloları + `products.product_type_id`/`attributes` ALTER + 8 hazır tip seed (Vana/Conta/Flans/Fitting/Bağlantı Elemanı/Enstrüman/Sızdırmazlık Malzemesi/Diğer) deterministik UUID'lerle
- **Helper + API**: `src/lib/supabase/product-types.ts` (CRUD + validation + reorder + sistem tipi/bağlı ürün guard'ları) + `/api/product-types/*` (4 route ailesi, admin guard, withFields=1 desteği)
- **Admin paneli**: `/dashboard/settings/product-types` liste (kart görünümü + modal) ve `[id]` detay (alan yöneticisi: ekle/sil/sırala, dinamik form: number → unit, select → options)
- **TypeScript tipleri** + mapper'lar + sidebar link
- **+61 test** (helper 16 + route 33 + seed 12)
- 183 dosya · 2855 test · TS clean · 0 lint warning · build OK

### Plan Dosyası
`/Users/mirzasaribiyik/Projects/erp2/MODUL_REVIZE_PLAN.md` — tüm fazların detay şeması (DB tabloları, alan listeleri, akış diyagramları, kabul kriterleri). Farklı session'larda kalınan yerden devam için referans dosyası.

---

## Sıradaki İş

**Faz 2 — Ürün Bilgileri Sayfası**
- Tam ekran `/dashboard/products/[id]` (drawer kaldırılır)
- 7 sekme: Genel / Teknik / Stok / Tedarik / Ticari / Ekler / Partiler
- Teknik sekmesi dinamik — seçilen tipin alanları renderlanır
- `product_batches` tablosu (heat_no, parti tarihi, miktar, sertifika linki, sevkiyat history)
- `product_attachments` tablosu (Supabase Storage entegrasyonu, versiyonlama via superseded_by)
- Ana görsel header'da + diğer dosyalar Ekler sekmesinde
- Liste sayfası: 6 sabit kolon (SKU/ad/stok/satılabilir/fiyat/min stok), basit arama
- Eski drawer kaldırılır

**Faz 3 — AI Import Yenileme**
Drop-anywhere arayüz + classifier + type-aware extraction + hibrit matching + versiyonlama. Eski 7-adım wizard "Klasik Mod" altına gizlenir.

**Faz 4 — Teklif Modülü Revize**
PMT brand PDF template, bilingual TR/EN, yeni alanlar (Ölçü/Teslimat/Ödeme), auto-build description, ürün şemasıyla entegrasyon.

---

## 35 Soruluk Q&A — Ana Kararlar Özeti

### AI Import
- Kapsam: A+B+D+E+F (Müşteri C hariç)
- Format: PDF/Excel/foto/scanned hepsi
- Varyant: düz SKU (her permütasyon ayrı kart)
- Eşleştirme: hibrit (yüksek güven otomatik, belirsiz sor)
- Belge yeri: ürünün altında "Ekler" sekmesi
- Multi-product onay: tek liste batch; tekil güncelleme: diff
- Çakışma: sadece çakışmada sor
- Versiyonlama: eski "önceki versiyon", history kalır
- Çoklu dosya: sıralı, ayrı onay

### Ürün
- Dinamik şema (admin panel)
- Default 8 tip ship
- Ortak iskelet sabit (SKU/ad/fiyat/stok/vendor), Teknik tipe göre
- Sayfa: tam ekran, 7 sekme
- Parti izleme: hibrit (özet + Partiler sekmesi)
- Görsel: ana header + diğerleri Ekler
- Liste: 6 kolon + basit arama
- Eski demo ürünler önemsiz (silinecek)

### Teklif
- Referans: `/Users/mirzasaribiyik/Downloads/PMT.pdf` (PMT brand)
- Yeni alanlar: Ölçü/Teslimat/Ödeme
- Bilingual TR/EN
- Auto-build description (ad + gövde mat + sınıf + trim mat)
- Sipariş dönüşümü: manuel buton (mevcut yeterli)

---

## Önceki İşler (kısa kronoloji)

- Genel Pagination (2026-05-18) — 6 liste sayfası 50/sayfa + numaralı navigation (2794 test)
- Faz 10 Review (2026-05-18) — `dbGetOpenShortagesByProductId` DB hata yutma kapatıldı
- Faz 10 (2026-05-18) — order_shortage drawer M3 (bilgi yoğunluğu + iki yönlendirme)
- Faz 9 (2026-05-18) — PO PDF render (server-side HTML print) + review bulgular
- Faz 8 (2026-05-17) — AI rejection feedback prompt entegrasyonu
- Faz 7 (2026-05-16/17) — overdue_shipment alert inline ship form + P2/P3 kapanış
- Faz 6 (2026-05-16) — Suggested → PO köprüsü + review kapanış
- Faz 1-5 (purchase&alert) — sync_issue inline retry, vendor entity, PO schema/UI/mal kabul
- Paraşüt Faz 1-11 tam tamamlandı

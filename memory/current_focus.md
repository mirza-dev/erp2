---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---

## Son Tamamlanan İş — 2026-05-22

**Faz 3c Review 5.tur — status_update_failed UI/API propagate (3441 test)**

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

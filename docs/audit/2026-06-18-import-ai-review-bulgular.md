# import/AI Modülü Derin Denetim — Bulgular

**Tarih:** 2026-06-18
**Kapsam:** Veri Aktarım (import) + AI yüzeyi — 15 import route (`src/app/api/import/**`), 6 AI route (`src/app/api/ai/**`), `ai-service.ts` (1868 satır), `ai-guards.ts`, `ai-route-limit.ts`, `import-service.ts`/`import-apply-service.ts`, supabase import/document helper'ları, 3 dashboard sayfası.
**Yöntem:** REVIEW.md kurallarıyla read-only inceleme (erp2-reviewer checklist'i + manuel kanıtlama). Modül olgun (önceki Denetim + Y1/Y2 turları bu yüzeye dokundu); bu tur yeni/izlenmeyen noktaları hedefler.
**Özet:** **K:0 · Y:0 · O:1 · D:1 · Nit:1.** O1 (gerçek cross-role/demo açığı) + D1 (savunma-derinliği) düzeltildi; kullanıcı kapsam kararı: O1 + ops-summary.

---

## O1 (Orta) — İki guard'sız import GET route'u (method-seviye kör nokta) → cross-role + demo veri sızıntısı

**Kanıt:** `GET /api/import/[batchId]` (`route.ts:8`) ve `GET /api/import/drafts/[id]` (`route.ts:9`) hiçbir RBAC guard'ı içermiyordu — yalnız proxy oturum kontrolüne dayanıyordu. Her iki dosya `requirePermission`'ı import edip DELETE/PATCH'te kullanıyor → dosya-seviye guard taraması (`gate` route-guard-matrix'in A3 kör noktası: `src.includes(guard)`) dosyayı "korunmuş" sayıyor; GET method'u açıkta kalmış. Bu yüzden gate baseline'da bile listelenmemiş.

**Etki:** `view_import` yalnız **admin + purchasing**'de (`permissions.ts:89`). Dolayısıyla **sales/production/accounting/viewer** (4/6 rol) + **demo kullanıcı** bu iki ucu okuyabiliyordu. Proxy demo'ya `GET /api/*` izni verir (`proxy.ts:204` — DataProvider'ın veri çekmesi için), RBAC kararını route'a bırakır. Draft `raw_data`/`parsed_data` tedarikçi/fiyat/maliyet verisi taşıyabilir (Y1'in kardeş `[batchId]/drafts` list GET'ine `view_import` eklerken yazdığı gerekçe: "taslaklar tedarikçi/fiyat verisi içerebilir"). Batch detayı `column_mapping_meta` + sayaçları sızdırır.

**Önceki iz:** Y1 turu kardeş route'lara (`[batchId]/drafts` list GET, `[batchId]/report` GET, `documents/[id]/lines` GET, `.../preview-image` GET) `view_import` ekledi ("demo dahil fiilen kapalı") ama bu iki tekil GET atlanmıştı.

**Düzeltme:** Her iki GET handler'ının başına `const guard = await requirePermission(req, "view_import"); if (guard) return guard;` eklendi (kardeş `report`/list GET kalıbı birebir; `requirePermission` zaten import'luydu, `_req`→`req`). `rbac-mutation-guards.test.ts`'e gerçek-perm viewer→403 testleri eklendi (+2).

---

## D1 (Düşük) — AI advisory route'ları route-seviye RBAC'siz (savunma-derinliği + Y2 tutarlılık)

**Kanıt:** `/api/ai/ops-summary` yalnız `guardAiRoute` (rate-limit) içeriyordu; oturum/permission route guard'ı yoktu. `/api/ai/purchase-copilot` `checkAuth` (cron VEYA oturum) içerir ama RBAC permission'ı yok (rec yazar). `/api/ai/parse`+`/api/ai/score` oturum-only (proxy), RBAC yok.

**Etki — sömürülebilir DEĞİL:** demo = yalnız `demo_mode` cookie, Supabase session YOK (`auth/demo/route.ts`) → `hasAuthenticatedSession()`=false → purchase-copilot POST demo/anon'u 401'ler; ops-summary proxy'de demo non-GET 403 + session-gated. Tüm gerçek roller `view_products`/`view_dashboard` taşır → guard işlevsel fark yaratmaz. Boşluk: **proxy-fail-open** (kod tabanının kendi AI-rate-limit gerekçesi: route-guard'lar middleware fail-open'a karşı var) + stock-risk Y2 (`view_products`) tutarlılığı.

**Düzeltme (kullanıcı kapsam kararı: yalnız ops-summary):** `ops-summary`'ye rate-limit sonrası `resolveAuthContext` + `requirePermissionFor(ctx, "view_dashboard")` eklendi (stock-risk Y2 kalıbı; cron yolu yok; `view_dashboard` tüm rollerde → UI dashboard AI özet widget'ı kırılmaz; anon/proxy-fail-open + demo kapanır). `ai-ops-summary-route.test.ts`'e 401/403 guard testleri (+2). **purchase-copilot'a DOKUNULMADI** (ALWAYS_PUBLIC + cron yollu hassas route; RBAC eklemek saf no-op + cron-yolu risk) — aşağıda izlenir.

---

## Nit / İzlenen — purchase-copilot + parse/score RBAC

- `/api/ai/purchase-copilot` POST `ai_recommendations` yazar ama yalnız `checkAuth` (oturum/cron); RBAC yok. Demo/anon zaten 401 (session yok); tüm roller view_products taşır → no-op. ALWAYS_PUBLIC+cron route'a dokunmak risk → ertelendi.
- `/api/ai/parse` (10/dk) + `/api/ai/score` (5/dk) oturum-only (proxy), RBAC yok. Advisory + rate-limited; demo non-GET'i proxy bloklar. Düşük; dokunulmadı.

---

## Temiz doğrulananlar (bulgu YOK)

- **Import yazma/uygula yolları:** `apply-mappings`/`confirm`/`detect-columns` → `manage_import`; `documents/[id]/apply`+`extract`, `classify`, `document-lines/[id]` PATCH → `requireRoleFor(["admin","purchaser"])`; `[batchId]` DELETE/PATCH + `drafts/[id]` PATCH → `manage_import`. Hepsi guard'lı.
- **`requireRoleFor`** hem allowed hem kullanıcı rollerini `purchaser→purchasing` çift-normalize eder (`role-guard.ts:111-114`) → legacy alias bug'ı YOK.
- **Prompt-injection (G1/G2):** `ai-service.ts` boyunca tutarlı — input `sanitizeAiInput`/`sanitizeAiInputRecord`/`sanitizeFeedbackForPrompt` (zero-width+bidi+C0 strip, role-marker `\b(system|assistant|user):` strip, ``` ``` ``` backtick strip, length cap) prompt'a girmeden uygulanır; output `sanitizeAiOutput`+`capAiStringArray`+`clampConfidence` ([0,1], NaN→0.5). Ham string-concat prompt YOK.
- **extract route:** status guard (`classified`), abort handling (`req.signal.aborted`→499), re-extract boş-AI guard (422, mevcut satır korunur), `productTypeId` erken doğrulama (gereksiz I/O öncesi), matcher cache tek-fetch (N+1 yok).
- **apply route:** `normalizeFieldApprovals` whitelist (`allowedProductFields` + key regex `/^[a-z][a-z0-9_]{0,79}$/` + slice cap'ler), idempotency (doc.status guard → 409 applying / 400 diğer), `revalidateTag("products")`.
- **observability:** `requireInternalOperator` (en güçlü guard).
- **stock-risk:** Y2'de `resolveAuthContext`+`view_products` (rec yazdığı için) — bu turun referans kalıbı.
- **Demo modeli:** `auth/demo` yalnız cookie set eder (Supabase session yok); AI POST yazma yolları `hasAuthenticatedSession`/proxy-non-GET-403 ile demo'ya kapalı.

---

## Düzeltme özeti
- Dosyalar: `src/app/api/import/[batchId]/route.ts` (GET +guard), `src/app/api/import/drafts/[id]/route.ts` (GET +guard), `src/app/api/ai/ops-summary/route.ts` (session+view_dashboard).
- Test: `rbac-mutation-guards.test.ts` (+2 import GET 403), `ai-ops-summary-route.test.ts` (+2 auth 401/403 + role-guard mock).
- **Migration YOK.** tsc 0 · lint 0 · 5545 test (+4) · build 0.

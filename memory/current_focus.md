---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---

> Bu dosya yalnız **güncel odak + açık yükümlülükleri** tutar. Tam oturum geçmişi git log'unda. Aşağıdaki indeks geçmiş oturumlara hızlı bakış içindir.

## Son Tamamlanan İş — 2026-06-19 (**Stok defteri / Inventory derin denetim (erp2-reviewer) + 2 düzeltme**)

Yeni erp2-reviewer denetim turu; kullanıcı hedef olarak **stok defteri / inventory**'i seçti (çekirdek domain, daha önce özel bulgular doc'u yok). REVIEW.md + domain-rules.md §5–6 ile koda karşı doğrulandı. **No blocking issues — K:0 Y:0 O:0.** PUSH EDİLDİ `4179fd8`. **migration 105 YENİ → APPLY BEKLİYOR.** Rapor `docs/audit/2026-06-19-inventory-review-bulgular.md`.

- **Doğrulanan sağlamlık:** tüm stok mutasyonları atomik guard'lı RPC — `record_stock_movement` negatif-stok reddi · `increment_reserved` `least(on_hand,…)` cap · `adjust/decrement_on_hand` `greatest(0,…)` · `record_stock_transfer` ayrı `stock_location_balances`+`FOR UPDATE`, `products.on_hand`'e dokunmaz (RLS açık 084:84) · demo merkezi `proxy.ts:207-209` non-GET→403 (per-route guard gereksiz) · RBAC GET view_products / POST stock_adjust_* (A3). Doğrudan TS stok UPDATE yok (istisna seed-runner.ts:482, dev aracı).
- **D-O1 (DÜZELTİLDİ) — import stok sayımı lost-update:** `import-service` `delta = quantity - prod.on_hand`'i `record_stock_movement` transaction'ı **dışında** okuyordu → eşzamanlı dış harekette `on_hand ≠ sayılan`. Çözüm: YENİ `recount_stock(p_product_id,p_counted_qty,p_notes,p_actor)` RPC (**mig 105**) — `FOR UPDATE` kilit, delta txn-içi, `on_hand`'i **mutlak** sayılan değere atar, delta hareketi kaydeder; negatif sayım red, delta=0 no-op. Wrapper `dbRecountStock` (products.ts); import sayım dalı JS-delta yerine bunu çağırır. Stok **hareketi** (in/out) hâlâ delta `dbRecordMovementAtomic`, transfer dalı değişmedi.
- **D2 (DÜZELTİLDİ — kaldırıldı) — ölü atomik-olmayan stok yardımcıları:** sıfır-çağıran (grep+test doğrulandı) — `dbRecordMovement` (products), `orders.ts` tüm `// Stock helpers (DEPRECATED)` bloğu (`StockConflict`/`dbGetProductStocks`/`dbReserveStock`/`dbReleaseStock`/`dbShipOrder`). Footgun (atomiklik/cap invariant'ı bypass). Plan'ın 4-fn listesi `dbShipOrder`'ı da kapsayacak şekilde genişletildi (tüm blok). `OrderLineRow` import korundu.
- **Gate notu:** `recount_stock` tek-migration tanımlı → `sql-lint-baseline.ts` `REDEFINITION_CHAINS` GÜNCELLENMEZ (yalnız ≥2-migration fn izler; eklenseydi "hayalet zincir" gate'ini bozardı). `SECURITY DEFINER` yok → DEFINER hijyen gate'i tetiklenmez.
- **Test:** `import-confirm.test.ts` — sayım testleri delta→recount mutlak qty assertion'ına güncellendi + recount-failure testi eklendi. tsc 0 · lint 0 · **5581 test** (+1) · build 0.
- **Mirror:** commit `4179fd8` + `git -C proje-codex reset --hard main` + push both → 4 ref de `4179fd8`, tree-hash `17f61de0` özdeş, `git diff main codex-experiment` BOŞ, ıraksama 0 0.
- **KALAN (kullanıcı-tarafı):** migration 105 Studio'da APPLY + `npm run check-migrations` probe.

<details><summary>Önceki: codex-experiment aynası: fast-mutation + tema-hydration → mirror</summary>

## Son Tamamlanan İş — 2026-06-19 (**codex-experiment aynası: fast-mutation + tema-hydration özelliği main'e adapte → mirror**)

proje-codex worktree'sinde commit edilmemiş gerçek bir özellik vardı; mirror FF'i bozmuştu (login çakışması). **Kullanıcı kararı (AskUserQuestion): özelliği main'e adapte et + iki branch birebir mirror, hiçbir şey kaybolmasın, no semantic errors.** PUSH EDİLDİ `a6f002a`. **migration YOK.**

- **Adapte edilen (1) fast-mutation/optimistic-UI:** YENİ `src/lib/fast-mutation.ts` (saf helper: successfulResponseIds/decrementCount/patchCountRecord/removeByIds/upsertFirst) + 2 yeni test (`fast-mutation.test`, `operation-speed-regression.test`); `data-context.tsx` (optimistic liste mutate + `updateCustomer`→`Customer|undefined` return + `addUretimKaydi`→`{entry?}` + üretim revalidation arka-plana, bloklamaz); 5 client (Orders/Customers/Purchase/Quotes/Vendors) `router.refresh()`→optimistic `displayX` state + `applyXxx` helper + `mutate(COUNTERS_KEY/PRODUCTS_KEY)`; `CustomerDetailPanel.onCustomerUpdated`.
- **Adapte edilen (2) tema hydration guard:** `ThemeToggle` + login `Chrome` `mounted` flag.
- **Reconciliation mekanizması:** 19 feature dosyası codex worktree→erp2 **verbatim kopya** (0a7e7d1↔0cf441a'da bu dosyalar AYNI → çakışmasız); `login/page.tsx`+`globals.css`+`login-page.test.tsx` **main OTORİTER** (D1/D2/Nit fix'lerim KORUNDU), yalnız login `Chrome`'a `mounted` guard elle eklendi.
- **İnline REVIEW.md denetim TEMİZ:** tsc 0/lint 0/5580 test/build 0; production `refetchFailed` uyarısı artık fire etmez (optimistic add ile gereksiz; zararsız dead-code mirror-sadakati için bırakıldı); demo guard'lar 5 client'ta korundu; stok defteri UI-katmanı (server source-of-truth + mutate(PRODUCTS_KEY)).
- **Mirror:** `git -C proje-codex reset --hard main` (feature artık main commit'inde → kayıp yok; önce commit SONRA reset).
- **TAMAMLANDI:** commit `a6f002a` + `git -C proje-codex reset --hard main` + push both; doğrulandı → 4 ref de `a6f002a`, tree-hash `ff198da9` özdeş, `git diff main codex-experiment` BOŞ, ıraksama 0 0.
</details>

<details><summary>Önceki: Landing + login UI denetimi (erp2-reviewer) + 4 düzeltme</summary>

## Son Tamamlanan İş — 2026-06-19 (**Landing + login UI denetimi (erp2-reviewer) + 4 düzeltme**)

REVIEW.md read-only (landing `src/app/page.tsx` + login `src/app/login/page.tsx` + auth/callback + globals login CSS). **No blocking issues — K:0 Y:0 O:0 D:2 Nit:2.** PUSH BEKLİYOR. **migration YOK; yalnız `login/page.tsx` + globals.css 1 satır + test.** **Kullanıcı kararı (AskUserQuestion): hepsini düzelt.**

- **Temiz doğrulandı:** landing tema-pinli pazarlama (kendi token scope'u, belgeli istisna), login tema-duyarlı CSS-var (globals.css `.login-monolith` vb.), Tailwind/framer YOK, React-escape (XSS yok), callback redirect relative/sabit (open-redirect yok), GoogleIcon brand-renk istisnası, custom checkbox a11y.
- **D1 (Düşük):** `attempted` URL param'ı (`login/page.tsx` useEffect) doğrulanmadan hata kutusuna yansıyordu → React escape (XSS yok) ama crafted `?error=unauthorized&attempted=<metin>` kurbana keyfi metin gösterir. **Fix:** `attempted && isEmail(attempted)` ise yansıt, değilse genel `errUnauthorized` (mevcut `isEmail` helper).
- **D2 (Düşük):** boş `<a href="mailto:">` → boş mail penceresi. **Fix:** düz metin `<span className="login-foot-em">` (globals.css'e `.login-foot-em` accent+label-weight eklendi; `.login-foot a` korundu).
- **Nit-1:** `role="alert"` + `aria-live="polite"` çakışması (alert zaten assertive) → `aria-live` kaldırıldı.
- **Nit-2:** `handleForgot` sıfırlama hatası `errAuth` ("e-posta/şifre hatalı") gösteriyordu → yeni `errReset` (TR/EN) mesajı.
- **Test:** +2 (`login-page.test.tsx`): D1 malicious-attempted yansımaz (genel mesaj) + Nit-2 reset mesajı; 1 mevcut test güncellendi (aria-live assertion `null`).
- **GREEN:** tsc 0 · lint 0 · **5570 test** (+2) · build 0. KALAN: push.
</details>

<details><summary>Önceki: C1 — Login brick-risk preflight + checklist + kurtarma runbook</summary>

## Son Tamamlanan İş — 2026-06-19 (**C1 — Login brick-risk preflight + checklist + kurtarma runbook**)

`deferred_backlog` C1. Rapor: `docs/audit/2026-06-19-c1-login-preflight.md`. **migration YOK; runtime kodu DEĞİŞMEZ.** PUSH BEKLİYOR. **Kullanıcı kararı (AskUserQuestion): brick-risk preflight + checklist** (LoginMonolith UI redesign DEĞİL — o ayrı untracked design_handoff).

- **Brick modeli (kod izli):** `proxy.ts:241` her oturumu `isProvisionedUser(app_metadata,email,ADMIN_EMAILS)` ile süzer; kurtarma kolu (`/dashboard/settings/users` + `/api/admin/users`) admin ister = `parseRoles ∋ admin` (`permissions.ts:142`). Deploy sonrası HİÇBİR `auth.users`'ta `app_metadata.roles ∋ admin` YOK + prod `ADMIN_EMAILS` boşsa → kimse admin değil → kimse provize/düzeltilemez → **BRICK** (password login bile kurtarmaz — aynı kapılar kapalı).
- **Çözüm (D'nin `check-migrations` deseni):** YENİ `scripts/check-auth-preflight.ts` (read-only tek `auth.admin.listUsers` + gerçek `parseRoles`/`isProvisionedUser` import → drift yok). Raporlar: kalıcı admin (`parseRoles(...,[])∋admin` env-bağımsız, prod'da geçerli) / bootstrap admin (yalnız LOCAL ADMIN_EMAILS) / ADMIN_EMAILS format / mis-provision (user_metadata rol var, app_metadata yok→sessiz viewer). **Exit:** kalıcı+bootstrap==0→1 (BRICK), kalıcı==0&bootstrap>0→0+⚠️, listUsers hata→fail-closed 1. `npm run preflight:auth` script'i eklendi.
- **Doc:** §1 brick modeli §2 script (çıktı+exit kodları, e-postalar maskeli) §3 manuel checklist (ADMIN_EMAILS her iki Coolify env + Supabase signups-OFF + OAuth redirect URLs her iki domain+localhost /auth/callback + tarayıcı smoke) §4 kurtarma runbook (create-admin / ADMIN_EMAILS+redeploy / Studio app_metadata).
- **Canlı koşu (2026-06-19):** 8 kullanıcı, **3 kalıcı admin** → prod brick-korumalı (ADMIN_EMAILS'ten bağımsız). Mutasyon YOK.
- **Sınır:** AI tarafı (preflight script + brick modeli) kapandı; tarayıcı smoke + Coolify/Supabase dashboard ayarları kaçınılmaz kullanıcı-tarafı (prod ADMIN_EMAILS script'çe görülemez — LOCAL env okunur).
- **Doğrulama:** tsc 0 · lint 0 · preflight canlı OK (exit 0, 3 admin) · full test 5568 değişmedi · build runtime kodu yok.
- **Denetim (A2+C1 yeni güvenlik kodu, REVIEW.md read-only):** K:0 Y:0 O:0 **D:1** Nit:2. Sağlam doğrulandı: hibrit fail-open (Redis down→route in-memory 5/dk korur), Redis-otoriter in-memory tüketmez, keyspace ayrı (`rl:ai` vs `rl:ai-<route>`), spoof-direnci. **D1:** `extractClientIp` X-Real-IP güveni deployment varsayımı (Traefik overwrite etmezse spoof X-Real-IP üzerinden geri gelir) → kod düzeltmesi yok (proxy'nin işi), aksiyon = C1 preflight §3'e Traefik X-Real-IP overwrite ops-kontrolü + `request-ip.ts` yorum-pointer eklendi. Nit'ler (looksLikeIp gevşek / Redis-up 2 round-trip) dokunulmadı. KALAN: push.
</details>

<details><summary>Önceki: A2 — rate-limit sertleştirme: IP spoof fix + AI-route Redis-backed</summary>

## Son Tamamlanan İş — 2026-06-19 (**A2 — rate-limit sertleştirme: IP spoof fix + AI-route Redis-backed**)

`deferred_backlog` A2 (denetim **O5**). **migration YOK.** PUSH BEKLİYOR. **Kullanıcı kapsam kararı (AskUserQuestion): "Mevcut altyapıyı sertleştir (Upstash YOK)".**

- **Bağlam:** M-3 turunda tam ioredis Redis-backed middleware rate-limit ZATEN kuruluydu (`rate-limit.ts` + `proxy.ts`); "Upstash" backlog adı bayat. O5'in iki gerçek artık-açığı kaldı: (1) IP spoof — `extractClientIp` XFF'in soldaki (client-kontrollü) değerini alıyordu (Traefik gerçek peer'ı append eder → spoof); (2) `ai-route-limit.ts` in-memory per-instance (çoklu-instance etkisiz, deploy'da sıfırlanır).
- **(1) `request-ip.ts` spoof-direnci:** X-Real-IP PRIMARY (Traefik-set, spoof edilemez) → XFF EN SAĞDAKİ (son) hop fallback (Traefik'in eklediği gerçek client) → hafif IP doğrulaması → `0.0.0.0`. Yanlış-key worst-case OVER-limit (güvenli), asla under-limit. Hem middleware hem AI guard anahtarı düzelir.
- **(2) `ai-route-limit.ts` hibrit:** `guardAiRoute` **async** — önce paylaşımlı Redis (`rateLimitCheck(ip:<ip>, aiRoutePolicy(route,limit))`; yeni `aiRoutePolicy` helper `rate-limit.ts`'te → `rl:ai-<route>` keyspace). `fromRedis=true` otoriter (429/allow); `fromRedis=false` (Redis yok/down/circuit) → mevcut in-memory `checkAiRateLimit` fallback (defense-in-depth + CI/Redis-down eski davranış birebir). 5 AI route'a `await` (stock-risk/parse/score/purchase-copilot/ops-summary; cron'lar yalnız yorumda anar). Tradeoff: dosya artık ioredis taşıyan rate-limit'i import eder (`extractClientIp` yine request-ip'ten — re-export korunur).
- **Test:** request-ip.test + rate-limit-helpers.test spoof-direnci yeniden yazıldı (eski "soldaki/ilki alınır" testleri O5 hatasını KODLUYORDU → bilinçli güncellendi, neden yorumda); ai-route-limit.test `@/lib/rate-limit` mock'landı (default fromRedis:false→fallback yolu; override fromRedis:true→Redis-primary 429/allow + key-check); ai-route-limit-integration regex `await guardAiRoute`'a uyarlandı. Gate route-guard-matrix `guardAiRoute` token'ı etkilenmez (AI route'lar guarded kalır).
- **GREEN:** tsc 0 · lint 0 · **5568 test** (+6) · build 0. **Sınır:** prod Traefik X-Real-IP set etmiyorsa keying farklılaşır (over-limit; ayrı smoke); REDIS_URL prod'da set olmalı ki AI limit instance'lar arası paylaşılsın. KALAN: push.
</details>

<details><summary>Önceki: D — migration durumu + gate hygiene (mig.104) + smoke checklist</summary>

## Son Tamamlanan İş — 2026-06-19 (**D — Migration durumu + gate hygiene (mig.104) + smoke checklist**)

`deferred_backlog` D. Rapor: `docs/audit/2026-06-19-d-migration-smoke.md`. **migration YOK; runtime kodu değişmedi.** PUSH EDİLDİ `9dc8c33`. **Kullanıcı kapsam kararı (AskUserQuestion): "Gate hygiene + tek doğrulama/smoke dosyası".**

- **Durum kesinleşti:** `npx tsx scripts/check-migrations.ts` → **17/17 auto-probe GREEN** (073…100 canlıda) → eski CLAUDE.md "088 BLOKER / 091 APPLY bekliyor" notları BAYAT, gerçek durum temiz.
- **Gate hygiene:** `check-migrations.ts` MANUAL map'ine **mig.104** (`reverse_production` REDEFINE — production O1 `for update`) eklendi; önceden hiç izlenmiyordu → artık `⚠️ 104 … elle doğrula` raporlanır (sessiz untracked kapandı; `manuel: 7→8`). 081/082/083 bilinçli dokunulmadı ("Tam kapsama" seçilmedi).
- **Smoke doc 3 bölüm:** §1 probe sonucu (17/17 ✅); §2 **8 MANUAL redefine doğrulama SQL'i** (089 alerts CHECK po_overdue · 093 create_order v_line_total · 094 send_quote qli.description + uq index cancelled-hariç · 095 scan_lock search_path · 101 alerts CHECK rfq_response_due · 102 create_rfq ON CONFLICT'siz · 103 award fiyat-vermedi · 104 reverse_production for update — hepsi Studio, kullanıcı; OpenAPI fonksiyon gövdesi görmez); §3 **browser smoke checklist** (A3 guards: production/purchasing→quotes 403, accounting→movements/products-quotes/alerts 403, production→customers 403; production O1 eşzamanlı geri-alma stok 1×; orders Y1/O2; mig.099 birim; quote send/mail; tema+demo).
- **Sınır (doc'ta net):** AI tarafı (probe + gate hygiene) kapandı; kalan iş kaçınılmaz **kullanıcı-tarafı** — ortamda `DATABASE_URL`/psql YOK (arbitrary SQL koşulamaz), tarayıcı sürülemez.
- **Doğrulama:** check-migrations re-run `manuel: 8` + 104 satırı görünür · lint 0 (test/build'e dokunulmadı — runtime değişmedi, script vitest gate değil).

</details>

<details><summary>Önceki: A3 — route-guard gate METHOD-SEVİYE + yakaladığı 3 açık</summary>

### A3 — route-guard gate METHOD-SEVİYE + yakaladığı 3 açık

`deferred_backlog` A3. Rapor: `docs/audit/2026-06-19-a3-method-level-guard-gate.md`. **migration YOK.** PUSH BEKLİYOR. **Kullanıcı kapsam kararı (AskUserQuestion): Tam A3 (detektör+baseline+3 guard).**

- **Sorun:** `route-guard-matrix.test.ts` `guarded`'ı dosya-seviye (`src.includes`) → bir method guard'lıysa tüm dosya korunmuş sayılıyor, guard'sız kardeş GET görünmüyordu (kampanya B'nin 9 modülde elle bulduğu kör nokta sınıfı).
- **Çözüm (detektör):** gate yeniden yazıldı — her exported method gövdesi ayrı taranır (`export fn X`→sonraki export) + **file-local guard-helper çözümü** (gövdesinde guard içeren dosya-yerel fn/const, brace-eşlemeli `blockAfter` → calendar-notes `context()` çözülür; admin/users `requireAdmin(` direkt pattern) + `requireCronSecret(` pattern'e eklendi (email/outbox/process robustça guarded→baseline'dan düştü). `route-guard-baseline.ts` **method-anahtarlı** (methods=kasıtlı guard'sız method; per path+method violation+stale).
- **Re-baseline:** 135 route→**26 guard'sız method** sınıflandırıldı: dashboard-tier (products/[id]/production/alerts/aging/counts/dashboard-counters/finance), config (note-templates(+[id])/product-types(+[id]/fields)), collateral (attachments+url), self-auth (settings/user/*), public (auth/*/exchange-rates/email-webhook + settings/company SAFE-whitelist GET), tombstone (quotes/[id]/convert).
- **Yakaladığı 3 GERÇEK açık → guard eklendi:** `GET /api/quotes`+`GET /api/quotes/[id]`→`view_quotes` (İZLENEN borç kapandı; production+purchasing quote pipeline [müşteri+teklif no+tarih] okuyordu, redaction yalnız fiyat maskeler; dashboard KPI fail-soft + quotes sayfaları view_quotes-gated→consumer-safe); `GET /api/inventory/movements`→`view_products` (UI tüketicisi yok, accounting/anon'a açıktı).
- **GREEN:** tsc 0 · lint 0 · **5562 test** (+8: YENİ `quotes-inventory-read-guards.test.ts` 9) · build 0. Gate artık gelecekteki TÜM method-seviye guard kör noktalarını PR'da yakalar. KALAN: push.
</details>

<details><summary>Önceki: settings modülü derin denetim TEMİZ + KAMPANYA B TAMAMLANDI</summary>

## Son Tamamlanan İş — 2026-06-19 (**settings modülü derin denetim TEMİZ + KAMPANYA B TAMAMLANDI**)

`erp2-reviewer` modül-modül kampanyasının **SON modülü: settings**. Kapsam: 10 settings route + admin/users(+[id]) + lib + sayfalar. Rapor: `docs/audit/2026-06-19-settings-review-bulgular.md` (**K:0 Y:0 O:0 D:0 Nit:0 — kampanyanın en olgun modülü, bulgu manufacture EDİLMEDİ**). **Kod değişikliği YOK** — yalnız rapor + memory. PUSH BEKLİYOR.

- **Temiz doğrulananlar:** `admin/users` POST/PATCH/DELETE → `requireAdmin` (app_metadata.roles∋admin + zero-admin bootstrap + **listUsers HATASI fail-CLOSED**) + `normalizeAssignedRoles` (normalizeRole geçersiz rol atar → privilege injection yok, default viewer) + **last-admin lockout** (countAdmins fail-closed, PATCH-demote+DELETE); `api-keys-status` → `requireInternalOperator` + demo→false + yalnız boolean; `company` GET guard'sız ama **SAFE_COMPANY_FIELDS whitelist** (antet/branding, secret yok — PDF/başlık view-tier; PATCH/logo manage_settings+validateCompanyPatch); `files` GET/download view_settings · POST/DELETE manage_settings + MIME/size/kategori + **SVG-attachment XSS defense** (mig.046) + signed-URL TTL; `user/password` → **mevcut-şifre doğrulama** (cookie'siz izole client) + audit; avatar PNG/JPEG/WebP(SVG yok)+1MB; profile fullName 2-100; preferences self-auth. **view_settings/manage_settings yalnız admin** → settings admin-tier.
- **KAMPANYA B (modül-modül derin inceleme) TAMAMLANDI** — 9 modül: RFQ·Orders·Quotes·Paraşüt·import/AI·production·customers/products·alerts·settings. Toplam bulgu profili: çoğunlukla method-seviye guard kör noktaları (gate A3) + bir stok-defteri idempotency (production O1/mig.104). Kalan iş B değil → A2 Upstash · A3 gate guard-matrisi · C1 Login canlı tur · C2 Paraşüt Faz12 · D migration/smoke ([[deferred_backlog]]).
</details>

<details><summary>Önceki: alerts modülü derin denetim (kampanya B) + D1</summary>

## Son Tamamlanan İş — 2026-06-19 (**alerts modülü derin denetim (kampanya B) + D1**)

`erp2-reviewer` kampanyasının (RFQ✅+Orders✅+Quotes✅+Paraşüt✅+import/AI✅+production✅+customers/products✅ sonrası) **alerts** turu. Kapsam: 6 alert route + `/api/calendar-notes`(+[id]) + alert-service + helper'lar + sayfa/component. Rapor: `docs/audit/2026-06-19-alerts-review-bulgular.md` (**K:0 Y:0 O:0 D:1 Nit:0** — modül çok olgun). **migration YOK.** PUSH BEKLİYOR. **Kullanıcı kapsam kararı (AskUserQuestion): D1 düzelt.**

- **D1 (Düşük):** `GET /api/alerts/[id]` `view_alerts` guard'sızdı → `dbGetAlertById` `select("*")` tam satır (ai_reason+ai_inputs_summary+serbest user_note+created_by); liste GET bilinçli DAR kolon+dashboard-tier ama `[id]` detay tam satırı verir. Kardeş calendar/calendar-notes(+[id])/[id]-PATCH hepsi view_alerts/manage_alerts guard'lı; bu GET method-seviye kör noktada atlanmış → accounting (view_alerts YOK)+proxy-fail-open/anon tam detayı okuyabiliyordu. **GET'in UI tüketicisi YOK** (alerts/page.tsx tüm `/api/alerts/${id}` çağrıları PATCH) → guard hiçbir şeyi kırmaz. DÜZELTME: GET'e `requirePermission(view_alerts)` (PATCH+calendar kardeş kalıbı). Gate matrix yeşil (baseline değişmedi — A3 dosya-seviye PATCH guard'ı zaten "korunmuş" sayıyordu).
- **By-design (bulgu değil):** liste GET dashboard-tier+DAR kolon (accounting AlertsPanel `useAlerts`); scan CRON_SECRET veya oturum (products mount'unda tüm view_products rollerinde oto-tetik `products/page.tsx:231` → session-tier zorunlu; idempotent+advisory-lock+non-destructive); ai-suggest cron-only (`requireCronSecret`); sync-retry manage_alerts; calendar GET view_alerts.
- **Temiz:** calendar-notes(+[id]) session+view_alerts+`canView/canManageCalendarNote` (ownership+visibility)+validation (örnek-temiz); AI üretimi G1/G2 sanitize+dedup+halüsinasyon filtresi; advisory-lock'lar.
- **GREEN:** tsc 0 · lint 0 · **5554 test** (+3 YENİ `alerts-read-guards.test.ts`) · build 0. KALAN: push + opsiyonel smoke (accounting→`GET /api/alerts/<id>` 403; alerts sayfası+dashboard tüm rollerde normal).
</details>

<details><summary>Önceki: customers/products modülü derin denetim (kampanya B) + O1/D1/Nit</summary>

## Son Tamamlanan İş — 2026-06-19 (**customers/products modülü derin denetim (kampanya B) + O1/D1/Nit**)

`erp2-reviewer` kampanyasının (RFQ✅+Orders✅+Quotes✅+Paraşüt✅+import/AI✅+production✅ sonrası) **customers/products** turu. Kapsam: customers 2 route + products 10 route + `redact.ts` + sayfalar. Rapor: `docs/audit/2026-06-19-customers-products-review-bulgular.md` (**K:0 Y:0 O:1 D:1 Nit:1**). **migration YOK.** PUSH BEKLİYOR. **Kullanıcı kapsam kararı (AskUserQuestion): O1 + D1 + Nit.**

- **O1 (Orta):** `GET /api/customers` `view_customers` guard'sızdı → `redactCustomersForPerms` yalnız `total_revenue`'yu maskeler, müşteri **PII** (ad/e-posta/telefon/adres/vergi) korumasızdı. `view_customers` production'da YOK + `page-access.ts:42` sayfayı production'a kapatır → production (+ proxy-fail-open/anon) tüm PII'yi doğrudan API'den okuyabiliyordu. Tüketici-güvenli (`useCustomers` yalnız manage_quotes/manage_sales_orders/view_customers UI'larında; dashboard'dan customers elenmiş; demo=viewer taşır). DÜZELTME: GET'e `requirePermission(view_customers)` (redaction korunur). **products GET'ten asimetri KASITLI:** products dashboard-tier (accounting StockPanel ister→guard edilemez), customers dashboard'dan elenmiş→guard'lanır.
- **D1 (Düşük):** `GET /api/products/[id]/quotes` hiç guard'sızdı (kardeş shortages/supplier-prices `view_products` guard'lı) → teklif kırılımı (müşteri+miktar+`createdByEmail` satışçı e-postası) view_products'sız accounting+anon'a açıktı; redaction yalnız sales-price'ı maskeliyordu. DÜZELTME: `resolveAuthContext`+`requirePermissionFor(view_products)` (kardeş kalıp, tek auth çağrısı). Gate `route-guard-baseline`'dan products/[id]/quotes redaction kaydı DÜŞÜRÜLDÜ.
- **Nit:** `PATCH /api/customers/[id]` `revalidateTag("customers")` çağırmıyordu (POST/DELETE çağırıyor) → düzenleme ≤30s bayat; eklendi.
- **By-design (bulgu değil):** products/[id]/aging/counts GET guard'sız ama dashboard-tier (redaction'lı, accounting StockPanel); attachments+signed-URL GET proxy-only (O11 default-flip).
- **Temiz:** redact.ts kapsamlı (cache-DIŞI per-request, perms key'e girmez), tüm yazma role-guard'lı, attachments UUID/product_id/kind-whitelist, supplier-prices/shortages view_products guard'lı, PATCH customers PATCHABLE whitelist.
- **GREEN:** tsc 0 · lint 0 · **5551 test** (+6 YENİ `customers-products-read-guards.test.ts`; 2 mevcut quotes test auth-mock güncellendi) · build 0. KALAN: push + opsiyonel smoke (production→customers GET 403; accounting→products/[id]/quotes GET 403).
</details>

<details><summary>Önceki: production modülü derin denetim (kampanya B) + O1</summary>

## Son Tamamlanan İş — 2026-06-18 (**production modülü derin denetim (kampanya B) + O1 düzeltmesi**)

`erp2-reviewer` modül-modül kampanyasının (RFQ✅+Orders✅+Quotes✅+Paraşüt✅+import/AI✅ sonrası) **production** turu. Kapsam: 3 route (`/api/production`, `[id]`, `transcribe`) + `production-service.ts` + `supabase/production.ts` + `production-shortage-helpers.ts` + `complete_production`/`reverse_production` RPC (mig.004/008) + `/dashboard/production` sayfası + dashboard production paneli. REVIEW.md read-only. Rapor: `docs/audit/2026-06-18-production-review-bulgular.md` (**K:0 Y:0 O:1 D:0 Nit:2**). **mig.104 APPLY ✅.** PUSH EDİLDİ `2aaf14f` (main=codex birebir). **Kullanıcı kapsam kararı (AskUserQuestion): O1 düzelt (mig.104).**

- **O1 (Orta):** `reverse_production` üretim kaydını **`FOR UPDATE` olmadan** okuyordu. READ COMMITTED'de aynı `entry_id`'ye iki eşzamanlı DELETE (iki sekme/retry/script): ikisi de kilitsiz `v_entry` okur → A product-lock alır, on_hand 100→90 + BOM iadesi + entry sil + commit; B product-lock alır, EvalPlanQual ile on_hand=90 (taze) ama `v_entry` STALE (entry "var" sanır) → on_hand 90→80 (**ikinci düşüş**) + BOM **ikinci iade**, `delete` 0 satır. Sonuç: on_hand 2× düşmüş, bileşen 2× iade, tek (sıfır) kayıt → **stok defteri sessizce bozulur**. `delete` idempotent ama stok mutasyonları satır-sayısına bağlı değil; RPC "Atomic" iddia ediyordu. Hafifletmeler (gerçek olasılığı düşürür ama DB sınırı UI'ye güvenmemeli): `delete_production` yalnız admin+production; UI `deletingId`+disabled+onay modalı (casual çift-tık korunur). **DÜZELTME (mig.104):** entry select'e `for update` (TEK SATIR) → satır kilidi iki tx'i serialize eder, kaybeden re-read'de silinmiş satırı bulamaz → `{success:false,'…bulunamadı veya zaten geri alınmış'}`, stok 1× geri. Gövde 008 ile birebir; on_hand "zaten sevk" guard'ı DELETE öncesi → korunur; yeni kilit sırası entry→product→component, complete_production product→component ile ters-çift yok → deadlock yok. Gate `sql-lint-baseline` `reverse_production: ["004","008","104"]`.
- **By-design (BULGU DEĞİL, raporda gerekçeli):** `GET /api/production` route guard'sız ama **kasıtlı dashboard-tier**: ana dashboard tüm rollerde `useProduction()` çağırır (`dashboard/page.tsx:44`, `productionFetchUrl()` 120-gün pencere/limit 5000). `resolveAuthContext` no-session→**viewer floor** (demo=cookie-only). `view_production` guard (admin+production) demo+4 rolde dashboard paneli kırar; `view_dashboard` guard no-op (viewer taşır); hard 401 demo'yu kırar. Detay sayfası `page-access.ts:38` view_production'a kapalı; overview metrikleri view_dashboard-tier → model tutarlı.
- **Nit-1:** `complete_production` çift-POST idempotent değil (görünür/geri-alınabilir, izlenir). **Nit-2:** `dbCompleteProduction` UTC default tarih (dormant — sayfa hep yerel `tarih` gönderir).
- **Temiz:** POST `manage_production`+validation; DELETE `delete_production`; transcribe session+manage_production+isVoiceAvailable+MIME/10MB; complete_production FOR UPDATE deterministik kilit+shortage pre-check abort+ceil; scrap_qty kasıtlı düşülmez (UI'da kolon yok, fire→notlar); shortage-helpers saf client-safe boundary; demo bloklu.
- **GREEN:** tsc 0 · lint 0 · **5545 test** · build 0. **O1 saf SQL → vitest eşzamanlılığı kanıtlayamaz; enforced "test"=gate baseline zinciri.** KALAN: opsiyonel eşzamanlı-DELETE smoke (push + mig.104 APPLY ✅).
</details>

<details><summary>Önceki: import/AI modülü derin denetim (kampanya B) + O1/D1</summary>

`erp2-reviewer` modül-modül kampanyasının (RFQ✅+Orders✅+Quotes✅+Paraşüt✅ sonrası) **import/AI** turu (en geniş yüzey: 15 import + 6 AI route + ~5000 satır lib). REVIEW.md kurallarıyla **tam bağlamla doğrudan** read-only inceleme. Rapor: `docs/audit/2026-06-18-import-ai-review-bulgular.md` (**K:0 Y:0 O:1 D:1 Nit:1**). **migration YOK.** Commit `cb7a2c8` (main=codex-experiment birebir, push edildi). **Kullanıcı kapsam kararı (AskUserQuestion): O1 + ops-summary; purchase-copilot'a dokunma.**
</details>
- **O1 (Orta) — iki guard'sız import GET (method-seviye kör nokta):** `GET /api/import/[batchId]` + `GET /api/import/drafts/[id]` hiç RBAC guard'ı içermiyordu — yalnız proxy oturumuna dayanıyordu. Dosya `requirePermission`'ı DELETE/PATCH'te kullandığından dosya-seviye guard taraması (gate A3 kör noktası) "korunmuş" sanıyordu; GET açıkta, gate baseline'da bile yok. `view_import` yalnız **admin+purchasing**'de → **sales/production/accounting/viewer (4/6) + demo** okuyabiliyordu (draft tedarikçi/fiyat verisi + batch metadata; proxy demo'ya `GET /api/*` izni verir [`proxy.ts:204`], RBAC'i route'a bırakır). Y1 kardeş route'lara (`drafts` list / `report` / `lines` / `preview-image`) `view_import` eklemişti, bu iki tekil GET atlanmıştı. **Düzeltme:** her iki GET'e `requirePermission(req,"view_import")` (kardeş kalıp).
- **D1 (Düşük) — ops-summary route-seviye auth'suz:** yalnız `guardAiRoute` (rate-limit) vardı. Sömürülebilir DEĞİL (demo=session yok→`hasAuthenticatedSession` false; tüm roller view_dashboard taşır) — boşluk proxy-fail-open + stock-risk Y2 tutarlılığı. **Düzeltme:** rate-limit sonrası `resolveAuthContext`+`requirePermissionFor(ctx,"view_dashboard")` (stock-risk Y2 kalıbı; UI hiçbir rolde kırılmaz).
- **İzlenen (dokunulmadı):** purchase-copilot POST (ALWAYS_PUBLIC+cron, rec yazar, `checkAuth` ama RBAC yok) + ai/parse(10/dk) + ai/score(5/dk) oturum-only RBAC'siz — demo/anon zaten bloklu → düşük; [[deferred_backlog]] izlenen RBAC borçları.
- **Temiz:** tüm import yazma/uygula (`apply-mappings`/`confirm`/`detect-columns`→`manage_import`; `apply`/`extract`/`classify`/`document-lines` PATCH→`requireRoleFor(admin,purchaser)`) guard'lı; **prompt-injection sanitizasyon (G1/G2)** `ai-service.ts` boyunca tutarlı (input zero-width/bidi/C0/role-marker/backtick strip + cap; output `sanitizeAiOutput`/`capAiStringArray`/`clampConfidence`); `requireRoleFor` purchaser→purchasing çift-normalize; extract status/abort(499)/re-extract-422 guard; apply field-approval whitelist + regex + idempotency; observability `requireInternalOperator`; demo=cookie-only (session yok).
- **Test:** +4 (`rbac-mutation-guards` 2 import GET 403 [gerçek viewer-perm]; `ai-ops-summary-route` 2 auth 401/403 + role-guard mock). tsc 0 · lint 0 · **5545 test** (+4) · build 0. **Kalan:** push ✅ + opsiyonel smoke (viewer/demo→import GET 403; dashboard AI özet tüm rollerde).

<details><summary>Önceki: Paraşüt modülü derin denetim (kampanya B) + O1 (checkAuthAlertThreshold wiring)</summary>

`erp2-reviewer` **Paraşüt** turu. Rapor: `docs/audit/2026-06-18-parasut-review-bulgular.md` (**K:0 Y:0 O:1 D:0 Nit:2**). Commit `eb829ed`. **migration YOK.** ⚠️ Paraşüt MOCK+`PARASUT_ENABLED` off → bulgu yalnız Faz 12 go-live'da ısırır.
- **O1 — `checkAuthAlertThreshold` orphaned:** export+25 testli ama hiç üretim çağıranı yoktu. Canlıda refresh_token iptal→tüm sync sessizce durur, alert açılmaz, alert→sync-retry→OAuth-refresh kurtarma döngüsü tetiklenemez. **Düzeltme (WIRE ET):** `serviceSyncOrderToParasut`+`serviceRetryParasutStep` catch'lerinde error-log sonrası `pe.kind==="auth"`→best-effort `checkAuthAlertThreshold()` (dedup çift önler). +5 test.
- **Nit-1** poll(5s)<lease(30s); **Nit-2** manuel-refresh lease'siz expires_at. **Temiz:** OAuth-CSRF/token-RLS/RBAC(view_parasut admin+accounting→redaction açığı yok)/secret-mask/stok-invariant/idempotency/discount-reconcile. 5541 test.
</details>

<details><summary>Önceki: Quotes modülü derin denetim (kampanya B) + O1 (legacy expire-quotes sil)</summary>

`erp2-reviewer` kampanyası **quotes** turu. Rapor: `docs/audit/2026-06-18-quotes-review-bulgular.md` (**K:0 Y:0 O:1 D:1 Nit:1**). **migration YOK.**
- **O1 (Orta) — iki teklif-sona-eriş cron'u çakışıyordu:** `crons.yml` hem canonical `/api/quotes/expire` hem legacy `/api/orders/expire-quotes` (`order-service.serviceExpireQuotes`, eski `sales_orders.quote_valid_until`; 088:102/077:88 yazar) çağırıyordu → çift `quote_expired` alert + draft sipariş bant-dışı iptali.
- **Düzeltme (kullanıcı: tamamen sil):** SİLİNDİ → `api/orders/expire-quotes/route.ts` + 2 test + `order-service.serviceExpireQuotes` (+ölü import) + `orders.dbListExpiredQuotes` + `crons.yml`/OUTCOMES + `proxy.ts` CRON_PATHS. `smoke.ts [19]`→canonical. KORUNDU canonical `quote-service.serviceExpireQuotes`/`quotes.dbListExpiredQuotes`. ⚠️ `serviceExpireQuotes` İKİ modülde vardı; yalnız order-service silindi.
- **D1 (Düşük, izlenen):** GET /api/quotes(+[id]) route-guard'sız. **Temiz:** share-token/public-route/arşiv-React-escape/SSRF/RBAC/redaction parity. tsc 0 · lint 0 · 5536 test · build 0.
</details>

<details><summary>Önceki: A1 — products server-side pagination → A1 EPIC TAMAMLANDI 6/6</summary>

products A1'in son listesiydi; diğer 5 aynanın temiz RSC kalıbına UYMAZ (risk/alert overlay'leri AI/POST + mount-sonrası → RSC'ye ucuza taşınamaz). **Karar (AskUserQuestion):** "Client + sunucu-sayfalı fetch (tam sadakat)" — sayfa `"use client"` KALIR, mega-fetch → sayfalı `{rows,total}`; sinyal filtresi aktifken overlay ID seti sunucuya `id.in` ile geçer. **migration YOK.**
- **`supabase/products.ts`:** `dbListProductsPaged` (arama name/sku `.or` + çoklu-kategori `in(category)` + tip `eq` + sinyal `in(id)` + `count:"exact"`; **`signalActive && ids boş → BOŞ`** [tümünü döndürmez, sorgu çalıştırmaz]); `dbGetProductListCounts` (tüm-katalog total+kategori+kritik [`promisable=on_hand-reserved-quoted ≤ minStok`, `dbGetQuotedQuantities` gerekir]; hafif kolonlar id/category/on_hand/reserved/min_stock_level — full-object değil); `PRODUCTS_DEFAULT_PAGE_SIZE=50`; `orIlikeFilter` import.
- **route:** `GET /api/products?paged=1` → `{rows,total}` (dizi şekli `?all=1`/çıplak GET DEĞİŞMEZ — yalnız paged=1 nesne; enrich+redact aynen); YENİ `GET /api/products/counts` (yalnız adetler, hassas değil → gate baseline'a `public` kayıt; products list GET'le aynı sınıf).
- **`products/page.tsx`:** `mockProducts`(tüm)→`pageRows`(sayfa)+`total`+`counts`; `signalIds` memo (riskli=riskData.keys/uyarılı=productsWithAlerts/öneri=recMap suggested → null=tümü); `buildListParams`+`fetchList`+`refetchCounts`; arama 350ms debounce + filtre değişiminde `setCurrentPage(1)` (kategori/tip/alertFilter/temizle handler'ları); `filtered`/`usePagination(filtered)`/`pagedItems` KALKTI → `computeTotalPages(total,PAGE_SIZE)`+`<Pagination onPageChange={setCurrentPage}>`; sinyal/kategori/kritik sayaçları overlay(size)+counts'tan (sayfadan değil); mutasyon→`fetchList()+refetchCounts()`.
- **Test:** +7 (`products-pagination.test.ts` paged filtre/sinyal-boş-guard/range + counts agregasyon; `pagination-integration` products→server-side; gate matrix `products/counts` baseline). tsc 0 · lint 0 · **5545 test** · build 0 (`/api/products/counts` ƒ dynamic). **Kalan:** push + manuel smoke (arama/kategori/tip/sinyal sunucuda; sinyal sekmeleri tam-katalog [yalnız sayfa değil]; sayaçlar/kritik doğru; mutasyon→liste+sayaç; viewer redaction; demo bloklu). ⇒ [[deferred_backlog]] A1 TAMAMLANDI 6/6.
</details>

<details><summary>Önceki: A1 rollout — quotes · purchase/orders · customers · vendors server-side pagination</summary>

Orders pilotunun (aynı gün `d4ed2e9`) RSC + sunucu-filtre/sayfalama pattern'i 4 "ayna" listeye yayıldı; **products ERTELENDİ** (risk/AI/alert overlay tüm-set client → ayrı redesign turu, [[deferred_backlog]] A1 kalanı). Kararlar (AskUserQuestion): 4 ayna + products ertele · paylaşılan soyutlama. **migration YOK.**
- **Shared infra:** `src/hooks/useListUrlState.ts` — `useListUrlState(current, serialize)` → `{navigate(partial), isPending}` (router.replace+useTransition; `current` REF'te → navigate kararlı, debounce effect'i parent render'da yeniden bağlanmaz) + `useDebouncedSearch(serverValue, onCommit, 350)`. `src/lib/list-query.ts` — `firstStr`/`parsePage`/`orIlikeFilter(columns, search)` (`.or()` güvenli escape, RFQ emsali; `buildOrderSearchOrFilter` buna delege). **Orders pilotu da bu hook'lara refactor edildi** (OrdersClient navigate/debounce → hook; tek bakım noktası).
- **Her sayfa (orders S0–S3 tekrarı):** DB `db<X>Paged` (`count:"exact"` tek sorgu `{rows,total}`, filtreler ORDER/RANGE'den ÖNCE) + sayaç fn; `page.tsx`→SUNUCU (`force-dynamic`, `await searchParams`, RBAC redaction route-birebir, mapper, `<X>Client/>`) + `loading.tsx`; `<X>Client.tsx` URL-driven + 350ms arama debounce, mutasyon→`router.refresh()`.
- **quotes:** status tab+arama(quote_number/customer_name)+döviz+`created_at` tarih; `dbListQuotesPaged`/`dbCountQuotesByStatus`; redactQuotesForPerms MAPPED summary üzerinde (map ÖNCE). bulk-delete `pickSucceededIds` sayım + refresh.
- **purchase/orders:** status+arama; **vendor-adı araması** = ada eşleşen vendor_id'ler (sayfada çözülür) → `dbListPurchaseOrdersPaged` `.or(po_number.ilike, vendor_id.in.(...))`; vendorMap server'da tüm vendor'dan; `dbCountPurchaseOrdersByStatus`; redactPurchaseOrdersForPerms ham satır.
- **customers:** arama(name/email/country)+aktif/pasif; `dbListCustomersPaged({is_active})`+`dbCountCustomers` (all/active/passive). **Pasif sekmesi DÜZELTİLDİ** (eski `dbListCustomers` yalnız is_active=true → pasif boştu). Mutasyon doğrudan fetch + `mutate(CUSTOMERS_KEY)` (dashboard cache) + refresh; DataContext liste aboneliği başlatılmaz.
- **vendors:** arama(name/contact_person/contact_email)+"Pasifleri göster"(all=1→isActive undefined); `dbListVendorsPaged`; TAB YOK → yalnız total (count-by-tab gerekmez).
- **RSC sonucu:** client `loadError`/`loadVendors`/`loadOrders` graceful-retry kalktı → sunucu hatası Next error boundary'sine (sessiz yutma yok). Testlerdeki eski loadError kilitleri RSC'ye uyarlandı.
- **Test:** +~50 (`{quotes,purchase-orders,customers,vendors}-pagination.test.ts` filtre→sorgu+total+sayaç + `list-url-state.test.tsx` hook + ~10 source-lock page→Client yönlendirildi: pagination-integration server-side/expectPaginationWired paylaşıldığı için DOKUNULMADI, underlined/button/faz7/theme/interactive/quotes-ui/purchase-orders-ui/customers-ui/vendors-ui). tsc 0 · lint 0 · **5538 test** · build 0 (5 hedef route ƒ dynamic). **Kalan:** push + manuel smoke (her sayfa: filtre/sayfa URL'e + geri/ileri; sayaçlar; mutasyon→refresh; viewer redaction; demo bloklu; customers pasif sekmesi dolu; büyük veri sayfalanır) + **sonraki tur: products** (ayrı/ağır).
</details>

<details><summary>Önceki: A1 — Orders sunucu tarafı sayfalama / RSC pilot (`d4ed2e9`)</summary>

## Son Tamamlanan İş — 2026-06-17 (**A1 — Orders sunucu tarafı sayfalama / RSC pilot**)

`deferred_backlog` A1 (en büyük bekleyen). Kullanıcı kararı (AskUserQuestion): **RSC + loading.tsx tam yeniden** + **orders pilotu → sonra 5 listeye yay**. Önceki: liste `?all=1` ile TÜM satırları çekip `usePagination`+`useMemo` ile bellekte filtreler/dilimlerdi. **migration GEREKMEZ** (mevcut kolonlar + count:"exact").
- **S0 (`src/lib/supabase/orders.ts`):** `dbListOrdersPaged(OrdersPageQuery)` tek sorguda `count:"exact"` → `{rows, total}` (range'den bağımsız total); tab→commercial/fulfillment eksen çevirisi (UI `matchesTab` birebir: shipped=fulfillment, approved=commercial≠shipped, draft/pending/cancelled=commercial), arama/tarih(`Tgün başı/sonu`)/döviz/müşteri SQL filtreleri ORDER/RANGE'den ÖNCE (filtre metotları select builder'da garanti, tip-derinliği patlamaz). `dbCountOrdersByTab` 6 global head+count (arama/tarih-bağımsız = eski rozet davranışı). `buildOrderSearchOrFilter` `.or()` güvenli escape (RFQ O2 emsali, `"`+`\`). service: `serviceListOrdersPaged`/`serviceCountOrdersByTab`.
- **S1 (`orders/page.tsx`):** SUNUCU component (`force-dynamic`) — `await searchParams` (tab/search/customer[Id]/from/to/currency/page; eski `customer` deep-link → search) → `resolveAuthContext`+`view_sales_orders` guard (yoksa "yetkiniz yok") → Promise.all(paged, counts) → `redactOrdersForPerms` (route ile birebir; fiyat null) → `mapOrderSummary` → `<OrdersClient/>`. + `loading.tsx` aria-busy iskelet.
- **S2 (`OrdersClient.tsx` YENİ client):** tüm filtre/arama/tarih/döviz/pagination URL'e yazılır (`navigate()`→`router.replace`+`useTransition` dim), arama 350ms debounce (yazarken responsive), satırlar yalnız geçerli sayfa prop'undan (`orders.map`), `computeTotalPages` + `<Pagination onPageChange={p=>navigate({page:p})}`; `usePermissions` korundu (`has("manage/delete_sales_orders")`, `canViewSalesPrices`), demo guard, bulk/single iptal→`router.refresh()`. `isOrderCancellable` buraya taşındı (export).
- **Test:** +26 — `orders-pagination.test.ts` (filtre→sorgu çevirisi + total + escape + sayaç), `orders-rsc-pagination.test.ts` (RSC/client/loading mimari kilit), **9 source-lock testi page.tsx→OrdersClient.tsx yönlendirildi** (orders-page-title/pagination-integration/underlined-filter-tabs/theme-system/interactive-muted-text/button-source-regression/orders-review-fixes/faz7-ui-masking/orders-list-bug-fixes), `pagination-integration` orders case server-side'a özelleştirildi (`expectPaginationWired` paylaşıldığı için dokunulmadı).
- tsc 0 · lint 0 · **5514 test** · build 0 (`/dashboard/orders` artık ƒ dynamic). **Kalan:** push (main+codex FF+proje-codex) + manuel smoke (filtre/sayfa URL'e yazılır + geri/ileri; tab sayaçları doğru; iptal→refresh; viewer redaction; demo bloklu; büyük veri sayfalanır). **Sonraki tur:** pattern'i products→customers→vendors→quotes→purchase/orders'a yay ([[deferred_backlog]] A1 kalanı).

<details><summary>Önceki: Orders modülü derin denetim + bulgu düzeltmeleri</summary>

`erp2-reviewer` orders modülünü taradı (rapor `docs/audit/2026-06-17-orders-review-bulgular.md`; K:0 Y:1 O:2 D:1 Nit:2; mekanik araçlar yeni bulgu yok). Kullanıcı "raporu commit'le + bulguları düzelt" → plan onaylı (AskUserQuestion: D1=tamamen kaldır, O1=yalnız guard). **migration GEREKMEZ** (try_resolve_shortages reuse).
- **Y1 (kök):** `serviceReceivePOLines` (purchase-order-service.ts) mal kabulü sonrası alınan satırların DISTINCT ürünleri için `dbTryResolveShortages` (best-effort) → onaylı `partially_allocated` sipariş PO ile gelen stokla otomatik `allocated`'a yükselir (mig.008 promosyonu) → eskiden kalıcı sıkışıyordu + "Sevket" yanıltıcı aktifti.
- **O2:** yeni `POST /api/orders/[id]/reallocate` + `serviceReallocateOrder(orderId)` (yeni helper `dbGetOpenShortageProductIds` → her ürün için try_resolve_shortages, best-effort) + UI "Yeniden Rezerve Et" butonu (partially/unallocated'da, manage_sales_orders); **"Sevket" yalnız `allocated`'da aktif** (aksi tooltip'li disabled).
- **O1:** `/api/orders` + `/api/orders/[id]` GET'lerine `resolveAuthContext + requirePermissionFor("view_sales_orders")` (gate dosya-seviye `src.includes` kör noktası nedeniyle açıktı; demo-anon→viewer fallback bu izne sahip → demo çalışır). PII redaction bilinçli eklenmedi.
- **D1:** `partially_shipped` TS seviyesinde tamamen kaldırıldı — `database.types`/`mock-data`/`data-context` union, 3 UI config, view-model label+tone, seed-runner (senaryo→tam `shipped`), seed-data #9 (`shipped`), 2 test. Uygulanmış SQL'e DOKUNULMADI (007 vb. zararsız ölü dal).
- **N1:** OrderForm 3× `new Date().toISOString().slice(0,10)` → `localISODate`. **N2:** parasut-status per-line `dbGetProductById` (N+1) → tek `dbGetProductParasutIds` batch.
**+10 yeni test** (`orders-review-fixes.test.ts`: Y1/O2 davranış + O1/D1/N1/N2 source-lock) + 2 mevcut test güncellendi. tsc 0 · lint 0 · **5488 test** · build 0 (`/api/orders/[id]/reallocate` manifest'te). **Açık follow-up:** gate `route-guard-matrix.test.ts:62` method-seviye guard tespiti (ayrı tur, 100+ route reclass). **Kalan:** manuel smoke (PO mal kabul → otomatik allocated + Sevket; Yeniden Rezerve Et; allocated olmadan Sevket disabled).

</details>

</details>

## Önceki İş — 2026-06-17 (**erp2-reviewer denetim turu — RFQ O1/O2/D1 düzeltildi**)

`/erp-review` (full) ilk uçtan-uca koşu (restart sonrası `erp2-reviewer` subagent çağrıldı). Bulgular `docs/audit/2026-06-17-review-bulgular.md` (**K:0 Y:0 O:2 D:1 Nit:2**; önceki 2026-06-16 turunun O1/O2/D1/D2'si `01501ff`'te zaten kapanmıştı → bu tur yeni RFQ noktaları). **migration GEREKMEZ.** Kullanıcı "O1, O2, D1'i sırayla düzelt" dedi → uygulandı:
- **O1** `rfq-service.ts:85` tedarikçi e-postası gövdesi `escapeHtml`'siz interpole ediyordu (latent stored-XSS / `templates.ts escapeHtml` konvansiyonundan sapma) → yerel `escapeHtml` helper + `vendor_name`/`rfq_number`/`due_date` sarmalandı.
- **O2** `supplier-rfqs.ts:65` arama PostgREST `.or()`'a ham giriyordu (filtre enjeksiyonu; service-role, RLS savunması yok) → `buildRfqSearchOrFilter` saf/dışa-aktarık helper (çift-tırnak + `"`/`\` escape; `,`/`.`/`()` koşul ayracı olamaz, `%...%` ilike korunur).
- **D1** `rfq-archives.ts:40` yeniden gönderimde arşiv INSERT'i `UNIQUE(rfq_id,vendor_id)`'e çarpıyordu (yanıltıcı "arşivlenemedi" warning) → upload-ÖNCE + `upsert(onConflict)` (orphan-satır riski de elendi).
**+7 regresyon testi** `src/__tests__/rfq-review-fixes.test.ts` (O2 enjeksiyon payload tırnakta kalır · O1 davranış: `<`/`&` escape · D1 davranış+kaynak-kilidi: upload-önce/upsert/insert-then-delete yok). tsc 0 · lint 0 · **5477 test** · build 0.
**Push** `7c0d92e` (main + codex-experiment FF + proje-codex working tree FF).
**Ardından N1+N2 temizlendi (aynı gün):** N1 — `orders/[id]/page.tsx:517` teklif-vade `new Date().toISOString().slice(0,10)` → `localISODate(Date.now())` (+ import). N2 — `validateRfqAwards` ölü `quantity`/`unit_price` zorunluluğu kaldırıldı (yalnız `{rfq_line_id,vendor_id}` UUID; mig.103 zaten sunucu-otoriter); `RfqAward` tipi `{rfq_line_id,vendor_id}`'ye daraltıldı; UI `handleAward` gereksiz fiyat/qty payload'ını göndermeyi bıraktı (fiyatsız-kalem `cell.unit_price==null` UX guard'ı korundu); `rfq-validation.test.ts` award blokları yeni sözleşmeye güncellendi. tsc 0 · lint 0 · **5478 test** · build 0 (migration GEREKMEZ).
**✅ Mekanik tarama (kullanıcı isteğiyle aynı gün, tüm repo):** semgrep 1.166 (554 registry + 7 erp kuralı, 923 dosya) → 85 bulgu hepsi `roven-*` özel kurallardan (registry ~0); hepsi önceki triyaj kategorilerinde — hardcoded-color (33, doc/print), utc-slice (29, test/seed/UI + **3 sunucu-tarafı GÜVENLİ doğrulandı**: ship route noon-anchored `T12:00:00Z`, `computeDueDate` Z-anchored, parasut.ts mock), tailwind-classname (9, FP), money-rounding (7, kabul), dangerouslySetInnerHTML (7, **hepsi statik CSS/tema-bootstrap → XSS değil**). 3 parser-hatası = Türkçe JSX metni (tsc temiz). **Yeni gerçek bulgu yok.** gitleaks 8.30: history (657 commit) 2 FP (sentetik test fixture `cs_xK9…` + tarihsel placeholder); WT 149→143 build/cache/worktree gürültüsü, 6 gerçek = `.env.local` (`.gitignore` `.env*`, `git ls-files` izlemiyor, **history'de YOK**) + fixture → **gerçek secret sızıntısı 0**. Mekanik katman elle denetimin K:0 Y:0'ını doğruladı. **Tüm denetim bulguları (O/D/Nit) kapandı + mekanik katman temiz.**

## Önceki İş — 2026-06-16 (**Kapsamlı inceleme ajanı — `erp2-reviewer` subagent + Semgrep/gitleaks, PUSH `efab85c`**)

İstek: projeyi baştan sona tarayan bug/semantik/güvenlik denetim ajanı; "güvenilir repoları incele, indirilebilir skilleri tespit et". 2 araştırma turu (yerel altyapı + web). **Kararlar (AskUserQuestion):** subagent (skill değil) / Semgrep+gitleaks (gerçek SAST) / yerel-istek-üzerine (CI yok) / bespoke (vetted repodan beslen, kopyalama). Detay [[reference_review_agent]].
**Yapıldı (PUSH `efab85c`, mirror ✅, ürün kodu DEĞİŞMEDİ):** `.claude/agents/erp2-reviewer.md` (izole bağlam subagent: önce REVIEW.md/domain-rules/permissions/gate-baseline/denetim-raporu okur → semgrep+gitleaks+npm audit çalıştırıp yorumlar → güvenlik+semantik checklist → çıktı `docs/audit/<tarih>-review-bulgular.md` **K/Y/O/D + Kanıt/Etki/Düzeltme/Efor**, Nit≤5, gate-kapsadığını tekrar etmez); `.semgrep/erp-rules.yml` (7 kural: NEXT_PUBLIC secret [anon hariç], UTC slice Y6, para yuvarlama D1, Tailwind, framer-motion, hardcoded renk, dangerouslySetInnerHTML); `/erp-review` (full|diff) komutu; README kurulum notu. **Araçlar kuruldu:** `brew install semgrep gitleaks` (semgrep 1.166, gitleaks 8.30). **Regresyon-kanıt:** ruleset Y6 32 / D1 7 hit yeniden buldu, next-public-secret 0 (anon key tightening). p/typescript registry config çalışıyor (74 kural).
**İlk denetim ÇALIŞTIRILDI + bulgular kapatıldı (PUSH `01501ff`):** ajan tam `src/`+migration taradı (semgrep+gitleaks+npm audit), rapor `docs/audit/2026-06-review-bulgular.md` (**K:0 Y:0 O:2 D:2 Nit:3**, bloklayıcı yok). **Ajan kendini kanıtladı:** bu oturumdaki RFQ kodumda Y6-sınıfı regresyon yakaladı. Düzeltmeler (kullanıcı "hepsi"): **O1** rfq_response_due UTC-slice→`localISODate` (supplier-rfqs.ts + rfqs/page.tsx); **O2** `award_rfq_create_pos` SUNUCU-OTORİTER (PO satırı kayıtlı `supplier_rfq_prices.unit_price`+`supplier_rfq_lines.quantity`'den; istemci price/qty yoksayılır; fiyatlanmamış kalem→RAISE) **mig.103**; **D2** mükerrer `rfq_line_id` reddi **mig.103**; **D1** `orders/expire-quotes`+`email/retry-failed` route-içi `requireCronSecret` (quotes/expire kalıbı). Gate: `award_rfq_create_pos:["100","103"]`+PROBES 103. +6 test/**5470**, tsc/lint/build 0. **mig.103 APPLY ✅ + award smoke ✅** (3 senaryo DB'ye karşı: D2 mükerrer-satır reddi · O2-neg fiyatsız-kalem reddi · O2-otoriter tampered unit_price:1/qty:999 → PO kayıtlı 90/7 kullandı = sahtecilik imkânsız; test verisi temizlendi). NOT: audit ajanının "quotes/expire CRON_PATHS'te değil" alt-iddiası YANLIŞTI (ikisi de var) — uygulanmadı.

## Önceki İş — 2026-06-16 (**RFQ takip geliştirmeleri — 4 özellik, PUSH EDİLDİ `1c89326`**)

RFQ modülü push edildi (`0c8460c`, mirror ✅), ardından kullanıcı seçimiyle (AskUserQuestion, hepsi) 4 takip özelliği eklendi (PUSH `1c89326`, iki branch aynı SHA, diff boş; tsc 0/lint 0/**5461 test**/build 0). **mig.101 APPLY BEKLİYOR.** Detay [[reference_rfq_module]].
1. **PO son-fiyat önerisi + fiyat geçmişi:** `dbListVendorLinks` + `GET /api/product-vendor-links` (`redactVendorLinksForPerms`/`view_purchase_costs`); `pickPurchaseUnitPrice` öncelik **tedarikçi-son-fiyat > cost_price > boş** + PO formu "son alış" ipucu; ürün detay Tedarik sekmesi → `SupplierPricesPanel` ("kimde ne kadar", `GET /api/products/[id]/supplier-prices` + `redactPriceHistoryForPerms`).
2. **RFQ tedarikçi önerisi:** `rfq-suggest.ts` `suggestVendorsForProducts` (saf); yeni RFQ formunda seçili ürünleri tedarik edenler "Önerilen" rozeti + son fiyat + "Önerilenleri seç".
3. **Gerçek PDF eki:** `src/lib/rfq-pdf/` (RfqPdfDocument react-pdf, quote fontları reuse, fiyatsız); `serviceSendRfq` artık `Fiyat-Talebi-<no>.pdf` ekler (arşiv HTML in-app "Belge" view'da kalır).
4. **`rfq_response_due` uyarısı:** **mig.101** (alerts type CHECK, 089 deseni); `dbListRfqsAwaitingResponse` + `serviceCheckRfqResponseDue` (po_overdue aynası); scan route non-fatal + Vadeler sekmesi + takvim drawer "Talebi Aç" linki.
**Durum:** mig.101/102 APPLY ✅ + smoke ✅ (commit `3d94b23`). Tek açık erteleme: ayrı print sayfası (arşiv-view yeterli).

## Önceki İş — 2026-06-16 (**Tedarikçi Fiyat Talebi (RFQ) modülü — yeni epic, Faz A–F**)

**İstek:** Müşteri "tedarikçilerden fiyat araştırması yaparken kimde ne kadar, kim ne kadar teklif verdi takip + onlara nasıl talep göndereceğim". Satın alma tarafı, TAMAMEN eksikti (müşteri Teklif modülü var). **Kararlar (AskUserQuestion):** (1) tedarikçi tarafı, (2) tam RFQ akışı (talep→çok tedarikçiye gönder→fiyat gir→karşılaştır→kazananı PO'ya çevir), (3) RFQ'yu e-posta/PDF gönder + yanıtları elle gir (portal yok). Detay [[reference_rfq_module]].

**Yapıldı (Faz A–F, tsc 0/lint 0/5449 test/build 0; PUSH BEKLİYOR):** `mig.100_supplier_rfq.sql` — **APPLY BEKLİYOR (kullanıcı Studio)**: 6 tablo (supplier_rfqs/_lines/_vendors/_prices, supplier_price_history, supplier_rfq_archives) + rfq_counters/generate_rfq_number + product_vendor_links ALTER (last_unit_price/currency/at) + 7 RPC (create/update/mark_sent/upsert_vendor_quote/award_rfq_create_pos[**mevcut create_purchase_order_with_lines'i çağırır = RFQ→PO**]/cancel) + rfq-pdfs bucket. Backend: database.types satır tipleri, `supabase/supplier-rfqs.ts` + `rfq-archives.ts`, `rfq-validation.ts`, `rfq-comparison.ts` (saf en-iyi-fiyat, exchange-rates ile cross-currency), RBAC `view_rfqs`/`manage_rfqs` (purchasing+accounting-view; redaction `view_purchase_costs`), page-access kuralı, 7 API route (`/api/rfqs...`). Belge: `RfqDocument.tsx`+`rfq-archive-html.ts`+`rfq-document-helpers.ts` (iki dilli, FİYATSIZ talep) + `rfq-service.ts` serviceSendRfq (arşiv+e-posta NON-FATAL). UI: liste/yeni(RfqForm)/detay-hub (vendor paneli + VendorQuoteModal fiyat girişi + ComparisonMatrix en-ucuz-yeşil + award→PO) + Sidebar "Fiyat Talepleri". 39 yeni test.
**Bilinçli ertelemeler (v1):** PDF eki yerine HTML belge (react-pdf RfqPdfDocument sonraya); ayrı print sayfası yerine arşiv-view route ("Belge" linki yazdırılabilir); product_vendor_links tedarikçi-önerisi new formda yok; opsiyonel `rfq_response_due` alert yapılmadı. **Kalan:** mig.100 APPLY + manuel smoke + (push istenirse).

## Önceki İş — 2026-06-16 (**Teklif satır tablosu sadeleştirme: Ölçü + Ağırlık kolonları KALDIRILDI**)

**İstek (semantik):** Kullanıcı "ben hala teklif şimdi kg size bilgileri falan nasıl kullanılabilir, bayağı bir birim seçeneği koyduk, semantik hata var gibi" → ardından "ölçü derken size kolonu DN50 falan ürünün ismi, onları karıştırma" → ve "ağırlık kolonu tamamen olmasın, zaten birim kısmında onu hallettik: kg seçersek birim ağırlıkta yazılmış olur, adet seçersek ağırlık bilgisine gerek yok". **Kararlar (AskUserQuestion):** Ölçü kolonu TAMAMEN KALDIR (açıklamaya GÖMME — DN zaten ürün adında/açıklamada=çift yazım); Ağırlık kolonu da TAMAMEN KALDIR (birim karşılıyor).

- **Kanıt:** seed ürün adı zaten DN içeriyor ("Küresel Vana **Class 600 DN20** A105 SW"); `buildQuoteLineDescription` açıklamayı ürün adıyla başlatır. `size_text` ("DN20·CL600") redundant. Ağırlık: `unit` ekseni (mig.099) kütle/adet ayrımını zaten yapıyor.
- **Üç yüzeyden (form + HTML belge + PDF) iki kolon da kaldırıldı** + HTML/PDF "Toplam Ağırlık" satırı da. Silinen: `isWeightBasedUnit` helper (quote-document-helpers — bir tur önce eklenmişti, geri alındı), form "Ağırlık" toggle + `showWeightForced`/`showKgCol`/`showSizeCol` + Columns3 import + kg input + `handleKgChange`. colSpan SABİT (`baseCols=8` belge / `formBaseCols=9` form).
- **VERİ HATTI DORMANT korunur:** `size_text`/`weight_kg` auto-fill (handleSelectProduct `p.sizeText`/qty×unitWeightKg), payload (`size_text`/`weight_kg`/`unit_weight_kg`/`kg_manual_override`), RPC, mapper, hydration AYNEN — yalnız görüntü kalktı → **migration YOK, eski tekliflerde veri kaybı yok**.
- Testler: `quote-optional-columns` (bir tur önceki koşullu-kolon dosyası → iki kolonun + totalKg satırının YOKLUĞUNU source-lock'layan dosyaya yeniden yazıldı), faz4c/faz4a/faz1b mevcut source-lock'lar güncellendi (handleKgChange/kg input/Ölçü header/colSpan beklentileri). tsc 0 · lint 0 · **5410 test / 400 dosya** · build 0. Kural [[reference_quote_line_columns]]'da kalıcılaştı (ikisini de tekrar EKLEME). PUSH BEKLİYOR.

---

## Önceki İş — 2026-06-16 (**Teklif Ölçü/Ağırlık kolonları koşullu — 099 takip; SUPERSEDED**)

**İstek:** Satır birimi (099) sonrası kullanıcı düzeni sorguladı: Ölçü (Size) birime bağlı (kg/metre üründe anlamsız, "her ürünün ölçüsü olmayabilir"), Ağırlık (Kg) çoğu teklifte gereksiz → ikisi de her zaman görünen kolon olarak kalabalık. **Kararlar (AskUserQuestion, 2/2 önerilen):** ikisi de **koşullu göster** — kolon yalnız en az bir satırda veri varsa görünür (form + belge).

- **Doğrulanan:** quote ağırlığı yalnız bilgilendirme (sevkiyat ağırlığı `shipments.net/gross_weight_kg` AYRI, etkilenmez); belge toplam-ağırlık satırı zaten koşulluydu (`totalKg>0`), asıl kalabalık her-zaman-render edilen Size/Kg **kolonları**.
- **Tek kural, üç yüzey (mig/veri YOK, saf sunum):** `showSize`/`showKg = rows.some(...)`. **QuoteDocument** (HTML): th+hücre koşullu, not/boş-satır `colSpan` dinamik (`baseCols = 8 + size + kg`). **QuotePdfDocument:** aynı, `ItemRow`'a prop; gizlenince Description (`grow`) genişler. **QuoteForm:** `showSizeCol/showKgCol = optionalColsForced || rows.some(...)` — ürün seçilince master'dan ölçü/ağırlık dolarsa kolonlar **otomatik belirir**; boş quote'a elle giriş için toolbar'a **"Ölçü & Ağırlık" toggle** (`Columns3`, `aria-pressed`); not satırı `colSpan={formBaseCols}` (9 + koşullu).
- **Davranış:** kg/metre malı teklif → kolonlar hiç çıkmaz; valf teklifi → ölçülü/ağırlıklı ürün seçilince otomatik gelir (PDF'te "DN50"+ağırlık); boş quote → toggle ile aç.
- +1 test dosyası `quote-optional-columns.test.ts` (+14: HTML koşullu th/colSpan, PDF render smoke + source-lock, form source-lock) + 3 mevcut source-lock güncellendi (faz4c empty colSpan 10→8, faz4a colSpan→baseCols, note row colSpan→formBaseCols). tsc 0 · lint 0 · **5415 test / 400 dosya** · build 0. **PUSH EDİLDİ** `80f0961`. Migration gerekmez.

---

## Önceki İş — 2026-06-16 (**Teklif satırı bazlı ölçü birimi — mig.099, APPLY ✅**)

**İstek:** "teklif formunda birim kısmı üzerinde detaylı çalışmamız lazım her ürünün birimi vs aynı olmuyor onu nasıl yaparız" — Miktar kolonu her satıra sabit "Adet" yazıyordu; PMT çok-tipli katalogda her ürünün birimi farklı (adet/metre/kg/m²…). **Kararlar (AskUserQuestion, 3/3 önerilen):** (1) belge gösterimi = Miktar hücresine **birleşik** ("70 adet"), yeni kolon DEĞİL; (2) form girişi = ürün seçilince **otomatik dolar** + serbest düzenlenebilir (datalist); (3) siparişe taşıma = **teklif birimi öncelikli** COALESCE.

- `size_text`(065)/`note`(098) "satıra alan ekle" emsali birebir. `products.unit` zaten NOT NULL → form `handleSelectProduct`'ta `p.unit`'ten autofill.
- **mig.099 (APPLY BEKLİYOR ⚠️):** `quote_line_items.unit text` (nullable) + **4 RPC redefine**: create/update_quote_with_lines (098 gövdesi + INSERT'e `unit` + `NULLIF(ln->>'unit','')`; toplamlara DOKUNULMADI), `send_quote_and_create_pending_order` (094 halefi) + `accept_quote_and_create_order` legacy draft yolu (088 halefi) → `order_lines.unit = COALESCE(NULLIF(qli.unit,''), p.unit)` (teklif birimi > ürün master). **DİKKAT:** send=094, accept=088 en güncel gövdeler — 078 DEĞİL.
- **Zincir:** database.types(`unit:string|null`)/quotes.ts(CreateQuoteLineInput)/mock-data(QuoteLineItem)/api-mappers(null→"")/quote-types(döküman QuoteRow)/quote-archive-html. **Form:** QuoteRow+emptyRow+autofill+hydration+payload(`unit: r.unit.trim()||undefined`); Miktar hücresi miktar üstte + serbest birim input altta (`<datalist id="quote-units">` 12 öneri); Qty th "Miktar / Birim" + width 70→92. **Belge:** QuoteDocument(HTML) + QuotePdfDocument miktar+birim birleşik ("12 metre"; boşsa yalnız sayı); PDF qty kolonu 52→74; başlık zaten BILINGUAL "Miktar / Qty" (sabit "Adet" yalnız formdaydı→kalktı).
- **Gate:** `sql-lint-baseline` 4 zincire 099 (create/update/send/accept) + `check-migrations` PROBES'a 099 (`quote_line_items.unit` column probe).
- +1 test dosyası `quote-line-unit.test.ts` (+21: mig source-lock/mapper/RPC payload/HTML birleşik+başlık/arşiv/PDF render/form 7 source-lock/gate). tsc 0 · lint 0 · **5401 test / 399 dosya** · build 0. **PUSH EDİLDİ** `9f8fd17` (iki branch aynı SHA, diff boş). UI inline-style+CSS-var konvansiyonu (datalist + tema-uyumlu).
- **mig.099 APPLY ✅** (kullanıcı uyguladı). **Kalan (KULLANICI):** smoke: ürün seç→birim otomatik dolar; elle "kg"→kaydet→yenile (korunur); Önizle/PDF "12 metre"; **Kabul et**→siparişte birimler teklifle aynı (COALESCE); koyu/aydınlık tema; demo bloklu.

---

## Önceki İş — 2026-06-15 (**Teklif satırı bazlı serbest "Not" alanı — mig.098, APPLY ✅**)

**İstek:** "Teklif sayfasında genel notlar kısmını her ürün içinde ayrı not oluşturulabilsin şeklinde ürün satırında bulunsun" → plan + soru-cevap sonrası uygula. **Kararlar (AskUserQuestion):** (1) Genel Notlar KALIR + ayrıca satır bazlı not (iki seviye); (2) **açılır not satırı** (tablo 10 kolon dar → yeni kolon DEĞİL); (3) not müşteri belgesinde de görünür (HTML+PDF+e-posta eki, TR/EN bilingual); (4) siparişe TAŞINMAZ (order tarafına dokunulmaz).

- **Mevcut `description` ("Ürün Tanımı") korundu** — o üründen otomatik kurulan teknik tanım (mig.080 ile siparişe taşınır); yeni `note` ondan AYRI serbest alan. `size_text` (065)/`unit_weight_kg` (068) "satıra alan ekle" emsali birebir.
- **mig.098 (APPLY ✅):** `quote_line_items.note text` + `create/update_quote_with_lines` RPC'leri **093 gövdesiyle birebir** yeniden tanımlandı (yalnız INSERT'e `note` + `NULLIF(ln->>'note','')`; line_total formülü/assert_quote_totals_sane DOKUNULMADI → toplamı etkilemez). Gate: `sql-lint-baseline` RPC zincirine 098 + `check-migrations` PROBES'a 098 (column probe).
- **Zincir:** `database.types` QuoteLineItemRow · `quotes.ts` CreateQuoteLineInput · `mock-data` QuoteLineItem · `api-mappers` (null→"") · `quote-types` döküman QuoteRow · `quote-document-helpers` `BILINGUAL_LABELS.lineNote = Not/Note`.
- **Form (QuoteForm.tsx):** form-içi QuoteRow + emptyRow + hydration + payload (`note: r.note.trim()||undefined`; preview rows doğrudan akar) `note` taşır; **açılır not satırı** — her satırda StickyNote toggle butonu (not doluysa accent renkli `var(--accent-bg/text)`) → `expandedNoteRowIds` Set → satır altında tek `<td colSpan={11}>` tam-genişlik textarea (`.q-notes` stili); `readOnly`'da gizli (`!readOnly && noteOpen`); actions kolonu 28→56px (Not+Sil).
- **Müşteri belgesi:** `QuoteDocument` (HTML) + `QuotePdfDocument` (PDF) ürün satırının ALTINA, not varsa, marka-mavisi "Not / Note:" ön-etiketli koşullu satır (HTML tek `<td colSpan={10}>` paddingLeft girinti + borderLeft brand — `colSpan={9}` üretmez [faz4a kilidi korunur]; PDF `S.noteRow`/`noteText`/`noteLabel` View wrap={false}); `quote-archive-html` rows'a `note` eşlemesi (arşiv + PDF eki tek kaynak).
- **Test:** +2 dosya / +24 — `quote-line-note-migration` (098 SQL + gate kaydı) · `quote-line-note` (mapper null→""/değer · dbCreateQuote RPC p_lines.note · BILINGUAL_LABELS.lineNote · QuoteDocument HTML not bloğu var/yok · buildQuoteDataFromDetail eşleme · renderQuotePdfBuffer notlu gerçek render · QuoteForm 9 source-lock). tsc 0 · lint 0 · **5353 test / 395 dosya** · build 0 (`ƒ Proxy`).
- UI `/frontend-design` yerine projenin inline-style+CSS-var+`erp2-dashboard-ui-builder` konvansiyonlarıyla (in-grid küçük ekleme → mevcut stile uyum doğru yol).
- **Ek (aynı tur): "Kaydetme hatası" teşhis fix'i** — kullanıcı canlı (sslip.io) ortamda jenerik "Kaydetme hatası" aldı. Teşhis: NOT özelliği DEĞİL (drift probe canlı DB'de `quote_line_items.note` ✅ + fazladan jsonb anahtarı zararsız). Kök: `persistQuote` `if(!res.ok) return null` ile gerçek nedeni YUTUYORDU → en olası 403 (`manage_quotes` yok; sayfa `view_quotes`'la açılır ama POST `manage_quotes` ister → rolsüz/viewer admin = BRICK-riski env'i). Fix: `persistQuote` POST/PATCH birleşti + `readSaveError(res)` (401/403[manage_quotes mesajı]/422/400/500 ayrımı + body.error) → `lastSaveErrorRef` → `handleSave` toast'ta gerçek nedeni gösterir (onSaved davranışı korundu). +3 test kilidi (quote-save-refresh-lock). PII dökümü (tüm kullanıcı rolleri) auto-mode'da engellendi → rolü kullanıcı doğrular.
- **Ek-2 (canlı 500 teşhisi):** kullanıcı redeploy sonrası **500** aldı; toast prod'da `"Beklenmeyen bir hata"` (handleApiError prod'da mesaj gizler), Coolify logu **`[POST /api/quotes] [object Object]`** → KÖK: atılan hata `Error` değil **Supabase PostgrestError düz nesnesi** ({message,code,details,hint}) → `String(err)`="[object Object]" gerçek nedeni siliyordu. Teşhis: canlı DB (`ryvxpolvhvsycuqyphoa`) read-only sağlıklı (tüm kolonlar+note ✅, sane-check geçti); kullanıcı SQL editöründe `create_quote_with_lines` BEGIN/ROLLBACK → UUID döndü = RPC sağlam → 500 RPC'den değil. En olası: self-hosted Supabase'de **migration sonrası PostgREST şema cache bayatlığı** (`NOTIFY pgrst, 'reload schema';` öneri) veya payload-spesifik cast/raise. **Fix:** `api-error.ts` `describeError()` — nesne hatasından message|details|hint + SQLSTATE `code` çıkarır → log artık gerçek mesaj+kod basar, prod yanıtına güvenli `code` eklenir (toast "(500) [22P02]" gibi gösterir); `QuoteForm.readSaveError` code'u gösterir. +`handle-api-error.test.ts` (3). **KALAN:** redeploy → ya `NOTIFY pgrst` ya da toast/log'daki SQLSTATE kodunu paylaş (22P02=cast/42883=fonksiyon-yok-cache/42703=kolon-yok/P0001=raise) → kesin neden.
- **Ek-3 (uzun not sayfa-kırpılma fix'i):** kullanıcı tam bir SQL bloğunu not olarak girince PDF/Önizle çıktısında not sayfa sonunda KESİLİYORDU. KÖK: notu "satırla birlikte tut" ile render etmiştim → uzun not sığmayınca bölünmek yerine kırpılıyor: HTML'de not `<tr>` `doc-no-break` + PAGE_CSS'te TÜM `tbody tr`'ye `break-inside:avoid !important` blanket kural; PDF'te not View `wrap={false}`. **Fix:** HTML not satırı `doc-no-break`→`doc-note-row` + PAGE_CSS override `tr.doc-note-row{break-inside:auto !important}` (blanket'i ezer, ürün satırları bölünmez kalır); PDF not View'ından `wrap={false}` kaldırıldı (`S.row` ürün satırı wrap={false} KALIR). +4 test (uzun çok-sayfalık not render + doc-note-row HTML/source kilitleri + PDF wrap-yok kilidi). **Ek (cap kararı):** break-inside/wrap fix'i PDF'i (müşteri çıktısı, @react-pdf akış) düzeltti ama **HTML tarayıcı-print'te Chrome tablo-hücresi sayfadan uzunsa yine kırpıyor** (motor kısıtı, `break-inside:auto` yetmiyor). Kullanıcı (AskUserQuestion) **"makul uzunluk sınırı"** seçti → `MAX_QUOTE_LINE_NOTE=800` (quote-validation paylaşılan sabit) + `validateQuoteLineNotes` POST+PATCH 422 + form textarea `maxLength`+karakter sayacı (>800 danger renk). 800 sınırıyla not asla tek sayfayı aşmaz → hem HTML print hem PDF temiz. +9 test. **5368 test, build 0. 5K/8Y bağlamı yok—saf cila.**
- **Ek-5 (Önizle/Yazdır = maildeki PDF — gerçek sayfalama):** kullanıcı 800-cap'li kısa not bile HTML "Önizle→Yazdır"da sayfa sınırında KESİLİYOR dedi; istek: "maildeki PDF nasıl davranıyorsa öyle". KÖK: Chrome tablo `<td>`'sini sayfalar arası BÖLEMEZ (`break-inside:auto`→kırpar, `avoid`→bütünü iter); önceki turda koyduğum auto = kırpma kaynağı. **Çözüm (AskUserQuestion→"mail gibi"):** önizleme/yazdırma çıktısını **birebir maildeki react-pdf motoruna** bağladım (yaklaşık CSS taklidi değil, AYNI belge): yeni **`POST /api/quotes/preview-pdf`** (view_quotes guard, `safeParseJson`+`validateStringLengths`+`validateQuoteLineNotes`, `renderQuotePdfBuffer(QuoteData)`→`application/pdf`); önizleme "Yazdır/PDF" butonu artık bu route'u POST edip blob'u yeni sekmede açar (senkron `window.open`+URL → popup-blocker önlenir), **demo/403/hata→`window.print()` fallback**. HTML belge: önceki `.doc-note-row break-inside:auto` override GERİ ALINDI → not `<tr>` `doc-no-break` (doğrudan-HTML-print fallback'inde push-whole, kırpmaz; 800-cap tek sayfaya sığar). PDF (`QuotePdfDocument`) zaten `wrap` açık=gerçek bölme, dokunulmadı. +tests (`quotes-preview-pdf-route` 7 [render/403/422/400 + önizleme source-lock] + quote-line-note doc-no-break'e güncellendi). 5380 test, build 0 (`ƒ /api/quotes/preview-pdf` manifest). **KALAN:** redeploy → Önizle→Yazdır/PDF → maildeki ile birebir, uzun not gerçek bölünür (kırpma yok); demo fallback.
- **Ek-4 (belge tablo başlık cilası):** kullanıcı PDF tablosunda 3 sorun bildirdi (ekran görüntülü): başlıklar karışık hizalı, header kenarlıkları **yeşil**, metin taşıyor. **Teşhis:** yeşil = react-pdf'in ince beyaz header kenarlığının (`rgba(255,255,255,0.2)`) mavi band üzerinde antialiasing **saçağı** (kaynakta yeşil yok). **Fix:** PDF `Th` tüm başlıkları `alignItems:center` (align prop kaldırıldı, 5 call-site güncellendi) + `S.th` kenarlık SİLİNDİ (saçak gider) + justify center; HTML `thStyle` `textAlign:center` + `whiteSpace:normal` (nowrap→sarılır, taşmaz) + per-th right/center override'ları kaldırıldı. Gövde hücre hizaları (qty merkez, fiyat sağ) KORUNDU. +5 test (`quote-document-header-align`). 5373 test, build 0. Saf cila.
- **KALAN (kullanıcı):** (0) **redeploy** sonrası PDF: başlıklar ortalı, yeşil kenarlık yok, başlık taşması yok; uzun not 800-cap + sayfaya akış. (1) **Kaydetme hatası nedeni** — redeploy sonrası Kaydet → toast artık gerçek nedeni/SQLSTATE kodunu söyler; 403 çıkarsa bu Coolify ortamında `ADMIN_EMAILS`'e e-postanı ekle VEYA Supabase'de kullanıcının `app_metadata.roles=["admin"]` (sonra yeniden giriş). (kaydetme 23503 FK-staleness çözüldü = "Temizle"+yeniden seç) (2) manuel smoke — yeni teklif → satıra Not → kaydet → yenile (korunur) → Önizle/PDF ürün altında görünür + notsuz satırda yok → Gönder → mail PDF + arşivde görünür → Genel Notlar ayrı çalışır → koyu/aydınlık tema; demo modda kaydet bloklu.

## Önceki — 2026-06-13 (**Teklif e-postası: gerçek PDF eki — @react-pdf/renderer**)

**Kullanıcı kararı değişti:** bir önceki turun "ek YOK + Teklifi Görüntüle linki" çözümü kaldırıldı — "maille iletilen teklifler pdf olsun" → ekte gerçek `Teklif-<no>.pdf`, gövdede link YOK. Kapsam yalnız e-posta eki; HTML arşiv + paylaşım-token altyapısı (`quote-share-token.ts`, `/api/quotes/shared/[token]`, quote-pdfs bucket) KODDA DURUYOR (no-silent-deletes; e-posta yolu artık kullanmıyor — kaynak kilidi testli).

- **Motor:** `@react-pdf/renderer@4.5.1` (saf JS; React 19.2.3 peer ✓; mupdf HTML→PDF YAPAMAZ [keşifle doğrulandı], Gotenberg/Chromium kullanıcıya sunuldu→cevap "pdf belgesi olsun ekte" → react-pdf). deps-gate temiz (allowlist boş kaldı).
- **Yeni `src/lib/quote-pdf/`:** `fonts/` (Montserrat 600/700/800 + Inter 400/500/600 statik TTF Google Fonts'tan, `fvar` yok doğrulandı, OFL.txt; **Türkçe için TTF embed zorunlu** — PDF std-14 fontları WinAnsi, ğ/ş/İ yok) · `register-fonts.ts` (idempotent; italik istekleri dik dosyaya bağlanır [6 dosya yeter, EN alt-etiketler eğiksiz — kabul edilen sapma]; heceleme: kelime bütün, uzun tireli kod tire ÖNCESİNDEN bölünür) · `QuotePdfDocument.tsx` (QuoteDocument yakın kopyası; `BILINGUAL_LABELS` + fmt/fmtDate/SYM **quote-document-helpers'a taşındı** — HTML+PDF tek kaynak; px×0.75=pt) · `index.ts` (renderQuotePdfBuffer lazy-import zinciri, quotePdfFilename sanitize, resolvePdfLogo = inlineLogoAsDataUri reuse + yalnız PNG/JPEG; SVG logo→placeholder bilinen sınır).
- **3 görsel smoke turu** (örnek PDF üretilip gözle incelendi): (1) react-pdf `textTransform:uppercase` TR locale bilmiyor → "MÜŞTERI" — fix `trUpper=toLocaleUpperCase("tr-TR")`, stillerden uppercase kalktı; (2) sayfa padding'i fixed kolonları yemiş, desc daralmış → kolonlar ×0.92; (3) uzun kod kırılınca **textkit kelime-içi kırılmaya görsel tire EKLİYOR** (`insertGlyph(HYPHEN)` kaynaktan doğrulandı) → parça tireyle bitince "FWBV--" çift tire; fix: tire SONRAKİ parçanın başında (`split(/(?=-)/)`) → satır sonu "FWBV-", devam "-DN400-PN80"; + uzun kodda font 8.5px.
- **quote-service:** viewUrl/token üretimi e-posta yolundan çıktı; arşiv audit non-fatal sürer; **PDF üretilemezse FAIL** (`pdf_failed` → route 502 "PDF belgesi oluşturulamadı — e-posta gönderilmedi"; belgesiz mail gitmez, email_log açılmaz). `templates.ts` viewUrl→`attachmentFilename`, docBlock tek dal "ekinde PDF olarak". Detay sayfası modalı "teklif belgesi PDF olarak eklenir".
- **next.config:** `serverExternalPackages += "@react-pdf/renderer"`; `outputFileTracingIncludes["/api/quotes/**"] = fonts/*.ttf` (mupdf kalıbı) — **build sonrası `.next/standalone/src/lib/quote-pdf/fonts/` + `node_modules/@react-pdf` elle doğrulandı ✓** (en kritik riskti).
- Testler: `quote-pdf-render.test.ts` GERÇEK render smoke (yoga WASM vitest'te sorunsuz; %PDF- + >10KB, Türkçe karakterli, boş/logosuz crash yok, filename sanitize, svg reddi) · send-customer 14 test yeniden (attachment sözleşmesi/pdf_failed/arşiv-non-fatal/no_email/suppressed + kaynak kilitleri: createQuoteShareToken e-posta yolunda YOK + serviceArchiveQuotePdf duruyor + lazy import) · şablon +2 ("ekindedir", link-yok) · route pdf_failed→502 · share-token testindeki eski davranış kilidi yeni döneme çevrildi.
- tsc 0 · lint 0 · **5329 test / 393 dosya** · build 0. **KALAN (kullanıcı):** redeploy → taslak Gönder → mailde `Teklif-<no>.pdf` PC+mobil açılır, Türkçe karakter + logo doğru, gövdede link yok; "seed'i yeniden çalıştır" adımı hâlâ açık.

## Önceki — 2026-06-13 (**Canlı smoke bulguları turu — 4 düzeltme**)

Kullanıcı seed sonrası canlı smoke'ta 4 bulgu raporladı (ekran görüntülü); hepsi kapandı:
1. **Donut "$3K · 1%" takılması (mobil):** dokunma mouseenter üretir, mouseleave HİÇ gelmez → vurgu kalıcıydı. `Donut.tsx`: touch `pointerdown` TOGGLE (aynı segmente tekrar dokun → toplam) + 700ms ghost-mouse penceresi (dokunma sonrası sentetik mouse event'leri seçimi ezmez); masaüstü hover korunur. `donut-touch.test.tsx` (5, fake-timers).
2. **Topbar Roven markası → /dashboard linki:** `Topbar.tsx` marka div'i `next/link`'e sarıldı (UserAvatarLink kalıbı; `aria-label="Ana sayfa"`); login logosu dokunulmadı. topbar.test +1.
3. **Kaydet→Gönder onayında eski müşteri e-postası:** gönderim sunucuda zaten tazeydi (dbGetQuote); stale olan DETAY SAYFASI state'iydi. `QuoteForm` yeni `onSaved?: (detail) => void` prop'u — persistQuote POST/PATCH yanıtını parent'a verir; detay sayfası `setQuote(prev => ({...prev, ...d}))` ile tazeler (checkbox guard'ı `hasCustomerEmail` da düzelir). `quote-save-refresh-lock.test.ts`.
4. **Teklif e-postası eki ham kod / mobilde logosuz → EK KALDIRILDI, LINK'Lİ GÖVDE (kullanıcı kararı):** `serviceSendQuoteToCustomer` attachment yollamaz; gövdeye **"Teklifi Görüntüle"** CTA — yeni `quote-share-token.ts` (HMAC-imzalı 30 gün TTL token; `QUOTE_SHARE_SECRET` yoksa CRON_SECRET'tan alan-ayrımlı türetme, token sızıntısı cron yetkisi sızdırmaz) + yeni public route **`/api/quotes/shared/[token]`** (proxy ALWAYS_PUBLIC; arşiv HTML'ini kendi origin'den text/html servis eder — Supabase signed URL HTML render etmiyor) + arşiv render'ında **logo data-URI gömme** `inlineLogoAsDataUri` (yalnız kendi Supabase host'u — SSRF guard; fail → URL fallback). Link üretilemezse e-posta yine gider (fallback metin: "yanıtlamanız yeterlidir"). Şablon/detay-sayfası "ek olarak iletilir" metinleri bağlantıya çevrildi. `.env.example`'a `QUOTE_SHARE_SECRET` (OPSİYONEL).
Ayrıca: `order-service.test.ts` gece-yarısı TZ kırığı düzeltildi (test "bugün"ü UTC üretiyordu, kod localISODate — TR 00:00-03:00'te kırılıyordu; testte de localISODate).
tsc 0 · lint 0 · **5318 test / 392 dosya** · build 0. **KALAN (kullanıcı):** redeploy → smoke: donut dokunma, logo→dashboard, kaydet→gönder yeni adres, mailde ek yok+link açılıyor+logo görünüyor (mobil dahil). Önceki turun "seed'i yeniden çalıştır" adımı hâlâ açık (teklif arşivleri HTML fix'i için).

## Önceki — 2026-06-12 (**Senaryosal kapsamlı seed — gerçek PMT katalog verisiyle tüm modüller**)

**İstek:** "sistemin her şeyiyle doğru çalıştığından emin olmak için senaryosal seed dataları" — soru-cevapla kararlar: **orta boy** (20 ürün/8 müşteri/15 sipariş/8 teklif/5 PO) · storage'a **gerçek mini dosyalar** (sentetik) · **gerçek katalog `pmt/` klasöründen** (Langge PT0108 Excel'i + PMT.pdf teklifi parse edildi) · **6 rol test hesabı** `rol@pmt-demo.test` · şirket bilgisi gerçek adres/tel/web, **VKN kurgusal**. **ŞART: dış dünyaya sıfır etki** — e-posta GÖNDERİLMEZ (email_logs sahte geçmiş; runner'da e-posta/Paraşüt/AI import'u test kilidiyle yasak), tüm e-postalar @example.com/.test, Paraşüt stub.
**Yapı:** `/api/seed` route 1248→~80 satır thin orchestrator; mantık `src/lib/seed/`'e: **seed-data.ts** (saf sabitler: 20 ürün 8 tipin TAMAMI `product_type_id`+057-uyumlu `attributes` dolu; senaryo haritası dosya başında — CRITICAL FWBV-DN400 / WARNING çekvalf / deadline geçmiş+yakın / fiyat-NULL PTFE conta / shortage ORD-0008+0015 / overdue ship ORD-0007 / quote_expired iki eksen / po_overdue PO-0002), **seed-runner.ts** (clearAllData genişledi: PO/vendors/084/import-docs/arşiv/attachments/email_logs/company_files/calendar_notes; storage yalnız `demo/` prefix temizlenir; runSeed 23 bölüm: V7 teklif revizyon zinciri TKL-004→005 + accepted→ORD-0010 donmuş-totaller+arşiv-PDF + 088 sent→pending bağlı siparişler + 5 PO [junction'lı] + 3 import belgesi [extracted_core_fields/source_page/new_product satırı] + 4 email_logs [096 retry snapshot'lı failed] + 4 şirket dosyası + 5 ürün eki + 6 RBAC hesabı [şifre `SEED_DEMO_PASSWORD` env; yoksa atla+warning]), **seed-assets.ts** (saf mini PDF/PNG üreticileri — pmt/ orijinalleri public repo'ya KONMAZ, fiyatlar yuvarlanmış türev).
**Test:** `seed-data.test.ts` (31: SKU/müşteri/vendor çözünürlüğü, 8 tip kapsamı + attributes↔057 field_key migration-parse kilidi, KDV %20 formülleri, enum'lar, 7 alert-senaryo kilidi, revizyon/convert/088 tutarlılığı, sıfır-dış-etki kaynak kilitleri, FK silme sırası kilitleri) + `seed-assets.test.ts` (5). tsc 0 · lint 0 · **5290 test / 389 dosya** · build 0.
**KALAN (kullanıcı):** Coolify'a `SEED_DEMO_PASSWORD` env ekle → deploy → Ayarlar→Demo Hazırlık→"PMT Demo Verisini Yükle" → smoke (sayfa sayfa: ürün tipleri/attributes drawer/görselli ürün/fiyat-NULL · teklif revizyon zinciri+arşiv PDF+EXWORKS ihracat · 5 PO durumu · scan sonrası 7 alert tipi+takvim · 3 import belgesi · Dosyalar sekmesi · e-posta retry · 6 rol hesabıyla RBAC gezintisi). Google auth kullanıcı checklist'i hâlâ açık (Redirect URLs + ADMIN_EMAILS).

## Önceki — 2026-06-12 (**Google auth kesin kapanış + Beni hatırla — `5b3f3f9`**)

**Şikayet:** admin Gmail'le Google girişi "401" + beni-hatırla işlevsiz. **Karar: yalnız-ekli-kullanıcılar.** **Google:** callback hata körlüğü giderildi (provider/no_code/**pkce**/exchange reason'ları log+login'e; pkce="code verifier" → tipik kök Supabase Redirect URL allowlist); provizyon kontrolü callback'te — rolsüz OAuth user'da `reconcileOAuthUserRoles` (aynı-e-postalı ekli kullanıcıdan rol kopyala, YALNIZ doğrulanmış e-posta, fail-closed), olmazsa `signOut`+`unauthorized&attempted=` (yarım-oturum/401 gürültüsü bitti). **Beni hatırla:** `remember.ts` — login iki akışta sign-in öncesi `roven_remember` yazar; server/proxy/client (custom cookies) persist=0'da auth cookie'lerini session yapar; silme yazımları muaf. +28 test; **5227 test / 382 dosya**. **KALAN (kullanıcı):** Supabase Dashboard Redirect URLs (iki Coolify domain + localhost `/auth/callback`) + iki ortamda `ADMIN_EMAILS` kontrolü; deploy sonrası Google dene (mesaj artık nedeni söyler); beni-hatırla smoke (işaretsiz → tarayıcı kapat-aç → login). Sonraki adaylar: Upstash (O5).

## Önceki — 2026-06-12 (**Y1 turu — kalan 7 guard'sız GET kapandı; mig.096 APPLY ✅**)

**Karar (AskUserQuestion): DEMO-DOSTU guard** — `requirePermissionFor` izin arar, `!user→401` dalı YOK (anonim→viewer fallback bilinçli → demo gezintisi yaşar; import uçları viewer'da view_import olmadığından fiilen kapalı). İzin haritası: alerts/calendar→view_alerts · import×3→view_import · parasut-status→view_sales_orders (view_parasut sales/viewer'ı kırardı) · open-count→OR[view_purchase_suggestions, view_sales_orders] (purchasing'de sales_orders yok) · shortages→view_products. Baseline ACIK-BULGU sınıfı BOŞALDI (gate + `y1-route-guards.test.ts` kilitler); 6 route testine mock+403 senaryosu. mig.096 kullanıcı APPLY etti, probe ✅. tsc 0 · lint 0 · **5199 test / 380 dosya** · build 0. **KALAN (kullanıcı):** smoke — demo modda takvim/eksik drawer/Paraşüt rozetleri/açık-sipariş kolonu ÇALIŞMALI, muhasebe rolünde takvim 403; önceki liste (sipariş toplamları · teklif gönder→iptal→tekrar gönder · Next sonrası login). Son tur adayı: Upstash (O5).

## Önceki — 2026-06-12 (**E-posta retry snapshot turu commit+mirror — mig.096 APPLY ✅ [sonraki turda]**)

**Durum:** proje-codex'te hazır ama commit'siz bulunan iş (kullanıcı "mirrorla" dedi) doğrulanıp gönderildi: tsc 0 · lint 0 · **5182 test / 379 dosya** → `3c8fb85`, iki branch aynalandı. İçerik: **mig.096** `email_logs` + html_body/text_body/body_expires_at (24h TTL; başarı/expiry/max-attempt'te snapshot temizlenir) + partial index · retry aynı gövdeyle yeniden gönderir · `sendDirectEmail` `replyTo` · `requireInternalOperatorFor(ctx)` auth-dedup · iç şablon testleri (+21 test). `check-migrations.ts` PROBES'a 096 eklendi. **093/094/095 doğrulama SQL'i 4×true ✅ (canlıda kesin).** **KALAN (kullanıcı):** **mig.096 Studio'da APPLY** + e-posta retry smoke; önceki smoke listesi de açık (sipariş toplamları · teklif gönder→iptal→tekrar gönder · Next sonrası login/dashboard).

## Önceki — 2026-06-12 (**Next 16.x güvenlik yükseltmesi — GREEN; mig.093/094/095 APPLY + doğrulama SQL 4×true ✅**)

**İstek:** denetimde ertelenen Next turu ("Next 16.x güvenlik yükseltmesi"). Commit `64c2fd0` (package.json/lock + check-deps.mjs).

- next/eslint-config-next **16.1.7 → 16.2.9** (caret'siz pin) — 14 advisory'nin TÜMÜ <16.2.6 aralığındaydı (4 high proxy/middleware bypass, DoS, SSRF, XSS, cache poisoning); minor bump, React 19.2.3 dokunulmadı.
- `fast-uri` 3.1.0 → **3.1.2** (`npm update` yetti; @sentry/nextjs→webpack→ajv transitif zinciri, 2 GHSA kapandı).
- **`check-deps.mjs` ALLOWLIST BOŞ** — bundan sonra her yeni high/critical advisory gate'i anında kırar (kuruluş amacı gerçekleşti). Gate koşusu: "OK — 0 istisna".
- tsc 0 · lint 0 · **5161 test / 377 dosya** · build 0 (standalone'da next 16.2.9 + mupdf wasm trace + proxy derlemesi doğrulandı).
- Ayrıca kullanıcı **mig.093/094/095'i Studio'da APPLY ETTİ** ✅ (rapor §8 güncellendi; OpenAPI probe RPC redefine'ları göremez → doğrulama yalnız SQL ile).
- **KALAN (kullanıcı):** (1) birleşik doğrulama SQL'i — 4 satır `true` (093 `v_line_total` / 094 `qli.description` + index `cancelled` / 095 `search_path`); (2) smoke: sipariş oluştur/düzenle [toplamlar sunucudan] · teklif override %5 içi · teklif gönder→iptal→**tekrar gönder** [094] · reddet→rezerv düşer · import satırı KDV · **Next sonrası: login redirect + dashboard + bir API çağrısı + attachment demo-anon blok**. Sonraki tur adayları: Upstash rate-limit (O5) · Y1 kalan 8 ACIK-BULGU GET'i.

## Önceki — 2026-06-13 (**Denetim düzeltmeleri Tur A–E — GREEN**)

**İstek:** "bütün gerekli düzeltmeleri tek tek yapalım." Kararlar (AskUserQuestion): K2 = sipariş katı recompute + teklif override korunur+makul-sapma (%5/100); xlsx = CDN 0.20.3; Next yükseltme + Upstash AYRI tur. 5 tur, 5 commit (`1c1ef92` A · `dc0e2aa` B · `16bfdb3` C · `437a470` D · `fadf74b` E).

- **A:** K1 audit-log guard (entity→perm map) · Y2 stock-risk oturum+view_products · K3 import KDV (order'ın vat_rate+discount'u) · O11 attachment demo-anon DEFAULT bloklu (`ATTACHMENTS_ALLOW_DEMO_ANON` opt-out) · D4 `requireCronSecret` 5 cron route'u · O9 convert bulgu-değil.
- **B:** **mig.093** order RPC sunucu-recompute / quote `assert_quote_totals_sane` · O7 redaction simetri · D1 `roundMoney` · D2 clamp uyarısı · gate SQL lint **yorum-ayıklama** (kendi migration'ımı yanlış-pozitif yakaladı; DEFINER grandfather 016+019'a indi).
- **C:** **mig.094** send RPC (description + qty<=0 + **index cancelled-hariç** — dış raporun HAKLI çıktığı "iptal sonrası gönderilemez" bulgusu; karne düzeltildi, FOR UPDATE zaten serialize) · `serviceReconcileQuoteReservations` (K4+Y3, scan cron'unda; sync_issue fallback) · **mig.095** 019+016 DEFINER hijyeni.
- **D:** xlsx **CDN 0.20.3** (GHSA kapandı, deps-allowlist'ten silindi) · Y6 `localISODate` 10 nokta (TR gece gün-kayması; computeDueDate muaf) · O8 OAuth HMAC fail-closed · O6 Sentry beforeSend scrub (`sentry-scrub.ts`) · Y8 e-posta awaited+`emailFailed`.
- **E:** O1 ship `postShipWarning` (uyarılı başarı) · O2 status tek-retry · O3 kuruş-tamsayı reconcile · O4 `sanitizeSyncErrorMessage` · O10 addOrder hata-yolu refetch · D5 receive toast.
- Rapor §8 durum tablosu; tsc 0 · lint 0 · **5161 test / 377 dosya** · build 0.
- ~~KALAN: 093/094/095 apply~~ → **apply edildi ✅ (2026-06-12)**; Next yükseltmesi de sonraki turda yapıldı. Açık yükümlülükler üstteki güncel bölümde.

## Önceki — 2026-06-12 (**Güvenlik & Doğruluk Denetimi + Gate sistemi — GREEN, ürün kodu DEĞİŞMEDİ**)

**İstek:** kullanıcı dışarıdan bir denetim raporu paylaştı → "hiçbir kodda değişiklik yapmadan repo genelinde güvenlik/doğruluk/semantik hataları DETAYLI EKSİKSİZ incele + gerekiyorsa sistem kur" (AskUserQuestion: **Denetim+Gate birlikte**; gate bileşen sorusuna "bilemedim" → 4 bileşen de dahil edildi).

- **Denetim:** 6 paralel tarama (route/migration/servis/lib-semantik/frontend/cron-email-PDF) + Kritik-Yüksek'lerin elle doğrulanması → **`docs/audit/2026-06-guvenlik-dogruluk-bulgulari.md`**. Dış rapor karnesi: çoğu doğru, **2 iddia YANLIŞ** ("iptal edilen quote-order yeniden oluşturulamaz" — 088 cancelled'ı dışlıyor; "discount_amount redaction açığı" — orders'ta subtotal zaten null, asimetri var sızıntı düşük).
- **5 Kritik:** K1 `/api/audit-log` guard'sız + silinen müşteri PII'si `before_state`'te · K2 finansal toplamlar istemciden (023 create hiç recompute etmez, 081 edit client line_total'larını toplar, 071 quote ikisine güvenir; `validateOrderCreate` yalnız sınır kontrolü) · K3 import sipariş KDV'si `subtotal*0.20` hardcode (iskonto + siparişin vat_rate'i yok sayılır; `import-service.ts:771-776`) · K4 teklif send status-önce/rezervasyon-best-effort + reconciler yok · K5 migration drift izlenemiyor.
- **8 Yüksek:** Y1 25/64 GET guard'sız + viewer-fallback (proxy tek hat) · Y2 ai/stock-risk permission'sız DB mutasyonu · Y3 phantom rezervasyon (reject release best-effort) · Y4 088 regresyonları (078 qty-guard + 080 description send-yolunda yok) · Y5 xlsx 0.18.5 (2 GHSA, fix yok) · Y6 **UTC tarih dilimleme 13 nokta** — `toISOString().slice(0,10)` TR'de 00:00–03:00 gün kaydırır (vade/expiry; doğru kalıp `stock-utils localISODate` zaten var) · Y7 019 advisory-lock DEFINER hijyensiz (016/036/069/071/073/074 de) · Y8 kritik-stok e-postası fire-and-forget + 24h dedup = sessiz kayıp. +11 Orta +6 Düşük.
- **Elenen yanlış-pozitifler** (rapor §5): PO receive güvenli (route guard + RPC 051:48 RAISE, plpgsql atomik) · QuoteForm TR-virgül sorunu yok (`type="number"`) · email dedup-hatasında gönderim bilinçli (yorumlu).
- **Gate sistemi (baseline-allowlist: suite yeşil, YENİ ihlal kırmızı):** `src/__tests__/gate/route-guard-matrix.test.ts`+`route-guard-baseline.ts` (114 route enumerate; 28 guard'sız uç sınıf+gerekçeli [public/self-auth/redaction/cron-proxy/ACIK-BULGU]; stale kayıt da kırar) · `sql-migration-lint.test.ts`+`sql-lint-baseline.ts` (yeni DEFINER'da search_path+REVOKE/GRANT zorunlu; RPC redefinition zincirleri kayıtlı — 088-tipi sessiz regresyon görünür) · `scripts/check-deps.mjs` + test.yml `deps-gate` job (high+ allowlist; xlsx 2 GHSA + **next 16.1.7'nin 14 high advisory'si** + fast-uri 2 — Next yükseltmesinde kayıt silinir) · `scripts/check-migrations.ts` READ-ONLY OpenAPI-probe drift kontrolü.
- **Drift script'inin ilk koşusu GERÇEK HABER verdi:** `schema_migrations` bu projede güvenilmez (Studio'dan elle apply → kayıt yok; CLI listesi 082+ boş). Nesne-probe sonucu: **088/090/091/092 CANLIDA UYGULANMIŞ** (önceki "088/091 APPLY BEKLİYOR" notları BAYATTI) — **tek belirsiz 089** (`po_overdue` CHECK; OpenAPI'den problanamaz, script manuel SQL hint'i basıyor).
- Gate kendini kanıtladı (baseline'dan kayıt silinince kırmızı). Runbook'a Faz 4 bölümü. tsc 0 · lint 0 · **5123 test / 373 dosya** · build 0.
- **Kalan:** 089 elle doğrulama · rapor yol haritası Tur A–E (Tur A hızlı paket: K1 audit-log guard + Y2 stock-risk guard + K3 import KDV + O9 convert mühür + O11 attachment default flip).

## Önceki — 2026-06-13 (**Kalıcı performans — çekirdek paket — GREEN**)

**İstek:** "sistemde çok büyük render yavaşlığı var, kalıcı çözmemiz lazım" + kullanıcının trace'li raporu (dashboard 31 istek / paralel toplam 27.6s / alerts 479KB / finance 1.7s / profile 1.0s). 3 paralel keşif doğruladı: ana neden global DataProvider'ın her mount'ta 5 dev endpoint'i çekmesi (~10MB) + her route'ta tekrar `getUser()` + client-side agregasyon. **Kararlar (AskUserQuestion):** çekirdek paket (RSC/loading.tsx + tam server-side pagination SONRAKİ tur) · **SWR eklendi** (`swr@2.4.1`, kullanıcı seçimi) · Sidebar sayaçları migration'sız route.

- **Faz 0:** `swr-config.ts` (`jsonFetcher`/`FetchError`/`SWR_DEFAULTS` — focus-refetch KAPALI kilitli) + `server-timing.ts` → yalnız 3 yavaş route'ta `Server-Timing` header (products/orders all=1, finance).
- **Faz 1 auth dedup:** `resolveAuthContext()` (TEK getUser → user+roles+perms) + `requirePermissionFor`/`requireRoleFor`; **11 route** "guard + ikinci getUser" deseninden kurtuldu → istek başına auth 2-3→1 round-trip. React.cache route handler'da çalışmaz (render scope yok) — açık context kalıbı seçildi. 11 test mock factory güncellendi; source-lock: bu dosyalarda `auth.getUser()` geri gelmez.
- **Faz 2 counters:** YENİ `GET /api/dashboard/counters` → `{pendingOrders, reorderCount, activeAlerts}` (~100B; head+count; open+ack tanımı birebir; reorderCount = YENİ saf `isReorderCandidateRow` — copilot'un inline filtresiyle TEK kaynak + products-tag 60s cache). Sidebar artık `useData` çekmez → `useDashboardCounters()` 60s poll.
- **Faz 3 (kalp):** `data-context.tsx` SWR domain hook'larına yeniden yazıldı (dosya yerinde): `useProducts/useCustomers/useOrders/useProduction/useAlerts/useReorderSuggestions` + mutation-only `useOrderMutations`; **DataProvider veri ÇEKMEZ** (yalnız SWRConfig); `useData()` geriye-uyumlu kompozisyon; mutasyon köprüleri sözleşme-birebir (`{revalidate:false}` cache patch, `shouldRefetchProducts`+`buildLoadError` saf export — mirror testler gerçek implementasyona bağlandı, `invalidateAllData()`=refetchAll, `{refetchFailed}` korunur); **10 tüketici** dar hook'lara geçti (dashboard'da customers fetch'i İLK KEZ elendi).
- **Faz 4 duplicate fetch:** `shared-hooks.ts` — `useExchangeRates` (20dk; Ticker+dashboard tek istek; `ratesResolved` flash-guard), `useUserProfile` (+settings PATCH → `updateUserProfileCache` → Topbar avatarı anında tazelenir), `useSystemHealth` (5dk). RTL için `helpers/swr-test-wrapper.tsx` (`provider: () => new Map()`).
- **Faz 5 server:** `/api/alerts` GET dar kolon+limit 500 (default davranış AYNEN — scan/dedup tam satır; ai_inputs_summary/ai_reason taşınmaz; 479KB→~80KB); finance COGS RPC `unstable_cache` tags ["products","finance-cogs"] rev.300 (RBAC cache dışı, imza kilidi) → 1.7s→~ms; profile route'a dokunulmadı (SWR dedup yeter).
- **Test:** +6 yeni dosya, ~20 güncellendi; tsc 0 · lint 0 · **5104 test / 371 dosya** · build 0.
- **Kalan:** tarayıcı smoke — dashboard panelleri dolu · sipariş onayla→Sidebar rozeti düşer · üretim→stok düşer · import→tazelenir · demo guard · viewer redaction · Network istek/byte önce-sonra. Sonraki tur adayları: RSC/loading.tsx dönüşümü, gerçek server-side pagination, kalan 109 `select("*")`, `getClaims()` JWT-local doğrulama.

## Önceki — 2026-06-12 (**Dashboard: Teklif Hattı + Yoldaki Mal kartları — GREEN**)

**İstek:** doğruluk turu sonrası önerilen 2 kartın ikisi de ("/frontend-design ile detaylı plan"). **Şerit 7 kart, satış→tedarik sırası:** Ciro · Açık Siparişler · **Teklif Hattı** · Stok Değeri · **Yoldaki Mal** · Üretim · Açık Uyarılar.

- **`quotePipelineView`:** yalnız `sent`; `expiring7d` validUntil ∈ [bugün, +7g] (string karşılaştırma, `addDaysStr`); RBAC `grandTotal:null` → `redacted` → değer "—", adet delta'da kalır. Ciro yalnız-approved olduğundan pipeline değeri burada dürüst etiketle.
- **`incomingPoView`:** açık set sent/confirmed/partially_received; `overdueCount` = expected_date < bugün.
- **Fail-soft:** `KpiInput.quotes?/purchaseOrders?` null/undefined → kart üretilmez; page'de PO fetch 403 (sales/viewer) dahil !ok → null. `/api/quotes` guard'sız+redact'li, `/api/purchase-orders` view_purchase_orders guard'lı.
- **KpiCard:** `DashboardKpi.href` → gerçek `next/link` (tüm 7 kart href aldı; ok ikonu artık gerçek navigasyon); `subTone` warning/danger alt satır rengi (Teklif "7 gün içinde doluyor" warning · PO "gecikmede" danger — sakin şeritte tek vurgu); href'siz div fallback.
- Kur uyarısı memo'su quote/PO para birimlerini de tarar; rapor kpis'i generic map'lediğinden 7 satır otomatik.
- **Test:** +17 (`kpi-card-render` RTL + view-model sınır testleri + buildKpis 7-sıra/redaction/href + page source-lock); tsc 0 · lint 0 · **5066 test / 366 dosya** · build 0.
- **Kalan:** görsel smoke — admin 7 kart, sales'te Yoldaki Mal yok, kart tıkla→sayfa, expiring/gecikme renkleri, viewer "—".

## Önceki — 2026-06-12 (**Dashboard doğruluk turu — 4 bulgu fix + Açık Alacak kaldırıldı — GREEN**)

**İstek:** "dashboard %100 doğru mu, veriler güvenilir mi, açık alacak semantiği ne" denetimi → "bulguları eksiksiz düzelt + Açık Alacak kartını kaldır." **Kararlar (AskUserQuestion):** ciro=yalnız approved · FX çözülemeyince hariç tut + uyarı.

- **Üretim limit-50 bug'ı:** data-context parametresiz `/api/production` → default 50 kayıt; dönem KPI'ları + 14g seri sessizce eksikti. Fix: `productionFetchUrl()` (`?since=now-120g&limit=5000`, export — testte kilitli), route `since` regex + tavan 5000, db helper `gte(production_date)`. Yan etki: Üretim sayfası geçmişi ~120 gün gösterir.
- **Ciro yalnız approved:** `isRevenueOrder` pending'i sayıyordu — mig.088'den beri her gönderilen teklif pending sipariş yaratır → kabul edilmemiş teklif ciroyu şişiriyordu. Trend/rapor/boş-dönem aynı fonksiyondan otomatik tutarlı.
- **FX sessiz karışım:** `toReporting` kur yoksa tutarı ham geçiriyordu (TRY→USD 40 kat). Artık 0 (toplam dışı); `canConvert`+`listUnconvertibleCurrencies` yeni saf helper'lar; page'de `ratesResolved` guard'lı uyarı satırı (flash yok).
- **Etiket:** "Kritik Uyarılar"→"Açık Uyarılar" (KPI + rapor bölümü; değer tüm open+ack idi, etiket değerle hizalandı).
- **Açık Alacak KALDIRILDI:** `receivablesAging`/`AgingBucket`/`ReceivablesView` silindi (proxy: createdAt+30g sabit vade, 90g pencere, ödeme düşülmez — `customers.payment_terms_days` bile kullanılmıyordu); 5 KPI kaldı (`kpi-strip` auto-fit uyum sağlar); `KpiPerms.canViewFinancialSummary` kalktı (kart tek tüketici; müşteri sayfaları context'ten kullanmaya devam). Gerçek alacak istenirse `invoices`/`payments` tablolarından (mevcut, hiçbir UI okumuyor).
- **Test:** yeni `dashboard-data-accuracy.test.ts` (6 source-lock) + view-model/report/preservation yeni sözleşme + geri-gelmez kilitleri; tsc 0 · lint 0 · **5049 test / 365 dosya** · build 0.
- **Kalan:** görsel smoke — 5 kart, pending teklif gönder→ciro değişmez→onayla→artar, TCMB kapalıyken uyarı satırı.

## Önceki — 2026-06-11 (**Ayarlar → "Dosyalar" sekmesi: şirket dosya arşivi (handoff, mig.091) — GREEN**)

**İstek:** `design_handoff_settings_files_tab/` paketini "detaylı ve eksiksiz implement et, backendi sağlam olsun." **Kararlar (AskUserQuestion):** (1) handoff "api/yapay-zeka sekmelerini tamamen kaldır" diyordu → SİLİNMEDİ, dünkü Bakım/internal-operator işi korunur (müşteri admini zaten görmüyor — handoff'un amacı fiilen sağlanmış); (2) yalnız tablo görünümü (kart/grid prototipte tweak-panel'den geliyordu, toggle speclenmemiş).

- **mig.091 (APPLY BEKLİYOR ⚠️):** `company_files` tablosu (display_name/description/category CHECK 5'li [sozlesme/belge/teklif-eki/kurumsal/diger]/ext/file_path/file_size/mime_type/uploaded_at/`uploaded_by` text görünen-ad snapshot [alerts.created_by paterni]/`deleted_at` soft-delete) + partial index + RLS service_role + **private bucket `company-files`** (25MB, MIME allowlist) — 058 kalıbı.
- **Saf modül `lib/company-files.ts`:** kategoriler+label, splitName, formatFileSize (TR virgül), EXT metin renkleri, **uzantı→MIME haritası** (contentType uzantıdan türer — tarayıcı `file.type` boş bırakabilir, bucket reddi yenmez), 25MB + 5GB sabitleri.
- **DB helper `lib/supabase/company-files.ts`:** product-attachments birebir kalıbı — insert(file_path "")→upload `company/{id}.{ext}`→path patch; upload başarısız→satır silinir, patch başarısız→storage+satır geri alınır (orphan cleanup); **soft-delete storage'a DOKUNMAZ** (30 gün sözleşmesi, purge cron'u kapsam dışı); signed URL `{download}` opsiyonlu.
- **Uçlar:** `GET /api/settings/files` (view_settings; `{files, usedBytes, limitBytes}` server toplar) · `POST` (manage_settings; multipart file+display_name+category; ad≤200/kategori/uzantı-allowlist/25MB; tek dosya/istek — client sıralı atar) · `DELETE /[id]` (soft, yoksa 404) · `GET /[id]/download` (imzalı 1saat; `?download=1` attachment; **SVG her zaman attachment** — 046 stored-XSS precedent). **README'den sapma: PATCH yok** (UI tüketicisi yok → ölü uç politikası; `dbUpdateCompanyFileMeta` helper hazır bekler).
- **UI:** `settings-tabs.ts` += `dosyalar` (system, firma'dan sonra; eski `?tab=api` davranışı değişmedi); page.tsx 4 satır (FolderOpen + panel); yeni **`DosyalarTab.tsx`** (~560): pencere-geneli DnD (dragDepth sayacı, **tüm dragover/drop preventDefault** — tarayıcı dosyayı açmasın [README kritik notu], `section[hidden]` guard'ı — sekme arkadayken tepkisiz), isimlendirme+kategori onay modalı (taban ad düzenlenir + uzantı sabit + boyut; boş ad Yükle'yi kilitler; Escape+focus-dönüş NoteFormModal paterni; varsayılan kategori=aktif filtre), tr-TR arama (ad+açıklama+yükleyen), sayılı kategori dropdown (dışarı-tık kapatma), 3-eksen sıralama, sticky-thead tablo + DocIcon (belge silüeti+uzantı etiketi, renk yalnız metinde) + hover aksiyonları: Önizle (**senkron `window.open` sonra URL** — arşiv popup-blocker dersi; SVG'de gizli) / İndir (`location.assign`, attachment) / iki-aşamalı "Sil?" (mouseleave geri), depolama çubuğu + "30 gün çöp kutusu" özeti, demo guard'lar; globals.css `.files-*` portu (yalnız tablo yolu; kart/chip/dropzone sınıfları bilinçli portlanmadı).
- **Test:** +41 — `company-files-routes`(14: RBAC çifti/validasyon matrisi/snapshot fallback/SVG-attachment/404-502), `company-files-db`(10: saf yardımcılar + orphan/soft-delete/bucket/mig eşleşme source-lock), `dosyalar-tab`(12 RTL: tr-TR arama "İmzalı"→"imza", kategori sayı+filtre+boş durum, sıralama yönü, modal staging/kilit, exe reddi, POST FormData içeriği, demo, iki-aşamalı silme, DnD+popup-blocker+hex-yok kilitleri), settings-tabs/page-tabs güncellendi.
- tsc 0 · lint 0 · **5032 test / 361 dosya** · build 0 (3 yeni route manifest'te).
- **Kalan:** mig.091 APPLY + manuel smoke (Dosya Yükle→modal→listede; boş alana sürükle-bırak→overlay+modal, tarayıcı açmaz; arama/filtre/sıralama; önizle yeni sekme + indir; Sil?→listeden düşer, storage durur; kota çubuğu; `?tab=dosyalar`; viewer/demo görmez; açık/koyu tema).

## Önceki — 2026-06-11 (**İç kullanıcıya özel bakım alanları — GREEN**)

**İstek:** Müşteriler `API Anahtarları` ve ayarlardaki `Yapay Zeka` gözlem ekranını görmesin; bakım/test gerektiğinde yalnız iç kullanıcı erişebilsin.

- **Tek güvenlik kaynağı:** yeni `internal-access.ts`; `INTERNAL_OPERATOR_EMAILS` allowlist'i + effective `view_settings` birlikte zorunlu. E-posta trim/lowercase/dedupe; env boşsa fail-closed.
- **Server guard:** `/api/settings/api-keys-status` ve `/api/ai/observability` yalnız internal operator; anon 401, müşteri/admin-but-not-internal 403. Secret/env değerleri dönmez.
- **Client sinyali:** `/api/auth/me` → `internalOperator: boolean`; `PermissionProvider` loading/fetch-error/provider-dışı durumda false (bakım sekmesi flash yok).
- **Ayarlar UI:** Sistem (`Firma Profili`) / Bakım (`API Anahtarları`, `Yapay Zeka`) / Kişisel grupları. Müşteri admini Bakım grubunu görmez; doğrudan bakım query'si `firma`ya fallback ve iç endpoint fetch'i başlamaz.
- **Korunan müşteri akışları:** Paraşüt Sync/OAuth/token yenileme ve müşteri-facing AI işlevleri değişmedi.
- **Doğrulama:** tsc 0 · lint 0 · **4991 test / 358 dosya** · build 0. Migration yok.
- **Deploy yükümlülüğü:** Coolify'da bakım hesabı için `INTERNAL_OPERATOR_EMAILS=<eposta>` set edilmeli; boşsa iç kullanıcı dahil hiç kimse bakım alanını göremez.

## Önceki — 2026-06-11 (**Uyarılar: kullanıcı notları / hatırlatmalar (user_note, mig.090) — GREEN**)

**İstek:** "Uyarılar sayfasında kullanıcı kendi uyarısını/notunu oluşturabilsin." **Kararlar (AskUserQuestion, 4/4 önerilen):** serbest not + opsiyonel hatırlatma tarihi · herkese ortak (kişiye özel değil) · vade geçince severity info→warning · view_alerts olan herkes oluşturur (kapatma mevcut manage_alerts).

- **mig.090 (APPLY EDİLDİ ✅):** `alerts_type_check` += `user_note`; `due_date date` + `created_by text` kolonları. Canlı smoke: [SMOKE] seed (dün vadeli info + ileri tarihli) → scan `noteEscalated:1` yalnız vadesi geçen warning oldu → temizlendi.
- **POST /api/alerts:** yalnız type=user_note yazılabilir (body'den type/severity/source ENJEKTE EDİLEMEZ — testli); başlık zorunlu ≤200, açıklama ≤2000, due_date YYYY-MM-DD + bugünden ileri; created_by = session full_name || email snapshot; RBAC requirePermission("view_alerts").
- **Escalation:** `dbEscalateOverdueUserNotes` (due_date < bugün + aktif + info → warning) — scan route'unda po_overdue yanına non-fatal, yanıt `noteEscalated`.
- **Takvim entegrasyonu:** enrichment user_note'ta due_date'i satırın KENDİ kolonundan okur (entity join yok, "Hatırlatma" etiketi) → mevcut occurrence mekaniğiyle not yazıldığı gün + hedef günde görünür, dueCountdownLabel bedava. Yeni "Notlar" sekmesi (✎, types=[user_note]); AI sekmesine sızmaz (source=ui).
- **UI:** CalendarHeader "✎ Not" butonu (demo guard) → `NoteFormModal.tsx` (başlık/açıklama/tarih; Escape + focus dönüşü; min=today) → 201 → refetch + toast. Drawer'da user_note için "Oluşturan" satırı (createdBy CalendarAlert'e eklendi).
- **Güvenlik çiti:** scan'ler notlara dokunmaz — ORPHAN_TARGET_TYPES ve AI dedup user_note içermez (source-lock testli); user_note entity_id taşımaz → dedup index çakışmaz.
- **Test:** +15 `user-note-alerts.test.ts`; tsc 0 · lint 0 · **4976 test / 356 dosya** · build 0.
- **Kalan:** mig.090 apply + manuel smoke (not ekle → bugün görünür; tarihli not → hedef günde de; tarihi geçir + Tara → warning + sayaç; drawer Oluşturan; demo guard).

## Önceki — 2026-06-11 (**Genel Bakış: Finansal Özet kaldırıldı, Stok Dağılımı tam-genişlik revize — GREEN, push edildi**)

**İstek:** "Finansal özet kısmını kaldırıyoruz; stok dağılımını finansal özetin yerini karşılayacak şekilde revize edelim, ardından her şeyi push."

- **Silinen:** `FinancePanel.tsx` (Finansal Özet paneli — brüt kâr hero + money-flow + aging) ve tek tüketicisi olduğu `charts/AgingBars.tsx`; view-model'den `financeSummary`/`grossToNetRevenue`/`REPORTING_VAT_RATE`/`FinanceSummary` (tek tüketici paneldi). Maliyet granülerlik notu ("Maliyet aylık/çeyreklik bazda gösterilir") trend paneline taşındı.
- **StockPanel revize (tam genişlik, Satır 1 tek panel):** donut 188px + paylı legend (kategori başına %pay etiketi + 4px renkli pay çubuğu) + sağda dikey-ayraçlı özet kolonu: **Toplam Stok Değeri** hero (mono 26px) + Aktif ürün / **Kritik stok** (≤min, danger-tint) / **Risk bandında** (≤ceil(min×1.5), warning-tint). `stockStats` page.tsx'te products'tan memo ile türetilir, `StockPanelStats` tipi RealPanels'tan export.
- **Rapor (`DashboardReport`):** "Finansal Özet" bölümü kaldırıldı; Stok Dağılımı tablosu Pay sütunu kazandı (%xx.x satırlar + %100 toplam) + altında "Aktif ürün · Kritik stok · Risk bandında" özet satırı; `finance`/`financeNote` propları kalktı → `stockStats?` geldi. **Alacak Yaşlandırma:** önce raporda korunmuştu, ardından kullanıcı kararıyla **rapordan da kaldırıldı** — `receivables`/`canViewFinance` propları ve page'deki `receivablesAging` memo'su silindi. `receivablesAging` helper'ı view-model'de CANLI kalır (buildKpis → "Açık Alacak" KPI'ı onu içeride kullanıyor).
- **Test:** overview-panels-render: FinancePanel describe → StockPanel revize describe (pay/%toplam/stats/RBAC/hex-yok, 5 test); overview-charts-render: AgingBars blokları çıktı; dashboard-view-model: financeSummary/KDV-tuzağı blokları çıktı (helper'lar silindi); dashboard-overview-preservation: yeni diziliş kilidi (tek `overview-grid-1-1` + `<FinancePanel` ve `financeSummary(` geri gelmez + not trend'de); dashboard-report-render: `not.toContain("Finansal Özet")` + Pay/%100/Aktif-ürün; dashboard-segment-report hizalandı.
- **Doğrulama:** tsc 0 · lint 0 · **4959 test / 355 dosya** · build 0.

## Önceki — 2026-06-11 (**Uyarılar sistemi tutarlılık + kapsam turu — churn fix, AI revamp, quote/PO vade uyarıları — GREEN, `f9e88ed`**)

**İstek:** "Uyarılar sayfası genel ERP'nin uyarı merkezi olsun — verdiği uyarılar tutarlı mı, atladığı/yanlış gösterdiği var mı, backend kapsamlı mı; önerini sun (şunlar gereksiz vs.)." Analiz: backend çekirdeği sağlam (8 tip, lifecycle matrisi, dedup unique-idx, 24h dismiss+severity bypass, orphan temizliği, advisory lock, 6h GH-Actions cron) ama 3 ciddi tutarlılık sorunu + boşluklar. **Kararlar (AskUserQuestion):** fix paketi 4/4 · purchase_recommended→Satın Alma'ya devret · AI source=ai sekme+sınırlı üretim · kapsam: V7 teklif+PO gecikme (import_review_required + order_shortage e-postası SEÇİLMEDİ) · **model: Haiku kalır** (maliyet ~$1/ay vs Sonnet ~$3/ay ama kalite girdiden gelir; `MODEL` tek sabit→gerekirse tek satırla Sonnet).

**Tutarlılık fix'leri:** (1) `order_deadline` aynı-severity tazeleme `dbUpdateActiveAlertContent` ile YERİNDE — eski resolve+create churn'ü günde 4 "çözüldü" kopyası üretip takvimi/DB'yi şişiriyordu (severity değişimi bilinçli resolve+create kaldı = escalation geçmişi); (2) takvim fetch'i `dbListAlertsForCalendar` — limitsiz select Supabase **1000 satır tavanında sessizce kesiliyordu**; şimdi tüm aktifler + son 6 ay kapanmış, explicit 5000 limit (route query-filtreli eski sözleşmeyi korur); (3) data-context aktif sayaç open+**acknowledged** (sayfa istatistiğiyle aynı; dashboard panelleri de tutarlı); (4) yoksay UI'da satır silme→dismissed patch (refetch'te geri-görünme tutarsızlığı bitti); (5) domain-rules §6.1 warning kodla hizalı (min×1.5 + fiziksel-available_now/promisable eksen notu), §12.1 tip listesi güncel.

**Satın alma devri:** `/api/purchase/scan` + `/api/purchase/suggestions` + `purchase-service.ts` SİLİNDİ — **hiçbir cron/UI çağırmıyordu** (tek referans RBAC testi; canlı satın alma yolu ai_recommendations/purchase-copilot). DR-7 testi ölü servisi ölçüyordu→silindi (canlı promisable kilidi ai-purchase-copilot+reorder-suggestions testlerinde). Sekme: "AI Öneriler"→**"AI Bulgular"**, type yerine `source=ai` (`matchesAlertClass` TEK matcher — sekme sayacı+sayfa filtresi aynı; tip sekmeleri AI'ı dışlar→çifte sayım yok; tarihi purchase_recommended kayıtları source=ai→görünür kalır; tip union'da kaldı).

**AI revamp (kalite girdiden):** eski akış 8 toplam sayı+top5 ile Haiku'ya gidip entity'siz serbest metin insight/anomali üretiyor, her 6h'de TÜMÜNÜ dismiss+yeniden yaratıyordu (günde 4 batch takvim gürültüsü). Yeni: `aiGenerateAlertFindings` — riskli alt küme ≤30 ürün zengin satır (available/promisable/min/dailyUsage/coverage/lead/shortage/yoldaki-PO `dbGetIncomingPOQuantities` YENİ helper) + **tool-use structured output** (`uyari_bulgulari` şeması; regex JSON yok) + product_id girdi-listesi doğrulaması (halüsinasyon atılır) + kural-tekrarı YASAK prompt (kritik/risk/shortage/deadline kuralları zaten var — yalnız kuralların göremediği kalıplar) + max 6 bulgu, severity info|warning (§6.3: AI kırmızı üretmez) + per-finding confidence. `serviceGenerateAiAlerts`: entity-bağlı `stock_risk source=ai` yazar; aynı ürünün aktif AI alert'ini YERİNDE günceller; bulgusu geçeni `ai_finding_cleared` resolve; kural-stok-alert'li ve 24h-yoksayılmış ürüne EKLEMEZ; entity'siz eski nesil tek seferlik `legacy_entityless_ai_alert` dismiss; sonuç {created,updated,dismissed,summary}. `ai_runs.feature` += `alert_findings`. Dashboard AI Özeti (`aiGenerateOpsSummary`) DOKUNULMADI.

**Yeni kapsam:** **mig.089** `alerts_type_check` += `po_overdue` (**UYGULANMADI ⚠️** — `supabase db push`); `serviceCheckOverduePurchaseOrders` — expected_date geçmiş açık PO (sent/confirmed/partially_received) → warning, gecikmesi bitenler `po_no_longer_overdue` resolve; **alerts/scan route'unda** stok taramasıyla aynı lock'ta non-fatal (089'suz CHECK hatası yutulur, stok taraması etkilenmez → cron değişikliği gerekmedi). **V7 teklif:** `serviceExpireQuotes` sent→expired olurken `quote_expired` (entity_type=**quote**; draft sessiz; dedup unique-idx; best-effort) + `serviceCreateQuoteRevision` kaynaktaki uyarıyı `quote_revised` resolve. `alert-due-dates` 3 eksen (sales_orders/quotes/purchase_orders tablo-başına tek batch; "Teklif Geçerlilik" quote_number / "Beklenen Teslim" po_number). Drawer: süre-uzat formu `entityType==="sales_order"` kilidi (quote-entity'de form YOK→`/dashboard/quotes/[id]` "Teklifi Aç", po_overdue→`/dashboard/purchase/orders/[id]`); sekme "Sevkiyat & Teklif"→**"Vadeler"** (+po_overdue). `ALERT_TYPE_LABEL` += "Geciken Tedarik".

**Test:** +35 yeni (`po-overdue-scan` 7 [servis+route-lock+sorgu-lock] · `ai-alert-findings` 6 [tool-use/halüsinasyon/cap/clamp/boş-girdi/prompt] · `alerts-consistency-locks` 11 [sayaç/yoksay/churn/pencere/ölü-zincir geri gelmez] · due-dates +3 [quote/PO/karışık eksen] · lifecycle AI bloğu 4 yeniden · quote expire 6 yeniden), 13 mevcut güncellendi. **tsc 0 · lint 0 · 4964 test (355 dosya) · build 0** (ölü route'lar manifest'ten düştü, `ƒ Proxy` var). **Kalan:** mig.089 APPLY + manuel smoke (Tara→po_overdue; teklif süresi→uyarı; AI Öner→entity-bağlı; sekme sayaçları; drawer linkler).

## Önceki — 2026-06-10 (**Veri Aktarım Merkezi sadeleştirme — dosya-önce hub + Excel sihirbazı ayrı sayfa — GREEN, PUSH `a633632`**)

**İstek:** "Veri aktarım merkezi inanılmaz karmaşık ve işlevi çok kalabalık — sadeleştir, mantıklı zemine oturt." **Kararlar (AskUserQuestion):** (1) dosya-önce giriş (İşlem Türü ızgarası kalkar, tek dropzone, sistem dosya tipine göre yönlendirir); (2) Excel 7-adım sihirbazı ayrı sayfaya (`/dashboard/import/excel`); (3) ölü uç temizliği (`POST /[batchId]/parse` + drafts POST); (4) ImportGuide küçült (şablon satırı + tek satır güven notu + bilgi ilgili adıma).

**Faz 1 (`7b58154`) — ölü uç temizliği:** UI'sız `parse` route + drafts POST handler (GET kaldı) + `serviceAddDraftsToBatch` + `aiBatchParse`/`parseChunk`/`BATCH_PARSE_SYSTEM` silindi (grep doğrulamalı; `FALLBACK_FIELD_MAP`/`fallbackParseRow` CANLI — detect-columns kullanıyor). Testler: import-parse-route(26)+ai-batch-parse(19) silindi, drafts POST trim + POST-yok regression-lock, eval-runner aiBatchParse blokları + acceptance-eval + README hizalandı.

**Faz 2+3 (`eb489cc`) — hub + sihirbaz:** Hub 1595→~210 satır: tek DropZone ("Dosyanı bırak — PDF · Excel · görsel"), uzantı yönlendirme (`import-file-transfer.ts` singleton: `stashImportFile`/`takeImportFile` oku-ve-temizle; deep-link'te boş→kendi dropzone), ClassifierQueue, şablon satırı (+tip-özel `?kind=product_type&typeId=` dropdown), güven satırı (tam notlar tooltip'te). ImportGuide.tsx (290) silindi; import-guide.ts küçüldü (IMPORT_STEPS+buildOperationTargets öldü; IMPORT_DATA_TARGETS/getTargetForOperation/IMPORT_TRUST_NOTES/getActiveTemplateLinks canlı). Sihirbaz `/dashboard/import/excel`: 7 adım birebir taşındı (remember/inline-edit-rollback/field-approval/bulk-fill/overwrite/rapor/demo-guard/25MB/E2E locator korundu); **stok sheet'lerinde Sayım/Hareket radio** + apply-mappings `sheets[].operation_type` (grid kalkınca sessiz stock_count düşüşü önlendi; explicit seçim sunucu isim-çıkarımını yener — `inferStockOpFromSheetName` pure). **İşlem türü kaderi:** classify `operation_type` opsiyonel → `defaultOperationForDocumentType` (cert/compliance/test/msds/photo→product_documents, catalog→product_create, datasheet→product_technical_update, vendor_profile→vendor_upsert, else default) damgalar; ClassifierQueue chip damgadan okur, `onOpenClassicMode`→`onOpenExcelWizard(file)`; ExtractionReview'a işlem select + "Hedef: modül — ne olur" satırı; extract body `operation_type` override (classification'a persist). Çift yönlü kaçış: sihirbaz "AI ile analiz et"→hub kuyruğu, kuyruk migration_excel→"Excel sihirbazında aç". RBAC otomatik (page-access prefix `/dashboard/import`→view_import).

**Test:** import-page-faz3d+import-guide-render silindi; yeni `import-hub`(11: yönlendirme+regression-lock grid/accordion/parse-drafts-POST geri gelmez) + `import-excel-wizard`(19: state machine+korunan davranışlar+singleton+stok radio+E2E hizası); queue-interaction/guide/overwrite/muted-text/chips/file-size güncellendi; Playwright accordion-beforeEach→`/dashboard/import/excel` goto. **tsc 0 · lint 0 · 4943 test (5068'den: ~155 ölü-yol testi silindi, +30 yeni) · build 0 (hub+excel+extract manifest'te).** **Kalan:** push (ff main+both) + manuel smoke (Excel bırak→sihirbaz; PDF→classify→İncele→apply; migration_excel CTA; deep-link; demo guard).

## Önceki — 2026-06-10 (**Genel Bakış: döviz tasarımı + işlevsel dönem segmenti + gerçek rapor — GREEN**)

**İstek (ekran görüntüsü):** Genel Bakış'ta (1) üst bardaki döviz gösterimi tasarıma uymuyor; (2) `Bugün/Hafta/Ay/Çeyrek` segmenti hiçbir şeyi filtrelemiyor (kullanılmıyor); (3) `Rapor indir` ekran görüntüsü HTML basıyor → "adam akıllı" rapor istendi. **Kararlar (AskUserQuestion):** döviz→tasarıma uy (Alış/Satış etiketli, satış yeşil); segment→işlevsel filtre; rapor→yazdırılabilir PDF (sonra içerik = Detaylı kapsam + zengin künye).

**(1) Döviz çipi:** `ExchangeRatesTicker.tsx` → tasarım `RateChip` portu: her para birimi Alış (kalın) / Satış (yeşil `--success-text`) iki satır, 2 ondalık, dikey ayraç. Fetch/source mantığı + `● Bağlı` (gerçek `SystemHealthIndicator`) korundu; tasarımın sabit "Sistem aktif" noktası ALINMADI.

**(2) İşlevsel dönem segmenti:** Yeni saf `periodModel(range,now)` + `revenueByPeriod`/`orderCountsByPeriod`/`cogsByPeriod`/`productionInPeriod` (`dashboard-view-model.ts`). Ciro+Üretim KPI + Trend + Finans seçili döneme göre yeniden hesaplanır (Ay→12 ay · Çeyrek→4 çeyrek · Hafta→12 hafta · Bugün→14 gün). 4 snapshot KPI (Stok/Açık Sipariş/Açık Alacak/Uyarı) **anlık** etiketli (geçmiş snapshot yok — sahte veri yok). **Boş-durum** (advisor kapısı): siparişsiz dönemde Ciro+Trend "Bu dönemde sipariş yok" (düz-sıfır eksen değil). Hafta/Bugün'de COGS aylık-RPC kovalanamaz → maliyet hattı gizli + "Maliyet aylık/çeyreklik bazda gösterilir" notu. CSS bug fix: `"on"`→`is-active`. **Advisor blocker fix:** `productionInPeriod` tüm pencereyi topluyordu → yalnız `currentIndex` kovası.

**(3) Gerçek rapor:** Yeni `DashboardReport.tsx` — ekran görüntüsü değil, amaca özel yazdırılabilir (`.dashboard-print-report` ekranda gizli/baskıda block; `.dashboard-screen-only` baskıda gizli; globals.css 9px override ezildi). **İçerik (Detaylı + zengin künye):** Roven logo + "Genel Bakış Raporu" + tarih·dönem·firma·para + **Hazırlayan** (`/api/settings/user/profile`) → Özet Göstergeler(KPI) · Finansal Özet · Ciro&Maliyet trend tablosu · Stok Dağılımı(+Toplam) · Alacak Yaşlandırma · Son Siparişler(10) · Kritik Uyarılar(TÜM) · footer. Seçili döneme bağlı + RBAC maskeli. Ek bölümler (reorder/üretim/AI) kullanıcı seçmedi → yok.

**Testler:** view-model period testleri + `dashboard-report-render` (renderToStaticMarkup smoke+RBAC) + `dashboard-segment-report` (source-regression); 4 mevcut test (ticker/topbar/overview-preservation) yeni tasarıma göre güncel. **tsc 0 · lint 0 · 5068 test · build 0.** **Kalan:** görsel smoke (segment toggle + PDF önizleme).

### Önceki — Yeni Teklif sayfasına çift-onaylı inline "Gönder" butonu (GREEN)

**İstek:** `/dashboard/quotes/new`'de yalnız "Önizle & PDF"+"Kaydet" vardı; kullanıcı "Gönder" istedi (iki kez onay + hatasız). Önceden gönderim yalnız teklif detay sayfasındaydı. **Yaklaşım:** `QuoteForm` ortak (yeni+detay); yeni `enableInlineSend` prop'u **yalnız** new sayfasında Gönder'i açar (detayın kendi header Gönder'i → çift buton önlenir). **Çift onay:** `sendStep` 0→1→2 (Modal 1 rezerve notu + e-posta checkbox · Modal 2 son onay). **Ön-validasyon** sunucu sözleşmesini BİREBİR aynalar (`validateQuoteForSend`/`validateQuoteLineQuantities` client'tan import) → manuel-kod/adres-yok satır iki onaydan ÖNCE bloklanır (400 yememe). **Çekirdek:** `handleSave`'den `persistQuote({skipUrlSync})` çıkarıldı; `handleSendInline` = persist (replaceState YOK → push desync hazard elenir) → `sent` transition → sonuç toast → (e-posta) → `router.push` detaya. `suppressAutoSaveRef` + draft localStorage temizliği. **Drift önleme:** yeni `_utils/send-result.ts` (`applySendResultToast` cascade + `sendQuoteEmail`); detay sayfası da artık buna delege (inline kod taşındı, davranış korundu). Yeni buton aynı 088 RPC'sini çağırır. +`quotes-new-inline-send` test + 4 mevcut test refactor'a göre güncel. **tsc 0 · lint 0 · 5036 test · build 0.** **⚠️ Runtime smoke `migration 088 APPLY` gerektirir** (yoksa ilk tık "rezervasyon oluşturulamadı" → kırık görünür). **Sıradaki smoke:** Kaydet-sonra-Gönder alt-vakası + rezervasyon akışı.

## Önceki — 2026-06-10 (**Teklif gönderilince stok rezervasyonu (bekleyen sipariş) — GREEN, migration 088 APPLY bekliyor**)

**Senaryo:** aynı 10 stoğu iki satışçı iki müşteriye teklif → ikisi de kabul → -10 oversell. **Kullanıcı kararı:** rezervasyon teklif GÖNDERİLİNCE (accept'te değil); kabul→sipariş Onaylı. **Strateji A:** `draft→sent`'te accept'in teklif→sipariş dönüşümünü öne çek ama `pending_approval`+`allocate_order_lines` ile rezerve et (sipariş-merkezli motoru reuse). **Yaşam döngüsü:** sent→pending+rezerve · accepted→approve_order · rejected/expired/revised→cancel_order (release). **Migration 088:** `send_quote_and_create_pending_order` (pending+allocate, **zero-stock lenient** kısmi+shortage, arşiv NULL OK, idempotent) + `accept_quote_and_create_order` revize (bağlı pending→approve, yoksa legacy draft) + `cancel_quote_linked_order`. **Servis/route/UI:** sent sonucu reservationWarning/shortages/reservedOrderNumber; reject/expire/revise→cancel (best-effort); gönder onayında rezerve notu + shortage toast. Stok modeli değişmedi (pending zaten reserved). **+16 test · tsc 0 · lint 0 · 5021 test · build 0.** **Sıradaki:** push + **migration 088 APPLY (Supabase)** + smoke (gönder→available_now düşer→ikinci kısmi→reddet→geri→kabul→Onaylı). Edge: pending'i orders'tan elle iptal → rezerv gider teklif sent kalır (kabul).

## Önceki — 2026-06-09 (**Arşiv belgesi render fix + demo e-posta nötrleştirme — PUSH `d9ef1c3`**)

**(A) Arşiv "Belgeyi Aç" bug:** belge yeni sekmede ham HTML kaynağı + UTF-8 mojibake gösteriyordu. Kök neden: Supabase storage signed URL'i donmuş arşiv HTML'ini `text/html` render etmiyor (stored-XSS koruması → metin). Çözüm: arşiv route'una **`?view=1` modu** (`dbDownloadArchiveHtml` → `Content-Type: text/html; charset=utf-8` ile stream) + buton **senkron `window.open`** (popup-blocker de elendi). Eksik arşiv/403 → dostça HTML hata sayfası. JSON modu geriye uyumlu. `orders/[id]`+`quotes/[id]` butonlarından `archiveLoading` kaldırıldı. Commit `6ea6045`.

**(B) Demo e-posta mayını:** seed + mock-data'daki 4 müşteri gerçek firma domain'lerine işaret ediyordu; smoke'ta yanlışlıkla `procurement@abdibrahim.com.tr`'ye gerçek teklif gitti (Resend Sent, bounce yok → muhtemelen spam; özür gereksiz). Fix: tüm müşteri e-postaları `@*.example.com` (RFC 2606); `info@pmt.com.tr` satıcı, dokunulmadı. Commit `fe96937`.

**+6 test · tsc 0 · lint 0 · 5004 test · build 0.** Bounce yok = EMAIL_FROM+Resend+`.html` pipeline çalışıyor (smoke Aşama 1 fiilen yeşil). **Sıradaki:** (1) arşiv fix deploy sonrası görsel doğrula (render + doğru Türkçe); (2) `.html` smoke Aşama 2 (kendi Gmail+Outlook, müşteri e-postasını kendine çevir).

## Önceki — 2026-06-09 (**Teklif "Gönder" → müşteriye HTML ekli e-posta — PUSH `5ecc104`**)

**Kullanıcı isteği:** Teklif detay sayfasında "Gönder"e basınca müşteriye teklif belgesi e-posta ile gitsin (kullanıcı isterse). **Kararlar:** ek = **HTML eki** (binary PDF yok; dondurulmuş arşiv HTML — gerçek PDF chromium/dış-API gerektirir, reddedildi); tetik = **"Gönder" onayına checkbox** (varsayılan işaretli, transition'a bağlı tek-sefer).

**Yapılanlar (6 kod + 6 test):** (1) `sendDirectEmail` attachment primitifi (`email-service.ts`); (2) `renderQuoteToCustomer` müşteri şablonu (`templates.ts`, `shell()`+`hideManageFooter` → müşteriye giden e-postada dashboard footer'ı gizli, XSS escape); (3) `serviceSendQuoteToCustomer` (`quote-service.ts`, arşivle birebir HTML pipeline reuse, `no_email` guard, `email_logs` entity_type='quote'); (4) **`POST /api/quotes/[id]/send-email`** (`manage_quotes` RBAC; 404/400/503/502 map); (5) `dbListFailedEmailsForRetry` NULL-safe `.or("entity_type.is.null,entity_type.neq.quote")` (quote retry exclusion); (6) frontend `[id]/page.tsx`+`quote-display.ts` (draft Gönder confirm + checkbox + post-transition `/send-email`).

**ADVISOR (bug yok, 4 not):** #1 done=kod-complete+green AMA uçtan uca DOĞRULANMADI (EMAIL_FROM altyapısı; kullanıcı düzeltti); #2 **`.html` eki Exchange/Outlook strip/karantina riski** → kullanıcı kararı **önce smoke ile ölç** (Gmail+Outlook), sorunsa PDF-API; #3 RBAC temiz (manage_quotes=admin+sales, ikisi view_sales_prices tutar); #4 frozen arşiv yerine re-render (gelecek "Tekrar Gönder" frozen ekle — kod yorumu). tsc 0 · lint 0 · **4999 test** · build 0 (`ƒ /api/quotes/[id]/send-email`). Migration YOK.

**DURUM: PUSH EDİLDİ** (drift fix `458c14b` + bu iş; mirror main==codex-experiment). **Sıradaki smoke:** Aşama 1 `/api/email/test` EMAIL_FROM doğrula → Aşama 2 gerçek teklif → kendi Gmail+Outlook → `.html` eki geliyor mu/spam mı.

---

## Açık yükümlülükler (kullanıcı doğrulamalı)
- **Teklif e-posta smoke:** Aşama 1 — `EMAIL_FROM`'u `/api/email/test` ile doğrula; Aşama 2 — gerçek teklif "Gönder" → kendi Gmail + Outlook/Exchange → `.html` eki sağlam mı / spam'e düşüyor mu. Sorunluysa PDF-API yoluna geç.
- **Login "Monolith" deploy ön koşulları** (push `27733c6`; canlı tur doğrulanmadı): (1) Supabase "Allow new users to sign up" = OFF (birincil kilit); (2) ⚠️ BRICK RİSKİ — prod admin `app_metadata.roles` VEYA `ADMIN_EMAILS` her iki Coolify env'inde set olmalı (yoksa `isProvisionedUser` guard herkesi kilitler); (3) canlı Google OAuth turu (Supabase provider + `…/auth/callback` allowlist + tarayıcı smoke).
- **Paraşüt Faz 12 — Sandbox GATE:** gerçek API ile OAuth + list filtreleri + e-doc trackable_job + stok invariant doğrulamaları (`PARASUT_PLAN.md` §Faz 12).

## Geçmiş oturum indeksi (en yeniden eskiye — detay git log'unda)
- Önceki — (**Genel Bakış (Executive Dashboard) — TAM-SADIK yeniden kurulum (GREEN, PUSH BEKLİYOR)**)
- Son Tamamlanan İş — (**Login "Monolith" (F) redesign — TR/EN + tema + Google OAuth + reset**)
- Son Tamamlanan İş — (**Veri Aktarım Merkezi — rehber + şeffaflık katmanı**)
- Son Tamamlanan İş — (**Teklif formu ürün açılır-listesi kırpılma fix'i**)
- Son Tamamlanan İş — (**Görsel QA (codex) + iki-branch hizalama + PUSH**)
- Son Tamamlanan İş — (**Branch hizalama audit'i — son commitlerin detaylı kod incelemesi + 3 bulgu düzeltme**)
- Son Tamamlanan İş — (**İki branch'i hizalama — codex ↔ main merge + main hardening re-apply**)
- Önceki — (**Ürün Tipleri sayfası — final ürün [alan düzenleme UI + N+1 fix + a11y modal]**) — ⚠️ product-types değişiklikleri `56ecbd1` merge'inde codex rewrite'ı ile superseded; field_key guard codex yapısına re-apply edildi
- Önceki — (**Satın Alma Siparişi (Yeni) — ürün seçilince birim fiyat + KDV otomatik gelmiyor [FONKSİYONEL bug]**)
- Önceki İş — (**Ayarlar sayfası — final ürün (modal a11y + tablist a11y + entity render bug + hata mesajı paritesi)** — COMMIT+PUSH `b37764a`)
- Önceki İş — (**Cariler (Müşteriler) sayfası — final ürün (toplu-silme bayat satır + hover antipattern + modal a11y + validation parity)** — COMMIT+PUSH `c8057e5`)
- Önceki — (**Üretim Girişi sayfası — final ürün (BOM eksik-bileşen şeffaflığı + silme onayı + a11y)**)
- Önceki — (**Tedarikçiler sayfası — final ürün (a11y modal + görünür yükleme hatası + toplu-seçim kapsamı)**)
- Önceki — (**Satın Alma Siparişleri sayfası — final ürün 2. tur (sessiz yükleme hatası + tarih tutarlılığı)**)
- Önceki — (**Paraşüt Sync sayfası — final ürün (kritik: kırık manuel sync + dürüst durum)**)
- Önceki — (**Satın Alma Siparişleri sayfası — final ürün (eksik kapatma + salt-okuma canlı E2E)**)
- Önceki — (**Öneriler (Satın Alma Önerileri) sayfası — eksik kapatma + canlı E2E**)
- Önceki — (**Stok & Ürünler sayfası — eksik kapatma + canlı E2E**)
- Önceki — (**Satış Siparişleri Faz 3 — HARD rezervasyonu "Bekliyor"a (pending_approval) taşı**)
- Önceki — (**Satış Siparişleri Faz 1+2 — migration 081 APPLY EDİLDİ ✅ + canlı doğrulama**)
- Önceki — (**Teklif V7 Faz 8 Bulgular 1. tur — Paraşüt reconcile retry-bypass + doc/P3**, 2 commit, 4215 test)
- Önceki — (**RBAC Faz 4 TAMAMLANDI — quotes + PO redaction + archive gate**, commit `1db5865`, 4197 test)
- Önceki — (**RBAC Faz 4 (R1-R5) MAIN'E MERGE + PUSH** — merge commit `234d8d9`, 4174 test, build OK)
- Önceki — (Teklif V7 **Faz 8 — Ertelenen Borçlar Kapanışı** — 5 alt-faz/5 commit, 4098 test, COMMIT+PUSH EDİLDİ · **migration 080 APPLY EDİLDİ ✅**)
- Önceki — (Teklif V7 **Faz 7 — Not Şablonları (note_templates)** + Bulgular 1.+2.tur — migration 079, 4098 test, COMMIT+PUSH EDİLDİ · **079 APPLY EDİLDİ ✅**)
- Önceki — (Teklif V7 **Faz 6 Bulgular 3. tur — 3 P3 bulgu** + 2. tur, 4043 test, COMMIT+PUSH EDİLDİ + 077/078 APPLY EDİLDİ ✅)
- Önceki — (Teklif V7 **Faz 6 Bulgular 2. tur — 5 bulgu**, 4043 test, COMMIT+PUSH EDİLDİ `9a57d66` + 077/078 APPLY EDİLDİ ✅)
- Lint sinyali düzeltmesi — (npm run lint artık güvenilir + 0 sorun)
- Son Tamamlanan İş — (Teklif V7 **Faz 6 Bulgular — 5 bulgu review tur**, 4034 test, COMMIT+PUSH EDİLDİ + migration 077 APPLY EDİLDİ ✅ / 078 APPLY BEKLİYOR)
- Önceki — (Teklif V7 **Faz 6 — Accept → Sipariş (atomik)**, 4021 test, COMMIT+PUSH EDİLDİ + migration 077 APPLY EDİLDİ ✅)
- Önceki — (Teklif V7 Faz 4 — Bulgular 4. review tur, COMMIT+PUSH `6c9c317` + migration 075/076 APPLY EDİLDİ ✅)
- Önceki — (Teklif V7 Faz 4 — Bulgular 3. review tur, COMMIT+PUSH `da09dce`)
- Önceki — (Teklif V7 Faz 4 — Bulgular 2. review tur, COMMIT+PUSH `bb3b3f2` + migration 075/076 APPLY BEKLİYOR)
- Önceki — (Teklif V7 Faz 4 — PDF Arşiv: dondurulmuş HTML snapshot + Bulgular 1. review tur, 3951 test, COMMIT+PUSH b8c1613 + migration 075/076 APPLY BEKLİYOR)
- Önceki — (Teklif V7 Revizyon Zinciri — Faz 5'ten ertelenen, 3837 test, COMMIT+PUSH 1d96211 + migration 074 APPLY EDİLDİ + review pass)
- Önceki — (Teklif V7 Faz 5 infra dilim — numara katmanı, 3821 test, COMMIT+PUSH 942ee0d + migration 073 APPLY EDİLDİ)
- Önceki — (Teklif V7 Faz 3 REVIEW DÜZELTMELERİ — Bulgular P1-P3, 2 tur, 3815 test, COMMIT+PUSH 6366cbd+11c5079 + migration 070-072 APPLY EDİLDİ)
- Önceki — (Teklif V7 Faz 3 IMPLEMENT EDİLDİ — header iskonto, 3799 test, COMMIT+PUSH c5d8267 + migration APPLY EDİLDİ)
- Önceki — (Teklif V7 Faz 2 IMPLEMENT EDİLDİ — validasyon katmanı, 3778 test, COMMIT+PUSH afe936b)
- Önceki — (Teklif V7 Faz 1b IMPLEMENT EDİLDİ — QuoteForm entegrasyon, 3729 test, COMMIT+PUSH+APPLY EDİLDİ)
- Önceki — (6. tur: bekleyen UI fix commit/push + V7 bulgu doğrulama)
- Önceki — Teklif Modülü V6 Master Plan (5. tur review, 2026-05-29)
- Önceki — Teklif Modülü V5 Master Plan (4. tur review, 2026-05-29)
- Önceki — Teklif Modülü V4 Master Plan (3. tur review, 2026-05-29)
- Önceki — Teklif Modülü V3 Master Plan (2. tur review, 2026-05-29)
- Önceki — Teklif Modülü V2 Master Plan (1. tur review, 2026-05-29)
- Önceki — Teklifler modülü UI/UX eksiksiz düzeltme (3682 test, 2026-05-28)
- Önceki — SMTP smoke endpoint + deploy runbook (3667 test, 2026-05-28)
- Önceki — Sesli giriş V3 (3657 test, 2026-05-28)
- Önceki — React Doctor only-export-components ×22 fix (3637 test, 2026-05-28)
- Önceki — React Doctor Bölüm 4 (3636 test, 2026-05-28)
- Önceki — React Doctor temizlik (3636 test, 2026-05-27)
- Önceki — UX iyileştirme (3636 test, 2026-05-27)
- Önceki — AI rate limit advisor refinement (3614 test, 2026-05-26)
- Önceki — Route-level AI rate limit (3606 test, 2026-05-26)
- Önceki — M-3 Resilience fix (3581 test, 2026-05-26)
- Önceki — M-3 Review 2 (3575 test, 2026-05-25)
- Önceki — M-3 Review 1 (3569 test)
- Önceki — M-3 ilk implementasyon (3565 test)
- Önceki — Faz 4c (3534 test)
- Önceki — Faz 4b Review 1 (3516 test)
- Önceki — Faz 4b (3512 test)
- Önceki — Import E2E (3493 test)
- Önceki — Faz 4a Review (3491 test)
- Önceki — Faz 4a (3480 test)
- Önceki — Aging E2E 2 fail kapatma (3460 test)
- Önceki — Faz 3d Review 2.tur (3457 test)
- Önceki — Faz 3d Review 1.tur (3455 test)
- Önceki — Faz 3d (3452 test)
- Önceki — Faz 3c Review 5.tur (3441 test)
- Önceki — Faz 3c Review 4.tur (3439 test)
- Önceki — Faz 3c Review 3.tur (3432 test, 2 commit)
- Önceki — Faz 3c Review 2.tur (3419 test, 2 commit)
- Önceki — Faz 3c Review 1.tur (2026-05-22; 3401 test, commit `14a7253`)
- Önceki — Faz 3c (3387 test)
- Önceki — Faz 3b Review 6.tur (3360 test)
- Önceki — Faz 3b Review 5.tur (3350 test)
- Önceki — Faz 3b Review 4.tur (3348 test)
- Önceki — Faz 3b Review 3.tur (3345 test)
- Önceki — Faz 3b Review 2.tur (3329 test)
- Önceki — Faz 3b Review (3326 test)
- Önceki — Faz 3b (3305 test)
- Önceki — Faz 3a Review 3.e (3200 test)
- Önceki — Faz 3a Review 3.d (3200 test)
- Önceki — Faz 3a Review 3.c (3199 test)
- Önceki — Faz 3a Review 3.b (3192 test)
- Önceki — Faz 3a Review 3. tur (3190 test, commit `444dced`)
- Önceki — Faz 3a Review 2. tur (3188 test)
- Önceki — Faz 3a — AI Import drop-anywhere UI + multimodal classifier (3175 test, commit `3757e48`)
- Önceki — Faz 2e İPTAL (3098 test, commit `4401d66`)
- Önceki — Faz 2d Review P3-007 (3119 test, commit `05cc81e`)
- Önceki — Faz 2d Review 2. tur (3109 test, commit `6272759`)
- Önceki — Faz 2d Review 1. tur (3084 test, commit `2b4dd0a`)
- Önceki — Faz 2d (3059 test, commit `99f3027`)
- Önceki — Faz 2c Review P3 (3015 test)
- Önceki — Faz 2c — Teknik sekmesi dinamik alan rendering + tip seçici (2974 test) · commit `6846584`
- Önceki — Toplu Seçme ve Silme — Tüm 6 Liste Sayfası (2954 test) · commit `c043636`
- Önceki — Faz 2b Review — 3 bulgu kapatma (2935 test)
- Önceki — Faz 2b — Tam ekran ürün detay sayfası + drawer kaldırma (2930 test)
- Önceki — Faz 2a Review — Tüm Bulgular Kapandı (2026-05-19; 2911 test)
- Önceki — Faz 2a — Batches + Attachments DB Foundation (2903 test)
- Önceki — Faz 1 Review P2 Tam Kapanış (2026-05-19; 2874 test)
- Önceki — Faz 1 Review — 3 bulgu kapatma (2026-05-19; 2873 test)
- Önceki — Modül Revize Faz 1 (2026-05-19; 2855 test)
- Sıradaki İş
- 35 Soruluk Q&A — Ana Kararlar Özeti
- Önceki İşler (kısa kronoloji)

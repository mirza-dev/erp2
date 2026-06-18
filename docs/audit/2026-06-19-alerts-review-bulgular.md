# Alerts Modülü Derin Denetim — Bulgular

**Tarih:** 2026-06-19
**Kapsam:** Uyarı modülü — 6 route (`alerts/route`, `calendar`, `scan`, `ai-suggest`, `[id]`, `[id]/sync-retry`) + `/api/calendar-notes` (+`[id]`) + `alert-service.ts` + `supabase/alerts.ts`/`calendar-notes.ts` + helper'lar (`alert-calendar`/`alert-due-dates`/`calendar-notes`/`calendar-note-access`) + sayfa/component'ler.
**Yöntem:** REVIEW.md read-only (erp2-reviewer checklist + manuel kanıtlama). Modül çok olgun (uyarı revamp turu, takvim Faz 0-3, mig.089/090/092/101, RBAC R1). Bu tur method-seviye guard kör noktalarını + AI/cron yüzeyini hedefler.
**Özet:** **K:0 · Y:0 · O:0 · D:1 · Nit:0.** D1 (method-seviye guard kör noktası) düzeltildi; kullanıcı kapsam kararı: D1 düzelt.

---

## D1 (Düşük) — `GET /api/alerts/[id]` `view_alerts` guard'sız → tam uyarı satırı (AI gerekçe + serbest not) cross-role

**Kanıt:** `alerts/[id]/route.ts:8` GET hiçbir RBAC guard'ı içermiyordu. `serviceGetAlert` → `dbGetAlertById` `select("*")` (`alerts.ts:118-121`) → **tam satır**: `ai_inputs_summary`, `ai_reason`, **`user_note` (serbest metin)**, `created_by`. Liste GET (`alerts/route.ts`) bilinçli olarak DAR kolon seti alır (`ai_reason`/`ai_inputs_summary` HARİÇ — perf + dashboard-tier); `[id]` GET bu daraltmayı bozup tam satırı veriyordu.

**Etki:** `view_alerts` holder'ları = admin/sales/purchasing/production/viewer; **accounting'de YOK** (`permissions.ts:102-112`). `page-access.ts:40` `/dashboard/alerts`'i `view_alerts`'a kapatır. Kardeş route'lar TÜMÜ guard'lı: `calendar` GET → `requirePermissionFor(view_alerts)`, `calendar-notes` (+`[id]`) → `requirePermission(view_alerts)` + ownership/visibility, `[id]` PATCH → `manage_alerts`. Yalnız `[id]` GET atlanmıştı → accounting + proxy-fail-open/anon tam uyarı detayını (AI gerekçesi + serbest kullanıcı notu + oluşturan) okuyabiliyordu. (Method-seviye kör nokta — dosya PATCH'te `requirePermission` kullandığından dosya-seviye gate taraması "korunmuş" sanıyordu, baseline'da bile yok.)

**Tüketici-güvenliği:** `/api/alerts/${id}`'in tüm UI çağrıları (`alerts/page.tsx:314/327/340/359`) **PATCH** (durum mutasyonu) — **GET'in UI tüketicisi YOK**. Yani `view_alerts` guard'ı **hiçbir şeyi kırmaz**, yalnız accounting/anon'u kapatır. (Liste GET dashboard-tier kalır — accounting dashboard AlertsPanel'ini `useAlerts` ile çeker; ayrı sınıf.)

**Düzeltme:** GET imzası `_req`→`req` + gövde başına `requirePermission(req, "view_alerts")` (`requirePermission` zaten import'lu — PATCH kullanıyor). Aynı dosyadaki PATCH + calendar/calendar-notes kardeş kalıbı birebir.

---

## By-design / temiz doğrulananlar (BULGU DEĞİL)

- **`GET /api/alerts` (liste):** guard'sız ama **dashboard-tier** + DAR kolon (ai_reason/ai_inputs_summary yok): ana dashboard tüm rollerde (accounting dahil — view_alerts YOK) `useAlerts` ile AlertsPanel çeker (`dashboard/page.tsx:45`) → guard accounting dashboard'ını kırardı. (products/production GET ile aynı sınıf; asimetri kasıtlı.)
- **`POST /api/alerts/scan`:** CRON_SECRET VEYA oturum; **products sayfası mount'unda tüm `view_products` rollerinde otomatik tetiklenir** (`products/page.tsx:231`) → session-tier ZORUNLU. İdempotent + advisory-lock (`try_acquire_scan_lock`) + non-destructive recompute/reconcile (stok + PO-overdue + quote-reconcile + RFQ-due, hepsi non-fatal try/catch); demo=session yok→401.
- **`POST /api/alerts/ai-suggest`:** `requireCronSecret` (cron-only); oturum kullanıcı tetikleyemez. Advisory-lock (`try_acquire_ai_suggest_lock`).
- **`POST /api/alerts/[id]/sync-retry`:** `manage_alerts` (Paraşüt OAuth-refresh tetikler; Paraşüt turunda da doğrulandı).
- **`calendar-notes` (route + `[id]`):** session (`getCalendarNoteActor`) + `view_alerts` + `canViewCalendarNote`/`canManageCalendarNote` (ownership + visibility personal/shared) + input validation (title 1-200, desc ≤2000, tarih/saat format, visibility whitelist, sahipsiz-eski-not "personal yapılamaz" guard). Örnek-niteliğinde temiz.
- **`calendar` GET:** `view_alerts` guard. **`[id]` PATCH:** `manage_alerts`.
- **AI üretimi (`serviceGenerateAiAlerts`):** import/AI turunda G1/G2 sanitizasyonu ai-service boyunca tutarlı doğrulandı; entity-bağlı dedup + halüsinasyon filtresi + Haiku; cron-only tetik (`idx_alerts_active_dedup` çift alert önler).

---

## Düzeltme özeti
- Dosya: `src/app/api/alerts/[id]/route.ts` (GET +view_alerts).
- Test: YENİ `src/__tests__/alerts-read-guards.test.ts` (+3: accounting→403 + DB-çağrılmaz + viewer→200 + perm-fact). Gerçek role-guard zinciri (`createClient.getUser` rol-mock).
- Gate: `route-guard-matrix` yeşil (baseline değişmedi — A3 dosya-seviye PATCH guard'ı zaten "korunmuş" sayıyordu).
- **Migration YOK.** tsc 0 · lint 0 · **5554 test** (+3) · build 0.

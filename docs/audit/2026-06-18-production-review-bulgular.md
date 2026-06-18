# Production Modülü Derin Denetim — Bulgular

**Tarih:** 2026-06-18
**Kapsam:** Üretim modülü — 3 route (`/api/production`, `/api/production/[id]`, `/api/production/transcribe`), `production-service.ts`, `supabase/production.ts`, `production-shortage-helpers.ts`, `complete_production`/`reverse_production` RPC'leri (mig.004/008), `/dashboard/production` sayfası (+ voice akışı), ana dashboard production paneli/KPI'ı.
**Yöntem:** REVIEW.md kurallarıyla read-only inceleme (erp2-reviewer checklist + manuel kanıtlama). Modül olgun (voice V1–V3, RBAC R1, perf Faz turları dokundu). Bu tur yeni/izlenmeyen noktaları + stok-defteri atomikliğini hedefler.
**Özet:** **K:0 · Y:0 · O:1 · D:0 · Nit:2.** O1 (stok-defteri eşzamanlılık) düzeltildi; kullanıcı kapsam kararı: O1 düzelt (mig.104).

---

## O1 (Orta) — `reverse_production` eşzamanlılıkta idempotent değil → çift stok ters-hareketi (stok defteri bozulması)

**Kanıt:** `reverse_production` (mig.008:437 / mig.004:565) üretim kaydını **`FOR UPDATE` olmadan** okur:
```sql
select * into v_entry from production_entries where id = p_entry_id;  -- kilit YOK
```
sonra finished-product'ı `for update` kilitler. Bitmiş ürün stok düşüşü + BOM bileşen iadesi **stale `v_entry`** ile yapılır; gövdenin sonundaki `delete from production_entries` idempotent ama **stok mutasyonları onun satır-sayısına bağlı değil**.

**READ COMMITTED senaryosu (aynı `entry_id` ile iki eşzamanlı DELETE):**
1. Tx A ve Tx B ikisi de `v_entry`'yi okur (satır kilidi yok → ikisi de "kayıt var" görür).
2. İkisi de product'ı `for update` ister; A kilidi alır, B bekler.
3. A: `on_hand` 100 ≥ produced_qty 10 ✓ → on_hand 100→90, bileşen iadesi, entry sil, audit, **commit**.
4. B kilidi alır. EvalPlanQual ile `v_product.on_hand` = 90 (taze) ama `v_entry` hâlâ **stale** (produced_qty=10, entry "var" sanır). Check 90 ≥ 10 ✓ → on_hand 90→80 (**ikinci kez düşer**), bileşenler **ikinci kez** iade edilir, `delete` 0 satır (zaten silinmiş), audit, commit.

**Sonuç:** on_hand 2× düşmüş (100→80, doğrusu 90), BOM bileşenleri 2× iade edilmiş, ortada tek (sıfır) kayıt → **defter sessizce bozulmuş**, tespiti/kurtarması zor. RPC docstring'i "Atomic" iddia ediyor ama eşzamanlı reversal'a karşı değil.

**Hafifletmeler (gerçek olasılığı düşürür — ama DB sınırı UI'ye güvenmemeli):**
- `delete_production` yalnız **admin + production** rolünde; demo (viewer floor) + diğer roller 403.
- UI: onay modalı + `deletingId` guard (`if (deletingId) return`) + `disabled` buton; React discrete-event flush'u casual çift-tıkı korur.
- Gerçek tetik: kasıtlı eşzamanlı submit (iki sekme / ağ retry / script).

**Düzeltme (minimal, emsal-uyumlu — mig.104):** entry select'e **`for update`** eklendi:
```sql
select * into v_entry from production_entries where id = p_entry_id for update;
if not found then
    return jsonb_build_object('success', false, 'error', 'Üretim kaydı bulunamadı veya zaten geri alınmış.');
end if;
```
Entry satır kilidi iki transaction'ı serialize eder; kaybeden taraf re-read'de **silinmiş satırı bulamaz** → temiz `{success:false}` ile reddedilir, stok yalnız **bir kez** geri alınır. `on_hand` "zaten sevk edilmiş" guard'ı DELETE'ten önce çalıştığından korunur (yetersizse hiç silinmez/mutasyon yapılmaz). Yeni kilit sırası (entry→product→component) `complete_production` (product→component) ile ters-çift oluşturmaz → yeni deadlock yok. Gövdenin geri kalanı 008 ile birebir. CREATE OR REPLACE (idempotent, geri-uyumlu, veri taşıma yok).

**Gate:** `sql-lint-baseline.ts` `reverse_production: ["004","008"]` → `["004","008","104"]` + REDEFINITION_CHAINS yorumu.

---

## Nit 1 — `complete_production` çift-POST idempotent değil

İki eşzamanlı POST iki üretim kaydı + çift bileşen tüketimi + çift bitmiş-ürün üretimi yaratır. reverse'den **daha düşük**: oluşan kayıtlar **görünür ve geri-alınabilir** (sessiz bozulma değil); UI `isSaving` + buton disable; doğal idempotency anahtarı yok (genel create-endpoint sınıfı sorun). Bu turda dokunulmadı; izlenir.

## Nit 2 — `dbCompleteProduction` UTC default tarih

`production_date ?? new Date().toISOString().split("T")[0]` UTC dilimi alır. Sayfa her zaman yerel `tarih` (`today()`) gönderdiğinden **dormant**; başka bir çağıran tarihi atlarsa gece-yarısı (TR UTC+3) girişleri yanlış UTC gününe düşebilir. Düşük; dokunulmadı.

---

## By-design açık — GET `/api/production` route guard'sız (BULGU DEĞİL)

GET hiç RBAC guard'ı içermez; yalnız proxy session-or-demo'ya dayanır. Bu **kasıtlı dashboard-tier erişim** olarak doğrulandı, bulgu değil:

- Ana dashboard (`view_dashboard`, **tüm roller**) production KPI/trend panelini `productionFetchUrl()` ile bu uçtan çeker — `useProduction()` koşulsuz çağrılır (`dashboard/page.tsx:44`).
- `resolveAuthContext` no-session → **viewer floor** döndürür (demo = cookie-only, Supabase session yok). Dolayısıyla guard seçenekleri:
  - `view_production` (yalnız admin+production) → demo + sales/purchasing/accounting/viewer **403** → dashboard production paneli 4/6 rolde + demo'da kırılır. **Reddedildi.**
  - `view_dashboard` → viewer zaten taşır → **no-op** (kimseyi bloklamaz; proxy-fail-open'da bile viewer floor geçer). Değer yok.
  - Hard `if(!ctx.user) 401` → **demo dashboard'ı kırar**. Reddedildi.
- Tek teorik nüans: viewer/accounting raw entry detayını (entered_by e-posta, notes) doğrudan API'den okuyabilir (UI yalnız agregat KPI gösterir). Dashboard-tier imalat metadata olduğundan kabul edilebilir.

**Sonuç: doğru biçimde açık.** Production *detay sayfası* (`page-access.ts:38`) `view_production`'a kapalı; *overview metrikleri* view_dashboard-tier — model tutarlı. (Gelecekteki tur bu GET'i "guard'sız" diye yanlış kapatmasın diye burada gerekçelendirildi.)

---

## Temiz doğrulananlar (bulgu YOK)

- **POST /api/production:** tek `resolveAuthContext` + `requirePermissionFor(manage_production)` (admin+production); input validation (product_id zorunlu, produced_qty>0, scrap 0..produced); `entered_by` aynı auth context'ten; `revalidateTag("products")`.
- **DELETE /api/production/[id]:** `requirePermission(delete_production)`.
- **transcribe:** explicit session 401 → `requirePermissionFor(manage_production)` → `isVoiceAvailable` 503 → form-data guard → MIME allowlist → 10MB / boş dosya guard (cost-abuse koruması). AI yalnız öneri (entries[] formu doldurur, asıl kayıt POST'tan geçer — domain §11).
- **complete_production RPC:** finished + tüm bileşenler `FOR UPDATE` (deterministik `order by component_product_id` → deadlock-safe), shortage pre-check **mutasyon öncesi abort**, `ceil` konservatif yuvarlama, hareket + entry + audit tek transaction.
- **scrap_qty:** validate (0..produced), kayda yazılır ama on_hand'den düşülmez → **kasıtlı** (UI'da scrap kolonu yok; fire → notlar; produced_qty = sağlam adet; sayfa her zaman `scrap: 0` gönderir).
- **production-shortage-helpers:** saf, client-safe boundary (server-only `production-service` import edilmez — voice-note-helpers precedent'i); defansif Number/label fallback.
- **Demo:** sayfa mutasyonları `isDemo` + `DEMO_BLOCK_TOAST` ile bloklu; server'da manage/delete_production demo'yu (viewer) zaten 403'ler.
- **Geçmiş tarih / tarih sınırı:** input `max={todayStr}`, onChange clamp; gelecek tarih engellenir.

---

## Düzeltme özeti
- Migration: `supabase/migrations/104_reverse_production_idempotent.sql` (reverse_production CREATE OR REPLACE — entry select `for update`).
- Gate: `src/__tests__/gate/sql-lint-baseline.ts` (`reverse_production` zinciri → `["004","008","104"]`).
- **mig.104 APPLY gerekir** (kullanıcı tarafı). tsc 0 · lint 0 · build 0.
- **Not:** O1 saf SQL serialization düzeltmesi → vitest eşzamanlılığı kanıtlayamaz; enforced "test" = gate sql-lint baseline zinciri. Tek-çağrı JS yolu davranışı aynen kalır.
- Manuel smoke: aynı kayda iki eşzamanlı DELETE → biri başarı (stok 1× geri) + diğeri "bulunamadı/zaten geri alınmış"; tek DELETE normal reversal.

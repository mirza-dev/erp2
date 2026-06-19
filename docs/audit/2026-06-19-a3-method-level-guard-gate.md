# A3 — Route-Guard Gate Method-Seviyeye Çıkarıldı + Yakaladığı Açıklar

**Tarih:** 2026-06-19
**Kapsam:** `src/__tests__/gate/route-guard-matrix.test.ts` + `route-guard-baseline.ts` (gate altyapısı) + 3 runtime guard (`quotes`, `quotes/[id]`, `inventory/movements`).
**Tetikleyen:** `deferred_backlog` A3. Kampanya B'nin 9 modülde tekrar tekrar **elle** bulduğu sınıf: method-seviye RBAC guard kör noktası.

---

## Sorun — dosya-seviye kör nokta

Eski gate `guarded`'ı **dosya-seviye** hesaplıyordu:
```ts
guarded: GUARD_PATTERNS.some((g) => src.includes(g))
```
Bir route dosyasında HERHANGİ bir method (örn. `POST`) guard kullanınca **tüm dosya "korunmuş"** sayılıyordu → guard'sız kardeş `GET` görünmüyordu. Kampanya B'nin manuel bulguları tam bu sınıftı: import O1 (iki guard'sız import GET), orders O1, customers O1, products/[id]/quotes D1, alerts D1 — hepsi "dosya guard'lı sanılıyor ama GET açık".

---

## Çözüm — method-seviye tespit (kalıcı)

`route-guard-matrix.test.ts` yeniden yazıldı:
- Her exported HTTP method'un gövdesi (`export function X` → bir sonraki export'a kadar) **ayrı taranır**.
- **File-local guard-helper çözümü:** gövdesinde bir GUARD_PATTERN içeren dosya-yerel function/const (brace-eşlemeli `blockAfter`) tespit edilir; adı guard-token'a eklenir → o helper'ı çağıran method "guarded" sayılır. (calendar-notes/[id] `context()` → içinde `requirePermission` → çözülür. admin/users `requireAdmin(` zaten direkt pattern.)
- `GUARD_PATTERNS`'e `requireCronSecret(` eklendi (ai-suggest + email/outbox/process robustça guarded → ikincisi baseline'dan düştü).

`route-guard-baseline.ts` **method-anahtarlı** oldu: `methods` = o route'ta KASITLI guard'sız method listesi. Gate per (path, method) kontrol eder; guard'sız + baseline'da olmayan method → violation. Baseline'daki method guard kazanır / export'tan kalkar → stale.

**Sonuç:** 135 route, method-seviye taramada **26 guard'sız method** kaldı — hepsi sınıflandırılıp baseline'a gerekçeyle yazıldı (dashboard-tier / config / collateral / self-auth / public / tombstone). Gate artık gelecekteki TÜM method-seviye guard kör noktalarını PR'da yakalar.

---

## Method-seviye taramanın yakaladığı 3 GERÇEK açık → guard eklendi

### `GET /api/quotes` + `GET /api/quotes/[id]` → `view_quotes` (İZLENEN borç kapandı)
Guard'sızdı; redaction yalnız fiyatı (grandTotal/satır) maskeliyor — müşteri + teklif no + tarih (pipeline) açıktı. `view_quotes` holders: admin/sales/accounting/viewer; **production + purchasing'de YOK** + `/dashboard/quotes` page-access ile onlara kapalı → quote pipeline'ı doğrudan API'den okuyabiliyorlardı (products/[id]/quotes D1'in eşi). **Düzeltme:** her iki GET'e `requirePermission(view_quotes)` (redaction korunur). Consumer-safe: dashboard Teklif Hattı KPI fail-soft (`.catch→null`); quotes sayfaları view_quotes-gated; demo=viewer taşır.

### `GET /api/inventory/movements` → `view_products`
Guard'sızdı; stok hareket geçmişi (qty/tip/referans/not — finansal değil) accounting (view_products yok) + anon'a açıktı. **UI tüketicisi YOK** (grep boş) → guard sıfır-risk; kardeş products sub-route kalıbı (`shortages`/`supplier-prices` view_products'lı). **Düzeltme:** `requirePermission(view_products)`.

---

## Doğrulama
- Test: YENİ `quotes-inventory-read-guards.test.ts` (+9: quotes GET production/purchasing→403, viewer→200; quotes/[id] production→403; movements accounting→403, viewer→200 + perm-fact). Gate matrix method-seviye yeşil.
- tsc 0 · lint 0 · **5562 test** (+8) · build 0. **Migration YOK.**
- 26 baseline kaydının sınıflandırması kampanya B (9 modül) doğrulamalarına dayanır.

---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-16 — Test altyapısı + Bulgular Raporu fix'leri):**

1. **Y1: 4 failing test fix** — `alert-action-routes.test.ts`: `scanPost()` çağrılarına `NextRequest` geçildi
2. **Y3: Purchase alert dedup fix** — `purchase-service.ts`: `dbOpenAlertExists` → `dbListActiveAlerts` pre-fetch (acknowledged alertlar da dedup kapsamında)
3. **O4: Promisable fix** — `purchase-service.ts`: `available_now` → `available_now - quoted` (promisable hesabı)
4. **Coverage threshold** — `production-service.test.ts` (yeni, 6 test), passthrough function testleri → lines 82% / functions 80.7% (threshold 80% geçti)
5. **5 DR test dosyası** — `src/__tests__/domain-rules/` (DR-4, DR-5.1, DR-6, DR-7, DR-11)
6. **REVIEW.md** — repo kökünde code review talimatları
7. **K1+K3 (önceki oturum)** — RLS migration 029, Paraşüt shipped guard

**Test:** 1418 pass, 0 fail | Lines 82% | Functions 80.7%

**Bilinen açık sorunlar:** Yok (tüm bilinen hatalar giderildi)

**Why:** Yeni session'da Claude aktif konuyu bilsin, context kaybı yaşanmasın.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.

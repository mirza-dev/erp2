---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-07):**

1. **Demo mode UX tutarlılığı** — 12 dashboard sayfasında mutation button'ları artık disabled + tooltip + toast. `demoGuard()` artık redirect etmiyor.
2. **Import service semantik düzeltmeler** — stock branch sayaç hatası düzeltildi, `parseNumeric()` ile 0-değer kaybı giderildi.
3. **Product import contract hardening** — 9 yeni test: SKU dedup, on_hand kuralları, currency default, string identity field'lar, user_corrections override.
4. **Import result contract audit & fix** — 5 bug düzeltildi:
   - Customer/quote/invoice existing match → gerçek UPDATE (dbUpdateCustomer, dbUpdateQuote, dbUpdateInvoice)
   - Tüm skip path'lerde `dbUpdateDraft(rejected)` eksikti (7 yer + catch block)
   - Bilinmeyen entity_type → sessiz kayıp (counter artmıyor) düzeltildi
   - `dbUpdateQuote` + `dbUpdateInvoice` DB fonksiyonları oluşturuldu
   - 17 yeni test: quote/invoice/shipment/payment merge, customer update on match, draft rejection, unknown entity, mixed-entity batch
5. **Order import latent bug fix** — `serviceCreateOrder` yerine `dbCreateOrder` doğrudan çağrılıyor. RPC boş lines array'i handle ediyor; order_line draft'ları sonradan appended. [KNOWN BUG #import-1] kaldırıldı.
6. **ESLint temizliği** — `npm run lint` 0 warning / 0 error: unused `beforeEach` import, `let` → `const` (locationHref), unused `DEMO_DISABLED_TOOLTIP` import.

**Test sayısı:** 46 dosya · 1097 test

**Sonraki adım:** Belirlenmedi

**Blokör:** —

**Why:** Yeni session'da Claude aktif konuyu bilsin, context kaybı yaşanmasın.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.

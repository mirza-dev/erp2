---
name: feedback_plan_domain_check
description: Plan yazmadan önce domain-rules.md okunmalı — projeden kopuk özellik planlanmamalı
type: feedback
---

Plan yazmadan önce `domain-rules.md` okunmalı, özellikle entegrasyon sınırları ve "system of record" kuralları kontrol edilmeli.

**Why:** Faz 5 olarak "Fatura Otomasyonu" planlandı — oysa domain-rules.md:63 açıkça "fatura/payment için authoritative kaynak Paraşüt'tür" diyor. ERP içinde fatura oluşturmak domain kuralına aykırıydı. Kullanıcı "projeden kopuk plan" dedi.

**How to apply:** Yeni özellik planlarken önce domain-rules.md'yi oku. Özellikle şu soruları sor:
- Bu özellik hangi veri için authoritative? ERP mi, Paraşüt mi?
- Domain-rules'da bu alanla ilgili kısıtlama var mı?
- Planlanan şey mevcut entegrasyonlarla çakışıyor mu?

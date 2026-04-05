---
name: feedback_no_silent_deletes
description: Kullanıcı, işe yarar kodu sessizce silmekten rahatsız — silme işlemi yapmadan önce onay veya net gerekçe gerekiyor
type: feedback
---

Kod silerken şu kuralı uygula:

Bir şeyi silmeden önce ya yerine kesinlikle daha iyi/düzeltilmiş bir şey koymalısın, ya da silmenin projeye faydası olmadığından emin olmalısın. Emin değilsen silme — refactor et ya da kullanıcıya sor.

**Why:** Kullanıcı, `sanitizeImportField` gibi çalışan private fonksiyonların sessizce kaldırılmasından rahatsız oldu. "Taşıdım" demek yeterli değil — eski işlevselliğin tam karşılandığı açık olmalı.

**How to apply:** Herhangi bir kod silinecekse, silmeden önce kullanıcıya "X'i siliyorum çünkü yerine Y koydum / artık kullanılmıyor" şeklinde açıkça belirt ve onay bekle.

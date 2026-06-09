---
name: feedback_ask_scope_decisions
description: "Kapsam/varsayım kararlarını AskUserQuestion ile sor, sonra kendin ilerle"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 72c39a13-ba63-4279-ac44-8010c8a6c56b
---

Çok fazlı/uzun işlerde **kapsam, varsayım ve davranış kararlarını** kullanıcıya `AskUserQuestion` ile sor; cevap alınca **kendin ilerle** (her adımda yeniden onay bekleme).

Kullanıcı sözü: "bana sorman gereken noktaları sor kendin ilerleme".

**Why:** Kullanıcı yön belirlemek istiyor ama mikro-yönetim istemiyor. Yanlış varsayımla ilerleyip iş yapmak (örn. eşleşen üründe core alanları koşulsuz ezmek) sonradan geri-alma maliyeti yaratır; ama her küçük adımda durup sormak da akışı kesintiye uğratır.

**How to apply:**
- Karar **kullanıcının** ise (kapsam sınırı, varsayılan davranış, "üzerine yaz vs. koru", "tip-özel mi genel mi") → `AskUserQuestion`, ilk seçenek önerilen + "(Önerilen)".
- Karar koddan/varsayılandan türetilebiliyorsa → kendin seç, yanıtta belirt, ilerle.
- "bütün fazlar bitsin sonra push" gibi toplu-teslim talimatı geldiyse → fazları sırayla bitir, ara onay isteme, sonunda tek push.
- ADVISOR done-check'leri kapsam sorusu değildir — onları yine de çalıştır.

İlgili: [[feedback_global_over_hardcode]] (tekrarlayan UI kararını global yap), [[feedback_no_silent_deletes]] (silmeden önce gerekçe/onay).

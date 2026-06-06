---
name: feedback_global_over_hardcode
description: Tekrarlayan UI ayarlarını sayfa-bazlı hardcode yerine component varsayılanında/global yap
metadata:
  type: feedback
---

Kullanıcı bir UI ince ayarını (logo mark↔wordmark `gap`) tek bir kullanım yerine (Topbar) `gap={7}` olarak hardcode ettiğimde **"global de değiştir bu davranışı"** dedi → ayarı `RovenLogo` component'inin `DEFAULT_GAP` varsayılanına taşıdım (`2fd2ef6`).

**Why:** Bir görsel davranış birden çok yerde geçerli olmalıysa, onu her kullanım yerinde tekrar tekrar prop'la geçmek tutarsızlık + bakım yükü üretir. Tek kaynakta (component varsayılanı / CSS token / global sabit) ayarlamak hepsini bir anda hizalar.

**How to apply:** Bir component'in görünüm/boyut/boşluk davranışını ayarlarken sor: "bu yalnız bu bağlama mı özel, yoksa markanın/component'in genel davranışı mı?" Genel ise **component varsayılanını veya global token'ı** değiştir; yalnız o bağlama özel sapma gerekiyorsa orada explicit prop ver (örn. login `gap={9}` bilinçli geniş → global'den izole kalır). İlgili: [[reference_theming]] (renkte de aynı ilke — `var(--...)` token, sayfa-bazlı hex değil).

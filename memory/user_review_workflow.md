---
name: User Review Workflow
description: Kullanıcı her değişiklik turunda yapılandırılmış "Bulgular" raporu gönderir — önce doğrula, sonra düzelt
type: user
---

Kullanıcı, her geliştirme turunu tamamladıktan sonra kodu kendi inceliyor ve "Bulgular" başlıklı yapılandırılmış rapor gönderiyor:

- Her bulgu severity ile etiketlenir: Yüksek, Orta, Düşük, Düşük-Orta
- Her bulgu ilgili dosya ve satır referansı içerir (ör. route.ts line 86)
- Rapor sonunda "sence doğru mu bunlar" sorusu gelir — önce değerlendirme bekler
- Bazen bir "Durum" bölümü de ekler: hangi önceki sorunlar kapanmış, test/build/lint durumu

**How to apply:** Bulgular geldiğinde önce her birini koda karşı doğrula ve kullanıcıya katılıp katılmadığını söyle. Doğrudan düzeltmeye geçme — kullanıcı önce değerlendirme istiyor. "düzelt" komutu geldikten sonra düzeltmeye başla.

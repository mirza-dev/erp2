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

**Formal review kuralları:** `REVIEW.md` (proje kökünde) — Claude kodu review ederken uyması gereken kurallar:
- 🔴 Important: yalnızca production'ı bozan bulgular (yanlış business logic, RLS bypass, data loss, API contract ihlali, `"use client"` eksikliği)
- Nit: style, naming, refactoring — her review'da max 5 nit
- **Her zaman flag:** Tailwind class kullanımı, Framer Motion import, hardcoded hex/rgb renk

**How to apply:** Bulgular geldiğinde önce her birini koda karşı doğrula ve kullanıcıya katılıp katılmadığını söyle. Doğrudan düzeltmeye geçme — kullanıcı önce değerlendirme istiyor. "düzelt" komutu geldikten sonra düzeltmeye başla. Kendi review yaparken REVIEW.md kurallarını uygula.

## Dış inceleme raporları — iddia ile DELİL ayrı ayrı doğrulanır

2026-09-11'de kullanıcı **dışarıdan** (başka bir ajanın ürettiği) 12 maddelik
bir inceleme raporu paylaşıp tek kelime yazdı: *"incele"*. 12/12 bulgu gerçek
çıktı, ama rapor üç noktada yanılıyordu ve üçü de yalnız **kaynağa karşı
okuyarak** görülebildi:

1. **İddia doğru, DELİL yanlış olabilir.** Parola bulgusunun kanıtı olarak
   `supabase/config.toml` gösterilmişti — o dosya `supabase start`ın **yerel**
   config'i (`project_id`, port 54321), prod ayarı değil. İddianın kendisi
   (yüzey istemci-tekti) delilden bağımsız olarak doğruydu. **Delili
   doğrulamadan iddiayı kabul de etme, reddetme de.**
2. **Severity sıralaması güvenilmez.** Raporun "yüksek" dediği iki bulgu
   `PARASUT_ENABLED` boş olduğu için bugün ÖLÜYDÜ; "orta" dediği bir bulgu ise
   dokuz canlı listede kullanıcı-görünürdü. Sıralamayı **ölçüm** belirlemeli:
   bu kod bugün koşuyor mu?
3. **Rapor bir ÖRNEĞİ gösterir, sınıfı değil.** "İki audit kaydı sessizce
   kaybolabiliyor" denen yerde depo tarandı: 28 insert'in 21'i öyleydi. Yalnız
   işaret edilen ikisini düzeltmek, "hepsi" diyen bir kapıyı 19 muafiyetle
   doğururdu.

**Uygula:** dış rapordaki her madde için üç ayrı soru — (a) iddia kodda tutuyor
mu? (b) gösterilen delil gerçekten o iddianın delili mi? (c) bu bir örnek mi,
yoksa sınıfın tamamı mı? Sonra kapsam kararlarını `AskUserQuestion` ile sor
([[feedback_ask_scope_decisions]]), ancak ondan sonra düzelt.

Bağlantılar: [[feedback_contract_in_types_not_comments]] · [[project_security]]

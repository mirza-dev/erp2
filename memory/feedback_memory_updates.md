---
name: MEMORY.md Düzenli Güncellensin
description: Konuşma sonunda veya önemli bağlam değiştiğinde MEMORY.md ve ilgili memory dosyaları güncellenmelidir
type: feedback
---

MEMORY.md ve memory dosyaları düzenli olarak güncel tutulmalı — sadece ilk kurulumda değil, her önemli proje değişikliğinde veya yeni bağlam öğrenildiğinde güncelle.

**Why:** Kullanıcı bunu açıkça belirtti; hafızanın güncel kalması gelecek konuşmalarda doğru bağlamı sağlar.

**How to apply:** Proje durumu değiştiğinde (yeni faz, mimari karar, önemli kural), projeyle ilgili memory dosyalarını ve MEMORY.md indeksini güncelle.

## İndeks bir YÖNLENDİRİCİ, özet deposu değil (2026-09-12'de ölçüldü)

`MEMORY.md` bir yükleme bütçesine tabidir (~24,4 KB). **Aşınca hata VERMEZ —
harness fazlasını sessizce keser ve sondaki girdiler oturuma hiç gelmez.**
Gerçekten oldu: dosya 26,7 KB'a çıktı, **son üç feedback dosyası yüklenmedi**
(`contract_in_types_not_comments` · `global_over_hardcode` ·
`ask_scope_decisions`) — yani bellek kaybının en sinsi biçimi, çünkü eksik
olduğunu ancak uyarıyı okursan fark edersin.

Sebep: tur anlatılarını indeks satırının başına eklemek. Tek bir girdi
(`current_focus.md`) **12.323 bayta** ulaşmıştı — dosyanın %45'i.

**Kural:** indeks satırı = dosyanın ne işe yaradığı + en taze durum işareti,
tek satır. Tur anlatısı, ölçüm dökümü, tarihli özet **konu dosyasına** yazılır;
indekse ASLA. `gate/memory-index` artık ikisini de kilitliyor (toplam ≤ 20 KB,
girdi başına ≤ 400 bayt) — ama kapı son savunma, birinci savunma bu alışkanlık.

**Yan ders:** o kapı 5 kuralla YEŞİL geçerken kusur oradaydı — kurallar indeksin
*doğru gösterdiğini* denetliyordu, *yüklendiğini* değil. Bir kapı ölçtüğü şeyi
kapsar, adının ima ettiğini değil.

# AI Acceptance Checklist
Status: Active  
Depends On: `domain-rules.md`, `docs/ai-strategy.md`, `docs/ai-implementation-roadmap.md`  
Last Updated: 2026-03-28  
Phase: Stage 2A Verification

## 1. Amaç
Bu belge, Stage 2A AI katmanının ürün içinde gerçekten çalışıp çalışmadığını doğrulamak için kullanılır.

Bu bir teknik roadmap değildir.
Bu belge şunları doğrular:
- AI özelliği kullanıcıya gerçek değer veriyor mu
- AI açıklanabilir mi
- AI fallback davranışı temiz mi
- AI deterministik çekirdek ile karışıyor mu
- AI yüzeyleri ürün içinde güven veriyor mu

Bu belge özellikle şu fazı doğrular:
- Import Intelligence
- Order Review Risk
- AI Ops Summary
- Stock Risk Forecast
- Purchase Copilot v1
- Recommendation lifecycle

---

## 2. Kullanım Şekli

Her kontrol için şu üç sonuçtan biri yazılmalıdır:
- `PASS`
- `PARTIAL`
- `FAIL`

Her madde için mümkünse şu notlar eklenmelidir:
- gözlenen davranış
- beklenen davranıştan fark
- örnek kayıt / sipariş / ürün / import dosyası
- gerekiyorsa ekran görüntüsü

Bu checklist tamamlandıktan sonra:
- bug listesi çıkarılır
- tuning gerektiren alanlar ayrılır
- ancak ondan sonra yeni AI feature fazına geçilir

---

## 3. Global Kabul Kriterleri

Stage 2A genel olarak başarılı sayılmak için:
- AI unavailable olduğunda ürün kırılmamalı
- AI çıktıları deterministik sonuçlarla karışmamalı
- kullanıcı “neden bu öneri/özet/risk çıktı?” sorusuna cevap alabilmeli
- en az bir sonraki aksiyon net olmalı
- AI ürün içinde gösterişli ama boş bir katman gibi hissettirmemeli

Global red flag:
- AI açıklaması anlamsız veya jenerik
- confidence alanı tutarsız
- kullanıcıya sahte kesinlik hissi verilmesi
- AI sonucu ile gerçek sistem durumu çelişmesi

---

## 4. Import Intelligence Acceptance

## 4.1 Temel Akış
- [ ] Kullanıcı import ekranına belge yükleyebiliyor
- [ ] Sistem parse sonucunu preview olarak gösteriyor
- [ ] Preview yalnızca ham tablo değil, AI destekli alan eşleştirmesi içeriyor
- [ ] Kullanıcı hangi alanların düşük confidence olduğunu anlayabiliyor
- [ ] Kullanıcı hangi alanların eşleşmediğini görebiliyor
- [ ] Onay sonrası sonuç `draft` olarak oluşuyor
- [ ] Sistem doğrudan `approved` entity oluşturmuyor

## 4.2 Açıklanabilirlik
- [ ] Confidence kullanıcıya görünür
- [ ] `ai_reason` veya benzeri açıklama görünür
- [ ] Eşleşmeyen alanlar açık şekilde listeleniyor
- [ ] Yanlış parse ile düşük confidence arasında mantıklı ilişki var

## 4.3 Fallback
- [ ] AI unavailable ise ekran kırılmıyor
- [ ] Kullanıcı neden AI parse göremediğini anlıyor
- [ ] Sistem manuel review/draft yolunu koruyor

## 4.4 Başarı Sinyali
Bu alan başarılıysa kullanıcı şunu hisseder:
- “Belgeyi sisteme attım, AI bana yardımcı oldu ama kontrol bende”

## 4.5 Red Flags
- Preview ile oluşan draft arasında kopukluk
- Çok yüksek confidence ile bariz yanlış eşleşme
- Parse sonucunun neden böyle çıktığının anlaşılmaması
- Düşük confidence alanların normal alanlardan ayırt edilememesi

---

## 5. Order Review Risk Acceptance

## 5.1 Temel Akış
- [ ] Sipariş listesinde AI risk görünür
- [ ] Sipariş detayında AI risk görünür
- [ ] Risk etiketi `low / medium / high` olarak tutarlı gösterilir
- [ ] Sipariş detayında risk nedeni okunabilir şekilde gösterilir

## 5.2 Anlam ve Ürün Dili
- [ ] Kullanıcı bunun ödeme/fraud skoru olmadığını anlayabilir
- [ ] Risk etiketi operasyonel inceleme riski gibi davranır
- [ ] “Neden bu risk?” sorusuna ürün içinde cevap vardır

## 5.3 Tutarlılık
- [ ] Benzer siparişlerde çok farklı ve açıklanamaz skorlar çıkmıyor
- [ ] Çok eksik/alışılmadık siparişlerde risk artıyor
- [ ] Çok normal siparişlerde risk gereksiz şişmiyor

## 5.4 Fallback
- [ ] AI unavailable ise sipariş ekranı bozulmuyor
- [ ] Risk alanı boş kalıyorsa bu durum dürüst biçimde gösteriliyor

## 5.5 Başarı Sinyali
Bu alan başarılıysa kullanıcı şunu hisseder:
- “Sistem bana bu siparişe neden dikkat etmem gerektiğini anlatıyor”

## 5.6 Red Flags
- Risk etiketi var ama neden yok
- Confidence var ama hiçbir anlam taşımıyor
- Düşük riskli normal siparişler sürekli orta/yüksek görünmesi
- Kullanıcının etiketi yanlış anlaması

---

## 6. AI Ops Summary Acceptance

## 6.1 Temel Akış
- [ ] Dashboard üzerinde AI summary görünür
- [ ] Summary kısa ve okunabilir
- [ ] Insights maddeleri aksiyon odaklı
- [ ] Anomaly alanı varsa gerçekten anlamlı

## 6.2 Kalite
- [ ] Summary tekrar eden boş cümlelerden oluşmuyor
- [ ] Insights metriklerle uyumlu
- [ ] Anomaly listesi yoksa boş ama düzgün davranıyor
- [ ] Summary “dashboard’daki sayıları tekrar eden” değersiz bir blok değil

## 6.3 Fallback
- [ ] AI unavailable ise sade fallback var
- [ ] Kullanıcı summary’nin neden gelmediğini anlayabiliyor
- [ ] Deterministik dashboard yine çalışıyor

## 6.4 Başarı Sinyali
Bu alan başarılıysa kullanıcı şunu hisseder:
- “Dashboard’a bakınca sistem bugün neye odaklanmam gerektiğini söylüyor”

## 6.5 Red Flags
- Genel ve boş cümleler
- Tüm gün aynı kalan anlamsız summary
- Metriklerle uyumsuz insight
- AI kapalıyken kırık veya boş bir kart

---

## 7. Stock Risk Forecast Acceptance

## 7.1 Temel Akış
- [ ] AI stock risk yüzeyi ürünlerde/dashboards/alerts içinde görünür
- [ ] `critical` ile `AI risk` farklı gösterilir
- [ ] AI riskin nedeni kullanıcıya açıklanır

## 7.2 Kural Ayrımı
- [ ] Deterministik kritik stok aynı şekilde çalışmaya devam eder
- [ ] AI risk advisory olarak görünür
- [ ] AI risk, kritik stok gerçeği gibi sunulmaz

## 7.3 Kullanışlılık
- [ ] Kullanıcı “neden riskli?” sorusuna cevap alır
- [ ] Risk, gerçek bir ileri uyarı hissi verir
- [ ] Risk yüzeyi gereksiz alarm üretmiyorsa değerli hissedilir

## 7.4 Fallback
- [ ] AI unavailable ise yalnızca deterministic kritik/warning kalır
- [ ] Ürün akışı bozulmaz

## 7.5 Başarı Sinyali
Bu alan başarılıysa kullanıcı şunu hisseder:
- “Sistem kritik olduktan sonra değil, kritik olmadan önce beni uyarıyor”

## 7.6 Red Flags
- AI risk ile kritik stok aynıymış gibi gösterilmesi
- Çok fazla false positive
- Risk nedeni olmadan yalnızca rozet gösterilmesi

---

## 8. Purchase Copilot v1 Acceptance

## 8.1 Temel Akış
- [ ] Purchase suggestion kartlarında AI katkısı görünür
- [ ] Deterministik öneri ile AI açıklaması ayrışır
- [ ] Confidence ve reason görünür
- [ ] Kullanıcı önerinin neden çıktığını anlayabilir

## 8.2 Davranış
- [ ] Sistem yalnızca öneri/draft seviyesinde kalır
- [ ] Otomatik resmi satın alma aksiyonu oluşmaz
- [ ] “Neden şimdi?” ve “neden bu kadar?” sorusuna cevap verilir

## 8.3 Kullanışlılık
- [ ] Öneriler gereksiz yapay zeka süsü gibi hissettirmez
- [ ] Kullanıcıya zamanlama ve öncelik hissi verir

## 8.4 Fallback
- [ ] AI unavailable ise deterministic suggestion tek başına görünür
- [ ] Ürün bozulmaz

## 8.5 Başarı Sinyali
Bu alan başarılıysa kullanıcı şunu hisseder:
- “Sistem bana ne almam gerektiğini değil, neden bunu önerdiğini de söylüyor”

## 8.6 Red Flags
- Deterministik öneri kayboluyor veya anlaşılmıyor
- AI açıklaması boş/jenerik
- Kullanıcı resmi aksiyon oluştuğunu sanıyor

---

## 9. Recommendation Lifecycle Acceptance

## 9.1 Temel Akış
- [ ] AI önerileri saklanıyor
- [ ] Kullanıcı öneriyi kabul edebiliyor
- [ ] Kullanıcı öneriyi reddedebiliyor
- [ ] Kullanıcı öneriyi düzenleyebiliyorsa bu state korunuyor

## 9.2 İzlenebilirlik
- [ ] Öneri state’i izlenebilir
- [ ] AI önerisi ile kullanıcı kararı ilişkileniyor
- [ ] Audit veya benzeri iz düşümü mantıklı

## 9.3 Ürün Değeri
- [ ] AI önerileri “bir kere gösterilip kaybolan metin” gibi değil
- [ ] Öneriler ürünün parçası gibi hissediyor

## 9.4 Başarı Sinyali
Bu alan başarılıysa kullanıcı şunu hisseder:
- “AI bana öneri verdi, ben de bununla gerçek bir karar aldım”

## 9.5 Red Flags
- Öneri state’i kayboluyor
- Kabul/red davranışı izlenmiyor
- AI recommendation lifecycle ürün içinde belirsiz

---

## 10. Graceful Degradation Checklist

Bu bölüm tüm AI yüzeyleri için ortak olarak kontrol edilmelidir.

- [ ] AI unavailable olduğunda hiçbir sayfa kırılmıyor
- [ ] Kullanıcı AI’ın neden görünmediğini anlayabiliyor
- [ ] Ürün deterministik çekirdekle çalışmaya devam ediyor
- [ ] Sessiz failure yok
- [ ] AI eksikliği “bug” gibi değil “özellik şu an kullanılamıyor” gibi hissediyor

---

## 11. Teknik Kabul Kriterleri

- [ ] AI route’ları contract bazında stabil
- [ ] Confidence / reason / fallback response shape tutarlı
- [ ] AI unavailable testleri geçiyor
- [ ] Deterministik çekirdek AI yüzünden değişmiyor
- [ ] Kritik operasyonlarda AI yalnızca advisory kalıyor

---

## 12. Test Sonucu Özeti Şablonu

Her acceptance turu sonunda aşağıdaki özet çıkarılmalıdır:

### Stage 2A Acceptance Summary
- Import Intelligence: `PASS | PARTIAL | FAIL`
- Order Review Risk: `PASS | PARTIAL | FAIL`
- AI Ops Summary: `PASS | PARTIAL | FAIL`
- Stock Risk Forecast: `PASS | PARTIAL | FAIL`
- Purchase Copilot v1: `PASS | PARTIAL | FAIL`
- Recommendation Lifecycle: `PASS | PARTIAL | FAIL`

### En Güçlü AI Yüzeyleri
- ...

### En Zayıf AI Yüzeyleri
- ...

### Acil Tuning Gerektiren Alanlar
- ...

### Sonraki Faz İçin Hazır mı?
- `Evet`
- `Kısmen`
- `Hayır`

---

## 13. Exit Criteria

Stage 2A tamamlandı sayılmak için:
- Import Intelligence en az `PARTIAL`, tercihen `PASS`
- Order Review Risk en az `PASS`
- AI Ops Summary en az `PARTIAL`, tercihen `PASS`
- Stock Risk Forecast en az `PARTIAL`
- Purchase Copilot v1 en az `PARTIAL`
- Tüm AI yüzeylerinde graceful degradation `PASS`

Eğer graceful degradation `FAIL` ise bu faz tamamlanmış sayılmaz.

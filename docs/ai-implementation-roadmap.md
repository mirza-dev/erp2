# AI Implementation Roadmap
Status: Proposed  
Depends On: `domain-rules.md`, `implementation-roadmap.md`, `docs/ai-strategy.md`  
Last Updated: 2026-03-25  
Phase: Stage 2A — AI-First Delivery Plan

## 1. Amaç
Bu belge, `docs/ai-strategy.md` içinde tanımlanan AI fazını uygulanabilir iş paketlerine böler.

Hedef:
- AI katmanını kontrollü ve ürün değerini artıracak şekilde devreye almak
- Domain kuralları ile çelişmeyen, açıklanabilir bir AI yüzeyi kurmak
- Konuşmalı copilot öncesi gömülü AI yüzeylerini tamamlamak

---

## 2. Faz Stratejisi

Bu fazda AI aşağıdaki sırayla ürünleşir:

1. Import Intelligence
2. Order Review Risk hardening
3. AI Ops Summary stabilization
4. Stock Risk Forecast
5. Purchase Copilot v1
6. Recommendation lifecycle + feedback

Temel kural:
- önce değer üreten gömülü AI
- sonra açıklama ve güven
- en son öğrenme/farklılaşma katmanı

Konuşmalı copilot bu belge kapsamı dışındadır.

---

## 3. Sprint Planı

## Sprint 1: Import Intelligence + Review Signals
Amaç:
- AI’ı kullanıcıya ilk kez net değer üreten bir yüzeyde göstermek

Kapsam:
- import parse doğruluğu
- entity extraction
- import preview confidence
- unmatched field handling
- order review risk görünürlüğü

Yapılacaklar:
- import parse akışını netleştir
- AI parse sonucunu structured hale getir
- confidence + reason + unmatched fields standardize et
- order detail ve order list üzerinde risk etiketini açıklanabilir hale getir
- düşük confidence durumları için review UX güçlendir

Çıktı:
- kullanıcı belge yüklediğinde AI neden ne çıkardığını anlar
- sipariş risk etiketi ürün içinde daha anlamlı görünür

Risk:
- AI parse çıktısı ile import draft akışı birbirinden kopuk kalabilir

Başarı kriteri:
- import ekranı “demo parse” değil “reviewable AI parse” hissi verir
- order risk etiketi nedenleriyle birlikte görünür

---

## Sprint 2: AI Ops Summary
Amaç:
- dashboard’u karar destek yüzeyine dönüştürmek

Kapsam:
- AI daily summary
- action-oriented insights
- anomaly surfacing
- graceful degradation

Yapılacaklar:
- ops summary metric input’larını stabilize et
- özet, insight ve anomaly alanlarını UI’da doğru sun
- AI unavailable fallback’i temizle
- summary’nin hangi verilere baktığını görünür kıl

Çıktı:
- dashboard üstünde günlük yönetici özeti
- manuel dashboard tarama ihtiyacı azalır

Risk:
- summary faydalı değil, genel/geçiştirici hissedebilir

Başarı kriteri:
- özet kısa, aksiyon odaklı ve tekrar üretilebilir olur

---

## Sprint 3: Stock Risk Forecast
Amaç:
- deterministik kritik stoktan önce AI risk sinyali üretmek

Kapsam:
- AI stock risk scoring
- explanatory risk surfaces
- affected demand context

Yapılacaklar:
- mevcut stock metriklerinden AI input katmanı üret
- AI risk ile deterministic critical’i görsel olarak ayır
- neden risk çıktığını ürün bazında göster
- ilgili order/coverage bağlamını görünür kıl

Çıktı:
- kullanıcı yalnızca kritik stoğu değil, yaklaşan riski de görür

Risk:
- AI risk ile gerçek kritik durum birbirine karışabilir

Başarı kriteri:
- ürün listesi ve dashboard’da “AI risk” ile “kritik” farklı ve anlaşılır görünür

---

## Sprint 4: Purchase Copilot v1
Amaç:
- deterministik satın alma önerilerini AI açıklaması ve önceliği ile zenginleştirmek

Kapsam:
- purchase reasoning
- urgency and timing explanation
- draft-oriented action flow

Yapılacaklar:
- deterministic suggestion ile AI reasoning’i birleştir
- öneri kartlarında neden, ne kadar, ne zaman bilgisini netleştir
- confidence alanını purchase UI’ya taşı
- taslak aksiyon akışı için net CTA üret

Çıktı:
- purchase önerileri statik değil, açıklayıcı hale gelir

Risk:
- AI ile deterministic planning motoru birbirine karışabilir

Başarı kriteri:
- suggestion kartı kullanıcıya “neden şimdi” sorusunun cevabını verir

---

## Sprint 5: Recommendation Lifecycle + Feedback
Amaç:
- AI’ı tek seferlik çıktı değil, izlenebilir ürün davranışı haline getirmek

Kapsam:
- recommendation persistence
- accept/edit/reject flows
- AI feedback capture
- auditability

Yapılacaklar:
- `ai_recommendations` ve `ai_feedback` modeli ekle veya netleştir
- accepted / edited / rejected lifecycle’ını ürün içinde görünür kıl
- hangi önerilerin işe yaradığını izle
- AI sonuçları ile kullanıcı kararlarını bağla

Çıktı:
- ürün AI çıktılarından öğrenmeye hazır hale gelir

Risk:
- ürün içinde AI state dağınıklaşabilir

Başarı kriteri:
- AI önerisi yalnızca görünmekle kalmaz, yaşam döngüsü kazanır

---

## 4. Modül Bazlı Uygulama Sırası

### Önce
- import
- orders
- dashboard summary

### Sonra
- products / stock
- purchase suggestions

### En Son
- AI recommendation persistence
- feedback and analytics

---

## 5. Teknik Çalışma Alanları

Bu fazda en çok etkilenecek alanlar:
- `src/lib/services/ai-service.ts`
- `src/app/api/ai/*`
- `src/app/dashboard/import/*`
- `src/app/dashboard/orders/*`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/products/*`
- `src/app/dashboard/purchase/suggested/*`
- `src/lib/api-mappers.ts`
- AI metadata taşıyan entity ve type dosyaları

---

## 6. Ortak Teknik Kurallar

### 6.1 Structured Output First
AI route veya servisleri yalnızca serbest metin üretmemeli.
Her AI yüzeyi yapılandırılmış veri üretmeli.

### 6.2 Graceful Degradation
AI unavailable ise:
- API güvenli fallback dönmeli
- UI kırılmamalı
- kullanıcı neyin eksik olduğunu anlayabilmeli

### 6.3 Deterministic vs AI Separation
Şu ayrım korunmalı:
- sistem gerçeği
- AI tahmini
- AI önerisi

### 6.4 Persist Only Useful AI Metadata
AI sonucu saklanıyorsa şu alanlar mümkünse standardize olmalı:
- confidence
- ai_reason
- model_version
- generated_at

---

## 7. Done Kriterleri

Bir sprint tamamlandı sayılmak için:
- kullanıcıya görünür değer üretmeli
- AI açıklanabilir olmalı
- AI unavailable fallback’i çalışmalı
- domain-rules ile çelişmemeli
- sahte otorite üretmemeli

Tüm Stage 2A tamamlandı sayılmak için:
- import intelligence ürün içinde güven verir
- order risk açıklanabilir olur
- dashboard AI özeti değer üretir
- stock risk tahmini görünür hale gelir
- purchase önerileri AI ile zenginleşir
- recommendation lifecycle izlenebilir olur

---

## 8. Sonraki Faz İçin Çıktı

Bu roadmap tamamlandığında proje şunlara hazır olur:
- conversational copilot
- AI-driven approval assist
- daha gelişmiş anomaly detection
- user feedback based refinement
- role-based AI experiences

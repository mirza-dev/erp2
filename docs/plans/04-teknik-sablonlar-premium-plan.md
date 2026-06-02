# Teknik Şablonlar — Premium Ürün Kataloğu Planı

Status: Proposed
Last Updated: 2026-06-02
Scope: Faz 1 + Faz 2
Primary Routes:
- `/dashboard/settings/product-types` → yeni görünen ad: **Teknik Şablonlar**
- `/dashboard/settings/product-types/[id]` → teknik şablon detay/yönetim
- `/dashboard/products`
- `/dashboard/products/[id]`
- AI import/classify/extract akışları

## 1. Karar Özeti

Bu modül kaldırılmayacak. Mevcut altyapı, ürün katalog standardizasyonu ve AI import doğruluğu için değerli. Ancak kullanıcıya görünen isim ve ekran kurgusu değişecek.

Ana kararlar:

- Modül adı: **Teknik Şablonlar**
- Eski görünen adlar:
  - `Ürün Tipleri` → `Teknik Şablonlar`
  - `Tip Şablonu` → `Teknik Şablon`
- DB/API isimleri ilk fazda değişmeyecek:
  - `product_types`
  - `product_type_fields`
  - `/api/product-types`
- Amaç: ürün ailelerine göre teknik alanları standartlaştırmak.
- Örnek:
  - Vana → DN, PN/Class, bağlantı tipi, gövde malzemesi
  - Conta → iç çap, dış çap, kalınlık, malzeme
  - Flans → DN, PN/Class, yüz tipi, standart
- Alan ve şablon silme güvenli hale getirilecek:
  - Kalıcı silme yerine pasifleştirme
  - Eski ürün verileri korunur
- Zorunlu teknik alanlar kaydı engellemeyecek:
  - Uyarı verecek
  - Katalog kalite metriklerine yansıyacak
- AI/import kullanıcı onayı olmadan ürüne yazmayacak.
- AI güveni kanıt/snippet tabanlı olacak.

## 2. Ürün Amacı

Teknik Şablonlar modülü, ürün kataloğunun teknik veri standardını yönetir.

Kullanıcı açısından fayda:

- Ürün kartları tutarlı hale gelir.
- Satış ve teklif hazırlarken teknik bilgi eksikleri daha erken görülür.
- AI doküman import ederken hangi alanları arayacağını bilir.
- Ürün karşılaştırma, filtreleme ve raporlama daha güvenilir olur.
- Katalog büyüdükçe serbest metin karmaşası azalır.

Bu modül bir "ayar sayfası" gibi değil, ürün kataloğunun kalite kontrol merkezi gibi davranmalıdır.

## 3. Mevcut Sorunlar

Mevcut ekran ve isimlendirme karışıklıkları:

- `Ürün Tipi` ifadesi iki farklı anlama geliyor:
  - `İmalat / Ticari` gerçek ürün iş tipi
  - `Vana / Conta / Flans` teknik alan şablonu
- Liste ekranı kart yapısında ve operasyonel metrik göstermiyor.
- Kullanıcı hangi şablonun kaç üründe kullanıldığını göremiyor.
- Eksik zorunlu teknik bilgi görünür değil.
- Teknik anahtar yönetimi var ama etki analizi yok.
- Alan silme veri kaybı hissi yaratabilir.
- AI/import bağlantısının kullanıcıya görünen kanıt modeli yok.

Bu plan bu sorunları iki fazda kapatır.

## 4. Yetki Modeli

Teknik Şablonlar ürün yönetiminin parçası kabul edilir.

Önerilen davranış:

- Görme:
  - `view_products`
  - veya `manage_products`
  - veya `manage_product_types`
- Düzenleme:
  - `manage_products`
  - veya `manage_product_types`
  - admin rolleri zaten kapsanır

Beklenen kullanıcı davranışı:

- Ürün ekleyip/düzenleyebilen kullanıcı teknik şablonları da düzenleyebilir.
- Sadece ürün görüntüleyen kullanıcı teknik şablonları okuyabilir ama değiştiremez.
- Yetkisiz kullanıcı sistem ayarlarını göremez/değiştiremez.

Mevcut API permission guard'ları bu karara göre güncellenecek.

## 5. Faz 1 — Teknik Şablonlar Ürünleşmesi

Amaç:

Teknik Şablonlar modülünü güvenli, anlaşılır, katalog kalitesini ölçen ve ürün ekranlarıyla tutarlı çalışan bir yönetim yüzeyine çevirmek.

Faz 1 AI karar verme davranışını değiştirmez; AI/import için sağlam zemin hazırlar.

### 5.1 İsimlendirme ve Navigasyon

Görünen metinler değişir:

- Sidebar / Settings link:
  - `Ürün Tipleri` → `Teknik Şablonlar`
- Ürün oluşturma formu:
  - `Tip Şablonu` → `Teknik Şablon`
- Ürün detay genel sekmesi:
  - `Tip Şablonu` → `Teknik Şablon`
- Boş mesajlar:
  - "Bu ürün için tip şablonu seçilmemiş" → "Bu ürün için teknik şablon seçilmemiş"

DB/API isimleri bu fazda değişmez. Bu bilinçli tercih:

- Migration riski azaltılır.
- Var olan test ve route kontratları korunur.
- Kullanıcıya görünen kavram düzeltilir.

### 5.2 Veri Modeli Güvenliği

Yeni migration:

- `product_types.is_active boolean not null default true`
- `product_type_fields.is_active boolean not null default true`

Davranış:

- Pasif şablonlar yeni ürün oluştururken seçilemez.
- Pasif şablonlar listede varsayılan gizlenir.
- `Pasifleri Göster` toggle ile görünür.
- Eski ürün pasif şablona bağlıysa ürün detayında şablon adı ve `Pasif` rozeti görünür.
- Pasif alanlar ürün formunda görünmez.
- Pasif alanlar şablon detayında ayrı bölümde görülebilir ve tekrar aktif edilebilir.

Kalıcı silme:

- Faz 1'de önerilmez.
- Sistem tipi olsun veya kullanıcı tipi olsun, varsayılan aksiyon pasifleştirme olmalıdır.
- Gerçek silme ileride ayrı bir veri temizlik aracı olarak değerlendirilebilir.

### 5.3 Liste Sayfası — Kompakt Tablo + Metrikler

Yeni liste ekranı kart galerisinden operasyonel tabloya döner.

Üst metrikler:

- Toplam aktif teknik şablon
- Teknik şablon kullanan ürün sayısı
- Şablonsuz ürün sayısı
- Eksik zorunlu teknik bilgisi olan ürün sayısı

Tablo kolonları:

- Şablon
- Kullanılan ürün
- Alan
- Zorunlu alan
- Eksik veri durumu
- Son güncelleme
- Durum
- İşlem

Örnek görünüm:

```text
Teknik Şablonlar

[12 Şablon] [438 Ürün Kullanıyor] [27 Şablonsuz Ürün] [18 Eksik Teknik Bilgi]

Şablon      Ürün   Alan   Zorunlu   Eksik Veri      Durum   İşlem
Vana        128    16     4         12 ürün eksik   Aktif   Düzenle
Conta        64    13     3         Tamam           Aktif   Düzenle
Flans        42     9     3         3 ürün eksik    Aktif   Düzenle
```

Premium davranış:

- Satıra tıklayınca detay sayfasına gider.
- Şablon adı yanında küçük görsel kimlik/ikon korunabilir.
- Eksik veri durumu rozetle gösterilir:
  - Yeşil: tamam
  - Sarı: eksik var
  - Gri: kullanılmıyor
  - Soluk: pasif
- Sağda aksiyonlar:
  - `Düzenle`
  - `Ürünleri Gör`

### 5.4 Liste Metriklerinin Hesaplanması

Gerekli backend davranışı:

- Şablon başına ürün sayısı
- Şablon başına aktif alan sayısı
- Şablon başına zorunlu aktif alan sayısı
- Zorunlu alan eksiği olan ürün sayısı

Tanımlar:

- Bir ürünün teknik şablon kullanması:
  - `products.product_type_id = product_types.id`
- Aktif alan:
  - `product_type_fields.is_active = true`
- Eksik zorunlu alan:
  - Alan `required = true`
  - Alan `is_active = true`
  - Ürünün `attributes` jsonb içinde ilgili `field_key` yok, null, boş string veya boş array

Bu metrikler ilk fazda API üzerinden üretilebilir. İleride gerekirse materialized view veya RPC'ye taşınabilir.

### 5.5 Detay Sayfası — İki Kolonlu Premium Yönetim

Detay ekranı iki ana bölgeye ayrılır.

Ana kolon:

- Şablon bilgileri
- Teknik alan listesi
- Alan ekleme/düzenleme
- Sıralama
- Aktif/pasif yönetimi

Sağ panel:

- Ürün kartı canlı önizlemesi
- Bu şablonu kullanan ürün sayısı
- Eksik zorunlu bilgi sayısı
- İlk birkaç ürün örneği
- `Bu ürünleri gör` linki

Sağ panel amacı:

- Kullanıcı yaptığı değişikliğin ürün kartında nasıl görüneceğini anlar.
- Şablonun canlı kullanım etkisini görür.
- Riskli değişikliklerde daha bilinçli karar verir.

### 5.6 Teknik Alan Yönetimi

Alan eklerken kullanıcı şu bilgileri görür ve düzenler:

- Alan adı
- Teknik anahtar
- Veri tipi
- Birim
- Zorunlu mu?
- Seçenekler
- Placeholder
- Yardım metni

Teknik anahtar davranışı:

- Alan adı yazılınca otomatik öneri üretilir.
  - `Nominal Çap` → `nominal_cap`
  - `PN / Sınıf` → `pn_sinif`
- Kullanıcı teknik anahtarı görebilir ve düzenleyebilir.
- Yeni alanlarda serbest düzenlenebilir.
- Mevcut alanlarda anahtar değişikliği etki analizi gerektirir.

Önemli güvenlik kuralı:

Teknik anahtar değişimi mevcut ürünlerin `attributes` verisini görünmez kılabilir. Bu yüzden mevcut alanlarda teknik anahtar değişimi doğrudan yapılmamalı veya güçlü uyarı ile yapılmalıdır.

Faz 1 önerisi:

- Yeni alanlarda teknik anahtar düzenlenebilir.
- Mevcut alanlarda teknik anahtar düzenleme ilk aşamada kilitli veya ayrı "anahtar değiştirme" akışı ile yapılır.
- Eğer düzenleme açılırsa:
  - Eski anahtar kaç üründe dolu gösterilir.
  - Kullanıcıya "değerleri yeni anahtara taşı" seçeneği gerekir.

Bu taşıma davranışı Faz 1 kapsamına alınacaksa ayrı testlenmelidir.

### 5.7 Alan Pasifleştirme

Alan silme yerine pasifleştirme yapılır.

Davranış:

- `Sil` butonu metinsel olarak `Pasifleştir` olabilir.
- Pasifleştirilen alan:
  - Ürün oluşturma/düzenleme formunda görünmez.
  - Ürün teknik özellikler görüntüsünde görünmez.
  - Şablon detayında `Pasif Alanlar` bölümünde görünür.
  - Tekrar aktif edilebilir.

Veri:

- Ürünlerin `attributes` içindeki eski değerleri korunur.
- Pasif alan tekrar aktif edilirse eski değerler tekrar görünür.

Etki uyarısı:

```text
Bu alan 18 üründe dolu. Pasifleştirirsen ürün kartlarında görünmeyecek,
ama veri korunacak ve alan tekrar aktif edilirse geri görünecek.
```

### 5.8 Şablon Pasifleştirme

Şablon silme yerine pasifleştirme yapılır.

Davranış:

- Aktif şablon:
  - Yeni ürünlerde seçilebilir.
  - Ürün detayında normal görünür.
- Pasif şablon:
  - Yeni ürünlerde seçilemez.
  - Eski ürünlerde görünmeye devam eder.
  - Ürün detayında `Pasif şablon` rozeti gösterilir.
  - Liste ekranında varsayılan gizlenir.
  - Toggle ile görünür.

Etki uyarısı:

```text
Bu şablon 42 üründe kullanılıyor. Pasifleştirirsen yeni ürünlerde seçilemez,
ama mevcut ürünlerdeki bağlantı ve teknik bilgiler korunur.
```

### 5.9 Zorunlu Alan Uyarıları

Zorunlu teknik alanlar ürün kaydını engellemez.

Davranış:

- Ürün oluşturma/düzenleme ekranında eksik zorunlu alanlar uyarı verir.
- Kullanıcı yine kaydedebilir.
- Ürün detayındaki Teknik Özellikler sekmesinde eksik zorunlu alanlar belirgin görünür.
- Liste metriklerinde eksik zorunlu alan sayısı görünür.

Neden kaydı engellemiyoruz:

- Mevcut ürünlerde teknik veri eksik olabilir.
- Operasyonel akışlar teknik bilgi tamamlanmadan da ilerlemek zorunda kalabilir.
- Ama sistem eksikleri görünür kılarak katalog kalitesini artırır.

### 5.10 Ürün Oluşturma ve Ürün Detayı Entegrasyonu

Ürün oluşturma:

- `Teknik Şablon` alanı aktif şablonları listeler.
- Pasif şablonlar yeni ürün için görünmez.
- Şablon seçilince sadece aktif alanlar açılır.
- Eksik zorunlu alan varsa uyarı gösterilir.

Ürün detay:

- Genel sekmede `Teknik Şablon` adı gösterilir.
- Teknik Özellikler sekmesinde aktif alanlar gösterilir.
- Pasif şablona bağlı ürünlerde rozet:
  - `Bu teknik şablon pasif`
- Şablon yoksa:
  - `Teknik şablon seç` aksiyonu görünür.

### 5.11 API ve Backend Değişiklikleri

Etkilenen API'ler:

- `GET /api/product-types`
- `POST /api/product-types`
- `PUT /api/product-types`
- `GET /api/product-types/[id]`
- `PATCH /api/product-types/[id]`
- `DELETE /api/product-types/[id]`
- `GET /api/product-types/[id]/fields`
- `POST /api/product-types/[id]/fields`
- `PUT /api/product-types/[id]/fields`
- `PATCH /api/product-types/[id]/fields/[fieldId]`
- `DELETE /api/product-types/[id]/fields/[fieldId]`

Yeni/uyarlanacak davranış:

- GET listesi varsayılan aktifleri döner.
- `?includeInactive=1` pasifleri de döner.
- Field listesi varsayılan aktif alanları döner.
- `?includeInactive=1` pasif alanları da döner.
- DELETE şablon:
  - kalıcı silme yerine `is_active=false`
- DELETE alan:
  - kalıcı silme yerine `is_active=false`
- PATCH ile tekrar aktif edilebilir.

Permission:

- Read: ürün görme yetkisi.
- Mutate: ürün yönetme veya teknik şablon yönetme yetkisi.

### 5.12 Faz 1 Test Planı

Route testleri:

- Viewer ürün şablonlarını okuyabilir.
- Ürün yönetebilen kullanıcı şablon oluşturabilir/düzenleyebilir.
- Yetkisiz kullanıcı mutation yapamaz.
- `GET /api/product-types` pasifleri varsayılan döndürmez.
- `GET /api/product-types?includeInactive=1` pasifleri döndürür.
- `DELETE /api/product-types/[id]` pasifleştirir.
- `DELETE /api/product-types/[id]/fields/[fieldId]` alanı pasifleştirir.
- Pasif alanlar default field listesinde dönmez.

Component/UI testleri:

- Liste sayfası metrikleri render eder.
- Pasifleri göster toggle çalışır.
- Detay sayfası iki kolonlu yapı ve önizleme gösterir.
- Alan pasifleştirme uyarısı çıkar.
- Ürün oluşturma formu yalnız aktif şablonları gösterir.
- Ürün detay teknik sekmesi yalnız aktif alanları gösterir.
- Eksik zorunlu alan uyarısı görünür ama kaydet butonu bloklanmaz.

Regression testleri:

- Mevcut ürün `attributes` verisi alan pasifleştirmede silinmez.
- Pasif alan tekrar aktif edilirse eski değer görünür.
- Pasif şablona bağlı eski ürün kırılmaz.
- API response shape mevcut ürün ekranlarını kırmaz.

Doğrulama:

```bash
npm run lint
npm run test -- product-types
npm run test -- products
npm run build
```

## 6. Faz 2 — AI/Import Teknik Şablon Omurgası

Amaç:

AI import akışını Teknik Şablonlar modeline güvenli, açıklanabilir ve kullanıcı onaylı şekilde bağlamak.

Bu faz kritik sistem davranışı kabul edilir. AI çıktısı ürün verisine doğrudan yazamaz.

### 6.1 AI Temel Kuralları

AI yalnızca sistemde tanımlı aktif teknik şablonlardan seçim yapabilir.

Kurallar:

- Pasif şablon yeni importta önerilmez.
- Pasif alan yeni importta doldurulmaz.
- AI yalnızca ilgili şablonda tanımlı teknik anahtarlara değer yazabilir.
- Uydurma teknik anahtar kabul edilmez.
- AI cevabı whitelist validasyonundan geçmeden UI'ya onaylanabilir veri olarak sunulmaz.
- Kullanıcı onayı olmadan ürün kartına yazılmaz.

### 6.2 AI Import Akışı

Önerilen akış:

1. Kullanıcı doküman yükler.
2. AI dokümanı sınıflandırır.
3. AI aktif teknik şablonlar arasından öneri yapar.
4. AI seçilen/önerilen şablonun aktif alanlarına değer çıkarır.
5. Her alan için kanıt/snippet ve güven seviyesi döner.
6. Kullanıcı sonuçları inceler.
7. Kullanıcı teknik şablonu değiştirebilir.
8. Kullanıcı alanları düzenleyebilir.
9. Kullanıcı `Uygula` dediğinde ürün verisine yazılır.

### 6.3 Kullanıcı Onayı

AI hiçbir zaman otomatik yazma yapmaz.

Onay ekranında gösterilecekler:

- Önerilen teknik şablon
- Şablon güven seviyesi
- Her teknik alan için:
  - Alan adı
  - Teknik anahtar
  - Önerilen değer
  - Güven seviyesi
  - Kanıt/snippet
  - Kullanıcı düzenleme alanı
- Boş bulunan alanlar:
  - `Bulunamadı`

Kullanıcı aksiyonları:

- Şablonu değiştir
- Alan değerini düzelt
- Alanı boş bırak
- Tek tek alanları uygulama dışında bırak
- Tümünü uygula

### 6.4 Güven Seviyesi Modeli

AI güveni "model hissi" değil, kanıt puanı olarak tasarlanır.

Güven seviyeleri:

- `high`
- `medium`
- `low`
- `not_found`

Yüksek güven şartları:

- Kaynak dokümanda açık kanıt/snippet var.
- Değer alan tipiyle uyumlu.
- Select/multiselect ise seçenek listesiyle uyumlu veya normalize edilebilir.
- Çelişkili başka değer yok.

Orta güven:

- Kanıt var ama yorum/normalizasyon gerekiyor.
- Format net değil ama alanla uyumlu.
- Birden fazla olası değer var, en olası seçilmiş.

Düşük güven:

- Kanıt zayıf.
- AI tahmini var ama doğrudan snippet yok.
- Değer alan tipiyle kısmen uyumsuz.

Bulunamadı:

- AI alanı uydurmaz.
- Değer boş döner.
- Kullanıcı isterse manuel doldurur.

Örnek:

```text
DN             50       Yüksek   Kanıt: "DN 50"
PN/Class       300LB    Yüksek   Kanıt: "Class 300"
Gövde          WCB      Orta     Kanıt: "Body: Cast Steel WCB"
Standart       —        Bulunamadı
```

### 6.5 Kanıt/Snippet Kontratı

Her alan önerisi mümkün olduğunca kanıt taşır.

Önerilen output modeli:

```ts
interface AiTechnicalTemplateSuggestion {
  productTypeId: string | null;
  productTypeName: string | null;
  confidence: "high" | "medium" | "low" | "not_found";
  reason: string;
  fields: AiTechnicalFieldSuggestion[];
}

interface AiTechnicalFieldSuggestion {
  fieldKey: string;
  label: string;
  value: string | number | boolean | string[] | null;
  confidence: "high" | "medium" | "low" | "not_found";
  evidenceText: string | null;
  evidenceLocation?: {
    page?: number;
    row?: number;
    column?: string;
  };
  normalizationNote?: string | null;
}
```

Validation:

- `fieldKey` aktif şablondaki aktif alanlardan biri olmalı.
- `value` alan tipine uygun olmalı.
- Select değerleri seçenek listesiyle normalize edilmeli veya düşük güvene düşmeli.
- Evidence yoksa `high` kabul edilmemeli.

### 6.6 AI Prompt Kuralları

AI prompt'u aktif teknik şablonlarla sınırlandırılır.

Prompt bağlamı:

- Aktif şablon listesi
- Her şablonun aktif alanları
- Alan tipleri
- Select/multiselect seçenekleri
- Teknik anahtarlar
- "Uydurma alan üretme" kuralı
- "Kanıt yoksa yüksek güven verme" kuralı
- "Bulunamadıysa null döndür" kuralı

AI cevabı schema validated structured output olmalıdır. Serbest metin kabul edilmemelidir.

### 6.7 Import Review UI

AI sonuç ekranı review-first olmalı.

UI bölümleri:

- Doküman özeti
- Önerilen teknik şablon
- Teknik alan tablosu
- Kanıt paneli
- Güven filtreleri
- Uygula aksiyonu

Önerilen tablo:

```text
Alan          Değer     Güven    Kanıt             Aksiyon
DN            50        Yüksek   "DN 50"           Düzenle
PN/Class      300LB     Yüksek   "Class 300"       Düzenle
Gövde         WCB       Orta     "Body: WCB"       Düzenle
Standart      —         Yok      Bulunamadı        Doldur
```

Güven davranışı:

- Yüksek: normal görünür.
- Orta: sarı dikkat.
- Düşük: açık uyarı.
- Bulunamadı: boş ve manuel doldurulabilir.

### 6.8 Audit ve İzlenebilirlik

AI önerisi ve kullanıcı onayı audit edilecek.

Audit hedefleri:

- AI ne önerdi?
- Hangi teknik şablonu önerdi?
- Hangi alanlara hangi değerleri önerdi?
- Kanıt/snippet neydi?
- Kullanıcı neyi değiştirdi?
- Ürüne hangi değerler uygulandı?

Önerilen audit action'lar:

- `technical_template_ai_suggested`
- `technical_template_ai_applied`
- `technical_template_ai_field_edited`

Audit `after_state` içinde:

- product id
- document id
- selected template id
- suggested values
- applied values
- confidence summary

### 6.9 Backend Güvenlik

AI route veya import apply route'u şu güvenlikleri sağlamalı:

- Pasif şablona yazma yok.
- Pasif alana yazma yok.
- Bilinmeyen teknik anahtara yazma yok.
- Ürün `attributes` sadece whitelist alanlarla patch edilir.
- Kullanıcı onayı olmadan ürün update yok.
- Onay route'u permission guard ile korunur.

### 6.10 Faz 2 Test Planı

AI service testleri:

- Aktif şablonlar prompt'a girer.
- Pasif şablonlar prompt'a girmez.
- Pasif alanlar prompt'a girmez.
- Bilinmeyen fieldKey response validation'da reddedilir.
- Evidence yoksa high confidence reddedilir veya medium/low'a düşer.
- Select alanı options dışı değer alırsa düşük güven veya invalid olur.

Import route testleri:

- AI önerisi ürün verisine otomatik yazmaz.
- Kullanıcı onayı olmadan product update çağrılmaz.
- Onaylı apply yalnız whitelist attributes yazar.
- Pasif şablon apply edilemez.
- Pasif alan apply edilemez.
- Audit kaydı yazılır.

UI testleri:

- AI önerilen şablon görünür.
- Güven seviyesi rozetleri görünür.
- Kanıt/snippet görünür.
- Düşük güvenli alan uyarılı görünür.
- Kullanıcı alanı düzenleyebilir.
- Kullanıcı şablonu değiştirebilir.
- `Uygula` sonrası ürün attributes doğru patch edilir.

E2E/smoke:

- Catalog/datasheet import:
  - AI şablon önerir.
  - Alanları kanıtla doldurur.
  - Kullanıcı onaylar.
  - Ürün detayında teknik özellikler görünür.

## 7. Uygulama Sırası

Önerilen sıra:

### Faz 1 Slice A — İsimlendirme ve Permission

- Görünen metinleri değiştir.
- Navigation label değiştir.
- API permission davranışını ürün yönetimiyle hizala.
- Testleri güncelle.

### Faz 1 Slice B — Migration ve Data Access

- `product_types.is_active`
- `product_type_fields.is_active`
- Query helper'larda aktif/pasif filtreleri.
- Default GET aktif döner.
- `includeInactive` desteği.

### Faz 1 Slice C — Liste Ekranı

- Üst metrikler.
- Kompakt tablo.
- Pasifleri göster toggle.
- Kullanım/eksik veri metrikleri.

### Faz 1 Slice D — Detay Ekranı

- İki kolonlu layout.
- Canlı önizleme.
- Kullanım etkisi.
- Alan pasifleştirme/aktifleştirme.
- Şablon pasifleştirme/aktifleştirme.

### Faz 1 Slice E — Ürün Ekranı Entegrasyonu

- Ürün oluşturma formunda aktif teknik şablonlar.
- Ürün detayında aktif alanlar.
- Pasif şablon rozeti.
- Zorunlu alan uyarıları.

### Faz 2 Slice A — AI Kontrat ve Validation

- Structured output modeli.
- Whitelist validation.
- Evidence/confidence kuralları.

### Faz 2 Slice B — Import Review UI

- Kanıtlı alan tablosu.
- Güven rozetleri.
- Kullanıcı onayı.
- Alan düzenleme.

### Faz 2 Slice C — Apply ve Audit

- Onaylı apply route.
- Ürün attributes whitelist patch.
- Audit kaydı.
- Regression testleri.

## 8. Riskler ve Koruyucu Kararlar

### Risk: Teknik anahtar değişimi eski veriyi görünmez kılar

Koruma:

- Yeni alanlarda serbest.
- Mevcut alanlarda etki analizi.
- Gerekirse "değerleri yeni anahtara taşı" akışı.

### Risk: Alan silme veri kaybı gibi algılanır

Koruma:

- Silme yerine pasifleştirme.
- Eski `attributes` verisi korunur.
- Tekrar aktif edilince görünür.

### Risk: AI uydurma alan yazar

Koruma:

- Aktif field whitelist.
- Unknown fieldKey reject.
- Kullanıcı onayı zorunlu.

### Risk: AI güveni kullanıcıyı yanıltır

Koruma:

- Güven seviyesi kanıt/snippet tabanlı.
- Kanıt yoksa high yok.
- Düşük/orta güven görsel olarak ayrılır.

### Risk: Şablon pasifleştirme eski ürünleri kırar

Koruma:

- Eski ürün bağlantısı korunur.
- Pasif şablon eski üründe gösterilir.
- Yeni ürünlerde seçilemez.

### Risk: Migration history / Supabase manuel apply karışıklığı

Koruma:

- Her migration repo dosyası olarak tutulur.
- SQL Editor yalnız apply aracı olur, source of truth olmaz.
- Apply sonrası schema ve `schema_migrations` birlikte doğrulanır.

## 9. Başarı Kriterleri

Faz 1 başarılı sayılırsa:

- Kullanıcı artık modülü `Teknik Şablonlar` olarak görür.
- Liste ekranı katalog kalite metrikleri verir.
- Detay ekranı alan yönetimi + kullanım etkisi gösterir.
- Şablon/alan pasifleştirme veri kaybı yaratmaz.
- Ürün oluşturma ve ürün detay ekranları aktif şablon/alanlarla tutarlı çalışır.
- Zorunlu alan eksikleri görünür ama operasyonu kilitlemez.

Faz 2 başarılı sayılırsa:

- AI sadece aktif teknik şablonlardan öneri yapar.
- AI sadece aktif teknik anahtarlara değer yazar.
- Her öneri kanıt/snippet ile gelir veya düşük güven/bulunamadı olarak işaretlenir.
- Kullanıcı onayı olmadan ürün verisi değişmez.
- Apply sonrası audit izlenebilir.
- Import edilen ürün teknik özellikleri ürün kartında doğru görünür.

## 10. Kapsam Dışı

Bu planın ilk iki fazında kapsam dışı:

- DB/API isimlerini `technical_templates` olarak rename etmek.
- Kalıcı hard delete aracı.
- Teknik anahtar toplu rename/migration sihirbazı.
- Gelişmiş karşılaştırma ekranı.
- Teknik şablon bazlı fiyat/teklif hesaplama.
- Paraşüt veya muhasebe kayıtlarına teknik alan yazmak.

Bu işler ileride ayrı planlanabilir.

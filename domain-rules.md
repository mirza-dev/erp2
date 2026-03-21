# Domain Rules
Status: Accepted  
Last Updated: 2026-03-20  
Applies To: AI-ERP Micro Kokpit

## 1. Amaç
Bu belge, sistemin operasyonel doğruluğunu koruyan çekirdek kuralları ve AI destekli karar alanlarını tanımlar.

Amaçlar:
- Sipariş, stok, rezervasyon, üretim ve entegrasyon davranışlarını netleştirmek
- Frontend ve backend için ortak doğruluk kaynağı oluşturmak
- AI katmanını faydalı ama güvenli şekilde konumlandırmak
- Sistem büyürken domain karmaşasını azaltmak

Bu belge:
- Sistem gerçeğini tanımlar
- Çelişkili kararları engeller
- Feature geliştirme sırasında referans alınır

---

## 2. Temel Prensipler

### 2.1 System of Record
Aşağıdaki alanlarda sistem deterministik davranır:
- Sipariş durumları
- Stok hareketleri
- Rezervasyon oluşumu ve çözülmesi
- Satılabilir stok hesabı
- BOM bazlı üretim etkileri
- Finansal ve entegrasyon yönü

Bu alanlarda AI nihai karar vermez.

### 2.2 AI as Intelligence Layer
AI şu alanlarda öneri ve açıklama üretir:
- Import parse ve eşleme
- Kritik risk tahmini
- Satın alma önerisi güçlendirme
- Anomali tespiti
- Operasyon özeti
- Önceliklendirme önerileri

AI:
- öneri verir
- güven skoru üretir
- sebep açıklar
- gerektiğinde kullanıcı onayı bekler

### 2.3 Human-in-the-Loop
Aşağıdaki alanlarda kullanıcı onayı gerekir:
- Import sonrası entity oluşturma
- Satın alma önerisinin siparişe dönüşmesi
- Sipariş onayı
- Üretim kaydının tamamlanması
- Kritik override işlemleri

### 2.4 Tek Doğruluk Kaynağı
Aynı kavram için iki ayrı authoritative kaynak tanımlanmaz.
Özellikle:
- Stok için tek operasyon kaynağı ERP’dir
- Sipariş için tek operasyon kaynağı ERP’dir
- Resmi muhasebe/fatura/payment durumu için authoritative kaynak Paraşüt’tür

---

## 3. Çekirdek Domain Kavramları

### 3.1 Ana Entity'ler
- `Customer`
- `Product`
- `InventoryBalance`
- `InventoryMovement`
- `StockReservation`
- `Shortage`
- `SalesOrder`
- `SalesOrderLine`
- `PurchaseSuggestion`
- `ProductionEntry`
- `BillOfMaterials`
- `ImportBatch`
- `ImportDraft`
- `Alert`
- `IntegrationSyncLog`

### 3.2 Kritik Hesaplar
- `on_hand`: fiziksel veya sistemsel mevcut stok
- `reserved`: onaylı siparişler için ayrılmış stok
- `available_now = on_hand - reserved`
- `projected_available`: on_hand + confirmed inbound - reserved - projected demand
- `coverage_days = available_now / avg_daily_outflow`

---

## 4. Orders Domain

### 4.1 Sipariş Durumu Tek Enum Değildir
Sipariş iki eksenli durum modeli kullanır.

#### commercial_status
- `draft`
- `pending_approval`
- `approved`
- `cancelled`

#### fulfillment_status
- `unallocated`
- `partially_allocated`
- `allocated`
- `partially_shipped`
- `shipped`

### 4.2 Neden İki Ayrı Durum Var
Tek status, gerçek operasyon akışını taşımaz.
Örnek:
- Sipariş onaylı olabilir ama henüz allocate edilmemiş olabilir
- Sipariş onaylı olabilir ve kısmi sevk edilmiş olabilir

Bu yüzden:
- ticari onay süreci ayrı
- lojistik/operasyon fulfillment süreci ayrı izlenir

### 4.3 Geçiş Kuralları
#### commercial_status
- `draft -> pending_approval`
- `pending_approval -> approved`
- `draft -> cancelled`
- `pending_approval -> cancelled`
- `approved -> cancelled` yalnızca sevk başlamadıysa mümkündür

#### fulfillment_status
- `unallocated -> partially_allocated`
- `unallocated -> allocated`
- `partially_allocated -> allocated`
- `allocated -> partially_shipped`
- `partially_shipped -> shipped`

### 4.4 Sipariş Onayı
Sipariş `approved` olduğunda:
- rezervasyon motoru çalışır
- satır bazlı allocation yapılır
- varsa shortage kaydı açılır

### 4.5 Sipariş İptali
Sipariş iptal edilirse:
- açık rezervler çözülür
- fulfillment süreci durur
- sevk edilmiş miktarlar geri alınmaz; bunun için iade/ters hareket gerekir

---

## 5. Inventory ve Reservation Domain

### 5.1 Rezervasyon Ne Zaman Oluşur
Hard reservation yalnızca `approved` siparişte oluşur.

Aşağıdaki durumlarda rezervasyon oluşmaz:
- `draft`
- `pending_approval`

### 5.2 Rezervasyon Mantığı
Sipariş onaylandığında her satır için:
- uygun stok varsa rezerv oluştur
- stok yetersizse kısmi rezerv oluştur
- eksik kısım için `Shortage` oluştur

### 5.3 Rezervasyon Ne Zaman Çözülür
Aşağıdaki durumlarda rezerv azaltılır veya kapanır:
- sipariş iptali
- sipariş satır miktarının düşmesi
- sevkiyat
- sipariş satırının silinmesi

### 5.4 Sevkiyat Etkisi
Sevk olduğunda:
- rezerv azaltılır
- gerçek stok çıkışı yapılır
- fulfillment status güncellenir

### 5.5 Satılabilir Stok
Tanım:
`available_now = on_hand - reserved`

Bu hesap:
- UI seviyesinde tahmini değil
- operasyonel gerçekliktir

### 5.6 Hesaplama Stratejisi
Ham hareket toplamı her istekte yeniden hesaplanmaz.

Model:
- `InventoryMovement` ana kayıt
- `StockReservation` ana kayıt
- `InventoryBalance` projection/summary olarak tutulur

Bu projection:
- hızlı okuma sağlar
- transaction içinde güncellenir
- sistem cache’e bağımlı kalmaz

### 5.7 Allocation Sırası
Yeni stok geldiğinde açık demand varsa allocation şu sırayla denenir:
- önce promised date
- sonra business priority
- sonra created_at

Bu sıra sistem ayarı ile ileride değiştirilebilir.

---

## 6. Critical Stock ve Risk Domain

### 6.1 Kritik Seviye İlk Sürümde Deterministik
İlk sürümde kritik ve uyarı mantığı kural tabanlıdır.

#### critical
`available_now <= min_stock`

#### warning
Lead time penceresi içinde `projected_available < 0`

### 6.2 Ek Göstergeler
Her kritik kayıt mümkünse şu verileri taşır:
- `available_now`
- `min_stock`
- `coverage_days`
- etkilenen sipariş sayısı
- lead time
- önerilen aksiyon

### 6.3 AI Risk Katmanı
AI, deterministic kuralları değiştirmez.
AI şu amaçla eklenir:
- bitmeden önce risk öngörmek
- anomali tespit etmek
- açıklama üretmek

Örnek:
- kural bazlı kritik değil
- ama AI 9 gün içinde tükenme riski %78 görüyor
- sistem sarı risk üretir, kırmızı kritik üretmez

---

## 7. Purchase Suggestion Domain

### 7.1 Satın Alma Önerisi Sadece Threshold Bazlı Değildir
Öneri motoru aşağıdaki girdileri kullanır:
- `on_hand`
- `reserved`
- `confirmed_inbound`
- `open_demand`
- `supplier_lead_time`
- `safety_stock`
- `MOQ`
- `order_multiple`

### 7.2 Deterministik Base Formula
Sistem en az şu mantığı desteklemelidir:

- `projected_available_at_lead_time = on_hand + confirmed_inbound - reserved - demand_until_lead_time`
- `target_level = safety_stock + review_window_demand`
- `suggested_qty = max(0, target_level - projected_available_at_lead_time)`

Sonra:
- MOQ uygulanır
- order multiple uygulanır

### 7.3 AI Destek Katmanı
AI aşağıdaki alanlarda deterministic öneriyi güçlendirebilir:
- demand trend adjustment
- supplier delay risk
- seasonal uplift
- customer concentration risk

Ancak:
- AI önerisi deterministic base’i görünmez hale getirmemelidir
- kullanıcı base suggestion ile AI adjustment’ı ayrı görebilmelidir

### 7.4 Öneri Çıktısı
Bir satın alma önerisi en az şunları taşımalıdır:
- ürün
- önerilen adet
- öneri nedeni
- risk seviyesi
- hangi siparişleri etkilediği
- supplier/lead time context
- confidence varsa AI confidence

---

## 8. Production Domain

### 8.1 İlk Sürüm Üretim Modeli
İlk sürümde production entry, üretim tamamlanması mantığıyla çalışır.

Üretim kaydı onaylandığında:
- finished good stoğu artar
- raw material stoğu BOM’a göre düşer

### 8.2 BOM Zorunluluğu
Bir finished good üretim kaydı için BOM bulunmalıdır.

Her komponent için:
- `consumed_qty = produced_qty * bom_component_qty`

### 8.3 Yetersiz Hammadde
Varsayılan davranış:
- yetersiz hammaddede işlem bloklanır

İleride:
- yetkili kullanıcı override edebilir
- override ayrıca audit log üretir

### 8.4 Scrap / Waste
Sistem ileride fire destekleyebilir.
İlk sürümde opsiyonel alan olarak tasarlanabilir:
- `scrap_qty`
- `waste_reason`

### 8.5 Sipariş İlişkisi
Üretim kaydı opsiyonel olarak bir satış siparişi satırına bağlanabilir.
Amaç:
- hangi üretimin hangi açığı kapattığını izlemek

Üretim tamamlandıktan sonra:
- allocation engine tekrar çalışabilir
- açık shortage varsa yeni stok öncelikle o siparişlere bağlanabilir

---

## 9. Import Domain

### 9.1 Import Sadece Parse Değildir
Import akışı:
- parse
- preview
- user confirmation
- draft entity creation

### 9.2 Doğrudan Approved Entity Oluşmaz
Import hiçbir zaman doğrudan:
- `approved order`
- resmi stok hareketi
- otomatik muhasebe kaydı
oluşturmaz

### 9.3 Önerilen Akış
1. dosya yüklenir
2. parse edilir
3. müşteri eşleştirilir
4. ürün eşleştirilir
5. confidence/reason gösterilir
6. kullanıcı preview inceler
7. sistem `ImportDraft` veya `draft SalesOrder` oluşturur
8. kullanıcı onayı sonrası normal iş akışı devam eder

### 9.4 Saklanması Gerekenler
- orijinal dosya
- parse çıktısı
- confidence
- eşleşmeyen alanlar
- kullanıcı düzeltmeleri
- final mapping

### 9.5 AI Rolü
AI burada güçlü biçimde kullanılabilir:
- müşteri adı eşleme
- ürün adı/SKU eşleme
- satır çıkarımı
- format normalizasyonu
- eksik alan önerisi

Ancak final entity oluşturma kullanıcı onaylıdır.

---

## 10. Paraşüt Sync Domain

### 10.1 Authoritative Source Ayrımı
#### ERP authoritative
- orders
- order lines
- inventory
- reservations
- production
- alerts
- purchase suggestions

#### Paraşüt authoritative
- invoice id / invoice state
- collection/payment state
- resmi muhasebe alanları
- e-fatura/e-arşiv kayıt bilgileri

### 10.2 Çift Yönlü Sync Her Yerde Kullanılmaz
Aşağıdaki alanlarda çift authoritative model kurulmaz:
- stok
- rezervasyon
- sipariş fulfillment

### 10.3 Entity Bazlı Yön
#### customers
- ilk içeri alma Paraşüt’ten olabilir
- operasyonel kullanımda ERP ana kaynak olur
- gerekli alanlar on-demand refresh edilebilir

#### products
- ERP ana kaynak
- Paraşüt’e push edilir

#### invoices
- ERP işlem başlatabilir
- Paraşüt resmi kayıt durumunu geri döner

#### payments
- Paraşüt’ten ERP’ye read/pull

#### stock
- Paraşüt authoritative değildir

### 10.4 Sync Log
Her sync kaydı en az şunları içermelidir:
- entity type
- direction
- status
- requested_at
- completed_at
- external_id
- error_message
- retry_count

### 10.5 AI Rolü
AI burada yalnızca yardımcıdır:
- reconciliation anomaly detection
- sync hata özeti
- mapping önerileri

AI sync yönünü veya muhasebe gerçeğini belirlemez.

---

## 11. AI Layer Kuralları

### 11.1 AI Ne Yapabilir
AI:
- öneri üretir
- eşleme yapar
- risk tahmini yapar
- açıklama yazar
- özet çıkarır
- anomali işaretler

### 11.2 AI Ne Yapamaz
AI tek başına:
- stok gerçeğini değiştiremez
- rezerv oluşturamaz
- rezerv çözemez
- siparişi onaylayamaz
- sevkiyat yapamaz
- resmi muhasebe kaydı oluşturamaz

### 11.3 Açıklanabilirlik
AI çıktısı mümkünse şu alanları taşır:
- `ai_confidence`
- `ai_reason`
- `ai_model_version`
- `ai_inputs_summary`

### 11.4 Override
AI önerisi kullanıcı tarafından:
- kabul edilebilir
- düzenlenebilir
- reddedilebilir

Sistemde mümkünse bu sonuçlar ayrıca tutulur:
- accepted
- edited
- rejected

---

## 12. Alerts Domain

### 12.1 Alert Türleri
İlk sürümde en az şu alert sınıfları olabilir:
- `stock_critical`
- `stock_risk`
- `purchase_recommended`
- `order_shortage`
- `sync_issue`
- `import_review_required`

### 12.2 Alert Kuralı
Alert yalnızca dekoratif değildir.
Bir alert:
- neden oluştuğunu
- neyi etkilediğini
- önerilen aksiyonu
göstermelidir

### 12.3 Alert Durumu
- `open`
- `acknowledged`
- `resolved`
- `dismissed`

### 12.4 Alert Çözümleme
Alert kapatılması mümkünse bir sebep veya bağlı aksiyon ile ilişkilendirilmelidir.
Örnek:
- purchase order created
- stock received
- order cancelled
- manual dismiss

---

## 13. Auditability

### 13.1 Audit Zorunlu Alanlar
Aşağıdaki işlemler audit log üretmelidir:
- sipariş onayı
- sipariş iptali
- rezerv oluşturma/çözme
- sevkiyat
- üretim tamamlama
- import onayı
- satın alma önerisi kabulü
- kritik override
- sync hata ve retry süreçleri

### 13.2 Saklanacak Minimum Audit Bilgisi
- actor
- action
- entity_type
- entity_id
- before
- after
- timestamp
- source (`ui`, `system`, `ai`, `integration`)

---

## 14. Frontend Uygulama Kuralları

### 14.1 Backend Yoksa Bile Sessizlik Olmaz
Frontend:
- görünür aksiyonları sessiz bırakmaz
- ya local state değiştirir
- ya demo/mock davranış gösterir
- ya disabled reason sunar

### 14.2 Kritik Göstergeler
Frontend bu kavramları tutarlı göstermelidir:
- `on_hand`
- `reserved`
- `available_now`
- `critical`
- `warning`
- `AI risk`
- `AI recommendation`

### 14.3 Status Gösterimi
Siparişlerde:
- primary badge = `commercial_status`
- secondary info = `fulfillment_status`

### 14.4 AI Görselleştirme
AI çıktıları kural çıktılarından ayrışmalıdır.
Örnek etiketler:
- `AI Önerisi`
- `Risk Tahmini`
- `Confidence`
- `Neden bu öneri?`

---

## 15. Non-Goals for MVP
İlk sürümde zorunlu olmayanlar:
- çok depo / çok lokasyon optimizasyonu
- gelişmiş MRP
- çok aşamalı work order yönetimi
- otomatik AI-driven approval
- tam çift yönlü master data sync
- yüksek karmaşıklıkta demand forecasting platformu

---

## 16. Bu Belgenin Yorumu
Şüphe durumunda şu sıra uygulanır:
1. operasyonel doğruluk
2. auditability
3. açıklanabilirlik
4. otomasyon
5. AI zenginleştirme

Kural ile AI çelişirse:
- deterministik kural kazanır
- AI öneri olarak kalır

---

## 17. Kısa Karar Özeti
- Sipariş iki eksenli durum modeli kullanır
- Rezerv sadece `approved` siparişte oluşur
- `available_now = on_hand - reserved`
- Kritik seviye ilk sürümde deterministic’tir
- Satın alma önerisi lead time ve supply parametrelerini içerir
- Üretim girişi BOM bazlıdır
- ERP operasyonun source of truth’üdür
- Paraşüt muhasebe/fatura durumunun source of truth’üdür
- Import parse + preview + confirmation + draft creation akışıdır
- AI öneri ve zekâ katmanıdır, sistem gerçeğinin yerine geçmez

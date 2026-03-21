# Implementation Roadmap
Status: Proposed  
Depends On: `docs/domain-rules.md`  
Last Updated: 2026-03-20

## 1. Amaç
Bu belge, `docs/domain-rules.md` içinde tanımlanan operasyonel kuralları uygulamaya geçirmek için geliştirme sırasını, kapsamları ve riskleri tanımlar.

Hedef:
- Frontend ve backend’i aynı domain modeli etrafında toplamak
- MVP için gerekli çekirdeği önce kurmak
- AI katmanını güvenli ve açıklanabilir şekilde eklemek
- Sistemi ileride büyütebilecek temiz bir temel oluşturmak

---

## 2. Genel Strateji

### 2.1 Öncelik Sırası
Aşağıdaki sırayla ilerlenir:
1. Domain kurallarını sabitle
2. Frontend’i bu kurallara hizala
3. Backend core entity ve state modelini kur
4. Inventory/reservation motorunu kur
5. Orders ve fulfillment akışını bağla
6. Alerts ve purchase suggestion engine kur
7. Production akışını bağla
8. Import draft flow kur
9. Paraşüt entegrasyon sınırlarını uygula
10. AI katmanını karar destek olarak ekle

### 2.2 Neden Bu Sıra
Bu sıralama:
- önce sistem doğruluğunu kurar
- sonra kullanıcı yüzeyini düzeltir
- sonra karar destek katmanını ekler
- entegrasyon ve AI’ı sağlam bir çekirdek üstüne oturtur

### 2.3 Kural
AI, çekirdek operasyonel mantıktan önce gelmez.
Önce deterministik sistem kurulur, sonra AI zenginleştirme eklenir.

---

## 3. Fazlar

## Faz 0: Domain Alignment
Amaç:
- Tüm ekip ve araçlar için ortak dil yaratmak

Yapılacaklar:
- `docs/domain-rules.md` dosyasını oluştur ve sabitle
- Domain terimlerini normalize et:
  - on_hand
  - reserved
  - available_now
  - shortage
  - commercial_status
  - fulfillment_status
- Frontend’de bu kavramların nasıl gösterileceğini netleştir

Çıktı:
- Kabul edilmiş domain kuralları
- Çelişkili eski kavramların listesi
- Uyumlandırma planı

Risk:
- Bu adım atlanırsa sonraki tüm işler tekrar revizyona girer

---

## Faz 1: Frontend Stabilization
Amaç:
- Backend eksik olsa bile UI’ı ürünleşmiş ve güvenilir hale getirmek

Kapsam:
- responsive shell
- global feedback sistemi
- mock/demo davranışları
- state açıklığı
- dead CTA temizliği

### Frontend Çalışma Alanları
- `/dashboard`
- `/dashboard/orders`
- `/dashboard/orders/new`
- `/dashboard/orders/[id]`
- `/dashboard/products`
- `/dashboard/purchase/suggested`
- `/dashboard/production`
- `/dashboard/import`
- `/dashboard/alerts`
- `/dashboard/parasut`
- `/dashboard/customers`
- `/dashboard/settings`

### Yapılacaklar
- responsive mobile shell
- global toast/loading/error sistemi
- hiçbir ana buton sessiz kalmayacak
- backend bağımlı aksiyonlar mock veya disabled-reason ile çalışacak
- status ve filter state’leri netleştirilecek
- `commercial_status` ve `fulfillment_status` gösterimi ayrıştırılacak

### MVP Çıktısı
- Ürün frontend olarak kırık görünmez
- Domain kuralları UI’da doğru temsil edilir
- Backend’e geçmeden önce kullanıcı deneyimi stabilize olur

### Sonraya Bırakılabilir
- ileri animasyonlar
- çok detaylı empty state tasarımları
- tam erişilebilirlik rafinasyonu

Risk:
- Frontend mock state’leri daha sonra backend contract ile çakışabilir
Çözüm:
- mock data ve UI state’leri `domain-rules` bazlı kur

---

## Faz 2: Core Domain Model
Amaç:
- Backend için temel veri modelini kurmak

Modüller:
- orders
- order_lines
- products
- customers
- inventory_balances
- inventory_movements
- stock_reservations
- shortages
- alerts
- production_entries
- bills_of_materials
- import_batches / import_drafts
- integration_sync_logs

### Yapılacaklar
- entity sınırlarını belirle
- enum ve status yapılarını sabitle
- id/foreign key ilişkilerini netleştir
- audit alanlarını tanımla
- AI için metadata alanlarını düşün:
  - ai_confidence
  - ai_reason
  - ai_model_version

### MVP Çıktısı
- implement edilebilir temiz veri modeli
- frontend/backoffice uyumlu entity yapısı

### Risk
- Orders ve inventory arası coupling yüksek olabilir
Çözüm:
- reservation ve inventory hareketlerini ayrı entity’ler olarak koru

---

## Faz 3: Orders Engine
Amaç:
- Sipariş yaşam döngüsünü operasyonel olarak doğru kurmak

### Kapsam
- sales order create
- order lines
- commercial status transitions
- fulfillment status transitions
- order detail
- order list filtering

### Yapılacaklar
- `commercial_status` transition kuralları
- `fulfillment_status` transition kuralları
- order create/update/cancel akışları
- order line lifecycle
- shipment öncesi iptal kuralları

### Frontend Impact
- new order form
- order detail ekranı
- order list status filterları
- order summary kartları

### Backend Impact
- order service
- order validation
- status transition guardları

### MVP Çıktısı
- sipariş kaydı güvenilir hale gelir
- frontend artık gerçek backend ile uyumlu olur

### Sonraya Bırakılabilir
- version history
- order revision workflow
- approval matrix

Risk:
- status transition karmaşası
Çözüm:
- explicit transition map kullan

---

## Faz 4: Inventory ve Reservation Engine
Amaç:
- Sistemin en kritik matematiğini güvenilir hale getirmek

### Kapsam
- inventory movements
- inventory balance projection
- stock reservations
- shortages
- reallocation

### Yapılacaklar
- `available_now = on_hand - reserved`
- approved order’da reservation oluştur
- shipment/cancel/update ile reservation çöz
- shortage üret
- yeni stok geldiğinde reallocation dene
- inventory projection stratejisini kur

### Frontend Impact
- dashboard stok kartları
- products sayfası
- alerts
- order detail allocation görünümü

### Backend Impact
- reservation service
- inventory movement service
- balance projection updater

### MVP Çıktısı
- stok ekranı güvenilir olur
- kritik stok ve satın alma altyapısı doğru temele oturur

### Sonraya Bırakılabilir
- çok depo
- lot/serial tracking
- transfer orders

Risk:
- projection ve movement tutarsızlığı
Çözüm:
- projection aynı transaction içinde güncellensin

---

## Faz 5: Critical Stock ve Alerts Engine
Amaç:
- Kural bazlı risk tespiti ve operasyon uyarılarını üretmek

### Kapsam
- critical stock
- warning stock
- shortage alerts
- sync alerts
- import review alerts

### Yapılacaklar
- deterministic critical rule
- deterministic warning rule
- coverage_days hesapları
- alert lifecycle:
  - open
  - acknowledged
  - resolved
  - dismissed

### Frontend Impact
- dashboard AI stok uyarıları
- alerts sayfası
- critical badge’ler

### Backend Impact
- alert generation jobs/services
- alert deduplication
- alert resolution reasons

### MVP Çıktısı
- dashboard gerçekten karar destek vermeye başlar

### Sonraya Bırakılabilir
- complex alert routing
- multi-user ownership
- escalation policies

Risk:
- fazla gürültülü alert üretimi
Çözüm:
- dedupe ve severity mantığı kur

---

## Faz 6: Purchase Suggestion Engine
Amaç:
- Kritik stoktan aksiyona giden zinciri tamamlamak

### Kapsam
- deterministic base suggestion
- lead time aware planning
- MOQ/order multiple
- suggestion reasoning

### Yapılacaklar
- demand_until_lead_time hesapları
- target level hesapları
- suggested quantity hesapları
- supplier parametreleri
- suggestion UI data model

### Frontend Impact
- purchase suggested sayfası
- dashboard öneri linkleri
- alerts içi CTA’lar

### Backend Impact
- purchase suggestion service
- stock planning service
- supplier settings

### MVP Çıktısı
- ürün kritik gösterip bırakmaz, aksiyon önerir

### Sonraya Bırakılabilir
- gerçek purchase order creation
- supplier comparison engine
- AI reorder timing optimization

Risk:
- kötü threshold / lead time dataları yanlış öneri üretir
Çözüm:
- öneri nedenlerini her zaman göster

---

## Faz 7: Production Engine
Amaç:
- Finished good ve raw material ilişkisinin operasyonel olarak doğru kurulması

### Kapsam
- production entry
- BOM consumption
- finished good increment
- raw material decrement

### Yapılacaklar
- BOM modelini kur
- production completion service
- insufficient material guard
- optional scrap support
- order-shortage ilişkilendirme

### Frontend Impact
- production entry form
- stock etkisi preview
- production success feedback

### Backend Impact
- BOM service
- production service
- movement creation logic

### MVP Çıktısı
- üretim ekranı gerçek sistem davranışı kazanır

### Sonraya Bırakılabilir
- work orders
- multi-step routing
- machine/work center planning

Risk:
- BOM veri kalitesi
Çözüm:
- BOM validation ve missing BOM uyarıları

---

## Faz 8: Import Flow
Amaç:
- Import’u sadece parser değil, gerçek operasyon başlangıç noktası yapmak

### Kapsam
- file upload
- parse
- matching
- preview
- confirmation
- draft creation

### Yapılacaklar
- import batch model
- import draft model
- parse result schema
- confidence alanları
- manual correction flow
- draft order creation

### Frontend Impact
- import ekranı
- preview UI
- field correction UI
- manual review states

### Backend Impact
- file storage
- parse pipeline
- mapping persistence
- draft creation service

### MVP Çıktısı
- import sistemi gerçek değer üretir

### Sonraya Bırakılabilir
- mail ingestion
- multi-document batch intelligence
- auto-approve policies

Risk:
- düşük kaliteli parse sonuçları
Çözüm:
- confidence ve human confirmation zorunlu olsun

---

## Faz 9: Paraşüt Integration Boundary
Amaç:
- Entegrasyonu net sınırlarla güvenli hale getirmek

### Kapsam
- sync direction rules
- sync state
- logs
- retry rules

### Yapılacaklar
- authoritative mapping belgele
- customer/product sync stratejisi
- invoice/payment flow ayrımı
- sync log entity
- retry/reconcile görünümü

### Frontend Impact
- parasut sayfası
- sync durumu
- son başarılı sync bilgisi
- hata logları

### Backend Impact
- integration connector
- sync scheduler
- sync log persistence

### MVP Çıktısı
- entegrasyon güvenilir ve açıklanabilir olur

### Sonraya Bırakılabilir
- advanced reconciliation
- conflict resolution UI
- field-level sync policies

Risk:
- yanlış entity için çift yönlü authoritative davranış
Çözüm:
- domain-rules’a birebir bağlı kal

---

## Faz 10: AI Layer
Amaç:
- Sistemi yalnızca kurallı değil, akıllı hale getirmek

### İlk AI Kullanım Alanları
1. Import parse ve mapping
2. Risk enrichment
3. Purchase suggestion enrichment
4. Ops summary
5. Anomaly detection

### Yapılacaklar
- AI output schema standardize et
- confidence/reason/version alanlarını tanımla
- deterministic rule ile AI recommendation’ı ayrı göster
- human approval kapıları ekle

### Frontend Impact
- AI badge/etiketler
- confidence göstergeleri
- “neden bu öneri?” açıklamaları
- AI özet kartları

### Backend Impact
- AI adapter/service layer
- prompt/input pipelines
- output normalization
- audit trail

### MVP Çıktısı
- ürün gerçek fark yaratan zeka katmanını kazanır

### Sonraya Bırakılabilir
- autonomous decisioning
- reinforcement loops
- full demand forecasting engine

Risk:
- AI önerilerinin sistem gerçeği ile karışması
Çözüm:
- `rule result` ve `AI suggestion` ayrı alanlar olarak sunulsun

---

## 4. Modül Bazlı Geliştirme Sırası

### Sıra 1
- domain-rules
- frontend stabilization

### Sıra 2
- orders
- inventory
- reservations

### Sıra 3
- alerts
- purchase suggestions

### Sıra 4
- production

### Sıra 5
- import

### Sıra 6
- parasut integration boundary

### Sıra 7
- AI layer

---

## 5. Frontend Impact Özeti
Frontend tarafında aşağıdaki konseptler her modülde ortaklaştırılmalı:
- dual status rendering
- available_now gösterimi
- deterministic vs AI ayrımı
- loading / success / error / disabled reason
- demo/mock fallback
- mobile-safe layout

En çok etkilenecek ekranlar:
- dashboard
- orders/new
- orders/[id]
- products
- purchase/suggested
- production
- import
- alerts
- parasut

---

## 6. Backend Impact Özeti
Backend tarafında en önemli kararlar:
- explicit domain services
- movement + projection yaklaşımı
- reservation engine
- transition guardları
- integration boundary enforcement
- audit log standardization
- AI output normalization

---

## 7. Migration / Transition Plan

### 7.1 Eğer Şu Anda Sadece Frontend Varsa
- önce state modellerini `domain-rules` ile hizala
- mock data’yı yeni status ve stok kurallarına göre güncelle
- UI’yı yeni terimlerle standardize et

### 7.2 Backend Gelirken
- mock repository/service katmanları gerçek data source ile değiştir
- UI contract’larını bozmamaya çalış
- field isimlerini en baştan doğru seç

### 7.3 Riskli Geçişler
- tek status modelinden dual status modeline geçiş
- basit stok toplamından reservation-aware stok modeline geçiş
- threshold-only suggestion’dan lead-time-aware suggestion’a geçiş

---

## 8. Done Kriterleri

### Bir modül tamamlandı sayılmak için:
- domain-rules ile çelişmeyecek
- frontend state’i doğru gösterecek
- audit ihtiyacı düşünülmüş olacak
- AI varsa deterministic sonuçtan ayrışacak
- sessiz/boş ana aksiyon bırakmayacak

### Tüm MVP tamamlandı sayılmak için:
- order create -> approve -> reserve -> alert -> suggest -> produce/shipment zinciri çalışmalı
- available_now güvenilir olmalı
- import draft flow çalışmalı
- Paraşüt sync yönleri net olmalı
- AI öneri olarak değer katmalı ama çekirdek gerçeği kontrol etmemeli

---

## 9. Karar Prensibi
Bir geliştirme sırasında kararsız kalınırsa şu sıra izlenir:
1. domain-rules ile uyum
2. operasyonel doğruluk
3. açıklanabilirlik
4. auditability
5. UX netliği
6. otomasyon
7. AI zenginleştirme

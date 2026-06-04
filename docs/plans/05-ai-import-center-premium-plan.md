# AI Import Merkezi Premium Planı

_Son güncelleme: 2026-06-03_

## Amaç

AI Import Merkezi, KokpitERP'nin merkezi toplu veri giriş katmanı olacak. Bu katman dosyayı yorumlar, kanıtlı öneri üretir, eşleşme yapar, riskleri gösterir ve yalnız kullanıcı onayından sonra gerçek veriye yazar. AI hiçbir kritik veriyi kullanıcı onayı yerine geçerek uygulamaz.

Ana akış:

`İşlem Türü Seç -> Dosya Yükle -> Oku/Çıkar -> Eşleştir -> Alan Bazlı İncele -> Uygula -> Rapor`

## Ana İlkeler

- AI öneri üretir; gerçek veri yazımı kullanıcı onayıyla yapılır.
- Her import kısmi olabilir. Boş alanlar mevcut veriyi silmez.
- Silme/temizleme ancak kullanıcı açıkça alan temizleme kararı verirse yapılır.
- Riskli veya şüpheli satırlar toplu uygulanmaz.
- Finansal fiyat/maliyet alanları AI Import tarafından ürün kartına yazılmaz.
- Her uygulama eski/yeni değer, kullanıcı, zaman, işlem türü ve kanıtla audit edilir.
- Ürün Tipleri, AI Import'un teknik doğruluk motorudur.

## Desteklenen Dosyalar

- PDF
- Excel/XLSX/XLS
- Word/DOCX
- Mevcut klasik CSV/Excel import bozulmaz; klasik akış fallback olarak kalır.
- DOCX Faz 1'de paragraf ve tablo metni üzerinden okunur. Embedded image/OCR Faz 3 kapsam değerlendirmesine bırakılır.

## İşlem Türleri

Kullanıcı ilk adımda yapılacak işi seçer. Seçilen işlem türü AI prompt'unu, zorunlu alanları, eşleşme kurallarını, uyarıları, yetki kontrolünü ve onay ekranını değiştirir.

### Faz 1

- Yeni ürün oluştur
- Mevcut ürünü güncelle
- Ürün teknik bilgilerini güncelle
- Ürün görseli/galeri/dokümanı ekle
- Ürün sertifika/doküman eşleştir
- Ürün tipi şablonu geliştir
- Ürün tipi teknik anahtar öner
- Ürün tipi standart/sertifika referansı çıkar

### Faz 2

- Stok sayımı
- Stok hareketi
- Müşteri içe aktar/güncelle
- Tedarikçi içe aktar/güncelle
- Tedarikçi ürün ilişkisi güncelle

### Faz 3 Hatırlatma

Faz 3 bu planın uygulama kapsamı değildir. Faz 1-2 tamamlandıktan sonra Faz 3 kapsam preview'i yapılır. Muhtemel başlıklar: custom AI import şablonları, gelişmiş simülasyon, güvenli rollback, ticari kayıtlar, daha geniş belge tipleri ve gelişmiş OCR.

## Faz 1: Ürün Merkezi

AI ürün kartındaki doldurulabilir bilgileri aday veri olarak çıkarır:

- Ürün adı
- SKU
- Manuel SKU
- Sistem SKU önerisi
- Marka/üretici
- Ürün tipi
- Birim
- Açıklama
- Teknik anahtar değerleri
- Ürün dokümanları
- Sertifika/doküman referansları
- Ürün görselleri
- Ana görsel ve galeri

### SKU'suz Yeni Ürün

- Kullanıcı manuel SKU girebilir.
- Sistem geçici SKU önerebilir.
- Geçici SKU ürün sistemde normal kullanılabilir.
- Ürün listesi/detayında ayrıca "Geçici SKU" rozeti gösterilmez.
- Müşteri kendi SKU standardını belirleyince kullanıcı manuel düzenler.

### Kısmi Güncelleme

- Her import ürün kartındaki tüm alanları doldurmak zorunda değildir.
- "Mevcut ürünü güncelle" işleminde yalnız dosyada bulunan ve kullanıcı tarafından seçilen alanlar uygulanır.
- Boş gelen alanlar mevcut değeri silmez.
- Alan temizleme ayrı, açık ve audit edilen bir kullanıcı aksiyonudur.

### Fiyat ve Maliyet

AI Import ürün satış fiyatı, maliyet fiyatı veya ürün finansal fiyat alanlarına yazmaz.

Dosyada fiyat/maliyet yakalanırsa:

- Pasif raporda gösterilir.
- "Bulundu ama AI Import tarafından uygulanmaz" mesajı verilir.
- Uygula checkbox'ı gösterilmez.
- Kullanıcı bu alanları manuel ve kendi yetkileri dahilinde yönetir.

## Ürün Görselleri

Ürünlerde yapı:

- Tek ana görsel
- Galeri

AI Import:

- Sadece gerçek kaynak görselleri kullanır.
- PDF/DOCX/Excel içinden çıkarılabilen veya kullanıcının yüklediği görselleri aday gösterir.
- AI görsel üretmez.
- Sahte/temsili ürün görseli oluşturmaz.
- Önerilen ana görsel belirleyebilir.
- Kullanıcı onaylamadan mevcut ana görsel değişmez.

## Ürün Tipleri Entegrasyonu

Ürün Tipleri sayfası AI Import'un kalite ve teknik standart merkezidir.

Ürün tipi detayında şu bölümler hedeflenir:

- Genel bilgiler
- Teknik anahtarlar
- Alias/eş anlamlılar
- Veri tipi ve birim
- Seçenek listeleri
- Sertifika/standart referansları
- AI önerileri
- Geçmiş/audit

AI burada şunları yapabilir:

- Teknik anahtar önerir.
- Veri tipi önerir: metin, sayı, evet/hayır, seçim, tarih.
- Birim önerir: kg, cm, mm, adet, yıl vb.
- Seçim listesi önerir.
- Alias üretir: "max load", "yük kapasitesi", "taşıma kapasitesi" gibi.
- Benzer/tekrarlı anahtarları birleştirme önerir.
- Sertifika/standart referansı çıkarır.
- Şablon kalitesini denetler.

AI burada da doğrudan kaydetmez. Öneriler durumlu saklanır:

- Bekliyor
- Onaylandı
- Reddedildi
- Pasifleştirildi

Silme yerine pasifleştirme uygulanır. Onaylanan ürün tipi değişiklikleri mevcut ürünlere otomatik uygulanmaz; gelecekteki ürün ekleme/güncelleme ve AI Import doğruluğunu artırır.

Sertifika ve standartlar zorunlu değildir. Eksik belge ürün oluşturma/güncelleme işlemini bloklamaz; yalnız bilgi/öneri uyarısı üretir.

## Faz 2: Stok, Müşteri, Tedarikçi

### Stok

- Stok sayımı varsayılan moddur.
- Stok hareketi ayrıca seçilir.
- Stok importu yalnız miktar, depo/konum ve hareket notu gibi operasyonel alanlara dokunur.
- Maliyet, değerleme veya satış fiyatı yazmaz.
- Dosyada maliyet yakalanırsa pasif uyarı olarak gösterilir.

### Müşteri ve Tedarikçi Eşleştirme

Eşleştirme önceliği:

1. E-posta exact match: yüksek güven.
2. Müşteri/tedarikçi kodu exact match: yüksek güven.
3. Vergi no exact match: yüksek güven ama opsiyonel.
4. Telefon exact match: orta güven.
5. İsim benzerliği: inceleme gerektirir.

### Tedarikçi Ürün İlişkisi

Faz 2'de operasyonel tedarikçi ürün bilgisi desteklenir:

- Tedarikçi ürün kodu
- Lead time
- MOQ/minimum sipariş
- Operasyonel tedarikçi notları

Fiyat/maliyet burada da otomatik yazılmaz; pasif bilgi olarak kalır.

## Güven ve Kanıt Modeli

Her öneri kullanıcıya şu bilgilerle gösterilir:

- Önerilen değer
- Mevcut değer
- Değişiklik türü
- Güven seviyesi
- Neden bu eşleşme önerildi
- Kanıt kaynağı: PDF sayfası, Excel sheet/row/column, DOCX tablo/paragraf
- Deterministik sinyal: SKU+ad, e-posta, kod, telefon, alias eşleşmesi
- AI yorum skoru

AI skoru tek başına karar sebebi değildir. Deterministik eşleşme sinyalleri ve kanıt ayrı gösterilir.

## Onay Modeli

Mevcut kayıt güncellemede alan bazlı onay vardır:

- Eski değer -> yeni değer
- Uygulanacak alan checkbox'ı
- Kanıt
- Uyarı
- Kullanıcı kararı

Yeni kayıtta satır onayı vardır; minimum zorunlu alanlar eksikse kayıt oluşturulmaz.

Satır seçenekleri:

- Önerilen eşleşmeyi kabul et
- Başka kayıtla eşleştir
- Yeni kayıt oluştur
- Satırı atla
- Uyarıyı kabul ederek uygula

Toplu uygula yalnız uyarısız ve hazır satırlar için çalışır.

## Veri Modeli Hedefi

Mevcut `import_documents` / `import_document_lines` korunur; Faz 1-2 boyunca daha genel AI katmanı eklenir.

Planlanan yapılar:

- AI import session/job
- Yüklenen doküman kaydı
- Çıkarılan satır kayıtları
- Alan bazlı öneriler
- Kanıt/evidence kayıtları
- Eşleşme adayları
- Kullanıcı onayları
- Uygulama/audit kayıtları
- Ürün görsel/galeri kayıtları
- Ürün tipi alias ve AI öneri kayıtları

İlk uygulama dilimi migration'sız olabilir: işlem türü `classification` JSON'una taşınır. Kalıcı öneri/audit tabloları Faz 1 veri modeli genişletmesinde migration ile eklenir.

## API/Motor Tasarımı

Tek motor, çok işlem türü:

- Upload
- Parse
- Extract
- Match
- Review
- Apply
- Report

Ürün Tipleri sayfasından başlatılan AI işlemleri de aynı altyapıyı kullanır; yalnız context hazır gelir: "Bu ürün tipi için şablon geliştir."

Apply aşaması idempotent ve transaction güvenli olmalıdır. Kısmi hata varsa başarılı satırlar ve hatalı satırlar ayrı raporlanır; gizli/env bilgi sızmaz.

## Yetki Modeli

AI Import ekranı import yetkisi ister.

Uygulama aşamasında ayrıca işlem türüne göre yetki aranır:

- Ürün işlemi: ürün ekleme/düzenleme yetkisi
- Ürün tipi işlemi: ürün tipi düzenleme yetkisi
- Stok işlemi: stok yetkisi
- Müşteri işlemi: müşteri yetkisi
- Tedarikçi işlemi: tedarikçi yetkisi

Admin tüm işlem türlerini görür. Diğer kullanıcı yalnız yetkili olduğu import türlerini görür ve uygular.

## UI Kabul Kriterleri

Import Merkezi premium ama operasyonel kalır:

- Net işlem türü seçimi
- Dosya yükleme alanı
- Adım göstergesi
- Kompakt tablo
- Satır durumları
- Alan bazlı diff
- Kanıt paneli
- Uyarı filtreleri
- Güvenli toplu uygula
- Final rapor

Final rapor şunları gösterir:

- Oluşturulan kayıtlar
- Güncellenen kayıtlar
- Atlanan satırlar
- Uyarılar
- Hatalar
- Uygulanan alanlar
- Pasif yakalanan fiyat/maliyet bilgileri

## Test Planı

Faz 1:

- PDF/Excel/DOCX parse.
- İşlem türü seçimi classify/extract bağlamına taşınır.
- SKU yoksa manuel + sistem SKU önerisi.
- Mevcut ürün eşleştirme SKU + ad benzerliğiyle çalışır.
- Şüpheli eşleşme uyarısı.
- Alan bazlı onay.
- Boş alanlar mevcut veriyi silmez.
- Fiyat/maliyet pasif kalır.
- Görsel adayları ve ana görsel onayı.
- Ürün tipi teknik anahtar/alias kullanımı.
- Ürün tipi AI önerileri.

Faz 2:

- Stok sayımı/hareket modu ayrımı.
- Stok maliyet yazmaz.
- Müşteri/tedarikçi e-posta eşleşmesi.
- Vergi no opsiyonel davranış.
- Tedarikçi ürün ilişkisi.
- Yetkisiz işlem engeli.
- Audit kayıtları.

Doğrulama:

- İlgili Vitest route/service/component testleri.
- Migration drift testleri.
- `npm run lint`
- `npm run build`
- Desktop/mobile görsel smoke.
- Canlıda kontrollü admin smoke.

## Başarı Kriteri

AI Import Merkezi tamamlandığında:

- Merkezi veri giriş noktası olur.
- Ürünleri eksik veya tam veriyle güvenli işler.
- Ürün görseli/galerisi destekler.
- Ürün tiplerinden teknik standardı okur.
- Kullanıcıya neden/güven/kanıt gösterir.
- Finansal fiyat/maliyet alanlarına yazmaz.
- Stok/müşteri/tedarikçiyi Faz 2'de kontrollü işler.
- Her uygulamayı audit olarak saklar.
- AI önerisini asla kullanıcı onayı yerine koymaz.

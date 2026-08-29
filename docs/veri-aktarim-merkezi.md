# Veri Aktarım Merkezi — ne işe yarar, nasıl konumlanır

_Son güncelleme: 2026-08-29_

Bu belge sayfanın **ne olduğunu** ve **neden böyle kurulduğunu** anlatır.
Kullanıcının kendi sözleriyle sorun şuydu: *"bu sayfa benim için çok karışık,
kafamda hiçbir şey yok, nasıl konumlandıracağım."*

---

## Sayfanın iki hayatı

**Kurulum hayatı** (bir kez, yüksek riskli, büyük hacim) — sistemi ilk kez
gerçek veriyle doldurmak. Sıra zorunludur:

1. **Ürün tipleri** — teknik alanları (DN, PN, malzeme…) tanımlar
2. **Ürünler** — katalog; tipler ÖNCE gelmezse teknik alanlar boş kalır
3. **Cariler** — teklif ve sipariş bunlara bağlanır
4. **Tedarikçiler + ürün kodları** — ürünler önce olmalı, bağ ürüne kurulur
5. **Açılış stokları** — sevk edilebilirlik ve kritik stok uyarıları buna dayanır

**Rutin hayat** (sürekli, küçük) — aylık tedarikçi fiyat listesi, dönemsel stok
sayımı, eline geçen bir datasheet veya sertifika.

Sayfa Haziran 2026'ya kadar bunların ikisi için de kurgulanmamıştı; yalnız
"dosyanı bırak, sistem anlar" diyordu. **Kurulum Durumu paneli** (2026-08-29)
sırayı kullanıcı adına düşünür ve gerçek veriden okur — elle işaretlenen bir
kontrol listesi değildir.

---

## İki yol, tek kapı

Dropzone dosya **uzantısına** göre ayırır:

| | **Excel/CSV yolu** | **AI yolu (PDF/görsel)** |
|---|---|---|
| Ne yapar | 6 adımlı sihirbaz: Dosya → Sheet → Kolonlar → Önizleme → Aktarım | Belgeyi sınıflandırır, içinden veri çıkarır, onayla uygular |
| Ölçek | **Toplu** — binlerce satır | **Tek belge** |
| Yazdığı yer | Ürün · Cari · Tedarikçi · Stok | + sertifika/görsel ekleme, tip şablonu önerisi |
| Karakter | Deterministik, maliyetsiz | Olasılıklı, kanıt gösterir, AI tokeni yakar |
| Dosya nereye | Tarayıcıda kalır, sunucuya çıkmaz | Depoya yüklenir |

---

## Kolon eşleştirme nasıl çalışır

Sıra: **hafıza → alias tablosu → AI → "Atla"**

- **Hafıza** (`column_mappings`) — kullanıcının daha önce elle yaptığı
  eşleştirme. "Bu eşleştirmeyi hatırla" **varsayılan açık**; bir kez düzelten
  kullanıcıya bir daha sorulmaz.
- **Alias tablosu** (`IMPORT_ALIAS_FIELD_MAP` → `FALLBACK_FIELD_MAP`) —
  deterministik, maliyetsiz. **Dört klasik tip için tek kaynak buradadır.**
- **AI** — yalnız gerçekten tanınmayan başlıklar için.

### 2026-08-29 dersi: AI'nın örttüğü deterministik kusur

Ölçüldü: sistemin **kendi indirdiği şablonun** 56 kolonundan **10'u (%18)**
kendi alanına dönmüyordu; biri zorunluydu (`"Ürün SKU"`), yani
Tedarikçi-Ürün İlişkisi şablonu elle müdahale olmadan **hiç çalışmıyordu.**

İki kök:

1. **İki normalizer ayrışmıştı.** Alias anahtarları `normalizeImportToken` ile
   yazılmış (`tedarik_suresi_gun`), arama `normalizeColumnName` ile yapılıyordu
   (`tedarik_suresi__gun_`). Noktalama içeren **her** başlık ıskalıyordu:
   `Fiyat (USD)`, `Ağırlık (kg)`, `Br.`, `V.D.`, `Min. Sip.`
2. **Eksik alias kayıtları.**

Kusur görünmüyordu çünkü **AI onu örtüyordu** — eşleşmeyen başlık AI'ya düşüyor,
AI da doğru bağlıyordu. `ANTHROPIC_API_KEY` geçersizleşince (HTTP 401) örtü
kalktı.

**Kural:** eşleştirme katmanı **AI olmadan doğru olmak zorundadır.** AI bir
iyileştirmedir, bir bağımlılık değil. `import-sablon-roundtrip.test.ts` bunu
kilitler — her şablon kolonu kendi alanına dönmezse suite kırmızı yanar.

### Bilinçli olarak eşleştirilmeyenler

Yanlış eşleştirmek eşleştirmemekten **kötüdür**: sessizce yanlış veri yazar,
oysa eşleşmeyen sütun önizlemede görünür uyarı üretir.

| Başlık | Neden eklenmedi |
|---|---|
| `Ölçü` | Vana kataloğunda çoğunlukla DN/ebat demek, ölçü birimi değil |
| `Açıklama` | Fiyat listesinde ürün adı, ürün kartında not — iki yönde de yanlış olabilir |
| `İl` / `Şehir` | Şemada karşılık alan yok (adres serbest metin) |

---

## AI kapalıyken ne olur

`isAIAvailable()` eskiden yalnız env değişkenine bakıyordu; anahtar **dolu ama
geçersiz** olduğunda (401) sistem AI'yı açık sanıyor, her çağrı sessizce boş
sonuca düşüyordu. Artık:

- **Mandal**: 401/403 → AI kapalı işaretlenir. Geçici hatalar (429/5xx/ağ)
  mandalı **kurmaz** — geçici dalgalanma kalıcı arıza gibi gösterilmemeli.
- **`GET /api/ai/health`** üç durumu ayırır: `no_key` · `auth_failed` · `ok`.
- **Hub** AI kapalıyken PDF'i **yüklemez** — depoya satır yazılmaz, token yanmaz,
  kullanıcı sebebi görür.
- **Excel yolu etkilenmez** ve mesaj bunu açıkça söyler.

Anahtar yenilendiğinde süreç yeniden başlar, mandal sıfırlanır, hiçbir kod
değişikliği gerekmez.

---

## Sheet tespiti

Sheet **adına** bakılır (`Urunler`, `Musteriler`, `Stok_Sayimi`…), tutmazsa
kolon başlıklarından skorlanır. Altı gerçekçi senaryonun altısında da doğru tip
bulundu ("Sayfa1", "FİYAT LİSTESİ 2026", "MÜŞTERİLER" dahil).

Tutmadığında sheet eskiden "Desteklenmiyor" damgası yiyordu ve **çıkış yoktu**.
Artık her sheet için **tür seçici** var; "Aktarma" seçeneği kapak/açıklama
sayfalarını dışarıda bırakır.

⚠ Alias eklemek tespiti de etkiler (aynı `mapHeaderToField` skorlanır). Eşit
skor `null` döndürür — aşırı alias belirsizlik üretebilir. Alias eklerken
`import-sablon-roundtrip.test.ts`'in "alias eklemeleri tip tespitini bozmamalı"
bloğu koruma sağlar.

---

## Yetki

`view_import` / `manage_import` yalnız **admin** ve **satınalma** rollerinde.

**Açık soru:** muhasebe cari listesi aktaramıyor, üretim stok sayımı
yükleyemiyor. Kurulumu tek kişi yapacaksa sorun değil; bilinçli karar olmalı.

---

## Kapsam dışı

- **Geçmiş veri göçü** (sipariş / teklif / fatura / tahsilat).
  `SHEET_ENTITY_MAP`'te `Siparisler` / `Faturalar` / `Teklifler` girdileri var
  ama şablonu ve tespiti yok — **yarım bir yol**, bilinçli olarak dokunulmadı.
- **AI çıkarım akışının iyileştirilmesi** — anahtar gelene kadar canlı
  doğrulanamaz.

---

## İlgili dosyalar

| Konu | Dosya |
|---|---|
| Alias tablosu, şablonlar, tespit | `src/lib/import-center.ts` |
| Normalizer (tek kaynak) | `src/lib/supabase/column-mappings.ts` |
| Alan whitelist / zorunlular | `src/lib/import-fields.ts` |
| Aktarım servisi | `src/lib/services/import-service.ts` |
| AI mandalı + probe | `src/lib/services/ai-service.ts` |
| AI durumu (istemci) | `src/lib/ai-health.ts` · `src/app/api/ai/health/route.ts` |
| Kurulum sayaçları | `src/lib/supabase/import-setup-status.ts` · `src/app/api/import/setup-status/route.ts` |
| Hub | `src/app/dashboard/import/page.tsx` |
| Kurulum paneli | `src/components/import/SetupStatusPanel.tsx` |
| Excel sihirbazı | `src/app/dashboard/import/excel/page.tsx` |
| Kilit testler | `src/__tests__/import-sablon-roundtrip.test.ts` · `ai-availability-latch.test.ts` |

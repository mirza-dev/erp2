# PMT Endüstriyel — simülasyon haftası iş emirleri

Beş iş günü. Her gün dört çalışan **aynı anda** çalışır (gerçek bir ofiste
olduğu gibi — aynı veritabanına dokunurlar, birbirlerinin işini görürler).

İşler seed veri setinin hazır senaryolarına oturur:

| Kayıt | Durumu |
|---|---|
| `FWBV-DN400-PN80-PH` | kritik stok (4 adet, acil) |
| `TGAV-150-DN150-WCB` | yakında bitecek (20 adet) |
| `FIT-TEE-DN200-20S` | teslim tarihi geçmiş |
| `CT-PTFE-DN80-PN16` | fiyatı eksik |
| `ORD-2026-0005 / 0008 / 0010 / 0018` | gecikmiş sevkiyat |
| `PO-2026-0003` | 41 gün gecikmiş tedarik |
| `TKL-2026-014` | taslak teklif, **müşterisi boş** |
| `TKL-2026-012` serisi | üç kez revize edilmiş |

Müşteriler: Star Rafineri A.Ş. · Abdi İbrahim İlaç A.Ş. · Enerjisa Üretim
Santralleri · Botaş Doğalgaz İşletmeleri.
Tedarikçiler: China Langge Valve Technology Co., Ltd · PMT Suluova Fabrikası.

---

## Gün 1 — Pazartesi · haftaya başlarken

**Deniz (satış/satın alma).** Hafta başı: açık tekliflerin durumunu çıkar, hangi
müşteriye dönmen gerektiğini belirle. Sonra iki yeni teklif hazırla:
`SIM Akdeniz Enerji` için 10 adet TGAV Gate Vana Class 150 DN150 WCB, ve
`SIM Petkim Rafineri` için 4 adet Fully Welded Ball Valve DN400. İkisini de
kaydet. `TKL-2026-014` taslağına da bak — bir tuhaflık var mı.

**Hasan (üretim).** Hafta sonu vardiyası çalıştı: TGAV Gate Vana Class 150
DN150 WCB'den **20 adet** üretildi, 1 adet hurdaya çıktı. Bunu sisteme gir.
Sonra stok ekranına bak: hangi malzeme bitmek üzere, üretim planı için neyi
haber vermen lazım.

**Sibel (mali işler).** Patron pazartesi toplantısı için haftaya devreden
durumu istedi: kaç açık sipariş var, toplam ne kadar, kaçı gecikmiş, açık teklif
hattı ne durumda. Dashboard'daki özet rakamları listelerdeki kayıtlarla
**çaprazla** — tutuyorlar mı.

**Kerem (mühendislik).** Yeni bir ürün kartı açman gerekiyor: müşteri Class 300
DN200 WCB gövdeli gate vana istedi, katalogda yok. Kartı aç
(kod `SIM-TGAV-300-DN200-WCB`), teknik bilgilerini gir. Sonra Teknik Şablonlar'a
bak: vana tipi için hangi alanlar tanımlı, eksik var mı.

---

## Gün 2 — Salı · teklif siparişe dönüyor

**Deniz.** Akdeniz Enerji teklifi kabul etti. Teklifi gönder, sonra kabul edilmiş
olarak işaretleyip **siparişe çevir**. Sipariş oluştuktan sonra onaya gönder.
Stok yetmiyorsa ne olduğunu gör ve yaz.

**Hasan.** Bugün Fully Welded Ball Valve DN400'den **6 adet** üretildi. Gir.
*Sonra fark et ki yanlış girmişsin — aslında 6 değil 8 adetmiş.* Düzeltmeye
çalış.

**Sibel.** Deniz'in siparişe çevirdiği teklifi takip et: **teklifteki tutar ile
siparişteki tutar aynı mı?** Ara toplam, iskonto, KDV, genel toplam — dördünü de
karşılaştır. Sonra bu ayki ciro rakamını sipariş listesinden doğrula.

**Kerem.** `FWBV-DN400-PN80-PH` kritik seviyede ve yeni sipariş geldi. Ürün
kartına bak: yeniden sipariş eşiği doğru mu, tedarik süresi girilmiş mi,
tedarikçisi tanımlı mı. Gereken düzeltmeleri yap.

---

## Gün 3 — Çarşamba · satın alma zinciri

**Deniz.** Öneriler ekranından satın alma önerilerine bak. Kritik olanlar için
**fiyat talebi (RFQ)** aç, China Langge'ye gönder. Tedarikçiden dönen fiyatları
gir, karşılaştır ve birini seçip **satın alma siparişine** çevir.

**Sibel.** `PO-2026-0003` 41 gündür gecikmiş. Detayına gir, ne olduğunu anla,
tutarını ve tedarikçisini kontrol et. Sonra açık PO'ların toplam tutarını
dashboard'daki "Yoldaki Mal" rakamıyla karşılaştır.

**Kerem.** Tedarikçiler ekranına gir. Hangi ürünü hangi tedarikçiden alıyoruz,
fiyat geçmişi tutuluyor mu, teknik olarak alternatif tedarikçi tanımlanabiliyor
mu — bak ve eksikleri yaz.

**Hasan.** Bugün üretim: Çift Diskli Çekvalf DN150 PN16 WCB'den **12 adet**.
Gir. Sonra Uyarılar ekranına bak: seni ilgilendiren uyarılar hangileri, ne
yapman bekleniyor.

---

## Gün 4 — Perşembe · mal geldi, mal çıkıyor

**Deniz.** Dün açtığın satın alma siparişinin malı geldi. **Mal kabul** yap.
*Tedarikçinin faturası kutunun içinde kalmış, numarasını sonra gireceksin —
şimdilik boş bırak ve devam et.* Kabul bittikten sonra dön ve fatura numarasını
eklemeye çalış (`SIM-FTR-2026-8841`, tarih bugün).

**Hasan.** Akdeniz Enerji siparişi sevk edilecek. Önce eksik kalan malı üret
(TGAV Gate Vana Class 150 DN150 WCB, **10 adet**), sonra siparişin sevke hazır
olup olmadığına bak. Sevk edebiliyorsan et.

**Kerem.** Mal kabulden sonra stok doğru mu kontrol et: gelen miktar gerçek
stoğa yansımış mı, satılabilir stok değişmiş mi, rezervasyonlar ne oldu.

**Sibel.** Sevk edilen siparişin mali tarafını takip et: fatura kesilmiş mi,
kesilmediyse nerede duruyor, tahsilat bilgisi nereye düşüyor. Bir de bu haftaki
alışların (PO) toplam maliyetini çıkar.

---

## Gün 5 — Cuma · hafta kapanışı

**Sibel.** Patron için haftalık mali özet: bu hafta kaç teklif verildi, kaçı
siparişe döndü, ne kadar sevk edildi, ne kadar alım yapıldı, açık alacak durumu.
Eskime raporuna da bak — uzun süredir hareket görmeyen stok var mı. Rapor
indirmeyi dene.

**Kerem.** Uyarı listesini temizle: hâlâ geçerli olanları bırak, çözülmüş
olanları kapat. Sonra bu hafta açtığın/dokunduğun ürün kartlarını gözden geçir —
eksik kalan teknik bilgi var mı.

**Deniz.** Haftayı kapat: hangi teklifler cevapsız, hangi müşteriye dönmen
gerekiyor, hangi sipariş beklemede. Petkim teklifini müşteriye gönder. Bir de
`TKL-2026-012` serisinin neden üç kez revize edildiğine bak.

**Hasan.** Haftalık üretim özetini çıkar: bu hafta ne ürettin, toplam kaç adet,
hurda ne kadar. Sonra stok sayımı yap — sistemdeki rakamla sahadaki rakam
tutuyor mu (sahada `TGAV-150-DN150-WCB`'den **2 adet eksik** çıktı, sistemi
düzelt).

---

## Serpiştirilmiş sürtünme

Bunlar gerçek hayatta olan, sistemi asıl zorlayan durumlar. İş emirlerinin
içine gömülü:

| Gün | Sürtünme | Ne sınıyor |
|---|---|---|
| 1 | Boş müşterili taslak teklif (`TKL-2026-014`) | Yarım kayıt nasıl davranıyor |
| 2 | Yanlış üretim miktarı → düzeltme | Geri alma yolu var mı |
| 2 | Onaya gönderilen siparişte stok yetmiyor | Kısmi tahsis / eksik bildirimi |
| 3 | 41 gün gecikmiş PO | Gecikme takibi işliyor mu |
| 4 | Tedarikçi fatura numarası atlanıyor, sonra ekleniyor | KDV künyesi sonradan tamamlanabiliyor mu |
| 5 | Stok sayım farkı (−2 adet) | Sayım düzeltmesi ve iz kaydı |

**Not:** Çalışanlar bilerek yetki sınırı zorlamaz. Ama işleri gerektirdiği için
duvara toslarlarsa (Hasan'ın ciro raporunu görememesi gibi) bu da kayda geçer.

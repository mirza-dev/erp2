# Gün 5 — Cuma · ham raporlar

> Çalışanların kendi ağzından. Doğrulama Faz 4'te.

---

## Hasan Çelik — hafta kapanışı ve stok sayımı

### Günün işi
Haftalık üretim toplamı **çıkarılamadı** (yalnız bugünün 56 adedi görülebildi).
Stok sayımı: sistemde **48**, sahada **46** (2 eksik) — **düzeltme sisteme
girilemedi**, sistemde hâlâ 48 yazıyor.

### Takıldıkları

**H16 — Stok sayım düzeltmesi girecek HİÇBİR ekran yok** ⚠️⚠️
- Denediği yerler (kendi listesi): ürün detayı → Stok sekmesi *(rakam sadece yazılı, dokunulmuyor)* · Ürün → Düzenle formu *(min stok, günlük tüketim, yeniden sipariş adedi, depo var; **stok adedi kutusu yok**)* · Tedarik / Ticari / Ekler sekmeleri · Ayarlar · Dashboard · Uyarılar · ürün listesi toplu işlem menüsü *(yalnız "Sil")*
- Üretim Girişi'nde adet kutusuna **−2** yazmayı denedi: *"'Kaydet & Stoğu Güncelle' düğmesi tıklanamaz kaldı; +2 yazınca çalışır hale geldi — yani bu ekran stok azaltmaya değil, **sadece eklemeye** izin veriyor."*
- Etki: **tam durdurdu** — *"bugünün asıl işi olan stok sayım düzeltmesini sisteme hiç giremedim."*

> 🔎 **Patron doğrulaması — GERÇEK, ve yine "arka uç var, ekran yok".**
> `recount_stock` RPC **mevcut** (`supabase/migrations/105_recount_stock.sql`),
> `src/lib/supabase/products.ts:406`'dan çağrılıyor — ama tek çağıran
> `src/lib/services/import-service.ts:840`, yani **Excel içe aktarım yolu**.
> Doğrudan bir sayım ekranı yok. Vardiya sorumlusunun 2 adetlik farkı girmesi
> için Excel hazırlayıp import sihirbazından geçmesi gerekiyor.

**H17 — Haftalık üretim geçmişi görünmüyor** *(Gün 1'deki H6'nın tekrarı)*
- Bu haftanın Pazartesi–Perşembe kayıtları yok; "Diğer Günlerin Kayıtları"nda **Haziran'dan 4 eski kayıt** var. *"Haftalık toplamı veremedim."*

**H18 — Tarih kutusuna elle yazınca saçma tarihe dönüyor**
- `2026-08-24` yazdı → kutu **`0024-08-29`** oldu, ekran *"Seçili tarihte üretim kaydı bulunmuyor"* dedi.
- 🔧 **Patron notu:** yerel tarih kutusuna karakter karakter yazmanın bilinen davranışı olabilir (harness tuş vuruşuyla yazıyor, insan genelde takvimden seçer). **Doğrulama gerekiyor** — ama sonuç şu: geçmiş güne gitmenin ikinci yolu da kapandı.

**H19 — Aynı ürün için iki farklı "stok" rakamı**
- Ürün listesi ve Stok sekmesi: **"Stok: 48"** · Üretim Girişi'nde ürün seçilince: **"Mevcut stok: 30 adet"**
- *"Sayım için hangi rakamı esas alacağımı bilemedim."* (48'i esas aldı.)
- 🔧 **Patron notu:** 48 = gerçek stok, 30 = satılabilir (rezerve düşülmüş). İkisi de doğru; kusur **etikette**: üretim ekranı satılabilir stoğu *"Mevcut stok"* diye adlandırıyor.

### Anlamadıkları
- *"Stok sayımını nereden gireceğimi hiç bulamadım, böyle bir ekran var mı yok mu bilmiyorum."*
- *"'Stok' ile 'Satılabilir' rakamlarının neden farklı olduğunu da anlamıyorum (48 ile 30) — hangisi depodaki gerçek sayı, karar veremedim."* **(İkinci kez; Gün 1'de de sormuştu.)**

---

## Sibel Toprak — hafta kapanışı

### Haftalık özet (çıkardığı rakamlar)

| | |
|---|---|
| Teklif | 2 girildi. `TKL-2026-015` ($33.600) gönderildi + kabul edildi · `TKL-2026-016` ($31.200) hâlâ taslak |
| Siparişe dönüşüm | **1/1** — `TKL-015` → `ORD-2026-0030` ($28.000 + KDV $5.600 = $33.600, **hesap doğru**) |
| Sevkiyat | **bu hafta 0.** Sistemdeki 4 "Sevk Edildi" siparişin en yenisi 9 Haziran |
| Mal kabul | 1 PO tam kabul — `PO-2026-0003` (€4.920 + KDV €984 = €5.904), bugün 10:23 |
| Haftalık ciro | $34K, tamamı SIM Akdeniz Enerji satışından |
| Açık sipariş | 10 adet / $194K, 2'si onay bekliyor |
| Yoldaki mal | $62K, 2 açık PO (`PO-2026-0002` $61.440 gerçekten gecikmiş) |

✅ **Eskime Raporu anlaşılır**, bağlı sermaye hem toplamda hem satırda görünüyor.
İmalat 2 SKU (ikisi "Yavaş", $28.030 bağlı sermaye), Ticari 17 SKU (3 "Durgun",
3 "Hareket Yok", "Ölü" yok). En büyük kalem `FWBV-DN400` $212.500, 82 gün.

✅ **Cariler "Toplam Gelir" doğru çalışıyor** — Star Rafineri $134.400 ve Botaş
₺350.400 siparişlerle **birebir örtüştü**; yalnız onaylanmış siparişler
sayılıyor, iptal/bekleyen hariç. *"Mantıklı."*

### Tutmayan rakamlar

**S12 — Tamamlanmış PO hâlâ "Geciken Tedarik" uyarısı veriyor** *(Y5'in yeni örneği)*
- `PO-2026-0003` durumu **"Tamamlandı"**, 6/6 alınmış, mal bugün 10:23'te teslim alınmış — ama Dashboard Kritik Uyarılar'da hâlâ **"Geciken Tedarik: PO-2026-0003 — 41 gün gecikti, tedarikçiyle teyitleşin"** açık/acil duruyor.

**S13 — Eskime raporunda negatif bekleme günü**
- Ticari Eskimesi → `TGAV-150-DN150-WCB`: Son Satış = bugün, **Bekleme = "−1 gün"**. *"Bekleme günü negatif olamaz."*

**S14 — PO notu ile miktar/durum çelişiyor**
- `PO-2026-0004` notu *"İlk parti teslim alındı; bakiye ikinci konteynerde"* diyor ama satırlar **100/100 ve 300/300** (tam alındı), durum "Tamamlandı". *"Gerçekte bakiye mal bekleniyor mu bilemedim."*

### Takıldıkları

**S11 — Satış yapılan müşteri Cariler'de HİÇ YOK** ⚠️⚠️ *(K1'in muhasebe yüzü)*
- 23 carinin tam listesi tarandı; **"SIM Akdeniz Enerji" yok.** Arama kutusuna "SIM" → *"0 müşteri — Arama kriterine uyan müşteri bulunamadı."* "SIM Petkim Rafineri" de yok.
- *"Teklif/sipariş üstünde yazan müşteri adı, kabul edilip siparişe dönüşse bile **Cariler tarafına hiç yansımıyor**."* Sipariş detayında müşteri adı yazıyor ama **tıklanabilir cari linki yok.**
- Etki: **çok** — *"$33.600'lük bir satışın alacak takibini hangi cari üzerinden yapacağım belli değil, bu müşteri için 'Toplam Gelir' hiçbir yerde toplanmıyor."*

**S15 — "Rapor indir" hiçbir şey yapmıyor** *(Hasan'ın H4'ünün ikinci tanığı)*
- İki kez denedi: *"ne bildirim, ne yeni sekme, ne ekranda görünür bir değişiklik."*
- Etki: *"Haftalık raporu patrona dışa aktarıp göndermem gerekiyordu, bu yolla yapamadım."*

**S16 — Teklifler tarih filtresi kutuları etiketsiz**
- Ekranda **"[date] (etiketsiz)"** ve **"[date] —"** olarak görünen iki alan doldurulamadı.
- 🔧 **Patron notu:** hedefleyememek harness'tan, ama *"(etiketsiz)"* ibaresi harness'ın gerçek tespiti: **bu tarih kutularının erişilebilir adı yok.** Ekran okuyucu kullanıcı için de aynı sorun.

**S17 — "Açık Alacak" kartı hiçbir dönem görünümünde yok**
- Bugün/Hafta/Ay/Çeyrek dördü de tarandı; kart yok.
- 🔧 **Patron notu:** **beklenen** — kart Paraşüt'ün tahsilat verisine bağlı, Paraşüt kapalı. Ama Sibel'in ikinci cümlesi geçerli: *"Olsa bile o satış muhtemelen bu karta hiç girmezdi"* — çünkü cari kaydı yok (S11).

### Aklına takılanlar
- PO aktivite loglarında ham **`po_fully_received`** kodu *(Deniz'in D10'unun ikinci tanığı)*
- Bazı PO'larda aktivite geçmişi var (`0003`, `0004`, `0006`), bazılarında hiç yok (`0005`) — **tutarsız**
- Süreç çubuğunda (Taslak→Onaylı→Sevk Edildi) **aşama başına tarih/saat yok**, yalnız "Oluşturulma". *"Geçmiş sevkiyatların hangi gün yapıldığını kesin söyleyemiyorum."*

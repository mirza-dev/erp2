# Gün 4 — Perşembe · ham raporlar

> Çalışanların kendi ağzından. Doğrulama Faz 4'te.

**Günün iki zinciri de kırıldı** — ve ikisi de gerçek. Sevkiyat hiç yapılamadı,
tedarikçi fatura numarası hiç girilemedi.

---

## Hasan Çelik — sevkiyat

### Günün işi
`ORD-2026-0030`'u sevk etmeye çalıştı — **olmadı.** Bugünün üretimini girdi:
`TGAV-150-DN150-WCB` 10 adet, kaydedildi.

### Takıldıkları

**H14 — "Sipariş müşterisiz sevk edilemez" — oysa müşteri ekranda duruyor** ⚠️⚠️⚠️
- Sipariş **"Onaylı"**, lojistik **"Rezerveli"**, ekranda *"Stok ayrıldı, sevkiyata hazır"* yazıyor, müşteri **"SIM Akdeniz Enerji"** olarak görünüyor.
- "Sevket"e bastı → kırmızı uyarı: **"Sipariş müşterisiz sevk edilemez."** Durum değişmedi. **3 kez denedi** (ikisinde tekrar bastı, birinde geri gidip siparişi yeniden açtı), hep aynı.
- Etki: **tam durdurdu** — *"bugünkü asıl görevim sevkiyattı, yapamadım."*

> 🔎 **Patron doğrulaması — GERÇEK ve TESLİMİ ENGELLER.** Veriden okundu:
> ```
> ORD-2026-0030  customer_id: null   customer_name: "SIM Akdeniz Enerji"
>                commercial_status: approved   fulfillment_status: allocated
> TKL-2026-015   customer_id: null   status: accepted
> "SIM" ile başlayan cari sayısı: 0
> ```
> Kod kanıtı: `src/lib/services/order-service.ts:250` — `preflightShipment`,
> `customer_id` boşsa sevki reddediyor. **Kontrolün kendisi doğru** (Paraşüt
> gerçek cari ister). Kusur yukarıda: **teklif serbest metin müşteri adıyla
> açılabiliyor**, cari kaydına bağlanmadan gönderilebiliyor (**stok rezerve
> ediliyor**), kabul edilip siparişe çevriliyor, onaylanıyor, tahsis ediliyor —
> ve ancak sevk anında duvara çarpıyor. Arayüzde onarım yolu görünmüyor.
> **Sonuç: stoğu tutan, asla sevk edilemeyen bir sipariş.** Fabrikada bir
> satışçının yeni müşteri adını doğrudan teklife yazması bunu ilk gün üretir.

**H15 — Uyarı ile Stok sekmesi yine tutmuyor** *(K5/S9'un üçüncü tanığı)*
- Uyarı: **"Mevcut stok 10 adet (min: 10)"** · Stok sekmesi: **STOKTA 38 / SATILABİLİR 20**
- *"İki yer farklı rakam veriyor, hangisi doğru bilemedim."*

---

## Deniz Arslan — mal kabul

### Günün işi
`PO-2026-0003` (Albrecht-Automatik GmbH, `INS-GPR-DN100`, 6 adet, €5.904,00,
beklenen 18.07.2026) için **mal kabul yapıldı**: 6/6 girildi, "Kabulü Kaydet",
PO **Onaylandı → Tamamlandı**, satır "Alındı: 6/6". Stok kontrol: `INS-GPR-DN100`
**Stokta 66 / Satılabilir 66**.

### Takıldıkları

**D8 — Tedarikçi fatura numarası alanı MAL KABUL EKRANINDA HİÇ YOK** ⚠️⚠️
- *"'Mal Kabul Girişi' formunda fatura numarası diye bir alan hiç yok — tek alan 'Alınan:' (miktar). Boş bırakılacak bir kutu olmadığı için sistem izin de vermiyor, uyarmıyor da, engellemiyor da — **konu hiç sorulmuyor.**"*
- Sonradan eklemeyi aradı: Tamamlanmış PO'da yalnız "Yazdır / PDF" var, düzenleme/fatura ekleme düğmesi yok; "Notlar" sabit metin, düzenlenemiyor. Tedarikçi kartında da fatura takibi yok.
- Etki: *"Muhasebeye 'fatura kutuda kaldı, sisteme giremedim, elden takip edin' demem gerekecek — **bu tam da bugünkü işin can alıcı noktasıydı.**"*

> 🔎 **Patron doğrulaması — GERÇEK, ve belgelenen davranışla çelişiyor.**
> Arka uç **hazır**: `src/app/api/purchase-orders/[id]/receive/route.ts:63-84`
> `vendor_invoice_no` / `vendor_invoice_date` alıyor ve doğruluyor;
> `src/lib/services/purchase-order-service.ts:177,193` yazıyor; migration 107
> kolonları taşıyor. **Arayüzde tek satır yok** —
> `grep -rn "vendor_invoice" src/app/dashboard/ src/components/` → **0 sonuç**.
> Paraşüt Faz 13'te arka uç kuruldu, **ekran kurulmadı.**
> **`docs/parasut-golive-runbook.md` §5 bunu yanlış anlatıyor:** *"Tedarikçi
> fatura numarası… ERP'de mal kabul ekranından girilir."* Böyle bir ekran yok.
> Mali müşavire yayımlanan belge de bu cümleyi taşıyor → **düzeltilmeli.**
> Etki: indirilecek KDV'nin resmî künyesi sisteme hiç girilemiyor.

**D9 — Tam kabul edilen PO "Bekleyen Teslimatlar"da kalmaya devam ediyor** *(K6'nın ikinci tanığı)*
- 6/6 kabul edildi, PO "Tamamlandı" — ama Stok sekmesindeki "Bekleyen Teslimatlar" tablosunda hâlâ *"6 adet, 2026-07-18, Albrecht-Automatik GmbH, durum: pending"*. Üstteki **"Bekleniyor: 6"** rakamı da duruyor.
- Etki: *"Bu ekrana bakan biri '6 adet daha yolda' sanabilir, hâlbuki hepsi geldi."*

### Aklına takılanlar
- **D10 — Aktivite geçmişi ham kod gösteriyor:** PO'nun geçmişinde **`po_fully_received`** + yanında bir **UUID** yazıyor. *"Okunaklı bir Türkçe satır ('Mal kabul tamamlandı' gibi) değil, kullanıcıya gösterilmek üzere hazırlanmamış gibi duruyor."*

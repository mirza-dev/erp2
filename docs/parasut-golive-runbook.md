# Paraşüt Entegrasyonu — Go-Live Runbook

**Durum:** kod TAMAM (Faz 1–16), canlı doğrulama BEKLİYOR.
**Teslim yapılandırması:** `PARASUT_ENABLED=false` + `PARASUT_USE_MOCK=true`
→ entegrasyon fabrikada **kapalı** teslim edilir; bu belgedeki adımlar
tamamlanınca açılır.

---

## 0. Neden kapalı teslim ediliyor?

Paraşüt tarafı **gerçek fatura keser** ve kesilen e-belge GİB'e gider — geri
alması ERP'den değil muhasebeden yapılır. Bu yüzden anahtar iki kademeli:

| Anahtar | Kapalı (teslim) | Açık (go-live) |
|---|---|---|
| `PARASUT_ENABLED` | `false` | `true` |
| `PARASUT_USE_MOCK` | `true` | `false` |

**İkisi de gerekli.** Yalnız biri açılırsa sistem çalışmaz (bilinçli):
`PARASUT_ENABLED=true` + mock → sahte belge; `USE_MOCK=false` + disabled →
`parasutApiCall` guard'ı ağa çıkmayı reddeder.

`src/__tests__/parasut-disabled-delivery.test.ts` kapalıyken hiçbir yolun
çalışmadığını sürekli kanıtlar.

---

## 1. Ön koşullar (kullanıcı tarafı — uzun teslim süreli)

- [ ] **Paraşüt API başvurusu.** `destek@parasut.com` adresine yazıp
      geliştirici uygulaması açtırın → `client_id` + `client_secret`.
- [ ] **Redirect URI kaydı.** Aynı başvuruda
      `https://<alan-adi>/api/parasut/oauth/callback` adresini kaydettirin.
      Varsayılan `urn:ietf:wg:oauth:2.0:oob`'dur ve bizim akışımıza uymaz.
      *Kayıt gecikirse:* spec `grant_type=password` akışını da belgeler —
      kayıt gerektirmez ama mevcut start/callback altyapısı authorization_code
      için yazıldı; tercih authorization_code.
- [ ] **Firma ID.** Paraşüt arayüzünde URL'deki sayı → `PARASUT_COMPANY_ID`.
- [ ] **Deneme şirketi (önerilir).** Gate'i gerçek şirkette koşmak istemiyorsanız
      Paraşüt'te ayrı bir şirket açıp `PARASUT_COMPANY_ID`'yi geçici olarak ona
      çevirin.
- [ ] **Mali müşavir bilgilendirmesi.** §5'teki eşleme tablosunu paylaşın.

---

## 2. Ortam değişkenleri

```bash
PARASUT_CLIENT_ID=...
PARASUT_CLIENT_SECRET=...
PARASUT_COMPANY_ID=...
PARASUT_AUTHORIZE_URL=https://api.parasut.com/oauth/authorize
PARASUT_REDIRECT_URI=https://<alan-adi>/api/parasut/oauth/callback

# Go-live anahtarları — ÖNCE gate, SONRA bunlar
PARASUT_ENABLED=true
PARASUT_USE_MOCK=false

# Stok otomatik düzeltmesi — İLK HAFTA KAPALI BIRAKIN
PARASUT_STOCK_AUTOCORRECT=false
```

`CRON_SECRET` zaten kurulu olmalı: OAuth state imzası ve tüm CRON uçları buna
dayanır (yoksa OAuth akışı fail-closed başlamaz).

---

## 3. Sıra

1. **Migration'ları uygula** (Studio SQL editor):
   `107_parasut_purchase_bills.sql` → `108_parasut_payment_status.sql`
   Doğrula: `npx tsx scripts/check-migrations.ts` → 107 ve 108 yeşil.
2. **OAuth bağla:** admin hesabıyla `/dashboard/parasut` → "Paraşüt'e Bağlan".
   `parasut_oauth_tokens` tablosunda satır oluşmalı.
3. **Gate'i salt-okunur koş:** `npm run parasut:gate`
   OAuth + tüm liste filtreleri geçmeli.
4. **Gate'i yazma modunda koş** (deneme şirketinde):
   `npm run parasut:gate -- --write`
   **Kritik madde:** stok invariant'ı. ❌ ise canlıya GEÇİLMEZ.
5. **Anahtarları aç:** `PARASUT_ENABLED=true`, `PARASUT_USE_MOCK=false` → redeploy.
6. **İlk gerçek belge:** küçük tutarlı bir sipariş sevk edin, Paraşüt'te
   irsaliye + fatura + e-belge zincirini gözle doğrulayın.
7. **CRON'ları zamanla** (§4).
8. **Bir hafta yalnız rapor:** `reconcile-stock` çıktısını okuyun. Sapma
   sıfıra yakınsa `PARASUT_STOCK_AUTOCORRECT=true`.

---

## 4. CRON uçları

Hepsi `Authorization: Bearer $CRON_SECRET` ister.

| Uç | Ne yapar | Önerilen sıklık |
|---|---|---|
| `POST /api/parasut/sync-all` | Bekleyen satış faturaları | 15 dk |
| `POST /api/parasut/sync-purchase-all` | Bekleyen alış faturaları | 15 dk |
| `POST /api/parasut/poll-e-documents` | e-belge `trackable_job` durumu | 10 dk |
| `POST /api/parasut/poll-payments` | Tahsilat/ödeme durumu | 1 saat |
| `POST /api/parasut/reconcile-stock` | Stok sapma raporu | günde 1 (gece) |

Mal kabul ve sevk anında zaten best-effort tetik var; CRON'lar **emniyet ağı**.

---

## 5. Mali müşavir için belge eşlemesi

| ERP'de ne olur | Paraşüt'te ne oluşur | Ne zaman |
|---|---|---|
| Satış siparişi **sevk edilir** | Cari (contact) + ürün + **irsaliye** (`inflow=false`) | Sevk anında |
| Aynı sipariş | **Satış faturası** (`shipment_included=false`) | İrsaliyeden hemen sonra |
| Müşteri e-fatura mükellefiyse | **e-Fatura**, değilse **e-Arşiv** | Faturadan sonra, asenkron |
| Satın alma siparişi **tamamen mal kabul edilir** | Tedarikçi cari + **alış faturası** | Mal kabul anında |
| — | **Tahsilat/ödeme** | Paraşüt'te elle; ERP yalnız okur |
| Üretim / stok sayımı / transfer | Paraşüt'e belge gitmez | Gece mutabakatı stoğu eşitler |

**Bilinmesi gerekenler:**

- **Stok Paraşüt'e tek kapıdan girer:** satış irsaliyesi. Fatura, alış faturası
  ve mutabakat dışındaki hiçbir belge stok hareketi yaratmaz. Bu bilinçli —
  aksi halde aynı mal iki kez düşer/artardı.
- **ERP stok otoritesidir.** Paraşüt stoğu gece mutabakatıyla ERP'ye eşitlenir.
  Paraşüt arayüzünden elle yapılan stok düzeltmeleri bir sonraki mutabakatta
  geri alınır — düzeltme ERP'de yapılmalıdır.
- **Tedarikçi fatura numarası KDV indirimi için zorunludur.** ERP'de mal kabul
  ekranından girilir. Boş bırakılırsa fatura yine Paraşüt'e gider ama
  "Alış faturası künyesi eksik" uyarısı açılır → Paraşüt'te tamamlanmalı.
- **Dövizli faturada kur:** ERP, fatura tarihinin TCMB **döviz alış** kurunu
  gönderir. Kur çözülemezse alan gönderilmez ve Paraşüt kendi kurunu uygular.
- **İade/düzeltme ERP'de YOK (v1).** Yanlış sevkiyat olursa düzeltme Paraşüt'te
  elle yapılır, ERP stoğu da elle düzeltilir.
- **Fatura numarası deterministiktir:** `KE` serisi + sipariş numarasından
  türetilen tam sayı. Aynı sipariş iki kez faturalanamaz.

---

## 6. Sorun giderme

| Belirti | Muhtemel neden | Bakılacak yer |
|---|---|---|
| Tüm senkronlar sessizce durdu | OAuth `refresh_token` iptal/expired | Uyarılar → "Paraşüt auth hatası" (critical). Uyarıdaki yeniden-dene OAuth refresh tetikler. |
| "manuel inceleme gerekli" uyarısı | Belge oluşturuldu ama DB yazımı düştü | Paraşüt'te ilgili numarayı ara; varsa ID'yi elle eşle. Mükerrer belge riski var, **otomatik tekrar denemeyin.** |
| Stok sapma uyarısı | ERP ↔ Paraşüt farkı | `reconcile-stock` çıktısındaki SKU listesi. Kalıcıysa autocorrect'i açın. |
| Alış faturası künyesiz | Mal kabulde numara girilmedi | PO detayında künye alanı; Paraşüt'te fatura no'yu tamamlayın. |
| Fatura kesildi ama e-belge yok | `trackable_job` hâlâ `running` veya `error` | Paraşüt sayfası → Loglar; `poll-e-documents` CRON'u çalışıyor mu. |

**Acil kapatma:** `PARASUT_ENABLED=false` → redeploy. Tüm yollar anında ölür,
kesilmiş belgeler Paraşüt'te kalır (oradan iptal edilir).

---

## 7. Bilinçli kapsam dışı (v1)

- İade / iade faturası (ERP'de iade kavramı yok)
- Kısmi sevkiyat faturası
- Çift yönlü senkron (Paraşüt'te elle yapılan cari/ürün değişikliği ERP'ye dönmez)
- Çok depolu stok (tek varsayılan depo)
- e-Defter / BA-BS / beyanname (Paraşüt'ün kendi işi)
- İhracat faturası `item_type: export` (tax_number zorunluluğu nedeniyle)

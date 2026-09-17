# Pilot haftası — yeni müşteriyi ilk teklife kadar taşımak

_Son güncelleme: 2026-09-17. Bu belge bir yordamdır: her yeni müşteride (ilk: PMT
Endüstriyel) aynı sırayla uygulanır. Teknik kurulum [`musteri-kurulum.md`](musteri-kurulum.md)'de;
bu belge **insan tarafını** anlatır — kimin, hangi gün, ne yapacağını._

## Neden böyle

Boş bir sisteme giren kişi ne yapacağını bilmez; 2026-08-29'daki beş günlük çalışan
simülasyonunda dört kişiden hiçbiri Veri Aktarım Merkezi'ni açmadı bile. Ürün artık
üç yerden yol gösteriyor (panodaki **Kurulum 0/8** bandı → 8 adımlı rehber →
boş listelerdeki **"İlk … ekle"** eylemleri), ama pilotun başarısı yine de **Gün 0**'da
belirlenir: ekip sisteme **dolu** girmeli, boş değil.

Bu haftanın amacı özellik tanıtmak değil; ekibin **kendi işini** sistemde bir hafta
yürütmesi ve sürtünmeleri bizim görmemiz.

## Ön koşullar (biz — pilot başlamadan bitmiş olmalı)

Tek komut: `npm run kurulum:dogrula` (kalıcı admin → migration'lar → env matrisi).
Zorunlu sınıfta ❌ varsa pilot başlamaz.

Kullanıcı-tarafı ve dış-servis kalemleri (kod yeşil olsa da bunlar olmadan hafta
yarım kalır — kaynak: `memory/deferred_backlog.md` §B):

| Kalem | Neden pilot için şart |
|---|---|
| `EMAIL_FROM` + `RESEND_API_KEY` (+ `RESEND_WEBHOOK_SECRET`) | Davet e-postası, teklif gönderimi, parola sıfırlama ve 11 uyarı tipi bunsuz **hiç gitmez**; bildirimler `waiting_config`te birikir. |
| `NEXT_PUBLIC_APP_URL` | E-postadaki bağlantılar bu adrese gider; yoksa sabit varsayılan → yanlış hedef, sessiz. |
| `ADMIN_EMAILS` **veya** kalıcı admin | `preflight:auth` 0 admin görürse kimse giremez (brick). |
| Supabase → Auth → Redirect URLs: `<domain>/auth/callback` | Davet ve parola sıfırlama bağlantıları buraya döner; yoksa "requested path is invalid". |
| Supabase → Auth → "Allow new users to sign up" = **OFF** | Davetiye modeli; self-servis kayıt açık kalırsa `/api/seed` gibi uçlar risk. |
| `ANTHROPIC_API_KEY` geçerli (Sistem Durumu'nda "Çalışıyor") | Excel kolon eşleştirme AI'sız da doğru çalışır (`import-sablon-roundtrip`), ama PDF/görsel aktarımı ve satın alma yardımcısı kapalı kalır. Pilotta AI olmadan da yürünebilir — ekibe **önceden söylenir**. |
| `/gizlilik` üç köşeli parantez + hukuk onayı | Gerçek kişisel veri girilecek. |

Ayarlar › **Sistem Durumu** kartı bu tabloyu canlı gösterir; Gün 0'da ekran görüntüsü
alınıp pilot dosyasına konur (haftanın sonunda "ne değişti" kıyası için).

## Gün 0 — biz (pilot ekibi gelmeden, 2–3 saat)

1. **Excel'leri önceden al.** Ürün listesi, cari listesi, tedarikçi listesi, açılış
   stok sayımı. Şablonlar Veri Aktarım Merkezi'nden indirilir (`/api/import/templates?kind=…`);
   müşterinin kendi dosyası da olur — kolon eşleştirme deterministik.
2. **Firma bilgileri** → Ayarlar › Firma Profili: unvan, vergi no, adres, **logo**.
   Rehberin 1. adımı budur; teklif/PO belgeleri bunsuz unvansız basılır.
3. **Ürün tipleri** (Ayarlar › Ürün Tipleri) — sektöre göre. `057_seed_product_types`
   vana/fitting sektörüne özeldir; farklı sektörde alanlar burada düzenlenir.
4. **Kurulum aracıyla aktarım** — sırayla: ürünler → cariler → tedarikçiler+ürün
   kodları → açılış stokları. Her adımda rehber sayıyı gösterir; uyarı satırları
   (tipsiz ürün, SKU'suz ürün, tercihli tedarikçisi olmayan bağ) **sıfırlanana** kadar düzeltilir.
5. **Kullanıcılar** → Ayarlar › Kullanıcılar › **Davet e-postası gönder**: her pilot
   kullanıcısına rolüyle davet (satış / satın alma / üretim / muhasebe). Parola
   yazılmaz; kişi e-postadaki bağlantıyla kendi parolasını belirler. E-posta
   yapılandırılmamışsa seçenek devre dışıdır ve nedenini yazar — o zaman Gün 0
   yarım demektir, önce e-posta.
6. **Kontrol:** panoda **Kurulum 7/8** görünmeli — kalan tek adım "İlk teklif veya
   sipariş", onu Gün 1'de ekip yapar. Sistem Durumu'nda zorunlu ve sessiz sınıf yeşil.
7. `npm run backup` — pilot öncesi temiz nokta.

## Gün 1 — birlikte (1 saat + gün boyu erişilebilir)

- 15 dk: giriş, parola belirleme (davet linki), tema, telefonda "Ana Ekrana Ekle".
- 30 dk: **bir gerçek teklif baştan sona**, satışçının kendi müşterisiyle:
  teklif oluştur → gönder (stok rezerve olur, müşteriye PDF e-posta gider) →
  kabul → sipariş Onaylı → sevk → sipariş kapanır. Bu turda pano bandı
  **8/8** olup kaybolmalı; olmuyorsa ilk bulgu budur.
- 15 dk: her rolün kendi ekranı — üretimci üretim girişi, satın almacı öneriler +
  RFQ, muhasebeci Paraşüt sekmesi (kapalıysa "kapalı" dediğini görmesi yeter).
- Rol bazlı iş emirlerini dağıt: [`sim/is-emirleri.md`](sim/is-emirleri.md) —
  simülasyon için yazıldı ama pilot senaryosu olarak **birebir** kullanılır
  (Deniz/Hasan/Sibel/Kerem yerine müşterinin kendi kişileri; ürün kodları
  müşterinin kataloğundan seçilir).

## Gün 2–5 — ekip kendi başına, biz gözlemci

- Her gün **15 dk kontrol** (sabah): dün ne yapıldı, nerede takıldılar, ne
  "olması gerekirken olmadı". Bulgular **Developer Console › Bug'lar**'a
  (kullanıcı kendisi yazabilir; yazamıyorsa biz yazarız) — K/Y/O/D ölçeğiyle.
- Gün 3'te Sistem Durumu + `email_logs` (davet/teklif e-postaları `sent` mi) +
  uyarı takvimi bakılır. `waiting_config` biriken varsa e-posta ayarı eksiktir.
- Gün 5 akşamı `npm run backup` + `npm run check:chains` (teklif→sipariş,
  rezervasyon, PO→mal kabul, üretim→hareket zincirleri tutuyor mu).

## Çıkış kriterleri (pilot "geçti" demek için hepsi)

| Ölçüt | Eşik | Nereden ölçülür |
|---|---|---|
| Kurulum rehberi | **8/8**, bant kayboldu | Pano / Veri Aktarım Merkezi |
| Teklif | ≥ 5 gönderilmiş, ≥ 2 kabul → sipariş | Teklifler sekme sayaçları |
| Sipariş | ≥ 2 sevk edildi | Siparişler › Sevk Edildi |
| Üretim / satın alma | ≥ 1 üretim girişi, ≥ 1 PO mal kabul | Üretim, Satın Alma |
| Uyarılar | Uyarılar takvimi dolu ve en az 1 uyarı kullanıcı tarafından kapatıldı | Uyarılar |
| Sistem Durumu | zorunlu + sessiz sınıf **tamamı yeşil** | Ayarlar › Sistem Durumu |
| Bulgular | **0 Kritik**, Yüksek'lerin hepsi ya kapatıldı ya kabul edildi | Developer Console › Bug'lar |
| Ekip | 4 rolün 4'ü de en az bir gün sistemi **kendi başına** kullandı | günlük kontrol notları |

Geçmezse: eksik kalan satır bir sonraki haftanın planıdır; pilot uzatılır, yeni
müşteri açılmaz.

## Bilinen sınırlar (ekibe Gün 1'de açıkça söylenir)

- Paraşüt teslimde **kapalıdır** (`PARASUT_ENABLED=false`); API başvurusu ve go-live
  [`parasut-golive-runbook.md`](parasut-golive-runbook.md) ile ayrı tur.
- Geçmiş veri göçü (eski sipariş/teklif/fatura) kapsam dışı — sistem açılış
  stoğuyla "bugün"den başlar.
- AI anahtarı geçersizse PDF/görsel aktarımı çalışmaz; Excel yolu tam çalışır.

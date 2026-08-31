# KVKK veri envanteri

**Tarih:** 2026-08-31 · **Kapsam:** Roven ERP (tek kiracılı kurulum)

Bu belge **koddan ve canlı şemadan çıkarıldı**, tahminle yazılmadı. Aydınlatma
metni (`/gizlilik`) bunun üzerine kurulur; ikisi ayrışırsa metin değil bu belge
esastır — çünkü sistemin gerçekte ne tuttuğunu bu gösterir.

Yeniden üretmek için:

```bash
# kişisel veri taşıyan kolonlar (değer okunmaz, yalnız kolon adları)
grep -rn "create table if not exists" supabase/migrations/*.sql
```

---

## 1. Nerede hangi kişisel veri var

| Tablo | Kişisel veri kolonları | Kimin verisi | Neden tutuluyor |
|---|---|---|---|
| `customers` | `name`, `email`, `phone`, `address`, `tax_number`, `tax_office`, `notes` | Müşteri firma yetkilisi | Teklif/sipariş/fatura — sözleşmenin ifası |
| `vendors` | `name`, `contact_person`, `contact_email`, `contact_phone`, `address`, `tax_number`, `notes` | Tedarikçi yetkilisi | Satın alma ve fiyat talebi |
| `quotes` | `customer_name`, `customer_contact`, `customer_email`, `customer_phone`, `customer_address`, `seller_name`, `seller_email`, `seller_phone`, `seller_address`, `seller_tax_id`, `notes` | Müşteri + satış temsilcisi | **Belge donması**: teklifin gönderildiği andaki hâli değişmemeli |
| `sales_orders` | `customer_name`, `customer_email`, `customer_tax_office`, `customer_tax_number`, `notes` | Müşteri | Sipariş ve sevkiyat |
| `auth.users` (Supabase) | e-posta, son giriş, `app_metadata.roles` | Sistem kullanıcısı | Kimlik doğrulama ve yetkilendirme |
| `audit_log` | `actor` (e-posta) | Sistem kullanıcısı | Kim neyi değiştirdi — mali/ticari izlenebilirlik |
| `email_logs` | `recipient_email` | Bildirim alıcısı | Teslim durumu, çift gönderim engeli |
| `notification_outbox` | `actor_user_id`, `actor_label` | Sistem kullanıcısı | Bildirim kuyruğu ve yeniden deneme |
| `company_settings` | Firma iletişim bilgileri | Kendi firmamız | Belge başlıkları (teklif/sipariş çıktısı) |
| `system_error_events` | `user_agent` | Sistem kullanıcısı | Hata teşhisi |

**Kişisel veri TAŞIMAYAN yerler** (kayda değer): ürün kataloğu, stok hareketleri,
üretim kayıtları, teknik şablonlar, fiyat listeleri.

### Bilinçli olarak toplanmayanlar

- **Parola** — hiçbir migration'da parola kolonu yok; kimlik doğrulama tamamen
  Supabase'de (bkz. 2026-08-31 güvenlik denetimi, madde #9).
- **IP adresi** — telemetri IP kaydetmiyor; oran sınırlama IP'yi yalnız bellekte
  ve pencere süresince tutuyor, veritabanına yazmıyor.
- **Konum, biyometrik veri, özel nitelikli veri** — hiçbiri.
- **Çerez tabanlı izleme** — üçüncü taraf analitik script'i **yok**. Modül kullanım
  sayacı yalnız normalize sayfa yolu + sayı tutar (`/dashboard/products/[id]`),
  kimin açtığını kaydetmez.

---

## 2. Saklama süreleri

Kodda **sabit** olanlar (`grep -rn "retentionDays" src/lib`):

| Veri | Süre | Kaynak |
|---|---|---|
| Telemetri olayları, hata olayları, istek metrikleri | **30 gün** | `109_developer_console.sql` → `expires_at default (now() + interval '30 days')` |
| Kapanmış hata grupları (hiçbir bug'a bağlı olmayan) | **90 gün** | `purge_telemetry` |
| Tamamlanmış bildirim kuyruğu kayıtları | **90 gün** | `dbDeleteOldCompletedOutbox(retentionDays = 90)` |
| E-posta teslim denetimi | **90 gün** | `dbDeleteOldEmailDeliveryAudit(retentionDays = 90)` |

Temizlik `POST /api/developer/retention` ile çalışır (saatlik cron **veya** Tanılama
ekranındaki "Şimdi temizle").

**Ticari kayıtlar** (`customers`, `vendors`, `quotes`, `sales_orders`, `audit_log`)
otomatik silinmez — aşağıdaki gerekçeye bakınız.

---

## 3. Silme hakkı ve ticari kayıt saklama

Sistem kullanıcısı silinebilir: `DELETE /api/admin/users/[id]` Supabase hesabını
tamamen siler (son admin koruması hariç — o 409 döner).

**Ama silinen kullanıcının `audit_log` içindeki `actor` izleri KALIR.** Bu bilinçli
bir karardır ve iki sebebi vardır:

1. **Ticari defter saklama yükümlülüğü** — bir siparişin kim tarafından
   onaylandığı, bir stok düzeltmesini kimin yaptığı ticari kaydın parçasıdır;
   silinmesi kaydı denetlenemez hâle getirir.
2. **Bütünlük** — `quotes` ve `sales_orders` gönderildikleri andaki hâllerini
   **dondurur** (fiyat, iskonto, KDV, müşteri unvanı). Geriye dönük değiştirmek
   müşteriye gönderilmiş belgeyle sistemdeki kaydı çelişkiye düşürür.

KVKK'nın silme hakkı mutlak değildir; bir hukuki yükümlülüğün yerine getirilmesi
için gereken veri istisna kapsamındadır. **Bu, hukuk danışmanıyla teyit edilmesi
gereken bir yorumdur** — belge bunu bir gerçek olarak değil, sistemin mevcut
davranışı ve gerekçesi olarak kaydeder.

---

## 4. Yurt dışına aktarım

| Alıcı | Ne gidiyor | Nerede | Zorunlu mu |
|---|---|---|---|
| **Supabase** | Tüm veritabanı + kimlik doğrulama | Tokyo (ap-northeast-1) | Evet — birincil veri deposu |
| **Resend** | Alıcı e-posta adresi + bildirim içeriği | ABD/AB | Hayır — `EMAIL_FROM` boşken hiç gönderilmez |
| **Sentry** | Hata mesajı + yığın izi (**PII temizlenmiş**) | AB | Hayır — `NEXT_PUBLIC_SENTRY_DSN` boşsa devre dışı |
| **Anthropic** | Kolon eşleştirme ve öneri için gönderilen veri parçaları | ABD | Hayır — `ANTHROPIC_API_KEY` boşsa AI özellikleri kapanır |
| **Paraşüt** | Cari bilgileri + fatura kalemleri | Türkiye | Hayır — `PARASUT_ENABLED=false` ile kapalı |

Sentry'ye giden veri `src/lib/sentry-scrub.ts` içindeki `beforeSend` ile temizlenir:
istek gövdesi, çerezler ve `Authorization` başlığı maskelenir; hata mesajı ve yığın
izi teşhis için kalır.

---

## 5. Güvenlik önlemleri (özet)

Ayrıntı: `docs/audit/2026-08-30-vibecode-guvenlik-denetimi.md` ve
`docs/audit/2026-08-31-20-madde-liste-denetimi.md`.

- **65/65 tabloda satır seviyesi güvenlik (RLS)** — anon anahtarla 0 satır okunuyor.
- **Rol bazlı erişim** — 6 rol, method seviyesinde kapı matrisi; finansal alanlar
  yetkisiz rollerde redakte edilir.
- **Genel kayıt kapalı** — `signUp` hiçbir yerde çağrılmıyor; kullanıcıyı yalnız
  admin açar.
- **Parola politikası** — 12 karakter + zayıf liste (`src/lib/auth/password-policy.ts`).
- **Aktarımda şifreleme** — HTTPS; `Access-Control-Allow-Origin` hiç set edilmiyor
  (same-origin).

---

## 6. Aydınlatma metni için doldurulması gerekenler

`/gizlilik` sayfasındaki `[...]` yer tutucuları **firma bilgisidir, uydurulamaz**:

- Veri sorumlusunun tam ticari unvanı
- VERBİS kayıt numarası (varsa; kayıt yükümlülüğü çalışan sayısı ve ciroya bağlı)
- İrtibat kişisi / başvuru adresi (KEP veya posta)
- Başvuru yanıt süresi taahhüdü (kanuni azami 30 gün)

Hukuk danışmanı onayı olmadan yayına alınmamalıdır.

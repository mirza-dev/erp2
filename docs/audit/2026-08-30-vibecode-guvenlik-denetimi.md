# 10 Maddelik Güvenlik Denetimi

**Tarih:** 2026-08-30 · **Yöntem:** kaynak okuma + canlı `erp2` projesine karşı salt-okunur probe
**Sonuç:** **10/10 kapalı.** Denetim sırasında açılan tek "bulgu" doğrulamada çürüdü
(ayrıntı aşağıda) — ama kalıcı bir gate kuralı bıraktı.

Girdi: kullanıcının paylaştığı *"vibecoded uygulamalarda neredeyse her seferinde bulduğum
güvenlik delikleri"* listesi (10 madde). Her madde iddia olarak değil, **ölçüm** olarak ele alındı.

---

## Özet tablo

| # | Madde | Durum | Dayanak |
|---|---|---|---|
| 01 | IDOR (URL'deki id'yi değiştir) | ✅ Kapalı | Tek kiracılı ERP; `/api/**` middleware oturum kapısının arkasında (`proxy.ts` `ALWAYS_PUBLIC` hariç). Mutasyonların tamamı guard'lı; finansal alanlar rol bazlı per-request redaction'lı |
| 02 | DB herkese açık (RLS kapalı) | ✅ Kapalı | **Canlı probe:** 24 tablo, anon key → hepsi `200` + **0 satır**. Aynı an service_role: products=128, customers=16, audit_log=142. Kaynak: `017_enable_rls.sql` + `029_rls_missing_tables.sql` |
| 03 | Fiyat tarayıcıda belirleniyor | ✅ **Kapatılmıştı** | Bu kusur GERÇEKTEN vardı; `mig.093` kapattı: istemci `line_total`/`grand_total` gönderebiliyordu, artık sunucuda `qty × price` ile yeniden hesaplanıyor |
| 04 | Pahalı uçta rate limit yok | ✅ Var | `rate-limit.ts`: login 5/15dk · AI 10/dk · API 300/dk · Redis + circuit breaker. ⚠️ `REDIS_URL` yok → in-memory fallback, çok-instance'da instance başına |
| 05 | JWT açıkları (elle yazılmış auth) | ✅ Kapalı | Auth = Supabase. Tek elle yazılan token teklif paylaşım linki: HMAC-SHA256 + `timingSafeEqual` + TTL + fail-closed + alan-ayrımlı türetme (`quote-share-token.ts`) |
| 06 | RLS açık ama policy'de delik | ✅ Kapalı | 65 policy'nin **tamamı** `service_role`; **tek bir `using (true)` yok**. Tarayıcı Supabase'e tablo sorgusu atmıyor (`supabase/client.ts` yalnız auth) |
| 07 | Storage bucket listelenebilir | ✅ Kapalı | 6 bucket'ın 4'ü private; **anon ile listeleme 6/6 boş** döndü |
| 08 | Fatura yakma (pre-auth pahalı uç) | ✅ Kapalı | **Genel kayıt kapalı** — `signUp` hiçbir route'ta yok, "sınırsız hesap" çarpanı yok. `/api/ai/purchase-copilot` public listede ama route kendi içinde oturum VEYA `CRON_SECRET` doğruluyor |
| 09 | SSRF | ✅ Kapalı | Sunucunun kullanıcı URL'i çektiği tek yer logo: **host allowlist** (Supabase host'una eşit olmalı) + şema + MIME + boyut tavanı. `logo_url` ayrıca settings PATCH allowlist'inde **değil** |
| 10 | Prompt injection | ✅ Kapalı | Yazılı kural: **G4 — AI yalnız tavsiye alanına yazar** (`ai-guards.ts`). Tek yazma `ai_confidence/ai_reason/ai_risk_level`; stok/fiyat/durum AI'ya kapalı. G1 girdiden zero-width + bidi-override + C0 karakterlerini siliyor |

---

## Çürüyen bulgu: "24 tabloda RLS drift'i" — ölçüm hatasıydı

Denetim sırasında şu iddia üretildi: *"`customers`, `products`, `sales_orders`, `quotes`,
`audit_log` dahil 24 tabloda RLS canlıda açık ama hiçbir migration'da yok — veritabanı
migration'lardan yeniden kurulursa bu tablolar korumasız doğar."*

**İddia yanlıştı.** `017_enable_rls.sql` bu 23 tablonun tamamının RLS'ini zaten açıyor,
`029_rls_missing_tables.sql` de kalan `column_mappings` + `purchase_commitments`'ı.
Toplam: 65 `create table`, 65 RLS enable, 1 bilinçli `drop` (`product_batches`, mig.060).
**Kapsama tam; drift yok.**

**Hatanın kaynağı ölçüm aracıydı:** tablo taraması kabuk regex'iyle yapıldı ve desen
tek boşluk arıyordu —

```
alter table (public\.)?"?<tablo>"? enable row level security
```

`017` ise okunabilirlik için kolon hizalı yazılmış:

```sql
ALTER TABLE customers              ENABLE ROW LEVEL SECURITY;
```

Aradaki çoklu boşluk yüzünden 23 satırın **hiçbiri** eşleşmedi ve tablolar "korumasız"
göründü. Canlı probe ise doğruydu (0 satır) — yani iki ölçüm birbiriyle çelişiyordu ve
çelişkiyi kovalamak yerine önce yanlış olana inanıldı.

Aynı sınıf hata bu denetimde **üç kez** tekrarlandı (tablo listesi çıkarımı 41 yerine 1
buldu; sonra 24 yerine 17; sonra bu). Ders kaydı: **SQL şemasını kabuk regex'iyle sayma.**
Çıkarımın kendisi doğrulanmalı — bulunan sayı bağımsız bir kaynakla (burada: canlı OpenAPI
tablo listesi) karşılaştırılmalı.

### Yanlış alarmdan kalan gerçek değer

Bulgu çürüdü ama üç şey yerinde kaldı, çünkü değerleri iddiadan bağımsız:

**1. Gate kural 4 — tablo RLS kapsaması** (`sql-migration-lint.test.ts`)

> Bir migration'da `create table X` varsa, X sonradan `drop table` edilmediyse,
> migration'ların herhangi birinde `X` için `enable row level security` de olmalı.

Bugün 0 ihlal veriyor — yani repo zaten doğruydu. Değeri gelecekte: RLS'siz eklenen
**yeni** bir tablo CI'da kırmızı yanar. Bu sınıf için daha önce hiçbir kapı yoktu
(fonksiyon tarafı `110`/K1 turunda kapılanmıştı, tablo tarafı açıktaydı).

Kural, kendi yeşil-ama-işlevsiz kalma riskine karşı da korunuyor: **"tablo çıkarımı
çökmedi"** testi, regex hiçbir şey eşleştirmezse (tam da yukarıdaki hata) sayının
eşiğin altına düştüğünü görüp kırılır. Kuralın gerçekten uyguladığı ayrıca kanıtlandı —
RLS'siz geçici bir `create table` eklendi, test kırmızı yandı, dosya kaldırılınca yeşile döndü.

**2. `check-migrations.ts` — sessiz atlanan migration'lar**

Script yalnızca `PROBES` veya `MANUAL` sözlüğünde kaydı olan migration'ları raporluyordu;
kaydı olmayan **77 dosya** hiç anılmadan geçiyor, script yine `OK` diyordu. `110` — K1
güvenlik yaması — tam bu durumdaydı: uygulanmamış olsa gate bunu söylemeyecekti.
Artık kayıtsız dosyalar `ℹ️` ile listeleniyor ve özet satırında `kayıtsız: N` görünüyor.
(Uyarı, kapı değil — 77 dosyalık birikmiş liste deploy'u bloklamamalı.)

**3. RLS ve grant doğrulaması artık deploy listesinde**

`017` (23 tablo RLS), `029` (2 tablo RLS) ve `110` (5 DEFINER RPC grant'i) `MANUAL`
kaydı aldı; üçünün sorgusu `docs/audit/manual-migration-checks.sql`'e eklendi. Hiçbiri
OpenAPI'de görünmediği için otomatik probe edilemez — canlıda hâlâ yerinde olduklarını
gösteren tek yol bu sorgular. RLS satırı `❌` dönerse deploy durdurulur.

---

## Bulgu olmayan ama not düşülenler

- **Şifre sıfırlama** tarayıcıdan **doğrudan** Supabase'e gidiyor
  (`login/page.tsx` → `supabase.auth.resetPasswordForEmail`) → bizim middleware
  rate-limit'imizin dışında. Supabase'in kendi limitleri geçerli; panelden bir kez teyit edilmeli.
- **`REDIS_URL` yok** → AI/login limitleri in-memory fallback'te, çok-instance'lı kurulumda
  instance başına uygulanır. (Zaten `deferred_backlog` A2.)
- **Supabase yedekleri doğrulanmadı** — bu denetimin kapsamı dışında, deploy öncesi bakılmalı.
- **`unit_price` istemciden geliyor** — bu ERP'de doğru: fiyatı satışçı belirler,
  müşterinin seçtiği katalog fiyatı akışı yok. `line_total` ve başlık toplamları sunucuda.

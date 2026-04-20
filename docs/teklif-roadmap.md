# Teklif Formu — Geliştirme Yol Haritası

_Son güncelleme: 2026-04-20_

## Mevcut Durum

Teklif formu `/dashboard/quotes/new` olarak implement edildi. Tamamen client-side çalışıyor, veriler localStorage'da tutuluyor. Yazdırma desteği (A4 print CSS) mevcut. Sidebar'da "Teklifler" linki var.

---

## Faz 0 — Temel Form ✅

> _Tamamlandı: 2026-04-20_

- [x] Form yapısı: header (logo + satıcı bilgileri), title band, meta grid (müşteri + teklif detayı), kalemler tablosu, toplam, notlar, imzalar
- [x] Satır yönetimi: ekle / sil / düzenle
- [x] Para birimi seçimi (TRY / USD / EUR)
- [x] KDV oranı seçimi (%0 / %10 / %20)
- [x] Toplam override + reset (ara toplam, KDV, genel toplam)
- [x] Logo yükleme (FileReader)
- [x] localStorage auto-save
- [x] Sidebar'a "Teklifler" linki eklendi
- [x] Gönder butonu kaldırıldı (gereksiz)

---

## Faz 1 — Yazdırma Düzeltmesi ✅

> _Tamamlandı: 2026-04-20_

- [x] Sidebar, topbar, action bar print'te gizleniyor
- [x] `.dashboard-grid` → `display: block` (grid layout düzleniyor)
- [x] Tüm renkler beyaz kağıt moduna sıfırlanıyor
- [x] `@page` A4 portrait, 15mm margin
- [x] Satır hover efekti eklendi (ekran modu)
- [x] Notes ve signatures print boyutları ayarlandı

---

## Veritabanı Mimarisi

> Bu bölüm Faz 2–5'in ortak altyapısını tanımlar. Kodlamadan önce okunmalı.

### Mevcut katman yapısı (projedeki pattern)

```
Supabase DB
  ↓
src/lib/supabase/*.ts          ← dbXxx() fonksiyonları — service client, raw SQL/Supabase query
  ↓
src/lib/database.types.ts      ← DB row tipleri (snake_case, nullable)
  ↓
src/lib/api-mappers.ts         ← mapXxx() — DB row → frontend model (null → default)
  ↓
src/lib/mock-data.ts           ← Frontend interface'ler (camelCase, non-null)
  ↓
src/app/api/**/route.ts        ← Next.js route handler — unstable_cache + revalidateTag
  ↓
src/lib/data-context.tsx       ← Global React context — fetch + state
  ↓
src/app/dashboard/**/page.tsx  ← UI — context'ten okur veya doğrudan fetch atar
```

Her yeni tablo bu katman sırasını takip eder. Kısayol yok.

---

### Tablo 1 — `company_settings` (Faz 2)

Tek satırlı (singleton) bir tablo. Sistemde sadece bir firma var.

```sql
create table company_settings (
    id          uuid        default gen_random_uuid() primary key,
    name        text        not null default '',
    tax_office  text        not null default '',
    tax_no      text        not null default '',
    address     text        not null default '',
    phone       text        not null default '',
    email       text        not null default '',
    website     text        not null default '',
    logo_url    text,                          -- Supabase Storage public URL
    currency    char(3)     not null default 'USD',
    updated_at  timestamptz not null default now()
);

-- Tek satır garantisi: sadece bir kayıt olabilir
create unique index company_settings_singleton on company_settings ((true));
```

**Okuma:** `SELECT * FROM company_settings LIMIT 1` → yoksa boş defaults döner
**Yazma:** `INSERT ... ON CONFLICT DO UPDATE SET ...` (upsert) — her zaman tek satırı günceller

**DB fonksiyonu:**
```ts
// src/lib/supabase/company-settings.ts
export async function dbGetCompanySettings(): Promise<CompanySettingsRow | null>
export async function dbUpsertCompanySettings(data: Partial<CompanySettingsRow>): Promise<CompanySettingsRow>
```

**API route:** `GET/PATCH /api/settings/company`
**Cache:** `unstable_cache`, tag: `"company-settings"`, revalidate: 300s (5 dk — nadiren değişir)

---

### Tablo 2 — `quotes` (Faz 5)

Sipariş tablosunun pattern'ını takip eder. Müşteri bilgileri **denormalize** kopyalanır — müşteri silinse bile eski teklif verisi kaybolmaz.

```sql
create table quotes (
    id              uuid        default gen_random_uuid() primary key,
    quote_number    text        not null unique,      -- 'TKL-2026-001'

    -- Durum
    status          text        not null default 'draft'
                    check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired')),

    -- Müşteri — nullable FK + denormalize snapshot
    customer_id     uuid        references customers(id) on delete set null,
    customer_name   text        not null default '',
    customer_contact text,
    customer_phone  text,
    customer_email  text,

    -- Satış temsilcisi
    sales_rep       text,
    sales_phone     text,
    sales_email     text,

    -- Para / vergi
    currency        char(3)     not null default 'USD',
    vat_rate        numeric(5,2) not null default 20,

    -- Toplamlar (override edilebilir — form'dan gelir, DB'de saklanır)
    subtotal        numeric(15,2) not null default 0,
    vat_total       numeric(15,2) not null default 0,
    grand_total     numeric(15,2) not null default 0,

    -- Meta
    notes           text,
    sig_prepared    text,
    sig_approved    text,
    sig_manager     text,
    quote_date      date,
    valid_until     date,

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Teklif numarası üretimi: TKL-YYYY-NNN (zero-padded 3 digit)
create sequence quotes_number_seq;

create or replace function next_quote_number()
returns text language plpgsql as $$
declare
    yr  text := to_char(now(), 'YYYY');
    seq int;
begin
    seq := nextval('quotes_number_seq');
    return 'TKL-' || yr || '-' || lpad(seq::text, 3, '0');
end;
$$;
```

**Otomatik numara:** INSERT sırasında `quote_number = next_quote_number()` ile DB'de üretilir — race condition yok.

---

### Tablo 3 — `quote_line_items` (Faz 5)

```sql
create table quote_line_items (
    id              uuid        default gen_random_uuid() primary key,
    quote_id        uuid        not null references quotes(id) on delete cascade,
    position        integer     not null default 0,  -- sıralama (0-indexed)

    -- Ürün — nullable FK + serbest metin fallback
    product_id      uuid        references products(id) on delete set null,
    product_code    text        not null default '',  -- ürün seçilmezse elle yazılan
    lead_time       text,                             -- '30 gün', '4 hafta' gibi
    description     text        not null default '',
    quantity        numeric(12,4) not null default 0,
    unit_price      numeric(15,4) not null default 0,
    line_total      numeric(15,2) not null default 0, -- qty * price, DB'de hesaplanmaz, client hesaplar
    hs_code         text,
    weight_kg       numeric(10,3),

    created_at      timestamptz not null default now()
);

create index quote_line_items_quote_id on quote_line_items(quote_id);
```

---

### Numara üretimi stratejisi

`next_quote_number()` DB fonksiyonu kullanılır. Frontend numara üretmez, DB dönen değeri gösterir.

```ts
// INSERT sırasında DB üretir:
const { data } = await supabase
    .from("quotes")
    .insert({ ...quoteData, quote_number: "placeholder" })  // YANLIŞ

// DOĞRU — DB default veya RETURNING kullan:
const { data } = await supabase.rpc("create_quote", { ...quoteData })
// veya:
const { data } = await supabase
    .from("quotes")
    .insert({ ...quoteData })
    .select("quote_number")
    .single();
// ve migration'da: quote_number DEFAULT next_quote_number()
```

---

### RLS politikası (Faz 5 migration'ına ekle)

Migration 017'deki pattern'ı takip eder:

```sql
alter table quotes enable row level security;
alter table quote_line_items enable row level security;

-- Service role (backend) her şeyi görebilir
create policy "service_quotes_all" on quotes
    for all using (auth.role() = 'service_role');

create policy "service_quote_items_all" on quote_line_items
    for all using (auth.role() = 'service_role');
```

`createServiceClient()` RLS'yi bypass eder zaten — ama politika eklenmazsa Supabase Studio'dan da erişilemez.

---

### Caching stratejisi

| Veri | Cache tag | revalidate | Invalidate ne zaman |
|------|-----------|-----------|---------------------|
| company_settings | `"company-settings"` | 300s | PATCH /api/settings/company |
| quotes listesi | `"quotes"` | 30s | POST/PATCH/DELETE /api/quotes |
| tek quote | `"quote-{id}"` | 60s | PATCH/DELETE /api/quotes/[id] |

---

### Mapper pattern (quotes için)

```ts
// src/lib/database.types.ts'e eklenecek:
export interface QuoteRow {
    id: string;
    quote_number: string;
    status: "draft" | "sent" | "accepted" | "rejected" | "expired";
    customer_id: string | null;
    customer_name: string;
    // ... diğer alanlar
}

// src/lib/api-mappers.ts'e eklenecek:
export function mapQuote(row: QuoteRow): Quote { ... }
export function mapQuoteDetail(row: QuoteRow, items: QuoteLineItemRow[]): QuoteDetail { ... }

// src/lib/mock-data.ts'e eklenecek:
export interface Quote { id: string; quoteNumber: string; ... }
export interface QuoteDetail extends Quote { lines: QuoteLineItem[]; }
```

---

### FirmaTab'ın mevcut durumu — DİKKAT

`src/app/dashboard/settings/page.tsx` → `handleSave` şu an **tamamen sahte**:
```ts
const handleSave = async () => {
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 800));  // ← fake delay
    savedRef.current = { ...form };
    // ← DB'ye hiçbir şey yazılmıyor
    toast({ type: "success", message: "Firma bilgileri kaydedildi" });
};
```

Faz 2'de bu fonksiyon `PATCH /api/settings/company`'ye bağlanacak. Sayfa yüklenince de `GET /api/settings/company` çağrılıp form doldurulacak.

---

### Veri akış özeti — teklif oluşturma (Faz 5 sonrası)

```
Kullanıcı "Kaydet" tıklar
  → POST /api/quotes  (body: tüm form state)
    → dbCreateQuote()  (quotes tablosuna INSERT, quote_number DB üretir)
    → dbCreateQuoteLineItems()  (quote_line_items bulk INSERT)
    → revalidateTag("quotes")
  ← { id, quote_number, ... } döner
  → URL /dashboard/quotes/[id]'e geçer (yeni kayıt için)
  → localStorage temizlenir (DB'de artık güvende)
```

```
Kullanıcı teklifi düzenler
  → PATCH /api/quotes/[id]  (body: değişen alanlar)
    → dbUpdateQuote()
    → quote_line_items: DELETE WHERE quote_id = id, sonra bulk INSERT (en basit strateji)
    → revalidateTag("quote-{id}"), revalidateTag("quotes")
  ← 200 OK
```

---

## Faz 2 — Satıcı Bilgisi Ayarlardan Gelsin

> _Durum: Bekliyor_

**Sorun:** Her teklif açılışında firma adı, tel, email, adres, VKN sıfırdan yazılıyor.

**Mevcut altyapı:**
- `src/app/dashboard/settings/page.tsx` → FirmaTab: `name, taxOffice, taxNo, address, phone, website, currency` alanları var
- Ama bu veriler DB'ye kaydedilmiyor — sadece component state'te tutuluyor (`initialFirmaForm`, `handleSave` fake delay ile toast gösteriyor)

**Yapılacaklar:**
- [ ] `company_settings` tablosu oluştur (migration 033) — `id, name, tax_office, tax_no, address, phone, email, website, logo_url, currency, updated_at`
- [ ] `src/lib/supabase/company-settings.ts` — `dbGetCompanySettings()`, `dbUpdateCompanySettings()`
- [ ] `GET/PATCH /api/settings/company` route
- [ ] Settings → FirmaTab'ı gerçek API'ye bağla (fake delay → gerçek save)
- [ ] Teklif formu: sayfa açılınca `GET /api/settings/company` çağır, satıcı alanlarını doldur
- [ ] Logo: company_settings'teki `logo_url` varsa otomatik yükle

**Dosyalar:**
- `supabase/migrations/033_company_settings.sql`
- `src/lib/supabase/company-settings.ts` (yeni)
- `src/lib/database.types.ts` (CompanySettingsRow eklenir)
- `src/app/api/settings/company/route.ts` (yeni)
- `src/app/dashboard/settings/page.tsx` (FirmaTab API'ye bağlanır)
- `src/app/dashboard/quotes/new/page.tsx` (useEffect ile fetch)

---

## Faz 3 — Müşteri Autocomplete

> _Durum: Bekliyor_

**Sorun:** Müşteri bilgileri serbest metin olarak yazılıyor, mevcut cariler kullanılmıyor.

**Mevcut altyapı:**
- `GET /api/customers` → tüm aktif müşterileri döner (cached, 30s)
- `CustomerRow`: `id, name, email, phone, address, tax_number, tax_office, country, currency`
- `data-context.tsx` → `customers` listesi zaten global context'te

**Yapılacaklar:**
- [ ] Teklif formuna müşteri arama input'u ekle (Company alanı → autocomplete)
- [ ] Yazmaya başlayınca mevcut `customers` listesinden filtrele (client-side, context'teki veri)
- [ ] Müşteri seçilince: Contact, Phone, Email alanlarını otomatik doldur
- [ ] Seçim sonrası alanlar hâlâ düzenlenebilir olmalı (override)
- [ ] "Yeni müşteri" olarak serbest metin de yazılabilmeli

**Dosyalar:**
- `src/app/dashboard/quotes/new/page.tsx` (autocomplete dropdown + müşteri state bağlantısı)

**Not:** Yeni API/tablo gerekmez — context'teki veri yeterli.

---

## Faz 4 — Ürün Autocomplete + Fiyat Doldurma

> _Durum: Bekliyor_

**Sorun:** Ürün kodu ve açıklaması elle yazılıyor, mevcut envanter kullanılmıyor.

**Mevcut altyapı:**
- `GET /api/products` → aktif ürünler (sku, name, price, currency, unit, category)
- `data-context.tsx` → `products` listesi zaten global context'te

**Yapılacaklar:**
- [ ] "Product Code" hücresine autocomplete ekle (SKU araması)
- [ ] Ürün seçilince otomatik doldur:
  - `desc` → product.name
  - `price` → product.price (para birimi uyuşuyorsa)
  - `kg` → product.weight (varsa — şu an DB'de yok, opsiyonel)
- [ ] "Description" hücresinden de arama yapılabilmeli (isim araması)
- [ ] Katalog dışı ürün: autocomplete'den bir şey seçilmezse serbest metin kalır
- [ ] Seçilen ürünün stok durumunu küçük bir indicator ile göster (opsiyonel, nice-to-have)

**Dosyalar:**
- `src/app/dashboard/quotes/new/page.tsx` (hücre autocomplete + ürün state bağlantısı)

**Not:** Yeni API/tablo gerekmez — context'teki veri yeterli. Autocomplete componenti Faz 3'te yazıldığı için tekrar kullanılabilir.

---

## Faz 5 — DB Persistence + Otomatik Numara

> _Durum: Bekliyor_

**Sorun:** Veriler sadece localStorage'da, tek bir teklif tutuluyor, cihazlar arası erişim yok.

**Yapılacaklar:**
- [ ] Migration 034: `quotes` tablosu
  ```
  id uuid PK, quote_number text UNIQUE, status text ('draft','sent'),
  customer_id uuid FK nullable, customer_name text, customer_contact text,
  customer_phone text, customer_email text,
  sales_rep text, sales_phone text, sales_email text,
  currency text, vat_rate numeric, subtotal numeric, vat_total numeric,
  grand_total numeric, notes text,
  sig_prepared text, sig_approved text, sig_manager text,
  quote_date date, valid_until date,
  created_at timestamptz, updated_at timestamptz
  ```
- [ ] Migration 034: `quote_line_items` tablosu
  ```
  id uuid PK, quote_id uuid FK, position int,
  product_id uuid FK nullable, product_code text, lead_time text,
  description text, quantity numeric, unit_price numeric,
  line_total numeric, hs_code text, weight_kg numeric,
  created_at timestamptz
  ```
- [ ] `src/lib/supabase/quotes.ts` — CRUD fonksiyonları
- [ ] `src/lib/database.types.ts` — QuoteRow, QuoteLineItemRow tipleri
- [ ] `src/lib/api-mappers.ts` — mapQuote(), mapQuoteDetail()
- [ ] `GET/POST /api/quotes` route
- [ ] `GET/PATCH/DELETE /api/quotes/[id]` route
- [ ] Otomatik numara: `TKL-{YYYY}-{NNN}` (DB sequence veya max+1)
- [ ] Teklif formu: Kaydet → `POST /api/quotes` (yeni) veya `PATCH /api/quotes/[id]` (mevcut)
- [ ] localStorage fallback: API başarısız olursa hâlâ localStorage'a kaydet
- [ ] URL yapısı: `/dashboard/quotes/new` (yeni), `/dashboard/quotes/[id]` (düzenleme)

**Dosyalar:**
- `supabase/migrations/034_quotes.sql`
- `src/lib/supabase/quotes.ts` (yeni)
- `src/lib/database.types.ts` (QuoteRow + QuoteLineItemRow)
- `src/lib/api-mappers.ts` (mapQuote)
- `src/app/api/quotes/route.ts` (yeni)
- `src/app/api/quotes/[id]/route.ts` (yeni)
- `src/app/dashboard/quotes/new/page.tsx` (API bağlantısı)
- `src/app/dashboard/quotes/[id]/page.tsx` (yeni — düzenleme sayfası, new ile paylaşılabilir)

---

## Faz 6 — Teklif Listesi Sayfası

> _Durum: Bekliyor_ · _Bağımlılık: Faz 5_

**Sorun:** Geçmiş tekliflere erişim yok, sadece tek bir teklif üzerinde çalışılabiliyor.

**Yapılacaklar:**
- [ ] `/dashboard/quotes` → liste sayfası (tablo)
  - Sütunlar: Teklif No, Müşteri, Tarih, Tutar, Durum, İşlemler
  - Sıralama: son oluşturulan en üstte
  - Durum badge: Taslak (sarı), Gönderildi (mavi)
- [ ] Filtre: durum (tümü / taslak / gönderildi), tarih aralığı, metin arama
- [ ] İşlemler: Düzenle, Kopyala (yeni teklif olarak), Sil, PDF (yeni sekmede print)
- [ ] Sidebar: "Teklifler" → `/dashboard/quotes` (liste, şu an `/dashboard/quotes/new`'a gidiyor)
- [ ] Liste sayfasında "Yeni Teklif" butonu → `/dashboard/quotes/new`

**Dosyalar:**
- `src/app/dashboard/quotes/page.tsx` (yeni)
- `src/components/layout/Sidebar.tsx` (href güncelleme)

---

## Faz 7 — Durum Yaşam Döngüsü

> _Durum: Bekliyor_ · _Bağımlılık: Faz 5, 6_

**Yapılacaklar:**
- [ ] Durum geçişleri: Taslak → Gönderildi (yazdır/PDF sonrası veya manuel buton)
- [ ] `quote_valid_until` bağlantısı: süre dolunca teklif "Süresi Dolmuş" olsun
- [ ] Mevcut `serviceExpireQuotes()` CRON'una quotes tablosunu da ekle
- [ ] Alert: `quote_expired` tipindeki alert'ler quotes için de çalışsın
- [ ] Liste sayfasında ek durum filtreleri: Süresi Dolmuş

---

## Faz 8 — Teklif → Sipariş Dönüşümü

> _Durum: Bekliyor_ · _Bağımlılık: Faz 5, 7_

**Yapılacaklar:**
- [ ] Teklif detayında "Siparişe Dönüştür" butonu
- [ ] Müşteri bilgileri, satır kalemleri, fiyatlar → yeni sipariş olarak aktar
- [ ] Ürün bağlantısı: quote_line_items.product_id → order_line_items.product_id
- [ ] Dönüştürülen teklifin durumu: "Kabul Edildi" (yeni durum)
- [ ] Sipariş detayında kaynak teklif referansı göster

---

## Karar Notları

| Konu | Karar | Neden |
|------|-------|-------|
| Gönder butonu | Kaldırıldı | Gereksiz — müşteri PDF'i kendisi mail atar |
| Firma bilgisi kaynağı | DB (company_settings) | Settings'teki FirmaTab zaten var, sadece DB bağlantısı eksik |
| Müşteri/ürün verisi | Context'ten (client-side) | Zaten `data-context.tsx`'te yükleniyor, yeni API gereksiz |
| Autocomplete | Basit dropdown filtre | Üçüncü parti kütüphane gereksiz, ürün/müşteri sayısı makul |
| Teklif numarası | `TKL-YYYY-NNN` | Mevcut sipariş numarası pattern'ına paralel |
| localStorage | DB sonrası fallback olarak kalır | Offline/hata durumunda veri kaybı önlenir |

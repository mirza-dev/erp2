# Satın Alma & Uyarı Aksiyon Tamamlama — Implementation Plan (Revize 2)

**Tarih:** 2026-05-10
**Hazırlayan:** Claude (Opus 4.7)
**Revizyon:** v2 — kullanıcı teknik review geri bildirimi uygulandı (7 blocker fix + 5 orta seviye iyileştirme + yeni faz sırası)
**Hedef:** AI öneri → tedarikçi siparişi → mal kabul → stok güncelleme zincirini kapatmak; alert sayfasının yönlendirici olmaktan çıkıp inline aksiyon almasını sağlamak; AI feedback'in sonraki tahminlere geri beslenmesini eklemek.

---

## 1. Context

### 1.1 Mevcut durum (HEAD `0bdb21e` itibarıyla)

**Satın alma önerileri** (`/dashboard/purchase/suggested`):
- 12 audit turundan geçti, hesap/UI doğruluk + tutarlılık çok yüksek seviyede stabil.
- Aksiyonlar: `handleAccept / handleReject / handleEdit / handleUndo` sadece `ai_recommendations.status` değiştiriyor + `ai_feedback` satırı yaratıyor.
- **Tedarik zinciri etkisi yok.** Kullanıcı kabul etse bile sistemde gerçek tedarikçi siparişi oluşmuyor; `purchase_commitments` tablosuna otomatik kayıt eklenmiyor; `incoming` ve `forecasted` stok hesabı bu nedenle gerçek niyeti yansıtmıyor (sadece manuel olarak `/dashboard/products` panelinden commitment girilebiliyor).

**Üretim & stok uyarıları** (`/dashboard/alerts`):
- 9 tip cover ediliyor, dedup + severity escalation + 24h dismiss disiplinleri sağlam.
- Sadece `quote_expired` drawer içinde inline aksiyona sahip ("Süreyi Uzat" formu → `PATCH /api/orders/[id] quote_valid_until`).
- `sync_issue` türü için `actionFor()` switch'inde **case yok** → fallback "Stoku izle" linkiyle yanlış sayfaya yönlendiriyor.
- `overdue_shipment` drawer'ında sadece "Siparişe git" linki, sevki başlatan inline form yok.
- `order_shortage` drawer'ında kısmi sevk / üretim emri tetikleme yok.

**AI feedback döngüsü:**
- Reject sırasında `ai_feedback.feedback_note` satırı yazılıyor.
- `aiEnrichPurchaseSuggestions` ise sonraki AI çağrılarında bu notu **prompt'a beslemiyor** → "kullanıcı bu ürünü neden reddettiyse" sinyali kayboluyor.

### 1.2 Mevcut altyapı (planı şekillendiren bilgi)

| Mevcut | Kullanım |
|---|---|
| `purchase_commitments` (mig. 020) | Tek-satır beklenen stok kaydı; `pending/received/cancelled`. `incoming` hesabı buradan. |
| `receive_purchase_commitment(id)` RPC (mig. 020 + 028) | Atomik: `on_hand += qty` + `inventory_movements (movement_type='receipt', reference_type='manual')`. Status='pending' filter ile yarış güvenli. |
| `inventory_movements` (mig. 001) | movement_type ∈ {production, shipment, receipt, adjustment, reservation_create, reservation_release}; reference_type ∈ {order, production_entry, import, **manual**}. PO referansı için yeni reference_type değeri eklenecek. |
| `order_counters` + `generate_order_number()` (mig. 003) | Yıl bazlı sequence pattern; PO numaralandırması için aynı pattern. |
| `audit_log` | Mevcut audit altyapısı; PO lifecycle olayları buraya yazılacak. |
| `email-service.ts` (Resend) | SMTP altyapı hazır; production deploy ayrı bekliyor; bu plan e-postayı sonraki sürüme erteliyor. |
| `products.preferred_vendor` (text) | Mevcut string field; vendor entity migrasyonunda korunacak (legacy fallback) + yeni `preferred_vendor_id` FK eklenecek. |
| `purchase_commitments.supplier_name` (text) | String field; PO line referansı eklenince structured kaynak `po_line_id`'dir; `supplier_name` geriye uyumluluk için kalır. |

### 1.3 Hedefler

1. **Gerçek tedarik zinciri akışı:** Recommendation accept → PO draft → confirm → `purchase_commitments` otomatik → mal kabul (kısmi destekli) → `inventory_movements` + on_hand artışı.
2. **Vendors entity:** structured tedarikçi kaydı; `preferred_vendor_id` ile ürün-tedarikçi ilişkisi.
3. **Alert aksiyonları inline (hepsi):**
   - `sync_issue` → drawer'dan Paraşüt retry.
   - `overdue_shipment` → drawer'dan inline sevk formu.
   - `order_shortage` → drawer'dan üretim emri / kısmi sevk routing (MVP'de iki yola da link, drawer bilgi yoğunluğu artar).
4. **AI feedback → prompt geri besleme:** son redler `aiEnrichPurchaseSuggestions` prompt'una eklenir (3 katmanlı sanitize, 90-gün eskime, ürün başına 3 not cap, 200 char cap, 8 saldırı vektörü test'i).

### 1.4 Kapsam dışı

- Tedarikçiye otomatik e-posta (SMTP production deploy sonrası ayrı sürüm).
- Tedarikçi performans skoru (`yuksek-etki.md`'de listelenen ayrı plan).
- Multi-warehouse PO (mevcut sistem tek depo).
- Tedarikçi self-service portal.
- PO için çok aşamalı onay zinciri.
- **Role/permission matrix tam implementasyonu** (B7 — bu plana minimum role guard girer; tam matrix Faz 11 ayrı plan).

---

## 2. Onaylanmış Ürün Kararları

| # | Konu | Karar |
|---|---|---|
| 1 | PO numara formatı | `PO-2026-0001` (yıl + 4 haneli sıra; sipariş numarası paterniyle birebir) |
| 2 | PO para birimi | Vendor varsayılan currency dolu gelir, kullanıcı her siparişte override edebilir |
| 3 | Tedarikçi e-posta | Şimdilik manuel "Gönderildi olarak işaretle" butonu; otomatik e-posta sonraki sürüm |
| 4 | Alert inline aksiyonlar | sync_issue + overdue_shipment + order_shortage hepsi inline |
| 5 | AI rejection notları | Prompt'a beslenir; sanitize + 8 saldırı vektörü test'i zorunlu |
| 6 | Tedarikçi yönetimi | Yeni `/dashboard/vendors` sayfası + sidebar grubu |

---

## 3. BLOCKER FIX'LER (kullanıcı review'inden, implementasyondan ÖNCE plan'a işlendi)

### B1 — Partial receive incoming hesabı

**Sorun:** `purchase_commitments.quantity` tam miktar; kısmi kabulde commitment `pending` kalıyor → `incoming = SUM(qty) WHERE pending` 10'un 5'i geldiyse hâlâ 10 sayar; on_hand zaten +5 olduğu için **5 adet çift sayım**. `incoming/forecasted` yanlış.

**Çözüm:** `purchase_commitments` tablosuna `received_qty integer NOT NULL DEFAULT 0 CHECK (received_qty >= 0 AND received_qty <= quantity)` kolonu eklenecek. Yeni invariant:

- `incoming(product) = SUM(quantity - received_qty) WHERE status = 'pending'`
- Tam kabul: `received_qty = quantity` ve `status = 'received'` aynı anda set edilir.
- Kısmi kabul: `received_qty < quantity` ve `status = 'pending'` (commitment hâlâ aktif, incoming kısmi azaltılır).
- Manuel commitment akışı: `received_qty = 0` (pending) → tam kabul: `received_qty = quantity` (status='received'). Geriye uyumlu.

`receive_po_lines` RPC ve mevcut `receive_purchase_commitment` RPC bu invariant'ı korur. Tüm `incoming` hesap noktaları (mevcut helper'lar + frontend computed) güncellenir; regresyon test'i yapılır.

### B2 — PO numara üretimi DB-garanteed (atomik RPC)

**Sorun:** `generate_po_number()` RPC var ama JS-side INSERT'te `po_number` set unutulursa NULL/çakışma. Sadece `DEFAULT generate_po_number()` da bazı PG sürümlerinde non-immutable default için risk.

**Çözüm:** `create_purchase_order_with_lines(...)` RPC içinde `po_number := generate_po_number()` çağrısı + INSERT atomik. JS-side asla manuel `po_number` set etmez. Helper `dbCreatePurchaseOrder` bu RPC'ye delege eder.

### B3 — PO create + line replace atomik DB RPC

**Sorun:** Supabase JS client multi-statement transaction garanti etmiyor. "Header insert + lines insert tek transaction" yanlış varsayım: ilki geçer, ikinci başarısız → orphan header.

**Çözüm:** İki RPC zorunlu:

```sql
-- create_purchase_order_with_lines
-- Input: vendor_id, expected_date, currency, notes, lines jsonb [{product_id, quantity, unit_price, discount_pct, notes?, source_recommendation_ids?}], actor
-- Davranış:
--   1. Vendor active check (B4 ortak guard).
--   2. po_number = generate_po_number().
--   3. INSERT purchase_orders (status='draft').
--   4. INSERT purchase_order_lines (line_total trigger ile auto).
--   5. INSERT po_line_recommendations (M2 junction; her line için kaynak recommendation_id'ler).
--   6. audit_log: action='po_created'.
--   7. RETURNING (id, po_number).
-- Tüm adımlar tek transaction; herhangi biri fail → rollback.

-- replace_purchase_order_lines
-- Input: po_id, lines jsonb, actor
-- Davranış:
--   1. SELECT FOR UPDATE purchase_orders status (sadece 'draft' kabul; aksi → exception).
--   2. DELETE purchase_order_lines WHERE po_id = $1.
--   3. INSERT bulk lines.
--   4. INSERT junction satırları (yeniden).
--   5. Header totals trigger ile auto-recompute.
--   6. audit_log: action='po_lines_replaced'.
```

Helper'lar bu RPC'lere delege eder; multi-statement JS-side transaction yok.

### B4 — `confirm_po` ek validasyonlar

**Sorun:** İlk taslakta sadece `expected_date NOT NULL` kontrolü vardı. Eksikler: (a) **boş PO** (line yok) confirm edilebilir → commitment yok, state saçma; (b) **inactive vendor** ile confirm edilebilir.

**Çözüm:** `confirm_po` içine 2 ek guard:

```sql
-- Boş PO koruması
IF NOT EXISTS (SELECT 1 FROM purchase_order_lines WHERE po_id = p_po_id) THEN
    RAISE EXCEPTION 'PO confirm edilemez: en az 1 line gerekli';
END IF;

-- Vendor aktif mi
DECLARE v_vendor_active boolean;
SELECT v.is_active INTO v_vendor_active
FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id
WHERE po.id = p_po_id;
IF NOT COALESCE(v_vendor_active, false) THEN
    RAISE EXCEPTION 'PO confirm edilemez: vendor pasif veya bulunamadı';
END IF;
```

`create_purchase_order_with_lines` RPC'sinde de aynı vendor active kontrolü zorunlu (yeni PO oluştururken pasif vendor seçilmesi engellenir).

### B5 — `pg_trgm` extension migration'a eklensin

**Sorun:** Vendor `name` GIN trigram index extension'ın varlığını varsayıyor.

**Çözüm:** Migration 048 başına:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### B6 — `po_counters` RLS

**Sorun:** Bölüm güvenlik checklist'inde `po_counters` RLS'i belirtilmiş ama migration snippet'i ENABLE etmiyor.

**Çözüm:** Migration 049 içine:
```sql
ALTER TABLE po_counters ENABLE ROW LEVEL SECURITY;
```
(`order_counters` aynı disipline tabi olduğu için tutarlı.)

### B7 — Role/yetki guard'ı (minimum matrix MVP, tam matrix sonraki plan)

**Sorun:** Tüm session'lı kullanıcılar ERP'de vendor create / PO confirm / mal kabul / cancel yapabiliyor. Riskli aksiyonlar role-based olmalı.

**Çözüm — minimum role matrix (bu plana dahil):**

- Yeni helper `requireRole(req: NextRequest, allowed: Role[]): Promise<boolean>` (`@/lib/auth/role-guard.ts`):
  - `auth.users.user_metadata.role` okur (`'admin' | 'purchaser' | 'viewer'`; metadata yoksa `'purchaser'` varsayılan).
  - `allowed` listesinde değilse 403 response döner.
- Aşağıdaki endpoint'lerde **zorunlu** kullanılır (en yıkıcı 2 aksiyon):

| Endpoint | Allowed |
|---|---|
| `POST /api/purchase-orders/[id]/cancel` | `admin` (sipariş iptali geri alınamaz tarafına yakın) |
| `POST /api/purchase-orders/[id]/receive` | `admin`, `purchaser` (mal kabul stok ledger değiştirir) |

Diğer endpoint'lerde session yeterli (varsayılan rol `purchaser` zaten yeterli izin sağlar).

**Tam role matrix** (vendor:create, PO:create, PO:confirm vs. role'lere göre detaylı bölünme) Faz 11 ayrı plan'da ele alınacak. Bu plan Faz 11 öncesi çalışır durumda kalır (default `purchaser` herkese izin verir; sadece destructive aksiyonlar admin gerektirir).

---

## 4. ORTA SEVİYE İYİLEŞTİRMELER (kullanıcı review'inden)

### M1 — `sent → draft` revize akışı netleştirme

**Karar:**
- `sent → draft` izinli; `sent_at = NULL` set edilir (aşağıda state machine'de güncelle).
- `audit_log`: `action='po_revised', before_state={status:'sent', sent_at:X}, after_state={status:'draft', sent_at:null}`.
- UI'da "Revize et (sent → draft)" butonuna confirm dialog: "Tedarikçiye gönderilmiş bir siparişi taslağa çeviriyorsunuz. Yeni versiyon onaylandığında tedarikçiyi güncellemeniz gerekebilir."

### M2 — Recommendation ↔ PO line ilişkisi: junction table

İlk taslakta `recommendation.metadata.po_id` set ediliyordu. İzlenebilirlik için junction tablo daha doğru.

**Yeni tablo (Migration 049 içinde):**

```sql
CREATE TABLE IF NOT EXISTS po_line_recommendations (
    po_line_id        uuid NOT NULL REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
    recommendation_id uuid NOT NULL REFERENCES ai_recommendations(id) ON DELETE RESTRICT,
    PRIMARY KEY (po_line_id, recommendation_id),
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_po_line_rec_rec ON po_line_recommendations(recommendation_id);
ALTER TABLE po_line_recommendations ENABLE ROW LEVEL SECURITY;
```

`from-recommendations` akışı: `create_purchase_order_with_lines` RPC içinde `lines[i].source_recommendation_ids` jsonb array'i her line için junction satırlarına yazılır.

UI:
- PO line detay: "Bu satır şu önerilerden geldi" izi (click → ilgili `ai_recommendations.id` linki).
- `/dashboard/purchase/suggested` sayfasındaki rec satırı: "Bu öneri PO-2026-0042 (taslak)'a dönüştü" linki — junction'dan reverse lookup.

`recommendation.metadata.po_id` artık YAZILMAZ (junction tek source-of-truth).

### M3 — `order_shortage` "inline" gerçekçi kapsam

**MVP'de kabul:** drawer içinde gerçek inline form yok; iki yola **link** verilir. Ama drawer:

- Eksik miktar + ürün adı + ilgili sipariş(ler)i tam görünür yapar.
- Buton metinleri: "Üretim emri başlat (yeni sayfada)" + "Kısmi sevk planla (siparişe git)".
- DoD: drawer "tek başına yeterli bilgi" — kullanıcı linki tıklamadan kararını verebilir.

Faz 11 roadmap notu: "production-from-shortage inline form" (`yuksek-etki.md`'ye eklenecek).

### M4 — AI feedback bulk fetch (N+1 önleme)

İlk taslak ürün başına ayrı `dbGetRecentRejectionsForProduct(productId, 3)` çağırıyordu. 100+ ürünlü cron'da N+1.

**Çözüm:** Yeni helper `dbGetRecentRejectionsForProducts(productIds: string[], limitPerProduct = 3): Promise<Map<string, string[]>>`:

```ts
// SQL:
// SELECT t.entity_id, t.feedback_note FROM (
//     SELECT ar.entity_id, af.feedback_note, af.created_at,
//            ROW_NUMBER() OVER (
//                PARTITION BY ar.entity_id
//                ORDER BY af.created_at DESC
//            ) AS rn
//     FROM ai_feedback af
//     JOIN ai_recommendations ar ON ar.id = af.recommendation_id
//     WHERE ar.entity_id = ANY($1)
//       AND ar.entity_type = 'product'
//       AND ar.recommendation_type = 'purchase_suggestion'
//       AND ar.status = 'rejected'
//       AND af.feedback_note IS NOT NULL
//       AND length(trim(af.feedback_note)) > 0
//       AND af.created_at >= now() - interval '90 days'
// ) t WHERE t.rn <= $2
// ORDER BY t.entity_id, t.created_at DESC
// JS-side Map<entity_id, sanitized_note[]>
```

Tek query, tüm ürünler için en yeni N rejection. Test: 0/1/50 ürün, 90-gün cutoff doğru, sıralama kronolojik tersine.

### M5 — Rollback planı: FK sırası

`vendors` tablosu sonra drop'tan önce `products.preferred_vendor_id` kolonu drop edilmeli (FK violation'ı önler). Tüm migration'lara "ROLLBACK" SQL bloğu yorum olarak eklenir:

```sql
-- ROLLBACK:
-- ALTER TABLE products DROP COLUMN IF EXISTS preferred_vendor_id;
-- DROP TABLE IF EXISTS vendors CASCADE;
-- DROP EXTENSION IF EXISTS pg_trgm;  -- (sadece bu migration eklediyse)
```

---

## 5. Mimari Karar Kayıtları (ADR)

### ADR-1: Vendors entity ayrı tablo, `preferred_vendor` string field korunur
- Yeni `vendors` tablosu; `products.preferred_vendor_id uuid NULL FK`. Mevcut `products.preferred_vendor text` field'ı **silinmez** (geriye uyumluluk + migrate edilmemiş ürünlerde fallback).

### ADR-2: PO header + lines + commitment senkronu
- Yeni `purchase_orders` (header) + `purchase_order_lines`. PO `confirmed` durumunda **her line için bir `purchase_commitments` satırı** otomatik (idempotent unique index). `purchase_commitments.po_line_id` FK ile bağlanır. Manuel commitment (`po_line_id IS NULL`) yan yana çalışır.

### ADR-3: PO state machine

```
draft → sent → confirmed → partially_received → received
   ↑      │
   └──────┘   (M1: sent → draft revize izinli)
   ↘──────────────────────────↙
               cancelled (her aktif durumdan)
```

- `draft → confirmed` doğrudan izinli (sent atlanabilir; manuel telefon siparişi senaryosu).
- `partially_received` durumunda `cancel` edilirse: zaten alınan stok korunur, kalan pending commitments cancel.

### ADR-4: `inventory_movements.reference_type = 'purchase_order'`
- Mevcut CHECK constraint genişletilir: `'purchase_order'` eklenir. `reference_id = po_line_id`. Mevcut `manual` referans tipi tarihsel kullanım için kalır.

### ADR-5: Recommendation → PO draft tetikleme **kullanıcı kontrollü**
- `handleAccept` PO draft otomatik oluşturmaz. UI'da "Sipariş Aç" CTA ayrı buton; tek-line veya bulk (vendor bazlı gruplama).

### ADR-6: Tedarikçiye PDF/email opsiyonel
- PO modülünün temel çalışması için zorunlu değil. PO `sent` manuel "Gönderildi işaretle" ile geçer. PDF render Faz 9'da; otomatik e-posta SMTP production deploy sonrası ayrı sürüm.

### ADR-7: Role guard minimum (MVP), tam matrix sonraki plan
- Bu planda sadece `cancel` ve `receive` admin/purchaser gate. Tam role matrix Faz 11 ayrı plan.

---

## 6. DB Schema Değişiklikleri

### 6.1 Migration 048 — `vendors` tablosu

**Dosya:** `supabase/migrations/048_vendors.sql`

```sql
-- ============================================================
-- 048 — Vendors entity
-- pg_trgm extension (idempotent), vendors tablo, products FK kolon.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- B5

CREATE TABLE IF NOT EXISTS vendors (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 text NOT NULL CHECK (length(trim(name)) > 0),
    contact_email        text,
    contact_phone        text,
    contact_person       text,
    tax_number           text,
    address              text,
    currency             text NOT NULL DEFAULT 'TRY'
                              CHECK (currency IN ('TRY', 'USD', 'EUR')),
    payment_terms_days   integer CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0),
    lead_time_days       integer CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
    notes                text,
    is_active            boolean NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_vendors_name_trgm ON vendors USING gin (name gin_trgm_ops);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION vendors_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vendors_updated_at ON vendors;
CREATE TRIGGER trg_vendors_updated_at
    BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION vendors_set_updated_at();

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS preferred_vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_preferred_vendor_id
    ON products(preferred_vendor_id) WHERE preferred_vendor_id IS NOT NULL;

-- ROLLBACK:
-- ALTER TABLE products DROP COLUMN IF EXISTS preferred_vendor_id;
-- DROP TABLE IF EXISTS vendors CASCADE;
-- DROP FUNCTION IF EXISTS vendors_set_updated_at();
-- DROP EXTENSION IF EXISTS pg_trgm;  -- yalnız bu migration eklediyse
```

### 6.2 Migration 049 — `purchase_orders` + lines + junction + RPCs

**Dosya:** `supabase/migrations/049_purchase_orders.sql`

```sql
-- ============================================================
-- 049 — Purchase Orders header + lines + recommendations junction
-- po_counters RLS (B6); po_number RPC üzerinden garanti (B2);
-- atomik create/replace RPC'ler (B3); junction tablo (M2).
-- ============================================================

CREATE TABLE IF NOT EXISTS po_counters (
    year     integer PRIMARY KEY,
    last_seq integer NOT NULL DEFAULT 0
);

ALTER TABLE po_counters ENABLE ROW LEVEL SECURITY;  -- B6

CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_year integer := extract(year from now())::integer; v_seq integer;
BEGIN
    INSERT INTO po_counters (year, last_seq) VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_seq = po_counters.last_seq + 1
    RETURNING last_seq INTO v_seq;
    RETURN 'PO-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
END; $$;

CREATE TABLE IF NOT EXISTS purchase_orders (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number       text NOT NULL UNIQUE,    -- B2: RPC içinde üretilir
    vendor_id       uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    status          text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','sent','confirmed',
                                            'partially_received','received','cancelled')),
    order_date      date NOT NULL DEFAULT CURRENT_DATE,
    expected_date   date,
    currency        text NOT NULL DEFAULT 'TRY'
                         CHECK (currency IN ('TRY','USD','EUR')),
    subtotal        numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    vat_rate        numeric(5,4)  NOT NULL DEFAULT 0.20 CHECK (vat_rate >= 0 AND vat_rate <= 1),
    vat_total       numeric(14,2) NOT NULL DEFAULT 0 CHECK (vat_total >= 0),
    grand_total     numeric(14,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
    notes           text,
    sent_at         timestamptz,
    confirmed_at    timestamptz,
    cancelled_at    timestamptz,
    cancel_reason   text,
    created_by      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_status_expected ON purchase_orders(status, expected_date);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_created ON purchase_orders(created_at DESC);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id           uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id      uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity        integer NOT NULL CHECK (quantity > 0),
    unit_price      numeric(14,4) NOT NULL CHECK (unit_price >= 0),
    discount_pct    numeric(5,2)  NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
    line_total      numeric(14,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
    received_qty    integer NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
    notes           text,
    CONSTRAINT chk_pol_received_le_qty CHECK (received_qty <= quantity)
);

CREATE INDEX IF NOT EXISTS idx_pol_po ON purchase_order_lines(po_id);
CREATE INDEX IF NOT EXISTS idx_pol_product ON purchase_order_lines(product_id);

ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;

-- ── M2: junction tablo recommendation ↔ po_line ─────────────
CREATE TABLE IF NOT EXISTS po_line_recommendations (
    po_line_id        uuid NOT NULL REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
    recommendation_id uuid NOT NULL REFERENCES ai_recommendations(id) ON DELETE RESTRICT,
    PRIMARY KEY (po_line_id, recommendation_id),
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_line_rec_rec ON po_line_recommendations(recommendation_id);

ALTER TABLE po_line_recommendations ENABLE ROW LEVEL SECURITY;

-- ── line_total trigger + header totals trigger (mevcut taslak) ──
CREATE OR REPLACE FUNCTION recompute_pol_line_total()
RETURNS TRIGGER AS $$
BEGIN
    NEW.line_total := round(
        NEW.quantity::numeric * NEW.unit_price * (1 - NEW.discount_pct / 100.0), 2);
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pol_line_total ON purchase_order_lines;
CREATE TRIGGER trg_pol_line_total
    BEFORE INSERT OR UPDATE OF quantity, unit_price, discount_pct ON purchase_order_lines
    FOR EACH ROW EXECUTE FUNCTION recompute_pol_line_total();

CREATE OR REPLACE FUNCTION recompute_po_totals(p_po_id uuid)
RETURNS void AS $$
DECLARE v_subtotal numeric(14,2); v_vat_rate numeric(5,4);
        v_vat_total numeric(14,2); v_grand_total numeric(14,2);
BEGIN
    SELECT COALESCE(SUM(line_total),0) INTO v_subtotal
    FROM purchase_order_lines WHERE po_id = p_po_id;
    SELECT vat_rate INTO v_vat_rate FROM purchase_orders WHERE id = p_po_id;
    IF v_vat_rate IS NULL THEN v_vat_rate := 0.20; END IF;
    v_vat_total := round(v_subtotal * v_vat_rate, 2);
    v_grand_total := round(v_subtotal + v_vat_total, 2);
    UPDATE purchase_orders
    SET subtotal=v_subtotal, vat_total=v_vat_total, grand_total=v_grand_total, updated_at=now()
    WHERE id = p_po_id;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_pol_recompute_po_totals()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM recompute_po_totals(COALESCE(NEW.po_id, OLD.po_id));
    RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pol_after_change ON purchase_order_lines;
CREATE TRIGGER trg_pol_after_change
    AFTER INSERT OR UPDATE OR DELETE ON purchase_order_lines
    FOR EACH ROW EXECUTE FUNCTION trg_pol_recompute_po_totals();

CREATE OR REPLACE FUNCTION purchase_orders_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_po_updated_at ON purchase_orders;
CREATE TRIGGER trg_po_updated_at
    BEFORE UPDATE ON purchase_orders FOR EACH ROW
    EXECUTE FUNCTION purchase_orders_set_updated_at();

-- ── B3: atomik create RPC ───────────────────────────────────
CREATE OR REPLACE FUNCTION create_purchase_order_with_lines(
    p_vendor_id uuid,
    p_expected_date date,
    p_currency text,
    p_notes text,
    p_lines jsonb,    -- [{product_id, quantity, unit_price, discount_pct, notes?, source_recommendation_ids?}]
    p_actor text
) RETURNS TABLE(po_id uuid, po_number text)
LANGUAGE plpgsql AS $$
DECLARE
    v_po_id uuid;
    v_po_number text;
    v_line jsonb;
    v_line_id uuid;
    v_rec_id uuid;
    v_vendor_active boolean;
BEGIN
    -- B4: vendor active check (yeni PO oluştururken pasif vendor seçilmesini engelle)
    SELECT is_active INTO v_vendor_active FROM vendors WHERE id = p_vendor_id;
    IF NOT COALESCE(v_vendor_active, false) THEN
        RAISE EXCEPTION 'PO oluşturulamadı: vendor pasif veya bulunamadı';
    END IF;

    IF jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'PO oluşturulamadı: en az 1 line gerekli';
    END IF;

    v_po_number := generate_po_number();

    INSERT INTO purchase_orders (po_number, vendor_id, expected_date, currency, notes, created_by)
    VALUES (v_po_number, p_vendor_id, p_expected_date, p_currency, p_notes, p_actor)
    RETURNING id INTO v_po_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        INSERT INTO purchase_order_lines (po_id, product_id, quantity, unit_price, discount_pct, notes)
        VALUES (
            v_po_id,
            (v_line->>'product_id')::uuid,
            (v_line->>'quantity')::integer,
            (v_line->>'unit_price')::numeric,
            COALESCE((v_line->>'discount_pct')::numeric, 0),
            v_line->>'notes'
        ) RETURNING id INTO v_line_id;

        IF v_line ? 'source_recommendation_ids' THEN
            FOR v_rec_id IN SELECT (jsonb_array_elements_text(v_line->'source_recommendation_ids'))::uuid LOOP
                INSERT INTO po_line_recommendations (po_line_id, recommendation_id)
                VALUES (v_line_id, v_rec_id)
                ON CONFLICT DO NOTHING;
            END LOOP;
        END IF;
    END LOOP;

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, created_by)
    VALUES ('po_created', 'purchase_order', v_po_id,
            jsonb_build_object('po_number', v_po_number, 'status', 'draft'), 'ui', p_actor);

    RETURN QUERY SELECT v_po_id, v_po_number;
END; $$;

-- ── B3: atomik replace lines RPC ────────────────────────────
CREATE OR REPLACE FUNCTION replace_purchase_order_lines(
    p_po_id uuid, p_lines jsonb, p_actor text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
    v_line jsonb;
    v_line_id uuid;
    v_rec_id uuid;
BEGIN
    SELECT status INTO v_status FROM purchase_orders WHERE id = p_po_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PO bulunamadı: %', p_po_id;
    END IF;
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'PO line replace edilemez (status=%); sadece draft', v_status;
    END IF;
    IF jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'PO için en az 1 line gerekli';
    END IF;

    DELETE FROM purchase_order_lines WHERE po_id = p_po_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        INSERT INTO purchase_order_lines (po_id, product_id, quantity, unit_price, discount_pct, notes)
        VALUES (
            p_po_id,
            (v_line->>'product_id')::uuid,
            (v_line->>'quantity')::integer,
            (v_line->>'unit_price')::numeric,
            COALESCE((v_line->>'discount_pct')::numeric, 0),
            v_line->>'notes'
        ) RETURNING id INTO v_line_id;

        IF v_line ? 'source_recommendation_ids' THEN
            FOR v_rec_id IN SELECT (jsonb_array_elements_text(v_line->'source_recommendation_ids'))::uuid LOOP
                INSERT INTO po_line_recommendations (po_line_id, recommendation_id)
                VALUES (v_line_id, v_rec_id) ON CONFLICT DO NOTHING;
            END LOOP;
        END IF;
    END LOOP;

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, created_by)
    VALUES ('po_lines_replaced', 'purchase_order', p_po_id,
            jsonb_build_object('line_count', jsonb_array_length(p_lines)), 'ui', p_actor);
END; $$;

-- ROLLBACK:
-- DROP TABLE IF EXISTS po_line_recommendations CASCADE;
-- DROP TABLE IF EXISTS purchase_order_lines CASCADE;
-- DROP TABLE IF EXISTS purchase_orders CASCADE;
-- DROP TABLE IF EXISTS po_counters;
-- DROP FUNCTION IF EXISTS create_purchase_order_with_lines, replace_purchase_order_lines,
--                          generate_po_number, recompute_po_totals, recompute_pol_line_total,
--                          trg_pol_recompute_po_totals, purchase_orders_set_updated_at;
```

### 6.3 Migration 050 — `purchase_commitments` PO link + `received_qty` (B1)

**Dosya:** `supabase/migrations/050_purchase_commitments_po_link.sql`

```sql
-- ============================================================
-- 050 — purchase_commitments PO link + received_qty (B1 partial fix)
-- ============================================================

ALTER TABLE purchase_commitments
    ADD COLUMN IF NOT EXISTS po_line_id uuid
        REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS received_qty integer NOT NULL DEFAULT 0
        CHECK (received_qty >= 0);

-- received_qty <= quantity invariant (B1)
ALTER TABLE purchase_commitments
    ADD CONSTRAINT chk_pc_received_le_qty CHECK (received_qty <= quantity);

CREATE INDEX IF NOT EXISTS idx_pc_po_line
    ON purchase_commitments(po_line_id) WHERE po_line_id IS NOT NULL;

-- Idempotent unique constraint: bir PO line için aktif tek commitment
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pc_active_po_line
    ON purchase_commitments(po_line_id)
    WHERE po_line_id IS NOT NULL AND status IN ('pending', 'received');

-- ROLLBACK:
-- DROP INDEX IF EXISTS uniq_pc_active_po_line;
-- DROP INDEX IF EXISTS idx_pc_po_line;
-- ALTER TABLE purchase_commitments DROP CONSTRAINT IF EXISTS chk_pc_received_le_qty;
-- ALTER TABLE purchase_commitments DROP COLUMN IF EXISTS received_qty;
-- ALTER TABLE purchase_commitments DROP COLUMN IF EXISTS po_line_id;
```

### 6.4 Migration 051 — PO mal kabul RPC (B1 senkronu)

**Dosya:** `supabase/migrations/051_po_receive_rpc.sql`

```sql
-- ============================================================
-- 051 — PO mal kabul RPC (atomik kısmi kabul + commitment senkronu)
-- B1: purchase_commitments.received_qty senkronize edilir.
-- inventory_movements.reference_type = 'purchase_order' eklenir.
-- ============================================================

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_reference_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reference_type_check
    CHECK (reference_type IS NULL OR reference_type IN
        ('order','production_entry','import','manual','purchase_order'));

CREATE OR REPLACE FUNCTION receive_po_lines(
    p_po_id uuid, p_lines jsonb, p_actor text DEFAULT 'system'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_input  jsonb;
    v_qty    integer;
    v_line_id uuid;
    v_line   record;
    v_total_lines integer;
    v_full_received_lines integer;
    v_partial_received_lines integer;
    v_po_status text;
    v_new_received_qty integer;
BEGIN
    SELECT status INTO v_po_status FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PO bulunamadı: %', p_po_id; END IF;
    IF v_po_status NOT IN ('confirmed','partially_received') THEN
        RAISE EXCEPTION 'PO mal kabul edilemez (status=%)', v_po_status;
    END IF;

    FOR v_input IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_line_id := (v_input->>'line_id')::uuid;
        v_qty     := (v_input->>'qty')::integer;

        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Geçersiz miktar (line=%, qty=%)', v_line_id, v_qty;
        END IF;

        SELECT id, po_id, product_id, quantity, received_qty INTO v_line
        FROM purchase_order_lines WHERE id = v_line_id AND po_id = p_po_id FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PO line bulunamadı veya farklı PO''ya ait: %', v_line_id;
        END IF;

        v_new_received_qty := v_line.received_qty + v_qty;
        IF v_new_received_qty > v_line.quantity THEN
            RAISE EXCEPTION
                'Aşırı kabul: line %, sipariş=%s, daha önce kabul=%s, şimdi=%s',
                v_line_id, v_line.quantity, v_line.received_qty, v_qty;
        END IF;

        UPDATE purchase_order_lines SET received_qty = v_new_received_qty WHERE id = v_line_id;
        UPDATE products SET on_hand = on_hand + v_qty WHERE id = v_line.product_id;

        INSERT INTO inventory_movements (
            product_id, movement_type, quantity,
            reference_type, reference_id, notes, source, created_by
        ) VALUES (
            v_line.product_id, 'receipt', v_qty,
            'purchase_order', v_line_id,
            format('PO mal kabul: %s adet (PO line %s)', v_qty, v_line_id),
            'system', p_actor
        );

        -- B1: commitment received_qty senkronu (kısmi/tam ortak)
        UPDATE purchase_commitments
        SET received_qty = v_new_received_qty,
            status = CASE WHEN v_new_received_qty = v_line.quantity THEN 'received' ELSE 'pending' END,
            received_at = CASE WHEN v_new_received_qty = v_line.quantity THEN now() ELSE received_at END
        WHERE po_line_id = v_line_id;
    END LOOP;

    -- PO header status auto-update
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE received_qty = quantity),
        COUNT(*) FILTER (WHERE received_qty > 0 AND received_qty < quantity)
    INTO v_total_lines, v_full_received_lines, v_partial_received_lines
    FROM purchase_order_lines WHERE po_id = p_po_id;

    IF v_full_received_lines = v_total_lines AND v_total_lines > 0 THEN
        UPDATE purchase_orders SET status='received' WHERE id = p_po_id;
        INSERT INTO audit_log (action, entity_type, entity_id, after_state, source)
        VALUES ('po_fully_received', 'purchase_order', p_po_id,
                jsonb_build_object('status', 'received'), 'system');
    ELSIF v_full_received_lines > 0 OR v_partial_received_lines > 0 THEN
        UPDATE purchase_orders SET status='partially_received' WHERE id = p_po_id;
        INSERT INTO audit_log (action, entity_type, entity_id, after_state, source)
        VALUES ('po_partially_received', 'purchase_order', p_po_id,
                jsonb_build_object('status', 'partially_received'), 'system');
    END IF;
END; $$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS receive_po_lines;
-- ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_reference_type_check;
-- ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reference_type_check
--     CHECK (reference_type IS NULL OR reference_type IN ('order','production_entry','import','manual'));
```

### 6.5 Migration 052 — `confirm_po` + `cancel_po` RPC (B4 guards)

**Dosya:** `supabase/migrations/052_po_confirm_commitment_seed.sql`

```sql
-- ============================================================
-- 052 — confirm_po + cancel_po (B4 boş PO + inactive vendor guard)
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_po(
    p_po_id uuid, p_actor text DEFAULT 'system'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
    v_expected date;
    v_vendor_id uuid;
    v_vendor_name text;
    v_vendor_active boolean;
    v_line record;
BEGIN
    SELECT po.status, po.expected_date, po.vendor_id INTO v_status, v_expected, v_vendor_id
    FROM purchase_orders po WHERE po.id = p_po_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'PO bulunamadı: %', p_po_id; END IF;
    IF v_status NOT IN ('draft','sent') THEN
        RAISE EXCEPTION 'PO confirm edilemez (status=%); draft veya sent olmalı', v_status;
    END IF;
    IF v_expected IS NULL THEN
        RAISE EXCEPTION 'PO confirm için expected_date zorunludur';
    END IF;

    -- B4: boş PO guard
    IF NOT EXISTS (SELECT 1 FROM purchase_order_lines WHERE po_id = p_po_id) THEN
        RAISE EXCEPTION 'PO confirm edilemez: en az 1 line gerekli';
    END IF;

    -- B4: vendor active guard
    SELECT name, is_active INTO v_vendor_name, v_vendor_active
    FROM vendors WHERE id = v_vendor_id;
    IF NOT COALESCE(v_vendor_active, false) THEN
        RAISE EXCEPTION 'PO confirm edilemez: vendor pasif veya bulunamadı';
    END IF;

    UPDATE purchase_orders SET status='confirmed', confirmed_at=now() WHERE id = p_po_id;

    -- Her line için commitment (idempotent unique index ile çift insert engellenir)
    FOR v_line IN SELECT id, product_id, quantity FROM purchase_order_lines WHERE po_id = p_po_id LOOP
        INSERT INTO purchase_commitments (
            product_id, quantity, expected_date, supplier_name, notes, status, po_line_id, received_qty
        ) VALUES (
            v_line.product_id, v_line.quantity, v_expected, v_vendor_name,
            format('PO %s', p_po_id), 'pending', v_line.id, 0
        ) ON CONFLICT DO NOTHING;  -- partial unique index garanti eder
    END LOOP;

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, created_by)
    VALUES ('po_confirmed', 'purchase_order', p_po_id,
            jsonb_build_object('status','confirmed'), 'ui', p_actor);
END; $$;

CREATE OR REPLACE FUNCTION cancel_po(
    p_po_id uuid, p_reason text, p_actor text DEFAULT 'system'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
    SELECT status INTO v_status FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PO bulunamadı: %', p_po_id; END IF;
    IF v_status IN ('received','cancelled') THEN
        RAISE EXCEPTION 'PO iptal edilemez (status=%)', v_status;
    END IF;

    UPDATE purchase_orders
    SET status='cancelled', cancelled_at=now(), cancel_reason=p_reason
    WHERE id = p_po_id;

    -- Pending commitments cancel; received olanlar dokunulmaz (B1 partial-receive korunur)
    UPDATE purchase_commitments
    SET status='cancelled'
    WHERE po_line_id IN (SELECT id FROM purchase_order_lines WHERE po_id = p_po_id)
      AND status = 'pending';

    INSERT INTO audit_log (action, entity_type, entity_id, after_state, source, created_by)
    VALUES ('po_cancelled','purchase_order', p_po_id,
            jsonb_build_object('status','cancelled','reason',p_reason), 'ui', p_actor);
END; $$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS confirm_po, cancel_po;
```

---

## 7. Backend Helpers & Services

### 7.1 `src/lib/supabase/vendors.ts`

```ts
export async function dbListVendors(filter): Promise<VendorRow[]>;
export async function dbGetVendorById(id): Promise<VendorRow | null>;
export async function dbCreateVendor(input): Promise<VendorRow>;
export async function dbUpdateVendor(id, patch): Promise<VendorRow>;
export async function dbDeactivateVendor(id): Promise<void>;  // aktif PO varsa hata
```

Validation: `name` non-empty, `contact_email` `isValidEmail`, `tax_number` `isValidTaxNumber` (NULL veya 10/11 hane), `currency` whitelist, `lead_time_days >= 0`. Audit log her CRUD'da.

### 7.2 `src/lib/supabase/purchase-orders.ts`

```ts
export type PurchaseOrderStatus = 'draft'|'sent'|'confirmed'|'partially_received'|'received'|'cancelled';

const VALID_PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
    draft:               ['sent','confirmed','cancelled'],
    sent:                ['confirmed','cancelled','draft'],     // M1: revize
    confirmed:           ['partially_received','received','cancelled'],
    partially_received:  ['received','cancelled'],
    received:            [],
    cancelled:           [],
};

export async function dbListPurchaseOrders(filter): Promise<...>;
export async function dbGetPurchaseOrderById(id): Promise<...>;

// B3: helper RPC'ye delege eder, multi-statement JS-side yok
export async function dbCreatePurchaseOrder(input): Promise<{ id, po_number }> {
    const sb = createServiceClient();
    const { data, error } = await sb.rpc('create_purchase_order_with_lines', {
        p_vendor_id: input.vendorId,
        p_expected_date: input.expectedDate,
        p_currency: input.currency,
        p_notes: input.notes,
        p_lines: input.lines,  // jsonb
        p_actor: input.createdBy,
    });
    if (error || !data?.[0]) throw new Error(error?.message ?? 'PO create failed');
    return { id: data[0].po_id, po_number: data[0].po_number };
}

// B3: replace lines RPC'ye delege
export async function dbReplacePurchaseOrderLines(po_id, lines, actor): Promise<void>;

// M1: sent → draft revize sent_at=NULL set; tüm transition'larda audit_log
export async function dbTransitionPurchaseOrder(id, next, opts): Promise<void> {
    // VALID_PO_TRANSITIONS check
    // 'confirmed' → confirm_po RPC
    // 'cancelled' → cancel_po RPC
    // 'draft' (sent → draft) → UPDATE status='draft', sent_at=NULL + audit 'po_revised'
    // 'sent' → UPDATE status='sent', sent_at=now() + audit 'po_sent'
}
```

### 7.3 `src/lib/services/purchase-order-service.ts`

```ts
export async function serviceCreatePOFromRecommendations(input): Promise<{poId,poNumber}> {
    // 1. Validate: hepsi accepted/edited; rejected/expired hata
    // 2. Aynı PO içinde duplicate product → group + sum miktar; source_recommendation_ids merge
    // 3. Lines = recommendations.map → quantity (edited ? editedMetadata.suggestQty : metadata.suggestQty)
    //    unit_price = product.cost_price ?? product.price (fallback)
    //    discount_pct = 0
    //    source_recommendation_ids = [rec_id_1, rec_id_2, ...] (group sonrası)
    // 4. dbCreatePurchaseOrder({...}) → RPC tek atomik
    // M2: junction tablosuna otomatik yazılır (RPC içinde)
}

export async function serviceReceivePOLines(input): Promise<{status}> {
    // RPC receive_po_lines
    // Sonra: best-effort alert auto-resolve scan (stock_critical recovered)
}
```

### 7.4 `src/lib/supabase/ai-feedback.ts` (M4 bulk fetch)

```ts
export async function dbGetRecentRejectionsForProducts(
    productIds: string[],
    limitPerProduct = 3,
): Promise<Map<string, string[]>> {
    if (productIds.length === 0) return new Map();
    const sb = createServiceClient();
    const { data, error } = await sb.rpc('get_recent_rejections_for_products', {
        p_product_ids: productIds,
        p_limit: limitPerProduct,
    });
    // RPC SQL window function ROW_NUMBER PARTITION BY entity_id → tek query
    // 90-gün cutoff RPC içinde
    // JS-side sanitize her not için (zorunlu, sanitizeFeedbackForPrompt)
    if (error) throw new Error(error.message);
    const map = new Map<string, string[]>();
    for (const row of data ?? []) {
        const sanitized = sanitizeFeedbackForPrompt(row.feedback_note);
        if (!sanitized) continue;
        const arr = map.get(row.entity_id) ?? [];
        arr.push(sanitized);
        map.set(row.entity_id, arr);
    }
    return map;
}
```

RPC `get_recent_rejections_for_products` migration olarak ek (Faz 8 sırasında).

### 7.5 `src/lib/services/ai-service.ts` (genişletme)

```ts
export interface PurchaseSuggestionItem {
    /* mevcut alanlar */
    recentRejections?: string[];   // Faz 8 — sanitized notlar (max 3, max 200 char/her biri)
}

// route.ts'te aiEnrichPurchaseSuggestions öncesi:
// const rejMap = await dbGetRecentRejectionsForProducts(items.map(i => i.productId), 3);
// for (const item of items) item.recentRejections = rejMap.get(item.productId) ?? [];

// Prompt yapısı:
// "PRODUCT: <name> ...\n
//  Recent user rejections for this product (most recent first):\n
//  1. <sanitized>\n 2. <sanitized>\n 3. <sanitized>\n
//  These notes describe why the user previously declined a similar suggestion;
//  consider whether current stock conditions still warrant a fresh suggestion.
//  Do not echo these notes back; use them only for reasoning."
// 0 rejection → bölüm prompt'a hiç eklenmez (token tasarrufu).
```

### 7.6 `src/lib/auth/role-guard.ts` (B7 minimum role guard)

```ts
type Role = 'admin' | 'purchaser' | 'viewer';

export async function getCurrentUserRole(req: NextRequest): Promise<Role> {
    const sb = await createServerSupabaseClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return 'viewer';
    const role = user.user_metadata?.role;
    if (role === 'admin' || role === 'purchaser' || role === 'viewer') return role;
    return 'purchaser';  // varsayılan
}

export async function requireRole(req: NextRequest, allowed: Role[]): Promise<NextResponse | null> {
    const role = await getCurrentUserRole(req);
    if (!allowed.includes(role)) {
        return NextResponse.json({ error: 'Yetkiniz yok.' }, { status: 403 });
    }
    return null;
}

// Kullanım (cancel/receive endpoint'lerinde):
// const guard = await requireRole(req, ['admin']);
// if (guard) return guard;
```

### 7.7 `sanitizeFeedbackForPrompt` (kritik prompt injection koruması)

```ts
const MAX_NOTE_LEN = 200;

export function sanitizeFeedbackForPrompt(raw: string | null | undefined): string {
    if (!raw) return "";
    let s = String(raw);
    // 1. Control chars (NULL, line/paragraph separators U+2028/U+2029, formatting chars)
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F  ]/g, " ");
    // 2. Markdown injection vektörleri
    s = s.replace(/```/g, "''");
    // 3. Role marker'lar (system:, assistant:, user: prefix'leri strip)
    s = s.replace(/\b(system|assistant|user)\s*:/gi, "");
    // 4. Whitespace normalize
    s = s.replace(/\s+/g, " ").trim();
    // 5. Length cap
    if (s.length > MAX_NOTE_LEN) s = s.slice(0, MAX_NOTE_LEN - 1) + "…";
    return s;
}
```

---

## 8. API Endpoints

### 8.1 Vendors

| Endpoint | Method | Auth | Demo | Açıklama |
|---|---|---|---|---|
| `/api/vendors` | GET | session | ✅ | List + search |
| `/api/vendors` | POST | session | 403 | Create |
| `/api/vendors/[id]` | GET | session | ✅ | Detail |
| `/api/vendors/[id]` | PATCH | session | 403 | Update |
| `/api/vendors/[id]` | DELETE | session | 403 | Soft delete (is_active=false). Aktif PO referansı varsa 409. |

### 8.2 Purchase Orders

| Endpoint | Method | Auth | Role guard (B7) | Demo |
|---|---|---|---|---|
| `/api/purchase-orders` | GET | session | — | ✅ |
| `/api/purchase-orders` | POST | session | — | 403 |
| `/api/purchase-orders/[id]` | GET | session | — | ✅ |
| `/api/purchase-orders/[id]` | PATCH | session | — | 403 |
| `/api/purchase-orders/[id]/lines` | PUT | session | — | 403 |
| `/api/purchase-orders/[id]/send` | POST | session | — | 403 |
| `/api/purchase-orders/[id]/confirm` | POST | session | — | 403 |
| `/api/purchase-orders/[id]/receive` | POST | session | **admin/purchaser** | 403 |
| `/api/purchase-orders/[id]/cancel` | POST | session | **admin** | 403 |
| `/api/purchase-orders/from-recommendations` | POST | session | — | 403 |
| `/api/purchase-orders/[id]/pdf` | GET | session | — | ✅ |

### 8.3 Alert aksiyonları

| Endpoint | Method | Auth | Açıklama |
|---|---|---|---|
| `/api/alerts/[id]/sync-retry` | POST | session | sync_issue alert'ten Paraşüt step retry; başarı sonrası alert resolved |

`overdue_shipment` ve `order_shortage` için yeni endpoint **gerekmez**:
- `overdue_shipment` drawer'dan mevcut `POST /api/orders/[id]/ship` çağrılır (kontrat doğrulanacak; yoksa Faz 7'de eklenir).
- `order_shortage` drawer'dan link/router push (üretim sayfası prefill).

---

## 9. UI Sayfaları & Bileşenler

### 9.1 Yeni sayfalar

- **`/dashboard/vendors`** (list + drawer form): tablo (name, contact, lead_time, is_active) + "Yeni Tedarikçi" + search + Demo guard.
- **`/dashboard/purchase/orders`** (PO list): status tab'ları (Tümü/Taslak/Gönderildi/Onaylandı/Kısmi Kabul/Tamamlandı/İptal).
- **`/dashboard/purchase/orders/new`** (PO form): vendor seç, lines ekle, expected_date, currency, notes.
- **`/dashboard/purchase/orders/[id]`** (PO detail):
  - Header: PO number, status badge, vendor, expected_date.
  - Lines table: product, qty, received_qty, unit_price, discount, line_total + **source recommendation linkleri** (M2 junction).
  - Status butonları: durum bazlı CTA ("Gönder","Onayla","Mal Kabul","İptal","Revize Et" — sent→draft için).
  - Mal Kabul modu: her line için "alınan miktar" inputu, "Tamamen kabul" toggle, "Kabulü kaydet" → `receive_po_lines` RPC.
  - Cancel modu: confirm dialog + `reason` zorunlu textarea.
  - Audit timeline (her durum geçişi).

### 9.2 Sidebar reorganizasyonu

**Eski:** "Satın Alma Önerileri" tek link.

**Yeni grup "Satın Alma":**
- Öneriler → `/dashboard/purchase/suggested`
- Siparişler → `/dashboard/purchase/orders`
- Tedarikçiler → `/dashboard/vendors`

### 9.3 `/dashboard/purchase/suggested` — "Sipariş Aç" CTA

**Tek-satır CTA:**
- Accept butonunun yanına ikon-buton; tıklayınca modal:
  - Vendor dropdown (default: `product.preferred_vendor_id` veya isim eşleşmeli vendor; kullanıcı override).
  - Expected date (default: bugün + `vendor.lead_time_days ?? 14`).
  - Currency (vendor.currency default — ürün karar 2).
  - Quantity (frozen veya editable; editable → recommendation `edited` olarak da yazılır).
  - Unit price (cost_price ?? price fallback, editable).
  - Notes.
- Submit: `POST /api/purchase-orders/from-recommendations` → success: rec'in junction satırı yazılır, "Siparişe git" toast aksiyonu.

**Bulk CTA:** "Kabul edilenleri tek tıkla siparişe çevir" — vendor_id'ye göre grupla → her vendor için ayrı PO draft. Vendor'sız ürünler için ayrı modal.

**"Karar" hücresi altı:** Junction üzerinden lookup ile "PO #PO-2026-0042 (taslak)" linki.

### 9.4 `/dashboard/alerts` — inline aksiyonlar

#### 9.4.1 `actionFor()` güncelleme

```ts
function actionFor(alerts: AlertRow[]): { label: string; href: string } {
    const types = alerts.map(a => a.type);
    if (types.includes("sync_issue"))         return { label: "Sync hatasını incele", href: "/dashboard/parasut" };
    if (types.includes("order_shortage"))     return { label: "Siparişleri incele",  href: "/dashboard/orders" };
    if (types.includes("stock_critical"))     return { label: "Satın alma planla",   href: "/dashboard/purchase/suggested" };
    if (types.includes("order_deadline"))     return { label: "Satın alma planla",   href: "/dashboard/purchase/suggested" };
    if (types.includes("overdue_shipment"))   return { label: "Sevkiyatı yönet",     href: "/dashboard/orders" };
    return { label: "Stoku izle", href: "/dashboard/products" };
}
```

#### 9.4.2 `sync_issue` drawer (Faz 1 — küçük, hızlı, fayda yüksek)

- Hata detayı (alert.description + metadata pretty print).
- "Yeniden dene" butonu → `POST /api/alerts/[id]/sync-retry` → `serviceRetryParasutStep` çağrılır → başarı: alert auto-resolved.
- "Paraşüt sayfasına git" linki.

#### 9.4.3 `overdue_shipment` drawer inline ship form (Faz 7)

- `quote_expired` paterniyle paralel. State: `shipDate` (default bugün), `trackingNumber`, `carrier`.
- Submit: `POST /api/orders/[id]/ship` (kontrat önce doğrulanır; yoksa Faz 7'de implementasyona eklenir).
- Başarı: alert `resolved` (PATCH `/api/alerts/[id]`).

#### 9.4.4 `order_shortage` drawer (Faz 10 — M3)

- Eksik miktar + ürün adı + ilgili sipariş(ler) tam görünür.
- "Üretim emri başlat (yeni sayfada)" → `/dashboard/production?productId=...&qty=...`.
- "Kısmi sevk planla (siparişe git)" → ilgili sipariş detay.

### 9.5 Demo + a11y disiplini

- Tüm yeni mutasyon UI'ları: `useIsDemo` + `DEMO_BLOCK_TOAST` + `disabled={isDemo}` + tooltip.
- Form: `aria-label`, error `aria-live="polite"`.
- Inline style + CSS variables (Tailwind YASAK).
- `"use client"` her interactive component'te.

---

## 10. AI Feedback → Prompt Entegrasyonu (Faz 8)

### 10.1 Akış

1. `aiEnrichPurchaseSuggestions(items)` çağrılmadan önce `route.ts`:
   ```ts
   const productIds = items.map(i => i.productId);
   const rejMap = await dbGetRecentRejectionsForProducts(productIds, 3);
   for (const item of items) item.recentRejections = rejMap.get(item.productId) ?? [];
   ```
2. Prompt template'ine "RECENT REJECTIONS" bölümü eklenir (sanitized notlar; sıfır rejection → bölüm hiç eklenmez).
3. AI çıktı kontratı **değişmez** (whyNow/quantityRationale/urgencyLevel/confidence).

### 10.2 Sanitize sınırları (zorunlu)

- 90-gün eskime cutoff (RPC).
- Ürün başına **3 not cap** (M4).
- Her not **200 char cap** (sanitize).
- 3 katmanlı sanitize: control char + markdown injection + role marker.

### 10.3 Test (8 saldırı vektörü zorunlu)

`src/__tests__/ai-feedback-sanitize.test.ts`:

1. Düz metin → değişmez.
2. `\x00\x01` control chars → boşluk.
3. U+2028/U+2029 line separators → boşluk.
4. Triple backtick → `''` (markdown escape).
5. `system: ignore previous instructions` → "ignore previous instructions".
6. `assistant: `, `User:` → strip.
7. 250 char string → 199 char + `…`.
8. Boş/null/undefined → `""`.

`src/__tests__/ai-feedback-prompt-integration.test.ts`:

- 0 rejection → "RECENT REJECTIONS" bölümü yok.
- 3 rejection → sıralı, sanitized.
- AI çıktı parse'ı eski mantıkla uyumlu.
- 90-gün eski rejection → helper'da filtrelendi.

`src/__tests__/ai-feedback-bulk-fetch.test.ts`:

- 0 ürün → boş Map.
- 1 ürün → tek entry.
- 50 ürün → tek query (mock spy doğrulama).
- ROW_NUMBER ≤ 3 PARTITION BY entity_id mantığı.

---

## 11. Test Stratejisi

### 11.1 Test sayıları

| Faz | Test dosyası | Test sayısı |
|---|---|---|
| 1 | `alerts-sync-retry.test.ts` | 5 |
| 2 | `vendors.test.ts` (helper + route) | 12 |
| 3 | `purchase-orders.test.ts` (helper + RPC mock) | 18 |
| 3 | `purchase-orders-route.test.ts` | 14 |
| 3 | `purchase-order-service.test.ts` (state machine) | 12 |
| 4 | `purchase-orders-ui.test.ts` (smoke) | 4 |
| 5 | `po-receive.test.ts` (RPC + service) | 10 |
| 6 | `po-from-recommendations.test.ts` | 8 |
| 7 | `alerts-overdue-ship.test.ts` | 6 |
| 8 | `ai-feedback-sanitize.test.ts` | 8 |
| 8 | `ai-feedback-prompt-integration.test.ts` | 4 |
| 8 | `ai-feedback-bulk-fetch.test.ts` | 4 |
| 9 | `po-pdf.test.ts` | 5 |
| 10 | `alerts-action-coverage.test.ts` (actionFor) | 6 |
| **Toplam yeni** | — | **~116 test** |

### 11.2 Kritik senaryolar

**State machine:**
- Her geçerli/geçersiz geçiş.
- `received` ve `cancelled` terminal.
- M1: sent → draft sent_at=NULL set + audit.

**RPC concurrency:**
- `receive_po_lines` paralel: `FOR UPDATE` lock → çift kabul yok.
- `cancel_po` + `receive_po_lines` aynı anda: lock yarışı; biri hata.
- `confirm_po` + `cancel_po` paralel: ilki kazanır, ikincisi hata.

**B1 partial receive:**
- Line qty=10, received_qty=0, kabul=5 → `received_qty=5`, `status='pending'`, commitment `received_qty=5`, `incoming` 5 olur (10 değil).
- Sonra kabul=5 → `received_qty=10`, `status='received'`, commitment `received_qty=10`, `incoming` 0.
- Aşırı kabul (qty=10, received=8, kabul=5) → SQL CHECK ihlali RAISE EXCEPTION.

**B2-B3 atomic:**
- `create_purchase_order_with_lines` middle-fail → rollback: header + lines + junction hiçbiri kalmaz.
- Concurrent create: `generate_po_number` sequence garanti, çift po_number çıkmaz.

**B4 confirm guards:**
- Boş PO confirm → exception.
- Inactive vendor confirm → exception.
- expected_date NULL → exception.

**M2 junction:**
- 3 recommendation → 3 farklı line → her line için 1 junction satırı.
- Bulk: aynı vendor 5 rec → 5 line, 5 junction.
- Junction'dan reverse lookup: `recommendation_id` → PO line.

**B7 role guard:**
- viewer → 403 (cancel + receive).
- purchaser → 403 (cancel), 200 (receive).
- admin → 200 (her ikisi).

**Sanitize prompt injection:** 8 vektör.

### 11.3 E2E manuel doğrulama

1. Vendor yarat → product `preferred_vendor_id` atama.
2. `/suggested` ürün kabul et → "Sipariş Aç" → modal vendor pre-fill → submit.
3. PO list'te draft göründüğünü doğrula.
4. PO detail → "Onayla" → confirmed; commitment satırı `purchase_commitments`'da.
5. Products page → Teslimat Bekleyenler panelinde commitment göründüğünü kontrol et.
6. PO detail → "Mal Kabul" → kısmi 5 adet → on_hand +5, `received_qty=5`, `incoming` 5 (10 değil).
7. Tekrar mal kabul 5 adet → tam kabul, status=received, commitment=received.
8. Alert (varsa stock_critical) auto-resolve oldu mu kontrol.
9. Sync issue alert (mock fail tetikle) → drawer retry → resolve.
10. Overdue shipment alert → drawer ship → resolve.
11. Order shortage alert → drawer'da shortage özeti + iki yönlendirme linki.
12. Suggested sayfa: kabul edilen rec altında "PO #... (durum)" linki görünüyor.

---

## 12. Güvenlik Checklist

- [ ] Yeni POST/PATCH/DELETE endpoint'leri auth gerektiriyor (middleware).
- [ ] Demo modda mutasyon endpoint'leri 403.
- [ ] UI mutasyon butonları `useIsDemo` + `DEMO_BLOCK_TOAST` + tooltip + `disabled`.
- [ ] **B7 role guard:** `cancel` (admin), `receive` (admin/purchaser).
- [ ] Vendor input validation: `name`, `contact_email`, `tax_number`, `currency`, `lead_time_days`.
- [ ] PO line: `quantity > 0` int, `unit_price >= 0`, `discount_pct ∈ [0,100]`.
- [ ] `received_qty <= quantity` SQL CHECK (lines ve commitments).
- [ ] PO state transitions VALID_TRANSITIONS; invalid → 409.
- [ ] **B1:** `incoming` hesabı `quantity - received_qty` üzerinden — tüm kullanıcı noktaları güncel.
- [ ] **B2:** `po_number` RPC üzerinden üretilir; JS-side manuel set yok.
- [ ] **B3:** PO create + line replace tek RPC içinde atomik (multi-statement JS yok).
- [ ] **B4:** `confirm_po` boş PO + inactive vendor guard.
- [ ] **B5:** `pg_trgm` extension migration'da idempotent CREATE.
- [ ] **B6:** `po_counters` RLS ENABLE.
- [ ] `receive_po_lines` `FOR UPDATE` row lock + over-receive RAISE.
- [ ] `confirm_po` `expected_date NOT NULL` zorunlu.
- [ ] `cancel_po` `received` terminal'den iptal etmez.
- [ ] RLS: `vendors`, `purchase_orders`, `purchase_order_lines`, `po_counters`, `po_line_recommendations` hepsi ENABLE.
- [ ] Audit log: vendor CRUD, PO create/transition/cancel/receive/revise.
- [ ] **AI feedback prompt:** `sanitizeFeedbackForPrompt` 3 katmanlı + 200 char cap + 90-gün cutoff + 3 not cap.
- [ ] **M2 junction:** PO oluşturulurken source recommendation_id'ler atomik insert (RPC içinde).
- [ ] PDF endpoint: vendor email/sensitive data DOM exposed olmaz; demo modda görüntüleme izinli (read-only).
- [ ] Cron path eklenmiyor (PO modülü manuel).

---

## 13. Risk & Rollback

| Risk | Etki | Mitigasyon |
|---|---|---|
| Migration 049/050/051/052 fail | PO modülü açılmaz | Migration idempotent (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`); local dev'de dry run; her migration sonunda ROLLBACK SQL yorum bloğu |
| `inventory_movements` constraint genişletme | Mevcut kayıtlar bozulmaz (eklemeli, eski değerler geçerli) | — |
| **B1 öncesi `incoming` hesabı kullanan kod** | Kısmi kabulde çift sayım | Migration 050 sonrası tüm `incoming` hesap noktaları güncel; regresyon test'i |
| `confirm_po` sonrası double commitment insert | `incoming` 2x | `uniq_pc_active_po_line` partial unique index + `ON CONFLICT DO NOTHING` |
| `receive_po_lines` paralel | Aşırı kabul | `FOR UPDATE` + `received_qty + qty <= quantity` check |
| AI prompt injection | LLM jailbreak | 3 katmanlı sanitize + 8 vektör test |
| Vendor email yanlış adrese sızma | Bilgi sızıntısı | Vendor `contact_email` opsiyonel; otomatik e-posta MVP'de yok (manuel buton); test'te email destination assert |
| Recommendation accept → PO sırasında yarı tamamlanmış | Kullanıcı confused | `dbCreatePurchaseOrder` tek RPC transaction; başarısızsa rollback, recommendation status değişmez |
| `cancel_po` partially_received iken pending iptal etti, tedarikçi gerçekte gönderdiyse | Stok diff | Manuel commitment ekleme akışı kalır; kullanıcı override; audit log iz |
| **B7 role guard** kullanıcı metadata bozuksa | Yanlış 403 | `getCurrentUserRole` `'purchaser'` fallback ile minimum çalışır durumda |
| **M2 junction ile rec metadata.po_id eski code path** | Stale referans | Junction tek source-of-truth; `metadata.po_id` artık YAZILMAZ; eski rec'lerde varsa görmezden gelinir |
| Rollback FK violation (vendors → products.preferred_vendor_id) | Drop fail | M5: önce DROP COLUMN sonra DROP TABLE; ROLLBACK SQL bloğu her migration'da |

---

## 14. Faz Sırası (kullanıcı önerisi uygulandı)

| Faz | Ad | Süre (gün) | Bağımlılık | Ana iş |
|---|---|---|---|---|
| **1** | **Alert sync_issue retry** | 0.5 | yok | `actionFor` switch + drawer retry + `/api/alerts/[id]/sync-retry` |
| **2** | Vendor entity | 1.5 | yok | Mig. 048 + helpers + API + `/dashboard/vendors` |
| **3** | PO schema + RPC + helpers + API | 3 | Faz 2 | Mig. 049 + 050 + 052; B1-B6 hepsi; helper + service + endpoint |
| **4** | PO UI list/new/draft/confirm | 2 | Faz 3 | Sayfalar + sidebar reorganizasyonu + audit timeline |
| **5** | PO mal kabul | 1.5 | Faz 4 | Mig. 051 + receive_po_lines RPC + UI; B1 partial-receive E2E test |
| **6** | Suggested → PO köprüsü | 1.5 | Faz 5 | Tek + bulk CTA modal; M2 junction entegrasyonu |
| **7** | Alert overdue_shipment inline ship | 0.5 | yok (paralel) | Drawer form + `/api/orders/[id]/ship` kontrat doğrulama |
| **8** | AI feedback prompt | 1 | yok (paralel) | M4 bulk RPC + sanitize + 8 vektör test |
| **9** | PO PDF render | 1 | Faz 5 | Server-side print HTML; demo izinli |
| **10** | Alert order_shortage drawer | 0.5 | yok (paralel) | M3 — drawer bilgi yoğunluğu + iki yönlendirme |
| **(Sonra)** | Tedarikçiye otomatik e-posta | — | SMTP prod deploy | Resend `po_sent` notification type; manuel buton korunur |
| **(Sonra)** | Role/permission tam matrix | — | dış | Faz 11 ayrı plan: vendor/PO her aksiyon role'le bölünür |

**Toplam:** ~13 dev gün + test/refinement 2-3 gün → **~16 gün**.

Faz 1, 7, 8, 10 paralel olabilir (bağımsız).

---

## 15. Migration & Commit Sırası

| Adım | Branch | Commit mesajı | Migration |
|---|---|---|---|
| 1 | feat/alert-sync-retry | `feat(alerts): sync_issue drawer retry + actionFor case` | — |
| 2 | feat/vendors | `feat(vendors): vendor entity + CRUD + page` | 048 |
| 3 | feat/purchase-orders-schema | `feat(po): purchase_orders + lines + junction + atomic RPCs` | 049, 050, 052 |
| 4 | feat/purchase-orders-ui | `feat(po): UI list/new/detail + sidebar` | — |
| 5 | feat/po-receive | `feat(po): mal kabul (partial-receive RPC + UI + B1 fix)` | 051 |
| 6 | feat/po-from-recommendations | `feat(po): suggested → PO köprüsü (modal + bulk + junction)` | — |
| 7 | feat/alert-overdue-ship | `feat(alerts): overdue_shipment inline ship form` | — |
| 8 | feat/ai-feedback-prompt | `feat(ai): rejection feedback → prompt entegrasyonu (sanitize + bulk)` | get_recent_rejections RPC dahil |
| 9 | feat/po-pdf | `feat(po): PDF render (server-side HTML)` | — |
| 10 | feat/alert-order-shortage-drawer | `feat(alerts): order_shortage drawer iyileştirmeleri` | — |

Her commit: TS clean + lint 0 warning + tüm vitest yeşil + Next.js build geçer.

---

## 16. Tamamlanma Kabul Kriterleri (DoD)

Her faz için **eksiksiz** olmalı:

- [ ] Migration idempotent + ROLLBACK SQL yorum bloğu var.
- [ ] Helper + service test coverage (mock supabase + RPC mock).
- [ ] API route handler test (auth + validation + happy + error).
- [ ] UI smoke test (page render + key interaction).
- [ ] `npx tsc --noEmit` temiz.
- [ ] `npm run lint` 0 error, 0 warning.
- [ ] `npx vitest --run` tüm testler yeşil.
- [ ] `npm run build` Next.js production build başarılı.
- [ ] `CLAUDE.md` "Mevcut Durum" + `memory/current_focus.md` güncel.
- [ ] Audit log + RLS + demo guard manuel doğrulandı.
- [ ] **B1-B7 fix'leri ilgili faz'da kapsam içinde, test edildi.**
- [ ] **M2 junction satırları RPC içinde atomik yazılır.**
- [ ] AI prompt 8 saldırı vektörü test'i geçer (Faz 8).
- [ ] Migration `domain-rules.md` ile çelişmiyor.

**Modül-genel kabul:**

1. AI öneri kabul → Sipariş Aç → PO oluşur → confirm → commitment seed → kısmi kabul → on_hand artar (received_qty senkron) → tam kabul → status=received → alert (varsa) resolve. Tek E2E akış başarılı.
2. Vendor pasif edildiğinde aktif PO varsa engellenir; UI'da uyarı.
3. PO 'cancelled' iken yeni `confirm` denemesi 409.
4. Alerts page'de her tip için doğru aksiyon linki + drawer aksiyonu.
5. AI rejection notu sonraki cron'da prompt'a giriyor (log'da görünüyor); sanitize 8 vektör hepsini güvenli geçiriyor.
6. Yeni endpoint'ler demo modda 403 (mutasyon) veya 200 (GET).
7. **B7:** cancel admin only, receive admin/purchaser, viewer 403.
8. **B1:** kısmi kabul sonrası `incoming` doğru (10'un 5'i geldiyse incoming=5, 10 değil).
9. **M2:** PO line'a hangi recommendation'lardan geldiği junction üzerinden izlenebilir.

---

## 17. Notlar

- Plan **iteratif uygulanır.** Her faz commit'lendiğinde önceki testler bozulmaz.
- `domain-rules.md` ile uyumluluk her commit'te doğrulanır (özellikle stok modeli ve KDV).
- Mimari saygı:
  - Inline style + CSS variables (Tailwind YASAK).
  - `"use client"` her interactive component'te.
  - Supabase service_role + RLS pattern.
  - Audit log her durum geçişinde.
  - Demo guard tüm mutasyon noktalarında.
  - Yarış güvenli (`FOR UPDATE`, atomik RPC, status filter; Audit 12 öğretti).
- Bilinçli sınırlar:
  - Multi-warehouse yok (tek depo).
  - Tedarikçi performansı ayrı plan (`yuksek-etki.md`).
  - Tedarikçi self-service portal yok.
  - PO için çok aşamalı onay zinciri yok.
  - Role tam matrix Faz 11 ayrı plan.
- Plan değiştirme: ilerlemede tasarım değişikliği gerekirse bu dosya güncellenir; her değişiklik gerekçesi commit mesajında ve `memory/current_focus.md`'de loglanır.

---

**Plan bütünlüğü:** 17 ana bölümde, 5 migration (048-052), ~25 yeni dosya, ~116 yeni test, 10 commit içeren uçtan uca implementasyon. Her satır kasıtlı; eksiklikler kapsam dışı bölümünde explicit. Kullanıcı **Faz 1**'den başlayarak commit-by-commit ilerleyebilir; her aşamada DoD checklist tamamlanır.

**Onaylanmış kararlar (özet):** PO formatı `PO-2026-0001`, vendor para birimi default override edilebilir, e-posta sonraki sürüm, alert hepsi inline, AI feedback prompt'a beslenir (sanitize zorunlu), `/dashboard/vendors` yeni sayfa, B1-B7 blocker fix'leri schema + RPC seviyesinde işlendi, M1-M5 orta seviye iyileştirmeler dahil, faz sırası küçük-faydalı işten başlar.

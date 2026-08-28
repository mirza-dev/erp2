-- Migration 107: Paraşüt alış tarafı (Faz 13)
--
-- BAĞLAM: Bugüne dek Paraşüt entegrasyonu YALNIZ satış tarafını taşıyordu
-- (sales_orders + customers + products). Satın alma tarafında tek bir
-- `parasut_*` kolonu yoktu → alış faturası hiç oluşmuyor, dolayısıyla
-- İNDİRİLECEK KDV muhasebeye hiç ulaşmıyordu. Bu migration satış tarafının
-- (039/040/041) birebir aynasını satın alma için kurar.
--
-- TASARIM: Bir PO → BİR alış faturası, yalnız PO tamamen `received` olunca.
-- Kısmi mal kabulde fatura kesilmez: PO toplamını gider yazmak, malın yalnız
-- bir kısmı gelmişken muhasebeyi yanıltırdı (051'de `received` zaten tüm
-- satırlar tam alındığında set edilir → tutar birebir eşleşir).
--
-- STOK INVARIANT (satışın simetriği): alış faturası detaylarında `warehouse`
-- İLİŞKİSİ GÖNDERİLMEZ → Paraşüt stok hareketi yaratmaz. Paraşüt stoğu
-- Faz 15'teki mutabakattan gelir; ERP tek otoritedir.

-- ── 1. Vendors — Paraşüt contact eşlemesi + TTL lease mutex ──────────────────
-- (customers'daki 039 + 040 kalıbının aynısı: parasut_contact_id DAİMA
--  NULL-veya-gerçek-ID; "oluşturuluyor" durumu ayrı lease kolonlarında tutulur.)

ALTER TABLE vendors
    ADD COLUMN IF NOT EXISTS parasut_contact_id             text,
    ADD COLUMN IF NOT EXISTS parasut_synced_at              timestamptz,
    ADD COLUMN IF NOT EXISTS parasut_contact_creating_until timestamptz,
    ADD COLUMN IF NOT EXISTS parasut_contact_creating_owner uuid;

CREATE INDEX IF NOT EXISTS idx_vendors_parasut_contact_creating_until
    ON vendors (parasut_contact_creating_until)
    WHERE parasut_contact_creating_until IS NOT NULL;

-- ── 2. Purchase order lines — satır bazlı KDV ───────────────────────────────
-- Bugün KDV yalnız PO BAŞLIĞINDA tek oran (purchase_orders.vat_rate). %20 ve
-- %10 karışık bir alımda fatura yanlış çıkardı. NULL → başlık oranına düşer
-- (geriye dönük uyumlu; mevcut satırlar davranış değiştirmez).
-- Birim: YÜZDE (20 = %20) — Paraşüt `vat_rate` alanıyla aynı birim.
-- purchase_orders.vat_rate ise ORAN (0.20) tutar; servis katmanı çevirir.
ALTER TABLE purchase_order_lines
    ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2);

DO $$ BEGIN
    ALTER TABLE purchase_order_lines
        ADD CONSTRAINT chk_pol_vat_rate
        CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Purchase orders — tedarikçi fatura künyesi ───────────────────────────
-- KDV İNDİRİMİ İÇİN ZORUNLU: alış faturasının resmî kimliği tedarikçinin
-- kendi fatura numarası ve tarihidir; PO numarası DEĞİLDİR. Fatura fiziksel
-- olarak malla birlikte geldiği için mal kabul anında girilir.
-- Boş bırakılabilir (akış bloklanmaz) — o durumda Paraşüt'e künyesiz gider ve
-- servis katmanı "muhasebeci tamamlasın" uyarısı açar.
ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS vendor_invoice_no   text,
    ADD COLUMN IF NOT EXISTS vendor_invoice_date date;

-- ── 4. Purchase orders — Paraşüt senkron durumu ─────────────────────────────

ALTER TABLE purchase_orders
    -- Belge kimliği + audit
    ADD COLUMN IF NOT EXISTS parasut_bill_id                  text,
    ADD COLUMN IF NOT EXISTS parasut_bill_no                  text,
    ADD COLUMN IF NOT EXISTS parasut_bill_synced_at           timestamptz,
    ADD COLUMN IF NOT EXISTS parasut_bill_error               text,
    -- Durable crash marker: create çağrıldı ama DB yazımı tamamlanmadıysa
    -- sonraki deneme remote lookup'a düşer (mükerrer fatura koruması).
    ADD COLUMN IF NOT EXISTS parasut_bill_create_attempted_at timestamptz,
    -- Step state machine + backoff (sales_orders ile aynı sözleşme)
    ADD COLUMN IF NOT EXISTS parasut_step                     text,
    ADD COLUMN IF NOT EXISTS parasut_error_kind               text,
    ADD COLUMN IF NOT EXISTS parasut_retry_count              integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS parasut_next_retry_at            timestamptz,
    ADD COLUMN IF NOT EXISTS parasut_last_failed_step         text,
    -- Claim/lease (tek orkestra tek kilit)
    ADD COLUMN IF NOT EXISTS parasut_sync_lock_until          timestamptz,
    ADD COLUMN IF NOT EXISTS parasut_sync_lock_owner          uuid;

DO $$ BEGIN
    ALTER TABLE purchase_orders
        ADD CONSTRAINT chk_po_parasut_step
        CHECK (parasut_step IS NULL OR parasut_step IN
               ('contact','product','bill','done'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE purchase_orders
        ADD CONSTRAINT chk_po_parasut_error_kind
        CHECK (parasut_error_kind IS NULL OR parasut_error_kind IN
               ('auth','validation','rate_limit','server','network','not_found'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Mükerrer fatura emniyet ağı (DB seviyesinde)
CREATE UNIQUE INDEX IF NOT EXISTS po_parasut_bill_unique
    ON purchase_orders (parasut_bill_id)
    WHERE parasut_bill_id IS NOT NULL;

-- CRON retry taraması (sorgu ile birebir uyumlu: kalıcı hatalar hariç)
CREATE INDEX IF NOT EXISTS idx_po_parasut_retry
    ON purchase_orders (parasut_next_retry_at)
    WHERE parasut_step IS NOT NULL
      AND parasut_step != 'done'
      AND (parasut_error_kind IS NULL OR parasut_error_kind NOT IN ('validation','auth'));

-- ── 5. Claim / release RPC (SECURITY DEFINER, yalnız service_role) ──────────
-- parasut_claim_sync'in PO ikizi. Eligibility guard'ı DB'de: yalnız tamamen
-- mal kabul edilmiş, henüz bitmemiş ve kilitli olmayan PO claim edilebilir.

CREATE OR REPLACE FUNCTION parasut_claim_po_sync(
    p_po_id      uuid,
    p_owner      uuid,
    p_lease_secs int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE updated integer;
BEGIN
    UPDATE purchase_orders
    SET parasut_sync_lock_until = now() + make_interval(secs => p_lease_secs),
        parasut_sync_lock_owner = p_owner
    WHERE id = p_po_id
      AND status = 'received'
      AND (parasut_step IS NULL OR parasut_step != 'done')
      AND (parasut_sync_lock_until IS NULL OR parasut_sync_lock_until < now());
    GET DIAGNOSTICS updated = ROW_COUNT;
    RETURN updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION parasut_release_po_sync(
    p_po_id uuid,
    p_owner uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE purchase_orders
    SET parasut_sync_lock_until = NULL,
        parasut_sync_lock_owner = NULL
    WHERE id = p_po_id
      AND parasut_sync_lock_owner = p_owner;
END;
$$;

REVOKE ALL ON FUNCTION parasut_claim_po_sync(uuid, uuid, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION parasut_release_po_sync(uuid, uuid)    FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION parasut_claim_po_sync(uuid, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION parasut_release_po_sync(uuid, uuid)    TO service_role;

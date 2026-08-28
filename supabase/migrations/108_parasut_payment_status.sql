-- Migration 108: Paraşüt tahsilat/ödeme durumu geri okuma (Faz 14)
--
-- BAĞLAM: Entegrasyon bugüne dek TEK YÖNLÜ idi (ERP → Paraşüt). Faturanın
-- tahsil edilip edilmediği yalnız Paraşüt'te biliniyordu; ERP'de gerçek
-- alacak bilgisi YOKTU. Genel Bakış'taki "Açık Alacak" kartı tam da bu yüzden
-- 2026-06'da kaldırılmıştı (created_at+30g sabit vade varsayan, ödemeleri hiç
-- düşmeyen bir proxy hesaptı → güvenilmezdi).
--
-- Bu migration Paraşüt'ün tahsilat gerçeğini ERP'ye geri yazacak alanları açar.
-- YAZMA YÖNÜ YOK: ERP Paraşüt'e tahsilat kaydetmez, yalnız OKUR.

-- ── 1. Satış faturası tahsilat durumu ───────────────────────────────────────

ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS parasut_payment_status     text,
    -- Kalan tutar faturanın KENDİ para biriminde.
    ADD COLUMN IF NOT EXISTS parasut_remaining          numeric(14,2),
    -- Paraşüt'ün hesapladığı TL karşılığı. Toplama YALNIZ bunun üzerinden
    -- yapılır — farklı para birimlerindeki `parasut_remaining` değerleri
    -- ASLA toplanmaz (domain kuralı).
    ADD COLUMN IF NOT EXISTS parasut_remaining_try      numeric(14,2),
    ADD COLUMN IF NOT EXISTS parasut_payment_checked_at timestamptz;

-- ── 2. Alış faturası ödeme durumu ───────────────────────────────────────────

ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS parasut_payment_status     text,
    ADD COLUMN IF NOT EXISTS parasut_remaining          numeric(14,2),
    ADD COLUMN IF NOT EXISTS parasut_remaining_try      numeric(14,2),
    ADD COLUMN IF NOT EXISTS parasut_payment_checked_at timestamptz;

-- Paraşüt enum'u: paid | overdue | unpaid | partially_paid
DO $$ BEGIN
    ALTER TABLE sales_orders
        ADD CONSTRAINT chk_so_parasut_payment_status
        CHECK (parasut_payment_status IS NULL OR parasut_payment_status IN
               ('paid','overdue','unpaid','partially_paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE purchase_orders
        ADD CONSTRAINT chk_po_parasut_payment_status
        CHECK (parasut_payment_status IS NULL OR parasut_payment_status IN
               ('paid','overdue','unpaid','partially_paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Poll CRON adayları: faturası kesilmiş ama henüz tahsil edilmemiş kayıtlar.
-- `paid` olanlar bir daha sorgulanmaz (durum terminal) → çağrı sayısı düşer.
CREATE INDEX IF NOT EXISTS idx_so_parasut_payment_poll
    ON sales_orders (parasut_payment_checked_at)
    WHERE parasut_invoice_id IS NOT NULL
      AND (parasut_payment_status IS NULL OR parasut_payment_status != 'paid');

CREATE INDEX IF NOT EXISTS idx_po_parasut_payment_poll
    ON purchase_orders (parasut_payment_checked_at)
    WHERE parasut_bill_id IS NOT NULL
      AND (parasut_payment_status IS NULL OR parasut_payment_status != 'paid');

-- ── 3. Yeni uyarı tipi: payment_overdue ─────────────────────────────────────
-- 101'in listesi + payment_overdue. (`user_note` 092'de BİLİNÇLİ olarak
-- düşürülmüştü — takvim notları ayrı `calendar_notes` tablosuna taşındı;
-- listeye geri EKLENMEZ.)
ALTER TABLE alerts
    DROP CONSTRAINT IF EXISTS alerts_type_check,
    ADD CONSTRAINT alerts_type_check CHECK (type IN (
        'stock_critical', 'stock_risk', 'purchase_recommended',
        'order_shortage', 'sync_issue',
        'order_deadline', 'quote_expired', 'overdue_shipment',
        'po_overdue', 'rfq_response_due', 'payment_overdue'
    ));

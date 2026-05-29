-- ============================================================
-- Migration 074 — Teklif revizyon zinciri
--
-- Gönderilmiş/reddedilmiş/süresi dolmuş teklifin düzenlenebilir kopyası
-- (revizyon) yaratılır; kaynak 'revised' (kilitli) olur. root_quote_id tüm
-- revizyonları KÖKE bağlar (flat chain — V2 R1→R2 traversal bug fix).
--
-- Numara: kök + suffix (TKL-2026-001 → -R2, -R3). Yıllık counter tüketmez
-- (073 backfill regex ^TKL-\d{4}-\d+$ suffix'li dışlar — V5-A5 ile tutarlı).
--
-- Kullanıcı kararları: revize edilebilir = sent/rejected/expired; kaynak →
-- 'revised'; revizyon valid_until=NULL (expired kaynağın geçmiş tarihi yeni
-- draft'ı CRON'da re-expire etmesin + mid-edit 409 olmasın).
--
-- V7-A1: SECURITY DEFINER YOK (INVOKER). Idempotent.
-- ============================================================

-- a) Kolonlar
alter table quotes add column if not exists revision_no   int  not null default 1;
alter table quotes add column if not exists root_quote_id uuid references quotes(id) on delete set null;
create index if not exists idx_quotes_root on quotes(root_quote_id);

-- b) status CHECK genişlet (+revised) — 034 deseni
alter table quotes drop constraint if exists quotes_status_check;
do $$ begin
    alter table quotes add constraint quotes_status_check
        check (status in ('draft','sent','accepted','rejected','expired','revised'));
exception when duplicate_object then null; end $$;

-- c) create_quote_revision RPC
create or replace function create_quote_revision(p_source_id uuid)
returns uuid
language plpgsql
as $$
declare
    v_src    quotes%rowtype;
    v_root   uuid;
    v_rev    int;
    v_base   text;
    v_number text;
    v_new_id uuid;
begin
    -- Kaynağı ATOMİK consume et: eligibility kontrolü + 'revised' flip tek UPDATE'te.
    -- Eşzamanlı ikinci revize aynı satırda bloklanır; ilk commit'ten sonra status
    -- artık 'revised' → WHERE eşleşmez → 0 satır → 42501. Böylece aynı kaynaktan
    -- ÇİFT revizyon üretilemez (eski kilitsiz SELECT+guard yarışı kapandı).
    update quotes
       set status = 'revised', updated_at = now()
     where id = p_source_id and status in ('sent','rejected','expired')
    returning * into v_src;

    if not found then
        -- Ya kaynak yok ya da uygun statüde değil (zaten revised/draft/accepted ya da
        -- eşzamanlı revize tarafından tüketildi). Varlık kontrolüyle ayırt et:
        perform 1 from quotes where id = p_source_id;
        if found then
            raise exception 'Bu durumdaki teklif revize edilemez veya zaten revize edildi.'
                using errcode = '42501';
        else
            raise exception 'Kaynak teklif bulunamadı.' using errcode = 'P0002';
        end if;
    end if;

    v_root := coalesce(v_src.root_quote_id, v_src.id);

    -- Kök satırı kilitle: farklı source'lar aynı kökten eşzamanlı revize edilirse
    -- revision_no çakışmasını serialize et (source==root ise zaten yukarıda kilitli).
    perform 1 from quotes where id = v_root for update;

    select max(revision_no) + 1
      into v_rev
      from quotes
     where id = v_root or root_quote_id = v_root;

    select quote_number into v_base from quotes where id = v_root;
    v_number := v_base || '-R' || v_rev::text;

    -- Yeni revizyon: kaynağın tüm header alanları + revizyon meta; status=draft;
    -- valid_until=NULL (CRON re-expire önlemi); quote_date=bugün.
    insert into quotes (
        quote_number, status, revision_no, root_quote_id,
        customer_id, customer_name, customer_contact, customer_phone,
        customer_email, customer_address,
        sales_rep, sales_phone, sales_email,
        currency, vat_rate, subtotal, vat_total, grand_total, discount_amount,
        notes, sig_prepared, sig_approved, sig_manager,
        quote_date, valid_until,
        delivery_method, payment_method,
        seller_name, seller_phone, seller_email, seller_address,
        seller_tax_id, seller_website, seller_logo_url,
        updated_at
    ) values (
        v_number, 'draft', v_rev, v_root,
        v_src.customer_id, v_src.customer_name, v_src.customer_contact, v_src.customer_phone,
        v_src.customer_email, v_src.customer_address,
        v_src.sales_rep, v_src.sales_phone, v_src.sales_email,
        v_src.currency, v_src.vat_rate, v_src.subtotal, v_src.vat_total, v_src.grand_total, v_src.discount_amount,
        v_src.notes, v_src.sig_prepared, v_src.sig_approved, v_src.sig_manager,
        current_date, null,
        v_src.delivery_method, v_src.payment_method,
        v_src.seller_name, v_src.seller_phone, v_src.seller_email, v_src.seller_address,
        v_src.seller_tax_id, v_src.seller_website, v_src.seller_logo_url,
        now()
    )
    returning id into v_new_id;

    -- Satırları kopyala (069/071 kolon listesi)
    insert into quote_line_items (
        quote_id, position, product_id, product_code,
        lead_time, description, quantity, unit_price,
        line_total, hs_code, weight_kg, size_text,
        unit_weight_kg, kg_manual_override
    )
    select v_new_id, position, product_id, product_code,
           lead_time, description, quantity, unit_price,
           line_total, hs_code, weight_kg, size_text,
           unit_weight_kg, kg_manual_override
      from quote_line_items
     where quote_id = p_source_id;

    -- (Kaynak status='revised' yukarıda atomik consume'da yazıldı — burada tekrar YOK.)

    return v_new_id;
end;
$$;

-- ROLLBACK:
-- drop function if exists create_quote_revision(uuid);
-- alter table quotes drop constraint if exists quotes_status_check;
-- alter table quotes add constraint quotes_status_check
--     check (status in ('draft','sent','accepted','rejected','expired'));
-- drop index if exists idx_quotes_root;
-- alter table quotes drop column if exists root_quote_id;
-- alter table quotes drop column if exists revision_no;

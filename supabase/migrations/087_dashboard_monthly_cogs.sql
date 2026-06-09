-- ============================================================
-- 087 · Genel Bakış (Executive Dashboard) — aylık COGS agregasyonu
-- ============================================================
-- "Ciro & Maliyet Trendi" + "Finansal Özet" (brüt kâr / marj) için
-- GERÇEK satılan malın maliyeti (COGS):
--   COGS = Σ( order_lines.quantity × products.cost_price )
-- Sipariş ayına göre + ÜRÜN para birimi bazında gruplanır (normalizasyon
-- istemcide raporlama para birimine yapılır — ciro ile aynı yol).
--
-- Ciro ile tutarlı filtre: iptal/taslak siparişler hariç.
-- RBAC: bu RPC service_role'dür; endpoint (/api/dashboard/finance)
--       view_purchase_costs ile gate'lenir.
-- ============================================================

create or replace function dashboard_monthly_cogs(p_start date)
returns table(month text, currency char(3), cogs numeric)
language sql
stable
security definer
set search_path = public
as $$
    select to_char(so.created_at, 'YYYY-MM')              as month,
           p.currency                                      as currency,
           sum(ol.quantity * coalesce(p.cost_price, 0))    as cogs
    from order_lines ol
    join sales_orders so on so.id = ol.order_id
    join products     p  on p.id  = ol.product_id
    where so.commercial_status not in ('cancelled', 'draft')
      and so.created_at >= p_start
    group by 1, 2;
$$;

revoke all on function dashboard_monthly_cogs(date) from public, anon, authenticated;
grant execute on function dashboard_monthly_cogs(date) to service_role;

-- ============================================================
-- ROLLBACK
-- ------------------------------------------------------------
-- drop function if exists dashboard_monthly_cogs(date);
-- ============================================================

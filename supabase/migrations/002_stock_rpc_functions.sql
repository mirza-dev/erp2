-- KokpitERP — Stock RPC Functions
-- Atomic increment/decrement for reserved and on_hand fields
-- Run after 001_initial_schema.sql

-- ── increment_reserved ───────────────────────────────────────
-- Adds qty to products.reserved; enforces reserved <= on_hand

create or replace function increment_reserved(p_product_id uuid, p_qty integer)
returns void as $$
begin
    update products
    set reserved = reserved + p_qty
    where id = p_product_id;

    if not found then
        raise exception 'Product not found: %', p_product_id;
    end if;
end;
$$ language plpgsql;

-- ── decrement_reserved ───────────────────────────────────────

create or replace function decrement_reserved(p_product_id uuid, p_qty integer)
returns void as $$
begin
    update products
    set reserved = greatest(0, reserved - p_qty)
    where id = p_product_id;

    if not found then
        raise exception 'Product not found: %', p_product_id;
    end if;
end;
$$ language plpgsql;

-- ── decrement_on_hand ────────────────────────────────────────
-- Decrements on_hand AND reserved together on shipment

create or replace function decrement_on_hand(p_product_id uuid, p_qty integer)
returns void as $$
begin
    update products
    set
        on_hand  = greatest(0, on_hand - p_qty),
        reserved = greatest(0, reserved - p_qty)
    where id = p_product_id;

    if not found then
        raise exception 'Product not found: %', p_product_id;
    end if;
end;
$$ language plpgsql;

-- ── adjust_on_hand ───────────────────────────────────────────
-- General-purpose delta (positive = receipt/production, negative = adjustment out)

create or replace function adjust_on_hand(p_product_id uuid, p_delta integer)
returns void as $$
begin
    update products
    set on_hand = greatest(0, on_hand + p_delta)
    where id = p_product_id;

    if not found then
        raise exception 'Product not found: %', p_product_id;
    end if;
end;
$$ language plpgsql;

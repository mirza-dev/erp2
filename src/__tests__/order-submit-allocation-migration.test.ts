/**
 * Migration 082 — rezervasyonu pending_approval'a taşı.
 * Source-regress: allocate_order_lines helper + submit_order_for_approval (draft
 * guard, zero-stock reddi, hedef='pending_approval') + approve_order (light,
 * legacy fallback) + pending backfill + ROLLBACK.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(
    join(process.cwd(), "supabase/migrations/082_reservation_at_pending.sql"),
    "utf8",
);

describe("Migration 082 — reservation at pending", () => {
    it("allocate_order_lines helper: rezervasyon + commercial_status'a DOKUNMAZ", () => {
        expect(SQL).toMatch(/create or replace function allocate_order_lines\(p_order_id uuid\)/);
        expect(SQL).toMatch(/update products\s+set reserved = reserved \+ v_reservable/);
        expect(SQL).toMatch(/insert into stock_reservations/);
        expect(SQL).toMatch(/insert into shortages/);
    });

    it("submit_order_for_approval: draft guard + allocate + hedef pending_approval", () => {
        expect(SQL).toMatch(/create or replace function submit_order_for_approval\(p_order_id uuid\)/);
        expect(SQL).toMatch(/v_order\.commercial_status <> 'draft'/);
        expect(SQL).toMatch(/onaya gönderilemez/);
        expect(SQL).toMatch(/v_alloc := allocate_order_lines\(p_order_id\)/);
        expect(SQL).toMatch(/commercial_status\s*=\s*'pending_approval'/);
    });

    it("submit: zero-stock guard (hiç rezerve edilemezse reddet)", () => {
        expect(SQL).toMatch(/total_reserved'\)::integer = 0/);
        expect(SQL).toMatch(/Hiçbir satır için yeterli stok yok/);
    });

    it("approve_order: pending guard + light flip + legacy unallocated fallback", () => {
        expect(SQL).toMatch(/create or replace function approve_order\(p_order_id uuid\)/);
        expect(SQL).toMatch(/v_order\.commercial_status <> 'pending_approval'/);
        // legacy fallback: rezervsiz pending → allocation
        expect(SQL).toMatch(/v_order\.fulfillment_status = 'unallocated'/);
        expect(SQL).toMatch(/commercial_status\s*=\s*'approved'/);
    });

    it("audit: order_submitted_for_approval + order_approved", () => {
        expect(SQL).toMatch(/'order_submitted_for_approval'/);
        expect(SQL).toMatch(/'order_approved'/);
    });

    it("backfill: rezervsiz pending siparişler için allocation", () => {
        expect(SQL).toMatch(/do \$\$/);
        expect(SQL).toMatch(/commercial_status = 'pending_approval'/);
        expect(SQL).toMatch(/not exists \([\s\S]*?stock_reservations/);
    });

    it("ROLLBACK bloğu var (3 fonksiyon)", () => {
        expect(SQL).toMatch(/ROLLBACK:/);
        expect(SQL).toMatch(/DROP FUNCTION IF EXISTS submit_order_for_approval/);
        expect(SQL).toMatch(/DROP FUNCTION IF EXISTS approve_order\(uuid\)/);
        expect(SQL).toMatch(/DROP FUNCTION IF EXISTS allocate_order_lines/);
    });
});

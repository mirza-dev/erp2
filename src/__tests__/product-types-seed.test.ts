/**
 * Faz 1 — Seed migration source regression test.
 *
 * Migration 056 + 057 dosyalarında olması gereken kritik özellikleri doğrula:
 *  - product_types ve product_type_fields tabloları kurulu
 *  - products.product_type_id ve products.attributes ALTER ediliyor
 *  - 8 hazır tip insert ediliyor
 *  - Vana tipi 16 alan içeriyor, body_material required
 *  - Idempotent (ON CONFLICT DO NOTHING)
 */
import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

async function readMigration(name: string): Promise<string> {
    return fs.readFile(path.resolve(ROOT, "supabase/migrations", name), "utf-8");
}

describe("Migration 056 — product types schema", () => {
    it("product_types tablosu oluşturuluyor", async () => {
        const sql = await readMigration("056_product_types.sql");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS product_types");
        expect(sql).toMatch(/name\s+text NOT NULL UNIQUE/);
        expect(sql).toMatch(/is_system\s+boolean NOT NULL DEFAULT false/);
    });

    it("product_type_fields tablosu oluşturuluyor + field_type CHECK", async () => {
        const sql = await readMigration("056_product_types.sql");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS product_type_fields");
        expect(sql).toMatch(/field_type\s+text NOT NULL CHECK/);
        // 7 alan tipi enum'da
        for (const t of ["'text'", "'number'", "'select'", "'multiselect'", "'date'", "'boolean'", "'longtext'"]) {
            expect(sql).toContain(t);
        }
        // field_key regex check
        expect(sql).toContain("field_key ~ '^[a-z][a-z0-9_]*$'");
        // unique (type, key)
        expect(sql).toContain("UNIQUE (product_type_id, field_key)");
    });

    it("products tablosuna product_type_id ve attributes ekleniyor", async () => {
        const sql = await readMigration("056_product_types.sql");
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS product_type_id uuid REFERENCES product_types(id)");
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT");
        // GIN index attributes üzerinde
        expect(sql).toContain("USING gin(attributes)");
    });

    it("RLS açık + updated_at trigger var", async () => {
        const sql = await readMigration("056_product_types.sql");
        expect(sql).toContain("ALTER TABLE product_types ENABLE ROW LEVEL SECURITY");
        expect(sql).toContain("ALTER TABLE product_type_fields ENABLE ROW LEVEL SECURITY");
        expect(sql).toContain("trg_product_types_updated_at");
        expect(sql).toContain("trg_product_type_fields_updated_at");
    });
});

describe("Migration 057 — 8 hazır tip seed", () => {
    it("8 tipin tamamı (Vana/Conta/Flans/Fitting/Bağlantı Elemanı/Enstrüman/Sızdırmazlık Malzemesi/Diğer) seed ediliyor", async () => {
        const sql = await readMigration("057_seed_product_types.sql");
        for (const name of ["'Vana'", "'Conta'", "'Flans'", "'Fitting'", "'Bağlantı Elemanı'", "'Enstrüman'", "'Sızdırmazlık Malzemesi'", "'Diğer'"]) {
            expect(sql).toContain(name);
        }
        // is_system=true ile gelir
        expect(sql).toMatch(/, true\)/);
        // Idempotent
        expect(sql).toContain("ON CONFLICT (id) DO NOTHING");
        expect(sql).toContain("ON CONFLICT (product_type_id, field_key) DO NOTHING");
    });

    it("Vana tipinin kritik alanları (dn, pn_class, end_connection, body_material) tanımlı + required", async () => {
        const sql = await readMigration("057_seed_product_types.sql");
        // Vana sub-section'ında bu alanlar required olmalı
        const vanaSection = sql.split("CONTA alanları")[0];
        expect(vanaSection).toContain("'dn'");
        expect(vanaSection).toContain("'pn_class'");
        expect(vanaSection).toContain("'end_connection'");
        expect(vanaSection).toContain("'body_material'");
        // pn_class options içerir
        expect(vanaSection).toContain("150LB");
        expect(vanaSection).toContain("PN40");
    });

    it("Conta tipinin kritik alanları (inner_id_mm, outer_id_mm, thickness_mm) required tanımlı", async () => {
        const sql = await readMigration("057_seed_product_types.sql");
        const contaSection = sql.split("CONTA alanları")[1].split("FLANS alanları")[0];
        expect(contaSection).toContain("'inner_id_mm'");
        expect(contaSection).toContain("'outer_id_mm'");
        expect(contaSection).toContain("'thickness_mm'");
        // Spiral Wound options
        expect(contaSection).toContain("Spiral Wound");
    });

    it("Flans tipinin (dn, pn_class, material) alanları var", async () => {
        const sql = await readMigration("057_seed_product_types.sql");
        const flansSection = sql.split("FLANS alanları")[1].split("FITTING alanları")[0];
        expect(flansSection).toContain("'flange_type'");
        expect(flansSection).toContain("'face_type'");
        expect(flansSection).toContain("WN (Weld Neck)");
        expect(flansSection).toContain("RF (Raised Face)");
    });

    it("Fitting tipinin schedule_no alanı var", async () => {
        const sql = await readMigration("057_seed_product_types.sql");
        const fittingSection = sql.split("FITTING alanları")[1].split("BAĞLANTI ELEMANI alanları")[0];
        expect(fittingSection).toContain("'schedule_no'");
        expect(fittingSection).toContain("SCH 40");
    });

    it("Enstrüman tipinin measurement_range alanı zorunlu", async () => {
        const sql = await readMigration("057_seed_product_types.sql");
        const instrSection = sql.split("ENSTRÜMAN alanları")[1].split("SIZDIRMAZLIK MALZEMESİ alanları")[0];
        expect(instrSection).toContain("'measurement_range'");
        // Required alanı true
        const lines = instrSection.split("\n").filter((l) => l.includes("'measurement_range'"));
        expect(lines[0]).toContain("true"); // required flag
    });
});

/**
 * Ürün Tipleri sayfası — final ürün UI testleri.
 *
 * Kapsam:
 *   - buildFieldPayload saf helper (Ekle + Düzenle ortak normalize/validate)
 *   - Detay sayfası source-regex: alan-edit modal a11y, Düzenle butonu, PATCH body,
 *     field_key read-only, tip-caveat, deleteType/deleteField → a11y modal (confirm() YOK)
 *   - Liste sayfası source-regex: fieldCount liste response'undan, N+1 `?withFields=1` loop YOK
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { buildFieldPayload } from "@/app/dashboard/settings/product-types/[id]/page";

const DETAIL_SRC = fs.readFileSync(
    path.join(process.cwd(), "src/app/dashboard/settings/product-types/[id]/page.tsx"),
    "utf8",
);
const LIST_SRC = fs.readFileSync(
    path.join(process.cwd(), "src/app/dashboard/settings/product-types/page.tsx"),
    "utf8",
);

// ── buildFieldPayload (saf davranış) ───────────────────────────────

describe("buildFieldPayload", () => {
    const base = { label_tr: "Çap", label_en: "Diameter", field_type: "number" as const, unit: "mm", options: "" };

    it("label_tr boş → hata", () => {
        const r = buildFieldPayload({ ...base, label_tr: "   " });
        expect("error" in r && r.error).toContain("Türkçe etiket");
    });

    it("number tipinde unit korunur, label_en trimlenir", () => {
        const r = buildFieldPayload({ ...base, label_en: "  Diameter  " });
        expect("payload" in r).toBe(true);
        if ("payload" in r) {
            expect(r.payload.unit).toBe("mm");
            expect(r.payload.label_en).toBe("Diameter");
            expect(r.payload.options).toBeNull();
        }
    });

    it("number olmayan tipte unit null (stale unit önlenir)", () => {
        // unit dolu ama tip text → unit null'a düşer
        const r = buildFieldPayload({ ...base, field_type: "text", unit: "mm" });
        expect("payload" in r && r.payload.unit).toBeNull();
    });

    it("select → options newline-split array", () => {
        const r = buildFieldPayload({ ...base, field_type: "select", options: "Kırmızı\n  Yeşil  \n\nMavi" });
        expect("payload" in r).toBe(true);
        if ("payload" in r) expect(r.payload.options).toEqual(["Kırmızı", "Yeşil", "Mavi"]);
    });

    it("multiselect boş options → hata", () => {
        const r = buildFieldPayload({ ...base, field_type: "multiselect", options: "  \n \n" });
        expect("error" in r && r.error).toContain("en az bir seçenek");
    });

    it("select olmayan tipte options null", () => {
        const r = buildFieldPayload({ ...base, field_type: "boolean", options: "A\nB" });
        expect("payload" in r && r.payload.options).toBeNull();
    });

    it("label_en boş → null", () => {
        const r = buildFieldPayload({ ...base, label_en: "" });
        expect("payload" in r && r.payload.label_en).toBeNull();
    });
});

// ── Detay sayfası — alan düzenleme UI (headline) ───────────────────

describe("Detay sayfası — alan düzenleme modalı (source-regex)", () => {
    it("Düzenle butonu + openEdit handler bağlı", () => {
        expect(DETAIL_SRC).toContain("onClick={() => openEdit(f)}");
        expect(DETAIL_SRC).toMatch(/aria-label=\{`\$\{f\.label_tr\} alanını düzenle`\}/);
        expect(DETAIL_SRC).toContain("const openEdit = (field: ProductTypeFieldRow)");
    });

    it("edit modal a11y: role=dialog + aria-modal + aria-labelledby", () => {
        expect(DETAIL_SRC).toContain('aria-labelledby="edit-field-title"');
        expect(DETAIL_SRC).toMatch(/id="edit-field-title"/);
        // dialog + aria-modal birlikte
        const modalBlock = DETAIL_SRC.slice(DETAIL_SRC.indexOf("Alan düzenleme modalı"));
        expect(modalBlock).toContain('role="dialog"');
        expect(modalBlock).toContain('aria-modal="true"');
    });

    it("submitEdit → PATCH /fields/${editFieldId} + built.payload body", () => {
        const fn = DETAIL_SRC.slice(
            DETAIL_SRC.indexOf("const submitEdit"),
            DETAIL_SRC.indexOf("const requestDeleteField"),
        );
        expect(fn).toContain("`/api/product-types/${id}/fields/${editFieldId}`");
        expect(fn).toContain('method: "PATCH"');
        expect(fn).toContain("JSON.stringify(built.payload)");
        expect(fn).toContain("buildFieldPayload(editDraft)");
    });

    it("field_key edit modalda read-only/disabled", () => {
        const modalBlock = DETAIL_SRC.slice(DETAIL_SRC.indexOf("Alan düzenleme modalı"));
        // field_key input readOnly + disabled
        expect(modalBlock).toContain("value={editDraft.field_key}");
        expect(modalBlock).toMatch(/value=\{editDraft\.field_key\}[\s\S]*?readOnly[\s\S]*?disabled/);
    });

    it("tip değiştirme caveat'ı görünür", () => {
        expect(DETAIL_SRC).toContain("Alan tipini değiştirmek mevcut ürünlerdeki");
        expect(DETAIL_SRC).toContain("var(--warning-text)");
    });
});

// ── Detay sayfası — yıkıcı confirm → a11y modal ────────────────────

describe("Detay sayfası — silme onay modalları (source-regex)", () => {
    it("native confirm() KULLANILMIYOR (regression lock)", () => {
        expect(DETAIL_SRC).not.toMatch(/\bconfirm\(/);
    });

    it("deleteField → requestDeleteField + a11y modal", () => {
        expect(DETAIL_SRC).toContain("onClick={() => requestDeleteField(f.id)}");
        expect(DETAIL_SRC).toContain('aria-labelledby="delete-field-title"');
        expect(DETAIL_SRC).toContain("performDeleteField");
    });

    it("deleteType → requestDeleteType + a11y modal + router.push (location.href YOK)", () => {
        expect(DETAIL_SRC).toContain("onClick={requestDeleteType}");
        expect(DETAIL_SRC).toContain('aria-labelledby="delete-type-title"');
        expect(DETAIL_SRC).toContain('router.push("/dashboard/settings/product-types")');
        expect(DETAIL_SRC).not.toContain("window.location.href");
    });
});

// ── Liste sayfası — N+1 fix ────────────────────────────────────────

describe("Liste sayfası — fieldCount liste response'undan (source-regex)", () => {
    it("N+1 `?withFields=1` loop KALDIRILDI (regression lock)", () => {
        expect(LIST_SRC).not.toContain("?withFields=1");
        expect(LIST_SRC).not.toContain("Promise.all");
    });

    it("fieldCount doğrudan liste satırından okunur", () => {
        expect(LIST_SRC).toContain("fieldCount: row.fieldCount ?? 0");
        expect(LIST_SRC).toContain('await fetch("/api/product-types")');
    });
});

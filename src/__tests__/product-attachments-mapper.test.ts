/**
 * Faz 2d — mapProductAttachment mapper unit tests.
 *
 * Coverage:
 *   - Tüm field mapping doğru (camelCase + DB → frontend)
 *   - signedUrl default null (mapper opsiyonel 2. arg)
 *   - uploadedBy null koruma
 *   - isPrimaryImage true/false geçer
 */
import { describe, it, expect } from "vitest";
import { mapProductAttachment } from "@/lib/api-mappers";
import type { ProductAttachmentRow } from "@/lib/database.types";

function makeRow(overrides: Partial<ProductAttachmentRow> = {}): ProductAttachmentRow {
    return {
        id: "00000000-0000-4000-8000-000000000010",
        product_id: "00000000-0000-4000-8000-000000000001",
        file_path: "abc/file.png",
        file_name: "file.png",
        file_size: 12345,
        mime_type: "image/png",
        kind: "image",
        is_primary_image: false,
        version: 1,
        superseded_by: null,
        metadata: null,
        uploaded_at: "2026-05-19T10:00:00Z",
        uploaded_by: null,
        ...overrides,
    };
}

describe("mapProductAttachment", () => {
    it("maps all DB fields to camelCase frontend shape", () => {
        const row = makeRow({
            file_name: "datasheet.pdf",
            file_size: 5000,
            mime_type: "application/pdf",
            kind: "datasheet",
            is_primary_image: false,
            version: 2,
            uploaded_at: "2026-01-01T00:00:00Z",
            uploaded_by: "user-uuid",
        });
        const result = mapProductAttachment(row, "https://signed.example/x");
        expect(result).toEqual({
            id: row.id,
            productId: row.product_id,
            fileName: "datasheet.pdf",
            fileSize: 5000,
            mimeType: "application/pdf",
            kind: "datasheet",
            isPrimaryImage: false,
            version: 2,
            uploadedAt: "2026-01-01T00:00:00Z",
            uploadedBy: "user-uuid",
            signedUrl: "https://signed.example/x",
        });
    });

    it("defaults signedUrl to null when 2nd arg omitted", () => {
        const result = mapProductAttachment(makeRow());
        expect(result.signedUrl).toBeNull();
    });

    it("preserves null uploadedBy without coercion", () => {
        const result = mapProductAttachment(makeRow({ uploaded_by: null }));
        expect(result.uploadedBy).toBeNull();
    });

    it("preserves isPrimaryImage true", () => {
        const result = mapProductAttachment(makeRow({ is_primary_image: true }));
        expect(result.isPrimaryImage).toBe(true);
    });

    it("DOES NOT expose file_path on frontend shape (security)", () => {
        const result = mapProductAttachment(makeRow({ file_path: "secret/path.png" }), null);
        expect(result).not.toHaveProperty("filePath");
        expect(result).not.toHaveProperty("file_path");
    });
});

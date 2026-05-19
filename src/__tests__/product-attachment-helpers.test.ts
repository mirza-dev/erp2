/**
 * Faz 2d — Pure helper unit tests (Ekler sekmesi).
 *
 * Exports from src/app/dashboard/products/[id]/page.tsx:
 *   - formatFileSize
 *   - getKindLabel
 *   - getKindIcon
 *   - pickInitialKind
 *   - groupAttachments
 */
import { describe, it, expect } from "vitest";
import {
    formatFileSize,
    getKindLabel,
    getKindIcon,
    pickInitialKind,
    groupAttachments,
} from "@/app/dashboard/products/[id]/page";
import type { ProductAttachment, ProductAttachmentKind } from "@/lib/mock-data";

function makeAtt(overrides: Partial<ProductAttachment> = {}): ProductAttachment {
    return {
        id: "att-1",
        productId: "p-1",
        fileName: "x.png",
        fileSize: 1000,
        mimeType: "image/png",
        kind: "image",
        isPrimaryImage: false,
        version: 1,
        uploadedAt: "2026-01-01",
        uploadedBy: null,
        signedUrl: null,
        ...overrides,
    };
}

// ── formatFileSize ───────────────────────────────────────────────────────────

describe("formatFileSize", () => {
    it("formats bytes under 1024 with B suffix", () => {
        expect(formatFileSize(0)).toBe("0 B");
        expect(formatFileSize(512)).toBe("512 B");
        expect(formatFileSize(1023)).toBe("1023 B");
    });

    it("formats KB with 1 decimal", () => {
        expect(formatFileSize(1024)).toBe("1.0 KB");
        expect(formatFileSize(1536)).toBe("1.5 KB");
        expect(formatFileSize(1024 * 999)).toBe("999.0 KB");
    });

    it("formats MB with 2 decimals", () => {
        expect(formatFileSize(1024 * 1024)).toBe("1.00 MB");
        expect(formatFileSize(5 * 1024 * 1024)).toBe("5.00 MB");
        expect(formatFileSize(10 * 1024 * 1024)).toBe("10.00 MB");
    });

    it("returns dash for invalid input", () => {
        expect(formatFileSize(NaN)).toBe("—");
        expect(formatFileSize(-1)).toBe("—");
        expect(formatFileSize(Infinity)).toBe("—");
    });
});

// ── getKindLabel ─────────────────────────────────────────────────────────────

describe("getKindLabel", () => {
    it("returns Turkish label for each of 6 kinds", () => {
        expect(getKindLabel("image")).toBe("Görsel");
        expect(getKindLabel("datasheet")).toBe("Veri Sayfası");
        expect(getKindLabel("certificate")).toBe("Sertifika");
        expect(getKindLabel("manual")).toBe("Manuel");
        expect(getKindLabel("drawing")).toBe("Çizim");
        expect(getKindLabel("other")).toBe("Diğer");
    });
});

// ── getKindIcon ──────────────────────────────────────────────────────────────

describe("getKindIcon", () => {
    it("returns icon for each of 6 kinds (non-empty string)", () => {
        const kinds: ProductAttachmentKind[] = ["image", "datasheet", "certificate", "manual", "drawing", "other"];
        for (const k of kinds) {
            expect(typeof getKindIcon(k)).toBe("string");
            expect(getKindIcon(k).length).toBeGreaterThan(0);
        }
    });

    it("uses distinct icons across kinds", () => {
        const kinds: ProductAttachmentKind[] = ["image", "datasheet", "certificate", "manual", "drawing", "other"];
        const icons = kinds.map(getKindIcon);
        expect(new Set(icons).size).toBe(icons.length);
    });
});

// ── pickInitialKind ──────────────────────────────────────────────────────────

describe("pickInitialKind", () => {
    it("returns 'image' for image/* MIME", () => {
        expect(pickInitialKind("image/png")).toBe("image");
        expect(pickInitialKind("image/jpeg")).toBe("image");
        expect(pickInitialKind("image/webp")).toBe("image");
    });

    it("returns 'datasheet' for application/pdf", () => {
        expect(pickInitialKind("application/pdf")).toBe("datasheet");
    });

    it("returns 'other' for unrecognized MIME", () => {
        expect(pickInitialKind("text/plain")).toBe("other");
        expect(pickInitialKind("application/octet-stream")).toBe("other");
        expect(pickInitialKind("")).toBe("other");
    });

    it("handles non-string input defensively", () => {
        // @ts-expect-error testing runtime guard
        expect(pickInitialKind(null)).toBe("other");
        // @ts-expect-error testing runtime guard
        expect(pickInitialKind(undefined)).toBe("other");
    });
});

// ── groupAttachments ─────────────────────────────────────────────────────────

describe("groupAttachments", () => {
    it("returns empty arrays for empty input", () => {
        const { images, documents } = groupAttachments([]);
        expect(images).toEqual([]);
        expect(documents).toEqual([]);
    });

    it("groups image kind into images", () => {
        const items = [makeAtt({ id: "a", kind: "image" }), makeAtt({ id: "b", kind: "image" })];
        const { images, documents } = groupAttachments(items);
        expect(images).toHaveLength(2);
        expect(documents).toHaveLength(0);
    });

    it("groups non-image kinds into documents", () => {
        const items = [
            makeAtt({ id: "a", kind: "datasheet" }),
            makeAtt({ id: "b", kind: "certificate" }),
            makeAtt({ id: "c", kind: "manual" }),
            makeAtt({ id: "d", kind: "drawing" }),
            makeAtt({ id: "e", kind: "other" }),
        ];
        const { images, documents } = groupAttachments(items);
        expect(images).toHaveLength(0);
        expect(documents).toHaveLength(5);
    });

    it("groups mixed kinds into correct buckets preserving order", () => {
        const items = [
            makeAtt({ id: "a", kind: "image" }),
            makeAtt({ id: "b", kind: "datasheet" }),
            makeAtt({ id: "c", kind: "image" }),
            makeAtt({ id: "d", kind: "certificate" }),
        ];
        const { images, documents } = groupAttachments(items);
        expect(images.map(i => i.id)).toEqual(["a", "c"]);
        expect(documents.map(d => d.id)).toEqual(["b", "d"]);
    });
});

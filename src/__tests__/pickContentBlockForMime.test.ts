/**
 * Faz 3a — pickContentBlockForMime pure helper tests.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { pickContentBlockForMime } from "@/lib/services/ai-service";

describe("pickContentBlockForMime", () => {
    it("PDF → { type: 'document', source: { base64, application/pdf } }", () => {
        const buf = Buffer.from("pdf-bytes");
        const block = pickContentBlockForMime("application/pdf", buf);
        expect(block.type).toBe("document");
        if (block.type !== "document") throw new Error("unreachable");
        expect(block.source.media_type).toBe("application/pdf");
        expect(block.source.data).toBe(buf.toString("base64"));
    });

    it("image/png → { type: 'image' } with base64 data", () => {
        const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        const block = pickContentBlockForMime("image/png", buf);
        expect(block.type).toBe("image");
        if (block.type !== "image") throw new Error("unreachable");
        expect(block.source.media_type).toBe("image/png");
        expect(block.source.data).toBe(buf.toString("base64"));
    });

    it("image/jpeg → { type: 'image' } with jpeg media_type", () => {
        const block = pickContentBlockForMime("image/jpeg", Buffer.from("jpg"));
        if (block.type !== "image") throw new Error("unreachable");
        expect(block.source.media_type).toBe("image/jpeg");
    });

    it("Excel → text block with sample text", () => {
        const block = pickContentBlockForMime(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            Buffer.from("xlsx"),
            "SKU,Adı\nA,Vana",
        );
        expect(block.type).toBe("text");
        if (block.type !== "text") throw new Error("unreachable");
        expect(block.text).toBe("SKU,Adı\nA,Vana");
    });

    it("CSV → text block; missing sample becomes empty string (no throw)", () => {
        const block = pickContentBlockForMime("text/csv", Buffer.from("csv"));
        expect(block.type).toBe("text");
        if (block.type !== "text") throw new Error("unreachable");
        expect(block.text).toBe("");
    });

    it("excel text sample truncated to 8000 chars", () => {
        const huge = "x".repeat(20000);
        const block = pickContentBlockForMime("text/csv", Buffer.from("csv"), huge);
        if (block.type !== "text") throw new Error("unreachable");
        expect(block.text.length).toBe(8000);
    });

    it("Unsupported MIME → throws", () => {
        expect(() => pickContentBlockForMime("application/zip", Buffer.from("zip"))).toThrow(/Unsupported MIME/);
    });
});

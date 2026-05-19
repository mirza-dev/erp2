/**
 * Faz 2a — product_attachments helper tests
 *
 * Covers:
 *   isValidAttachmentKind, isAllowedMime pure helpers
 *   dbCreateAttachment — MIME / size / kind validation
 *   dbSetPrimaryImage — clear-then-set UPDATE chain
 *   dbDeleteAttachment — DB delete sırası
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom    = vi.fn();
const mockInsert  = vi.fn();
const mockUpdate  = vi.fn();
const mockDelete  = vi.fn();
const mockSelect  = vi.fn();
const mockEq      = vi.fn();
const mockIs      = vi.fn();
const mockOrder   = vi.fn();
const mockSingle  = vi.fn();

const mockStorageUpload = vi.fn();
const mockStorageRemove = vi.fn();

let _terminal: { data: unknown; error: unknown } = { data: null, error: null };
function setTerminal(v: { data: unknown; error: unknown }) { _terminal = v; }

const makeChain = () => {
    const c: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(_terminal).then(resolve),
    };
    c.insert = (v: unknown) => { mockInsert(v); return c; };
    c.update = (v: unknown) => { mockUpdate(v); return c; };
    c.delete = () => { mockDelete(); return c; };
    c.select = (v?: unknown) => { mockSelect(v); return c; };
    c.eq     = (k: unknown, v: unknown) => { mockEq(k, v); return c; };
    c.is     = (k: unknown, v: unknown) => { mockIs(k, v); return c; };
    c.order  = (v: unknown, o?: unknown) => { mockOrder(v, o); return c; };
    c.single = () => mockSingle();
    return c;
};

const mockSupabase = {
    from: (table: string) => { mockFrom(table); return makeChain(); },
    storage: {
        from: (_bucket: string) => ({
            upload: (...a: unknown[]) => mockStorageUpload(...a),
            remove: (...a: unknown[]) => mockStorageRemove(...a),
        }),
    },
};

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => mockSupabase,
}));

beforeEach(() => {
    mockFrom.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockSelect.mockReset();
    mockEq.mockReset();
    mockIs.mockReset();
    mockOrder.mockReset();
    mockSingle.mockReset();
    mockStorageUpload.mockReset();
    mockStorageRemove.mockReset();
    setTerminal({ data: null, error: null });
});

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001";
const ATTACH_ID  = "00000000-0000-4000-8000-000000000003";

describe("Pure validators", () => {
    it("isValidAttachmentKind — geçerli enum'lar true", async () => {
        const { isValidAttachmentKind } = await import("@/lib/supabase/product-attachments");
        expect(isValidAttachmentKind("image")).toBe(true);
        expect(isValidAttachmentKind("datasheet")).toBe(true);
        expect(isValidAttachmentKind("certificate")).toBe(true);
        expect(isValidAttachmentKind("manual")).toBe(true);
        expect(isValidAttachmentKind("drawing")).toBe(true);
        expect(isValidAttachmentKind("other")).toBe(true);
    });

    it("isValidAttachmentKind — geçersiz false", async () => {
        const { isValidAttachmentKind } = await import("@/lib/supabase/product-attachments");
        expect(isValidAttachmentKind("photo")).toBe(false);
        expect(isValidAttachmentKind("")).toBe(false);
        expect(isValidAttachmentKind(null)).toBe(false);
    });

    it("isAllowedMime — whitelist match/miss", async () => {
        const { isAllowedMime } = await import("@/lib/supabase/product-attachments");
        expect(isAllowedMime("image/png")).toBe(true);
        expect(isAllowedMime("application/pdf")).toBe(true);
        expect(isAllowedMime("image/svg+xml")).toBe(false);
        expect(isAllowedMime("text/html")).toBe(false);
    });
});

describe("dbCreateAttachment validation", () => {
    it("geçersiz MIME → throw", async () => {
        const { dbCreateAttachment } = await vi.importActual<typeof import("@/lib/supabase/product-attachments")>("@/lib/supabase/product-attachments");
        await expect(dbCreateAttachment({
            productId: PRODUCT_ID,
            file: Buffer.from("x"),
            fileName: "x.svg",
            fileSize: 100,
            mimeType: "image/svg+xml",
            kind: "image",
        })).rejects.toThrow("dosya türü");
    });

    it("file_size > 10MB → throw", async () => {
        const { dbCreateAttachment, MAX_FILE_SIZE } = await vi.importActual<typeof import("@/lib/supabase/product-attachments")>("@/lib/supabase/product-attachments");
        await expect(dbCreateAttachment({
            productId: PRODUCT_ID,
            file: Buffer.from("x"),
            fileName: "x.png",
            fileSize: MAX_FILE_SIZE + 1,
            mimeType: "image/png",
            kind: "image",
        })).rejects.toThrow("sınırını aşıyor");
    });

    it("geçersiz kind → throw", async () => {
        const { dbCreateAttachment } = await vi.importActual<typeof import("@/lib/supabase/product-attachments")>("@/lib/supabase/product-attachments");
        await expect(dbCreateAttachment({
            productId: PRODUCT_ID,
            file: Buffer.from("x"),
            fileName: "x.png",
            fileSize: 100,
            mimeType: "image/png",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            kind: "photo" as any,
        })).rejects.toThrow("kategorisi");
    });
});

describe("dbSetPrimaryImage", () => {
    it("önce all primary=false UPDATE, sonra hedef primary=true UPDATE", async () => {
        const { dbSetPrimaryImage } = await vi.importActual<typeof import("@/lib/supabase/product-attachments")>("@/lib/supabase/product-attachments");

        await dbSetPrimaryImage(PRODUCT_ID, ATTACH_ID);

        expect(mockUpdate).toHaveBeenCalledTimes(2);
        // 1. UPDATE: is_primary_image=false (clear-all)
        expect(mockUpdate.mock.calls[0][0]).toEqual({ is_primary_image: false });
        // 2. UPDATE: is_primary_image=true (set target)
        expect(mockUpdate.mock.calls[1][0]).toEqual({ is_primary_image: true });
    });
});

describe("dbDeleteAttachment", () => {
    it("DB satırını siler, storage'tan dosyayı kaldırır", async () => {
        const { dbDeleteAttachment } = await vi.importActual<typeof import("@/lib/supabase/product-attachments")>("@/lib/supabase/product-attachments");

        mockSingle.mockResolvedValueOnce({
            data: { file_path: `${PRODUCT_ID}/${ATTACH_ID}.png` },
            error: null,
        });
        mockStorageRemove.mockResolvedValueOnce({ error: null });

        await dbDeleteAttachment(ATTACH_ID);

        expect(mockDelete).toHaveBeenCalled();
        expect(mockStorageRemove).toHaveBeenCalledWith([`${PRODUCT_ID}/${ATTACH_ID}.png`]);
    });
});

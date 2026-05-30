/**
 * Teklif V7 Faz 7 — note_templates helper + mapper.
 * isValidNoteTemplateKind pure + validation throws + list/create/deactivate
 * (chain mock) + mapNoteTemplate round-trip.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase chain mock ─────────────────────────────────────────
let singleQueue: Array<{ data: unknown; error: unknown }> = [];
let execResult: { data: unknown; error: unknown } = { data: [], error: null };
const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

function makeChain() {
    const chain: Record<string, unknown> = {};
    const ret = () => chain;
    chain.select = ret;
    chain.insert = (v: unknown) => { mockInsert(v); return chain; };
    chain.update = (v: unknown) => { mockUpdate(v); return chain; };
    chain.delete = ret;
    chain.eq = (k: unknown, v: unknown) => { mockEq(k, v); return chain; };
    chain.order = ret;
    chain.single = () => Promise.resolve(singleQueue.shift() ?? { data: null, error: null });
    // thenable → `await query` (list / update-terminal / audit insert)
    chain.then = (resolve: (v: unknown) => unknown) => resolve(execResult);
    return chain;
}

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: (t: string) => { mockFrom(t); return makeChain(); } }),
}));

beforeEach(() => {
    singleQueue = [];
    execResult = { data: [], error: null };
    mockFrom.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockEq.mockReset();
});

const ROW = {
    id: "00000000-0000-4000-8000-000000a00011",
    kind: "payment" as const,
    title: "%50 Avans",
    body: "%50 AVANS, %50 SEVKE HAZIR OLUNCA",
    sort_order: 10,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
};

// ── Pure ─────────────────────────────────────────────────────────

describe("isValidNoteTemplateKind", () => {
    it("4 geçerli kind kabul eder, diğerini reddeder", async () => {
        const { isValidNoteTemplateKind } = await import("@/lib/supabase/note-templates");
        for (const k of ["notes", "delivery", "payment", "general"]) {
            expect(isValidNoteTemplateKind(k)).toBe(true);
        }
        expect(isValidNoteTemplateKind("bad")).toBe(false);
        expect(isValidNoteTemplateKind(null)).toBe(false);
        expect(isValidNoteTemplateKind(undefined)).toBe(false);
    });
});

describe("mapNoteTemplate", () => {
    it("snake_case row → camelCase round-trip", async () => {
        const { mapNoteTemplate } = await import("@/lib/api-mappers");
        expect(mapNoteTemplate(ROW)).toEqual({
            id: ROW.id,
            kind: "payment",
            title: "%50 Avans",
            body: "%50 AVANS, %50 SEVKE HAZIR OLUNCA",
            sortOrder: 10,
            isActive: true,
            createdAt: ROW.created_at,
            updatedAt: ROW.updated_at,
        });
    });
});

// ── Validation (supabase'e gitmeden throw) ──────────────────────

describe("dbCreateNoteTemplate validation", () => {
    it("geçersiz kind → throw", async () => {
        const { dbCreateNoteTemplate } = await import("@/lib/supabase/note-templates");
        // @ts-expect-error invalid kind
        await expect(dbCreateNoteTemplate({ kind: "bad", title: "T", body: "B" })).rejects.toThrow(/Geçersiz şablon türü/);
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it("boş başlık → throw", async () => {
        const { dbCreateNoteTemplate } = await import("@/lib/supabase/note-templates");
        await expect(dbCreateNoteTemplate({ kind: "notes", title: "  ", body: "B" })).rejects.toThrow(/Başlık zorunludur/);
    });

    it("boş metin → throw", async () => {
        const { dbCreateNoteTemplate } = await import("@/lib/supabase/note-templates");
        await expect(dbCreateNoteTemplate({ kind: "notes", title: "T", body: "  " })).rejects.toThrow(/metni zorunludur/);
    });

    it("negatif sort_order → throw", async () => {
        const { dbCreateNoteTemplate } = await import("@/lib/supabase/note-templates");
        await expect(dbCreateNoteTemplate({ kind: "notes", title: "T", body: "B", sort_order: -1 })).rejects.toThrow(/negatif olamaz/);
    });

    it("küsüratlı sort_order → throw", async () => {
        const { dbCreateNoteTemplate } = await import("@/lib/supabase/note-templates");
        await expect(dbCreateNoteTemplate({ kind: "notes", title: "T", body: "B", sort_order: 1.5 })).rejects.toThrow(/tam sayı/);
    });
});

// ── List ─────────────────────────────────────────────────────────

describe("dbListNoteTemplates", () => {
    it("default aktif filtre + kind verilince eq('kind')", async () => {
        execResult = { data: [ROW], error: null };
        const { dbListNoteTemplates } = await import("@/lib/supabase/note-templates");
        const out = await dbListNoteTemplates({ kind: "payment" });
        expect(out).toHaveLength(1);
        expect(mockEq).toHaveBeenCalledWith("is_active", true);
        expect(mockEq).toHaveBeenCalledWith("kind", "payment");
    });

    it("includeInactive=true → is_active filtresi uygulanmaz", async () => {
        execResult = { data: [ROW], error: null };
        const { dbListNoteTemplates } = await import("@/lib/supabase/note-templates");
        await dbListNoteTemplates({ includeInactive: true });
        expect(mockEq).not.toHaveBeenCalledWith("is_active", true);
    });

    it("supabase error → throw", async () => {
        execResult = { data: null, error: { message: "db fail" } };
        const { dbListNoteTemplates } = await import("@/lib/supabase/note-templates");
        await expect(dbListNoteTemplates()).rejects.toThrow(/db fail/);
    });
});

// ── Create / Deactivate (chain) ─────────────────────────────────

describe("dbCreateNoteTemplate success", () => {
    it("insert + audit_log + döner", async () => {
        singleQueue = [{ data: ROW, error: null }]; // insert().select().single()
        const { dbCreateNoteTemplate } = await import("@/lib/supabase/note-templates");
        const out = await dbCreateNoteTemplate({ kind: "payment", title: "%50 Avans", body: ROW.body });
        expect(out.id).toBe(ROW.id);
        expect(mockFrom).toHaveBeenCalledWith("note_templates");
        expect(mockFrom).toHaveBeenCalledWith("audit_log");
        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
            action: "note_template_created", entity_type: "note_template",
        }));
    });
});

describe("dbDeactivateNoteTemplate", () => {
    it("soft-delete (is_active=false) + audit", async () => {
        singleQueue = [{ data: ROW, error: null }]; // get existing
        const { dbDeactivateNoteTemplate } = await import("@/lib/supabase/note-templates");
        await dbDeactivateNoteTemplate(ROW.id);
        expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
            action: "note_template_deactivated",
        }));
    });

    it("zaten pasif → throw (hard-delete YOK)", async () => {
        singleQueue = [{ data: { ...ROW, is_active: false }, error: null }];
        const { dbDeactivateNoteTemplate } = await import("@/lib/supabase/note-templates");
        await expect(dbDeactivateNoteTemplate(ROW.id)).rejects.toThrow(/zaten pasif/);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("bulunamadı → throw", async () => {
        singleQueue = [{ data: null, error: null }];
        const { dbDeactivateNoteTemplate } = await import("@/lib/supabase/note-templates");
        await expect(dbDeactivateNoteTemplate("nope")).rejects.toThrow(/bulunamadı/);
    });
});

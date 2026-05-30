import { createServiceClient } from "./service";
import type { NoteTemplateRow, NoteTemplateKind } from "@/lib/database.types";

// ── Validation ──────────────────────────────────────────────

const NOTE_TEMPLATE_KINDS: NoteTemplateKind[] = ["notes", "delivery", "payment", "general"];

const TITLE_MAX = 120;
const BODY_MAX = 5000;

export function isValidNoteTemplateKind(k: unknown): k is NoteTemplateKind {
    return typeof k === "string" && (NOTE_TEMPLATE_KINDS as string[]).includes(k);
}

// ── Inputs ──────────────────────────────────────────────────

export interface CreateNoteTemplateInput {
    kind: NoteTemplateKind;
    title: string;
    body: string;
    sort_order?: number;
}

export interface UpdateNoteTemplateInput {
    kind?: NoteTemplateKind;
    title?: string;
    body?: string;
    sort_order?: number;
}

export interface ListNoteTemplatesOptions {
    kind?: NoteTemplateKind;
    includeInactive?: boolean;
}

// ── Validators ──────────────────────────────────────────────

function validateInput(input: CreateNoteTemplateInput | UpdateNoteTemplateInput): string | null {
    if ("kind" in input && input.kind !== undefined) {
        if (!isValidNoteTemplateKind(input.kind)) {
            return `Geçersiz şablon türü. Kabul edilenler: ${NOTE_TEMPLATE_KINDS.join(", ")}.`;
        }
    }
    if ("title" in input && input.title !== undefined) {
        if (!input.title || input.title.trim().length === 0) return "Başlık zorunludur.";
        if (input.title.trim().length > TITLE_MAX) return `Başlık ${TITLE_MAX} karakteri aşamaz.`;
    }
    if ("body" in input && input.body !== undefined) {
        if (!input.body || input.body.trim().length === 0) return "Şablon metni zorunludur.";
        if (input.body.length > BODY_MAX) return `Şablon metni ${BODY_MAX} karakteri aşamaz.`;
    }
    if (input.sort_order !== undefined && !Number.isInteger(input.sort_order)) {
        return "Sıralama tam sayı olmalıdır.";
    }
    if (input.sort_order !== undefined && input.sort_order < 0) {
        return "Sıralama negatif olamaz.";
    }
    return null;
}

// ── List / Read ─────────────────────────────────────────────

export async function dbListNoteTemplates(opts: ListNoteTemplatesOptions = {}): Promise<NoteTemplateRow[]> {
    const supabase = createServiceClient();
    let query = supabase.from("note_templates").select("*");

    if (!opts.includeInactive) query = query.eq("is_active", true);
    if (opts.kind !== undefined) query = query.eq("kind", opts.kind);

    const { data, error } = await query
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbGetNoteTemplate(id: string): Promise<NoteTemplateRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("note_templates")
        .select("*")
        .eq("id", id)
        .single();
    if (error || !data) return null;
    return data;
}

// ── Create / Update / Deactivate ────────────────────────────

export async function dbCreateNoteTemplate(input: CreateNoteTemplateInput): Promise<NoteTemplateRow> {
    const err = validateInput(input);
    if (err) throw new Error(err);
    if (!isValidNoteTemplateKind(input.kind)) {
        throw new Error("Şablon türü zorunludur.");
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("note_templates")
        .insert({
            kind: input.kind,
            title: input.title.trim(),
            body: input.body,
            sort_order: input.sort_order ?? 0,
            is_active: true,
        })
        .select()
        .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Şablon oluşturulamadı.");

    await supabase.from("audit_log").insert({
        action: "note_template_created",
        entity_type: "note_template",
        entity_id: data.id,
        after_state: { kind: data.kind, title: data.title, sort_order: data.sort_order },
        source: "ui",
    });

    return data;
}

export async function dbUpdateNoteTemplate(id: string, patch: UpdateNoteTemplateInput): Promise<NoteTemplateRow> {
    const err = validateInput(patch);
    if (err) throw new Error(err);

    const supabase = createServiceClient();
    const { data: existing } = await supabase
        .from("note_templates").select("*").eq("id", id).single();
    if (!existing) throw new Error("Şablon bulunamadı.");

    const updatePayload: Record<string, unknown> = {};
    if (patch.kind !== undefined) updatePayload.kind = patch.kind;
    if (patch.title !== undefined) updatePayload.title = patch.title.trim();
    if (patch.body !== undefined) updatePayload.body = patch.body;
    if (patch.sort_order !== undefined) updatePayload.sort_order = patch.sort_order;

    const { data, error } = await supabase
        .from("note_templates")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Şablon bulunamadı.");

    await supabase.from("audit_log").insert({
        action: "note_template_updated",
        entity_type: "note_template",
        entity_id: id,
        before_state: { kind: existing.kind, title: existing.title, sort_order: existing.sort_order },
        after_state: updatePayload,
        source: "ui",
    });

    return data;
}

export async function dbDeactivateNoteTemplate(id: string): Promise<void> {
    const supabase = createServiceClient();

    const { data: existing } = await supabase
        .from("note_templates").select("*").eq("id", id).single();
    if (!existing) throw new Error("Şablon bulunamadı.");
    if (!existing.is_active) throw new Error("Şablon zaten pasif.");

    // Sessiz silme yasağı: hard delete YOK, soft-delete (is_active=false).
    const { error } = await supabase
        .from("note_templates")
        .update({ is_active: false })
        .eq("id", id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
        action: "note_template_deactivated",
        entity_type: "note_template",
        entity_id: id,
        before_state: { kind: existing.kind, title: existing.title, is_active: true },
        after_state: { is_active: false },
        source: "ui",
    });
}

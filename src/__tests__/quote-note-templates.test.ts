/**
 * Teklif V7 Faz 7 — QuoteForm not şablonu picker pure helper'ları.
 * applyTemplateToField (boş→doldur / dolu→append; sessiz üzerine-yazma YOK)
 * templatesForField (kind + general filtre, sort_order sıralı)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyTemplateToField, templatesForField } from "@/lib/quote-note-templates";
import type { NoteTemplate } from "@/lib/mock-data";

function mkTpl(p: Partial<NoteTemplate> & { id: string; kind: NoteTemplate["kind"] }): NoteTemplate {
    return {
        title: p.title ?? "T",
        body: p.body ?? "B",
        sortOrder: p.sortOrder ?? 0,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        ...p,
    };
}

describe("applyTemplateToField", () => {
    it("boş alanı şablonla doldurur", () => {
        expect(applyTemplateToField("", "İSTANBUL PMT DEPO")).toBe("İSTANBUL PMT DEPO");
    });

    it("yalnız whitespace olan alanı şablonla doldurur (append etmez)", () => {
        expect(applyTemplateToField("   \n  ", "X")).toBe("X");
    });

    it("dolu alanın sonuna yeni satır + şablon ekler (append)", () => {
        expect(applyTemplateToField("mevcut not", "ek not")).toBe("mevcut not\nek not");
    });

    it("mevcut metni asla sessizce ezmez", () => {
        const out = applyTemplateToField("önemli koşul", "şablon");
        expect(out).toContain("önemli koşul");
        expect(out).toContain("şablon");
    });
});

describe("templatesForField", () => {
    const all: NoteTemplate[] = [
        mkTpl({ id: "n1", kind: "notes", title: "Not B", sortOrder: 20 }),
        mkTpl({ id: "n2", kind: "notes", title: "Not A", sortOrder: 10 }),
        mkTpl({ id: "d1", kind: "delivery", title: "Teslim", sortOrder: 10 }),
        mkTpl({ id: "g1", kind: "general", title: "Genel", sortOrder: 5 }),
    ];

    it("alan türü + general döner, diğer türleri eler", () => {
        const out = templatesForField(all, "notes");
        const ids = out.map((t) => t.id);
        expect(ids).toContain("n1");
        expect(ids).toContain("n2");
        expect(ids).toContain("g1"); // general her alanda
        expect(ids).not.toContain("d1"); // delivery, notes alanında görünmez
    });

    it("sort_order'a göre sıralar", () => {
        const out = templatesForField(all, "notes");
        // g1(5) < n2(10) < n1(20)
        expect(out.map((t) => t.id)).toEqual(["g1", "n2", "n1"]);
    });

    it("delivery alanı yalnız delivery + general gösterir", () => {
        const out = templatesForField(all, "delivery");
        expect(out.map((t) => t.id).sort()).toEqual(["d1", "g1"]);
    });

    it("eşleşme yoksa boş dizi", () => {
        const out = templatesForField([mkTpl({ id: "p1", kind: "payment" })], "notes");
        expect(out).toEqual([]);
    });
});

// ── QuoteForm wiring drift-guard (source-regex) ─────────────────
describe("QuoteForm not şablonu entegrasyonu", () => {
    const SRC = readFileSync(
        join(process.cwd(), "src/app/dashboard/quotes/_components/QuoteForm.tsx"),
        "utf8",
    );

    it("picker helper'larını import eder", () => {
        expect(SRC).toMatch(/applyTemplateToField, templatesForField.*from "@\/lib\/quote-note-templates"/);
    });

    it("mount'ta /api/note-templates fetch eder (cancelled guard'lı)", () => {
        expect(SRC).toMatch(/fetch\("\/api\/note-templates"\)/);
        expect(SRC).toMatch(/setNoteTemplates/);
    });

    it("3 textarea'ya da renderTemplatePicker bağlar (notes/delivery/payment)", () => {
        expect(SRC).toMatch(/renderTemplatePicker\("notes", notes, setNotes\)/);
        expect(SRC).toMatch(/renderTemplatePicker\("delivery", deliveryMethod, setDeliveryMethod\)/);
        expect(SRC).toMatch(/renderTemplatePicker\("payment", paymentMethod, setPaymentMethod\)/);
    });

    it("readOnly modda picker render edilmez (early return)", () => {
        expect(SRC).toMatch(/function renderTemplatePicker[\s\S]*?if \(readOnly\) return null/);
    });
});

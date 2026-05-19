/**
 * useSelection hook — pure helper + source-regression tests.
 *
 * Behavioral tests use the exported pure helpers (computeToggleOne etc.)
 * so they run without React rendering overhead. Source-regex tests verify
 * the hook's structural invariants (resetKey pattern, state declarations).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
    computeToggleOne,
    computeToggleAll,
    computeIsPageAllSelected,
    computeIsPageIndeterminate,
} from "@/hooks/useSelection";

const SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/hooks/useSelection.ts"),
    "utf8",
);

// ── Pure helper tests ─────────────────────────────────────────────────────────

describe("computeToggleOne", () => {
    it("adds id when not present", () => {
        const result = computeToggleOne(new Set(["a"]), "b");
        expect(result.has("b")).toBe(true);
        expect(result.has("a")).toBe(true);
    });

    it("removes id when already present", () => {
        const result = computeToggleOne(new Set(["a", "b"]), "a");
        expect(result.has("a")).toBe(false);
        expect(result.has("b")).toBe(true);
    });

    it("returns a new Set (does not mutate original)", () => {
        const original = new Set(["a"]);
        const result = computeToggleOne(original, "b");
        expect(result).not.toBe(original);
        expect(original.has("b")).toBe(false);
    });
});

describe("computeToggleAll", () => {
    it("selects all when none are selected", () => {
        const result = computeToggleAll(new Set<string>(), ["a", "b", "c"]);
        expect([...result]).toEqual(expect.arrayContaining(["a", "b", "c"]));
        expect(result.size).toBe(3);
    });

    it("deselects all when all are already selected", () => {
        const result = computeToggleAll(new Set(["a", "b", "c"]), ["a", "b", "c"]);
        expect(result.size).toBe(0);
    });

    it("selects all when only some are selected (partial → select all)", () => {
        const result = computeToggleAll(new Set(["a"]), ["a", "b", "c"]);
        expect(result.has("a")).toBe(true);
        expect(result.has("b")).toBe(true);
        expect(result.has("c")).toBe(true);
    });

    it("preserves cross-page selections when toggling a different page", () => {
        const prev = new Set(["page1-id1"]);
        const result = computeToggleAll(prev, ["page2-id1", "page2-id2"]);
        expect(result.has("page1-id1")).toBe(true);
        expect(result.has("page2-id1")).toBe(true);
        expect(result.has("page2-id2")).toBe(true);
    });
});

describe("computeIsPageAllSelected", () => {
    it("returns false for empty pageIds", () => {
        expect(computeIsPageAllSelected(new Set(["a"]), [])).toBe(false);
    });

    it("returns true when all pageIds are in selectedIds", () => {
        expect(computeIsPageAllSelected(new Set(["a", "b", "c"]), ["a", "b"])).toBe(true);
    });

    it("returns false when some pageIds are missing", () => {
        expect(computeIsPageAllSelected(new Set(["a"]), ["a", "b"])).toBe(false);
    });

    it("returns false when selectedIds is empty", () => {
        expect(computeIsPageAllSelected(new Set(), ["a", "b"])).toBe(false);
    });
});

describe("computeIsPageIndeterminate", () => {
    it("returns false for empty pageIds", () => {
        expect(computeIsPageIndeterminate(new Set(["a"]), [])).toBe(false);
    });

    it("returns true when some (not all) pageIds are selected", () => {
        expect(computeIsPageIndeterminate(new Set(["a"]), ["a", "b"])).toBe(true);
    });

    it("returns false when none are selected", () => {
        expect(computeIsPageIndeterminate(new Set<string>(), ["a", "b"])).toBe(false);
    });

    it("returns false when all are selected (not indeterminate)", () => {
        expect(computeIsPageIndeterminate(new Set(["a", "b"]), ["a", "b"])).toBe(false);
    });
});

// ── Source-regex structural tests ─────────────────────────────────────────────

describe("useSelection hook source", () => {
    it("exports UseSelectionResult interface", () => {
        expect(SOURCE).toMatch(/export interface UseSelectionResult/);
    });

    it("uses prevResetKey state for render-phase reset (project pattern)", () => {
        expect(SOURCE).toMatch(/prevResetKey.*useState/);
        expect(SOURCE).toMatch(/prevResetKey !== resetKey/);
    });

    it("exports all pure helper functions", () => {
        expect(SOURCE).toMatch(/export function computeToggleOne/);
        expect(SOURCE).toMatch(/export function computeToggleAll/);
        expect(SOURCE).toMatch(/export function computeIsPageAllSelected/);
        expect(SOURCE).toMatch(/export function computeIsPageIndeterminate/);
    });

    it("hook delegates to pure helpers", () => {
        expect(SOURCE).toMatch(/computeToggleOne\(prev/);
        expect(SOURCE).toMatch(/computeToggleAll\(prev/);
    });
});

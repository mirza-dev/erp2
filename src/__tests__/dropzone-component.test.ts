/**
 * Faz 3a — DropZone component regression locks (source-regex).
 *
 * Davranış (validateClassifyUpload, pickAcceptForMime, formatBytes) ayrı bir
 * dosyada (validateClassifyUpload.test.ts). Bu dosya component DOM iskeleti
 * + accept attribute + drag-over visual + disabled state için kilit.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/components/import/DropZone.tsx"),
    "utf8",
);

describe("DropZone component source", () => {
    it("exports default + pure helpers", () => {
        expect(SOURCE).toMatch(/export default function DropZone/);
        expect(SOURCE).toMatch(/export function validateClassifyUpload/);
        expect(SOURCE).toMatch(/export function pickAcceptForMime/);
        expect(SOURCE).toMatch(/export function formatBytes/);
        expect(SOURCE).toMatch(/export const CLASSIFIER_ACCEPT/);
    });

    it("accept attribute uses CLASSIFIER_ACCEPT constant (whitelist sync)", () => {
        expect(SOURCE).toMatch(/accept=\{CLASSIFIER_ACCEPT\}/);
        expect(SOURCE).toMatch(/application\/pdf/);
        expect(SOURCE).toMatch(/image\/png/);
        expect(SOURCE).toMatch(/spreadsheetml\.sheet/);
        expect(SOURCE).toMatch(/text\/csv/);
    });

    it("supports multi-file (input multiple attr)", () => {
        expect(SOURCE).toMatch(/<input[\s\S]*?multiple/);
    });

    it("guards onFiles when disabled", () => {
        expect(SOURCE).toMatch(/if \(disabled\) return/);
    });

    it("input value reset after change (allows re-selecting same file)", () => {
        expect(SOURCE).toMatch(/inputRef\.current\.value = ""/);
    });

    it("drag-over visual state toggled via setDragOver", () => {
        expect(SOURCE).toMatch(/setDragOver\(true\)/);
        expect(SOURCE).toMatch(/setDragOver\(false\)/);
    });

    it("aria-label + aria-disabled set on root", () => {
        expect(SOURCE).toMatch(/aria-label="Dosya bırakma alanı"/);
        expect(SOURCE).toMatch(/aria-disabled=\{disabled\}/);
    });
});

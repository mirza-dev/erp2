import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// Faz C — overwrite toggle uçtan uca bağlı mı (route → service → UI) source-regression.
describe("Faz C overwrite toggle — wiring", () => {
    it("confirm route body.overwrite okur + serviceConfirmBatch'e geçirir", () => {
        const src = read("src/app/api/import/[batchId]/confirm/route.ts");
        expect(src).toMatch(/overwrite\s*=\s*body\?\.overwrite === true/);
        expect(src).toContain("serviceConfirmBatch(batchId, { actorUserId, permissions, overwrite })");
    });

    it("import-service ConfirmBatchOptions.overwrite + pickUpdate fill-empty mantığı", () => {
        const src = read("src/lib/services/import-service.ts");
        expect(src).toMatch(/overwrite\?:\s*boolean/);
        expect(src).toContain("const overwrite = options.overwrite ?? false");
        // elle düzeltme istisnası
        expect(src).toContain("correctedFields");
    });

    it("import sayfası overwrite checkbox + confirm çağrısı body'sine geçirir", () => {
        const src = read("src/app/dashboard/import/page.tsx");
        expect(src).toContain("overwriteExisting");
        expect(src).toContain("JSON.stringify({ overwrite: overwriteExisting })");
        expect(src).toContain("Mevcut dolu alanların üzerine yaz");
    });
});

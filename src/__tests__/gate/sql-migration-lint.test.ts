/**
 * GATE: SQL/migration lint — supabase/migrations/*.sql üzerinde iki kural:
 *
 *  1. SECURITY DEFINER hijyeni: DEFINER içeren YENİ migration `SET search_path`
 *     VE (REVOKE veya GRANT EXECUTE) içermek zorunda (039/054/087 kalıbı).
 *     Mevcut ihlaller DEFINER_GRANDFATHER'da — liste yalnız küçülür.
 *
 *  2. Fonksiyon redefinition takibi: mevcut bir fonksiyonu yeniden tanımlayan
 *     yeni migration REDEFINITION_CHAINS'te bilinçli kayıtla güncellenmek
 *     zorunda → 088-tipi sessiz davranış kaybı (Y4) review'da görünür olur.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEFINER_GRANDFATHER, REDEFINITION_CHAINS } from "./sql-lint-baseline";

const MIG_DIR = join(process.cwd(), "supabase/migrations");
const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();

interface MigInfo {
    file: string;
    num: string;
    definer: boolean;
    hasSearchPath: boolean;
    hasGrant: boolean;
    fns: string[];
}

const inventory: MigInfo[] = files.map((file) => {
    const src = readFileSync(join(MIG_DIR, file), "utf8");
    return {
        file,
        num: file.slice(0, 3),
        definer: /SECURITY DEFINER/i.test(src),
        hasSearchPath: /SET search_path/i.test(src),
        hasGrant: /REVOKE|GRANT EXECUTE/i.test(src),
        fns: [...src.matchAll(/CREATE OR REPLACE FUNCTION\s+(?:public\.)?([a-z0-9_]+)/gi)]
            .map((m) => m[1].toLowerCase()),
    };
});

describe("GATE — SECURITY DEFINER hijyeni", () => {
    it("DEFINER içeren migration ya tam hijyenli ya grandfather listesinde", () => {
        const violations = inventory
            .filter((m) => m.definer && !(m.hasSearchPath && m.hasGrant))
            .filter((m) => !DEFINER_GRANDFATHER.includes(m.file))
            .map((m) => `${m.file} (search_path: ${m.hasSearchPath}, revoke/grant: ${m.hasGrant})`);
        expect(
            violations,
            `Hijyensiz DEFINER migration(lar):\n  ${violations.join("\n  ")}\n` +
            "→ SET search_path = public + REVOKE ALL ... + GRANT EXECUTE ... TO service_role " +
            "ekleyin (örnek kalıp: 039/054/087). Grandfather listesi YENİ kayıt almaz.",
        ).toEqual([]);
    });

    it("grandfather listesi stale değil (düzeltilen migration listeden düşer)", () => {
        const byFile = new Map(inventory.map((m) => [m.file, m]));
        const stale: string[] = [];
        for (const f of DEFINER_GRANDFATHER) {
            const m = byFile.get(f);
            if (!m) stale.push(`${f} → dosya yok`);
            else if (!m.definer || (m.hasSearchPath && m.hasGrant)) {
                stale.push(`${f} → artık hijyenli/DEFINER'sız, grandfather'dan silin`);
            }
        }
        expect(stale, stale.join("\n")).toEqual([]);
    });
});

describe("GATE — fonksiyon redefinition takibi", () => {
    /** gerçek zincirler: fn → tanımlandığı migration numaraları */
    const actual = new Map<string, string[]>();
    for (const m of inventory) {
        for (const fn of m.fns) {
            const arr = actual.get(fn) ?? [];
            if (!arr.includes(m.num)) arr.push(m.num);
            actual.set(fn, arr);
        }
    }

    it("birden çok migration'da tanımlanan her fonksiyon baseline zinciriyle birebir", () => {
        const drift: string[] = [];
        for (const [fn, nums] of actual) {
            if (nums.length < 2) continue;
            const expected = REDEFINITION_CHAINS[fn];
            if (!expected) {
                drift.push(`${fn} → ${nums.join("→")} (baseline'da YOK)`);
            } else if (expected.join(",") !== nums.join(",")) {
                drift.push(`${fn} → gerçek ${nums.join("→")} ≠ baseline ${expected.join("→")}`);
            }
        }
        expect(
            drift,
            `Redefinition zinciri baseline dışı:\n  ${drift.join("\n  ")}\n` +
            "→ Mevcut bir RPC'yi yeniden tanımlıyorsanız sql-lint-baseline.ts'te zinciri " +
            "güncelleyin ve ÖNCEKİ sürümün davranışlarını (guard'lar, kopyalanan kolonlar) " +
            "koruduğunuzu PR'da belirtin (Y4 — 088 regresyonu emsali).",
        ).toEqual([]);
    });

    it("baseline'da hayalet zincir yok", () => {
        const ghosts = Object.keys(REDEFINITION_CHAINS).filter((fn) => {
            const nums = actual.get(fn);
            return !nums || nums.length < 2;
        });
        expect(ghosts, ghosts.join(", ")).toEqual([]);
    });
});

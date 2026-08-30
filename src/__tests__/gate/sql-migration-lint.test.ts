/**
 * GATE: SQL/migration lint — supabase/migrations/*.sql üzerinde üç kural:
 *
 *  1. SECURITY DEFINER hijyeni: DEFINER içeren YENİ migration `SET search_path`
 *     VE (REVOKE veya GRANT EXECUTE) içermek zorunda (039/054/087 kalıbı).
 *     Mevcut ihlaller DEFINER_GRANDFATHER'da — liste yalnız küçülür.
 *
 *  2. REVOKE'un HEDEF ROLLERİ: her DEFINER fonksiyonu `FROM public, anon,
 *     authenticated` ile revoke edilmiş olmalı. Yalnız `FROM public` YETMEZ —
 *     Supabase'in `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO
 *     postgres, anon, authenticated, service_role` varsayılanı her yeni
 *     fonksiyona anon/authenticated için DOĞRUDAN grant verir ve `FROM public`
 *     yalnız PUBLIC pseudo-rolünü kaldırır. Kural 1 metnin VARLIĞINA baktığı
 *     için bu sapmayı göremiyordu (2026-08 K1: 5 DEFINER RPC'si canlıda anon
 *     anahtarıyla çağrılabiliyordu — A/B probe ile kanıtlandı, mig.110 kapattı).
 *
 *  3. Fonksiyon redefinition takibi: mevcut bir fonksiyonu yeniden tanımlayan
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
    /** Bu dosyada SECURITY DEFINER olarak tanımlanan fonksiyon adları. */
    definerFns: string[];
    /** Bu dosyada `from public, anon, authenticated` ile revoke edilen adlar. */
    roleRevokedFns: string[];
}

/** `create or replace function <ad>(...)` bloklarını gövdeleriyle ayırır —
 *  DEFINER kararı fonksiyon BAŞINA verilmeli (bir migration hem DEFINER hem
 *  INVOKER fonksiyon tanımlayabilir). */
function definerFunctionsIn(src: string): string[] {
    const names: string[] = [];
    const heads = [...src.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?([a-z0-9_]+)/gi)];
    for (let i = 0; i < heads.length; i++) {
        const start = heads[i].index ?? 0;
        const end = i + 1 < heads.length ? (heads[i + 1].index ?? src.length) : src.length;
        if (/SECURITY\s+DEFINER/i.test(src.slice(start, end))) names.push(heads[i][1].toLowerCase());
    }
    return names;
}

/** `revoke all on function <ad>(...) from <roller>;` — imza çok satırlı olabilir. */
function roleRevokedFunctionsIn(src: string): string[] {
    const names: string[] = [];
    const re = /REVOKE\s+ALL\s+ON\s+FUNCTION\s+(?:public\.)?([a-z0-9_]+)\s*\([\s\S]*?\)\s*FROM\s+([a-z0-9_,\s]+);/gi;
    for (const m of src.matchAll(re)) {
        const roles = m[2].toLowerCase();
        if (roles.includes("anon") && roles.includes("authenticated")) names.push(m[1].toLowerCase());
    }
    return names;
}

/** SQL satır yorumlarını ayıkla — "-- SECURITY DEFINER YOK" gibi açıklamalar
 *  yanlış-pozitif üretmesin (093'te gate'in kendisi yakaladı). */
function stripSqlComments(src: string): string {
    return src.replace(/--[^\n]*/g, "");
}

const inventory: MigInfo[] = files.map((file) => {
    const src = stripSqlComments(readFileSync(join(MIG_DIR, file), "utf8"));
    return {
        file,
        num: file.slice(0, 3),
        definer: /SECURITY DEFINER/i.test(src),
        hasSearchPath: /SET search_path/i.test(src),
        hasGrant: /REVOKE|GRANT EXECUTE/i.test(src),
        fns: [...src.matchAll(/CREATE OR REPLACE FUNCTION\s+(?:public\.)?([a-z0-9_]+)/gi)]
            .map((m) => m[1].toLowerCase()),
        definerFns: definerFunctionsIn(src),
        roleRevokedFns: roleRevokedFunctionsIn(src),
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

    it("her DEFINER fonksiyonu public+anon+authenticated'tan revoke edilmiş", () => {
        // Revoke migration'lar arası aranır: sonraki bir migration (ör. 110)
        // önceki bir dosyanın eksiğini kapatabilir → gate kendi kendini temizler.
        const roleRevoked = new Set(inventory.flatMap((m) => m.roleRevokedFns));
        const exempt = new Set(
            inventory.filter((m) => DEFINER_GRANDFATHER.includes(m.file)).flatMap((m) => m.definerFns),
        );

        const missing: string[] = [];
        for (const m of inventory) {
            for (const fn of m.definerFns) {
                if (roleRevoked.has(fn) || exempt.has(fn)) continue;
                missing.push(`${fn} (${m.file})`);
            }
        }
        expect(
            [...new Set(missing)],
            `SECURITY DEFINER fonksiyon(lar)ı anon/authenticated'tan revoke EDİLMEMİŞ:\n  ${missing.join("\n  ")}\n` +
            "→ `REVOKE ALL ON FUNCTION <ad>(<imza>) FROM public, anon, authenticated;` yazın.\n" +
            "   YALNIZ `FROM public` YETMEZ: Supabase varsayılan ayrıcalıkları anon/authenticated'a\n" +
            "   DOĞRUDAN EXECUTE verir; `FROM public` yalnız PUBLIC pseudo-rolünü kaldırır.\n" +
            "   DEFINER fonksiyon çağıranın RLS'ine tabi DEĞİLDİR → tablo policy'leri devreye girmez.\n" +
            "   Emsal: 055_revoke_ai_feedback_rpc_authenticated.sql · 110_fix_definer_rpc_grants.sql",
        ).toEqual([]);
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

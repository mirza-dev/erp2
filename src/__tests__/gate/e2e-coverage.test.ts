/**
 * GATE: her dashboard rotasının bir Playwright spec'i var (2026-09-16, A1 kapsama).
 *
 * 2026-09-15 envanteri: 13 spec / 94 test vardı ama quotes · vendors · purchase/rfqs ·
 * purchase/orders/[id] · orders/[id]/edit · settings/{product-types,note-templates,
 * email-deliveries} · developer/* için SIFIR spec. Kimse fark etmemişti — envanter, ölçmediğini
 * kapsayamaz. Bu kapı rota ağacını DOSYA SİSTEMİNDEN üretir (elle liste değil): yeni bir
 * `page.tsx` eklenip spec yazılmazsa kırmızı yanar.
 *
 * Eşleşme: rotanın statik parçaları spec kaynağında geçmeli; `[id]` segmenti bir şablon
 * ifadesi (`${…}`) veya UUID/regex kalıbıyla karşılanır. `page.goto`, `gotoApp`, `waitForURL`
 * ve `toHaveURL` çağrıları eşit sayılır — hepsi o rotanın gerçekten ziyaret edildiğini gösterir.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const APP = join(ROOT, "src/app/dashboard");

/** Gerekçeli istisnalar — sessiz değil, sebebi burada. */
const ALLOWLIST: Record<string, string> = {
    "/dashboard/developer/errors/[id]":
        "hata grubu ancak gerçek bir hata kaydıyla oluşur; liste + filtreler developer.spec'te, detay yerel DB'de üretilemez",
    "/dashboard/import/extract/[documentId]":
        "AI çıkarım inceleme ekranı: belge ancak Anthropic anahtarıyla sınıflanır (yerelde 401 mandalı) — hub + Excel sihirbazı import.spec'te",
};

function pages(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...pages(p));
        else if (name === "page.tsx") out.push("/dashboard" + relative(APP, dir).split("\\").join("/").replace(/^(.)/, "/$1").replace(/^\/$/, ""));
    }
    return out.map(r => r.replace(/\/$/, "")).map(r => (r === "/dashboard/" ? "/dashboard" : r));
}

function specSources(): string {
    const dir = join(ROOT, "tests");
    return readdirSync(dir)
        .filter(f => f.endsWith(".spec.ts"))
        .map(f => readFileSync(join(dir, f), "utf8"))
        .join("\n");
}

function routeRegex(route: string): RegExp {
    const parts = route.split("/").filter(Boolean).map(seg =>
        seg.startsWith("[") ? "(?:\\$\\{[^}]+\\}|[0-9a-f-]{36}|\\[0-9a-f-\\]\\{36\\}|00000000[0-9a-f-]*)" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    // Rotanın sonu: string/şablon kapanışı, `?`, `$`, `/edit` gibi alt segment DEĞİL
    return new RegExp("/" + parts.join("/") + "(?=[\"'`?\\s)$]|\\?)");
}

describe("GATE — E2E rota kapsaması", () => {
    const routes = pages(APP).sort();
    const specs = specSources();

    it("rota ağacı üretildi (boş küme denetlenmesin)", () => {
        expect(routes.length).toBeGreaterThanOrEqual(30);
        expect(routes).toContain("/dashboard/quotes/[id]");
    });

    it.each(routes)("%s için bir spec ziyaret ediyor", route => {
        if (ALLOWLIST[route]) return;
        // Boolean iddia: hata mesajı tüm spec kaynağını dökmesin.
        expect(routeRegex(route).test(specs), `${route} hiçbir tests/*.spec.ts'te ziyaret edilmiyor`).toBe(true);
    });

    it("allowlist bayat değil: kayıtlı rotalar hâlâ var ve gerçekten kapsanmıyor", () => {
        for (const route of Object.keys(ALLOWLIST)) {
            expect(routes, `${route} artık yok — allowlist'ten düş`).toContain(route);
            expect(routeRegex(route).test(specs), `${route} artık kapsanıyor — allowlist'ten düş`).toBe(false);
        }
    });
});

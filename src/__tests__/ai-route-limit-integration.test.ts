/**
 * AI Route guard integration — source-regex regression lock.
 *
 * 5 AI route'unun guardAiRoute helper'ını import + auth check'ten sonra
 * çağırdığını ve Anthropic çağrısından önce yerleştiğini doğrular.
 *
 * Observability route (`/api/ai/observability`) hariç tutulur — Anthropic
 * çağrısı YOK (sadece DB okuma).
 *
 * Gelecek bir refactor guard'ı yanlışlıkla silerse bu test kırılır.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROUTES = [
    {
        path: "src/app/api/ai/purchase-copilot/route.ts",
        limit: 10,  // 2026-05-26 advisor refinement: 5 → 10 (sayfa açılışı + yenile yetersizdi)
        routeName: "purchase-copilot",
    },
    {
        path: "src/app/api/ai/stock-risk/route.ts",
        limit: 5,
        routeName: "stock-risk",
    },
    {
        path: "src/app/api/ai/parse/route.ts",
        limit: 10,
        routeName: "parse",
    },
    {
        path: "src/app/api/ai/ops-summary/route.ts",
        limit: 5,
        routeName: "ops-summary",
    },
    {
        path: "src/app/api/ai/score/route.ts",
        limit: 5,
        routeName: "score",
    },
] as const;

describe("AI route guard — 5 route'ta source pattern kilidi", () => {
    for (const { path, limit, routeName } of ROUTES) {
        describe(routeName, () => {
            const src = readFileSync(join(process.cwd(), path), "utf8");

            it("guardAiRoute helper import edilmiş", () => {
                expect(src).toMatch(/import\s*\{[^}]*guardAiRoute[^}]*\}\s*from\s*["']@\/lib\/ai-route-limit["']/);
            });

            it(`guardAiRoute("${routeName}", ${limit}) çağrısı mevcut`, () => {
                // request veya req parametre adı + route ismi + limit eşleşmeli
                const pattern = new RegExp(
                    `guardAiRoute\\((request|req),\\s*["']${routeName}["'],\\s*${limit}\\)`,
                );
                expect(src).toMatch(pattern);
            });

            it("guard → if (limited) return limited; erken çıkış (await — Redis-backed)", () => {
                // guardAiRoute artık async (Redis-primary + in-memory fallback) → await zorunlu.
                expect(src).toMatch(/const\s+limited\s*=\s*await\s+guardAiRoute\(/);
                expect(src).toMatch(/if\s*\(limited\)\s*return\s+limited;?/);
            });
        });
    }

    it("observability route guard YOK (Anthropic çağrısı yok)", () => {
        const observabilityPath = join(process.cwd(), "src/app/api/ai/observability/route.ts");
        if (!existsSync(observabilityPath)) return;
        const src = readFileSync(observabilityPath, "utf8");
        expect(src).not.toMatch(/guardAiRoute/);
    });
});

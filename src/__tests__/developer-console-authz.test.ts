/**
 * Developer Console §2, §22 — yetkilendirme.
 *
 * Şart: "Sadece frontend'de route'u gizlemek YETERLİ DEĞİLDİR." Bu yüzden
 * testlerin ağırlığı SUNUCU tarafında: uçlar doğrudan çağrılıyor ve
 * `requireInternalOperatorFor` GERÇEK kodla çalışıyor (yalnız oturum ve DB
 * mock'lanıyor) — guard mock'lansaydı test yalnız mock'u doğrulardı.
 *
 * Ayrıca dizin ENUMERATE edilir: ileride guard'sız yeni bir `/api/developer/*`
 * ucu eklenirse bu test kırılır. Tek tek uç saymak, unutulan ucu yakalamaz.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const mockResolveAuthContext = vi.fn();

vi.mock("@/lib/auth/role-guard", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/auth/role-guard")>();
    return { ...actual, resolveAuthContext: () => mockResolveAuthContext() };
});

// DB katmanı — yetki testinde canlıya gidilmez.
vi.mock("@/lib/supabase/telemetry", () => ({
    dbListErrorGroups: vi.fn().mockResolvedValue({ rows: [], nextCursor: null }),
    dbTelemetryTableSizes: vi.fn().mockResolvedValue({}),
    dbPerformanceSummary: vi.fn().mockResolvedValue({
        endpoints: [], totalRequests: 0, totalErrors: 0,
        overall: { avgMs: null, p95Ms: null }, buckets: [],
    }),
    dbRecordRequestMetrics: vi.fn().mockResolvedValue(1),
}));
vi.mock("@/lib/supabase/developer-bugs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/supabase/developer-bugs")>();
    return { ...actual, dbListBugs: vi.fn().mockResolvedValue([]) };
});
vi.mock("@/lib/supabase/developer-feed", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/supabase/developer-feed")>();
    return { ...actual, dbActivityFeed: vi.fn().mockResolvedValue({ entries: [], nextCursor: null }) };
});

import { permissionsForRoles } from "@/lib/auth/permissions";
import { canAccessPath, requiredPermissionForPath } from "@/lib/auth/page-access";
import { hasInternalOperatorAccess } from "@/lib/auth/internal-access";
import { GET as errorsGET } from "@/app/api/developer/errors/route";
import { GET as bugsGET } from "@/app/api/developer/bugs/route";
import { GET as logsGET } from "@/app/api/developer/logs/route";
import { GET as diagGET } from "@/app/api/developer/diagnostics/route";
import { POST as rumPOST } from "@/app/api/developer/rum/route";
import type { NextRequest } from "next/server";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Yorumları düşürür — iddia açıklamaya değil koda bakmalı. */
function code(src: string): string {
    // Satır yorumları ÖNCE ayıklanır: bir `//` yorumunun içindeki `/**`
    // (ör. "// /dashboard/** erişimi") aksi hâlde blok yorum başlangıcı
    // sanılıp sonraki `*/`e kadar GERÇEK KODU yutuyordu (2026-08).
    return src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const DEV_EMAIL = "gelistirici@firma.com";
const ORIGINAL_ALLOWLIST = process.env.INTERNAL_OPERATOR_EMAILS;

function authAs(email: string | null, roles: ("admin" | "viewer" | "sales")[] = ["admin"]) {
    return {
        user: email ? { id: "u1", email, app_metadata: { roles } } : null,
        userId: email ? "u1" : null,
        roles,
        perms: permissionsForRoles(roles),
    };
}

/**
 * `nextUrl` ELLE eklenir: düz `Request` onu taşımaz ve route'lar
 * `req.nextUrl.searchParams` okuyor — eksik bırakılırsa test 500 görür ve
 * yetki hatası sanılır (ilk yazımda tam olarak bu oldu).
 */
function req(url = "http://localhost/api/developer/errors"): NextRequest {
    const request = new Request(url);
    Object.defineProperty(request, "nextUrl", { value: new URL(url) });
    return request as unknown as NextRequest;
}

beforeEach(() => {
    mockResolveAuthContext.mockReset();
    process.env.INTERNAL_OPERATOR_EMAILS = DEV_EMAIL;
});

afterEach(() => {
    if (ORIGINAL_ALLOWLIST === undefined) delete process.env.INTERNAL_OPERATOR_EMAILS;
    else process.env.INTERNAL_OPERATOR_EMAILS = ORIGINAL_ALLOWLIST;
});

// ── Erişim sinyalinin kendisi ────────────────────────────────────────────

describe("internalOperator sinyali — allowlist ∧ view_settings", () => {
    it("allowlist boşken HERKESE kapalı (fail-closed)", () => {
        delete process.env.INTERNAL_OPERATOR_EMAILS;
        expect(hasInternalOperatorAccess(DEV_EMAIL, permissionsForRoles(["admin"]))).toBe(false);
    });

    it("allowlist'te olan admin geçer", () => {
        expect(hasInternalOperatorAccess(DEV_EMAIL, permissionsForRoles(["admin"]))).toBe(true);
    });

    it("allowlist'te olmayan admin GEÇMEZ", () => {
        expect(hasInternalOperatorAccess("baska@firma.com", permissionsForRoles(["admin"]))).toBe(false);
    });

    it("allowlist'te olsa bile view_settings yoksa geçmez", () => {
        // Satış rolünde view_settings yok → müşteriye atanabilen bir rol
        // allowlist'e girse bile paneli açamaz.
        expect(hasInternalOperatorAccess(DEV_EMAIL, permissionsForRoles(["sales"]))).toBe(false);
    });

    it("e-posta karşılaştırması büyük/küçük harf ve boşluğa duyarsız", () => {
        process.env.INTERNAL_OPERATOR_EMAILS = ` ${DEV_EMAIL.toUpperCase()} `;
        expect(hasInternalOperatorAccess(DEV_EMAIL, permissionsForRoles(["admin"]))).toBe(true);
    });

    it("e-posta yoksa geçmez", () => {
        expect(hasInternalOperatorAccess(null, permissionsForRoles(["admin"]))).toBe(false);
    });
});

// ── Sayfa erişimi ────────────────────────────────────────────────────────

describe("sayfa erişimi (§2 — frontend gizleme tek savunma değil)", () => {
    it("matriste açık kural var (bilinmeyen yol fail-closed'ına güvenilmiyor)", () => {
        expect(requiredPermissionForPath("/dashboard/developer")).toBe("view_settings");
        expect(requiredPermissionForPath("/dashboard/developer/errors")).toBe("view_settings");
    });

    it("sıradan roller sayfaya erişemez", () => {
        for (const role of ["sales", "production", "viewer", "purchasing", "accounting"] as const) {
            expect(
                canAccessPath("/dashboard/developer", permissionsForRoles([role])),
                `${role} erişebiliyor`,
            ).toBe(false);
        }
    });

    it("middleware internalOperator kapısı /dashboard/developer'ı kapsar", () => {
        const proxy = code(read("src/proxy.ts"));
        expect(proxy).toMatch(/INTERNAL_ONLY_PREFIXES/);
        expect(proxy).toContain('"/dashboard/developer"');
        expect(proxy).toMatch(/!hasInternalOperatorAccess\(user\.email, perms\)/);
    });

    it("Sidebar bağlantısı yalnız internalOperator'a çizilir (UX katmanı)", () => {
        const sidebar = code(read("src/components/layout/Sidebar.tsx"));
        expect(sidebar).toMatch(/internalOperator\s*\n?\s*\?\s*\[/);
        expect(sidebar).toContain('href: "/dashboard/developer"');
    });
});

// ── API uçları: doğrudan çağrı ───────────────────────────────────────────

describe("API uçları — doğrudan çağrıda yetkisiz erişim reddedilir", () => {
    const endpoints: Array<[string, () => Promise<Response>]> = [
        ["errors", () => errorsGET(req())],
        ["bugs", () => bugsGET(req("http://localhost/api/developer/bugs"))],
        ["logs", () => logsGET(req("http://localhost/api/developer/logs"))],
        ["diagnostics", () => diagGET()],
    ];

    it("oturumsuz istek 401 alır", async () => {
        mockResolveAuthContext.mockResolvedValue(authAs(null, ["viewer"]));
        for (const [name, call] of endpoints) {
            expect((await call()).status, `${name} 401 dönmedi`).toBe(401);
        }
    });

    it("allowlist DIŞINDAKİ admin 403 alır — rol yetmez", async () => {
        mockResolveAuthContext.mockResolvedValue(authAs("baska@firma.com", ["admin"]));
        for (const [name, call] of endpoints) {
            expect((await call()).status, `${name} 403 dönmedi`).toBe(403);
        }
    });

    it("allowlist tanımsızken yetkili e-posta bile 403 alır (fail-closed)", async () => {
        delete process.env.INTERNAL_OPERATOR_EMAILS;
        mockResolveAuthContext.mockResolvedValue(authAs(DEV_EMAIL, ["admin"]));
        for (const [name, call] of endpoints) {
            expect((await call()).status, `${name} fail-closed değil`).toBe(403);
        }
    });

    it("yetkili geliştirici 200 alır", async () => {
        mockResolveAuthContext.mockResolvedValue(authAs(DEV_EMAIL, ["admin"]));
        for (const [name, call] of endpoints) {
            expect((await call()).status, `${name} 200 dönmedi`).toBe(200);
        }
    });
});

describe("RUM ucu — bilinçli olarak farklı kapı", () => {
    const rumReq = (body: unknown) =>
        new Request("http://localhost/api/developer/rum", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }) as unknown as NextRequest;

    it("oturumsuz istek 401", async () => {
        mockResolveAuthContext.mockResolvedValue(authAs(null, ["viewer"]));
        expect((await rumPOST(rumReq({ samples: [] }))).status).toBe(401);
    });

    it("sıradan kullanıcı YAZABİLİR — performans verisi gerçek trafikten gelmeli", async () => {
        // Gerekçe: yalnız geliştiricinin gezinmesini ölçmek "hangi uç
        // production'da yavaş" sorusunu cevaplamaz. Okuma tarafı yine kapalı.
        mockResolveAuthContext.mockResolvedValue(authAs("satisci@firma.com", ["sales"]));
        const res = await rumPOST(rumReq({
            samples: [{ endpoint: "/api/products", method: "GET", status: 200, durationMs: 100 }],
        }));
        expect(res.status).toBe(200);
    });

    it("samples dizisi yoksa 400", async () => {
        mockResolveAuthContext.mockResolvedValue(authAs("satisci@firma.com", ["sales"]));
        expect((await rumPOST(rumReq({}))).status).toBe(400);
    });

    it("aşırı büyük parti 413", async () => {
        mockResolveAuthContext.mockResolvedValue(authAs("satisci@firma.com", ["sales"]));
        const samples = Array.from({ length: 500 }, () => ({
            endpoint: "/api/products", method: "GET", status: 200, durationMs: 10,
        }));
        expect((await rumPOST(rumReq({ samples }))).status).toBe(413);
    });
});

// ── Dizin enumerasyonu: guard'sız yeni uç eklenemez ──────────────────────

describe("KİLİT — /api/developer altındaki HER method korunur", () => {
    const API_DIR = join(process.cwd(), "src/app/api/developer");

    function walk(dir: string, acc: string[] = []): string[] {
        for (const entry of readdirSync(dir)) {
            const p = join(dir, entry);
            if (statSync(p).isDirectory()) walk(p, acc);
            else if (entry === "route.ts") acc.push(p);
        }
        return acc;
    }

    const files = walk(API_DIR);

    it("en az 10 route dosyası bulundu (enumerasyon çalışıyor)", () => {
        expect(files.length).toBeGreaterThanOrEqual(10);
    });

    it("her dosya bir yetki kapısı içerir", () => {
        const GUARDS = [
            "requireInternalOperatorFor(",
            "requireInternalOperator(",
            "requirePermissionFor(",
            "requireCronSecret(",
        ];
        const bare: string[] = [];
        for (const f of files) {
            const src = code(readFileSync(f, "utf8"));
            if (!GUARDS.some(g => src.includes(g))) bare.push(f.slice(API_DIR.length + 1));
        }
        expect(
            bare,
            `Guard'sız Developer Console ucu:\n  ${bare.join("\n  ")}\n`
            + "→ resolveAuthContext() + requireInternalOperatorFor(auth) ekleyin.",
        ).toEqual([]);
    });

    it("okuma uçlarının hepsi internalOperator ister (rum/retention hariç)", () => {
        const exempt = ["rum/route.ts", "retention/route.ts"];
        for (const f of files) {
            const rel = f.slice(API_DIR.length + 1);
            if (exempt.includes(rel)) continue;
            expect(
                code(readFileSync(f, "utf8")),
                `${rel} internalOperator kapısı kullanmıyor`,
            ).toContain("requireInternalOperatorFor(");
        }
    });

    it("her route merkezi hata yakalayıcıdan geçer (telemetri kancası orada)", () => {
        for (const f of files) {
            expect(
                code(readFileSync(f, "utf8")),
                `${f.slice(API_DIR.length + 1)} handleApiError kullanmıyor`,
            ).toContain("handleApiError");
        }
    });
});

// ── Telemetri sunucu tarafında kalır ─────────────────────────────────────

describe("KİLİT — sunucu-özel modüller istemciye sızmaz", () => {
    it("istemci sayfaları supabase modüllerini import etmez", () => {
        const pages = [
            "src/app/dashboard/developer/page.tsx",
            "src/app/dashboard/developer/errors/page.tsx",
            "src/app/dashboard/developer/errors/[id]/page.tsx",
            "src/app/dashboard/developer/logs/page.tsx",
            "src/app/dashboard/developer/bugs/page.tsx",
            "src/app/dashboard/developer/performance/page.tsx",
            "src/app/dashboard/developer/diagnostics/page.tsx",
        ];
        for (const p of pages) {
            const src = code(read(p));
            expect(src, `${p} "use client" değil`).toMatch(/^"use client";/);
            expect(src, `${p} supabase modülü import ediyor`)
                .not.toMatch(/from "@\/lib\/supabase\//);
            expect(src, `${p} servis katmanını import ediyor`)
                .not.toMatch(/from "@\/lib\/services\//);
        }
    });

    it("paylaşılan tip modülü çalışma zamanı bağımlılığı taşımaz", () => {
        const src = code(read("src/lib/telemetry/console-types.ts"));
        expect(src).not.toMatch(/from "@\/lib\/supabase\//);
        expect(src).not.toMatch(/from "next\//);
    });
});

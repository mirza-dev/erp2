/**
 * Server-Timing helper — kalıcı performans turu Faz 0.
 * appendServerTiming yalnız 3 yavaş route'ta kullanılır (products?all=1,
 * orders?all=1, dashboard/finance) — route kapsama kilidi de burada.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appendServerTiming, startSpan } from "@/lib/server-timing";

describe("startSpan", () => {
    it("geçen süreyi ms olarak döndürür (negatif olmaz)", async () => {
        const stop = startSpan();
        await new Promise(r => setTimeout(r, 5));
        const ms = stop();
        expect(ms).toBeGreaterThan(0);
    });
});

describe("appendServerTiming", () => {
    it("header'ı doğru formatta yazar", () => {
        const res = appendServerTiming(new Response(null), [
            { name: "auth", ms: 12.34 },
            { name: "db", ms: 456.789 },
        ]);
        expect(res.headers.get("Server-Timing")).toBe("auth;dur=12.3, db;dur=456.8");
    });

    it("mevcut header'a ekler, ezmez", () => {
        const base = new Response(null);
        base.headers.set("Server-Timing", "edge;dur=1.0");
        const res = appendServerTiming(base, [{ name: "db", ms: 2 }]);
        expect(res.headers.get("Server-Timing")).toBe("edge;dur=1.0, db;dur=2.0");
    });

    it("boş span listesi no-op; negatif ms 0'a kırpılır", () => {
        const res = appendServerTiming(new Response(null), []);
        expect(res.headers.get("Server-Timing")).toBeNull();
        const res2 = appendServerTiming(new Response(null), [{ name: "x", ms: -5 }]);
        expect(res2.headers.get("Server-Timing")).toBe("x;dur=0.0");
    });
});

describe("ölçüm kapsamı — yalnız 3 yavaş route", () => {
    const root = process.cwd();
    it("products/orders/finance route'ları appendServerTiming kullanır", () => {
        for (const f of [
            "src/app/api/products/route.ts",
            "src/app/api/orders/route.ts",
            "src/app/api/dashboard/finance/route.ts",
        ]) {
            expect(readFileSync(join(root, f), "utf8")).toContain("appendServerTiming");
        }
    });
});

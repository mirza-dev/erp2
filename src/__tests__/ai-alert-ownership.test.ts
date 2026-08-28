/**
 * AI uyarısı sahipliği (2026-08-24) — "AI önerileri tutarlı sonuç üretemiyor"un
 * kök nedeni.
 *
 * Kural taraması, ürün kendi eşiğine göre sağlıklı olduğunda `stock_risk`
 * uyarılarını "stock_recovered" ile kapatıyordu. `dbBatchResolveAlerts` yalnız
 * type + entity_id ile eşleştiği için AI bulgularını da siliyordu.
 *
 * Bu YAPISAL bir çelişkiydi: AI tam da kurala göre sağlıklı ürünlere yazar
 * (varlık sebebi kuralın kaçırdığını bulmaktır — "640 adet var ama 60 gün
 * lead-time için 600 gerekiyor, min 150 yanlış"), dolayısıyla her AI bulgusu
 * bir sonraki taramada ölüyordu.
 *
 * Canlı iz (düzeltme öncesi): 102 AI uyarısının TAMAMI `stock_recovered`,
 * medyan ömür 6 saniye, tek üründe 40 tekrar, `updated` sayacı hep 0.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it, vi, beforeEach } from "vitest";

type Call = { m: string; args: unknown[] };
let calls: Call[] = [];

function builder() {
    const b: Record<string, unknown> = {};
    const rec = (m: string) => (...args: unknown[]) => { calls.push({ m, args }); return b; };
    for (const m of ["update", "eq", "in", "select", "order", "limit"]) b[m] = rec(m);
    b.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve);
    return b;
}
const mockFrom = vi.fn(() => builder());
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: mockFrom }) }));

import { dbBatchResolveAlerts } from "@/lib/supabase/alerts";

beforeEach(() => { calls = []; mockFrom.mockClear(); });
const eqArgs = () => calls.filter(c => c.m === "eq").map(c => c.args);

describe("dbBatchResolveAlerts — kaynak sahipliği", () => {
    it("source verilince sorguya .eq('source', …) ekler", async () => {
        await dbBatchResolveAlerts([
            { type: "stock_risk", entityId: "p1", reason: "stock_recovered", source: "system" },
        ]);
        expect(eqArgs()).toContainEqual(["source", "system"]);
    });

    it("source verilmezse kaynak filtresi EKLEMEZ (eski çağrılar aynen çalışır)", async () => {
        await dbBatchResolveAlerts([
            { type: "overdue_shipment", entityId: "o1", reason: "order_shipped" },
        ]);
        expect(eqArgs().some(a => a[0] === "source")).toBe(false);
    });

    it("farklı source'lar AYRI sorgulara bölünür (gruplama anahtarı source'u içerir)", async () => {
        await dbBatchResolveAlerts([
            { type: "stock_risk", entityId: "p1", reason: "stock_recovered", source: "system" },
            { type: "stock_risk", entityId: "p2", reason: "ai_finding_cleared", source: "ai" },
        ]);
        expect(eqArgs()).toContainEqual(["source", "system"]);
        expect(eqArgs()).toContainEqual(["source", "ai"]);
        expect(mockFrom).toHaveBeenCalledTimes(2);
    });

    it("aynı type+reason+source tek sorguda toplanır (grup verimliliği korunur)", async () => {
        await dbBatchResolveAlerts([
            { type: "stock_risk", entityId: "p1", reason: "stock_recovered", source: "system" },
            { type: "stock_risk", entityId: "p2", reason: "stock_recovered", source: "system" },
        ]);
        expect(mockFrom).toHaveBeenCalledTimes(1);
        const inCall = calls.find(c => c.m === "in" && c.args[0] === "entity_id");
        expect(inCall!.args[1]).toEqual(["p1", "p2"]);
    });

    it("boş girdide ağa çıkmaz", async () => {
        expect(await dbBatchResolveAlerts([])).toBe(0);
        expect(mockFrom).not.toHaveBeenCalled();
    });
});

// ── Kaynak kilitleri: çağıranların doğru sahipliği geçirdiği ─────────────────
const SERVICE_SRC = readFileSync(
    join(process.cwd(), "src/lib/services/alert-service.ts"), "utf8",
);

describe("çağıran tarafı — kim neyi kapatır", () => {
    it("kural taraması stok uyarılarını YALNIZ source:'system' ile kapatır", () => {
        expect(SERVICE_SRC).toMatch(
            /type: "stock_critical", entityId, reason: "stock_recovered", source: "system"/,
        );
        expect(SERVICE_SRC).toMatch(
            /type: "stock_risk", entityId, reason: "stock_recovered", source: "system"/,
        );
    });

    it("filtresiz stock_recovered kapatması GERİ GELMEZ (regresyon kilidi)", () => {
        // Bu satır geri gelirse AI bulguları yeniden 6 saniyede silinir.
        expect(SERVICE_SRC).not.toMatch(
            /reason: "stock_recovered" \}\)/,
        );
    });

    it("AI kendi bayatlayan bulgusunu source:'ai' ile kapatır (simetri)", () => {
        expect(SERVICE_SRC).toMatch(/reason: "ai_finding_cleared", source: "ai"/);
    });
});

describe("AI hata sinyali servis dışına taşınır", () => {
    it("AiAlertGenerationResult degraded taşır", () => {
        expect(SERVICE_SRC).toMatch(/degraded: boolean;/);
    });

    it("AI çağrısı patlayınca degraded:true döner (mevcut uyarılara dokunulmaz)", () => {
        expect(SERVICE_SRC).toMatch(
            /if \(result\.degraded\) \{[\s\S]{0,160}degraded: true, summary: "" \};/,
        );
    });

    it("başarılı koşu degraded:false döner", () => {
        expect(SERVICE_SRC).toMatch(/dismissed, created, updated, degraded: false/);
    });
});

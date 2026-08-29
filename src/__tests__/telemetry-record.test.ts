/**
 * Developer Console §20, §23, §24 — telemetri yazma yolunun fail-safe sözleşmesi.
 *
 * Buradaki en önemli iddia şu: **telemetri arızası iş mantığını BOZMAZ.**
 * `handleApiError` her ERP hatasında bu kodu çalıştırıyor; burada bir throw
 * kaçarsa ERP'nin hata yolu da çöker — yani sistemin en kötü anında ikinci bir
 * kırılma eklenir. Ama sessiz de olmamalı: arıza sayaca işlenmeli.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRecordOccurrence = vi.fn();
const mockRecordEvent = vi.fn();

vi.mock("@/lib/supabase/telemetry", () => ({
    dbRecordErrorOccurrence: (...a: unknown[]) => mockRecordOccurrence(...a),
    dbRecordSystemEvent: (...a: unknown[]) => mockRecordEvent(...a),
}));

import {
    isTelemetryEnabled,
    recordError,
    recordEvent,
    resetTelemetryDiagnostics,
    scheduleTelemetry,
    telemetryDiagnostics,
    telemetryEnvironment,
} from "@/lib/telemetry/record";

const ORIGINAL_FLAG = process.env.TELEMETRY_ENABLED;

beforeEach(() => {
    mockRecordOccurrence.mockReset().mockResolvedValue("group-1");
    mockRecordEvent.mockReset().mockResolvedValue(undefined);
    resetTelemetryDiagnostics();
    process.env.TELEMETRY_ENABLED = "true";
});

afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.TELEMETRY_ENABLED;
    else process.env.TELEMETRY_ENABLED = ORIGINAL_FLAG;
});

describe("ortam kapısı (§25)", () => {
    it("test koşumunda VARSAYILAN kapalı — 6500+ mevcut test DB'ye gitmez", () => {
        delete process.env.TELEMETRY_ENABLED;
        expect(isTelemetryEnabled()).toBe(false);
    });

    it("açık bayrak her iki yönde de üstün", () => {
        process.env.TELEMETRY_ENABLED = "true";
        expect(isTelemetryEnabled()).toBe(true);
        process.env.TELEMETRY_ENABLED = "false";
        expect(isTelemetryEnabled()).toBe(false);
    });

    it("kapalıyken hiç yazma denemez", async () => {
        process.env.TELEMETRY_ENABLED = "false";
        await recordError({ error: new Error("x") });
        expect(mockRecordOccurrence).not.toHaveBeenCalled();
    });

    it("ortam etiketi Sentry ile aynı kaynaktan gelir", () => {
        expect(typeof telemetryEnvironment()).toBe("string");
        expect(telemetryEnvironment().length).toBeGreaterThan(0);
    });
});

describe("fail-safe (§20) — asla throw etmez", () => {
    it("DB reddederse recordError THROW ETMEZ", async () => {
        mockRecordOccurrence.mockRejectedValue(new Error("relation does not exist"));
        await expect(recordError({ error: new Error("iş hatası") })).resolves.toBeUndefined();
    });

    it("arıza sessizce yutulmaz — sayaç ve son mesaj tutulur", async () => {
        mockRecordOccurrence.mockRejectedValue(new Error("telemetry down"));
        await recordError({ error: new Error("iş hatası") });

        const diag = telemetryDiagnostics();
        expect(diag.failures).toBe(1);
        expect(diag.lastFailureMessage).toContain("telemetry down");
        expect(diag.lastFailureAt).not.toBeNull();
    });

    it("telemetri arızası KENDİNİ telemetriye yazmaz (sonsuz döngü yok)", async () => {
        mockRecordOccurrence.mockRejectedValue(new Error("down"));
        await recordError({ error: new Error("iş hatası") });
        // Tek çağrı yapıldı ve başarısız oldu; ikinci bir kayıt denemesi YOK.
        expect(mockRecordOccurrence).toHaveBeenCalledTimes(1);
        expect(mockRecordEvent).not.toHaveBeenCalled();
    });

    it("recordEvent de throw etmez", async () => {
        mockRecordEvent.mockRejectedValue(new Error("down"));
        await expect(recordEvent({ level: "info", message: "x" })).resolves.toBeUndefined();
        expect(telemetryDiagnostics().failures).toBe(1);
    });

    it("scheduleTelemetry istek kapsamı dışında patlamaz", () => {
        // `after()` istek kapsamı dışında fırlatır; helper bunu yutup görevi
        // yine de tetiklemeli.
        expect(() => scheduleTelemetry(async () => { /* no-op */ })).not.toThrow();
    });
});

describe("kayıt içeriği", () => {
    it("Error'dan tip, mesaj, stack ve ciddiyet türetilir", async () => {
        await recordError({
            error: new TypeError("Cannot read x"),
            label: "GET /api/quotes",
            statusCode: 500,
        });

        expect(mockRecordOccurrence).toHaveBeenCalledTimes(1);
        const arg = mockRecordOccurrence.mock.calls[0][0];
        expect(arg.errorType).toBe("TypeError");
        expect(arg.severity).toBe("error");
        expect(arg.fingerprint).toMatch(/^[0-9a-f]{16}$/);
        expect(arg.stack).toBeTruthy();
    });

    it("etiketten endpoint ve method çıkarılır — route imzası değişmeden", async () => {
        await recordError({ error: new Error("x"), label: "PATCH /api/quotes/[id]", statusCode: 500 });
        const arg = mockRecordOccurrence.mock.calls[0][0];
        expect(arg.endpoint).toBe("/api/quotes/[id]");
        expect(arg.method).toBe("PATCH");
        expect(arg.module).toBe("quotes");
    });

    it("ConfigError kritik olarak işaretlenir", async () => {
        const err = new Error("MISSING ENV: SUPABASE_URL");
        err.name = "ConfigError";
        await recordError({ error: err, statusCode: 503 });
        expect(mockRecordOccurrence.mock.calls[0][0].severity).toBe("critical");
    });

    it("Error olmayan değerler (Supabase düz nesnesi) de kaydedilir", async () => {
        await recordError({
            error: { message: "duplicate key value", code: "23505" },
            statusCode: 500,
        });
        const arg = mockRecordOccurrence.mock.calls[0][0];
        expect(arg.errorType).toBe("PG_23505");
        expect(arg.normalizedMessage).toContain("duplicate key");
    });

    it("hassas bağlam redakte edilerek yazılır", async () => {
        await recordError({
            error: new Error("giriş başarısız"),
            context: { password: "gizli123", user: "ali" },
        });
        const arg = mockRecordOccurrence.mock.calls[0][0];
        expect(arg.context.password).toBe("[REDACTED]");
        expect(arg.context.user).toBe("ali");
    });

    it("açık requestId/userAgent geçilebilir (onRequestError yolu)", async () => {
        await recordError({
            error: new Error("x"),
            requestId: "abc123def456ghi7",
            userAgent: "Mozilla/5.0",
        });
        const arg = mockRecordOccurrence.mock.calls[0][0];
        expect(arg.requestId).toBe("abc123def456ghi7");
        expect(arg.userAgent).toBe("Mozilla/5.0");
    });
});

describe("hız tavanı (§23, §24) — hata fırtınası telemetriyi pahalılaştırmaz", () => {
    it("saniyede 50 yazmadan sonrası düşürülür ve sayılır", async () => {
        for (let i = 0; i < 60; i++) {
            await recordError({ error: new Error(`hata ${i}`) });
        }
        const diag = telemetryDiagnostics();
        expect(mockRecordOccurrence.mock.calls.length).toBe(50);
        expect(diag.dropped).toBe(10);
        // Düşürülenler ARIZA değildir — ayrı sayaçta tutulur.
        expect(diag.failures).toBe(0);
    });
});

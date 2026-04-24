/**
 * Tests for parasutApiCall() wrapper — Faz 3
 * Coverage: success, 429+retry→success, 429+retry→error, non-rate-limit error,
 *           PARASUT_ENABLED guard, context logging
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parasutApiCall } from "@/lib/services/parasut-api-call";
import { ParasutError } from "@/lib/parasut-adapter";

const saved: Record<string, string | undefined> = {};

describe("parasutApiCall", () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        saved.PARASUT_ENABLED = process.env.PARASUT_ENABLED;
        process.env.PARASUT_ENABLED = "true";
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        process.env.PARASUT_ENABLED = saved.PARASUT_ENABLED;
    });

    // ── Success path ──────────────────────────────────────────────────────────

    it("passes result through on success", async () => {
        const fn = vi.fn().mockResolvedValue("data");
        const promise = parasutApiCall({ op: "createSalesInvoice", orderId: "ord-1", step: "invoice" }, fn);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toBe("data");
        expect(fn).toHaveBeenCalledOnce();
    });

    it("logs success with context fields", async () => {
        const fn = vi.fn().mockResolvedValue(42);
        const promise = parasutApiCall({ op: "testOp", orderId: "ord-99", step: "contact" }, fn);
        await vi.runAllTimersAsync();
        await promise;

        expect(logSpy).toHaveBeenCalledOnce();
        const log = JSON.parse(logSpy.mock.calls[0][0] as string);
        expect(log.status).toBe("success");
        expect(log.parasut_api).toBe("testOp");
        expect(log.orderId).toBe("ord-99");
        expect(log.step).toBe("contact");
        expect(log.attempt).toBe(1);
        expect(typeof log.duration_ms).toBe("number");
    });

    // ── 429 → success ─────────────────────────────────────────────────────────

    it("retries after 429 and returns result on second call", async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new ParasutError("rate_limit", "Too Many Requests", 10))
            .mockResolvedValueOnce("retried");

        const promise = parasutApiCall({ op: "createContact", step: "contact" }, fn);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toBe("retried");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("logs rate_limited then success_after_retry", async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new ParasutError("rate_limit", "Too Many Requests", 10))
            .mockResolvedValueOnce("ok");

        const promise = parasutApiCall({ op: "createContact" }, fn);
        await vi.runAllTimersAsync();
        await promise;

        expect(logSpy).toHaveBeenCalledTimes(2);
        const log1 = JSON.parse(logSpy.mock.calls[0][0] as string);
        expect(log1.rate_limited).toBe(true);
        expect(log1.wait_sec).toBe(10);
        const log2 = JSON.parse(logSpy.mock.calls[1][0] as string);
        expect(log2.status).toBe("success_after_retry");
        expect(log2.attempt).toBe(2);
    });

    it("caps Retry-After at 30 seconds", async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new ParasutError("rate_limit", "Too Many Requests", 120))
            .mockResolvedValueOnce("ok");

        const promise = parasutApiCall({ op: "op" }, fn);
        await vi.runAllTimersAsync();
        await promise;

        const log1 = JSON.parse(logSpy.mock.calls[0][0] as string);
        expect(log1.wait_sec).toBe(30);
    });

    it("uses 5s default when retryAfterSec is missing on 429", async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new ParasutError("rate_limit", "Too Many Requests"))
            .mockResolvedValueOnce("ok");

        const promise = parasutApiCall({ op: "op" }, fn);
        await vi.runAllTimersAsync();
        await promise;

        const log1 = JSON.parse(logSpy.mock.calls[0][0] as string);
        expect(log1.wait_sec).toBe(5);
    });

    // ── 429 → error ───────────────────────────────────────────────────────────

    it("throws after second consecutive 429", async () => {
        const rate429 = new ParasutError("rate_limit", "Too Many Requests", 5);
        const fn = vi.fn()
            .mockRejectedValueOnce(rate429)
            .mockRejectedValueOnce(rate429);

        const promise = parasutApiCall({ op: "createSalesInvoice" }, fn);
        const assertion = expect(promise).rejects.toThrow("Too Many Requests");
        await vi.runAllTimersAsync();
        await assertion;

        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("logs error_after_retry when second call fails", async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new ParasutError("rate_limit", "Too Many Requests", 5))
            .mockRejectedValueOnce(new ParasutError("server", "Internal error"));

        const promise = parasutApiCall({ op: "op" }, fn);
        const assertion = expect(promise).rejects.toThrow();
        await vi.runAllTimersAsync();
        await assertion;

        expect(logSpy).toHaveBeenCalledTimes(2);
        const log2 = JSON.parse(logSpy.mock.calls[1][0] as string);
        expect(log2.status).toBe("error_after_retry");
        expect(log2.error_kind).toBe("server");
        expect(log2.attempt).toBe(2);
    });

    // ── Non-rate-limit error ──────────────────────────────────────────────────

    it("throws immediately for non-rate-limit ParasutError", async () => {
        const fn = vi.fn().mockRejectedValue(new ParasutError("server", "Internal error"));
        const promise = parasutApiCall({ op: "op" }, fn);
        const assertion = expect(promise).rejects.toThrow("Internal error");
        await vi.runAllTimersAsync();
        await assertion;

        expect(fn).toHaveBeenCalledOnce();
    });

    it("logs error with correct error_kind for non-rate-limit error", async () => {
        const fn = vi.fn().mockRejectedValue(new ParasutError("not_found", "Contact not found"));
        const promise = parasutApiCall({ op: "findContacts" }, fn);
        const assertion = expect(promise).rejects.toThrow();
        await vi.runAllTimersAsync();
        await assertion;

        const log = JSON.parse(logSpy.mock.calls[0][0] as string);
        expect(log.status).toBe("error");
        expect(log.error_kind).toBe("not_found");
    });

    it("wraps non-ParasutError as server error in log but re-throws original", async () => {
        const original = new Error("Network timeout");
        const fn = vi.fn().mockRejectedValue(original);
        const promise = parasutApiCall({ op: "op" }, fn);
        const assertion = expect(promise).rejects.toBe(original);
        await vi.runAllTimersAsync();
        await assertion;

        const log = JSON.parse(logSpy.mock.calls[0][0] as string);
        expect(log.status).toBe("error");
        expect(log.error_kind).toBe("server");
    });

    // ── PARASUT_ENABLED guard ─────────────────────────────────────────────────

    it("throws when PARASUT_ENABLED is not set", async () => {
        delete process.env.PARASUT_ENABLED;
        const fn = vi.fn();

        await expect(parasutApiCall({ op: "op" }, fn)).rejects.toThrow(/devre dışı/i);
        expect(fn).not.toHaveBeenCalled();
    });

    it("throws when PARASUT_ENABLED=false", async () => {
        process.env.PARASUT_ENABLED = "false";
        const fn = vi.fn();

        await expect(parasutApiCall({ op: "op" }, fn)).rejects.toThrow(/devre dışı/i);
        expect(fn).not.toHaveBeenCalled();
    });

    it("throws ParasutError with kind=validation when disabled", async () => {
        delete process.env.PARASUT_ENABLED;
        const fn = vi.fn();

        let thrown: unknown;
        try {
            await parasutApiCall({ op: "op" }, fn);
        } catch (e) {
            thrown = e;
        }
        expect(thrown).toBeInstanceOf(ParasutError);
        expect((thrown as ParasutError).kind).toBe("validation");
    });

    it("does not emit any log when disabled", async () => {
        delete process.env.PARASUT_ENABLED;
        const fn = vi.fn();

        await expect(parasutApiCall({ op: "op" }, fn)).rejects.toThrow();
        expect(logSpy).not.toHaveBeenCalled();
    });
});

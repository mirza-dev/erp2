/**
 * handleApiError — Supabase/Postgres hata nesnesi teşhisi.
 *
 * Supabase PostgrestError düz nesnedir ({message, details, hint, code}) —
 * Error DEĞİL. Eskiden String(err) "[object Object]" verip gerçek nedeni
 * loglardan siliyordu. describeError artık mesaj + SQLSTATE kodunu çıkarır;
 * kod (22P02/42883/P0001 vb.) hassas değildir → prod yanıtına da konur.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { handleApiError } from "@/lib/api-error";

const ORIG_ENV = process.env.NODE_ENV;
afterEach(() => { (process.env as Record<string, string | undefined>).NODE_ENV = ORIG_ENV; vi.restoreAllMocks(); });

describe("handleApiError — Supabase hata nesnesi", () => {
    it("nesne hatasında SQLSTATE kodunu yanıta koyar + mesajı loglar (object Object DEĞİL)", async () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        const pgErr = { message: 'invalid input syntax for type uuid: "x"', code: "22P02", details: null, hint: null };
        const res = handleApiError(pgErr, "POST /api/quotes");
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body.code).toBe("22P02");
        // Loglanan mesaj gerçek metni içerir, "[object Object]" değil
        const logged = spy.mock.calls.map(c => c.join(" ")).join(" ");
        expect(logged).toContain("invalid input syntax");
        expect(logged).not.toContain("[object Object]");
    });

    it("prod'da mesaj gizli ama kod gözükür (güvenli teşhis)", async () => {
        (process.env as Record<string, string | undefined>).NODE_ENV = "production";
        vi.spyOn(console, "error").mockImplementation(() => {});
        const res = handleApiError({ message: "gizli detay", code: "P0001" }, "POST /api/quotes");
        const body = await res.json();
        expect(body.error).toBe("Beklenmeyen bir hata oluştu.");
        expect(body.code).toBe("P0001");
    });

    it("kodsuz düz Error → eskisi gibi (code alanı yok)", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const res = handleApiError(new Error("boom"), "X");
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body.code).toBeUndefined();
    });
});

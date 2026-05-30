/**
 * Tests for quote list page pure helpers: getValidUntilBadge, canDeleteQuote.
 * Also tests inline filter/search logic.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { getValidUntilBadge, canDeleteQuote, getQuoteActions, isQuoteEditable, pickSucceededIds } from "@/app/dashboard/quotes/_utils/quote-display";

// ─── getValidUntilBadge ───────────────────────────────────────────────────────

describe("getValidUntilBadge", () => {
    afterEach(() => { vi.useRealTimers(); });

    const freeze = (dateStr: string) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(dateStr + "T12:00:00"));
    };

    it("null → null", () => {
        expect(getValidUntilBadge(null)).toBeNull();
    });

    it("geçmiş tarih → expired", () => {
        freeze("2026-04-21");
        const badge = getValidUntilBadge("2026-04-20");
        expect(badge).toEqual({ text: "Süresi Doldu", type: "expired" });
    });

    it("bugün → urgent, 0 gün kaldı", () => {
        freeze("2026-04-21");
        const badge = getValidUntilBadge("2026-04-21");
        expect(badge).toEqual({ text: "0 gün kaldı", type: "urgent" });
    });

    it("2 gün sonra → urgent", () => {
        freeze("2026-04-21");
        const badge = getValidUntilBadge("2026-04-23");
        expect(badge).toEqual({ text: "2 gün kaldı", type: "urgent" });
    });

    it("3 gün sonra → urgent (boundary)", () => {
        freeze("2026-04-21");
        const badge = getValidUntilBadge("2026-04-24");
        expect(badge).toEqual({ text: "3 gün kaldı", type: "urgent" });
    });

    it("4 gün sonra → ok", () => {
        freeze("2026-04-21");
        const badge = getValidUntilBadge("2026-04-25");
        expect(badge).toEqual({ text: "4 gün kaldı", type: "ok" });
    });

    it("10 gün sonra → ok", () => {
        freeze("2026-04-21");
        const badge = getValidUntilBadge("2026-05-01");
        expect(badge).toEqual({ text: "10 gün kaldı", type: "ok" });
    });

    it("gece yarısına yakın (T00:30) — lokal tarihe göre hesap", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-21T00:30:00"));
        const badge = getValidUntilBadge("2026-04-21");
        expect(badge).toEqual({ text: "0 gün kaldı", type: "urgent" });
    });
});

// ─── canDeleteQuote ───────────────────────────────────────────────────────────

describe("canDeleteQuote", () => {
    it("draft → true", () => expect(canDeleteQuote("draft")).toBe(true));
    // Bulgu 2 (2. review tur): sent artık silinemez (immutable arşiv koruması).
    it("sent → false", () => expect(canDeleteQuote("sent")).toBe(false));
    it("accepted → false", () => expect(canDeleteQuote("accepted")).toBe(false));
    it("rejected → false", () => expect(canDeleteQuote("rejected")).toBe(false));
    it("expired → false", () => expect(canDeleteQuote("expired")).toBe(false));
    it("revised → false", () => expect(canDeleteQuote("revised")).toBe(false));
});

// ─── pickSucceededIds (Bulgu 3 / P2-A) ────────────────────────────────────────

describe("pickSucceededIds", () => {
    const ok = { status: "fulfilled" as const, value: { ok: true } };
    const notOk = { status: "fulfilled" as const, value: { ok: false } };
    const rejected = { status: "rejected" as const, reason: new Error("net") };

    it("1 başarılı (ok) + 1 409 (!ok) → yalnız başarılı id döner (yanıltıcı UI temizliği fix)", () => {
        // Senaryo: draft silinir (ok), sent 409 alır (!ok) → sent ekranda kalmalı.
        expect(pickSucceededIds(["draft-1", "sent-1"], [ok, notOk])).toEqual(["draft-1"]);
    });

    it("rejected (network fail) → o id düşürülmez", () => {
        expect(pickSucceededIds(["a", "b"], [ok, rejected])).toEqual(["a"]);
    });

    it("hepsi başarılı → tümü döner", () => {
        expect(pickSucceededIds(["a", "b"], [ok, ok])).toEqual(["a", "b"]);
    });

    it("hepsi başarısız → boş (local state'ten hiçbiri düşmez)", () => {
        expect(pickSucceededIds(["a", "b"], [notOk, rejected])).toEqual([]);
    });

    it("boş giriş → boş", () => {
        expect(pickSucceededIds([], [])).toEqual([]);
    });
});

// ─── Tab filtreleme (inline logic) ────────────────────────────────────────────

describe("matchesTab logic", () => {
    function matchesTab(q: { status: string }, tab: string) {
        return tab === "ALL" || q.status === tab;
    }

    it("ALL → hepsi geçer", () => {
        expect(matchesTab({ status: "draft" }, "ALL")).toBe(true);
        expect(matchesTab({ status: "accepted" }, "ALL")).toBe(true);
        expect(matchesTab({ status: "expired" }, "ALL")).toBe(true);
    });

    it("draft tab → sadece draft geçer", () => {
        expect(matchesTab({ status: "draft" }, "draft")).toBe(true);
        expect(matchesTab({ status: "sent" }, "draft")).toBe(false);
        expect(matchesTab({ status: "accepted" }, "draft")).toBe(false);
    });

    it("accepted tab → sadece accepted geçer", () => {
        expect(matchesTab({ status: "accepted" }, "accepted")).toBe(true);
        expect(matchesTab({ status: "draft" }, "accepted")).toBe(false);
    });
});

// ─── Arama (inline logic) ─────────────────────────────────────────────────────

describe("matchesSearch logic", () => {
    function matchesSearch(q: { quoteNumber: string; customerName: string }, s: string) {
        if (!s) return true;
        const lower = s.toLowerCase();
        return q.quoteNumber.toLowerCase().includes(lower) ||
            q.customerName.toLowerCase().includes(lower);
    }

    const q = { quoteNumber: "TKL-2026-001", customerName: "Acme Ltd" };

    it("boş string → true", () => expect(matchesSearch(q, "")).toBe(true));
    it("teklif no substring match", () => expect(matchesSearch(q, "TKL-2026")).toBe(true));
    it("müşteri adı case-insensitive match", () => expect(matchesSearch(q, "acme")).toBe(true));
    it("eşleşmez → false", () => expect(matchesSearch(q, "xyz")).toBe(false));
});

// ─── getQuoteActions ─────────────────────────────────────────────────────────

describe("getQuoteActions", () => {
    it("draft → 1 aksiyon: Gönder, primary, confirm yok", () => {
        const actions = getQuoteActions("draft", "TKL-2026-001");
        expect(actions).toHaveLength(1);
        expect(actions[0].transition).toBe("sent");
        expect(actions[0].label).toBe("Gönder");
        expect(actions[0].variant).toBe("primary");
        expect(actions[0].confirm).toBeUndefined();
    });

    it("sent → 2 aksiyon: Reddet (danger, confirm) + Kabul Et (primary, confirm)", () => {
        const actions = getQuoteActions("sent", "TKL-2026-001");
        expect(actions).toHaveLength(2);
        expect(actions[0].transition).toBe("rejected");
        expect(actions[0].variant).toBe("danger");
        expect(actions[0].confirm).toBeDefined();
        expect(actions[1].transition).toBe("accepted");
        expect(actions[1].variant).toBe("primary");
        expect(actions[1].confirm).toBeDefined();
    });

    it("accepted → boş dizi", () => {
        expect(getQuoteActions("accepted", "TKL-2026-001")).toEqual([]);
    });

    it("rejected → boş dizi", () => {
        expect(getQuoteActions("rejected", "TKL-2026-001")).toEqual([]);
    });

    it("expired → boş dizi", () => {
        expect(getQuoteActions("expired", "TKL-2026-001")).toEqual([]);
    });

    it("sent confirm mesajları quoteNumber içerir", () => {
        const actions = getQuoteActions("sent", "TKL-2026-042");
        expect(actions[0].confirm!.message).toContain("TKL-2026-042");
        expect(actions[1].confirm!.message).toContain("TKL-2026-042");
    });
});

// ─── isQuoteEditable ─────────────────────────────────────────────────────────

describe("isQuoteEditable", () => {
    it("draft → true", () => expect(isQuoteEditable("draft")).toBe(true));
    it("sent → false", () => expect(isQuoteEditable("sent")).toBe(false));
    it("accepted → false", () => expect(isQuoteEditable("accepted")).toBe(false));
    it("rejected → false", () => expect(isQuoteEditable("rejected")).toBe(false));
    it("expired → false", () => expect(isQuoteEditable("expired")).toBe(false));
});

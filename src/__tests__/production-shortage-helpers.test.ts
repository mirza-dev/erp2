/**
 * buildShortageMessage — BOM eksik-bileşen mesaj yardımcısı (saf davranış).
 *
 * complete_production 409 payload'ındaki shortages[]'i kullanıcıya okunur
 * mesaja çevirir; boş/eksik durumda fallback'a düşer.
 */
import { describe, it, expect } from "vitest";
import { buildShortageMessage } from "@/lib/production-shortage-helpers";

describe("buildShortageMessage", () => {
    it("boş/dizi-değil shortages → fallback aynen döner", () => {
        expect(buildShortageMessage(undefined, "Yetersiz bileşen stoğu.")).toBe("Yetersiz bileşen stoğu.");
        expect(buildShortageMessage([], "Yetersiz bileşen stoğu.")).toBe("Yetersiz bileşen stoğu.");
        expect(buildShortageMessage(null, "X")).toBe("X");
        expect(buildShortageMessage("nope" as unknown, "X")).toBe("X");
    });

    it("tek bileşen → ad + gerekli/mevcut mesaja eklenir", () => {
        const msg = buildShortageMessage(
            [{ component_name: "Conta SS", required_qty: 10, available_qty: 4 }],
            "Yetersiz bileşen stoğu.",
        );
        expect(msg).toContain("Yetersiz bileşen stoğu.");
        expect(msg).toContain("Conta SS (gerekli 10, mevcut 4)");
    });

    it("çok bileşen → noktalı virgülle birleştirilir", () => {
        const msg = buildShortageMessage(
            [
                { component_name: "Conta SS", required_qty: 10, available_qty: 4 },
                { component_name: "Bağlantı Civata", required_qty: 8, available_qty: 0 },
            ],
            "Yetersiz bileşen stoğu.",
        );
        expect(msg).toContain("Conta SS (gerekli 10, mevcut 4)");
        expect(msg).toContain("Bağlantı Civata (gerekli 8, mevcut 0)");
        expect(msg).toContain(";");
    });

    it("component_name yoksa component_product_id'ye düşülür", () => {
        const msg = buildShortageMessage(
            [{ component_product_id: "abc-123", required_qty: 5, available_qty: 1 }],
            "Yetersiz bileşen stoğu.",
        );
        expect(msg).toContain("abc-123 (gerekli 5, mevcut 1)");
    });

    it("ad da id de yoksa o satır atlanır; hepsi atlanırsa fallback", () => {
        const msg = buildShortageMessage(
            [{ required_qty: 5, available_qty: 1 }],
            "Yetersiz bileşen stoğu.",
        );
        expect(msg).toBe("Yetersiz bileşen stoğu.");
    });

    it("sayısal olmayan miktar → '?' ile gösterilir (defansif)", () => {
        const msg = buildShortageMessage(
            [{ component_name: "X", required_qty: undefined, available_qty: undefined }],
            "Yetersiz bileşen stoğu.",
        );
        expect(msg).toContain("X (gerekli ?, mevcut ?)");
    });
});

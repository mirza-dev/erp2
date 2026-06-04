import { describe, expect, it } from "vitest";
import { getUserInitials } from "@/lib/user-display";

describe("getUserInitials", () => {
    it("ad-soyad için ilk ve son kelime baş harflerini üretir", () => {
        expect(getUserInitials("Mirza Sarıbıyık", "mirza@example.com")).toBe("MS");
        expect(getUserInitials("Can Mehmet Sarı", "can@example.com")).toBe("CS");
    });

    it("fullName yoksa e-posta prefix'inden fallback üretir", () => {
        expect(getUserInitials("", "cenk.sari@example.com")).toBe("CS");
        expect(getUserInitials(null, "demo@example.com")).toBe("DE");
    });

    it("veri yoksa soru işareti döner", () => {
        expect(getUserInitials(null, null)).toBe("?");
    });
});

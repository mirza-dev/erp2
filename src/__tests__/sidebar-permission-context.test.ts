/**
 * RBAC Faz 7a — Sidebar artık merkezi PermissionProvider'dan okur (regression lock).
 *
 * Faz 2'de Sidebar kendi useEffect ile /api/auth/me fetch ediyordu. Faz 7'de
 * PermissionProvider eklendi → ad-hoc fetch dedupe edildi. Bu test fetch'in geri
 * gelmediğini ve filtre davranışının (requiredPermissionForPath) korunduğunu kilitler.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
    join(process.cwd(), "src/components/layout/Sidebar.tsx"),
    "utf8",
);

describe("Sidebar — Faz 7 permission context", () => {
    it("usePermissions context'inden okur", () => {
        expect(SOURCE).toMatch(/usePermissions\s*\(\s*\)/);
        expect(SOURCE).toMatch(/from\s*"@\/lib\/auth\/use-permissions"/);
    });

    it('ad-hoc fetch("/api/auth/me") KALDIRILDI (regression — dedupe)', () => {
        expect(SOURCE).not.toMatch(/fetch\(\s*["']\/api\/auth\/me["']\s*\)/);
    });

    it("permission filtre davranışı korundu (requiredPermissionForPath)", () => {
        expect(SOURCE).toMatch(/requiredPermissionForPath\(it\.href\)/);
        // perms null → tüm item gösterilir (server gate korur)
        expect(SOURCE).toMatch(/perms === null/);
    });
});

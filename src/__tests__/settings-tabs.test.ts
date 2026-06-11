import { describe, expect, it } from "vitest";
import {
    canViewSystemSettings,
    getVisibleSettingsTabs,
    parseSettingsTab,
    resolveSettingsTab,
} from "@/lib/settings-tabs";
import type { Permission } from "@/lib/auth/permissions";

describe("settings-tabs", () => {
    it("yetkisiz kullanıcıya yalnız kişisel tabları gösterir", () => {
        expect(canViewSystemSettings(new Set<Permission>(["view_dashboard"]))).toBe(false);
        expect(getVisibleSettingsTabs(false, false).map(tab => tab.key)).toEqual(["kullanici", "bildirimler"]);
    });

    it("müşteri adminine sistem tablarını gösterir, bakım tablarını göstermez", () => {
        expect(canViewSystemSettings(new Set<Permission>(["view_dashboard", "view_settings"]))).toBe(true);
        expect(getVisibleSettingsTabs(true, false).map(tab => tab.key)).toEqual([
            "firma",
            "dosyalar",
            "kullanici",
            "bildirimler",
        ]);
    });

    it("dosyalar sekmesi sistem kapsamında, firma'dan hemen sonra", () => {
        const visible = getVisibleSettingsTabs(true, false);
        const dosyalar = visible.find(tab => tab.key === "dosyalar");
        expect(dosyalar).toBeDefined();
        expect(dosyalar!.scope).toBe("system");
        expect(dosyalar!.label).toBe("Dosyalar");
        expect(visible.findIndex(tab => tab.key === "dosyalar"))
            .toBe(visible.findIndex(tab => tab.key === "firma") + 1);
        // yetkisiz kullanıcı görmez
        expect(getVisibleSettingsTabs(false, false).some(tab => tab.key === "dosyalar")).toBe(false);
    });

    it("internal admin ayrı bakım grubuyla tüm tabları görür", () => {
        const visible = getVisibleSettingsTabs(true, true);
        expect(visible.map(tab => tab.label)).toEqual([
            "Firma Profili",
            "Dosyalar",
            "API Anahtarları",
            "Yapay Zeka",
            "Kullanıcı Profili",
            "Bildirimler",
        ]);
        expect(visible.filter(tab => tab.scope === "maintenance").map(tab => tab.key)).toEqual([
            "api",
            "yapay-zeka",
        ]);
        expect(visible.every(tab => tab.description.length > 0)).toBe(true);
    });

    it("query tab parse ve fallback davranışını çözer", () => {
        expect(parseSettingsTab("kullanici")).toBe("kullanici");
        expect(parseSettingsTab("firma")).toBe("firma");
        expect(parseSettingsTab("dosyalar")).toBe("dosyalar");
        expect(parseSettingsTab("bilinmeyen")).toBeNull();
        expect(resolveSettingsTab("dosyalar", true)).toBe("dosyalar");
        expect(resolveSettingsTab("dosyalar", false)).toBe("kullanici");
        expect(resolveSettingsTab("kullanici", false)).toBe("kullanici");
        expect(resolveSettingsTab("firma", false)).toBe("kullanici");
        expect(resolveSettingsTab("firma", true)).toBe("firma");
        expect(resolveSettingsTab("api", true, false)).toBe("firma");
        expect(resolveSettingsTab("yapay-zeka", true, false)).toBe("firma");
        expect(resolveSettingsTab("api", true, true)).toBe("api");
        expect(resolveSettingsTab(null, true)).toBe("firma");
        expect(resolveSettingsTab(null, false)).toBe("kullanici");
    });
});

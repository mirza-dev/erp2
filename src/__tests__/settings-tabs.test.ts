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
        expect(getVisibleSettingsTabs(false).map(tab => tab.key)).toEqual(["kullanici", "bildirimler"]);
    });

    it("view_settings olan kullanıcıya sistem tablarını da gösterir", () => {
        expect(canViewSystemSettings(new Set<Permission>(["view_dashboard", "view_settings"]))).toBe(true);
        expect(getVisibleSettingsTabs(true).map(tab => tab.key)).toEqual([
            "firma",
            "api",
            "yapay-zeka",
            "kullanici",
            "bildirimler",
        ]);
    });

    it("premium ayarlar etiketleri ve açıklamaları eksiksizdir", () => {
        const visible = getVisibleSettingsTabs(true);
        expect(visible.map(tab => tab.label)).toEqual([
            "Firma Profili",
            "API Anahtarları",
            "Yapay Zeka",
            "Kullanıcı Profili",
            "Bildirimler",
        ]);
        expect(visible.every(tab => tab.description.length > 0)).toBe(true);
    });

    it("query tab parse ve fallback davranışını çözer", () => {
        expect(parseSettingsTab("kullanici")).toBe("kullanici");
        expect(parseSettingsTab("firma")).toBe("firma");
        expect(parseSettingsTab("bilinmeyen")).toBeNull();
        expect(resolveSettingsTab("kullanici", false)).toBe("kullanici");
        expect(resolveSettingsTab("firma", false)).toBe("kullanici");
        expect(resolveSettingsTab("firma", true)).toBe("firma");
        expect(resolveSettingsTab(null, true)).toBe("firma");
        expect(resolveSettingsTab(null, false)).toBe("kullanici");
    });
});

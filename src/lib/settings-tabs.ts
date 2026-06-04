import type { Permission } from "@/lib/auth/permissions";

export type SettingsTab = "firma" | "kullanici" | "bildirimler" | "api" | "yapay-zeka";
export type SettingsTabScope = "personal" | "system";

export interface SettingsTabDefinition {
    key: SettingsTab;
    label: string;
    scope: SettingsTabScope;
    description: string;
}

export const SETTINGS_TABS: SettingsTabDefinition[] = [
    {
        key: "firma",
        label: "Firma Profili",
        scope: "system",
        description: "Firma kimliği, logo ve belge varsayılanları.",
    },
    {
        key: "api",
        label: "API Anahtarları",
        scope: "system",
        description: "Entegrasyon anahtarları ve OAuth bağlantı durumu.",
    },
    {
        key: "yapay-zeka",
        label: "Yapay Zeka",
        scope: "system",
        description: "AI kullanımı, fallback ve öneri metrikleri.",
    },
    {
        key: "kullanici",
        label: "Kullanıcı Profili",
        scope: "personal",
        description: "Profil, avatar ve şifre bilgileri.",
    },
    {
        key: "bildirimler",
        label: "Bildirimler",
        scope: "personal",
        description: "E-posta ve tarayıcı bildirim tercihleri.",
    },
];

export function canViewSystemSettings(perms: Set<Permission> | null): boolean {
    return perms !== null && perms.has("view_settings");
}

export function getVisibleSettingsTabs(canViewSystem: boolean): SettingsTabDefinition[] {
    return SETTINGS_TABS.filter(tab => tab.scope === "personal" || canViewSystem);
}

export function parseSettingsTab(value: string | null | undefined): SettingsTab | null {
    return SETTINGS_TABS.some(tab => tab.key === value) ? value as SettingsTab : null;
}

export function resolveSettingsTab(requested: SettingsTab | null, canViewSystem: boolean): SettingsTab {
    const visibleTabs = getVisibleSettingsTabs(canViewSystem);
    if (requested && visibleTabs.some(tab => tab.key === requested)) return requested;
    return canViewSystem ? "firma" : "kullanici";
}

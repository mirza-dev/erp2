import { createServiceClient } from "./service";
import type { CompanySettingsRow } from "@/lib/database.types";

export async function dbGetCompanySettings(): Promise<CompanySettingsRow | null> {
    const sb = createServiceClient();
    const { data, error } = await sb
        .from("company_settings")
        .select("*")
        .limit(1)
        .single();
    // PGRST116 = "no rows" — tablo var ama satır yok; bu beklenen durum
    if (error && error.code !== "PGRST116") throw error;
    return data ?? null;
}

export async function dbUpdateCompanySettings(
    patch: Partial<Omit<CompanySettingsRow, "id" | "updated_at">>
): Promise<CompanySettingsRow> {
    const sb = createServiceClient();
    const current = await dbGetCompanySettings();
    if (!current) throw new Error("company_settings satırı bulunamadı");
    const { data, error } = await sb
        .from("company_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", current.id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

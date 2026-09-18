import { createServiceClient } from "./service";
import type { CompanySettingsRow } from "@/lib/database.types";
import { CompanySettingsColumnMissingError } from "@/lib/company-settings-schema";

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
    // `select("*")` o an var olan her kolonu döndürür (NULL olanlar dahil) → patch'teki
    // bir anahtar satırda yoksa kolon YOK: migration canlıya henüz uygulanmamış.
    // Yazmayı denemek PGRST204 → 500 olurdu; route bunu 409 + migration adıyla basar.
    const missing = Object.keys(patch).filter((key) => !(key in current));
    if (missing.length > 0) throw new CompanySettingsColumnMissingError(missing);
    const { data, error } = await sb
        .from("company_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", current.id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

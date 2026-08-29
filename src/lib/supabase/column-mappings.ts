import { createServiceClient } from "./service";
import type { ColumnMappingRow } from "@/lib/database.types";
import { COLUMN_MAPPING_COMPANY_SCOPE, normalizeImportToken } from "@/lib/import-center";

/**
 * Excel kolon başlığı → arama anahtarı.
 *
 * TEK NORMALIZER (2026-08-29): eskiden bu fonksiyonun kendi gövdesi vardı ve
 * `normalizeImportToken`'dan iki nokta ayrılıyordu — ardışık alt çizgileri
 * sadeleştirmiyor, baş/sondaki alt çizgiyi kırpmıyordu. Alias tabloları
 * (`IMPORT_ALIAS_FIELD_MAP` / `FALLBACK_FIELD_MAP`) `normalizeImportToken` ile
 * yazıldığı için noktalama içeren HER başlık ıskalıyordu:
 *
 *     "Tedarik Süresi (gün)"  → tedarik_suresi__gun_   ≠ tedarik_suresi_gun
 *     "Birim Fiyat ($)"       → birim_fiyat____        ≠ birim_fiyat
 *
 * Sistemin KENDİ indirdiği şablonun 56 kolonundan 10'u bu yüzden eşleşmiyordu
 * (biri zorunlu: "Ürün SKU"). Iskalar AI'ya düşüyor, AI da onları doğru
 * eşleştirdiği için kusur görünmüyordu — AI anahtarı geçersizleşince ortaya
 * çıktı. Artık tek kaynak `normalizeImportToken`.
 *
 * `column_mappings` tablosundaki `normalized` sütunu bu fonksiyonla yazılıyor;
 * değişim öncesi canlıdaki 3 satır (urun_kodu · stok_adedi · vergi_no) her iki
 * gövdede de aynı sonucu verdiği için hafıza yetim kalmadı (migration gerekmedi).
 */
export function normalizeColumnName(col: string): string {
    return normalizeImportToken(col);
}

/**
 * Look up past-successful column mappings for a set of headers.
 * Returns a map: normalized_column → ColumnMappingRow
 */
export async function dbLookupColumnMappings(
    headers: string[],
    entityType: string,
    companyScope = COLUMN_MAPPING_COMPANY_SCOPE,
): Promise<Map<string, ColumnMappingRow>> {
    const supabase = createServiceClient();
    const normalizedHeaders = headers.map(normalizeColumnName);
    if (normalizedHeaders.length === 0) return new Map();

    const { data, error } = await supabase
        .from("column_mappings")
        .select("*")
        .eq("company_scope", companyScope)
        .eq("entity_type", entityType)
        .in("normalized", normalizedHeaders);

    if (error || !data) return new Map();

    const map = new Map<string, ColumnMappingRow>();
    for (const row of data) {
        map.set(row.normalized, row as ColumnMappingRow);
    }
    return map;
}

/**
 * Save or update column mappings. On conflict: increment usage_count.
 */
export async function dbSaveColumnMappings(
    mappings: { source_column: string; entity_type: string; target_field: string }[],
    companyScope = COLUMN_MAPPING_COMPANY_SCOPE,
): Promise<void> {
    if (mappings.length === 0) return;
    const supabase = createServiceClient();

    for (const m of mappings) {
        const norm = normalizeColumnName(m.source_column);
        // upsert: on conflict (normalized, entity_type) → increment usage_count
        const { data: existing } = await supabase
            .from("column_mappings")
            .select("id, usage_count, target_field")
            .eq("company_scope", companyScope)
            .eq("normalized", norm)
            .eq("entity_type", m.entity_type)
            .maybeSingle();

        if (existing) {
            const updates: Record<string, unknown> = {
                usage_count: existing.usage_count + 1,
                updated_at: new Date().toISOString(),
            };
            // If user corrected the target_field, overwrite it and reset success_count
            // so stale confidence data doesn't linger
            if (existing.target_field !== m.target_field) {
                updates.target_field = m.target_field;
                updates.success_count = 0;
            }
            await supabase
                .from("column_mappings")
                .update(updates)
                .eq("id", existing.id);
        } else {
            await supabase.from("column_mappings").insert({
                company_scope: companyScope,
                source_column: m.source_column,
                normalized: norm,
                entity_type: m.entity_type,
                target_field: m.target_field,
                usage_count: 1,
                success_count: 0,
            });
        }
    }
}

/**
 * Increment success_count for each mapping used in a successful import.
 */
export async function dbIncrementMappingSuccess(
    normalizedColumns: string[],
    entityType: string,
    companyScope = COLUMN_MAPPING_COMPANY_SCOPE,
): Promise<void> {
    if (normalizedColumns.length === 0) return;
    const supabase = createServiceClient();

    const { data } = await supabase
        .from("column_mappings")
        .select("id, success_count")
        .eq("company_scope", companyScope)
        .eq("entity_type", entityType)
        .in("normalized", normalizedColumns);

    if (!data) return;

    for (const row of data) {
        await supabase
            .from("column_mappings")
            .update({ success_count: row.success_count + 1, updated_at: new Date().toISOString() })
            .eq("id", row.id);
    }
}

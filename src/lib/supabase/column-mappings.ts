import { createServiceClient } from "./service";
import type { ColumnMappingRow } from "@/lib/database.types";

export function normalizeColumnName(col: string): string {
    return col.trim()
        .replace(/İ/g, "i").replace(/I/g, "i")   // Turkish İ → i before toLowerCase (İ.toLowerCase() = i + U+0307)
        .toLowerCase()
        .replace(/[ğ]/g, "g").replace(/[ü]/g, "u").replace(/[ş]/g, "s")
        .replace(/[ı]/g, "i").replace(/[ö]/g, "o").replace(/[ç]/g, "c")
        .replace(/[^a-z0-9]/g, "_");
}

/**
 * Look up past-successful column mappings for a set of headers.
 * Returns a map: normalized_column → ColumnMappingRow
 */
export async function dbLookupColumnMappings(
    headers: string[],
    entityType: string,
): Promise<Map<string, ColumnMappingRow>> {
    const supabase = createServiceClient();
    const normalizedHeaders = headers.map(normalizeColumnName);
    if (normalizedHeaders.length === 0) return new Map();

    const { data, error } = await supabase
        .from("column_mappings")
        .select("*")
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
): Promise<void> {
    if (mappings.length === 0) return;
    const supabase = createServiceClient();

    for (const m of mappings) {
        const norm = normalizeColumnName(m.source_column);
        // upsert: on conflict (normalized, entity_type) → increment usage_count
        const { data: existing } = await supabase
            .from("column_mappings")
            .select("id, usage_count, target_field")
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
): Promise<void> {
    if (normalizedColumns.length === 0) return;
    const supabase = createServiceClient();

    const { data } = await supabase
        .from("column_mappings")
        .select("id, success_count")
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

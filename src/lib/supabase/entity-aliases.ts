/**
 * AI Entity Alias Memory — import-service.ts için
 *
 * Her başarılı entity resolution (customer/product) sonrası
 * ham değer → entity ID eşlemesini kaydeder.
 * Bir sonraki import'ta aynı ham değer geldiğinde DB lookup'tan önce kontrol edilir.
 *
 * domain-rules.md §9: import akışı değişmez — alias sadece lookup hızlandırır,
 * hiçbir zaman doğrudan entity oluşturmaz.
 */

import { createServiceClient } from "./service";
import type { AiEntityAliasRow } from "@/lib/database.types";

function normalize(value: string): string {
    return value.trim().toLowerCase();
}

/**
 * Ham değeri alias tablosunda arar.
 * Eşleşme varsa resolved_id (uuid string) döner; yoksa null.
 */
export async function dbLookupEntityAlias(
    rawValue: string,
    entityType: "customer" | "product"
): Promise<string | null> {
    const norm = normalize(rawValue);
    if (!norm) return null;

    const supabase = createServiceClient();
    const { data } = await supabase
        .from("ai_entity_aliases")
        .select("resolved_id")
        .eq("normalized", norm)
        .eq("entity_type", entityType)
        .maybeSingle();

    return (data as Pick<AiEntityAliasRow, "resolved_id"> | null)?.resolved_id ?? null;
}

/**
 * Ham değer → entity ID eşlemesini kaydeder (upsert).
 * Aynı normalized+entity_type için çakışma varsa resolved_id ve updated_at güncellenir.
 * Fire-and-forget: void ile çağrılabilir, hata ana akışı bozmaz.
 */
export async function dbSaveEntityAlias(
    rawValue: string,
    entityType: "customer" | "product",
    resolvedId: string,
    resolvedName?: string
): Promise<void> {
    const norm = normalize(rawValue);
    if (!norm) return;

    const supabase = createServiceClient();
    const { error } = await supabase.from("ai_entity_aliases").upsert(
        {
            raw_value: rawValue,
            normalized: norm,
            entity_type: entityType,
            resolved_id: resolvedId,
            resolved_name: resolvedName ?? null,
        },
        { onConflict: "normalized,entity_type" }
    );

    if (error) {
        console.warn("[entity-alias] save failed:", error.message);
    }
}

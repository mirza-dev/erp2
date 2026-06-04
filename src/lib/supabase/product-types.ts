import { createServiceClient } from "./service";
import type {
    ProductTypeRow,
    ProductTypeFieldRow,
    ProductFieldType,
} from "@/lib/database.types";
import { isBlankTechnicalValue } from "@/lib/technical-templates";

// ── Validation ──────────────────────────────────────────────

const FIELD_TYPES: ProductFieldType[] = [
    "text", "number", "select", "multiselect", "date", "boolean", "longtext",
];

const FIELD_KEY_RE = /^[a-z][a-z0-9_]*$/;

export function isValidFieldType(t: unknown): t is ProductFieldType {
    return typeof t === "string" && (FIELD_TYPES as string[]).includes(t);
}

export function isValidFieldKey(key: unknown): key is string {
    return typeof key === "string" && FIELD_KEY_RE.test(key);
}

// ── Inputs ──────────────────────────────────────────────────

export interface CreateProductTypeInput {
    name: string;
    description?: string | null;
    icon?: string | null;
    sort_order?: number;
}

export interface UpdateProductTypeInput {
    name?: string;
    description?: string | null;
    icon?: string | null;
    sort_order?: number;
    is_active?: boolean;
}

export interface CreateProductTypeFieldInput {
    product_type_id: string;
    field_key: string;
    label_tr: string;
    label_en?: string | null;
    field_type: ProductFieldType;
    unit?: string | null;
    options?: string[] | null;
    required?: boolean;
    placeholder?: string | null;
    help_text?: string | null;
    sort_order?: number;
}

export interface UpdateProductTypeFieldInput {
    field_key?: string;
    label_tr?: string;
    label_en?: string | null;
    field_type?: ProductFieldType;
    unit?: string | null;
    options?: string[] | null;
    required?: boolean;
    is_active?: boolean;
    placeholder?: string | null;
    help_text?: string | null;
    sort_order?: number;
}

export interface ProductTypeWithFieldsRow extends ProductTypeRow {
    fields: ProductTypeFieldRow[];
}

export interface ProductTypeStatsRow extends ProductTypeRow {
    product_count: number;
    field_count: number;
    required_field_count: number;
    missing_required_product_count: number;
}

export interface ProductTypeQueryOptions {
    includeInactive?: boolean;
}

export interface ProductTypeFieldsQueryOptions {
    includeInactive?: boolean;
}

// ── Validators ──────────────────────────────────────────────

function validateTypeInput(input: CreateProductTypeInput | UpdateProductTypeInput): string | null {
    if ("name" in input && input.name !== undefined) {
        if (!input.name || input.name.trim().length === 0) return "Tip adı zorunludur.";
        if (input.name.trim().length > 100) return "Tip adı 100 karakteri aşamaz.";
    }
    if (input.sort_order !== undefined && !Number.isInteger(input.sort_order)) {
        return "Sıralama tam sayı olmalıdır.";
    }
    return null;
}

function validateFieldInput(input: CreateProductTypeFieldInput | UpdateProductTypeFieldInput): string | null {
    if ("field_key" in input && input.field_key !== undefined) {
        if (!isValidFieldKey(input.field_key)) {
            return "Alan anahtarı geçersiz (küçük harf, rakam, alt çizgi; harf ile başlamalı).";
        }
    }
    if ("label_tr" in input && input.label_tr !== undefined) {
        if (!input.label_tr || input.label_tr.trim().length === 0) return "Türkçe etiket zorunludur.";
    }
    if ("field_type" in input && input.field_type !== undefined) {
        if (!isValidFieldType(input.field_type)) {
            return `Geçersiz alan tipi. Kabul edilenler: ${FIELD_TYPES.join(", ")}.`;
        }
    }
    if (input.options !== undefined && input.options !== null) {
        if (!Array.isArray(input.options)) return "Seçenekler dizi olmalıdır.";
        if (input.options.some((o) => typeof o !== "string" || o.trim().length === 0)) {
            return "Seçenekler boş olmayan metinler olmalı.";
        }
    }
    if (input.sort_order !== undefined && !Number.isInteger(input.sort_order)) {
        return "Sıralama tam sayı olmalıdır.";
    }
    return null;
}

// ── List / Read ─────────────────────────────────────────────

export async function dbListProductTypes(options: ProductTypeQueryOptions = {}): Promise<ProductTypeRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("product_types")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

    if (!options.includeInactive) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbGetProductType(
    id: string,
    options: ProductTypeQueryOptions = {},
): Promise<ProductTypeRow | null> {
    const supabase = createServiceClient();
    let query = supabase
        .from("product_types")
        .select("*")
        .eq("id", id);
    if (!options.includeInactive) query = query.eq("is_active", true);
    const { data, error } = await query.single();
    if (error || !data) return null;
    return data;
}

export async function dbGetProductTypeWithFields(
    id: string,
    options: ProductTypeFieldsQueryOptions = {},
): Promise<ProductTypeWithFieldsRow | null> {
    const supabase = createServiceClient();
    const { data: type, error: tErr } = await supabase
        .from("product_types").select("*").eq("id", id).single();
    if (tErr || !type) return null;
    if (!options.includeInactive && (type as ProductTypeRow).is_active === false) return null;

    let fieldsQuery = supabase
        .from("product_type_fields")
        .select("*")
        .eq("product_type_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

    if (!options.includeInactive) fieldsQuery = fieldsQuery.eq("is_active", true);

    const { data: fields, error: fErr } = await fieldsQuery;
    if (fErr) throw new Error(fErr.message);

    return { ...(type as ProductTypeRow), fields: (fields ?? []) as ProductTypeFieldRow[] };
}

export async function dbListProductTypeFields(
    productTypeId: string,
    options: ProductTypeFieldsQueryOptions = {},
): Promise<ProductTypeFieldRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("product_type_fields")
        .select("*")
        .eq("product_type_id", productTypeId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

    if (!options.includeInactive) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbListProductTypesWithStats(
    options: ProductTypeQueryOptions = {},
): Promise<ProductTypeStatsRow[]> {
    const supabase = createServiceClient();
    const [types, fieldsRes, productsRes] = await Promise.all([
        dbListProductTypes(options),
        supabase.from("product_type_fields").select("*"),
        supabase.from("products").select("id, product_type_id, attributes, is_active").eq("is_active", true),
    ]);

    const { data: fields, error: fieldsError } = fieldsRes;
    if (fieldsError) throw new Error(fieldsError.message);
    const { data: products, error: productsError } = productsRes;
    if (productsError) throw new Error(productsError.message);

    const productsByType = new Map<string, Array<{ attributes: Record<string, unknown> | null }>>();
    for (const product of products ?? []) {
        const typeId = product.product_type_id as string | null;
        if (!typeId) continue;
        const list = productsByType.get(typeId) ?? [];
        list.push({ attributes: (product.attributes ?? {}) as Record<string, unknown> });
        productsByType.set(typeId, list);
    }

    const fieldsByType = new Map<string, ProductTypeFieldRow[]>();
    for (const field of (fields ?? []) as ProductTypeFieldRow[]) {
        const list = fieldsByType.get(field.product_type_id) ?? [];
        list.push(field);
        fieldsByType.set(field.product_type_id, list);
    }

    return types.map(type => {
        const typeFields = (fieldsByType.get(type.id) ?? []).filter(f => f.is_active !== false);
        const required = typeFields.filter(f => f.required);
        const typeProducts = productsByType.get(type.id) ?? [];
        const missingCount = typeProducts.filter(product =>
            required.some(field => isBlankTechnicalValue(product.attributes?.[field.field_key]))
        ).length;

        return {
            ...type,
            product_count: typeProducts.length,
            field_count: typeFields.length,
            required_field_count: required.length,
            missing_required_product_count: missingCount,
        };
    });
}

// ── Create / Update / Delete (types) ────────────────────────

export async function dbCreateProductType(input: CreateProductTypeInput): Promise<ProductTypeRow> {
    const err = validateTypeInput(input);
    if (err) throw new Error(err);

    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("product_types")
        .insert({
            name: input.name.trim(),
            description: input.description ?? null,
            icon: input.icon ?? null,
            sort_order: input.sort_order ?? 0,
            is_system: false,
        })
        .select()
        .single();

    if (error) {
        if (error.code === "23505") throw new Error("Bu isimde bir tip zaten var.");
        throw new Error(error.message);
    }
    if (!data) throw new Error("Tip oluşturulamadı.");

    await supabase.from("audit_log").insert({
        action: "product_type_created",
        entity_type: "product_type",
        entity_id: data.id,
        after_state: { name: data.name, icon: data.icon, sort_order: data.sort_order },
        source: "ui",
    });

    return data;
}

export async function dbUpdateProductType(id: string, patch: UpdateProductTypeInput): Promise<ProductTypeRow> {
    const err = validateTypeInput(patch);
    if (err) throw new Error(err);

    const supabase = createServiceClient();
    const { data: existing } = await supabase
        .from("product_types").select("*").eq("id", id).single();
    if (!existing) throw new Error("Tip bulunamadı.");

    const updatePayload: Record<string, unknown> = {};
    if (patch.name !== undefined) updatePayload.name = patch.name.trim();
    if (patch.description !== undefined) updatePayload.description = patch.description;
    if (patch.icon !== undefined) updatePayload.icon = patch.icon;
    if (patch.sort_order !== undefined) updatePayload.sort_order = patch.sort_order;
    if (patch.is_active !== undefined) updatePayload.is_active = patch.is_active;

    // Kullanıcı bir alanı düzenlerse, is_system kilidi düşer (artık "sistem tipi" sayılmaz).
    if (Object.keys(updatePayload).length > 0 && existing.is_system) {
        updatePayload.is_system = false;
    }

    const { data, error } = await supabase
        .from("product_types")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

    if (error) {
        if (error.code === "23505") throw new Error("Bu isimde bir tip zaten var.");
        throw new Error(error.message);
    }
    if (!data) throw new Error("Tip bulunamadı.");

    await supabase.from("audit_log").insert({
        action: "product_type_updated",
        entity_type: "product_type",
        entity_id: id,
        before_state: { name: existing.name, icon: existing.icon, sort_order: existing.sort_order, is_system: existing.is_system },
        after_state: updatePayload,
        source: "ui",
    });

    return data;
}

export async function dbDeleteProductType(id: string): Promise<void> {
    const supabase = createServiceClient();

    const { data: existing } = await supabase
        .from("product_types").select("*").eq("id", id).single();
    if (!existing) throw new Error("Tip bulunamadı.");

    const { error } = await supabase
        .from("product_types")
        .update({ is_active: false })
        .eq("id", id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
        action: "product_type_deactivated",
        entity_type: "product_type",
        entity_id: id,
        before_state: { name: existing.name, icon: existing.icon, is_active: existing.is_active },
        after_state: { is_active: false },
        source: "ui",
    });
}

// ── Create / Update / Delete (fields) ────────────────────────

export async function dbAddProductTypeField(input: CreateProductTypeFieldInput): Promise<ProductTypeFieldRow> {
    if (!isValidFieldKey(input.field_key)) {
        throw new Error("Alan anahtarı geçersiz (küçük harf, rakam, alt çizgi; harf ile başlamalı).");
    }
    const err = validateFieldInput(input);
    if (err) throw new Error(err);

    const supabase = createServiceClient();

    // Parent tip var mı? (is_system bilgisi de gerekiyor — field düzenlenince system kilidi düşer)
    const { data: parent } = await supabase
        .from("product_types").select("id, is_system").eq("id", input.product_type_id).single();
    if (!parent) throw new Error("Üst tip bulunamadı.");

    const { data, error } = await supabase
        .from("product_type_fields")
        .insert({
            product_type_id: input.product_type_id,
            field_key: input.field_key,
            label_tr: input.label_tr.trim(),
            label_en: input.label_en ?? null,
            field_type: input.field_type,
            unit: input.unit ?? null,
            options: input.options ?? null,
            required: input.required ?? false,
            placeholder: input.placeholder ?? null,
            help_text: input.help_text ?? null,
            sort_order: input.sort_order ?? 0,
            is_active: true,
        })
        .select()
        .single();

    if (error) {
        if (error.code === "23505") throw new Error("Bu alan anahtarı bu tipte zaten var.");
        throw new Error(error.message);
    }
    if (!data) throw new Error("Alan oluşturulamadı.");

    // System tipi field eklenince kullanıcı tipi sayılır → kilidi düşür (header edit ile aynı semantik).
    if (parent.is_system) {
        await supabase.from("product_types").update({ is_system: false }).eq("id", input.product_type_id);
    }

    await supabase.from("audit_log").insert({
        action: "product_type_field_added",
        entity_type: "product_type",
        entity_id: input.product_type_id,
        before_state: parent.is_system ? { is_system: true } : null,
        after_state: {
            field_key: data.field_key,
            field_type: data.field_type,
            required: data.required,
            ...(parent.is_system ? { is_system: false } : {}),
        },
        source: "ui",
    });

    return data;
}

export async function dbUpdateProductTypeField(
    id: string,
    patch: UpdateProductTypeFieldInput,
    expectedTypeId?: string,
): Promise<ProductTypeFieldRow> {
    const err = validateFieldInput(patch);
    if (err) throw new Error(err);

    const supabase = createServiceClient();

    const { data: existing } = await supabase
        .from("product_type_fields").select("*").eq("id", id).single();
    if (!existing) throw new Error("Alan bulunamadı.");

    // Nested route scope: parent type ile uyumsuz field → cross-tenant koruması.
    if (expectedTypeId !== undefined && existing.product_type_id !== expectedTypeId) {
        throw new Error("Alan bu tipe ait değil.");
    }

    // Parent type'ın is_system durumunu çek (system tipi field düzenlenince kilidi düşer).
    const { data: parent } = await supabase
        .from("product_types").select("id, is_system").eq("id", existing.product_type_id).single();

    const updatePayload: Record<string, unknown> = {};
    if (patch.field_key !== undefined && patch.field_key !== existing.field_key) {
        if (!isValidFieldKey(patch.field_key)) {
            throw new Error("Alan anahtarı geçersiz (küçük harf, rakam, alt çizgi; harf ile başlamalı).");
        }
        const { data: sibling } = await supabase
            .from("product_type_fields")
            .select("id")
            .eq("product_type_id", existing.product_type_id)
            .eq("field_key", patch.field_key)
            .maybeSingle();
        if (sibling?.id && sibling.id !== id) {
            throw new Error("Bu alan anahtarı bu tipte zaten var.");
        }

        const { data: affectedProducts, error: affectedError } = await supabase
            .from("products")
            .select("id, attributes")
            .eq("product_type_id", existing.product_type_id);
        if (affectedError) throw new Error(affectedError.message);

        for (const product of affectedProducts ?? []) {
            const attrs = ((product.attributes ?? {}) as Record<string, unknown>);
            if (!Object.prototype.hasOwnProperty.call(attrs, existing.field_key)) continue;
            if (Object.prototype.hasOwnProperty.call(attrs, patch.field_key)) {
                throw new Error("Teknik anahtar değiştirilemedi: bazı ürünlerde yeni anahtar zaten dolu.");
            }
        }

        for (const product of affectedProducts ?? []) {
            const attrs = { ...((product.attributes ?? {}) as Record<string, unknown>) };
            if (!Object.prototype.hasOwnProperty.call(attrs, existing.field_key)) continue;
            attrs[patch.field_key] = attrs[existing.field_key];
            delete attrs[existing.field_key];
            const { error: productErr } = await supabase
                .from("products")
                .update({ attributes: attrs })
                .eq("id", product.id);
            if (productErr) throw new Error(productErr.message);
        }

        updatePayload.field_key = patch.field_key;
    }
    if (patch.label_tr !== undefined) updatePayload.label_tr = patch.label_tr.trim();
    if (patch.label_en !== undefined) updatePayload.label_en = patch.label_en;
    if (patch.field_type !== undefined) updatePayload.field_type = patch.field_type;
    if (patch.unit !== undefined) updatePayload.unit = patch.unit;
    if (patch.options !== undefined) updatePayload.options = patch.options;
    if (patch.required !== undefined) updatePayload.required = patch.required;
    if (patch.is_active !== undefined) updatePayload.is_active = patch.is_active;
    if (patch.placeholder !== undefined) updatePayload.placeholder = patch.placeholder;
    if (patch.help_text !== undefined) updatePayload.help_text = patch.help_text;
    if (patch.sort_order !== undefined) updatePayload.sort_order = patch.sort_order;

    const { data, error } = await supabase
        .from("product_type_fields")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Alan bulunamadı.");

    // System tipi field düzenlenince kullanıcı tipi sayılır → kilidi düşür.
    if (parent?.is_system) {
        await supabase.from("product_types").update({ is_system: false }).eq("id", existing.product_type_id);
    }

    await supabase.from("audit_log").insert({
        action: "product_type_field_updated",
        entity_type: "product_type",
        entity_id: existing.product_type_id,
        before_state: {
            field_key: existing.field_key,
            field_type: existing.field_type,
            required: existing.required,
            is_active: existing.is_active,
            ...(parent?.is_system ? { is_system: true } : {}),
        },
        after_state: {
            ...updatePayload,
            ...(parent?.is_system ? { is_system: false } : {}),
        },
        source: "ui",
    });

    return data;
}

export async function dbDeleteProductTypeField(id: string, expectedTypeId?: string): Promise<void> {
    const supabase = createServiceClient();

    const { data: existing } = await supabase
        .from("product_type_fields").select("*").eq("id", id).single();
    if (!existing) throw new Error("Alan bulunamadı.");

    // Nested route scope: parent type ile uyumsuz field → cross-tenant koruması.
    if (expectedTypeId !== undefined && existing.product_type_id !== expectedTypeId) {
        throw new Error("Alan bu tipe ait değil.");
    }

    // Parent type'ın is_system durumunu çek (system tipi field pasifleşince kilidi düşer).
    const { data: parent } = await supabase
        .from("product_types").select("id, is_system").eq("id", existing.product_type_id).single();

    const { error } = await supabase
        .from("product_type_fields")
        .update({ is_active: false })
        .eq("id", id);
    if (error) throw new Error(error.message);

    // System tipi field pasifleşince kullanıcı tipi sayılır → kilidi düşür.
    if (parent?.is_system) {
        await supabase.from("product_types").update({ is_system: false }).eq("id", existing.product_type_id);
    }

    await supabase.from("audit_log").insert({
        action: "product_type_field_deactivated",
        entity_type: "product_type",
        entity_id: existing.product_type_id,
        before_state: {
            field_key: existing.field_key,
            field_type: existing.field_type,
            is_active: existing.is_active,
            ...(parent?.is_system ? { is_system: true } : {}),
        },
        after_state: {
            is_active: false,
            ...(parent?.is_system ? { is_system: false } : {}),
        },
        source: "ui",
    });
}

export async function dbReorderProductTypeFields(
    productTypeId: string,
    fieldIdsInOrder: string[],
): Promise<void> {
    if (!Array.isArray(fieldIdsInOrder)) throw new Error("Sıralama listesi geçersiz.");
    if (fieldIdsInOrder.length === 0) return;

    const supabase = createServiceClient();

    // Tüm field'lar bu tipe ait mi?
    const { data: existing } = await supabase
        .from("product_type_fields")
        .select("id")
        .eq("product_type_id", productTypeId)
        .eq("is_active", true);

    const existingIds = new Set((existing ?? []).map((f) => f.id));
    for (const id of fieldIdsInOrder) {
        if (!existingIds.has(id)) {
            throw new Error("Sıralama listesinde geçersiz alan id'si var.");
        }
    }

    const { data: parent } = await supabase
        .from("product_types").select("id, is_system").eq("id", productTypeId).single();

    // Her birini sırayla güncelle. Tek tek update — sayı az (tipik 5-20 alan).
    for (let i = 0; i < fieldIdsInOrder.length; i++) {
        const { error } = await supabase
            .from("product_type_fields")
            .update({ sort_order: (i + 1) * 10 })
            .eq("id", fieldIdsInOrder[i])
            .eq("product_type_id", productTypeId)
            .eq("is_active", true);
        if (error) throw new Error(error.message);
    }

    if (parent?.is_system) {
        await supabase.from("product_types").update({ is_system: false }).eq("id", productTypeId);
        await supabase.from("audit_log").insert({
            action: "product_type_updated",
            entity_type: "product_type",
            entity_id: productTypeId,
            before_state: { is_system: true },
            after_state: { is_system: false },
            source: "ui",
        });
    }
}

export async function dbReorderProductTypes(idsInOrder: string[]): Promise<void> {
    if (!Array.isArray(idsInOrder)) throw new Error("Sıralama listesi geçersiz.");
    if (idsInOrder.length === 0) return;

    const supabase = createServiceClient();

    const { data: existing } = await supabase
        .from("product_types").select("id").eq("is_active", true);
    const existingIds = new Set((existing ?? []).map((t) => t.id));
    for (const id of idsInOrder) {
        if (!existingIds.has(id)) throw new Error("Sıralama listesinde geçersiz tip id'si var.");
    }

    for (let i = 0; i < idsInOrder.length; i++) {
        const { error } = await supabase
            .from("product_types")
            .update({ sort_order: (i + 1) * 10 })
            .eq("id", idsInOrder[i])
            .eq("is_active", true);
        if (error) throw new Error(error.message);
    }
}

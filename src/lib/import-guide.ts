import {
    getActiveAiImportOperations,
    type AiImportOperationDefinition,
    type AiImportOperationScope,
} from "@/lib/ai-import-operations";
import { EXCEL_IMPORT_TEMPLATES, type ExcelImportTemplateKind } from "@/lib/import-center";

/**
 * Veri Aktarım Merkezi rehber/şeffaflık katmanı için TEK KAYNAK saf veri.
 *
 * "Ne yükle → nereye kaydedilir → ne olur → ne korunur" haritası ve adımlar
 * burada tanımlanır; sayfa/komponent bunları tüketir (sayfa-içi hardcode değil).
 * İçerik mevcut `ai-import-operations` (safetyNote/evidenceHint) ve
 * `import-center` (Excel şablonları) katmanlarından türetilir.
 */

export interface ImportStep {
    n: number;
    title: string;
    desc: string;
}

/** Aktarımın üç temel adımı (her zaman görünür şerit). */
export const IMPORT_STEPS: readonly ImportStep[] = [
    {
        n: 1,
        title: "İşlemi seç",
        desc: "Ne yapmak istediğini seç (yeni ürün, güncelleme, stok, sertifika…) veya Excel şablonu indirip doldur.",
    },
    {
        n: 2,
        title: "Dosyayı yükle",
        desc: "PDF, görsel, Excel veya CSV'yi sürükle bırak. AI dosyayı seçtiğin amaca göre okur ve eşleştirir.",
    },
    {
        n: 3,
        title: "İncele ve onayla",
        desc: "Bulunan eşleşmeleri ve alanları gözden geçir, onayla. Onayın olmadan hiçbir kayıt yazılmaz.",
    },
] as const;

export interface ImportDataTarget {
    /** Verinin kaydedildiği modül (kullanıcıya görünen ad). */
    module: string;
    /** Modülün dashboard yolu (varsa). */
    href: string | null;
    /** Onaydan sonra ne olur (yeni mi/güncelle mi). */
    action: string;
}

/**
 * İşlem kapsamı (scope) → verinin nereye kaydedildiği.
 * `ai-import-operations` içindeki her `scope` burada kapsanmalı.
 */
export const IMPORT_DATA_TARGETS: Record<AiImportOperationScope, ImportDataTarget> = {
    product: {
        module: "Stok & Ürünler",
        href: "/dashboard/products",
        action: "Yeni ürün oluşturur veya mevcut ürünü eşleştirip günceller.",
    },
    product_document: {
        module: "Ürün Ekleri & Kapak Görseli",
        href: "/dashboard/products",
        action: "Sertifika/doküman/görseli ürüne ek olarak bağlar; yüklenen ilk görsel ürün kapak görseli (primary) olur.",
    },
    product_type: {
        module: "Ürün Tipleri",
        href: "/dashboard/settings/product-types",
        action: "Teknik şablon (anahtar/birim/seçenek) önerisi üretir; mevcut ürünleri değiştirmez.",
    },
    stock: {
        module: "Stok",
        href: "/dashboard/products",
        action: "Stok sayımı mevcut miktarı yazar; stok hareketi giriş/çıkış olarak ekler/çıkarır.",
    },
    customer: {
        module: "Cariler",
        href: "/dashboard/customers",
        action: "Müşteriyi e-posta/kod öncelikli eşleştirir; yoksa yeni kayıt açar.",
    },
    vendor: {
        module: "Tedarikçiler",
        href: "/dashboard/vendors",
        action: "Tedarikçiyi e-posta/kod öncelikli eşleştirir; yoksa yeni kayıt açar.",
    },
};

export interface OperationTargetRow {
    id: string;
    title: string;
    /** Ne yükle / ne için. */
    description: string;
    /** Eşleşme/çıkarım için ne aranır. */
    evidenceHint: string;
    /** Ne korunur / ne uygulanmaz. */
    safetyNote: string;
    target: ImportDataTarget;
}

/**
 * Aktif AI işlemlerini hedef haritasıyla birleştirir.
 * Her işlem bir satır olur: işlem → modül → ne olur → ne aranır → ne korunur.
 */
export function buildOperationTargets(): OperationTargetRow[] {
    return getActiveAiImportOperations().map((op: AiImportOperationDefinition) => ({
        id: op.id,
        title: op.title,
        description: op.description,
        evidenceHint: op.evidenceHint,
        safetyNote: op.safetyNote,
        target: IMPORT_DATA_TARGETS[op.scope],
    }));
}

/** Tek bir işlem için hedef bilgisini döndürür (seçili-işlem özeti için). */
export function getTargetForOperation(op: AiImportOperationDefinition): ImportDataTarget {
    return IMPORT_DATA_TARGETS[op.scope];
}

/** Tüm akış için ortak güven/şeffaflık maddeleri. */
export const IMPORT_TRUST_NOTES: readonly string[] = [
    "Onayın olmadan hiçbir kayıt yazılmaz — her satırı ve alanı sen onaylarsın.",
    "Dosyada olmayan/boş alanlar mevcut veriyi silmez veya sıfırlamaz.",
    "Fiyat ve maliyet gibi finansal alanlar ayrı yetki ve açık onay olmadan uygulanmaz.",
    "Sertifika veya standart eksikliği bloklamaz; yalnızca bilgi uyarısı olarak kalır.",
    "Stok sayımı sayılan miktarı yazar; stok hareketi miktarı giriş/çıkış olarak ekler veya çıkarır.",
    "Excel/CSV dosyaları tarayıcında işlenir, sunucuya yüklenmez; AI akışında yüklenen belgeler güvenli depoda saklanır ve yalnızca sınıflandırma/çıkarım için okunur.",
] as const;

export interface TemplateLink {
    kind: ExcelImportTemplateKind;
    title: string;
    description: string;
    requiredCount: number;
    columnCount: number;
    href: string;
}

/** İndirilebilir Excel şablonlarını (mevcut /api/import/templates) listeler. */
export function getActiveTemplateLinks(): TemplateLink[] {
    return (Object.keys(EXCEL_IMPORT_TEMPLATES) as ExcelImportTemplateKind[]).map(kind => {
        const tpl = EXCEL_IMPORT_TEMPLATES[kind];
        return {
            kind,
            title: tpl.title,
            description: tpl.description,
            requiredCount: tpl.columns.filter(c => c.required).length,
            columnCount: tpl.columns.length,
            href: `/api/import/templates?kind=${kind}`,
        };
    });
}

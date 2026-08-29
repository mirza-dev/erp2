/**
 * Faz 3b — /dashboard/import/extract/[documentId]
 *
 * RSC: belge + (varsa) çıkarılmış satırları yükler, ExtractionReview client
 * component'ine geçer. Satır yoksa "Çıkar" CTA'sı görünür (POST /extract).
 */
import { notFound } from "next/navigation";
import { dbGetImportDocument } from "@/lib/supabase/import-documents";
import { dbListLinesByDocument } from "@/lib/supabase/import-document-lines";
import { dbGetProductTypeWithFields, dbListProductTypes } from "@/lib/supabase/product-types";
import { probeAIKey } from "@/lib/services/ai-service";
import ExtractionReview from "@/components/import/ExtractionReview";

export const dynamic = "force-dynamic";

export default async function ExtractDocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
    const { documentId } = await params;
    const [doc, lines, productTypesBase, aiHealth] = await Promise.all([
        dbGetImportDocument(documentId),
        dbListLinesByDocument(documentId).catch(() => []),
        dbListProductTypes().catch(() => []),
        // Doğrudan URL'le gelen kullanıcı da AI'nın kapalı olduğunu görsün —
        // hub'daki uyarıyı atlamış olabilir. `probeAIKey` sonucu 10 dk cache'li.
        probeAIKey().catch(() => null),
    ]);

    if (!doc) notFound();

    const productTypes = await Promise.all(
        productTypesBase.map(type => dbGetProductTypeWithFields(type.id).catch(() => null)),
    );

    return (
        <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
            <ExtractionReview
                document={doc}
                initialLines={lines}
                productTypes={productTypes
                    .filter((type): type is NonNullable<typeof type> => type !== null)
                    .map(type => ({ id: type.id, name: type.name, fields: type.fields }))}
                aiHealth={aiHealth}
            />
        </div>
    );
}

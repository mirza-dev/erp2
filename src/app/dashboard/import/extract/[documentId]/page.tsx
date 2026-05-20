/**
 * Faz 3b — /dashboard/import/extract/[documentId]
 *
 * RSC: belge + (varsa) çıkarılmış satırları yükler, ExtractionReview client
 * component'ine geçer. Satır yoksa "Çıkar" CTA'sı görünür (POST /extract).
 */
import { notFound } from "next/navigation";
import { dbGetImportDocument } from "@/lib/supabase/import-documents";
import { dbListLinesByDocument } from "@/lib/supabase/import-document-lines";
import { dbListProductTypes } from "@/lib/supabase/product-types";
import ExtractionReview from "@/components/import/ExtractionReview";

export const dynamic = "force-dynamic";

export default async function ExtractDocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
    const { documentId } = await params;
    const [doc, lines, productTypes] = await Promise.all([
        dbGetImportDocument(documentId),
        dbListLinesByDocument(documentId).catch(() => []),
        dbListProductTypes().catch(() => []),
    ]);

    if (!doc) notFound();

    return (
        <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
            <ExtractionReview
                document={doc}
                initialLines={lines}
                productTypes={productTypes.map(t => ({ id: t.id, name: t.name }))}
            />
        </div>
    );
}

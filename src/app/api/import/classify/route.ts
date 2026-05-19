/**
 * Faz 3a — POST /api/import/classify
 *
 * Multipart/form-data upload — single file. Auth: admin|purchaser
 * (classifier de AI token yakar; viewer dışlanır).
 *
 * Akış: file buffer → validate → Excel ise server-side xlsx parse → text sample →
 * aiClassifyDocument (multimodal) → dbCreateImportDocument(status='classified').
 *
 * AI graceful fail → classification.document_type='unknown' + status='classified'
 * (DB row yine yazılır, kullanıcı sayfada manuel devam edebilir).
 */
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
    dbCreateImportDocument,
    isClassifierAllowedMime,
    CLASSIFIER_MAX_FILE_SIZE,
} from "@/lib/supabase/import-documents";
import { aiClassifyDocument } from "@/lib/services/ai-service";
import { dbListProductTypes } from "@/lib/supabase/product-types";
import { requireRole } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const EXCEL_MIMES = new Set([
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
]);

/** Server-side xlsx → text sample. Pure helper (test edilebilirlik). */
export function extractExcelTextSample(buffer: Buffer, maxChars = 4000): string {
    try {
        const wb = XLSX.read(buffer, { type: "buffer" });
        const out: string[] = [];
        for (const sheetName of wb.SheetNames.slice(0, 3)) {
            const sheet = wb.Sheets[sheetName];
            if (!sheet) continue;
            const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).slice(0, 1500);
            out.push(`[Sheet: ${sheetName}]\n${csv}`);
            if (out.join("\n\n").length > maxChars) break;
        }
        return out.join("\n\n").slice(0, maxChars);
    } catch (err) {
        console.error("[classify] xlsx parse failed:", err);
        return "";
    }
}

export async function POST(req: NextRequest) {
    try {
        const guard = await requireRole(req, ["admin", "purchaser"]);
        if (guard) return guard;

        let formData: FormData;
        try {
            formData = await req.formData();
        } catch {
            return NextResponse.json({ error: "Multipart form verisi okunamadı." }, { status: 400 });
        }

        const file = formData.get("file");
        const batchIdRaw = formData.get("batch_id");

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
        }
        if (file.size <= 0) {
            return NextResponse.json({ error: "Dosya boş olamaz." }, { status: 400 });
        }
        if (file.size > CLASSIFIER_MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `Dosya ${CLASSIFIER_MAX_FILE_SIZE / (1024 * 1024)} MB sınırını aşıyor.` },
                { status: 400 },
            );
        }
        if (!isClassifierAllowedMime(file.type)) {
            return NextResponse.json({ error: "Geçersiz dosya türü." }, { status: 400 });
        }

        const batchId = typeof batchIdRaw === "string" && batchIdRaw.length > 0 ? batchIdRaw : null;

        const buffer = Buffer.from(await file.arrayBuffer());

        // Server-side text sample for Excel/CSV
        const excelTextSample = EXCEL_MIMES.has(file.type)
            ? extractExcelTextSample(buffer)
            : undefined;

        // Load product types for AI context
        const productTypes = await dbListProductTypes().catch(() => []);

        // Classify (graceful — never throws)
        const classification = await aiClassifyDocument({
            buffer,
            mimeType: file.type,
            fileName: file.name,
            excelTextSample,
            productTypes: productTypes.map(t => ({ id: t.id, name: t.name })),
        });

        // Resolve uploader (auth user — may be null in edge cases)
        const sb = await createClient();
        const { data: { user } } = await sb.auth.getUser();

        const row = await dbCreateImportDocument({
            batchId,
            file: buffer,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            classification,
            status: "classified",
            createdBy: user?.id ?? null,
        });

        return NextResponse.json({ ok: true, document: row }, { status: 201 });
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("zorunludur") ||
            err.message.toLowerCase().includes("geçersiz") ||
            err.message.includes("sınırını aşıyor") ||
            err.message.includes("yüklenemedi")
        )) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return handleApiError(err, "POST /api/import/classify");
    }
}

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
import { resolveAuthContext, requireRoleFor } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";
import {
    DEFAULT_AI_IMPORT_OPERATION,
    defaultOperationForDocumentType,
    getAiImportOperation,
    isAiImportOperationType,
} from "@/lib/ai-import-operations";

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
        // Tek getUser: guard + uploader aynı auth context'ten (perf Faz 1).
        const auth = await resolveAuthContext();
        const guard = requireRoleFor(auth, ["admin", "purchaser"]);
        if (guard) return guard;

        let formData: FormData;
        try {
            formData = await req.formData();
        } catch {
            return NextResponse.json({ error: "Multipart form verisi okunamadı." }, { status: 400 });
        }

        const file = formData.get("file");
        const batchIdRaw = formData.get("batch_id");
        const operationTypeRaw = formData.get("operation_type");

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
        // Dosya-önce akış: operation_type artık opsiyonel. Gönderilmediyse
        // sınıflandırma sonucunun document_type'ından türetilir (aşağıda);
        // AI prompt bağlamı için nötr varsayılan kullanılır.
        const explicitOperation = typeof operationTypeRaw === "string" && operationTypeRaw.length > 0
            ? operationTypeRaw
            : null;
        if (explicitOperation !== null) {
            if (!isAiImportOperationType(explicitOperation)) {
                return NextResponse.json({ error: "Geçersiz AI Import işlem türü." }, { status: 400 });
            }
            if (getAiImportOperation(explicitOperation).status !== "active") {
                return NextResponse.json({ error: "Bu AI Import işlem türü henüz aktif değil." }, { status: 400 });
            }
        }
        const operationType = explicitOperation ?? DEFAULT_AI_IMPORT_OPERATION;

        const buffer = Buffer.from(await file.arrayBuffer());

        // Server-side text sample for Excel/CSV
        const excelTextSample = EXCEL_MIMES.has(file.type)
            ? extractExcelTextSample(buffer)
            : undefined;

        // Load product types for AI context
        const productTypes = await dbListProductTypes().catch(() => []);

        // P3 (Review 3.c) — Pre-AI guard: client zaten gittiyse AI'yi hiç çağırma
        if (req.signal.aborted) {
            return new NextResponse(null, { status: 499 });
        }

        // Classify (graceful — never throws, EXCEPT for abort which re-throws)
        let classification;
        try {
            classification = await aiClassifyDocument(
                {
                    buffer,
                    mimeType: file.type,
                    fileName: file.name,
                    excelTextSample,
                    productTypes: productTypes.map(t => ({ id: t.id, name: t.name })),
                    operationType,
                },
                req.signal,
            );
        } catch (err) {
            if (req.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
                return new NextResponse(null, { status: 499 });
            }
            throw err;
        }

        // P3 (Review 3.c) — Post-AI guard: AI bitti ama client gittiyse DB/storage'a yazma
        if (req.signal.aborted) {
            return new NextResponse(null, { status: 499 });
        }

        // Resolve uploader (auth user — may be null in edge cases)
        const user = auth.user;

        // P3 (Review 3.d) — Pre-write guard: auth.getUser() async; bu pencerede
        // abort olursa DB+storage write hâlâ olabilir. Final kontrol.
        //
        // P3 (Review 3.e) — COMMIT POINT: Bu noktadan sonra `dbCreateImportDocument`
        // 3-step orphan-safe transaction'ını başlatır (INSERT pending → upload →
        // UPDATE classified). Abort sinyali helper'a yayılmaz; helper kendi
        // try/catch'i ile transaction'ı tamamlar veya rollback eder. Helper
        // başladıktan sonra orphan ihtimali 3c'deki 30-gün storage cron'una
        // bırakılmıştır.
        if (req.signal.aborted) {
            return new NextResponse(null, { status: 499 });
        }

        // Explicit verilmediyse belge tipinden türet — extract route bunu okur;
        // kullanıcı İncele ekranında override edebilir.
        const stampedOperation = explicitOperation
            ?? defaultOperationForDocumentType(classification.document_type);

        const row = await dbCreateImportDocument({
            batchId,
            file: buffer,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            classification: { ...classification, operation_type: stampedOperation },
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

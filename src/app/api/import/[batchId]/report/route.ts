import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requirePermission } from "@/lib/auth/role-guard";
import { dbGetBatch, dbListDrafts } from "@/lib/supabase/import";

type ReportFormat = "csv" | "xlsx";

function asArrayText(value: unknown): string {
    if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean).join(" | ");
    if (typeof value === "string") return value;
    return "";
}

function asObjectText(value: unknown): string {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    return Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(" | ");
}

function escapeCsv(value: unknown): string {
    const text = String(value ?? "");
    if (!/[",\n\r]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

function fileBaseName(fileName: string | null): string {
    return (fileName ?? "import")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "import";
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ batchId: string }> },
) {
    try {
        const guard = await requirePermission(req, "view_import");
        if (guard) return guard;

        const { batchId } = await params;
        const formatParam = req.nextUrl.searchParams.get("format") ?? "csv";
        if (formatParam !== "csv" && formatParam !== "xlsx") {
            return NextResponse.json({ error: "Geçersiz rapor formatı." }, { status: 400 });
        }
        const format = formatParam as ReportFormat;

        const batch = await dbGetBatch(batchId);
        if (!batch) {
            return NextResponse.json({ error: "Batch bulunamadı." }, { status: 404 });
        }

        const drafts = await dbListDrafts(batchId);
        const rows = drafts.map((draft, idx) => ({
            row: draft.row_number ?? idx + 1,
            sheet: draft.sheet_name ?? "",
            entity_type: draft.entity_type,
            draft_status: draft.status,
            match_status: draft.match_status,
            match_confidence: draft.match_confidence ?? draft.confidence ?? "",
            matched_entity_id: draft.matched_entity_id ?? "",
            risk_flags: asArrayText(draft.risk_flags),
            row_errors: asArrayText(draft.row_errors),
            field_approvals: asObjectText(draft.field_approvals),
            user_corrections: asObjectText(draft.user_corrections),
        }));

        const baseName = fileBaseName(batch.file_name);
        if (format === "csv") {
            const header = Object.keys(rows[0] ?? {
                row: "",
                sheet: "",
                entity_type: "",
                draft_status: "",
                match_status: "",
                match_confidence: "",
                matched_entity_id: "",
                risk_flags: "",
                row_errors: "",
                field_approvals: "",
                user_corrections: "",
            });
            const csv = [
                header.join(","),
                ...rows.map(row => header.map(key => escapeCsv(row[key as keyof typeof row])).join(",")),
            ].join("\n");

            return new NextResponse(csv, {
                status: 200,
                headers: {
                    "Content-Type": "text/csv; charset=utf-8",
                    "Content-Disposition": `attachment; filename="${baseName}-import-report.csv"`,
                    "Cache-Control": "no-store",
                },
            });
        }

        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ row: "", sheet: "", entity_type: "", draft_status: "", match_status: "" }]);
        XLSX.utils.book_append_sheet(workbook, sheet, "Import Report");
        const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

        return new NextResponse(new Uint8Array(bytes), {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${baseName}-import-report.xlsx"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (err) {
        console.error("[GET /api/import/[batchId]/report]", err);
        return NextResponse.json({ error: "Import raporu üretilemedi." }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requirePermission } from "@/lib/auth/role-guard";
import {
    EXCEL_IMPORT_TEMPLATE_VERSION,
    getExcelTemplateDefinition,
    isExcelImportTemplateKind,
} from "@/lib/import-center";

export async function GET(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "view_import");
        if (guard) return guard;

        const kind = req.nextUrl.searchParams.get("kind");
        if (!isExcelImportTemplateKind(kind)) {
            return NextResponse.json({ error: "Geçersiz şablon türü." }, { status: 400 });
        }

        const template = getExcelTemplateDefinition(kind);
        const header = template.columns.map(column => column.field);
        const labels = Object.fromEntries(template.columns.map(column => [column.field, column.label]));
        const required = Object.fromEntries(template.columns.map(column => [column.field, column.required ? "zorunlu" : "opsiyonel"]));
        const notes = Object.fromEntries(template.columns.map(column => [column.field, column.note]));
        const example = Object.fromEntries(template.columns.map(column => [column.field, column.example]));

        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.json_to_sheet([labels, required, notes, example], { header });
        XLSX.utils.book_append_sheet(workbook, sheet, template.sheetName);

        const meta = XLSX.utils.json_to_sheet([
            { key: "template_kind", value: template.kind },
            { key: "template_version", value: EXCEL_IMPORT_TEMPLATE_VERSION },
            { key: "entity_type", value: template.entityType },
            { key: "operation_type", value: template.operationType },
            { key: "description", value: template.description },
        ], { header: ["key", "value"] });
        XLSX.utils.book_append_sheet(workbook, meta, "Meta");

        const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
        const fileName = `kokpit-erp-${kind}-template.xlsx`;

        return new NextResponse(new Uint8Array(bytes), {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${fileName}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (err) {
        console.error("[GET /api/import/templates]", err);
        return NextResponse.json({ error: "Şablon üretilemedi." }, { status: 500 });
    }
}

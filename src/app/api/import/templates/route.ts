import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requirePermission } from "@/lib/auth/role-guard";
import {
    EXCEL_IMPORT_TEMPLATE_VERSION,
    getExcelTemplateDefinition,
    isExcelImportTemplateKind,
    buildProductTypeTemplateColumns,
} from "@/lib/import-center";
import { dbGetProductTypeWithFields } from "@/lib/supabase/product-types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "view_import");
        if (guard) return guard;

        const kind = req.nextUrl.searchParams.get("kind");

        // Faz B — tip-özel şablon: ?kind=product_type&typeId=<uuid>
        if (kind === "product_type") {
            const typeId = req.nextUrl.searchParams.get("typeId");
            if (!typeId || !UUID_RE.test(typeId)) {
                return NextResponse.json({ error: "Geçersiz ürün tipi." }, { status: 400 });
            }
            const type = await dbGetProductTypeWithFields(typeId);
            if (!type) {
                return NextResponse.json({ error: "Ürün tipi bulunamadı." }, { status: 404 });
            }
            const columns = buildProductTypeTemplateColumns(type.name, type.fields);
            const header = columns.map(c => c.field);
            const labels = Object.fromEntries(columns.map(c => [c.field, c.label]));
            const required = Object.fromEntries(columns.map(c => [c.field, c.required ? "zorunlu" : "opsiyonel"]));
            const notes = Object.fromEntries(columns.map(c => [c.field, c.note]));
            const example = Object.fromEntries(columns.map(c => [c.field, c.example]));

            const wb = XLSX.utils.book_new();
            const sheet = XLSX.utils.json_to_sheet([labels, required, notes, example], { header });
            XLSX.utils.book_append_sheet(wb, sheet, "Urunler");
            const meta = XLSX.utils.json_to_sheet([
                { key: "template_kind", value: "product_type" },
                { key: "template_version", value: EXCEL_IMPORT_TEMPLATE_VERSION },
                { key: "entity_type", value: "product" },
                { key: "product_type_id", value: type.id },
                { key: "product_type_name", value: type.name },
                { key: "description", value: `${type.name} ürünleri — teknik alanlar dahil.` },
            ], { header: ["key", "value"] });
            XLSX.utils.book_append_sheet(wb, meta, "Meta");

            const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
            const safeName = type.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
            return new NextResponse(new Uint8Array(buf), {
                status: 200,
                headers: {
                    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "Content-Disposition": `attachment; filename="roven-${safeName}-template.xlsx"`,
                    "Cache-Control": "no-store",
                },
            });
        }

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

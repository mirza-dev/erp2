import { NextRequest, NextResponse } from "next/server";
import {
    dbListAttachmentsByProduct,
    dbCreateAttachment,
    dbGetSignedUrlsForRows,
    ALLOWED_MIME,
    MAX_FILE_SIZE,
    isValidAttachmentKind,
    isAllowedMime,
} from "@/lib/supabase/product-attachments";
import { requireRole } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";
import { mapProductAttachment } from "@/lib/api-mappers";
import { revalidateTag } from "next/cache";
import type { ProductAttachmentKind } from "@/lib/database.types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_URL_TTL = 3600;

export const dynamic = "force-dynamic";

// GET /api/products/[id]/attachments?kind=image|datasheet|...
// Response: { items: ProductAttachment[], expires_in: number }
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        if (!UUID_RE.test(id)) {
            return NextResponse.json({ error: "Geçersiz ürün id." }, { status: 400 });
        }
        const kindParam = new URL(req.url).searchParams.get("kind");
        const kind = kindParam && isValidAttachmentKind(kindParam)
            ? (kindParam as ProductAttachmentKind)
            : undefined;
        const rows = await dbListAttachmentsByProduct(id, kind);
        const urlMap = await dbGetSignedUrlsForRows(rows, SIGNED_URL_TTL);
        const items = rows.map(row => mapProductAttachment(row, urlMap.get(row.file_path) ?? null));
        return NextResponse.json({ items, expires_in: SIGNED_URL_TTL });
    } catch (err) {
        return handleApiError(err, "GET /api/products/[id]/attachments");
    }
}

// POST /api/products/[id]/attachments — multipart/form-data, fields: file, kind, metadata?
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requireRole(req, ["admin", "purchaser"]);
        if (guard) return guard;

        const { id } = await params;
        if (!UUID_RE.test(id)) {
            return NextResponse.json({ error: "Geçersiz ürün id." }, { status: 400 });
        }

        const formData = await req.formData();
        const file = formData.get("file");
        const kindRaw = formData.get("kind");
        const metadataRaw = formData.get("metadata");

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
        }
        if (!isAllowedMime(file.type)) {
            return NextResponse.json(
                { error: `Geçersiz dosya türü. Kabul edilenler: ${ALLOWED_MIME.join(", ")}.` },
                { status: 400 },
            );
        }
        if (file.size <= 0) {
            return NextResponse.json({ error: "Dosya boş olamaz." }, { status: 400 });
        }
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `Dosya ${MAX_FILE_SIZE / (1024 * 1024)} MB sınırını aşıyor.` },
                { status: 400 },
            );
        }

        if (!isValidAttachmentKind(kindRaw)) {
            return NextResponse.json({ error: "Geçersiz dosya kategorisi." }, { status: 400 });
        }

        let metadata: Record<string, unknown> | null = null;
        if (typeof metadataRaw === "string" && metadataRaw.length > 0) {
            try {
                metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
            } catch {
                return NextResponse.json({ error: "metadata JSON geçersiz." }, { status: 400 });
            }
        }

        const sb = await createClient();
        const { data: { user } } = await sb.auth.getUser();

        const buffer = Buffer.from(await file.arrayBuffer());

        const row = await dbCreateAttachment({
            productId: id,
            file: buffer,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            kind: kindRaw,
            metadata,
            uploadedBy: user?.id ?? null,
        });

        revalidateTag("products", "max");
        return NextResponse.json(row, { status: 201 });
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("zorunludur") ||
            err.message.toLowerCase().includes("geçersiz") ||
            err.message.includes("sınırını aşıyor") ||
            err.message.includes("yüklenemedi")
        )) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return handleApiError(err, "POST /api/products/[id]/attachments");
    }
}

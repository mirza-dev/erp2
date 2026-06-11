import { NextRequest, NextResponse } from "next/server";
import { dbListCompanyFiles, dbCreateCompanyFile } from "@/lib/supabase/company-files";
import {
    MAX_COMPANY_FILE_SIZE,
    COMPANY_FILES_STORAGE_LIMIT_MB,
    isAllowedCompanyFileExt,
    isCompanyFileCategory,
    splitName,
    ALLOWED_COMPANY_FILE_EXT_LABEL,
} from "@/lib/company-files";
import { requirePermission, resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// GET /api/settings/files — aktif (silinmemiş) şirket dosyaları + depolama kullanımı.
// Sistem kapsamı: Ayarlar'ın sistem sekmelerini gören herkes listeler.
export async function GET(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "view_settings");
        if (guard) return guard;

        const files = await dbListCompanyFiles();
        const usedBytes = files.reduce((sum, f) => sum + (f.file_size ?? 0), 0);
        return NextResponse.json({
            files,
            usedBytes,
            limitBytes: COMPANY_FILES_STORAGE_LIMIT_MB * 1024 * 1024,
        });
    } catch (err) {
        return handleApiError(err, "GET /api/settings/files");
    }
}

// POST /api/settings/files — multipart: file + display_name (uzantısız taban ad) + category.
// Tek dosya/istek: çoklu seçimde client sıralı POST atar (dosya başına hata raporu).
export async function POST(req: NextRequest) {
    try {
        // Tek getUser: guard + uploaded_by snapshot aynı auth context'ten (perf Faz 1).
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "manage_settings");
        if (guard) return guard;

        const formData = await req.formData();
        const file = formData.get("file");
        const displayNameRaw = formData.get("display_name");
        const categoryRaw = formData.get("category");

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
        }

        const baseName = typeof displayNameRaw === "string" ? displayNameRaw.trim() : "";
        if (!baseName) return NextResponse.json({ error: "Dosya adı zorunludur." }, { status: 400 });
        if (baseName.length > 200) {
            return NextResponse.json({ error: "Dosya adı en fazla 200 karakter olabilir." }, { status: 400 });
        }

        if (!isCompanyFileCategory(categoryRaw)) {
            return NextResponse.json({ error: "Geçersiz kategori." }, { status: 400 });
        }

        // Uzantı orijinal dosya adından gelir — kullanıcı ad alanında değiştiremez.
        const { ext } = splitName(file.name);
        if (!isAllowedCompanyFileExt(ext)) {
            return NextResponse.json(
                { error: `Desteklenmeyen dosya türü. Kabul edilenler: ${ALLOWED_COMPANY_FILE_EXT_LABEL}.` },
                { status: 400 },
            );
        }

        if (file.size <= 0) {
            return NextResponse.json({ error: "Dosya boş olamaz." }, { status: 400 });
        }
        if (file.size > MAX_COMPANY_FILE_SIZE) {
            return NextResponse.json(
                { error: `Dosya ${MAX_COMPANY_FILE_SIZE / (1024 * 1024)} MB sınırını aşıyor.` },
                { status: 400 },
            );
        }

        // Yükleyen: session kullanıcısının görünen adı (full_name || email snapshot).
        let uploadedBy: string | null = null;
        if (ctx.user) {
            const meta = (ctx.user.user_metadata ?? {}) as Record<string, unknown>;
            uploadedBy = (typeof meta.full_name === "string" && meta.full_name.trim())
                ? meta.full_name.trim()
                : (ctx.user.email ?? null);
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        const row = await dbCreateCompanyFile({
            baseName,
            ext,
            category: categoryRaw,
            file: buffer,
            fileSize: file.size,
            uploadedBy,
        });

        return NextResponse.json(row, { status: 201 });
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("zorunludur") ||
            err.message.toLowerCase().includes("geçersiz") ||
            err.message.includes("sınırını aşıyor") ||
            err.message.includes("Desteklenmeyen") ||
            err.message.includes("yüklenemedi")
        )) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return handleApiError(err, "POST /api/settings/files");
    }
}

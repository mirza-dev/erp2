import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { dbUpdateUserAvatarUrl } from "@/lib/supabase/user-profile";
import { handleApiError } from "@/lib/api-error";

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const MAX_SIZE = 1 * 1024 * 1024; // 1MB

// POST /api/settings/user/avatar — multipart/form-data, field: "file"
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
        }
        if (!ALLOWED_MIME.includes(file.type)) {
            return NextResponse.json({ error: "Geçersiz dosya türü. PNG, JPEG, SVG veya WebP yükleyin." }, { status: 400 });
        }
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: "Dosya 1MB'ı aşıyor." }, { status: 400 });
        }

        // Ext sanitization: alfa-numerik dışı tüm karakterler temizlenir (path traversal koruması).
        // user.id zaten UUID; path = "{uuid}.{ext}". Boş ext "png"e fallback.
        const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
        const path = `${user.id}.${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());

        const sb = createServiceClient();
        const { error: uploadError } = await sb.storage
            .from("user-avatars")
            .upload(path, buffer, { upsert: true, contentType: file.type });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = sb.storage.from("user-avatars").getPublicUrl(path);
        const avatarUrl = `${publicUrl}?t=${Date.now()}`;

        // Metadata update başarısız olursa storage'daki orphan dosyayı temizle
        // (yoksa bucket'ta URL'i auth.users'a kaydedilmemiş ölü dosya kalır).
        try {
            await dbUpdateUserAvatarUrl(user.id, avatarUrl);
        } catch (metaErr) {
            await sb.storage.from("user-avatars").remove([path]).catch(() => { /* best-effort cleanup */ });
            throw metaErr;
        }

        return NextResponse.json({ avatarUrl });
    } catch (err) {
        return handleApiError(err, "POST /api/settings/user/avatar");
    }
}

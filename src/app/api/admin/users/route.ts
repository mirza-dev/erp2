import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error";

async function requireAdmin(): Promise<{ error: NextResponse } | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: NextResponse.json({ error: "Yetkisiz." }, { status: 401 }) };
    const allowed = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(user.email ?? "")) {
        return { error: NextResponse.json({ error: "Bu işlem için admin yetkisi gereklidir." }, { status: 403 }) };
    }
    return null;
}

// GET /api/admin/users — tüm kullanıcıları listele
export async function GET() {
    const adminCheck = await requireAdmin();
    if (adminCheck) return adminCheck.error;
    try {
        const supabase = createServiceClient();
        const { data, error } = await supabase.auth.admin.listUsers();
        if (error) return handleApiError(error, "GET /api/admin/users");
        return NextResponse.json(
            data.users.map((u) => ({
                id: u.id,
                email: u.email,
                created_at: u.created_at,
                last_sign_in_at: u.last_sign_in_at ?? null,
            }))
        );
    } catch (err) {
        return handleApiError(err, "GET /api/admin/users");
    }
}

// POST /api/admin/users — yeni kullanıcı oluştur
// Body: { email: string, password: string }
export async function POST(req: NextRequest) {
    const adminCheck = await requireAdmin();
    if (adminCheck) return adminCheck.error;
    try {
        const body = await req.json();
        const { email, password } = body as { email?: string; password?: string };

        if (!email?.trim()) {
            return NextResponse.json({ error: "E-posta zorunludur." }, { status: 400 });
        }
        if (!password || password.length < 8) {
            return NextResponse.json(
                { error: "Şifre en az 8 karakter olmalıdır." },
                { status: 400 }
            );
        }

        const supabase = createServiceClient();
        const { data, error } = await supabase.auth.admin.createUser({
            email: email.trim(),
            password,
            email_confirm: true,
        });

        if (error) {
            if (error.message.includes("already registered")) {
                return NextResponse.json(
                    { error: "Bu e-posta adresi zaten kayıtlı." },
                    { status: 409 }
                );
            }
            return handleApiError(error, "POST /api/admin/users");
        }

        return NextResponse.json(
            { id: data.user.id, email: data.user.email },
            { status: 201 }
        );
    } catch (err) {
        return handleApiError(err, "POST /api/admin/users");
    }
}

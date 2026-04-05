import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handleApiError } from "@/lib/api-error";

// GET /api/admin/users — tüm kullanıcıları listele
export async function GET() {
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

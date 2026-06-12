import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { REMEMBER_COOKIE, shouldPersistSession, applySessionPersistence } from "@/lib/auth/remember";

export async function createClient() {
    const cookieStore = await cookies();

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        // "Beni hatırla" kapalıysa auth cookie'leri session cookie yazılır.
                        const persist = shouldPersistSession(cookieStore.get(REMEMBER_COOKIE)?.value);
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, applySessionPersistence(options ?? {}, persist))
                        );
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing user sessions.
                    }
                },
            },
        }
    );
}

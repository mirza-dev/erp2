import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Route-içi CRON_SECRET doğrulaması (denetim D4, 2026-06).
 *
 * Proxy CRON_PATHS zaten Bearer kontrolü yapar; bu helper derinlemesine
 * savunmadır — proxy matcher'ı değişir/baypas edilirse cron uçları yine de
 * anonim çağrılamaz. Kurallar:
 *  - CRON_SECRET env UNSET → fail-closed 401 (boş secret'la "her bearer geçer"
 *    durumu asla oluşmaz).
 *  - Karşılaştırma timing-safe (uzunluk farkında erken dönüş yok).
 *
 * Kullanım: `const guard = requireCronSecret(req); if (guard) return guard;`
 */
export function requireCronSecret(req: NextRequest): NextResponse | null {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization") ?? "";
    if (!secret || !auth.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
    }
    const provided = Buffer.from(auth.slice("Bearer ".length));
    const expected = Buffer.from(secret);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
    }
    return null;
}

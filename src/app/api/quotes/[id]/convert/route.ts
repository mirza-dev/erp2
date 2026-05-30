import { NextRequest, NextResponse } from "next/server";

// POST /api/quotes/[id]/convert
// @deprecated Faz 6 (V4-A8): accept + sipariş artık TEK atomik işlem —
// POST /api/quotes/[id]/accept (serviceAcceptQuoteToOrder, RPC 077). Bu endpoint
// 410 Gone döner; eski iki-adımlı (PATCH transition:accepted → /convert) akış
// kaldırıldı. serviceConvertQuoteToOrder referans için korunur (route'tan çağrılmaz).
export async function POST(
    _req: NextRequest,
    _ctx: { params: Promise<{ id: string }> }
) {
    return NextResponse.json(
        { error: "Bu uç nokta kaldırıldı. Kabul + sipariş için POST /api/quotes/[id]/accept kullanın." },
        { status: 410 },
    );
}

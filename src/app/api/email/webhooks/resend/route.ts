import { NextRequest, NextResponse } from "next/server";
import { processResendWebhook, verifyResendWebhook } from "@/lib/services/email-webhook-service";

export async function POST(req: NextRequest) {
    const id = req.headers.get("svix-id") ?? "";
    const timestamp = req.headers.get("svix-timestamp") ?? "";
    const signature = req.headers.get("svix-signature") ?? "";
    if (!id || !timestamp || !signature) {
        return NextResponse.json({ error: "Geçersiz webhook." }, { status: 400 });
    }
    const payload = await req.text();
    try {
        const event = verifyResendWebhook({ payload, id, timestamp, signature });
        return await processVerifiedEvent(event, id);
    } catch {
        return NextResponse.json({ error: "Geçersiz webhook." }, { status: 400 });
    }
}

async function processVerifiedEvent(
    event: ReturnType<typeof verifyResendWebhook>,
    id: string,
) {
    try {
        const result = await processResendWebhook(event, id);
        return NextResponse.json({ ok: true, duplicate: result.duplicate, matched: result.matched });
    } catch {
        return NextResponse.json({ error: "Webhook işlenemedi." }, { status: 500 });
    }
}

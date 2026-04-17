import { NextRequest, NextResponse } from "next/server";
import {
    dbGetCommitment,
    dbReceiveCommitment,
    dbCancelCommitment,
    CommitmentConflictError,
} from "@/lib/supabase/purchase-commitments";
import { handleApiError } from "@/lib/api-error";
import { revalidateTag } from "next/cache";

// GET /api/purchase-commitments/[id]
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const commitment = await dbGetCommitment(id);
        if (!commitment) {
            return NextResponse.json({ error: "Commitment bulunamadı." }, { status: 404 });
        }
        return NextResponse.json(commitment);
    } catch (err) {
        return handleApiError(err, "GET /api/purchase-commitments/[id]");
    }
}

// PATCH /api/purchase-commitments/[id]
// Body: { action: "receive" | "cancel" }
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const action: string = body.action;

        if (!action) {
            return NextResponse.json({ error: "'action' alanı zorunludur." }, { status: 400 });
        }

        if (action === "receive") {
            await dbReceiveCommitment(id);
            revalidateTag("products", "max");
            return NextResponse.json({ success: true });
        }

        if (action === "cancel") {
            await dbCancelCommitment(id);
            revalidateTag("products", "max");
            return NextResponse.json({ success: true });
        }

        return NextResponse.json(
            { error: `Bilinmeyen action: '${action}'. Geçerli değerler: receive, cancel` },
            { status: 400 }
        );
    } catch (err) {
        if (err instanceof CommitmentConflictError) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        return handleApiError(err, "PATCH /api/purchase-commitments/[id]");
    }
}

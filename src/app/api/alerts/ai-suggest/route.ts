import { NextResponse } from "next/server";
import { serviceGenerateAiAlerts } from "@/lib/services/alert-service";
import { handleApiError } from "@/lib/api-error";

export async function POST() {
    try {
        const result = await serviceGenerateAiAlerts();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "AI öneri oluşturulamadı.");
    }
}

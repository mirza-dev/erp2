/**
 * POST /api/production/transcribe
 * Ses dosyasını alır → Whisper ile transkripsiyon → Claude Haiku ile yapısal çıkarım.
 * domain-rules §11: AI öneri verir, asıl kayıt mevcut üretim akışından geçer.
 *
 * V2: çoklu ürün (entries[]) + global session notu.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error";
import { dbListAllActiveProducts } from "@/lib/supabase/products";
import {
    transcribeAudio,
    extractProductionData,
    buildWhisperPrompt,
    isVoiceAvailable,
} from "@/lib/services/voice-service";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg"];

export async function POST(req: Request) {
    try {
        // 1. Session kontrolü (explicit — route testlerinde 401 doğrulanabilsin)
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
        }

        // 2. Servis kullanılabilirlik kontrolü
        if (!isVoiceAvailable()) {
            return NextResponse.json({ error: "Sesli giriş servisi yapılandırılmamış." }, { status: 503 });
        }

        // 3. Audio dosyasını al
        let formData: FormData;
        try {
            formData = await req.formData();
        } catch {
            return NextResponse.json({ error: "Geçersiz form verisi." }, { status: 400 });
        }

        const audioFile = formData.get("audio");
        if (!audioFile || !(audioFile instanceof File)) {
            return NextResponse.json({ error: "'audio' dosyası eksik." }, { status: 400 });
        }

        // 4. MIME type kontrolü (cost-abuse koruması)
        const fileType = audioFile.type.split(";")[0].toLowerCase();
        if (!ALLOWED_AUDIO_TYPES.includes(fileType)) {
            return NextResponse.json({ error: "Geçersiz dosya formatı. Ses dosyası bekleniyor." }, { status: 400 });
        }

        // 5. Boyut kontrolü
        if (audioFile.size > MAX_AUDIO_BYTES) {
            return NextResponse.json({ error: "Ses dosyası 10MB sınırını aşıyor." }, { status: 400 });
        }

        if (audioFile.size === 0) {
            return NextResponse.json({ error: "Ses dosyası boş." }, { status: 400 });
        }

        const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
        const filename = audioFile.name || "recording.webm";

        // 6. Aktif ürün listesi (Whisper prompt + Claude eşleştirme için)
        const products = await dbListAllActiveProducts();
        const whisperPrompt = buildWhisperPrompt(products);

        // 7. Whisper transkripsiyon
        const transcription = await transcribeAudio(audioBuffer, filename, whisperPrompt);

        if (!transcription) {
            return NextResponse.json({ error: "Ses algılanamadı. Daha yüksek sesle konuşun." }, { status: 422 });
        }

        // 8. Claude yapısal çıkarım
        const productRefs = products.map(p => ({ id: p.id, name: p.name, sku: p.sku, category: p.category }));
        const { entries, sessionNote, rawText } = await extractProductionData(transcription, productRefs);

        return NextResponse.json({ text: rawText, entries, sessionNote });
    } catch (err) {
        return handleApiError(err, "POST /api/production/transcribe");
    }
}

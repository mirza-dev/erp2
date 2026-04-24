/**
 * Voice Service — domain-rules §11
 * Sesli üretim girişi: OpenAI Whisper (transkripsiyon) + Claude Haiku (yapısal çıkarım).
 * AI öneri verir; asıl kayıt mevcut production akışından geçer (§11.1, §2.3).
 *
 * V1 scope: tek ürün + adet + opsiyonel not. "fire" → notes'a yazılır.
 */

import Anthropic from "@anthropic-ai/sdk";
import { sanitizeAiInput, clampConfidence } from "@/lib/ai-guards";
import { logAiRun, hashInput } from "@/lib/supabase/ai-runs";

const MODEL = "claude-haiku-4-5-20251001";

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export function isVoiceAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY && !!process.env.ANTHROPIC_API_KEY;
}

// ── Tipler ───────────────────────────────────────────────────────────────────

export interface VoiceProductionEntry {
    productId: string | null;  // eşleşen ürün ID — null = eşleşmedi
    productName: string;       // eşleşen ürün adı veya ham metin
    productSku: string;        // eşleşen SKU
    quantity: number;
    notes: string;             // opsiyonel not; "fire: N adet" da buraya eklenir
    confidence: number;        // 0-1
}

interface ProductRef {
    id: string;
    name: string;
    sku: string;
}

// ── Whisper Transkripsiyon ────────────────────────────────────────────────────

/**
 * OpenAI Whisper API ile ses dosyasını Türkçe metne çevirir.
 * fetch ile çağrılır — openai npm paketi gerekmez.
 *
 * @param audioBuffer   Ham ses verisi (webm/mp4)
 * @param filename      Dosya adı (uzantı önemli: recording.webm veya recording.mp4)
 * @param whisperPrompt Ürün isim/SKU listesi (domain terimleri için)
 */
export async function transcribeAudio(
    audioBuffer: Buffer,
    filename: string,
    whisperPrompt = "",
): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY eksik.");

    const formData = new FormData();
    const mimeType = filename.endsWith(".mp4") ? "audio/mp4" : "audio/webm";
    formData.append("file", new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), filename);
    formData.append("model", "whisper-1");
    formData.append("language", "tr");
    if (whisperPrompt) formData.append("prompt", whisperPrompt);

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Whisper API hatası ${res.status}: ${detail}`);
    }

    const json = await res.json() as { text?: string };
    return (json.text ?? "").trim();
}

// ── Claude Haiku Yapısal Çıkarım ─────────────────────────────────────────────

const SYSTEM_PROMPT = `Sen bir üretim veri giriş asistanısın.
Kullanıcının sesli mesaj transkripsiyonundan ÜRETİM verisini çıkar.

Kurallar:
- Ürün listesinden EN İYİ eşleşen ürünü bul (SKU, isim veya benzerlik ile).
- Eşleşme yoksa productId null, productName/productSku boş string döndür.
- Adet (quantity): pozitif tam sayı. Belirtilmemişse 1.
- "fire", "hurda", "ıskarta" gibi kelimeler varsa: notes alanına "fire: N adet" formatında ekle.
- notes: varsa ek bilgi. Yoksa boş string.
- confidence: 0-1 arası float. Ürün eşleşmesi belirsizse düşük tut.
- SADECE JSON döndür, başka metin YOK.

Çıktı formatı (kesinlikle bu şema):
{
  "productId": "uuid veya null",
  "productName": "eşleşen ürün adı veya ham metin",
  "productSku": "eşleşen SKU veya boş string",
  "quantity": 50,
  "notes": "",
  "confidence": 0.95
}`;

/**
 * Claude Haiku ile transkripsyon metninden üretim verisi çıkarır.
 * V1: tek ürün döner (entries[] değil, entry tekil).
 */
export async function extractProductionData(
    transcription: string,
    products: ProductRef[],
): Promise<{ entry: VoiceProductionEntry; rawText: string }> {
    const safeText = sanitizeAiInput(transcription, 2000);

    const productList = products
        .map(p => `${sanitizeAiInput(p.sku, 50)} — ${sanitizeAiInput(p.name, 100)} (id: ${p.id})`)
        .join("\n");

    const userContent = `Ürün listesi:\n${productList}\n\nTranskripsiyon: "${safeText}"`;

    const t0 = Date.now();
    let rawResponse = "";

    try {
        const msg = await client.messages.create({
            model: MODEL,
            max_tokens: 512,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userContent }],
        });

        rawResponse = msg.content
            .filter(b => b.type === "text")
            .map(b => (b as { type: "text"; text: string }).text)
            .join("")
            .trim();
    } catch (err) {
        logAiRun({
            feature: "production_voice",
            input_hash: hashInput(safeText),
            confidence: 0,
            latency_ms: Date.now() - t0,
            model: MODEL,
        });
        throw new Error(`Claude API hatası: ${err instanceof Error ? err.message : String(err)}`);
    }

    const latencyMs = Date.now() - t0;

    // JSON parse
    let parsed: Record<string, unknown>;
    try {
        // Claude bazen ```json ``` bloğu döndürebilir — temizle
        const cleaned = rawResponse.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
        parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
        logAiRun({ feature: "production_voice", input_hash: hashInput(safeText), confidence: 0, latency_ms: latencyMs, model: MODEL });
        throw new Error("Claude çıktısı JSON parse edilemedi.");
    }

    const knownIds = new Set(products.map(p => p.id));
    const entry: VoiceProductionEntry = {
        productId: typeof parsed.productId === "string" && knownIds.has(parsed.productId) ? parsed.productId : null,
        productName: typeof parsed.productName === "string" ? parsed.productName : "",
        productSku: typeof parsed.productSku === "string" ? parsed.productSku : "",
        quantity: typeof parsed.quantity === "number" && parsed.quantity > 0 ? Math.floor(parsed.quantity) : 1,
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
        confidence: clampConfidence(parsed.confidence),
    };

    logAiRun({
        feature: "production_voice",
        entity_id: entry.productId,
        input_hash: hashInput(safeText),
        confidence: entry.confidence,
        latency_ms: latencyMs,
        model: MODEL,
    });

    return { entry, rawText: safeText };
}

/**
 * Aktif ürün listesinden Whisper prompt metni oluşturur.
 * "DN50 DN65 DN80 vana musluk fire üretim adet" formatında.
 */
export function buildWhisperPrompt(products: ProductRef[]): string {
    const terms = products.flatMap(p => [p.sku, p.name]).filter(Boolean);
    const unique = [...new Set(terms)];
    return unique.slice(0, 200).join(" "); // Whisper prompt max ~224 token
}

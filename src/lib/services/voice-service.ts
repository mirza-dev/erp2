/**
 * Voice Service — domain-rules §11
 * Sesli üretim girişi: OpenAI Whisper (transkripsiyon) + Claude Haiku (yapısal çıkarım).
 * AI öneri verir; asıl kayıt mevcut production akışından geçer (§11.1, §2.3).
 *
 * V2 scope: çoklu ürün tek seste, global session notu.
 */

import Anthropic from "@anthropic-ai/sdk";
import { sanitizeAiInput, clampConfidence, sanitizeAiOutput } from "@/lib/ai-guards";
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
    fireNotes: string;         // "fire: N adet" veya "" — sadece fire/hurda bilgisi
    confidence: number;        // 0-1
}

export interface VoiceExtractionResult {
    entries: VoiceProductionEntry[];
    sessionNote: string;  // tüm kayda ait genel not
    rawText: string;
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
- Ürün listesinden eşleşen TÜM ürünleri bul. Her ürün için ayrı bir entry oluştur.
- Tek ürün varsa tek entry, birden fazla ürün varsa birden fazla entry döndür.
- Eşleşme yoksa productId null, productName ham metin, productSku boş string döndür.
- Adet (quantity): pozitif tam sayı. Belirtilmemişse 1.
- "fire", "hurda", "ıskarta" kelimeleri ilgili ürünün fireNotes alanına "fire: N adet" formatında ekle.
- "not:", "not:" ile başlayan veya genel açıklama ifadeleri → sessionNote alanına yaz.
- fireNotes ve sessionNote: bilgi yoksa boş string.
- confidence: 0-1 arası float. Ürün eşleşmesi belirsizse düşük tut.
- SADECE JSON döndür, başka metin YOK.

Çıktı formatı (entries dizisi — tek ürün olsa bile dizi içinde):
{
  "entries": [
    {
      "productId": "uuid veya null",
      "productName": "eşleşen ürün adı veya ham metin",
      "productSku": "eşleşen SKU veya boş string",
      "quantity": 50,
      "fireNotes": "",
      "confidence": 0.95
    }
  ],
  "sessionNote": "genel not veya boş string"
}`;

/**
 * Claude Haiku ile transkripsyon metninden üretim verisi çıkarır.
 * V2: çoklu ürün (entries[]) + global session notu.
 */
export async function extractProductionData(
    transcription: string,
    products: ProductRef[],
): Promise<VoiceExtractionResult> {
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
            max_tokens: 1024,
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
        const cleaned = rawResponse.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
        parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
        logAiRun({ feature: "production_voice", input_hash: hashInput(safeText), confidence: 0, latency_ms: latencyMs, model: MODEL });
        throw new Error("Claude çıktısı JSON parse edilemedi.");
    }

    const knownIds = new Set(products.map(p => p.id));

    // entries[] parse — V1 tekil format fallback da destekleniyor
    const rawEntries = Array.isArray(parsed.entries)
        ? parsed.entries
        : [parsed]; // V1 compat: tekil nesne gelirse dizi yap

    const entries: VoiceProductionEntry[] = (rawEntries as Record<string, unknown>[]).map(e => ({
        productId: typeof e.productId === "string" && knownIds.has(e.productId) ? e.productId : null,
        productName: sanitizeAiOutput(e.productName, 200),
        productSku: sanitizeAiOutput(e.productSku, 50),
        quantity: typeof e.quantity === "number" && e.quantity > 0 ? Math.floor(e.quantity) : 1,
        fireNotes: sanitizeAiOutput(e.fireNotes, 200),
        confidence: clampConfidence(e.confidence),
    }));

    // Boş dizi fallback
    if (entries.length === 0) {
        entries.push({ productId: null, productName: "", productSku: "", quantity: 1, fireNotes: "", confidence: 0 });
    }

    const sessionNote = sanitizeAiOutput(parsed.sessionNote, 500);

    const avgConfidence = entries.reduce((s, e) => s + e.confidence, 0) / entries.length;

    logAiRun({
        feature: "production_voice",
        entity_id: entries[0].productId,
        input_hash: hashInput(safeText),
        confidence: avgConfidence,
        latency_ms: latencyMs,
        model: MODEL,
    });

    return { entries, sessionNote, rawText: safeText };
}

/**
 * Aktif ürün listesinden Whisper prompt metni oluşturur.
 */
export function buildWhisperPrompt(products: ProductRef[]): string {
    const terms = products.flatMap(p => [p.sku, p.name]).filter(Boolean);
    const unique = [...new Set(terms)];
    return unique.slice(0, 200).join(" "); // Whisper prompt max ~224 token
}

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
    category: string | null;
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

const SYSTEM_PROMPT = `Sen endüstriyel B2B vana firmasında üretim veri giriş asistanısın.
Kullanıcının sesli mesaj transkripsiyonundan ÜRETİM verisini çıkarıyorsun.

## Görev
Transkripsiyon metnini analiz et ve kullanıcının KASITLI OLARAK belirttiği her FARKLI ürün için BİR entry oluştur.

## Eşleştirme Kuralları (ÇOK ÖNEMLİ)

1. KULLANICI KAÇ ÜRÜN BELİRTTİYSE O KADAR ENTRY OLUŞTUR.
   - "50 adet DN50 PN16" → TEK ürün belirtilmiş → 1 entry
   - "30 DN50 PN16, 20 DN65 PN10" → İKİ farklı ürün belirtilmiş → 2 entry
   - "DN50" tek başına → TEK ürün belirtilmiş (belirsiz olsa bile) → 1 entry
   - ASLA "DN50" gördüğünde DN50 içeren tüm ürünleri listeleme!

2. Eşleştirme önceliği:
   a) SKU tam eşleşme → productId: eşleşen id, confidence 0.90+
   b) SKU + niteleyici bilgi (PN değeri, ürün tipi) birleşince tek ürüne daraltılabiliyorsa → productId: eşleşen id, confidence 0.85+
   c) Kısmi bilgi, birden fazla ürün eşleşebilir (sadece DN kodu, PN yok) → productId: null, productName: kullanıcının söylediği ham metin, confidence 0.30-0.50
   d) Hiç eşleşme yok → productId: null, confidence 0.10-0.20

3. BELİRSİZLİK KURALI:
   Kullanıcı kısmi bilgi verdiyse (ör. sadece "DN50" dedi, ama listede DN50 PN6, DN50 PN10, DN50 PN16 var):
   - BİR TANE entry oluştur (birden fazla DEĞİL!)
   - productId: null (birden fazla aday olduğu için kesin eşleşme yapılamaz)
   - productName: kullanıcının söylediği metin (ör. "DN50 vana")
   - productSku: kısmi eşleşen SKU prefix'i (ör. "DN50") veya boş string
   - confidence: 0.30-0.50 (belirsiz)
   Kullanıcı formda dropdown'dan doğru ürünü seçecek.

4. ÇOKLU ÜRÜN sadece kullanıcı AÇIKÇA birden fazla farklı ürün belirttiğinde:
   - Farklı DN kodları: "30 DN50, 20 DN65" → 2 entry (her biri kendi eşleşme kuralına tabi)
   - Aynı DN, farklı PN: "30 DN50 PN16, 20 DN50 PN10" → 2 entry
   - Farklı ürün tipleri: "50 sürgülü vana, 30 kelebek vana" → 2 entry
   - Virgül, "ve", "bir de", "ayrıca" gibi ayraçlarla ayrılmış farklı ürünler → ayrı entry'ler

## Confidence Puanlama

| Durum | Confidence | productId |
|-------|-----------|-----------|
| SKU tam eşleşme + miktar açık | 0.90 – 1.00 | eşleşen UUID |
| SKU eşleşme, miktar çıkarımla bulundu | 0.70 – 0.89 | eşleşen UUID |
| Kısmi eşleşme (birden fazla aday) | 0.30 – 0.50 | null |
| Çok belirsiz (sadece "vana") | 0.10 – 0.29 | null |
| Hiç eşleşme yok | 0.05 – 0.15 | null |

## Miktar (quantity)
- Pozitif tam sayı. Belirtilmemişse 1.
- Türkçe sayı kelimeleri: "elli" = 50, "yüz" = 100, "iki yüz" = 200
- "adet", "tane", "parça" miktarı niteler

## Fire / Hurda
- "fire", "hurda", "ıskarta", "bozuk", "hatalı" kelimeleri → ilgili ürünün fireNotes alanına
- Format: "fire: N adet"
- Fire miktarı quantity'den AYRIDIR (quantity üretilen toplam, fire onun içinden hatalı olanlar)
- Örnek: "100 adet DN50 PN16, 3 fire" → quantity: 100, fireNotes: "fire: 3 adet"

## Notlar
- "not:", "not olarak", "şunu not al", "açıklama" ile başlayan veya genel yorum ifadeleri → sessionNote
- sessionNote tüm kayıt için geçerli genel bir nottur (per-entry değil)

## Türkçe Ses Tanıma Düzeltmeleri
Whisper bazen teknik terimleri yanlış yazabilir. Bilinen düzeltmeler:
- "den elli", "de en elli", "d n elli" → DN50
- "pe en on altı", "pn on altı" → PN16
- "sürgili" → Sürgülü
- "kellebek" → Kelebek

## Çıktı Formatı
SADECE JSON döndür, başka metin YOK.
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
        .map(p => {
            const cat = p.category ? ` [${sanitizeAiInput(p.category, 30)}]` : "";
            return `${sanitizeAiInput(p.sku, 50)} — ${sanitizeAiInput(p.name, 100)}${cat} (id: ${p.id})`;
        })
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

    // Guard: prompt ihlali — Claude aynı kısmi SKU için çoklu null entry döndürdüyse tek entry'e collapse et
    // (örn. "DN50" için DN50 PN6, DN50 PN10, DN50 PN16 ayrı satır gelirse)
    const nullEntries = entries.filter(e => e.productId === null);
    if (nullEntries.length > 1) {
        const firstSku = nullEntries[0].productSku.toLowerCase();
        const allSameSku = nullEntries.every(e => e.productSku.toLowerCase() === firstSku);
        if (allSameSku) {
            const collapsed: VoiceProductionEntry = {
                productId: null,
                productName: nullEntries[0].productName,
                productSku: nullEntries[0].productSku,
                quantity: nullEntries.reduce((s, e) => s + e.quantity, 0),
                fireNotes: nullEntries.map(e => e.fireNotes).filter(Boolean).join("; "),
                confidence: Math.min(...nullEntries.map(e => e.confidence)),
            };
            const validEntries = entries.filter(e => e.productId !== null);
            entries.length = 0;
            entries.push(...validEntries, collapsed);
        }
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

/**
 * AI Service — domain-rules §11
 * Claude Haiku ile import parse + sipariş risk/confidence scoring.
 * AI öneri verir, sistem gerçeğini değiştiremez (§11.1).
 */

import Anthropic from "@anthropic-ai/sdk";
import { dbGetOrderById } from "@/lib/supabase/orders";
import { createServiceClient } from "@/lib/supabase/service";
import { logAiRun, hashInput } from "@/lib/supabase/ai-runs";
import {
    sanitizeAiInput,
    sanitizeAiInputRecord,
    clampConfidence,
    sanitizeAiOutput,
    capAiStringArray,
} from "@/lib/ai-guards";
import { normalizeColumnName } from "@/lib/supabase/column-mappings";
import { IMPORT_FIELD_NAMES } from "@/lib/import-fields";

export function isAIAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
}

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-haiku-4-5-20251001";

// ── Parse ─────────────────────────────────────────────────────

export interface ParseEntityInput {
    raw_text: string;
    entity_type: "customer" | "product" | "order";
}

export interface ParseEntityResult {
    parsed_data: Record<string, unknown>;
    confidence: number;
    ai_reason: string;
    unmatched_fields: string[];
}

const PARSE_SYSTEM: Record<string, string> = {
    customer: `You are a data extraction assistant for a B2B ERP system.
Extract customer fields from the raw text and return ONLY a JSON object with these keys (omit missing fields):
{ "name": string, "email": string, "phone": string, "country": string (ISO 2-letter), "currency": string (ISO 3-letter), "tax_number": string, "tax_office": string, "address": string, "notes": string }
After the JSON, on a new line starting with "CONFIDENCE:", give a float 0-1 and then "REASON:" a short explanation in Turkish.
Also add "UNMATCHED:" a comma-separated list of any fields you could not extract.`,
    product: `You are a data extraction assistant for a B2B ERP system.
Extract product fields from the raw text and return ONLY a JSON object with these keys (omit missing fields):
{ "name": string, "sku": string, "category": string, "unit": string, "price": number, "currency": string (ISO 3-letter), "min_stock_level": number, "material_quality": string, "production_site": string, "use_cases": string, "industries": string, "standards": string, "certifications": string, "product_notes": string }
After the JSON, on a new line starting with "CONFIDENCE:", give a float 0-1 and then "REASON:" a short explanation in Turkish.
Also add "UNMATCHED:" a comma-separated list of any fields you could not extract.`,
    order: `You are a data extraction assistant for a B2B ERP system.
Extract order fields from the raw text and return ONLY a JSON object with these keys (omit missing fields):
{ "customer_name": string, "currency": string (ISO 3-letter), "notes": string, "lines": [{ "product_name": string, "quantity": number, "unit_price": number, "discount_pct": number }] }
After the JSON, on a new line starting with "CONFIDENCE:", give a float 0-1 and then "REASON:" a short explanation in Turkish.
Also add "UNMATCHED:" a comma-separated list of any fields you could not extract.`,
};

/**
 * Advisory-only — domain-rules §11.1.
 * Writes: parsed_data, confidence, ai_reason, unmatched_fields (non-authoritative).
 * Approval gate: user confirms/rejects each ImportDraft before entity creation.
 */
export function parseAIResponse(text: string): { parsed_data: Record<string, unknown>; confidence: number; ai_reason: string; unmatched_fields: string[] } {
    // Extract JSON block
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let parsed_data: Record<string, unknown> = {};
    if (jsonMatch) {
        try { parsed_data = JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
    }

    // Extract confidence (G2 — clamped via clampConfidence)
    const confMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);
    const confidence = clampConfidence(confMatch ? parseFloat(confMatch[1]) : 0.5);

    // Extract reason (output cap — 300 chars)
    const reasonMatch = text.match(/REASON:\s*([^\n]+)/);
    const ai_reason = reasonMatch ? sanitizeAiOutput(reasonMatch[1].trim(), 300) : "";

    // Extract unmatched
    const unmatchedMatch = text.match(/UNMATCHED:\s*(.+?)$/im);
    const unmatched_fields = unmatchedMatch
        ? unmatchedMatch[1].split(",").map(s => s.trim()).filter(Boolean)
        : [];

    return { parsed_data, confidence, ai_reason, unmatched_fields };
}

/**
 * Advisory-only — domain-rules §11.1.
 * Writes: parsed_data, confidence, ai_reason, unmatched_fields (non-authoritative).
 * Approval gate: user confirms/rejects each ImportDraft before entity creation.
 */
export async function aiParseEntity(input: ParseEntityInput): Promise<ParseEntityResult> {
    const systemPrompt = PARSE_SYSTEM[input.entity_type];
    if (!systemPrompt) throw new Error(`Unknown entity_type: ${input.entity_type}`);

    if (!isAIAvailable()) {
        return { parsed_data: {}, confidence: 0, ai_reason: "AI servisi yapılandırılmamış", unmatched_fields: ["all"] };
    }

    const t0 = Date.now();
    try {
        const message = await client.messages.create({
            model: MODEL,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: "user", content: sanitizeAiInput(input.raw_text) }],
        });

        const text = message.content
            .filter(c => c.type === "text")
            .map(c => (c as { type: "text"; text: string }).text)
            .join("\n");

        const result = parseAIResponse(text);
        void logAiRun({
            feature: "import_parse",
            entity_id: null,
            input_hash: hashInput(input.raw_text),
            confidence: result.confidence,
            latency_ms: Date.now() - t0,
            model: MODEL,
        });
        return result;
    } catch (err) {
        console.error("[AI Parse] graceful degradation:", err);
        return {
            parsed_data: {},
            confidence: 0,
            ai_reason: "AI servisi yanıt veremedi",
            unmatched_fields: ["all"],
        };
    }
}

// ── Batch Parse ─────────────────────────────────────────────

export interface BatchParseInput {
    entity_type: "customer" | "product" | "order";
    rows: Array<Record<string, string>>;
}

export interface BatchParseResult {
    items: Array<{
        parsed_data: Record<string, unknown>;
        confidence: number;
        ai_reason: string;
        unmatched_fields: string[];
    }>;
}

const BATCH_PARSE_SYSTEM: Record<string, string> = {
    customer: `You are a data extraction assistant for a B2B ERP system.
You will receive a JSON array of rows from an Excel file. Each row is an object with column headers as keys.
For each row, extract customer fields and return a JSON array with objects containing these keys (omit missing fields):
{ "name": string, "email": string, "phone": string, "country": string (ISO 2-letter or full name), "currency": string (ISO 3-letter), "tax_number": string, "tax_office": string, "address": string, "notes": string }

Return ONLY a JSON object in this exact format:
{
  "items": [
    { "parsed_data": {...}, "confidence": 0.85, "ai_reason": "...", "unmatched_fields": ["field1"] },
    ...
  ]
}
Each item corresponds to one input row in order. Confidence is 0-1. ai_reason is a short explanation in Turkish. unmatched_fields lists column names that could not be mapped.`,

    product: `You are a data extraction assistant for a B2B ERP system.
You will receive a JSON array of rows from an Excel file. Each row is an object with column headers as keys.
For each row, extract product fields and return a JSON array with objects containing these keys (omit missing fields):
{ "name": string, "sku": string, "category": string, "unit": string, "price": number, "currency": string (ISO 3-letter), "min_stock_level": number, "material_quality": string, "production_site": string, "use_cases": string, "industries": string, "standards": string, "certifications": string, "product_notes": string }

Return ONLY a JSON object in this exact format:
{
  "items": [
    { "parsed_data": {...}, "confidence": 0.85, "ai_reason": "...", "unmatched_fields": ["field1"] },
    ...
  ]
}
Each item corresponds to one input row in order. Confidence is 0-1. ai_reason is a short explanation in Turkish. unmatched_fields lists column names that could not be mapped.`,

    order: `You are a data extraction assistant for a B2B ERP system.
You will receive a JSON array of rows from an Excel file. Each row is an object with column headers as keys.
For each row, extract order fields and return a JSON array with objects containing these keys (omit missing fields):
{ "customer_name": string, "currency": string (ISO 3-letter), "grand_total": number, "notes": string }

Return ONLY a JSON object in this exact format:
{
  "items": [
    { "parsed_data": {...}, "confidence": 0.85, "ai_reason": "...", "unmatched_fields": ["field1"] },
    ...
  ]
}
Each item corresponds to one input row in order. Confidence is 0-1. ai_reason is a short explanation in Turkish. unmatched_fields lists column names that could not be mapped.`,
};

/**
 * Simple column-name → field-name fallback when AI is unavailable.
 * Maps Turkish Excel column names to ERP field names.
 */
export const FALLBACK_FIELD_MAP: Record<string, Record<string, string>> = {
    customer: {
        firma_adi: "name", musteri_adi: "name", ad: "name", isim: "name",
        email: "email", eposta: "email", e_posta: "email",
        telefon: "phone", tel: "phone",
        ulke: "country", ülke: "country",
        para_birimi: "currency", para_birimi_tercihi: "currency",
        vergi_no: "tax_number", vergi_numarasi: "tax_number",
        vergi_dairesi: "tax_office",
        adres: "address",
        notlar: "notes", not: "notes",
        odeme_vadesi_gun: "payment_terms_days",
        incoterm_tercihi: "default_incoterm",
        musteri_kodu: "customer_code",
    },
    product: {
        urun_adi: "name", ad: "name", isim: "name",
        urun_kodu: "sku", sku: "sku",
        kategori: "category",
        olcu_birimi: "unit", birim: "unit",
        liste_fiyati_usd: "price", fiyat: "price", liste_fiyati: "price",
        para_birimi: "currency",
        min_siparis_miktari: "min_stock_level", guvenlik_stogu: "min_stock_level",
        urun_ailesi: "product_family",
        alt_kategori: "sub_category",
        sektor_uygunlugu: "sector_compatibility",
        standart_maliyet_usd: "cost_price",
        birim_agirlik_kg: "weight_kg",
        malzeme_kalitesi: "material_quality", malzeme: "material_quality",
        uretim_tesisi: "production_site", tesis: "production_site",
        kullanim_alanlari: "use_cases", kullanim: "use_cases",
        sektorler: "industries",
        standartlar: "standards",
        sertifikalar: "certifications",
        urun_notlari: "product_notes", notlar: "product_notes",
    },
    order: {
        musteri_kodu: "customer_code", musteri_adi: "customer_name", firma_adi: "customer_name",
        para_birimi: "currency",
        toplam_tutar_usd: "grand_total", toplam_tutar: "grand_total", tutar: "grand_total",
        notlar: "notes", not: "notes",
        incoterm: "incoterm",
        planlanan_sevk_tarihi: "planned_shipment_date",
        teklif_no: "quote_number",
        siparis_no: "original_order_number",
    },
    order_line: {
        siparis_no: "order_number",
        urun_kodu: "product_sku",
        miktar: "quantity",
        birim: "unit",
        birim_fiyat_usd: "unit_price",
        toplam_tutar_usd: "line_total",
    },
    quote: {
        teklif_no: "quote_number",
        teklif_tarihi: "quote_date",
        musteri_kodu: "customer_code",
        para_birimi: "currency",
        incoterm: "incoterm",
        gecerlilik_gun: "validity_days",
        toplam_tutar_usd: "total_amount",
    },
    shipment: {
        sevkiyat_no: "shipment_number",
        siparis_no: "order_number",
        sevkiyat_tarihi: "shipment_date",
        tasima_turu: "transport_type",
        net_agirlik_kg: "net_weight_kg",
        brut_agirlik_kg: "gross_weight_kg",
    },
    invoice: {
        fatura_no: "invoice_number",
        fatura_tarihi: "invoice_date",
        siparis_no: "order_number",
        musteri_kodu: "customer_code",
        para_birimi: "currency",
        fatura_tutari_para_birimi: "amount",
        vade_tarihi: "due_date",
    },
    payment: {
        tahsilat_no: "payment_number",
        fatura_no: "invoice_number",
        tahsilat_tarihi: "payment_date",
        tahsil_edilen_tutar_usd: "amount",
        odeme_yontemi: "payment_method",
    },
};

export function fallbackParseRow(
    row: Record<string, string>,
    entityType: string,
): { parsed_data: Record<string, unknown>; unmatched_fields: string[] } {
    const fieldMap = FALLBACK_FIELD_MAP[entityType] ?? {};
    const parsed_data: Record<string, unknown> = {};
    const unmatched_fields: string[] = [];

    for (const [col, value] of Object.entries(row)) {
        const normalized = col.toLowerCase().replace(/[^a-z0-9_]/g, "_");
        const erpField = fieldMap[normalized];
        if (erpField) {
            // Try to convert numeric values
            const num = Number(value);
            const NUMERIC_FIELDS = new Set([
                "price", "grand_total", "min_stock_level", "on_hand",
                "cost_price", "weight_kg", "payment_terms_days",
                "total_amount", "net_weight_kg", "gross_weight_kg",
                "amount", "validity_days", "quantity", "unit_price", "line_total",
            ]);
            parsed_data[erpField] = !isNaN(num) && value.trim() !== "" && NUMERIC_FIELDS.has(erpField)
                ? num
                : value;
        } else {
            unmatched_fields.push(col);
        }
    }

    return { parsed_data, unmatched_fields };
}

const CHUNK_SIZE = 20;

async function parseChunk(
    chunk: Array<Record<string, string>>,
    systemPrompt: string,
    entity_type: string,
): Promise<BatchParseResult["items"]> {
    try {
        const message = await client.messages.create({
            model: MODEL,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: JSON.stringify(chunk) }],
        });

        const text = message.content
            .filter(c => c.type === "text")
            .map(c => (c as { type: "text"; text: string }).text)
            .join("\n");

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed.items)) {
                return parsed.items.map((item: Record<string, unknown>) => ({
                    parsed_data: (item.parsed_data ?? {}) as Record<string, unknown>,
                    confidence: clampConfidence(item.confidence),
                    ai_reason: sanitizeAiOutput(typeof item.ai_reason === "string" ? item.ai_reason : "", 300),
                    unmatched_fields: Array.isArray(item.unmatched_fields)
                        ? (item.unmatched_fields as unknown[]).slice(0, 50)
                        : [],
                }));
            }
        }
        // JSON parse başarısız — chunk fallback
        return chunk.map(row => {
            const { parsed_data, unmatched_fields } = fallbackParseRow(row, entity_type);
            return { parsed_data, confidence: 0.5, ai_reason: "AI yanıtı ayrıştırılamadı — fallback eşleştirme", unmatched_fields };
        });
    } catch {
        return chunk.map(row => {
            const { parsed_data, unmatched_fields } = fallbackParseRow(row, entity_type);
            return { parsed_data, confidence: 0.5, ai_reason: "AI servisi yanıt veremedi — fallback eşleştirme", unmatched_fields };
        });
    }
}

/**
 * Advisory-only — domain-rules §11.1.
 * Writes: parsed_data, confidence, ai_reason, unmatched_fields per row (non-authoritative).
 * Approval gate: user confirms/rejects each ImportDraft before entity creation.
 */
export async function aiBatchParse(input: BatchParseInput): Promise<BatchParseResult> {
    const { entity_type, rows } = input;

    // Fallback when AI is not available
    if (!isAIAvailable()) {
        return {
            items: rows.map(row => {
                const { parsed_data, unmatched_fields } = fallbackParseRow(row, entity_type);
                return {
                    parsed_data,
                    confidence: 0.5,
                    ai_reason: "AI devre dışı — doğrudan kolon eşleştirmesi",
                    unmatched_fields,
                };
            }),
        };
    }

    const systemPrompt = BATCH_PARSE_SYSTEM[entity_type];
    if (!systemPrompt) {
        return {
            items: rows.map(row => {
                const { parsed_data, unmatched_fields } = fallbackParseRow(row, entity_type);
                return {
                    parsed_data,
                    confidence: 0.5,
                    ai_reason: `Desteklenmeyen entity tipi: ${entity_type}`,
                    unmatched_fields,
                };
            }),
        };
    }

    // G1 — Sanitize all string fields before they reach the AI prompt (§12 guardrail)
    const sanitizedRows = rows.map(row => sanitizeAiInputRecord(row));

    const t0 = Date.now();
    const chunks: Array<Array<Record<string, string>>> = [];
    for (let i = 0; i < sanitizedRows.length; i += CHUNK_SIZE) {
        chunks.push(sanitizedRows.slice(i, i + CHUNK_SIZE));
    }

    const allItems: BatchParseResult["items"] = [];
    for (const chunk of chunks) {
        const items = await parseChunk(chunk, systemPrompt, entity_type);
        allItems.push(...items);
    }

    const avgConfidence = allItems.length > 0
        ? allItems.reduce((sum, item) => sum + item.confidence, 0) / allItems.length
        : null;
    void logAiRun({
        feature: "import_parse",
        entity_id: null,
        input_hash: hashInput(JSON.stringify(sanitizedRows)),
        confidence: avgConfidence,
        latency_ms: Date.now() - t0,
        model: MODEL,
    });

    return { items: allItems };
}

// ── Column Detection ─────────────────────────────────────────

export interface ColumnDetectionInput {
    headers: string[];
    sampleRows: Array<Record<string, string>>;  // first 3-5 rows
    entityType: string;
    pastMappings?: Array<{ source_column: string; target_field: string; success_count: number }>;
}

export interface ColumnDetectionResult {
    mappings: Array<{
        source_column: string;
        target_field: string | null;   // null = could not map
        confidence: number;
    }>;
    usedAI: boolean;  // true = AI responded; false = fallback (AI unavailable or threw)
}

/**
 * Advisory-only — domain-rules §11.1.
 * Detects which ERP field each Excel column maps to.
 * One AI call per sheet (not per row). Much cheaper than aiBatchParse.
 */
export async function aiDetectColumns(input: ColumnDetectionInput): Promise<ColumnDetectionResult> {
    const { headers, sampleRows, entityType, pastMappings = [] } = input;

    if (!isAIAvailable()) {
        // Fallback: use FALLBACK_FIELD_MAP
        const fieldMap = FALLBACK_FIELD_MAP[entityType] ?? {};
        return {
            usedAI: false,
            mappings: headers.map(h => {
                const norm = normalizeColumnName(h);
                return { source_column: h, target_field: fieldMap[norm] ?? null, confidence: fieldMap[norm] ? 0.8 : 0 };
            }),
        };
    }

    // Build few-shot context from past successful mappings
    const pastContext = pastMappings.length > 0
        ? "\nGeçmiş başarılı eşleştirmeler:\n" +
          pastMappings.map(m => `- "${m.source_column}" → ${m.target_field} (${m.success_count} başarılı kullanım)`).join("\n")
        : "";

    const availableFields = (IMPORT_FIELD_NAMES[entityType] ?? []).join(", ");

    // Sample data as compact string
    const sampleStr = JSON.stringify(
        sampleRows.slice(0, 3).map(row =>
            Object.fromEntries(
                headers.slice(0, 20).map(h => [h, sanitizeAiInput(row[h] ?? "", 100)])
            )
        )
    );

    const prompt = `Bir B2B ERP sistemi için Excel kolon adlarını ERP alanlarına eşleştir.
${pastContext}

Entity türü: ${entityType}
Mevcut ERP alanları: ${availableFields}

Kolon adları: ${JSON.stringify(headers.slice(0, 30))}

İlk 3 satır örneği:
${sampleStr}

Sadece JSON döndür — başka metin yok:
[{"source_column": "...", "target_field": "...", "confidence": 0.0-1.0}, ...]

Kurallar:
- target_field mutlaka yukarıdaki ERP alanlarından biri olmalı
- Eşleşme yoksa target_field: null
- confidence: 0-1 arası float`;

    try {
        const message = await client.messages.create({
            model: MODEL,
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
        });

        const text = message.content
            .filter(c => c.type === "text")
            .map(c => (c as { type: "text"; text: string }).text)
            .join("\n");

        const arrMatch = text.match(/\[[\s\S]*\]/);
        if (arrMatch) {
            const parsed = JSON.parse(arrMatch[0]) as Array<{ source_column: string; target_field: string | null; confidence: number }>;
            if (Array.isArray(parsed)) {
                return {
                    usedAI: true,
                    mappings: parsed.map(item => ({
                        source_column: typeof item.source_column === "string" ? item.source_column : "",
                        target_field: typeof item.target_field === "string" && item.target_field.length > 0 ? item.target_field : null,
                        confidence: clampConfidence(typeof item.confidence === "number" ? item.confidence : 0.5),
                    })),
                };
            }
        }
    } catch {
        // fall through to fallback
    }

    // Fallback if AI fails
    const fieldMap = FALLBACK_FIELD_MAP[entityType] ?? {};
    return {
        usedAI: false,
        mappings: headers.map(h => {
            const norm = normalizeColumnName(h);
            return { source_column: h, target_field: fieldMap[norm] ?? null, confidence: fieldMap[norm] ? 0.7 : 0 };
        }),
    };
}

// ── Ops Summary ──────────────────────────────────────────────

export interface OpsSummaryInput {
    criticalStockCount: number;
    warningStockCount: number;
    atRiskCount: number;
    topCriticalItems: { name: string; available: number; min: number; coverageDays: number | null }[];
    pendingOrderCount: number;
    approvedOrderCount: number;
    highRiskOrderCount: number;
    openAlertCount: number;
}

export interface OpsSummaryResult {
    summary: string;
    insights: string[];
    anomalies: string[];
    confidence: number;
    generatedAt: string;
}

const OPS_SUMMARY_SYSTEM = `Sen endüstriyel ERP operasyon asistanısın. B2B vana satışı yapan bir firmanın stok, sipariş ve tedarik durumunu analiz ediyorsun.

Görev: Verilen metrikleri analiz et, kısa ve aksiyon odaklı bir operasyon özeti üret.

SADECE aşağıdaki JSON formatında cevap ver, başka hiçbir şey yazma:
{
  "summary": "2-3 cümlelik genel durum değerlendirmesi",
  "insights": ["aksiyon maddesi 1", "aksiyon maddesi 2", "aksiyon maddesi 3"],
  "anomalies": ["tespit edilen anormallik 1"]
}

Anomali örnekleri:
- Çok fazla kritik stok uyarısı (toplam ürünün %30'undan fazlası)
- Bekleyen sipariş sayısı onaylananlardan çok fazla (operasyonel darboğaz)
- Stok tükenme süresi tedarik süresinden kısa olan ürünler
- Açık alert sayısı çok yüksek (yığılma riski)

Kurallar:
- Türkçe yaz
- Kısa ve net ol, jargon kullanma
- Her insight aksiyon içersin ("şunu yapın", "bunu kontrol edin")
- Anomali yoksa boş dizi döndür []
- En fazla 5 insight, en fazla 3 anomali
- Dolgu cümlesi yazma ("genel olarak iyi durumda" gibi) — sadece aksiyon gerektiren konulardan bahset
- Insight'ları aciliyet sırasına göre sırala (en acil olan ilk)
- Her şey normalse summary'yi tek kısa cümleyle bitir, insights ve anomalies boş dizi olsun`;

/**
 * Advisory-only — domain-rules §11.1.
 * Writes: summary, insights, anomalies (non-authoritative, ephemeral — no DB mutation).
 * Approval gate: display-only; user navigates from insights manually.
 */
export async function aiGenerateOpsSummary(input: OpsSummaryInput): Promise<OpsSummaryResult> {
    const now = new Date().toISOString();

    if (!isAIAvailable()) {
        return { summary: "", insights: [], anomalies: [], confidence: 0, generatedAt: now };
    }

    const t0 = Date.now();
    try {
        const sanitizedInput = {
            ...input,
            topCriticalItems: input.topCriticalItems.map(item => ({
                ...item,
                name: sanitizeAiInput(item.name, 200),
            })),
        };
        const message = await client.messages.create({
            model: MODEL,
            max_tokens: 512,
            system: OPS_SUMMARY_SYSTEM,
            messages: [{ role: "user", content: JSON.stringify(sanitizedInput) }],
        });

        const text = message.content
            .filter(c => c.type === "text")
            .map(c => (c as { type: "text"; text: string }).text)
            .join("\n");

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            void logAiRun({
                feature: "ops_summary",
                entity_id: null,
                input_hash: hashInput(JSON.stringify(input)),
                confidence: 0.75,
                latency_ms: Date.now() - t0,
                model: MODEL,
            });
            return {
                summary: sanitizeAiOutput(parsed.summary ?? "", 800),
                insights: capAiStringArray(parsed.insights, 5),
                anomalies: capAiStringArray(parsed.anomalies, 3),
                confidence: 0.75,
                generatedAt: now,
            };
        }

        return { summary: "", insights: [], anomalies: [], confidence: 0, generatedAt: now };
    } catch (err) {
        console.error("[AI OpsSummary] graceful degradation:", err);
        return { summary: "", insights: [], anomalies: [], confidence: 0, generatedAt: now };
    }
}

// ── Stock Risk ────────────────────────────────────────────────

export interface StockRiskItem {
    productId: string;
    productName: string;
    sku: string;
    available: number;
    min: number;
    dailyUsage: number;
    coverageDays: number;
    leadTimeDays: number | null;
    riskLevel: "coverage_risk" | "approaching_critical";
    deterministicReason: string;
}

export interface StockRiskAssessment {
    productId: string;
    explanation: string;
    recommendation: string;
    confidence: number;
}

export interface StockRiskResult {
    assessments: StockRiskAssessment[];
    generatedAt: string;
}

const STOCK_RISK_SYSTEM = `Sen endüstriyel ERP stok risk analiz asistanısın. B2B vana satışı yapan bir firmanın ileriye dönük stok risklerini değerlendiriyorsun.

Görev: Verilen her ürün için kısa bir risk açıklaması ve somut bir öneri üret.

SADECE aşağıdaki JSON formatında cevap ver, başka hiçbir şey yazma:
{
  "assessments": [
    {
      "productId": "uuid-string",
      "explanation": "Neden riskli olduğuna dair 1-2 cümle",
      "recommendation": "Ne yapılması gerektiğine dair somut aksiyon",
      "confidence": 0.80
    }
  ]
}

Kurallar:
- Türkçe yaz
- Her ürün için maksimum 2 cümle (explanation + recommendation toplam)
- Somut aksiyonlar yaz ("sipariş verin", "tedarikçiyi arayın" gibi)
- Sahte kesinlik kullanma — eğer veri yetersizse bunu belirt
- confidence kuralları:
  - dailyUsage ve leadTimeDays ikisi de varsa: 0.75–0.90
  - sadece dailyUsage varsa (leadTimeDays yok): 0.50–0.70
- Her ürün için tam olarak bir assessment döndür`;

/**
 * Advisory-only — domain-rules §11.1.
 * Writes: explanation, recommendation, confidence per product (non-authoritative, ephemeral).
 * Approval gate: display-only; deterministic riskLevel is the operational truth.
 */
export async function aiAssessStockRisk(items: StockRiskItem[]): Promise<StockRiskResult> {
    const now = new Date().toISOString();

    if (!isAIAvailable()) {
        return { assessments: [], generatedAt: now };
    }

    if (items.length === 0) {
        return { assessments: [], generatedAt: now };
    }

    const t0 = Date.now();
    try {
        const sanitizedItems = items.map(item => ({
            ...item,
            productName: sanitizeAiInput(item.productName, 200),
            sku: sanitizeAiInput(item.sku, 100),
            deterministicReason: sanitizeAiInput(item.deterministicReason, 300),
        }));
        const message = await client.messages.create({
            model: MODEL,
            max_tokens: 1024,
            system: STOCK_RISK_SYSTEM,
            messages: [{ role: "user", content: JSON.stringify(sanitizedItems) }],
        });

        const text = message.content
            .filter(c => c.type === "text")
            .map(c => (c as { type: "text"; text: string }).text)
            .join("\n");

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed.assessments)) {
                const assessments = parsed.assessments.map((a: Record<string, unknown>) => ({
                    productId: sanitizeAiOutput(typeof a.productId === "string" ? a.productId : "", 100),
                    explanation: sanitizeAiOutput(typeof a.explanation === "string" ? a.explanation : "", 500),
                    recommendation: sanitizeAiOutput(typeof a.recommendation === "string" ? a.recommendation : "", 500),
                    confidence: clampConfidence(a.confidence),
                }));
                const avgConf = assessments.length > 0
                    ? assessments.reduce((s: number, a: { confidence: number }) => s + a.confidence, 0) / assessments.length
                    : null;
                void logAiRun({
                    feature: "stock_risk",
                    entity_id: null,
                    input_hash: hashInput(JSON.stringify(items)),
                    confidence: avgConf,
                    latency_ms: Date.now() - t0,
                    model: MODEL,
                });
                return { assessments, generatedAt: now };
            }
        }

        return { assessments: [], generatedAt: now };
    } catch (err) {
        console.error("[AI StockRisk] graceful degradation:", err);
        return { assessments: [], generatedAt: now };
    }
}

// ── Score ─────────────────────────────────────────────────────

export interface ScoreOrderResult {
    confidence: number;
    risk_level: "low" | "medium" | "high";
    reason: string;
}

const SCORE_SYSTEM = `Sen bir B2B ERP sipariş inceleme asistanısın. Endüstriyel vana satışı yapan bir firma için çalışıyorsun.

Görevin: Verilen sipariş JSON'ını inceleyerek, siparişin operasyonel açıdan manuel inceleme gerektirip gerektirmediğini değerlendir.

ÖNEMLİ: Bu bir ödeme riski veya dolandırıcılık tespiti DEĞİLDİR. Bu, siparişteki eksiklik, tutarsızlık veya olağandışı durumları tespit eden operasyonel bir inceleme değerlendirmesidir.

İnceleme faktörleri:
- Müşteri bilgisi eksikliği (ülke, vergi bilgisi, e-posta)
- Olağandışı yüksek iskonto oranı (>%15)
- Çok büyük veya çok küçük sipariş miktarları
- Büyük siparişlerde not/açıklama eksikliği
- Bilinmeyen veya alışılmadık para birimi
- Satır sayısına göre sipariş büyüklüğü tutarsızlığı

MUTLAKA TÜRKÇE YAZI. Her yanıtın REASON kısmı Türkçe olmak zorunda. İngilizce kesinlikle yasak.

SADECE aşağıdaki formatta cevap ver:
CONFIDENCE: <0-1 arası ondalık sayı>
RISK_LEVEL: <low|medium|high>
REASON: <TÜRKÇE, maksimum 2 cümle: birinci cümle durumu açıkla, ikinci cümle ne yapılması gerektiğini söyle>`;

/**
 * Advisory-only — domain-rules §11.1.
 * Writes: confidence, risk_level, reason (non-authoritative).
 * Approval gate: commercial_status transitions are human-only; ai_risk_level is advisory metadata.
 * G3: risk_level "high" without reason is downgraded to "medium".
 */
export function parseScoreResponse(text: string): ScoreOrderResult {
    const confMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);
    const riskMatch = text.match(/RISK_LEVEL:\s*(low|medium|high)/i);
    const reasonMatch = text.match(/REASON:\s*(.+?)$/im);

    const confidence = clampConfidence(confMatch ? parseFloat(confMatch[1]) : 0.5);
    const risk_level = (riskMatch ? riskMatch[1].toLowerCase() : "medium") as "low" | "medium" | "high";
    const reason = reasonMatch ? sanitizeAiOutput(reasonMatch[1].trim(), 400) : "";

    // G3 guardrail: high risk without any reason is suspicious — downgrade to medium
    const safeRiskLevel = (risk_level === "high" && !reason) ? "medium" : risk_level;

    return { confidence, risk_level: safeRiskLevel, reason };
}

// ── Purchase Copilot ──────────────────────────────────────────

export interface PurchaseSuggestionItem {
    productId: string;
    productName: string;
    sku: string;
    productType: "raw_material" | "finished";
    unit: string;
    available: number;
    min: number;
    dailyUsage: number | null;
    coverageDays: number | null;
    leadTimeDays: number | null;
    suggestQty: number;
    moq: number;
    targetStock: number;
    formula: "lead_time" | "fallback";
    leadTimeDemand: number | null;
    preferredVendor: string | null;
}

export interface PurchaseEnrichment {
    productId: string;
    whyNow: string;
    quantityRationale: string;
    urgencyLevel: "critical" | "high" | "moderate";
    confidence: number;
}

export interface PurchaseEnrichmentResult {
    enrichments: PurchaseEnrichment[];
    generatedAt: string;
}

const PURCHASE_COPILOT_SYSTEM = `Sen endüstriyel ERP satın alma asistanısın. B2B vana satışı yapan bir firmanın satın alma önerilerini zenginleştiriyorsun.

Görev: Verilen her ürün için neden şimdi satın alınması gerektiğini ve önerilen miktarın neden mantıklı olduğunu açıkla.

SADECE aşağıdaki JSON formatında cevap ver, başka hiçbir şey yazma:
{
  "enrichments": [
    {
      "productId": "uuid-string",
      "whyNow": "Neden şimdi satın alınması gerektiğine dair 1-2 cümle",
      "quantityRationale": "Önerilen miktarın neden mantıklı olduğuna dair 1-2 cümle",
      "urgencyLevel": "critical|high|moderate",
      "confidence": 0.80
    }
  ]
}

urgencyLevel kuralları:
- critical: coverageDays < 7 VEYA coverageDays < leadTimeDays
- high: coverageDays 7-14 arasında
- moderate: diğer durumlar (günlük kullanım verisi yoksa veya daha uzun süre varsa)

confidence kuralları:
- 0.75-0.90: dailyUsage ve leadTimeDays ikisi de varsa
- 0.50-0.70: sadece dailyUsage varsa (leadTimeDays yok)
- 0.30-0.50: ikisi de yoksa

Kurallar:
- Türkçe yaz
- Deterministik hesabı tekrarlama, yorumla ve bağlam ekle
- Somut, aksiyon odaklı cümleler yaz
- Sahte kesinlik kullanma — veri yetersizse bunu belirt
- Her ürün için tam olarak bir enrichment döndür`;

/**
 * Advisory-only — domain-rules §11.1.
 * Writes: whyNow, quantityRationale, urgencyLevel, confidence per product (non-authoritative).
 * Approval gate: user accepts/edits/rejects each suggestion before purchase order creation.
 */
export async function aiEnrichPurchaseSuggestions(items: PurchaseSuggestionItem[]): Promise<PurchaseEnrichmentResult> {
    const now = new Date().toISOString();

    if (!isAIAvailable()) {
        return { enrichments: [], generatedAt: now };
    }

    if (items.length === 0) {
        return { enrichments: [], generatedAt: now };
    }

    const t0 = Date.now();
    try {
        const sanitizedItems = items.map(item => ({
            ...item,
            productName: sanitizeAiInput(item.productName, 200),
            sku: sanitizeAiInput(item.sku, 100),
            preferredVendor: item.preferredVendor != null
                ? sanitizeAiInput(item.preferredVendor, 200)
                : null,
        }));
        const message = await client.messages.create({
            model: MODEL,
            max_tokens: 2048,
            system: PURCHASE_COPILOT_SYSTEM,
            messages: [{ role: "user", content: JSON.stringify(sanitizedItems) }],
        });

        const text = message.content
            .filter(c => c.type === "text")
            .map(c => (c as { type: "text"; text: string }).text)
            .join("\n");

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed.enrichments)) {
                const enrichments = parsed.enrichments.map((e: Record<string, unknown>) => ({
                    productId: sanitizeAiOutput(typeof e.productId === "string" ? e.productId : "", 100),
                    whyNow: sanitizeAiOutput(typeof e.whyNow === "string" ? e.whyNow : "", 500),
                    quantityRationale: sanitizeAiOutput(typeof e.quantityRationale === "string" ? e.quantityRationale : "", 500),
                    urgencyLevel: (e.urgencyLevel === "critical" || e.urgencyLevel === "high" || e.urgencyLevel === "moderate")
                        ? e.urgencyLevel
                        : "moderate",
                    confidence: clampConfidence(e.confidence),
                }));
                const avgConf = enrichments.length > 0
                    ? enrichments.reduce((s: number, e: { confidence: number }) => s + e.confidence, 0) / enrichments.length
                    : null;
                void logAiRun({
                    feature: "purchase_enrich",
                    entity_id: null,
                    input_hash: hashInput(JSON.stringify(items)),
                    confidence: avgConf,
                    latency_ms: Date.now() - t0,
                    model: MODEL,
                });
                return { enrichments, generatedAt: now };
            }
        }

        return { enrichments: [], generatedAt: now };
    } catch (err) {
        console.error("[AI PurchaseCopilot] graceful degradation:", err);
        return { enrichments: [], generatedAt: now };
    }
}

/**
 * Advisory-only — domain-rules §11.1.
 * Writes: ai_confidence, ai_reason, ai_risk_level, ai_model_version (non-authoritative).
 * Approval gate: commercial_status transitions are human-only and unaffected by AI score.
 */
export async function aiScoreOrder(orderId: string): Promise<ScoreOrderResult> {
    const order = await dbGetOrderById(orderId);
    if (!order) throw new Error("Sipariş bulunamadı.");

    if (!isAIAvailable()) {
        return { confidence: 0, risk_level: "medium", reason: "AI servisi yapılandırılmamış" };
    }

    const t0 = Date.now();
    try {
        const orderSummary = JSON.stringify({
            order_number: order.order_number,
            customer_name: sanitizeAiInput(order.customer_name ?? "", 200),
            customer_country: order.customer_country,
            currency: order.currency,
            grand_total: order.grand_total,
            commercial_status: order.commercial_status,
            notes: sanitizeAiInput(order.notes ?? "", 500),
            line_count: order.lines.length,
            lines: order.lines.map(l => ({
                product: sanitizeAiInput(l.product_name ?? "", 200),
                qty: l.quantity,
                unit_price: l.unit_price,
                discount_pct: l.discount_pct,
            })),
        });

        const message = await client.messages.create({
            model: MODEL,
            max_tokens: 256,
            system: SCORE_SYSTEM,
            messages: [{ role: "user", content: orderSummary }],
        });

        const text = message.content
            .filter(c => c.type === "text")
            .map(c => (c as { type: "text"; text: string }).text)
            .join("\n");

        const { confidence, risk_level, reason } = parseScoreResponse(text);

        // Persist to order record (§11.1 — non-authoritative, advisory only)
        const supabase = createServiceClient();
        await supabase.from("sales_orders").update({
            ai_confidence: confidence,
            ai_reason: reason,
            ai_model_version: MODEL,
            ai_risk_level: risk_level,
        }).eq("id", orderId);

        void logAiRun({
            feature: "order_score",
            entity_id: orderId,
            input_hash: hashInput(orderSummary),
            confidence,
            latency_ms: Date.now() - t0,
            model: MODEL,
        });

        return { confidence, risk_level, reason };
    } catch (err) {
        console.error("[AI Score] graceful degradation:", err);
        // Don't write to DB — don't overwrite a previous good score
        return { confidence: 0, risk_level: "medium", reason: "AI scoring unavailable" };
    }
}

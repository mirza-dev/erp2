/**
 * AI Service — domain-rules §11
 * Claude Haiku ile import parse + sipariş risk/confidence scoring.
 * AI öneri verir, sistem gerçeğini değiştiremez (§11.1).
 */

import Anthropic from "@anthropic-ai/sdk";
import { dbGetOrderById } from "@/lib/supabase/orders";
import { createServiceClient } from "@/lib/supabase/service";

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
{ "name": string, "sku": string, "category": string, "unit": string, "price": number, "currency": string (ISO 3-letter), "min_stock_level": number }
After the JSON, on a new line starting with "CONFIDENCE:", give a float 0-1 and then "REASON:" a short explanation in Turkish.
Also add "UNMATCHED:" a comma-separated list of any fields you could not extract.`,
    order: `You are a data extraction assistant for a B2B ERP system.
Extract order fields from the raw text and return ONLY a JSON object with these keys (omit missing fields):
{ "customer_name": string, "currency": string (ISO 3-letter), "notes": string, "lines": [{ "product_name": string, "quantity": number, "unit_price": number, "discount_pct": number }] }
After the JSON, on a new line starting with "CONFIDENCE:", give a float 0-1 and then "REASON:" a short explanation in Turkish.
Also add "UNMATCHED:" a comma-separated list of any fields you could not extract.`,
};

export function parseAIResponse(text: string): { parsed_data: Record<string, unknown>; confidence: number; ai_reason: string; unmatched_fields: string[] } {
    // Extract JSON block
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let parsed_data: Record<string, unknown> = {};
    if (jsonMatch) {
        try { parsed_data = JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
    }

    // Extract confidence
    const confMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);
    const confidence = confMatch ? parseFloat(confMatch[1]) : 0.5;

    // Extract reason
    const reasonMatch = text.match(/REASON:\s*([^\n]+)/);
    const ai_reason = reasonMatch ? reasonMatch[1].trim() : "";

    // Extract unmatched
    const unmatchedMatch = text.match(/UNMATCHED:\s*(.+?)$/im);
    const unmatched_fields = unmatchedMatch
        ? unmatchedMatch[1].split(",").map(s => s.trim()).filter(Boolean)
        : [];

    return { parsed_data, confidence, ai_reason, unmatched_fields };
}

export async function aiParseEntity(input: ParseEntityInput): Promise<ParseEntityResult> {
    const systemPrompt = PARSE_SYSTEM[input.entity_type];
    if (!systemPrompt) throw new Error(`Unknown entity_type: ${input.entity_type}`);

    if (!isAIAvailable()) {
        return { parsed_data: {}, confidence: 0, ai_reason: "AI servisi yapılandırılmamış", unmatched_fields: ["all"] };
    }

    try {
        const message = await client.messages.create({
            model: MODEL,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: "user", content: input.raw_text }],
        });

        const text = message.content
            .filter(c => c.type === "text")
            .map(c => (c as { type: "text"; text: string }).text)
            .join("\n");

        return parseAIResponse(text);
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
{ "name": string, "sku": string, "category": string, "unit": string, "price": number, "currency": string (ISO 3-letter), "min_stock_level": number }

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
const FALLBACK_FIELD_MAP: Record<string, Record<string, string>> = {
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
    },
    product: {
        urun_adi: "name", ad: "name", isim: "name",
        urun_kodu: "sku", sku: "sku",
        kategori: "category",
        olcu_birimi: "unit", birim: "unit",
        liste_fiyati_usd: "price", fiyat: "price", liste_fiyati: "price",
        para_birimi: "currency",
        min_siparis_miktari: "min_stock_level", guvenlik_stogu: "min_stock_level",
    },
    order: {
        musteri_kodu: "customer_name", musteri_adi: "customer_name", firma_adi: "customer_name",
        para_birimi: "currency",
        toplam_tutar_usd: "grand_total", toplam_tutar: "grand_total", tutar: "grand_total",
        notlar: "notes", not: "notes",
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
            parsed_data[erpField] = !isNaN(num) && value.trim() !== "" && ["price", "grand_total", "min_stock_level"].includes(erpField)
                ? num
                : value;
        } else {
            unmatched_fields.push(col);
        }
    }

    return { parsed_data, unmatched_fields };
}

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
        // Unsupported entity type — fallback
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

    try {
        const message = await client.messages.create({
            model: MODEL,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: JSON.stringify(rows) }],
        });

        const text = message.content
            .filter(c => c.type === "text")
            .map(c => (c as { type: "text"; text: string }).text)
            .join("\n");

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed.items)) {
                return {
                    items: parsed.items.map((item: Record<string, unknown>) => ({
                        parsed_data: (item.parsed_data ?? {}) as Record<string, unknown>,
                        confidence: typeof item.confidence === "number" ? item.confidence : 0.5,
                        ai_reason: typeof item.ai_reason === "string" ? item.ai_reason : "",
                        unmatched_fields: Array.isArray(item.unmatched_fields) ? item.unmatched_fields : [],
                    })),
                };
            }
        }

        // Could not parse AI response — fallback
        return {
            items: rows.map(row => {
                const { parsed_data, unmatched_fields } = fallbackParseRow(row, entity_type);
                return {
                    parsed_data,
                    confidence: 0.5,
                    ai_reason: "AI yanıtı ayrıştırılamadı — fallback eşleştirme",
                    unmatched_fields,
                };
            }),
        };
    } catch (err) {
        console.error("[AI BatchParse] graceful degradation:", err);
        return {
            items: rows.map(row => {
                const { parsed_data, unmatched_fields } = fallbackParseRow(row, entity_type);
                return {
                    parsed_data,
                    confidence: 0.5,
                    ai_reason: "AI servisi yanıt veremedi — fallback eşleştirme",
                    unmatched_fields,
                };
            }),
        };
    }
}

// ── Ops Summary ──────────────────────────────────────────────

export interface OpsSummaryInput {
    criticalStockCount: number;
    warningStockCount: number;
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

export async function aiGenerateOpsSummary(input: OpsSummaryInput): Promise<OpsSummaryResult> {
    const now = new Date().toISOString();

    if (!isAIAvailable()) {
        return { summary: "", insights: [], anomalies: [], confidence: 0, generatedAt: now };
    }

    try {
        const message = await client.messages.create({
            model: MODEL,
            max_tokens: 512,
            system: OPS_SUMMARY_SYSTEM,
            messages: [{ role: "user", content: JSON.stringify(input) }],
        });

        const text = message.content
            .filter(c => c.type === "text")
            .map(c => (c as { type: "text"; text: string }).text)
            .join("\n");

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                summary: parsed.summary ?? "",
                insights: Array.isArray(parsed.insights) ? parsed.insights : [],
                anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies : [],
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

export async function aiAssessStockRisk(items: StockRiskItem[]): Promise<StockRiskResult> {
    const now = new Date().toISOString();

    if (!isAIAvailable()) {
        return { assessments: [], generatedAt: now };
    }

    if (items.length === 0) {
        return { assessments: [], generatedAt: now };
    }

    try {
        const message = await client.messages.create({
            model: MODEL,
            max_tokens: 1024,
            system: STOCK_RISK_SYSTEM,
            messages: [{ role: "user", content: JSON.stringify(items) }],
        });

        const text = message.content
            .filter(c => c.type === "text")
            .map(c => (c as { type: "text"; text: string }).text)
            .join("\n");

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed.assessments)) {
                return {
                    assessments: parsed.assessments.map((a: Record<string, unknown>) => ({
                        productId: typeof a.productId === "string" ? a.productId : "",
                        explanation: typeof a.explanation === "string" ? a.explanation : "",
                        recommendation: typeof a.recommendation === "string" ? a.recommendation : "",
                        confidence: typeof a.confidence === "number" ? a.confidence : 0.5,
                    })),
                    generatedAt: now,
                };
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

SADECE aşağıdaki formatta cevap ver:
CONFIDENCE: <0-1 arası ondalık sayı>
RISK_LEVEL: <low|medium|high>
REASON: <Türkçe tek cümle — neyin inceleme gerektirdiğini açıkla>`;

export function parseScoreResponse(text: string): ScoreOrderResult {
    const confMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);
    const riskMatch = text.match(/RISK_LEVEL:\s*(low|medium|high)/i);
    const reasonMatch = text.match(/REASON:\s*(.+?)$/im);

    const confidence = confMatch ? parseFloat(confMatch[1]) : 0.5;
    const risk_level = (riskMatch ? riskMatch[1].toLowerCase() : "medium") as "low" | "medium" | "high";
    const reason = reasonMatch ? reasonMatch[1].trim() : "";

    return { confidence, risk_level, reason };
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

export async function aiEnrichPurchaseSuggestions(items: PurchaseSuggestionItem[]): Promise<PurchaseEnrichmentResult> {
    const now = new Date().toISOString();

    if (!isAIAvailable()) {
        return { enrichments: [], generatedAt: now };
    }

    if (items.length === 0) {
        return { enrichments: [], generatedAt: now };
    }

    try {
        const message = await client.messages.create({
            model: MODEL,
            max_tokens: 2048,
            system: PURCHASE_COPILOT_SYSTEM,
            messages: [{ role: "user", content: JSON.stringify(items) }],
        });

        const text = message.content
            .filter(c => c.type === "text")
            .map(c => (c as { type: "text"; text: string }).text)
            .join("\n");

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed.enrichments)) {
                return {
                    enrichments: parsed.enrichments.map((e: Record<string, unknown>) => ({
                        productId: typeof e.productId === "string" ? e.productId : "",
                        whyNow: typeof e.whyNow === "string" ? e.whyNow : "",
                        quantityRationale: typeof e.quantityRationale === "string" ? e.quantityRationale : "",
                        urgencyLevel: (e.urgencyLevel === "critical" || e.urgencyLevel === "high" || e.urgencyLevel === "moderate")
                            ? e.urgencyLevel
                            : "moderate",
                        confidence: typeof e.confidence === "number" ? e.confidence : 0.5,
                    })),
                    generatedAt: now,
                };
            }
        }

        return { enrichments: [], generatedAt: now };
    } catch (err) {
        console.error("[AI PurchaseCopilot] graceful degradation:", err);
        return { enrichments: [], generatedAt: now };
    }
}

export async function aiScoreOrder(orderId: string): Promise<ScoreOrderResult> {
    const order = await dbGetOrderById(orderId);
    if (!order) throw new Error("Sipariş bulunamadı.");

    if (!isAIAvailable()) {
        return { confidence: 0, risk_level: "medium", reason: "AI servisi yapılandırılmamış" };
    }

    try {
        const orderSummary = JSON.stringify({
            order_number: order.order_number,
            customer_name: order.customer_name,
            customer_country: order.customer_country,
            currency: order.currency,
            grand_total: order.grand_total,
            commercial_status: order.commercial_status,
            notes: order.notes,
            line_count: order.lines.length,
            lines: order.lines.map(l => ({
                product: l.product_name,
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

        return { confidence, risk_level, reason };
    } catch (err) {
        console.error("[AI Score] graceful degradation:", err);
        // Don't write to DB — don't overwrite a previous good score
        return { confidence: 0, risk_level: "medium", reason: "AI scoring unavailable" };
    }
}

/**
 * AI Service — domain-rules §11
 * Claude Haiku ile import parse + sipariş risk/confidence scoring.
 * AI öneri verir, sistem gerçeğini değiştiremez (§11.1).
 */

import Anthropic from "@anthropic-ai/sdk";
import { dbGetOrderById } from "@/lib/supabase/orders";
import { createServiceClient } from "@/lib/supabase/service";

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
After the JSON, on a new line starting with "CONFIDENCE:", give a float 0-1 and then "REASON:" a short explanation.
Also add "UNMATCHED:" a comma-separated list of any fields you could not extract.`,
    product: `You are a data extraction assistant for a B2B ERP system.
Extract product fields from the raw text and return ONLY a JSON object with these keys (omit missing fields):
{ "name": string, "sku": string, "category": string, "unit": string, "price": number, "currency": string (ISO 3-letter), "min_stock_level": number }
After the JSON, on a new line starting with "CONFIDENCE:", give a float 0-1 and then "REASON:" a short explanation.
Also add "UNMATCHED:" a comma-separated list of any fields you could not extract.`,
    order: `You are a data extraction assistant for a B2B ERP system.
Extract order fields from the raw text and return ONLY a JSON object with these keys (omit missing fields):
{ "customer_name": string, "currency": string (ISO 3-letter), "notes": string, "lines": [{ "product_name": string, "quantity": number, "unit_price": number, "discount_pct": number }] }
After the JSON, on a new line starting with "CONFIDENCE:", give a float 0-1 and then "REASON:" a short explanation.
Also add "UNMATCHED:" a comma-separated list of any fields you could not extract.`,
};

function parseAIResponse(text: string): { parsed_data: Record<string, unknown>; confidence: number; ai_reason: string; unmatched_fields: string[] } {
    // Extract JSON block
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
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
}

// ── Score ─────────────────────────────────────────────────────

export interface ScoreOrderResult {
    confidence: number;
    risk_level: "low" | "medium" | "high";
    reason: string;
}

const SCORE_SYSTEM = `You are a risk assessment assistant for a B2B ERP system selling industrial valves.
Given an order JSON, assess its risk and return ONLY this format:
CONFIDENCE: <float 0-1>
RISK_LEVEL: <low|medium|high>
REASON: <one sentence explanation>

Risk factors to consider: missing customer info, unusually high discount, very large or very small quantity, no notes for large orders, unknown currency.`;

export async function aiScoreOrder(orderId: string): Promise<ScoreOrderResult> {
    const order = await dbGetOrderById(orderId);
    if (!order) throw new Error("Sipariş bulunamadı.");

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

    const confMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);
    const riskMatch = text.match(/RISK_LEVEL:\s*(low|medium|high)/i);
    const reasonMatch = text.match(/REASON:\s*(.+?)$/im);

    const confidence = confMatch ? parseFloat(confMatch[1]) : 0.5;
    const risk_level = (riskMatch ? riskMatch[1].toLowerCase() : "medium") as "low" | "medium" | "high";
    const reason = reasonMatch ? reasonMatch[1].trim() : "";

    // Persist to order record (§11.1 — non-authoritative, advisory only)
    const supabase = createServiceClient();
    await supabase.from("sales_orders").update({
        ai_confidence: confidence,
        ai_reason: reason,
        ai_model_version: MODEL,
    }).eq("id", orderId);

    return { confidence, risk_level, reason };
}

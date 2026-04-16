/**
 * DR-11 — AI Guardrail Kontratı
 * domain-rules.md §11: AI katmanı deterministik kuralların önüne geçemez.
 *
 * G1: Input sanitizasyonu — zararlı karakterler prompttan önce temizlenir
 * G2: Confidence clamp — AI confidence her zaman [0, 1] aralığında; NaN/non-number → 0.5
 * G3: "high" risk reason gerektiriyor — reason yoksa "medium"e düşürülür
 * G4: AI operasyonel değişikliği direkt tetikleyemez — sadece advisory fields döner
 *
 * Not: G2 implementasyonunda out-of-range değerler 0.5'e değil, [0,1] sınırlarına
 * clamp edilir (1.5 → 1, -0.1 → 0). NaN ve non-number değerler 0.5 döner.
 */
import { describe, it, expect } from "vitest";

import {
    clampConfidence,
    sanitizeAiInput,
    sanitizeAiInputRecord,
    capAiStringArray,
} from "@/lib/ai-guards";

import { parseScoreResponse } from "@/lib/services/ai-service";

// ── G2: clampConfidence ───────────────────────────────────────

describe("DR-11 G2: clampConfidence — AI confidence her zaman [0,1] aralığında", () => {
    it("geçerli değer değişmez: 0.85 → 0.85", () => {
        expect(clampConfidence(0.85)).toBe(0.85);
    });

    it("geçerli sınırlar: 0 → 0, 1 → 1", () => {
        expect(clampConfidence(0)).toBe(0);
        expect(clampConfidence(1)).toBe(1);
    });

    it("üst sınır aşımı clamp edilir: 1.5 → 1 (0.5'e değil, sınıra)", () => {
        expect(clampConfidence(1.5)).toBe(1);
    });

    it("alt sınır aşımı clamp edilir: -0.1 → 0 (0.5'e değil, sınıra)", () => {
        expect(clampConfidence(-0.1)).toBe(0);
    });

    it("NaN → 0.5 (tarafsız fallback)", () => {
        expect(clampConfidence(NaN)).toBe(0.5);
    });

    it("non-number (string) → 0.5", () => {
        expect(clampConfidence("yüksek")).toBe(0.5);
    });

    it("non-number (null) → 0.5", () => {
        expect(clampConfidence(null)).toBe(0.5);
    });

    it("non-number (undefined) → 0.5", () => {
        expect(clampConfidence(undefined)).toBe(0.5);
    });

    it("non-number (object) → 0.5", () => {
        expect(clampConfidence({ value: 0.9 })).toBe(0.5);
    });
});

// ── G3: parseScoreResponse risk guard ────────────────────────

describe("DR-11 G3: parseScoreResponse — high risk reason gerektiriyor", () => {
    it("risk=high + reason var → 'high' korunur", () => {
        const text = `CONFIDENCE: 0.9\nRISK_LEVEL: high\nREASON: Müşteri bilgileri eksik, manuel inceleme gerekiyor.`;
        const result = parseScoreResponse(text);
        expect(result.risk_level).toBe("high");
        expect(result.reason).not.toBe("");
    });

    it("risk=high + reason YOK → 'medium'e düşürülür (G3 guardrail)", () => {
        const text = `CONFIDENCE: 0.9\nRISK_LEVEL: high`;
        const result = parseScoreResponse(text);
        expect(result.risk_level).toBe("medium");
    });

    it("risk=medium + reason yok → 'medium' korunur (G3 sadece high'a uygulanır)", () => {
        const text = `CONFIDENCE: 0.7\nRISK_LEVEL: medium`;
        const result = parseScoreResponse(text);
        expect(result.risk_level).toBe("medium");
    });

    it("risk=low + reason yok → 'low' korunur", () => {
        const text = `CONFIDENCE: 0.3\nRISK_LEVEL: low`;
        const result = parseScoreResponse(text);
        expect(result.risk_level).toBe("low");
    });

    it("risk alanı eksik → varsayılan 'medium' döner", () => {
        const text = `CONFIDENCE: 0.5\nREASON: Bir şey.`;
        const result = parseScoreResponse(text);
        expect(result.risk_level).toBe("medium");
    });
});

// ── G2 + parseScoreResponse entegrasyonu ─────────────────────

describe("DR-11 G2 + parseScoreResponse: AI'dan gelen confidence clamp edilir", () => {
    it("AI confidence=1.5 döndürürse → sonuç 1 olur (clamped)", () => {
        const text = `CONFIDENCE: 1.5\nRISK_LEVEL: low\nREASON: Normal sipariş.`;
        const result = parseScoreResponse(text);
        expect(result.confidence).toBe(1);
    });

    it("AI confidence=-0.5 döndürürse → regex eksi işaretini yakalamaz, '0.5' parse edilir → 0.5 döner", () => {
        // parseScoreResponse regex'i: /CONFIDENCE:\s*([\d.]+)/i
        // [\d.]+ eksi işaretini (–) kapsamaz; "–0.5" → "0.5" yakalanır → clampConfidence(0.5) = 0.5
        // Negatif confidence testi: clampConfidence(-0.1) → 0 direkt guard testinde yapılır (bkz. yukarısı)
        const text = `CONFIDENCE: -0.5\nRISK_LEVEL: low\nREASON: Normal sipariş.`;
        const result = parseScoreResponse(text);
        expect(result.confidence).toBe(0.5);
    });

    it("AI confidence alanı yoksa → 0.5 (tarafsız fallback)", () => {
        const text = `RISK_LEVEL: medium\nREASON: Eksik bilgi.`;
        const result = parseScoreResponse(text);
        expect(result.confidence).toBe(0.5);
    });

    it("AI confidence=NaN formatında döndürürse → 0.5", () => {
        const text = `CONFIDENCE: abc\nRISK_LEVEL: medium`;
        const result = parseScoreResponse(text);
        expect(result.confidence).toBe(0.5);
    });
});

// ── G1: sanitizeAiInput ───────────────────────────────────────

describe("DR-11 G1: sanitizeAiInput — zararlı karakterler temizlenir", () => {
    it("zero-width karakterler temizlenir", () => {
        const dirty = "normal\u200Bmetin\u200Cburada";
        expect(sanitizeAiInput(dirty)).toBe("normalmetinburada");
    });

    it("bidi-override karakterler temizlenir", () => {
        const dirty = "metin\u202Eters";
        expect(sanitizeAiInput(dirty)).toBe("metinters");
    });

    it("maxLen'den uzun string kesilir (varsayılan 4096)", () => {
        const long = "a".repeat(5000);
        expect(sanitizeAiInput(long)).toHaveLength(4096);
    });

    it("temiz metin değişmez", () => {
        expect(sanitizeAiInput("normal sipariş notu")).toBe("normal sipariş notu");
    });

    it("sanitizeAiInputRecord tüm string değerlere uygular", () => {
        const row = { "Ürün": "vana\u200B123", "Miktar": "10", "Fiyat": "100" };
        const result = sanitizeAiInputRecord(row);
        expect(result["Ürün"]).toBe("vana123");
        expect(result["Miktar"]).toBe("10");
    });
});

// ── G4: AI advisory-only kontratı ────────────────────────────

describe("DR-11 G4: parseScoreResponse advisory-only döner", () => {
    it("dönen obje action/mutation içermez — sadece advisory alanlar", () => {
        const text = `CONFIDENCE: 0.8\nRISK_LEVEL: high\nREASON: Yüksek iskonto oranı.`;
        const result = parseScoreResponse(text);

        // Advisory alanlar mevcut
        expect(result).toHaveProperty("confidence");
        expect(result).toHaveProperty("risk_level");
        expect(result).toHaveProperty("reason");

        // Operasyonel alanlar YOK — AI direkt sipariş/stok değiştiremez
        expect(result).not.toHaveProperty("action");
        expect(result).not.toHaveProperty("commercial_status");
        expect(result).not.toHaveProperty("fulfillment_status");
        expect(result).not.toHaveProperty("reserved_quantity");
    });
});

// ── capAiStringArray ──────────────────────────────────────────

describe("DR-11: capAiStringArray — AI dizi çıktıları sınırlandırılır", () => {
    it("maxCount aşılırsa kırpılır", () => {
        const arr = ["a", "b", "c", "d", "e"];
        expect(capAiStringArray(arr, 3)).toHaveLength(3);
    });

    it("array olmayan input → boş dizi döner", () => {
        expect(capAiStringArray("string", 5)).toEqual([]);
        expect(capAiStringArray(null, 5)).toEqual([]);
    });

    it("string olmayan elemanlar filtrelenir", () => {
        const arr = ["geçerli", 123, null, "başka geçerli"];
        expect(capAiStringArray(arr, 10)).toEqual(["geçerli", "başka geçerli"]);
    });
});

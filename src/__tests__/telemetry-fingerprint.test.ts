/**
 * Developer Console §6 — hata normalizasyonu ve gruplama.
 *
 * Bu modülün tek işi şu: "aynı kusur her patladığında AYNI anahtara düşsün,
 * farklı kusurlar AYRI anahtara". Testler bu iki yönü de sınar; yalnız
 * "fonksiyon bir string döndürüyor" demek gruplamayı doğrulamaz.
 */
import { describe, it, expect } from "vitest";
import {
    SEVERITIES,
    buildTitle,
    extractErrorType,
    fingerprintError,
    moduleFromEndpoint,
    normalizeMessage,
    severityFor,
    severityRank,
    topStackFrame,
} from "@/lib/telemetry/fingerprint";

const fp = (errorType: string, message: string, topFrame = "") =>
    fingerprintError({ errorType, normalizedMessage: normalizeMessage(message), topFrame });

describe("normalizeMessage — dinamik değerler yer tutucuya iner", () => {
    it("şartnamedeki örnek: User 123 failed → User {n} failed", () => {
        expect(normalizeMessage("User 123 failed")).toBe("User {n} failed");
        expect(normalizeMessage("User 456 failed")).toBe("User {n} failed");
        expect(normalizeMessage("User 789 failed")).toBe("User {n} failed");
    });

    it("uuid tek parça olarak inere — rakamları ayrı ayrı {n} olmaz", () => {
        const out = normalizeMessage("order 3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b not found");
        expect(out).toBe("order {uuid} not found");
        expect(out).not.toContain("{n}");
    });

    it("e-posta, ISO zaman ve uzun hex normalize edilir", () => {
        expect(normalizeMessage("mail to ali@firma.com bounced")).toBe("mail to {email} bounced");
        expect(normalizeMessage("expired at 2026-08-30T10:15:00.000Z")).toBe("expired at {ts}");
        expect(normalizeMessage("token deadbeefdeadbeefdead")).toBe("token {hex}");
    });

    it("tırnaklı serbest değer tek yer tutucu olur", () => {
        expect(normalizeMessage('Şablon "Vana 3/4" bulunamadı')).toBe("Şablon {str} bulunamadı");
        expect(normalizeMessage("Şablon 'Flanş 10' bulunamadı")).toBe("Şablon {str} bulunamadı");
    });

    it("Postgres benzersizlik ihlali gövdesi normalize olur", () => {
        const a = normalizeMessage("Key (quote_number)=(TKL-2026-001) already exists");
        const b = normalizeMessage("Key (quote_number)=(TKL-2026-002) already exists");
        expect(a).toBe(b);
    });

    it("boş/null güvenli", () => {
        expect(normalizeMessage(null)).toBe("");
        expect(normalizeMessage(undefined)).toBe("");
        expect(normalizeMessage("")).toBe("");
    });
});

describe("fingerprintError — gruplama sözleşmesi", () => {
    it("aynı kusur farklı parametrelerle AYNI parmak izine düşer", () => {
        expect(fp("Error", "User 123 failed")).toBe(fp("Error", "User 456 failed"));
    });

    it("farklı hata tipi AYRI parmak izi üretir", () => {
        expect(fp("TypeError", "boom")).not.toBe(fp("RangeError", "boom"));
    });

    it("farklı mesaj iskeleti AYRI parmak izi üretir", () => {
        expect(fp("Error", "User 1 failed")).not.toBe(fp("Error", "Order 1 failed"));
    });

    it("üst çerçeve ayrımı korunur — aynı mesaj farklı yerden gelirse ayrılır", () => {
        expect(fp("Error", "boom", "at a (src/x.ts)")).not.toBe(fp("Error", "boom", "at b (src/y.ts)"));
    });

    it("deterministik ve 16 hex karakter", () => {
        const once = fp("Error", "aynı girdi");
        expect(once).toMatch(/^[0-9a-f]{16}$/);
        expect(fp("Error", "aynı girdi")).toBe(once);
    });

    it("Türkçe karakterler çakışma üretmez", () => {
        expect(fp("Error", "şablon bulunamadı")).not.toBe(fp("Error", "sablon bulunamadi"));
    });
});

describe("topStackFrame — kendi kodumuzda birleş", () => {
    it("node_modules çerçevelerini atlar", () => {
        const stack = [
            "Error: boom",
            "    at Object.next (/app/node_modules/next/server.js:12:3)",
            "    at quoteAccept (/app/src/lib/services/quote-service.ts:88:9)",
        ].join("\n");
        expect(topStackFrame(stack)).toContain("quote-service.ts");
    });

    it("satır/sütun numarası düşer — build kayması grup bölmesin", () => {
        const a = topStackFrame("Error\n    at f (/app/src/a.ts:10:5)");
        const b = topStackFrame("Error\n    at f (/app/src/a.ts:40:9)");
        expect(a).toBe(b);
    });

    it("stack yoksa boş", () => {
        expect(topStackFrame(null)).toBe("");
    });
});

describe("extractErrorType", () => {
    it("Error sınıf adını alır", () => {
        expect(extractErrorType(new TypeError("x"))).toBe("TypeError");
    });

    it("Supabase düz nesnesinde SQLSTATE kodunu kullanır", () => {
        expect(extractErrorType({ message: "duplicate key", code: "23505" })).toBe("PG_23505");
    });

    it("tanınmayan değer UnknownError", () => {
        expect(extractErrorType("düz string")).toBe("UnknownError");
        expect(extractErrorType(null)).toBe("UnknownError");
    });
});

describe("severityFor — tek karar noktası (§8)", () => {
    it("yapılandırma hatası kritik (dağıtım bozuk, 500'ler arasında kaybolmasın)", () => {
        expect(severityFor({ errorType: "ConfigError", status: 503 })).toBe("critical");
        expect(severityFor({ message: "MISSING ENV: SUPABASE_URL" })).toBe("critical");
    });

    it("bağlantı hatası kritik", () => {
        expect(severityFor({ message: "connect ECONNREFUSED 10.0.0.1:5432" })).toBe("critical");
        expect(severityFor({ errorType: "PG_08006" })).toBe("critical");
    });

    it("5xx error, 4xx warning, 2xx info", () => {
        expect(severityFor({ status: 500 })).toBe("error");
        expect(severityFor({ status: 404 })).toBe("warning");
        expect(severityFor({ status: 200 })).toBe("info");
    });

    it("status bilinmiyorsa error (yakalanmış istisna sessizce info olmasın)", () => {
        expect(severityFor({})).toBe("error");
    });

    it("sıralama ağırlığı artan", () => {
        expect(severityRank("info")).toBeLessThan(severityRank("warning"));
        expect(severityRank("warning")).toBeLessThan(severityRank("error"));
        expect(severityRank("error")).toBeLessThan(severityRank("critical"));
        expect(SEVERITIES).toEqual(["info", "warning", "error", "critical"]);
    });
});

describe("moduleFromEndpoint", () => {
    it("api ve dashboard yollarında ikinci segmenti alır", () => {
        expect(moduleFromEndpoint("/api/quotes/[id]/accept")).toBe("quotes");
        expect(moduleFromEndpoint("/dashboard/purchase/orders")).toBe("purchase");
    });

    it("sorgu dizesi ve boş girdi güvenli", () => {
        expect(moduleFromEndpoint("/api/products?all=1")).toBe("products");
        expect(moduleFromEndpoint(null)).toBe("unknown");
        expect(moduleFromEndpoint("/")).toBe("unknown");
    });
});

describe("buildTitle", () => {
    it("tip + ilk satır, 200 karakterle sınırlı", () => {
        expect(buildTitle("TypeError", "boom\nikinci satır")).toBe("TypeError: boom");
        expect(buildTitle("Error", "x".repeat(400)).length).toBe(200);
    });

    it("mesaj yoksa yalnız tip", () => {
        expect(buildTitle("Error", null)).toBe("Error");
    });

    it("mesaj boşken çerçevedeki fonksiyon adına düşer", () => {
        // Canlı vaka (2026-08-30): boş mesajlı Supabase hatası başlığı düpedüz
        // "Error" olan bir grup üretmişti — listede ayırt edilemiyordu.
        expect(buildTitle("Error", "", "at dbCountOrdersByCommercialStatus (/app/x.js)"))
            .toBe("Error @ dbCountOrdersByCommercialStatus");
        expect(buildTitle("Error", null, "at async CustomersPage (/app/y.js)"))
            .toBe("Error @ CustomersPage");
    });

    it("çerçeve adsızsa eski davranış korunur (yalnız tip)", () => {
        expect(buildTitle("Error", null, "at /app/anon.js")).toBe("Error");
        expect(buildTitle("Error", null, "")).toBe("Error");
    });

    it("mesaj varsa çerçeve başlığı DEĞİŞTİRMEZ", () => {
        expect(buildTitle("TypeError", "boom", "at dbFoo (/app/x.js)")).toBe("TypeError: boom");
    });
});

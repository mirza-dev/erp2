import { SEVERITIES, type Severity } from "./console-types";

/**
 * Hata parmak izi + normalizasyon (Developer Console §6).
 *
 * Sorun: aynı kusur her seferinde farklı bir parametreyle patlar —
 * "User 123 failed", "User 456 failed" … Ham mesaja göre gruplarsak yüzlerce
 * tekil kayıt çıkar ve "hangi hata tekrar ediyor" sorusu cevapsız kalır.
 * Çözüm: mesajdaki DEĞİŞKEN kısımları yer tutucuya indir, sabit iskeleti
 * parmak izi yap.
 *
 * Bu dosya bilinçli olarak SAF'tır (DB/next import etmez) → normalizasyon
 * kuralları doğrudan test edilebilir. Yazma yolu `record.ts`'te.
 */

export { SEVERITIES };
export type { Severity };

/**
 * Mesajdaki dinamik değerleri yer tutucuya indirger.
 *
 * SIRA ÖNEMLİ: en spesifik kalıp önce. Tırnaklı değer en dıştaki kapsayıcıdır
 * (içinde uuid/e-posta olabilir); uuid sayıdan önce gelmeli yoksa uuid'in
 * rakamları tek tek `{n}`'e dönüp iskelet bozulur.
 */
export function normalizeMessage(raw: string | null | undefined): string {
    if (!raw) return "";
    return raw
        // "…" / '…' / `…` içindeki serbest değer
        .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "{str}")
        // Postgres benzersizlik ihlali: Key (id)=(3f2a…) already exists
        .replace(/=\([^)]*\)/g, "={val}")
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "{uuid}")
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "{email}")
        .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, "{ts}")
        .replace(/\b[0-9a-f]{16,}\b/gi, "{hex}")
        .replace(/\b\d+(?:[.,]\d+)?\b/g, "{n}")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Stack'in ilk "bizim kodumuz" satırı. node_modules ve runtime iç çerçeveleri
 * atlanır — aynı kusur farklı çağıranlardan gelse de aynı çerçevede birleşsin.
 */
export function topStackFrame(stack: string | null | undefined): string {
    if (!stack) return "";
    const lines = stack.split("\n").map(l => l.trim()).filter(l => l.startsWith("at "));
    const own = lines.find(l => !l.includes("node_modules") && !l.includes("node:internal"));
    const picked = own ?? lines[0] ?? "";
    // Satır/sütun numaraları build'den build'e kayar → parmak izinden düşür.
    return picked.replace(/:\d+:\d+\)?$/, ")").slice(0, 200);
}

/** Hata sınıfı adı. Supabase/Postgres düz nesnelerinde SQLSTATE kodu kullanılır. */
export function extractErrorType(err: unknown): string {
    if (err instanceof Error) return err.name || "Error";
    if (err && typeof err === "object") {
        const e = err as { code?: unknown; name?: unknown };
        if (typeof e.name === "string" && e.name) return e.name;
        if (typeof e.code === "string" && e.code) return `PG_${e.code}`;
    }
    return "UnknownError";
}

/**
 * Hata sınıfı + normalize mesaj + üst çerçeve → 16 hex karakter (64-bit FNV-1a).
 *
 * Neden sha256 DEĞİL: `node:crypto` Edge Runtime'da yok ve bu modül
 * `instrumentation.ts` üzerinden Edge derlemesine giriyor; ayrıca ciddiyet
 * filtresi gibi sabitler yüzünden istemci bundle'ına da düşebiliyordu.
 * Parmak izinin kriptografik olması GEREKMİYOR — tek istenen aynı kusurun
 * her seferinde aynı anahtara düşmesi. 64 bit, bu ölçekteki (binlerce ayrı
 * imza) çakışma olasılığı için fazlasıyla yeterli ve bağımlılık gerektirmez.
 */
export function fingerprintError(input: {
    errorType: string;
    normalizedMessage: string;
    topFrame?: string;
}): string {
    const basis = [input.errorType, input.normalizedMessage, input.topFrame ?? ""].join(" ");
    // İki bağımsız tohumla iki 32-bit yarım → 64 bit. BigInt yerine `Math.imul`:
    // proje hedefi ES2017 ve BigInt literali ES2020 istiyor; bu biçim her
    // çalışma zamanında (Node · Edge · tarayıcı) aynı sonucu verir.
    const hi = fnv1a32(basis, 0x811c9dc5);
    const lo = fnv1a32(basis, 0x9e3779b9);
    return hi.toString(16).padStart(8, "0") + lo.toString(16).padStart(8, "0");
}

/** FNV-1a (32-bit), bayt bayt — çok baytlı karakterlerin üst baytı da karışır. */
function fnv1a32(input: string, seed: number): number {
    const PRIME = 0x01000193;
    let hash = seed >>> 0;
    for (let i = 0; i < input.length; i++) {
        const code = input.charCodeAt(i);
        hash = Math.imul(hash ^ (code & 0xff), PRIME) >>> 0;
        hash = Math.imul(hash ^ ((code >>> 8) & 0xff), PRIME) >>> 0;
    }
    return hash >>> 0;
}

/**
 * Endpoint → modül adı. "Hangi modül hata üretiyor" sorusunun cevabı.
 * `/api/quotes/[id]/accept` → `quotes`; `/dashboard/purchase/orders` → `purchase`.
 */
export function moduleFromEndpoint(endpoint: string | null | undefined): string {
    if (!endpoint) return "unknown";
    const clean = endpoint.split("?")[0].replace(/^\/+/, "");
    const parts = clean.split("/").filter(Boolean);
    if (parts.length === 0) return "unknown";
    if (parts[0] === "api" || parts[0] === "dashboard") {
        return parts[1] ?? parts[0];
    }
    return parts[0];
}

/**
 * Ciddiyet kararı — TEK yer, böylece `handleApiError` ve `onRequestError`
 * aynı hataya aynı seviyeyi verir (§8 "severity mantığını tutarlı yap").
 *
 * Yapılandırma hatası `critical`: kod doğru ama dağıtım bozuk demektir ve
 * kullanıcıya 503 döner — 500'lerin arasında kaybolmamalı.
 */
export function severityFor(input: {
    status?: number | null;
    errorType?: string | null;
    message?: string | null;
}): Severity {
    const { status, errorType, message } = input;
    const msg = message ?? "";
    if (errorType === "ConfigError" || /MISSING ENV|CONFIG_ERROR/.test(msg)) return "critical";
    if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connection (?:refused|terminated|closed)/i.test(msg)) {
        return "critical";
    }
    // SQLSTATE 08xxx = connection exception
    if (errorType?.startsWith("PG_08")) return "critical";
    if (typeof status === "number") {
        if (status >= 500) return "error";
        if (status >= 400) return "warning";
        return "info";
    }
    return "error";
}

/** Liste/rozet sıralaması için sayısal ağırlık (yüksek = daha ciddi). */
export function severityRank(severity: Severity): number {
    return SEVERITIES.indexOf(severity);
}

/** Grup başlığı: tip + ham mesajın ilk satırı, kırpılmış. */
export function buildTitle(errorType: string, message: string | null | undefined): string {
    const firstLine = (message ?? "").split("\n")[0].trim();
    const title = firstLine ? `${errorType}: ${firstLine}` : errorType;
    return title.slice(0, 200);
}

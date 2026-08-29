/**
 * Telemetri redaction (Developer Console §10).
 *
 * Developer Console'un kendisi bir sızıntı yüzeyi OLMAMALI: panele düşen her
 * mesaj, stack ve bağlam nesnesi buradan geçer. İki kat çalışır —
 *
 *   1. ANAHTAR bazlı: `password`, `token`, `authorization`… adlı alanın DEĞERİ
 *      hiç bakılmadan `[REDACTED]` olur (değer neye benzerse benzesin).
 *   2. DEĞER bazlı: serbest metinde JWT / Bearer / `sk-…` / kart / VKN /
 *      e-posta kalıpları maskelenir — çünkü hassas veri çoğu zaman bir hata
 *      MESAJININ içine gömülü gelir, düzgün adlandırılmış bir alanda değil.
 *
 * `sentry-scrub.ts` (Sentry'nin kendi yolu) ve `sync-log.ts`'teki
 * `sanitizeSyncErrorMessage` aynı fikrin dar sürümleri; bu dosya telemetri
 * yazma yolunun tek kapısıdır. Saf → doğrudan test edilir.
 */

export const REDACTED = "[REDACTED]";

/** Nesne derinliği ve boyut tavanları — §24 (ağır serialization yapma). */
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 40;
const MAX_STRING_LENGTH = 2_000;

/**
 * Değeri koşulsuz maskelenen alan adları.
 *
 * `key` TEK BAŞINA listede DEĞİL: bu repoda `incident_key`, `event_key`,
 * `scope_key`, `field_key` gibi tamamen zararsız alanlar var; hepsini
 * maskelemek teşhisi kör ederdi. Gerçekten sır taşıyan bileşikler
 * (`api_key`, `private_key`, `anon_key`) tek tek listelenir.
 */
const SENSITIVE_KEY_WORDS = [
    "password", "passwd", "pwd",
    // Türkçe karşılıklar: bu uygulamanın hata mesajları ve alan adları Türkçe;
    // yalnız İngilizce liste "parola: …" yazan bir mesajı kaçırırdı.
    "parola", "sifre", "şifre",
    "token", "access_token", "refresh_token", "id_token",
    "authorization", "auth", "bearer",
    "cookie", "session", "sessionid",
    "secret", "client_secret", "service_role",
    "apikey", "api_key", "anon_key", "private_key", "publickey", "privatekey",
    "credential", "credentials",
    "card", "cardnumber", "pan", "cvv", "cvc", "iban",
    "otp", "pin", "signature",
];

const SENSITIVE_KEY_RE = new RegExp(
    `(?:^|[_.\\-\\[])(?:${SENSITIVE_KEY_WORDS.join("|")})(?:$|[_.\\-\\]])`,
    "i",
);

/** Alan adı sır taşıyor mu — değere hiç bakmadan karar verilir. */
export function isSensitiveKey(key: string): boolean {
    const k = key.trim().toLowerCase();
    if (SENSITIVE_KEY_WORDS.includes(k)) return true;
    return SENSITIVE_KEY_RE.test(k);
}

/**
 * Gömülü atama kalıbı: `password=x` · `"parola":"x"` · `api_key: x`.
 *
 * `\b` KULLANILMAZ: JS'te `\w` yalnız ASCII'dir, bu yüzden `\bşifre` hiçbir
 * zaman eşleşmez. Onun yerine sınır karakteri açıkça yakalanır ve geri konur —
 * böylece Türkçe anahtar adları da çalışır ve `{"` gibi ayraçlar korunur.
 */
const ASSIGNMENT_KEYS = [
    "password", "passwd", "pwd", "parola", "şifre", "sifre",
    "token", "secret", "api[_-]?key", "authorization", "cookie",
].join("|");

const ASSIGNMENT_RE = new RegExp(
    `(^|[^\\p{L}\\p{N}_])(${ASSIGNMENT_KEYS})["']?(\\s*[=:]\\s*)["']?([^\\s,;&"'}\\]]+)["']?`,
    "giu",
);

/** Değer yerine gelen kimlik şeması — sır değil, teşhis için görünür kalmalı. */
const AUTH_SCHEMES = new Set(["bearer", "basic", "digest", REDACTED.toLowerCase()]);

/**
 * Serbest metin maskelemesi. Sıra spesifikten genele: önce yapısı belli olan
 * sırlar (JWT, Bearer, sağlayıcı anahtarları, bağlantı dizesi), sonra gömülü
 * atamalar, en sonda kişisel veri kalıpları.
 */
export function redactText(input: string | null | undefined): string {
    if (!input) return "";
    return input
        // postgres://user:parola@host  ·  https://user:parola@host
        .replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@]+@/gi, `$1:${REDACTED}@`)
        // JWT (Supabase access/refresh token dahil)
        .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REDACTED)
        // Authorization: Bearer <token>
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`)
        // Sağlayıcı anahtarları: Anthropic/OpenAI sk-…, Resend re_…, Sentry/Supabase sb…
        .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, REDACTED)
        .replace(/\bre_[A-Za-z0-9_-]{12,}/g, REDACTED)
        // key=deger / "password":"deger" / parola: deger gibi gömülü atamalar
        .replace(ASSIGNMENT_RE, (match, boundary: string, key: string, sep: string, value: string) =>
            // "Authorization: Bearer <token>" — token'ı yukarıdaki Bearer kuralı
            // zaten maskeledi; şemayı da yemek teşhisi gereksiz körleştirir.
            AUTH_SCHEMES.has(value.toLowerCase()) ? match : `${boundary}${key}${sep}${REDACTED}`,
        )
        // Kart numarası (13-19 hane, boşluk/tire ayraçlı olabilir)
        .replace(/\b(?:\d[ -]?){13,19}\b/g, "[card]")
        // VKN (10) / TCKN (11)
        .replace(/\b\d{10,11}\b/g, "[vkn]")
        // E-posta — kullanıcıyı user_id (uuid) taşır, adresin panelde işi yok
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]");
}

/** Metni maskeler + tavana kırpar. */
export function redactString(input: string | null | undefined, maxLength = MAX_STRING_LENGTH): string {
    const cleaned = redactText(input);
    return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}

/**
 * Nesne/dizi/ilkel değeri özyinelemeli maskeler.
 * Döngüsel referans, derinlik ve eleman sayısı tavanlıdır — telemetri
 * ERP'den pahalı olmamalı (§24).
 */
export function redactValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return redactString(value);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "function" || typeof value === "symbol") return "[unsupported]";

    if (depth >= MAX_DEPTH) return "[truncated: depth]";

    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) {
        return {
            name: value.name,
            message: redactString(value.message),
            stack: redactString(value.stack, 4_000),
        };
    }

    if (typeof value === "object") {
        if (seen.has(value as object)) return "[circular]";
        seen.add(value as object);

        if (Array.isArray(value)) {
            const items = value.slice(0, MAX_ARRAY_ITEMS).map(v => redactValue(v, depth + 1, seen));
            if (value.length > MAX_ARRAY_ITEMS) items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
            return items;
        }

        const out: Record<string, unknown> = {};
        const entries = Object.entries(value as Record<string, unknown>);
        for (const [k, v] of entries.slice(0, MAX_OBJECT_KEYS)) {
            out[k] = isSensitiveKey(k) ? REDACTED : redactValue(v, depth + 1, seen);
        }
        if (entries.length > MAX_OBJECT_KEYS) {
            out["[truncated]"] = `+${entries.length - MAX_OBJECT_KEYS} keys`;
        }
        return out;
    }

    return "[unsupported]";
}

/** Bağlam nesnesi için giriş noktası — her zaman düz bir nesne döndürür. */
export function redactContext(input: unknown): Record<string, unknown> | null {
    if (input === null || input === undefined) return null;
    const result = redactValue(input);
    if (result && typeof result === "object" && !Array.isArray(result)) {
        return result as Record<string, unknown>;
    }
    return { value: result };
}

/** HTTP başlıkları — hassas olanlar tamamen maskelenir. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
        out[k] = isSensitiveKey(k) ? REDACTED : redactString(v, 200);
    }
    return out;
}

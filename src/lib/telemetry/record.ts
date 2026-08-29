import { after } from "next/server";
import {
    buildTitle,
    extractErrorType,
    fingerprintError,
    moduleFromEndpoint,
    normalizeMessage,
    severityFor,
    topStackFrame,
    type Severity,
} from "./fingerprint";
import { redactContext, redactString } from "./redact";
import { readRequestHeader, readRequestId } from "./request-id";

/**
 * Telemetri yazma yolu — TEK fail-safe kapı (Developer Console §20, §23, §24).
 *
 * Sözleşme: **bu dosyadaki hiçbir fonksiyon throw ETMEZ.** Telemetri
 * başarısızlığı ERP isteğini bozmaz. Ama sessizce de yutulmaz: her arıza
 * modül-içi sayaca işlenir ve Tanılama ekranında görünür — "kayıt yok" ile
 * "kayıt alınamıyor" birbirine karışmasın.
 *
 * Üç koruma katmanı:
 *   1. Ortam kapısı — test koşumunda no-op (mevcut 6504 test DB'ye gitmez).
 *   2. Hız tavanı — saniyede en fazla MAX_WRITES_PER_SECOND yazma; hata
 *      fırtınasında telemetri ERP'den pahalı hâle gelmez.
 *   3. Redaksiyon — mesaj/stack/bağlam `redact.ts`'ten geçmeden yazılmaz.
 */

const MAX_WRITES_PER_SECOND = 50;
/** Konsola ilk N arıza yazılır; sonrası her 100'de bir (log seli olmasın). */
const CONSOLE_LOG_FIRST_N = 5;

interface Diagnostics {
    writes: number;
    failures: number;
    dropped: number;
    lastFailureAt: string | null;
    lastFailureMessage: string | null;
}

const diagnostics: Diagnostics = {
    writes: 0,
    failures: 0,
    dropped: 0,
    lastFailureAt: null,
    lastFailureMessage: null,
};

let windowStartedAt = 0;
let windowWrites = 0;

/** §25 — Sentry ile AYNI ortam etiketi; prod/staging/dev telemetrisi karışmaz. */
export function telemetryEnvironment(): string {
    return process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";
}

/**
 * Test koşumunda varsayılan KAPALI. `TELEMETRY_ENABLED` her iki yönde de
 * açık üstünlük taşır — telemetriyi sınayan testler onu "true" yapar.
 */
export function isTelemetryEnabled(): boolean {
    const flag = process.env.TELEMETRY_ENABLED;
    if (flag === "true") return true;
    if (flag === "false") return false;
    if (process.env.VITEST || process.env.NODE_ENV === "test") return false;
    return true;
}

function takeToken(): boolean {
    const now = Date.now();
    if (now - windowStartedAt >= 1_000) {
        windowStartedAt = now;
        windowWrites = 0;
    }
    if (windowWrites >= MAX_WRITES_PER_SECOND) {
        diagnostics.dropped++;
        return false;
    }
    windowWrites++;
    return true;
}

function noteFailure(err: unknown): void {
    diagnostics.failures++;
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.lastFailureAt = new Date().toISOString();
    diagnostics.lastFailureMessage = redactString(message, 300);
    // ASLA recordError çağırma — telemetri arızasını telemetriye yazmak
    // sonsuz döngü demektir. Konsol + sayaç yeterli.
    if (diagnostics.failures <= CONSOLE_LOG_FIRST_N || diagnostics.failures % 100 === 0) {
        console.error(`[telemetry] kayıt başarısız (#${diagnostics.failures}):`, message);
    }
}

export interface RecordErrorOptions {
    error: unknown;
    endpoint?: string | null;
    method?: string | null;
    statusCode?: number | null;
    userId?: string | null;
    /** Ek bağlam — redaksiyondan geçirilir. */
    context?: unknown;
    /** Açık ciddiyet; verilmezse `severityFor` hesaplar. */
    severity?: Severity;
    /** Etiket (örn. "GET /api/quotes") — endpoint verilmediğinde ondan türetilir. */
    label?: string | null;
    /**
     * Açık request ID / User-Agent. `onRequestError` istek kapsamı DIŞINDA
     * çalışır (`next/headers` orada okunamaz) ama kendi `request` nesnesini
     * taşır — o yol bu alanları doldurur, route yolu boş bırakır.
     */
    requestId?: string | null;
    userAgent?: string | null;
}

/**
 * Bir hatayı kaydeder. Hiçbir koşulda throw etmez ve çağıranı bekletmez
 * (çağıran `after()` içinde tetikler).
 */
export async function recordError(options: RecordErrorOptions): Promise<void> {
    try {
        if (!isTelemetryEnabled() || !takeToken()) return;

        const { error } = options;
        const rawMessage = error instanceof Error
            ? error.message
            : describeUnknown(error);
        const stack = error instanceof Error ? error.stack ?? null : null;

        const errorType = extractErrorType(error);
        const endpoint = options.endpoint ?? endpointFromLabel(options.label);
        const method = options.method ?? methodFromLabel(options.label);

        const normalizedMessage = normalizeMessage(rawMessage);
        const frame = topStackFrame(stack);
        const severity = options.severity ?? severityFor({
            status: options.statusCode,
            errorType,
            message: rawMessage,
        });

        const [requestId, userAgent] = options.requestId !== undefined
            || options.userAgent !== undefined
            ? [options.requestId ?? null, options.userAgent ?? null]
            : await Promise.all([readRequestId(), readRequestHeader("user-agent")]);

        const { dbRecordErrorOccurrence } = await import("@/lib/supabase/telemetry");
        await dbRecordErrorOccurrence({
            fingerprint: fingerprintError({ errorType, normalizedMessage, topFrame: frame }),
            title: redactString(buildTitle(errorType, rawMessage), 200),
            errorType,
            // Normalize mesaj da redaksiyondan geçer: "{str}" yer tutucusu
            // her şeyi yakalamaz, tırnaksız gömülü token kalabilir.
            normalizedMessage: redactString(normalizedMessage, 500),
            severity,
            module: moduleFromEndpoint(endpoint),
            endpoint,
            environment: telemetryEnvironment(),
            occurredAt: new Date().toISOString(),
            requestId,
            method,
            statusCode: options.statusCode ?? null,
            userId: options.userId ?? null,
            userAgent: userAgent ? redactString(userAgent, 300) : null,
            stack: stack ? redactString(stack, 8_000) : null,
            context: redactContext(options.context),
        });

        diagnostics.writes++;
    } catch (err) {
        noteFailure(err);
    }
}

export interface RecordEventOptions {
    level: Severity;
    message: string;
    module?: string | null;
    endpoint?: string | null;
    userId?: string | null;
    context?: unknown;
}

/** Telemetrinin kendi olayı (yavaş istek, retention turu…). Throw etmez. */
export async function recordEvent(options: RecordEventOptions): Promise<void> {
    try {
        if (!isTelemetryEnabled() || !takeToken()) return;

        const requestId = await readRequestId();
        const { dbRecordSystemEvent } = await import("@/lib/supabase/telemetry");
        await dbRecordSystemEvent({
            level: options.level,
            message: redactString(options.message, 1_000),
            module: options.module ?? moduleFromEndpoint(options.endpoint),
            endpoint: options.endpoint ?? null,
            requestId,
            userId: options.userId ?? null,
            environment: telemetryEnvironment(),
            context: redactContext(options.context),
        });

        diagnostics.writes++;
    } catch (err) {
        noteFailure(err);
    }
}

/**
 * Telemetri işini yanıt gönderildikten SONRA çalıştırır — kullanıcı beklemez
 * (§24 non-blocking). `after()` istek kapsamı dışında (test, script) fırlatır;
 * o durumda görev yine tetiklenir ama beklenmez.
 */
export function scheduleTelemetry(task: () => Promise<void>): void {
    try {
        after(task);
    } catch {
        void task().catch(() => { /* recordError zaten yutuyor */ });
    }
}

/** Tanılama ekranı — arıza sessiz kalmasın (§20). */
export function telemetryDiagnostics(): Diagnostics & { enabled: boolean; environment: string } {
    return {
        ...diagnostics,
        enabled: isTelemetryEnabled(),
        environment: telemetryEnvironment(),
    };
}

/** Yalnız testler için — modül-içi sayaçları sıfırlar. */
export function resetTelemetryDiagnostics(): void {
    diagnostics.writes = 0;
    diagnostics.failures = 0;
    diagnostics.dropped = 0;
    diagnostics.lastFailureAt = null;
    diagnostics.lastFailureMessage = null;
    windowStartedAt = 0;
    windowWrites = 0;
}

// ── Yardımcılar ──────────────────────────────────────────────────────────

/** `handleApiError` etiketi "GET /api/quotes" biçiminde gelir. */
function endpointFromLabel(label: string | null | undefined): string | null {
    if (!label) return null;
    const match = label.match(/(\/[^\s]*)/);
    return match ? match[1] : null;
}

function methodFromLabel(label: string | null | undefined): string | null {
    if (!label) return null;
    const match = label.match(/^(GET|POST|PATCH|PUT|DELETE)\b/);
    return match ? match[1] : null;
}

/** Error olmayan fırlatılmış değerler (Supabase düz nesnesi dahil). */
function describeUnknown(err: unknown): string {
    if (err && typeof err === "object") {
        const e = err as { message?: unknown; details?: unknown; hint?: unknown };
        const parts = [e.message, e.details, e.hint]
            .filter((p): p is string => typeof p === "string" && p.length > 0);
        if (parts.length > 0) return parts.join(" | ");
        try {
            return JSON.stringify(err).slice(0, 1_000);
        } catch {
            return "[unserializable]";
        }
    }
    return String(err);
}

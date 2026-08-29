"use client";

/**
 * İstemci tarafı istek ölçümü — RUM (§12).
 *
 * NEDEN İSTEMCİDE: Next.js middleware handler'dan ÖNCE çalışıp biter; yanıtın
 * süresini ve status kodunu GÖREMEZ. Sunucuda ölçmek 148 route'un her birine
 * sarmalayıcı eklemeyi gerektirirdi — §21'in yasakladığı şey. Tarayıcı ise
 * her isteğin başlangıcını ve bitişini zaten görüyor.
 *
 * NEDEN `jsonFetcher` DEĞİL, GLOBAL `fetch`: ortak fetcher bu repoda yalnız 2
 * dosyada kullanılıyor; ham `fetch("/api/…")` çağrısı 58 dosyada. Yalnız
 * fetcher'ı ölçmek panelin neredeyse boş kalması demekti. Global sarmalayıcı
 * TEK entegrasyon noktasıyla hepsini kapsar.
 *
 * Sözleşme: sarmalayıcı isteğin davranışını DEĞİŞTİRMEZ. Orijinal `fetch`
 * çağrılır, dönen Promise aynen geri verilir; ölçüm kodu tamamen try/catch
 * içindedir. Ölçüm patlarsa istek yine de tamamlanır.
 */

interface Sample {
    endpoint: string;
    method: string;
    status: number;
    durationMs: number;
}

const MAX_BUFFER = 50;
const FLUSH_INTERVAL_MS = 30_000;
const RUM_ENDPOINT = "/api/developer/rum";

let installed = false;
let buffer: Sample[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

/** Ölçüm dışı bırakılan yollar — kendini ölçen sonsuz döngü olmasın. */
function isExcluded(path: string): boolean {
    return path.startsWith(RUM_ENDPOINT);
}

/** Yalnız kendi origin'imizdeki /api yolları ölçülür (3. parti istek sayılmaz). */
function toApiPath(input: RequestInfo | URL): string | null {
    try {
        const raw = typeof input === "string"
            ? input
            : input instanceof URL
                ? input.href
                : input.url;
        if (!raw) return null;
        const url = new URL(raw, window.location.origin);
        if (url.origin !== window.location.origin) return null;
        if (!url.pathname.startsWith("/api/")) return null;
        return url.pathname;
    } catch {
        return null;
    }
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
    if (init?.method) return init.method.toUpperCase();
    if (typeof input === "object" && input !== null && "method" in input) {
        return String((input as Request).method || "GET").toUpperCase();
    }
    return "GET";
}

function enqueue(sample: Sample): void {
    buffer.push(sample);
    if (buffer.length >= MAX_BUFFER) flush();
}

/** Sunucuya gönderir. Sayfa kapanırken `sendBeacon`, normalde `keepalive` fetch. */
export function flush(useBeacon = false): void {
    if (buffer.length === 0) return;
    const samples = buffer;
    buffer = [];

    const payload = JSON.stringify({ samples });
    try {
        if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
            navigator.sendBeacon(RUM_ENDPOINT, new Blob([payload], { type: "application/json" }));
            return;
        }
        void originalFetch(RUM_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
        }).catch(() => { /* ölçüm gönderimi başarısızsa sessiz — ERP etkilenmez */ });
    } catch {
        // Yut: telemetri hiçbir koşulda uygulamayı etkilemez.
    }
}

let originalFetch: typeof fetch;

/**
 * Global `fetch`'i bir kez sarar. Idempotent — ikinci çağrı hiçbir şey yapmaz
 * (React StrictMode geliştirmede effect'i iki kez çalıştırır).
 */
export function installRumCollector(): () => void {
    if (installed || typeof window === "undefined") return () => { /* no-op */ };
    installed = true;
    originalFetch = window.fetch.bind(window);

    window.fetch = async function measuredFetch(
        input: RequestInfo | URL,
        init?: RequestInit,
    ): Promise<Response> {
        const started = performance.now();
        try {
            const response = await originalFetch(input, init);
            try {
                const path = toApiPath(input);
                if (path && !isExcluded(path)) {
                    enqueue({
                        endpoint: path,
                        method: methodOf(input, init),
                        status: response.status,
                        durationMs: performance.now() - started,
                    });
                }
            } catch {
                // Ölçüm hatası isteği etkilemez.
            }
            return response;
        } catch (err) {
            // Ağ hatası: status yok → 0 ile kaydedilir (sunucu tarafı reddeder,
            // bu yüzden hiç göndermiyoruz; yalnız hatayı yeniden fırlatıyoruz).
            throw err;
        }
    };

    timer = setInterval(() => flush(), FLUSH_INTERVAL_MS);
    const onHide = () => { if (document.visibilityState === "hidden") flush(true); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", () => flush(true));

    return () => {
        if (timer) clearInterval(timer);
        timer = null;
        document.removeEventListener("visibilitychange", onHide);
        window.fetch = originalFetch;
        installed = false;
    };
}

/** Yalnız testler için — modül durumunu sıfırlar. */
export function resetRumCollector(): void {
    buffer = [];
    installed = false;
    if (timer) clearInterval(timer);
    timer = null;
}

/** Test/tanılama: bekleyen örnek sayısı. */
export function pendingSampleCount(): number {
    return buffer.length;
}

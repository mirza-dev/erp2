/**
 * Gerçek zamanlı değişiklik bildirimi — SUNUCU ve İSTEMCİ ortak sözleşmesi.
 *
 * NEDEN BÖYLE: Roven'de RBAC ve finansal maskeleme Next.js API katmanındadır
 * (`requirePermission` + `redact.ts`); Postgres'teki RLS politikalarının HEPSİ
 * yalnız `service_role`'e açıktır, normal kullanıcının DB'ye doğrudan okuma
 * yetkisi YOKTUR. Bu yüzden Supabase'in `postgres_changes` özelliği burada
 * kullanılamaz — tarayıcıya hiçbir satır ulaşmaz, ulaşsaydı da yetki/maskeleme
 * kapısını atlamış olurdu.
 *
 * Çözüm: yayın (broadcast) VERİ TAŞIMAZ, yalnız "şu alan değişti" der. İstemci
 * bunu duyunca veriyi HER ZAMANKİ korumalı API yolundan yeniden çeker. Böylece:
 *   · yetki ve maskeleme tek yerde kalır (ikinci bir authz katmanı doğmaz)
 *   · RLS'e dokunulmaz, migration gerekmez
 *   · sinyal sızdırsa bile içinde iş verisi yoktur
 *
 * Ölçüldü (2026-08-29, canlı proje): 5/5 teslim, ortanca 77 ms.
 */

/** Yayın kanalı — tek kanal, alan ayrımı payload'da. */
export const REALTIME_CHANNEL = "roven-data-changes";

/** Yayın olayı adı. */
export const REALTIME_EVENT = "changed";

/**
 * Değişen veri alanı. İstemci bunu SWR anahtarlarına çevirir.
 * Yeni alan eklerken `DOMAIN_KEY_PREFIXES` de güncellenmeli.
 */
export const REALTIME_DOMAINS = [
    "products",
    "orders",
    "customers",
    "vendors",
    "production",
    "alerts",
    "quotes",
    "purchase_orders",
    "rfqs",
] as const;

export type RealtimeDomain = (typeof REALTIME_DOMAINS)[number];

export interface DataChangePayload {
    /** Değişen alan(lar). */
    domains: RealtimeDomain[];
    /**
     * Değişikliği yapan sekmenin kimliği. İstemci KENDİ değişikliğini yeniden
     * çekmez — mutasyon yolu zaten cache'i günceller, ikinci istek israftır.
     */
    origin?: string | null;
    /** Sunucu zaman damgası (teşhis). */
    at: number;
}

/**
 * Alan → tazelenecek SWR anahtar önekleri.
 *
 * Anahtarlar `data-context.tsx`'teki sabitlerle birebir olmalı; oradaki
 * `invalidateAllData` ile aynı eşleşme mantığı (startsWith) kullanılır ki
 * sorgu parametreli anahtarlar (`/api/products?all=1`, sayfalı listeler) da
 * kapsansın.
 */
export const DOMAIN_KEY_PREFIXES: Record<RealtimeDomain, string[]> = {
    products: ["/api/products", "/api/dashboard/counters", "/api/import/setup-status"],
    orders: ["/api/orders", "/api/dashboard/counters"],
    customers: ["/api/customers", "/api/import/setup-status"],
    vendors: ["/api/vendors", "/api/product-vendor-links", "/api/import/setup-status"],
    production: ["/api/production", "/api/products", "/api/dashboard/counters"],
    alerts: ["/api/alerts", "/api/dashboard/counters"],
    quotes: ["/api/quotes"],
    purchase_orders: ["/api/purchase-orders", "/api/products", "/api/dashboard/counters"],
    rfqs: ["/api/rfqs"],
};

export function isRealtimeDomain(value: unknown): value is RealtimeDomain {
    return typeof value === "string" && (REALTIME_DOMAINS as readonly string[]).includes(value);
}

/** Payload'ı güvenle ayrıştırır — ağdan gelen her şey şüphelidir. */
export function parseDataChangePayload(raw: unknown): DataChangePayload | null {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    const domains = Array.isArray(obj.domains) ? obj.domains.filter(isRealtimeDomain) : [];
    if (domains.length === 0) return null;
    return {
        domains,
        origin: typeof obj.origin === "string" ? obj.origin : null,
        at: typeof obj.at === "number" ? obj.at : Date.now(),
    };
}

/** Bir payload'ın tazelemesi gereken SWR anahtar öneklerini toplar. */
export function affectedKeyPrefixes(domains: RealtimeDomain[]): string[] {
    const out = new Set<string>();
    for (const d of domains) {
        for (const p of DOMAIN_KEY_PREFIXES[d] ?? []) out.add(p);
    }
    return [...out];
}

/** Verilen SWR anahtarı bu değişiklikten etkileniyor mu? */
export function keyMatchesDomains(key: unknown, domains: RealtimeDomain[]): boolean {
    if (typeof key !== "string") return false;
    return affectedKeyPrefixes(domains).some(p => key.startsWith(p));
}

/**
 * AI erişilebilirlik sinyalinin istemci tarafı — TEK KAYNAK.
 *
 * Tüketiciler: Veri Aktarım Merkezi hub'ı, ClassifierQueue, İncele (extract)
 * ekranı. Üçü de aynı metni göstermeli; kullanıcı hangi kapıdan girerse girsin
 * (dropzone, doğrudan URL, kuyruk kartı) aynı açıklamayı görsün.
 *
 * 2026-08-29: anahtar dolu ama geçersizken (HTTP 401) sistem AI'yı açık sanıyor,
 * her çağrı sessizce boş sonuca düşüyordu. Artık sunucu ayrımı taşıyor
 * (`/api/ai/health`) ve UI bunu görünür kılıyor.
 */

export type AiHealthReason = "ok" | "no_key" | "auth_failed";

export interface AiHealth {
    available: boolean;
    reason: AiHealthReason;
    status?: number;
}

/** Kullanıcıya gösterilecek metin — sebebe göre ayrışır. */
export function aiUnavailableMessage(health: AiHealth | null): string | null {
    if (!health || health.available) return null;
    if (health.reason === "no_key") {
        return "AI çıkarımı şu an kapalı — API anahtarı tanımlı değil. Excel/CSV yolu normal çalışıyor.";
    }
    return "AI çıkarımı şu an kapalı — API anahtarı geçersiz (yenilenmesi gerekiyor). Excel/CSV yolu normal çalışıyor.";
}

/**
 * Durumu sorar. Ağ/yetki hatasında `null` döner — bilinmezlik AI'yı kapalı
 * SAYMAZ: yanlış "kapalı" mesajı, sessiz başarısızlık kadar yanıltıcıdır.
 */
export async function fetchAiHealth(signal?: AbortSignal): Promise<AiHealth | null> {
    try {
        const res = await fetch("/api/ai/health", { signal });
        if (!res.ok) return null;
        return (await res.json()) as AiHealth;
    } catch {
        return null;
    }
}

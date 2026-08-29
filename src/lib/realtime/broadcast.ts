import { createClient } from "@supabase/supabase-js";
import {
    REALTIME_CHANNEL,
    REALTIME_EVENT,
    type RealtimeDomain,
    type DataChangePayload,
} from "./channel";

/**
 * Sunucudan "şu alan değişti" yayını.
 *
 * YALNIZ SUNUCU — service-role anahtarı kullanır, istemci bileşeninden ASLA
 * import edilmemeli. (`server-only` paketi bu depoda kullanılmıyor;
 * `supabase/service.ts` de aynı korumayı yorumla sağlıyor.)
 *
 * Websocket TUTMAZ: `httpSend` tek bir HTTP isteğiyle gönderir, bu yüzden
 * serverless/çok-instance ortamda da çalışır ve bağlantı sızdırmaz.
 *
 * ATEŞLE-UNUT: yayın başarısız olursa mutasyon BAŞARILI sayılmaya devam eder.
 * Kullanıcının kaydettiği sipariş, bildirim gönderilemedi diye kaybolamaz —
 * en kötü durumda diğer ekranlar bir sonraki gezinmede tazelenir (eski davranış).
 */

let cachedClient: ReturnType<typeof createClient> | null = null;

function client() {
    if (cachedClient) return cachedClient;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    // Yayın için oturum/otomatik yenileme gerekmez — en hafif istemci.
    cachedClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return cachedClient;
}

/**
 * Değişiklik bildirir. Beklenmesi ZORUNLU DEĞİL — çağıran `void` ile geçebilir.
 *
 * @param domains değişen alan(lar)
 * @param origin  değişikliği yapan sekmenin kimliği (o sekme kendini tazelemesin)
 */
export async function broadcastDataChange(
    domains: RealtimeDomain | RealtimeDomain[],
    origin?: string | null,
): Promise<boolean> {
    const list = Array.isArray(domains) ? domains : [domains];
    if (list.length === 0) return false;

    const sb = client();
    if (!sb) return false;

    const payload: DataChangePayload = { domains: list, origin: origin ?? null, at: Date.now() };
    try {
        // httpSend → { success: true } | { success: false, status, error }
        const res = await sb.channel(REALTIME_CHANNEL).httpSend(REALTIME_EVENT, payload);
        if (!res.success) {
            console.error(`[realtime] yayın reddedildi (HTTP ${res.status}): ${res.error}`);
        }
        return res.success;
    } catch (err) {
        // Sessiz DEĞİL ama bloklayıcı da değil — teşhis edilebilir kalsın.
        console.error("[realtime] yayın gönderilemedi:", err instanceof Error ? err.message : err);
        return false;
    }
}

/**
 * İstek başlığından değişikliği yapan sekmenin kimliğini okur.
 * İstemci her mutasyon isteğine bu başlığı ekler; sunucu yayına geri koyar,
 * böylece o sekme kendi değişikliğini ikinci kez çekmez.
 */
export const ORIGIN_HEADER = "x-roven-tab";

export function originFromRequest(req: { headers: { get(name: string): string | null } }): string | null {
    const raw = req.headers.get(ORIGIN_HEADER);
    if (!raw) return null;
    const trimmed = raw.trim();
    // Uzunluk sınırı: başlık kullanıcı kontrolünde, yayına geri konuyor.
    return trimmed.length > 0 && trimmed.length <= 64 ? trimmed : null;
}

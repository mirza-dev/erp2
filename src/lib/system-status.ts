/**
 * Sistem durumu — env → "hangi özellik çalışıyor, hangisi sessizce kapalı"
 * raporunun TEK kaynağı (onboarding, 2026-09-16).
 *
 * NEDEN VAR: e-posta / AI / Paraşüt / Sentry sağlığı üç ayrı yerde ve yalnız
 * internal-operator'a açıktı. Müşterinin admin'i "bildirim neden gitmiyor"u
 * göremiyordu; deploy günü env listesi de yalnız `docs/deploy-env-matrix.md`de
 * yaşıyordu. Bu modül matristeki üç sınıfı (zorunlu / sessiz kapanan / doğru
 * değer gerektiren) koda taşır; Ayarlar › Sistem Durumu kartı ve
 * `scripts/check-env-matrix.ts` (npm run kurulum:dogrula) aynı fonksiyonu okur.
 *
 * GÜVENLİK: rapor yalnız VAR/YOK ve etiket taşır — hiçbir env DEĞERİ çıkmaz.
 * Tek istisna `NEXT_PUBLIC_APP_URL` (zaten tarayıcıya gömülü, herkese açık).
 *
 * Saf fonksiyon: env ve AI durumu parametre — test ve script'ten çağrılabilir.
 */

export type SystemStatusTone = "ok" | "warning" | "danger" | "info";

/** deploy-env-matrix.md'deki üç sınıf. */
export type SystemStatusClass = "zorunlu" | "sessiz" | "deger";

export interface SystemStatusItem {
    key: string;
    /** Özelliğin kullanıcı dilindeki adı ("E-posta gönderimi"). */
    label: string;
    tone: SystemStatusTone;
    /** Durumun bir cümlelik hâli ("Tanımlı", "Anahtar geçersiz (HTTP 401)"). */
    state: string;
    /** Eksikse ne olur — matristeki cümle. */
    impact: string;
    /** İlgili env adları (değer değil). */
    env: string[];
    klass: SystemStatusClass;
}

export interface SystemStatusReport {
    generatedAt: string;
    items: SystemStatusItem[];
    summary: Record<SystemStatusTone, number>;
    /** `NEXT_PUBLIC_APP_URL` (public) — yoksa null. */
    appUrl: string | null;
}

/** `/api/ai/health` ile aynı şekil; script tarafında probe atılmaz → `unknown`. */
export interface AiProbe {
    reason: "ok" | "no_key" | "auth_failed" | "unknown";
    status?: number;
}

type Env = Record<string, string | undefined>;

const has = (env: Env, key: string) => !!env[key]?.trim();

export function buildSystemStatus(env: Env = process.env, ai: AiProbe = { reason: "unknown" }): SystemStatusReport {
    const items: SystemStatusItem[] = [];

    // ── Zorunlu — eksikse uygulama ayağa kalkmaz veya kilitlenir ──
    const supabaseKeys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
    const supabaseMissing = supabaseKeys.filter(k => !has(env, k));
    items.push({
        key: "supabase",
        label: "Veritabanı bağlantısı (Supabase)",
        tone: supabaseMissing.length === 0 ? "ok" : "danger",
        state: supabaseMissing.length === 0 ? "Tanımlı" : `Eksik: ${supabaseMissing.join(", ")}`,
        impact: "Her istek 503 döner; uygulama açılmaz.",
        env: supabaseKeys,
        klass: "zorunlu",
    });

    items.push({
        key: "admin_emails",
        label: "Bootstrap admin listesi",
        tone: has(env, "ADMIN_EMAILS") ? "ok" : "warning",
        state: has(env, "ADMIN_EMAILS") ? "Tanımlı" : "Tanımsız — kalıcı admin varsa sorun değil",
        impact: "Kalıcı admin yoksa kimse giremez (brick). Deploy öncesi `npm run preflight:auth` ölçer.",
        env: ["ADMIN_EMAILS"],
        klass: "zorunlu",
    });

    items.push({
        key: "cron",
        label: "Zamanlanmış işler (CRON)",
        tone: has(env, "CRON_SECRET") ? "ok" : "danger",
        state: has(env, "CRON_SECRET") ? "Tanımlı" : "Tanımsız",
        impact: "Bildirim kuyruğu, uyarı taraması, Paraşüt senkronu ve telemetri temizliği hiç çalışmaz (401).",
        env: ["CRON_SECRET"],
        klass: "zorunlu",
    });

    // ── Sessizce kapanan — build yeşil, özellik ölü ──
    const hasApiKey = has(env, "RESEND_API_KEY");
    const hasFrom = has(env, "EMAIL_FROM");
    const hasWebhook = has(env, "RESEND_WEBHOOK_SECRET");
    const direct = hasApiKey && hasFrom;
    items.push({
        key: "email",
        label: "E-posta gönderimi",
        tone: direct && hasWebhook ? "ok" : direct ? "warning" : "danger",
        state: direct && hasWebhook
            ? "Doğrudan gönderim + bildirim kuyruğu açık"
            : direct
                ? "Doğrudan gönderim açık; bildirim kuyruğu RESEND_WEBHOOK_SECRET bekliyor"
                : `Kapalı — eksik: ${[!hasApiKey && "RESEND_API_KEY", !hasFrom && "EMAIL_FROM"].filter(Boolean).join(", ")}`,
        impact: "Teklif gönderimi, davet ve parola sıfırlama e-postaları gitmez; bildirimler `waiting_config`te birikir. Gönderici doğrulanmış bir alan adından olmalı.",
        env: ["RESEND_API_KEY", "EMAIL_FROM", "RESEND_WEBHOOK_SECRET"],
        klass: "sessiz",
    });

    const aiKey = has(env, "ANTHROPIC_API_KEY");
    const aiTone: SystemStatusTone = !aiKey ? "warning" : ai.reason === "auth_failed" ? "danger" : ai.reason === "ok" ? "ok" : "info";
    items.push({
        key: "ai",
        label: "Yapay zeka (Claude)",
        tone: aiTone,
        state: !aiKey
            ? "Anahtar tanımsız"
            : ai.reason === "auth_failed"
                ? `Anahtar geçersiz${ai.status ? ` (HTTP ${ai.status})` : ""}`
                : ai.reason === "ok"
                    ? "Çalışıyor"
                    : "Anahtar tanımlı (geçerlilik ölçülmedi)",
        impact: "Excel kolon eşleştirme, satın alma yardımcısı, operasyon özeti ve sesli giriş kapalı; deterministik akışlar çalışmaya devam eder.",
        env: ["ANTHROPIC_API_KEY"],
        klass: "sessiz",
    });

    const voice = has(env, "OPENAI_API_KEY") && aiKey;
    items.push({
        key: "voice",
        label: "Sesli üretim girişi",
        tone: voice ? "ok" : "info",
        state: voice ? "Açık" : "Kapalı",
        impact: "Üretim girişinde mikrofon düğmesi çalışmaz; iki anahtar da gerekir.",
        env: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
        klass: "sessiz",
    });

    items.push({
        key: "redis",
        label: "Paylaşımlı hız sınırı (Redis)",
        tone: has(env, "REDIS_URL") ? "ok" : "info",
        state: has(env, "REDIS_URL") ? "Tanımlı" : "Tanımsız — bellek içi sınır",
        impact: "Tek sunucuda fark yok; birden çok instance'ta AI hız sınırı instance başına uygulanır.",
        env: ["REDIS_URL"],
        klass: "sessiz",
    });

    items.push({
        key: "live_rates",
        label: "Canlı döviz kuru",
        tone: has(env, "LIVE_RATES_API_KEY") ? "ok" : "info",
        state: has(env, "LIVE_RATES_API_KEY") ? "Tanımlı" : "Tanımsız — ücretsiz/önbellekli kaynak",
        impact: "Kur çipi ücretsiz kaynağa düşer; gecikmeli olabilir.",
        env: ["LIVE_RATES_API_KEY"],
        klass: "sessiz",
    });

    // ── Doğru değer gerektirenler ──
    const appUrl = env.NEXT_PUBLIC_APP_URL?.trim() || null;
    items.push({
        key: "app_url",
        label: "Uygulama adresi (e-posta bağlantıları)",
        tone: appUrl ? "ok" : "warning",
        state: appUrl ? appUrl : "Tanımsız — sabit varsayılan kullanılır",
        impact: "E-posta içindeki bağlantılar bu adrese gider; alan adı değişirse bağlantılar SESSİZCE yanlış hedefe gider.",
        env: ["NEXT_PUBLIC_APP_URL"],
        klass: "deger",
    });

    const sentry = has(env, "SENTRY_DSN") || has(env, "NEXT_PUBLIC_SENTRY_DSN");
    const sentryEnvMissing = sentry && env.NODE_ENV === "production" && !has(env, "SENTRY_ENVIRONMENT");
    items.push({
        key: "sentry",
        label: "Hata izleme (Sentry)",
        tone: !sentry ? "warning" : sentryEnvMissing ? "warning" : "ok",
        state: !sentry ? "Yapılandırılmamış" : sentryEnvMissing ? "Açık — SENTRY_ENVIRONMENT eksik" : "Açık",
        impact: "Çökme raporları gelmez. Ortam etiketi yoksa dev ve prod hataları aynı gruba düşer.",
        env: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN", "SENTRY_ENVIRONMENT"],
        klass: "deger",
    });

    const parasutEnabled = env.PARASUT_ENABLED === "true";
    const parasutCreds = has(env, "PARASUT_CLIENT_ID") && has(env, "PARASUT_CLIENT_SECRET") && has(env, "PARASUT_COMPANY_ID");
    items.push({
        key: "parasut",
        label: "Paraşüt entegrasyonu",
        tone: !parasutEnabled ? "info" : parasutCreds ? "ok" : "danger",
        state: !parasutEnabled ? "Kapalı (teslim varsayılanı)" : parasutCreds ? "Açık" : "Açık ama kimlik bilgileri eksik",
        impact: "Kapalıyken fatura/tahsilat/stok mutabakatı çalışmaz; go-live `docs/parasut-golive-runbook.md` ile.",
        env: ["PARASUT_ENABLED", "PARASUT_CLIENT_ID", "PARASUT_CLIENT_SECRET", "PARASUT_COMPANY_ID"],
        klass: "deger",
    });

    items.push({
        key: "quote_share",
        label: "Teklif paylaşım bağlantısı anahtarı",
        tone: has(env, "QUOTE_SHARE_SECRET") ? "ok" : "info",
        state: has(env, "QUOTE_SHARE_SECRET") ? "Ayrı tanımlı" : "CRON_SECRET'tan türetiliyor",
        impact: "Ayrı değilse CRON_SECRET döndürüldüğünde paylaşılmış tüm teklif bağlantıları kırılır.",
        env: ["QUOTE_SHARE_SECRET"],
        klass: "deger",
    });

    items.push({
        key: "internal_operator",
        label: "Bakım alanları (Developer Console)",
        tone: has(env, "INTERNAL_OPERATOR_EMAILS") ? "ok" : "info",
        state: has(env, "INTERNAL_OPERATOR_EMAILS") ? "Tanımlı" : "Tanımsız — kimseye açık değil (fail-closed)",
        impact: "Developer Console, E-posta Teslimatları ve API Anahtarları sekmeleri yalnız listedeki kişilere açılır.",
        env: ["INTERNAL_OPERATOR_EMAILS"],
        klass: "deger",
    });

    const summary: Record<SystemStatusTone, number> = { ok: 0, warning: 0, danger: 0, info: 0 };
    for (const it of items) summary[it.tone] += 1;

    return { generatedAt: new Date().toISOString(), items, summary, appUrl };
}

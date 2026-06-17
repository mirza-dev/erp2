/**
 * Route-guard gate BASELINE — guard'sız route'ların bilinçli envanteri.
 *
 * Kural: src/app/api altında guard çağrısı içermeyen her route dosyası bu
 * listede gerekçesiyle yer almak ZORUNDA (route-guard-matrix.test.ts).
 *  - Yeni guard'sız route eklemek → test KIRMIZI (ya guard ekle ya buraya
 *    gerekçeli kayıt düş — code review'da görünür olur).
 *  - Buradaki bir route'a guard eklendiğinde → kayıt STALE olur, test yine
 *    KIRMIZI (kaydı sil; liste yalnız küçülür).
 *
 * Sınıflar:
 *  - "public"        : bilinçli açık (proxy session yine de önde; veri zararsız)
 *  - "self-auth"     : route içinde getUser() ile yalnız KENDİ kaydına erişim
 *  - "redaction"     : permission'a göre alan maskeleme var, kapı yok (bilinçli)
 *  - "cron-proxy"    : yalnız proxy CRON_SECRET'ına güvenir (bulgu D4 — route-içi
 *                      doğrulama eklenince kayıt düşecek)
 *  - "ACIK-BULGU"    : docs/audit/2026-06-guvenlik-dogruluk-bulgulari.md kaydı —
 *                      guard eklenecek; eklenince kayıt silinir
 */
export interface GuardlessRoute {
    /** src/app/api sonrası, /route.ts'siz yol */
    path: string;
    methods: string[];
    cls: "public" | "self-auth" | "redaction" | "cron-proxy" | "ACIK-BULGU";
    reason: string;
}

export const GUARDLESS_BASELINE: GuardlessRoute[] = [
    // ── bilinçli public ────────────────────────────────────────────────
    { path: "alerts", methods: ["GET"], cls: "public", reason: "Sidebar/uyarı listesi — dar kolon, adetler her role açık (tasarım)" },
    { path: "dashboard/counters", methods: ["GET"], cls: "public", reason: "3 sayaç (~100B), fiyat/PII yok — perf turu tasarımı" },
    { path: "dashboard/finance", methods: ["GET"], cls: "redaction", reason: "canViewCosts per-request redaction; currency herkese açık" },
    { path: "auth/me", methods: ["GET"], cls: "public", reason: "Oturum kendi kimliğini okur" },
    { path: "auth/demo", methods: ["GET"], cls: "public", reason: "Demo giriş ucu (cookie set)" },
    { path: "auth/logout", methods: ["POST"], cls: "public", reason: "Oturum kapatma — yan etkisi yalnız kendi session'ı" },
    { path: "exchange-rates", methods: ["GET"], cls: "public", reason: "TCMB kuru — kamusal veri" },
    { path: "email/webhooks/resend", methods: ["POST"], cls: "public", reason: "Public provider callback; Resend Svix imzası route içinde fail-closed doğrulanır" },
    { path: "email/outbox/process", methods: ["POST"], cls: "cron-proxy", reason: "Proxy CRON_PATHS + route-içi requireCronSecret çift guard" },

    // ── self-auth (route içinde getUser, yalnız kendi kaydı) ──────────
    { path: "settings/user/avatar", methods: ["POST"], cls: "self-auth", reason: "getUser() → kendi avatarı" },
    { path: "settings/user/password", methods: ["POST"], cls: "self-auth", reason: "getUser() → kendi şifresi" },
    { path: "settings/user/preferences", methods: ["GET", "PATCH"], cls: "self-auth", reason: "getUser() → kendi tercihleri" },
    { path: "settings/user/profile", methods: ["GET", "PATCH"], cls: "self-auth", reason: "getUser() → kendi profili" },

    // ── redaction (kapı yok, alan maskeleme var — bilinçli) ───────────
    { path: "products/counts", methods: ["GET"], cls: "public", reason: "A1 sunucu sayfalama: yalnız adetler (toplam/kategori/kritik) — fiyat/maliyet yok; products list GET ile aynı sınıf (proxy session önde)" },
    { path: "products/aging", methods: ["GET"], cls: "redaction", reason: "boundCapital/costPrice perm'e göre maskelenir" },
    { path: "products/[id]/quotes", methods: ["GET"], cls: "redaction", reason: "unitPrice/lineTotal view_sales_prices'a göre maskelenir" },

    // ── 410 tombstone (DB erişimi yok — denetim O9 incelemesi: bulgu DEĞİL) ──
    { path: "quotes/[id]/convert", methods: ["POST"], cls: "public", reason: "Saf 410 Gone tombstone (Faz 6 V4-A8); DB/servis çağrısı yok" },

    // ── AÇIK BULGULAR — Y1 turu (2026-06-12) ile KAPANDI: 7 uç requirePermissionFor
    // aldı (demo-dostu varyant: anonim→viewer fallback bilinçli; import uçları
    // viewer'da view_import olmadığından fiilen kapalı). Kayıtlar silindi.
    { path: "products/[id]/attachments/[attachmentId]/url", methods: ["GET"], cls: "public", reason: "O11 KAPANDI: proxy demo-anon'u DEFAULT bloklar (ATTACHMENTS_ALLOW_DEMO_ANON opt-out); oturumlu erişim serbest — route-içi perm guard'ı yok (Y1 genel kapsamında)" },
];

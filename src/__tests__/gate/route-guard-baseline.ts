/**
 * Route-guard gate BASELINE — guard'sız (route-içi yetki kapısı olmayan)
 * HTTP METHOD'larının bilinçli envanteri.
 *
 * A3 (2026-06-19): gate artık METHOD-SEVİYE çalışır (route-guard-matrix.test.ts).
 * `methods` = bu route'ta KASITLI guard'sız bırakılan method listesidir (guard'lı
 * kardeş method'lar — örn. PATCH/DELETE — burada YER ALMAZ). Eski dosya-seviye
 * "bir method guard'lıysa tüm dosya korunmuş" kör noktası kapandı; guard'sız bir
 * GET, guard'lı bir POST'un yanında artık görünür.
 *
 * Kural: src/app/api altında guard çağrısı içermeyen her method bu listede
 * (path + method) gerekçesiyle yer almak ZORUNDA.
 *  - Yeni guard'sız method → test KIRMIZI (ya guard ekle ya buraya gerekçeli kayıt).
 *  - Buradaki bir method'a guard eklenince → kayıt STALE, test yine KIRMIZI (sil;
 *    liste yalnız küçülür). Method artık export edilmiyorsa da STALE.
 *
 * Sınıflar:
 *  - "public"        : bilinçli açık (proxy session yine de önde; veri zararsız/whitelist)
 *  - "self-auth"     : route içinde getUser() ile yalnız KENDİ kaydına erişim
 *  - "redaction"     : permission'a göre alan maskeleme var, kapı yok (bilinçli)
 *  - "cron-proxy"    : yalnız proxy CRON_SECRET'ına güvenir (route-içi doğrulama
 *                      eklenince kayıt düşer)
 *  - "ACIK-BULGU"    : docs/audit kaydı — guard eklenecek; eklenince kayıt silinir
 */
export interface GuardlessRoute {
    /** src/app/api sonrası, /route.ts'siz yol */
    path: string;
    /** bu route'ta KASITLI guard'sız method'lar (method-seviye) */
    methods: string[];
    cls: "public" | "self-auth" | "redaction" | "cron-proxy" | "ACIK-BULGU";
    reason: string;
}

export const GUARDLESS_BASELINE: GuardlessRoute[] = [
    // ── dashboard-tier (tüm-rol dashboard tüketir → guard accounting/production'ı
    //    kırardı; finansal alanlar route'ta per-request redaction'lı) ───────────
    { path: "alerts", methods: ["GET"], cls: "public", reason: "Dashboard AlertsPanel tüm rollerde (useAlerts); dar kolon (ai_reason/user_note yok), adetler. Detay [id] GET view_alerts guard'lı" },
    { path: "products", methods: ["GET"], cls: "redaction", reason: "Dashboard StockPanel tüm rollerde (accounting view_products'sız); price/cost_price redactProductsForPerms ile maskelenir" },
    { path: "products/[id]", methods: ["GET"], cls: "redaction", reason: "Ürün detayı (master data view-tier); price/cost_price redactProductsForPerms; PATCH/DELETE manage_product_master guard'lı" },
    { path: "production", methods: ["GET"], cls: "public", reason: "Dashboard üretim KPI/trend tüm rollerde (useProduction); no-session=viewer floor → view_production guard demo+4 rolü kırar" },
    { path: "products/aging", methods: ["GET"], cls: "redaction", reason: "boundCapital/costPrice/price perm'e göre maskelenir" },
    { path: "products/counts", methods: ["GET"], cls: "public", reason: "A1 sunucu sayfalama: yalnız adetler (toplam/kategori/kritik) — fiyat/maliyet yok" },
    { path: "dashboard/counters", methods: ["GET"], cls: "public", reason: "3 sayaç (~100B), fiyat/PII yok — perf turu tasarımı" },
    { path: "dashboard/finance", methods: ["GET"], cls: "redaction", reason: "canViewCosts per-request redaction; currency herkese açık" },

    // ── collateral (O11 proxy default-flip: demo-anon ATTACHMENTS_ALLOW_DEMO_ANON
    //    dışında 401; ürün datasheet/görsel — finansal değil) ────────────────────
    { path: "products/[id]/attachments", methods: ["GET"], cls: "public", reason: "Ürün eki listesi (datasheet/görsel) + imzalı URL; O11 — yazma (POST) admin/purchaser guard'lı" },
    { path: "products/[id]/attachments/[attachmentId]/url", methods: ["GET"], cls: "public", reason: "O11: proxy demo-anon'u DEFAULT bloklar (ATTACHMENTS_ALLOW_DEMO_ANON opt-out); oturumlu erişim serbest" },

    // ── config / GET-açık (boilerplate/tip tanımı; mutasyonlar manage_* guard'lı) ─
    { path: "note-templates", methods: ["GET"], cls: "public", reason: "Teklif not şablonları (boilerplate metin); CRUD GET-açık tasarım, mutasyonlar admin (manage_quotes)" },
    { path: "note-templates/[id]", methods: ["GET"], cls: "public", reason: "Tekil not şablonu (boilerplate); PATCH/DELETE manage_quotes guard'lı" },
    { path: "product-types", methods: ["GET"], cls: "public", reason: "Ürün tipi tanımları (config); forms/import broadly tüketir, mutasyonlar manage_product_types" },
    { path: "product-types/[id]", methods: ["GET"], cls: "public", reason: "Tekil ürün tipi (config); PATCH/DELETE manage_product_types guard'lı" },
    { path: "product-types/[id]/fields", methods: ["GET"], cls: "public", reason: "Ürün tipi alan şeması (config); POST/PUT manage_product_types guard'lı" },

    // ── settings/company GET (SAFE whitelist — antet/branding) ──────────────────
    { path: "settings/company", methods: ["GET"], cls: "public", reason: "SAFE_COMPANY_FIELDS whitelist (ad/vergi/adres/logo — PDF antet/başlık broadly gerekir; secret/token yok); PATCH manage_settings guard'lı" },

    // ── self-auth (route içinde getUser, yalnız kendi kaydı) ──────────────────
    { path: "settings/user/avatar", methods: ["POST"], cls: "self-auth", reason: "getUser() → kendi avatarı" },
    { path: "settings/user/password", methods: ["POST"], cls: "self-auth", reason: "getUser() → kendi şifresi (+ mevcut-şifre doğrulama)" },
    { path: "settings/user/preferences", methods: ["GET", "PATCH"], cls: "self-auth", reason: "getUser() → kendi tercihleri" },
    { path: "settings/user/profile", methods: ["GET", "PATCH"], cls: "self-auth", reason: "getUser() → kendi profili" },

    // ── bilinçli public ────────────────────────────────────────────────
    { path: "auth/me", methods: ["GET"], cls: "public", reason: "Oturum kendi kimliğini okur" },
    { path: "auth/demo", methods: ["GET"], cls: "public", reason: "Demo giriş ucu (cookie set)" },
    { path: "auth/logout", methods: ["POST"], cls: "public", reason: "Oturum kapatma — yan etkisi yalnız kendi session'ı" },
    { path: "exchange-rates", methods: ["GET"], cls: "public", reason: "TCMB kuru — kamusal veri" },
    { path: "email/webhooks/resend", methods: ["POST"], cls: "public", reason: "Public provider callback; Resend Svix imzası route içinde fail-closed doğrulanır" },

    // ── 410 tombstone (DB erişimi yok — denetim O9: bulgu DEĞİL) ──
    { path: "quotes/[id]/convert", methods: ["POST"], cls: "public", reason: "Saf 410 Gone tombstone (Faz 6 V4-A8); DB/servis çağrısı yok" },
];

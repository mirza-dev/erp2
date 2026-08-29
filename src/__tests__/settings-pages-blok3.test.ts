/**
 * Blok 3 — Bildirimler sekmesi: ölü alan düştü, doğrulanabilir oldu.
 *
 *   6 · `browserEnabled` yüzeyden kalktı (tarayıcı bildirimi hiç yazılmamıştı)
 *   + · "Bana test e-postası gönder" — alıcı YAPISAL olarak oturum sahibi
 *
 * Kaynak-kilidi iddiaları yorum-ayıklamalı (`code()`): Blok 2'de öğrenilen ders
 * (yeşil bir test aslında bir YORUMA eşleşiyormuş) burada da uygulanıyor —
 * özellikle "browserEnabled kaynakta geçmez" iddiası, dosyaların tepesindeki
 * gerekçe yorumları yüzünden aksi hâlde yanlış kırmızı verirdi.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Yorumları düşürür — iddia açıklamaya değil koda bakmalı. */
function code(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const PREFS_LIB = code(read("src/lib/supabase/user-preferences.ts"));
const PREFS_ROUTE = code(read("src/app/api/settings/user/preferences/route.ts"));
const SETTINGS = code(read("src/app/dashboard/settings/page.tsx"));
const SELF_TEST_ROUTE = code(read("src/app/api/settings/user/notifications/test/route.ts"));
const OPERATOR_TEST_ROUTE = code(read("src/app/api/email/test/route.ts"));
const TEST_SERVICE = code(read("src/lib/services/email-test-service.ts"));

// ── Bulgu 6 — ölü alan yüzeyden düştü ───────────────────────────────────────

describe("Bulgu 6 — browserEnabled yüzeyden düştü", () => {
    it("tip, route ve UI kodunda hiç geçmez (yorumlar hariç)", () => {
        for (const [ad, src] of [["lib", PREFS_LIB], ["route", PREFS_ROUTE], ["ui", SETTINGS]] as const) {
            expect(src, `${ad} hâlâ browserEnabled taşıyor`).not.toMatch(/browserEnabled/);
        }
    });

    it("DB kolonu okunmaz ve yazılmaz — kolon yerinde kalır ama sözleşme dışı", () => {
        expect(PREFS_LIB).toMatch(/\.select\("notification_type, email_enabled"\)/);
        expect(PREFS_LIB).not.toMatch(/browser_enabled: /);
    });

    it("NotificationPref yalnız emailEnabled taşır", () => {
        expect(PREFS_LIB).toMatch(/export interface NotificationPref \{\s*type: string;\s*emailEnabled: boolean;\s*\}/);
    });

    it("tarayıcı bildirimi kodu HÂLÂ yok — alan boşuna geri gelmesin", () => {
        // Ölçüm bulgunun temeliydi: alan bir söz veriyordu, karşılığı yoktu.
        const all = [PREFS_LIB, PREFS_ROUTE, SETTINGS].join("\n");
        expect(all).not.toMatch(/new Notification\(|Notification\.requestPermission|serviceWorker|PushManager/);
    });
});

describe("Bulgu 6 — davranış: kaydetme yolu bozulmadı", () => {
    const upsert = vi.fn();
    beforeEach(() => {
        vi.resetModules();
        upsert.mockReset();
    });

    it("dbUpsertUserPrefs satırlarında browser_enabled YOK (DB default'u doldurur)", async () => {
        vi.doMock("@/lib/supabase/service", () => ({
            createServiceClient: () => ({
                from: () => ({ upsert: (rows: unknown[]) => { upsert(rows); return { error: null }; } }),
            }),
        }));
        const { dbUpsertUserPrefs } = await import("@/lib/supabase/user-preferences");
        await dbUpsertUserPrefs("u-1", [{ type: "stock_critical", emailEnabled: false }]);

        const rows = upsert.mock.calls[0][0] as Record<string, unknown>[];
        expect(rows).toHaveLength(1);
        expect(rows[0]).not.toHaveProperty("browser_enabled");
        expect(rows[0]).toMatchObject({ user_id: "u-1", notification_type: "stock_critical", email_enabled: false });
    });
});

// ── Test e-postası ucu ──────────────────────────────────────────────────────

describe("Test e-postası — alıcı yapısal olarak oturum sahibi", () => {
    it("route gövdeyi HİÇ okumaz — keyfi adres gönderilemez", () => {
        // Güvenlik özelliği bir doğrulama kuralı değil, imzanın kendisi:
        // POST() parametresiz, dolayısıyla `to` diye bir girdi yok.
        expect(SELF_TEST_ROUTE).toMatch(/export async function POST\(\)/);
        expect(SELF_TEST_ROUTE).not.toMatch(/request\.json\(\)|safeParseJson/);
        expect(SELF_TEST_ROUTE).toMatch(/to: auth\.user\.email/);
    });

    it("yalnız rolüne uygun tür gönderilir; hiç yoksa 400", () => {
        expect(SELF_TEST_ROUTE).toMatch(/eligibleNotificationTypes\(auth\.roles, internalOperator\)/);
        expect(SELF_TEST_ROUTE).toMatch(/eligible\.length === 0/);
        expect(SELF_TEST_ROUTE).toMatch(/const type = eligible\[0\]/);
    });

    it("oturumsuz 401, hız sınırı 429, config eksik 503", () => {
        expect(SELF_TEST_ROUTE).toMatch(/if \(!auth\.user\?\.email\)[\s\S]{0,120}status: 401/);
        expect(SELF_TEST_ROUTE).toMatch(/rateLimitCheck\(`notif-test:\$\{auth\.user\.id\}`/);
        expect(SELF_TEST_ROUTE).toMatch(/status: 429/);
        expect(SELF_TEST_ROUTE).toMatch(/config_missing[\s\S]{0,200}status: 503/);
    });

    it("iç operatör ucu değişmedi — serbest `to` orada kalır", () => {
        expect(OPERATOR_TEST_ROUTE).toMatch(/requireInternalOperatorFor\(auth\)/);
        expect(OPERATOR_TEST_ROUTE).toMatch(/typeof body\.to === "string"/);
        // Eski sözleşmedeki failed/error ayrımı korundu
        expect(OPERATOR_TEST_ROUTE).toMatch(/status: "error"/);
        expect(TEST_SERVICE).toMatch(/status: "send_error"/);
    });

    it("gönderim gövdesi tek yerde — iki uç aynı helper'ı çağırır", () => {
        expect(TEST_SERVICE).toMatch(/export async function sendSampleNotificationEmail/);
        expect(SELF_TEST_ROUTE).toMatch(/sendSampleNotificationEmail/);
        expect(OPERATOR_TEST_ROUTE).toMatch(/sendSampleNotificationEmail/);
        // Resend yalnız helper'da örneklenir (kopya gönderim yolu yok)
        expect(SELF_TEST_ROUTE).not.toMatch(/new Resend\(/);
        expect(OPERATOR_TEST_ROUTE).not.toMatch(/new Resend\(/);
    });

    it("UI butonu demo guard'lı ve adres göndermez", () => {
        expect(SETTINGS).toMatch(/fetch\("\/api\/settings\/user\/notifications\/test", \{ method: "POST" \}\)/);
        expect(SETTINGS).toMatch(/Bana test e-postası gönder/);
        expect(SETTINGS).toMatch(/if \(isDemo\) \{ toast\(\{ type: "info", message: DEMO_BLOCK_TOAST \}\); return; \}[\s\S]{0,80}isTesting/);
        // Rolüne uygun tür yoksa buton hiç çizilmez
        expect(SETTINGS).toMatch(/\{visibleTypes\.length > 0 && \(/);
    });
});

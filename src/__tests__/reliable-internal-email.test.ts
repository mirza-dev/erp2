import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eligibleNotificationTypes, isEligibleForNotification } from "@/lib/notification-policy";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("internal notification role matrix", () => {
    it("rol matrisini ve viewer fail-closed davranışını uygular", () => {
        expect(isEligibleForNotification("stock_critical", ["purchasing"])).toBe(true);
        expect(isEligibleForNotification("stock_critical", ["sales"])).toBe(false);
        expect(isEligibleForNotification("order_pending", ["sales"])).toBe(true);
        expect(isEligibleForNotification("order_shipped", ["production"])).toBe(true);
        expect(isEligibleForNotification("sync_error", ["accounting"])).toBe(true);
        expect(eligibleNotificationTypes(["viewer"])).toEqual([]);
    });

    it("internal operator yalnız sync_error alır; diğer türler için rol gerekir", () => {
        expect(isEligibleForNotification("sync_error", ["viewer"], true)).toBe(true);
        expect(isEligibleForNotification("order_pending", ["viewer"], true)).toBe(false);
    });
});

describe("reliable internal email source invariants", () => {
    it("taslak sipariş order_new e-postası üretmez; olaylar transition servisinden çıkar", () => {
        const route = source("src/app/api/orders/route.ts");
        const service = source("src/lib/services/order-service.ts");
        expect(route).not.toContain("order_new");
        expect(route).not.toContain("notifyUsersByEmail");
        expect(service).toContain("sales_order:${orderId}:pending_approval");
        expect(service).toContain("sales_order:${orderId}:shipped");
        expect(service).toContain("actorUserId");
        expect(service).toContain("actorLabel");
    });

    it("kritik stok ve Paraşüt olay anahtarı gerçek alert kimliğine bağlıdır", () => {
        expect(source("src/lib/services/alert-service.ts")).toContain("alert:${alert.id}:stock_critical");
        expect(source("src/lib/services/parasut-service.ts")).toContain("alert:${alert.id}:sync_error");
    });

    it("internal alıcı rollerinde ADMIN_EMAILS fallback kullanılmaz", () => {
        const recipients = source("src/lib/supabase/users-with-prefs.ts");
        expect(recipients).toContain("u.app_metadata");
        expect(recipients).not.toContain("process.env.ADMIN_EMAILS");
        expect(recipients).toContain("listUsers({ page, perPage })");
        expect(recipients).toContain("if (batch.length < perPage) break");
    });

    it("migration kalıcı outbox, atomic claim, webhook idempotency ve suppression kurar", () => {
        const sql = source("supabase/migrations/097_internal_email_outbox.sql");
        for (const table of ["notification_outbox", "email_suppressions", "resend_webhook_events", "maintenance_incidents"]) {
            expect(sql).toContain(`create table if not exists ${table}`);
        }
        expect(sql).toContain("for update skip locked");
        expect(sql).toContain("update_email_delivery_from_provider");
        expect(sql).toContain("for update;");
        expect(sql).toContain("delete from user_notification_preferences");
        expect(sql).toContain("where notification_type = 'order_new'");
        expect(sql).toContain("grant execute on function claim_notification_outbox");
    });

    it("worker 5 dakikalık cron ve webhook public doğrulama yoluna bağlıdır", () => {
        expect(source(".github/workflows/crons.yml")).toContain('cron: "*/5 * * * *"');
        expect(source(".github/workflows/crons.yml")).toContain("/api/email/outbox/process");
        const proxy = source("src/proxy.ts");
        expect(proxy).toContain('"/api/email/webhooks/resend"');
        expect(proxy).toContain('"/api/email/outbox/process"');
    });

    it("legacy retry outbox teslimatlarını ikinci kez göndermez; max retry snapshot temizlenir", () => {
        const emailLogs = source("src/lib/supabase/email-logs.ts");
        expect(emailLogs).toContain('.is("outbox_id", null)');
        expect(emailLogs).not.toContain('update.delivery_status = "accepted"');
        expect(emailLogs).toContain('deliveryStatus: "accepted"');
        const outbox = source("src/lib/services/notification-outbox-service.ts");
        expect(outbox).toContain("dbClearEmailSnapshotsForOutbox(event.id)");
        expect(outbox).toContain("idempotencyKey: `internal-email-log-${logId}`");
        expect(outbox).toContain("idempotencyKey: `internal-email-log-${log.id}`");
    });

    it("bildirim tercih UI'sında işlevsiz Tarayıcı kanalı gösterilmez", () => {
        const settings = source("src/app/dashboard/settings/page.tsx");
        expect(settings).not.toContain('<span style={{ textAlign: "center" }}>Tarayıcı</span>');
        expect(settings).toContain("E-posta Bildirimleri");
    });

    it("internal bakım ekranı teslimat filtreleri ve güvenli detay drawer'ı sunar", () => {
        const page = source("src/app/dashboard/settings/email-deliveries/page.tsx");
        for (const query of ['q.set("status"', 'q.set("type"', 'q.set("recipient"', 'q.set("entity"', 'q.set("from"', 'q.set("to"']) {
            expect(page).toContain(query);
        }
        expect(page).toContain('aria-label="E-posta teslimat detayı"');
        expect(page).toContain("Güvenli hata özeti");
        const proxy = source("src/proxy.ts");
        expect(proxy).toContain('pathname.startsWith("/dashboard/settings/email-deliveries")');
        expect(proxy).toContain("!hasInternalOperatorAccess(user.email, perms)");
    });
});

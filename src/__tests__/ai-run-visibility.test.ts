/**
 * AI görünürlüğü (2026-08-24).
 *
 * AI bulgu üretimi iki aydır hiç koşmamıştı (`alert_findings` son koşu
 * 2026-06-24) ve kullanıcı bunu hiçbir ekrandan göremiyordu: boş AI sekmesi
 * "AI bir şey bulamadı" gibi görünüyordu. Ayrıca AI çağrısı patladığında UI
 * yeşil "0 AI önerisi oluşturuldu" toast'ı basıyordu — "bulgu yok" ile
 * "AI cevap veremedi" ayırt edilemiyordu.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { formatRelativeAiRun } from "@/lib/alert-calendar";

const root = process.cwd();
const PROXY_SRC = readFileSync(join(root, "src/proxy.ts"), "utf8");
const PAGE_SRC = readFileSync(join(root, "src/app/dashboard/alerts/page.tsx"), "utf8");
const DRAWER_SRC = readFileSync(join(root, "src/components/alerts/AlertCalendarDrawer.tsx"), "utf8");

describe("formatRelativeAiRun", () => {
    const now = new Date("2026-08-24T12:00:00Z");
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

    it("dakika / saat / gün eşikleri", () => {
        expect(formatRelativeAiRun(ago(30_000), now)).toBe("az önce");
        expect(formatRelativeAiRun(ago(5 * MIN), now)).toBe("5 dakika önce");
        expect(formatRelativeAiRun(ago(3 * HOUR), now)).toBe("3 saat önce");
        expect(formatRelativeAiRun(ago(DAY + HOUR), now)).toBe("dün");
        expect(formatRelativeAiRun(ago(5 * DAY), now)).toBe("5 gün önce");
    });

    it("asıl vaka: iki ay önceki koşu net görünür", () => {
        expect(formatRelativeAiRun(ago(61 * DAY), now)).toBe("2 ay önce");
    });

    it("yıl eşiği", () => {
        expect(formatRelativeAiRun(ago(400 * DAY), now)).toBe("1 yıl önce");
    });

    it("gelecek tarih / bozuk girdi çökmez", () => {
        expect(formatRelativeAiRun(ago(-5 * MIN), now)).toBe("az önce");
        expect(formatRelativeAiRun("bozuk", now)).toBe("—");
    });
});

describe("ai-suggest ucuna UI'dan erişim", () => {
    it("CRON_PATHS'ten ÇIKARILDI (her tık 401 veriyordu)", () => {
        const cronBlock = PROXY_SRC.slice(
            PROXY_SRC.indexOf("const CRON_PATHS"),
            PROXY_SRC.indexOf("];", PROXY_SRC.indexOf("const CRON_PATHS")),
        );
        expect(cronBlock).not.toContain("ai-suggest");
    });

    it("scan ile aynı listede — kendi kimlik doğrulamasını yapar", () => {
        const publicLine = PROXY_SRC.split("\n").find(l => l.includes("const ALWAYS_PUBLIC"))!;
        expect(publicLine).toContain("/api/alerts/scan");
        expect(publicLine).toContain("/api/alerts/ai-suggest");
    });

    it("diğer cron uçları CRON_PATHS'te KALDI (kapsam sızmadı)", () => {
        const cronBlock = PROXY_SRC.slice(PROXY_SRC.indexOf("const CRON_PATHS"));
        for (const p of ["/api/parasut/sync-all", "/api/quotes/expire", "/api/email/outbox/process"]) {
            expect(cronBlock).toContain(p);
        }
    });
});

describe("uyarılar sayfası — AI durumu görünür", () => {
    it("son AI analizi ekranda gösterilir", () => {
        expect(PAGE_SRC).toMatch(/Son AI analizi: \$\{formatRelativeAiRun\(aiLastRunAt\)\}/);
        expect(PAGE_SRC).toMatch(/AI analizi henüz hiç çalışmadı/);
    });

    it("AI patlayınca YEŞİL 'oluşturuldu' toast'ı basmaz", () => {
        expect(PAGE_SRC).toMatch(/if \(data\.degraded\) \{[\s\S]{0,220}type: "warning"/);
        expect(PAGE_SRC).toMatch(/AI şu an cevap veremedi — mevcut bulgular korundu/);
    });

    it("bulgu yokken 'başarı' değil 'bilgi' tonu kullanılır", () => {
        expect(PAGE_SRC).toMatch(/AI analizi tamamlandı — yeni bulgu yok/);
    });

    it("24 saatten eski analiz sayfa açılışında BİR KEZ tetiklenir", () => {
        expect(PAGE_SRC).toMatch(/24 \* 60 \* 60 \* 1000/);
        expect(PAGE_SRC).toMatch(/aiAutoRunRef\.current = true;/);
    });

    it("demo modda otomatik tetikleme YOK", () => {
        expect(PAGE_SRC).toMatch(/if \(isDemo\) return;\s*\n\s*let alive = true;/);
    });
});

describe("Öneriler ↔ Uyarılar çapraz linki", () => {
    it("drawer ürün için aktif öneriyi sorar", () => {
        expect(DRAWER_SRC).toMatch(/\/api\/products\/\$\{entityId\}\/recommendation/);
    });

    it("öneri varsa ona götüren link gösterilir", () => {
        expect(DRAWER_SRC).toMatch(/Bu ürün için satın alma önerisi var/);
    });

    it("çapraz link varken genel 'Satın Alma Planla' TEKRARLANMAZ", () => {
        expect(DRAWER_SRC).toMatch(
            /\.filter\(l => !\(linkedRec && l\.href === "\/dashboard\/purchase\/suggested"\)\)/,
        );
    });

    it("öneri sorgusu başarısızsa drawer normal çalışır (sessiz)", () => {
        expect(DRAWER_SRC).toMatch(/if \(!res\.ok\) return;\s*\/\/ yetki yok/);
    });
});

import { describe, it, expect } from "vitest";
import {
    parseTimeMinutes,
    timeFromISO,
    toLocalDate,
    isSameDate,
    isToday,
    formatDateShort,
    formatDateFull,
    expandAlertOccurrences,
    getOccurrencesForDate,
    sortOccurrences,
    topSeverity,
    getMonthDays,
    getCalendarStats,
    dueCountdownLabel,
    eventLabel,
    ALERT_CLASSES,
    SEVERITY_CONFIG,
    type CalendarAlert,
} from "@/lib/alert-calendar";

function makeAlert(over: Partial<CalendarAlert> = {}): CalendarAlert {
    return {
        id: "a1",
        type: "stock_critical",
        severity: "critical",
        status: "open",
        title: "Kritik Stok: Vana",
        reason: "Stok düşük",
        impact: "~2 gün",
        date: "2026-06-07T15:25:00.000Z",
        time: "18:25",
        resolution: null,
        dueDate: null,
        dueLabel: null,
        orderCode: null,
        entityId: "p1",
        entityType: "product",
        product: null,
        source: null,
        aiConfidence: null,
        aiReason: null,
        aiModelVersion: null,
        ...over,
    };
}

describe("parseTimeMinutes", () => {
    it("HH:MM → dakika", () => {
        expect(parseTimeMinutes("00:00")).toBe(0);
        expect(parseTimeMinutes("01:30")).toBe(90);
        expect(parseTimeMinutes("23:59")).toBe(1439);
    });
    it("boş/geçersiz → 0", () => {
        expect(parseTimeMinutes("")).toBe(0);
        expect(parseTimeMinutes(null)).toBe(0);
        expect(parseTimeMinutes(undefined)).toBe(0);
        expect(parseTimeMinutes("abc")).toBe(0);
    });
});

describe("timeFromISO", () => {
    it("yerel HH:MM döner", () => {
        // 2026-06-07T09:05:00 yerel — TZ bağımsız test için local timestamp kullan
        const d = new Date(2026, 5, 7, 9, 5, 0);
        expect(timeFromISO(d.toISOString())).toBe("09:05");
    });
    it("geçersiz → boş string", () => {
        expect(timeFromISO("")).toBe("");
        expect(timeFromISO(null)).toBe("");
        expect(timeFromISO("not-a-date")).toBe("");
    });
});

describe("toLocalDate", () => {
    it("date-only string yerel gece yarısı (UTC kayması yok)", () => {
        const d = toLocalDate("2026-06-10");
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(5);
        expect(d.getDate()).toBe(10);
        expect(d.getHours()).toBe(0);
    });
    it("timestamp parse edilir", () => {
        const local = new Date(2026, 5, 7, 15, 25, 0);
        const parsed = toLocalDate(local.toISOString());
        expect(isSameDate(parsed, local)).toBe(true);
    });
});

describe("isSameDate / isToday", () => {
    it("aynı gün true, farklı gün false", () => {
        expect(isSameDate(new Date(2026, 5, 7), new Date(2026, 5, 7, 23, 59))).toBe(true);
        expect(isSameDate(new Date(2026, 5, 7), new Date(2026, 5, 8))).toBe(false);
    });
    it("isToday now parametresiyle", () => {
        const now = new Date(2026, 5, 7, 10);
        expect(isToday(new Date(2026, 5, 7), now)).toBe(true);
        expect(isToday(new Date(2026, 5, 8), now)).toBe(false);
    });
});

describe("format*", () => {
    it("formatDateShort", () => {
        expect(formatDateShort(new Date(2026, 5, 1))).toBe("1 Haziran");
    });
    it("formatDateFull gün adı Pzt-bazlı", () => {
        // 7 Haziran 2026 = Pazar
        expect(formatDateFull(new Date(2026, 5, 7))).toBe("7 Haziran, Pazar");
        // 1 Haziran 2026 = Pazartesi
        expect(formatDateFull(new Date(2026, 5, 1))).toBe("1 Haziran, Pazartesi");
    });
});

describe("expandAlertOccurrences", () => {
    it("hedefsiz uyarı yalnız event üretir", () => {
        const occ = expandAlertOccurrences([makeAlert()]);
        expect(occ).toHaveLength(1);
        expect(occ[0].occKind).toBe("event");
    });
    it("hedefli uyarı event + due üretir", () => {
        const occ = expandAlertOccurrences([
            makeAlert({ date: "2026-06-04T08:00:00.000Z", dueDate: "2026-06-10", dueLabel: "Teslim" }),
        ]);
        expect(occ).toHaveLength(2);
        expect(occ.map((o) => o.occKind).sort()).toEqual(["due", "event"]);
        const due = occ.find((o) => o.occKind === "due")!;
        expect(due.occDate).toBe("2026-06-10");
    });
    it("hedef==olay günü ise due üretilmez", () => {
        const local = new Date(2026, 5, 10, 9, 0);
        const occ = expandAlertOccurrences([
            makeAlert({ date: local.toISOString(), dueDate: "2026-06-10" }),
        ]);
        expect(occ).toHaveLength(1);
        expect(occ[0].occKind).toBe("event");
    });
});

describe("getOccurrencesForDate", () => {
    it("yalnız o güne düşenleri döner (event + due ayrı günlerde)", () => {
        const occ = expandAlertOccurrences([
            makeAlert({ id: "x", date: new Date(2026, 5, 4, 8).toISOString(), dueDate: "2026-06-10" }),
        ]);
        expect(getOccurrencesForDate(occ, new Date(2026, 5, 4))).toHaveLength(1);
        expect(getOccurrencesForDate(occ, new Date(2026, 5, 10))).toHaveLength(1);
        expect(getOccurrencesForDate(occ, new Date(2026, 5, 5))).toHaveLength(0);
    });
});

describe("sortOccurrences", () => {
    it("önce severity sonra saat; due gün sonuna sabitlenir", () => {
        const base = (over: Partial<CalendarAlert>, kind: "event" | "due" = "event") => ({
            ...makeAlert(over),
            occDate: over.date ?? makeAlert().date,
            occKind: kind,
        });
        const items = [
            base({ id: "w", severity: "warning", time: "08:00" }),
            base({ id: "c2", severity: "critical", time: "14:00" }),
            base({ id: "c1", severity: "critical", time: "09:00" }),
            base({ id: "cd", severity: "critical", dueDate: "2026-07-01" }, "due"),
        ];
        const sorted = sortOccurrences(items as never);
        expect(sorted.map((s) => s.id)).toEqual(["c1", "c2", "cd", "w"]);
    });
});

describe("topSeverity", () => {
    it("en yüksek severity", () => {
        expect(topSeverity([{ severity: "info" }, { severity: "warning" }])).toBe("warning");
        expect(topSeverity([{ severity: "warning" }, { severity: "critical" }])).toBe("critical");
        expect(topSeverity([{ severity: "info" }])).toBe("info");
    });
});

describe("getMonthDays", () => {
    it("Haziran 2026 (Pzt başı) 35 hücre", () => {
        // 1 Haziran 2026 Pazartesi → tam hizalı, 30 gün → 35 hücre
        const days = getMonthDays(2026, 5);
        expect(days).toHaveLength(35);
        expect(days[0].date.getDate()).toBe(1);
        expect(days[0].current).toBe(true);
    });
    it("önceki/sonraki ay günleri current=false ile doldurulur", () => {
        // Ağustos 2026: 1 Ağustos Cumartesi → başta 5 önceki-ay günü
        const days = getMonthDays(2026, 7);
        expect(days.length === 35 || days.length === 42).toBe(true);
        expect(days[0].current).toBe(false);
        const firstCurrent = days.find((d) => d.current)!;
        expect(firstCurrent.date.getDate()).toBe(1);
    });
    it("6 satır gereken ay 42 hücre", () => {
        // Ağustos 2026: 1 Ağustos Cumartesi (startDow 5) + 31 gün = 36 > 35 → 42
        const days = getMonthDays(2026, 7);
        expect(days).toHaveLength(42);
    });
});

describe("getCalendarStats", () => {
    it("açık=open+acknowledged, resolved ayrı", () => {
        const alerts = [
            makeAlert({ id: "1", severity: "critical", status: "open" }),
            makeAlert({ id: "2", severity: "warning", status: "acknowledged" }),
            makeAlert({ id: "3", severity: "critical", status: "resolved" }),
            makeAlert({ id: "4", severity: "info", status: "dismissed" }),
        ];
        const s = getCalendarStats(alerts);
        expect(s.total).toBe(2);
        expect(s.critical).toBe(1);
        expect(s.warning).toBe(1);
        expect(s.resolved).toBe(1);
    });
});

describe("dueCountdownLabel", () => {
    const now = new Date(2026, 5, 7, 12);
    it("bugün/yarın/sonra/dün/gecikme", () => {
        expect(dueCountdownLabel("2026-06-07", now)).toBe("Bugün — hedef gün");
        expect(dueCountdownLabel("2026-06-08", now)).toBe("Yarın");
        expect(dueCountdownLabel("2026-06-12", now)).toBe("5 gün sonra");
        expect(dueCountdownLabel("2026-06-06", now)).toBe("Dün geçti");
        expect(dueCountdownLabel("2026-06-02", now)).toBe("5 gün gecikme");
    });
});

describe("eventLabel", () => {
    it("product > orderCode > title", () => {
        expect(eventLabel(makeAlert({ product: { name: "Vana DN50", sku: "V-50", available: 1, minStock: 5, reserved: 0, unit: "adet", coverageDays: 2 } }))).toBe("Vana DN50");
        expect(eventLabel(makeAlert({ product: null, orderCode: "TKL-1" }))).toBe("TKL-1");
        expect(eventLabel(makeAlert({ product: null, orderCode: null, title: "Kritik Stok: Vana" }))).toBe("Vana");
    });
});

describe("constants", () => {
    it("ALERT_CLASSES tüm tipleri kapsar", () => {
        const covered = ALERT_CLASSES.flatMap((c) => c.types ?? []);
        ["stock_critical", "stock_risk", "order_shortage", "order_deadline", "overdue_shipment", "quote_expired", "sync_issue", "purchase_recommended"].forEach((t) => {
            expect(covered).toContain(t);
        });
    });
    it("SEVERITY_CONFIG 3 seviye + CSS var", () => {
        expect(SEVERITY_CONFIG.critical.color).toBe("var(--danger)");
        expect(SEVERITY_CONFIG.warning.text).toBe("var(--warning-text)");
        expect(SEVERITY_CONFIG.info.bg).toBe("var(--accent-bg)");
    });
});

import { test, expect } from "@playwright/test";

function localDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

test("güne tıklama notları ayrı gösterir; saat bazlı uyarı sırası korunur", async ({ page }) => {
    const today = new Date();
    const date = localDateString(today);
    const at = (hour: number, minute: number) =>
        new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute).toISOString();

    await page.route("**/api/products", (route) => route.fulfill({ json: [] }));
    await page.route(/\/api\/calendar-notes(?:\?.*)?$/, (route) => route.fulfill({
        json: [{
            id: "note-smoke", title: "Yönetim toplantısı", description: "Bütçe gündemi",
            noteDate: date, noteTime: "09:00", visibility: "company", ownerLabel: "Ayşe Yılmaz",
            createdAt: at(7, 0), updatedAt: at(7, 0), canManage: true,
        }],
    }));
    await page.route("**/api/alerts/calendar", (route) => route.fulfill({
        json: [
            {
                id: "alert-late", type: "sync_issue", severity: "warning", status: "open",
                title: "Geç uyarı", description: "Saat 16 uyarısı", entity_type: null, entity_id: null,
                source: "system", created_at: at(16, 0), due_date: null, due_label: null, order_code: null,
                resolution_reason: null, ai_confidence: null, ai_reason: null, ai_model_version: null,
            },
            {
                id: "alert-early", type: "sync_issue", severity: "critical", status: "open",
                title: "Erken uyarı", description: "Saat 08 uyarısı", entity_type: null, entity_id: null,
                source: "system", created_at: at(8, 15), due_date: null, due_label: null, order_code: null,
                resolution_reason: null, ai_confidence: null, ai_reason: null, ai_model_version: null,
            },
        ],
    }));

    await page.goto("/dashboard/alerts");
    const dayButton = page.getByRole("button", { name: new RegExp(`^${today.getDate()} —`) });
    await expect(dayButton).toBeVisible();
    await dayButton.click();

    await expect(page.getByText("Yönetim toplantısı", { exact: true })).toBeVisible();
    const timeline = page.getByTestId("hourly-alert-timeline");
    await expect(timeline).toBeVisible();
    const text = await timeline.innerText();
    expect(text.indexOf("08:15")).toBeLessThan(text.indexOf("16:00"));
    expect(text).not.toContain("Yönetim toplantısı");
});

test("yeni not formu kişisel görünürlükle açılır", async ({ page }) => {
    await page.route(/\/api\/calendar-notes(?:\?.*)?$/, (route) => route.fulfill({ json: [] }));
    await page.goto("/dashboard/alerts");
    await page.getByTitle("Takvime not ekle").click();
    await expect(page.getByRole("dialog", { name: "Yeni takvim notu" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Yalnız ben/ })).toHaveAttribute("aria-pressed", "true");
});

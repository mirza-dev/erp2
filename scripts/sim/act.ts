/**
 * Çalışanın YAPABİLDİKLERİ — insan fiilleri.
 *
 * Hedefleme YALNIZ görünür etiketle yapılır (`getByRole`/`getByLabel`).
 * CSS seçici, id, test-id KULLANILMAZ: bir çalışan da kullanamaz.
 *
 * Bir kontrol etiketiyle bulunamazsa telafi edilmez — "bulamadım, ekranda
 * şunlar var" diye raporlanır. Bu kayıt bulgunun kendisidir.
 */
import type { Page } from "@playwright/test";
import { perceive, readNotices } from "./perceive";
import { APP_URL } from "./roles";

const SETTLE_MS = 1200;

async function settle(page: Page): Promise<void> {
    try { await page.waitForLoadState("networkidle", { timeout: 6000 }); }
    catch { /* uzun süren istek olabilir — yine de devam */ }
    await page.waitForTimeout(400);
}

/** Eylem sonrası: bildirimi yakala (toast 3 sn'de kaybolur) + sayfayı oku. */
async function afterAction(page: Page, what: string): Promise<string> {
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
        const n = await readNotices(page);
        for (const x of n) if (!seen.includes(x)) seen.push(x);
        if (seen.length) break;
        await page.waitForTimeout(250);
    }
    await settle(page);
    const view = await perceive(page, { menu: false });
    const head = seen.length
        ? `✔ ${what}\n⚑ ÇIKAN BİLDİRİM: ${seen.join(" | ")}\n\n`
        : `✔ ${what}\n(hiçbir bildirim çıkmadı)\n\n`;
    return head + view;
}

function notFound(kind: string, target: string, available: string[]): string {
    return [
        `✖ "${target}" adında ${kind} BULAMADIM.`,
        available.length
            ? `Ekranda şunlar var: ${available.join(" · ")}`
            : `Ekranda hiç ${kind} görünmüyor.`,
        "",
        "(Bu bir bulgu olabilir: aradığın kontrol yok, adı farklı ya da görünmüyor.)",
    ].join("\n");
}

async function visibleButtons(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const out: string[] = [];
        for (const b of Array.from(document.querySelectorAll('button, [role="button"], a, input[type="submit"]'))) {
            const r = b.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const t = (b.textContent ?? "").replace(/\s+/g, " ").trim() || b.getAttribute("aria-label") || "";
            if (t && !out.includes(t)) out.push(t);
        }
        return out.slice(0, 60);
    });
}

async function visibleFieldLabels(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const out: string[] = [];
        const txt = (e: Element | null) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
        for (const el of Array.from(document.querySelectorAll("input, select, textarea"))) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (el.getAttribute("type") === "hidden") continue;
            const id = el.getAttribute("id");
            let l = "";
            if (id) l = txt(document.querySelector(`label[for="${CSS.escape(id)}"]`));
            if (!l) l = txt(el.closest("label"));
            if (!l) l = el.getAttribute("aria-label") ?? "";
            if (!l) l = el.getAttribute("placeholder") ?? "";
            if (l && !out.includes(l)) out.push(l);
        }
        return out.slice(0, 60);
    });
}

/** Menü etiketine ya da doğrudan adrese git. */
export async function git(page: Page, target: string): Promise<string> {
    if (target.startsWith("/")) {
        await page.goto(APP_URL + target, { waitUntil: "domcontentloaded" });
        await settle(page);
        return afterAction(page, `${target} adresine gittim`);
    }
    const link = page.locator("nav a, aside a").filter({ hasText: target }).first();
    if (await link.count() === 0) {
        const menu = await page.evaluate(() => Array.from(document.querySelectorAll("nav a, aside a"))
            .map(a => (a.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean));
        return notFound("menü girdisi", target, menu);
    }
    await link.click();
    await settle(page);
    return afterAction(page, `sol menüden "${target}" bölümüne girdim`);
}

export async function bak(page: Page): Promise<string> {
    await settle(page);
    return perceive(page);
}

/**
 * Açık bir pencere (modal) var mı?
 *
 * Modal, sayfanın ÜSTÜNÜ kaplar: arkadaki aynı etiketli düğme görünür kalır ama
 * tıklanamaz. Bir insan da önündeki pencereye basar, arkasındakine değil —
 * bu yüzden pencere açıkken hedef ONUN İÇİNDE aranır.
 */
async function modalScope(page: Page) {
    const dialog = page.locator('[role="dialog"], [aria-modal="true"]').last();
    if (await dialog.count() > 0 && await dialog.isVisible().catch(() => false)) return dialog;

    // role="dialog" taşımayan pencereler için: sayfanın üstünü kaplayan,
    // yüksek z-index'li, düğme barındıran en dıştaki sabit kapsayıcı.
    const has = await page.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll("body > div, body > div *"))) {
            const s = getComputedStyle(el);
            if (s.position !== "fixed") continue;
            if ((parseInt(s.zIndex, 10) || 0) < 100) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 200 || r.height < 100) continue;      // toast değil, pencere
            if (el.querySelectorAll("button").length === 0) continue;
            return true;
        }
        return false;
    }).catch(() => false);
    return has ? page.locator("body") : null;
}

export async function tikla(page: Page, label: string): Promise<string> {
    // SIRA ÖNEMLİ (Gün 1 dersi): önce SAYFA İÇERİĞİ, sonra tüm sayfa.
    // Ayrıca sekme rolü bağlantıdan ÖNCE denenir. Aksi halde ürün detayındaki
    // "Teknik" sekmesi, sol menüdeki "Teknik Şablonlar" BAĞLANTISIYLA eşleşip
    // kullanıcıyı bambaşka bir sayfaya götürüyordu — bir insanın önündeki
    // sekmeye basarken yapmayacağı şey. Ana içerikte tam-eşleşme en öncelikli.
    // Pencere açıksa ONUN içinde ara; kapalıysa ana içerikte.
    const modal = await modalScope(page);
    const main = page.locator("main").first();
    const scope = modal ?? ((await main.count()) > 0 ? main : page.locator("body"));
    // Pencere açıkken aynı etiketli düğmenin ARKADAKİ kopyası kapalıdır; modal
    // DOM'da en sonda durduğu için son eşleşme doğru olandır.
    const pick = (l: ReturnType<typeof page.getByRole>) => (modal ? l.last() : l.first());
    const tries = [
        pick(scope.getByRole("tab",    { name: label, exact: true })),
        pick(scope.getByRole("button", { name: label, exact: true })),
        pick(scope.getByRole("link",   { name: label, exact: true })),
        pick(scope.getByRole("tab",    { name: label })),
        pick(scope.getByRole("button", { name: label })),
        pick(scope.getByRole("link",   { name: label })),
        pick(page.getByRole("tab",     { name: label })),
        pick(page.getByRole("button",  { name: label })),
        pick(page.getByRole("link",    { name: label })),
        scope.getByText(label, { exact: false }).first(),
    ];
    for (const t of tries) {
        if (await t.count() === 0) continue;
        try {
            if (!(await t.isVisible())) continue;
            if (await t.isDisabled().catch(() => false)) {
                return `✖ "${label}" düğmesi ekranda var ama PASİF (tıklanamıyor).\n\n(Bu bir bulgu olabilir: neden pasif olduğu ekranda yazmıyorsa kullanıcı anlamaz.)`;
            }
            await t.click({ timeout: 8000 });
            return afterAction(page, `"${label}" düğmesine bastım`);
        } catch { /* sıradakini dene */ }
    }
    return notFound("düğme/bağlantı", label, await visibleButtons(page));
}

/** Tabloda bir metni içeren satıra tıkla — kayıt açmanın insan yolu. */
export async function satir(page: Page, text: string): Promise<string> {
    const row = page.locator("tbody tr").filter({ hasText: text }).first();
    if (await row.count() === 0) {
        const seen = await page.evaluate(() => Array.from(document.querySelectorAll("tbody tr"))
            .slice(0, 15).map(r => (r.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80)));
        return notFound("tablo satırı", text, seen);
    }
    const link = row.locator("a").first();
    if (await link.count() > 0 && await link.isVisible()) await link.click();
    else await row.click();
    await settle(page);
    return afterAction(page, `"${text}" satırını açtım`);
}

export async function yaz(page: Page, label: string, value: string): Promise<string> {
    const modal = await modalScope(page);
    const p = (l: ReturnType<typeof page.getByLabel>) => (modal ? l.last() : l.first());
    const tries = [
        p(page.getByLabel(label, { exact: false })),
        p(page.getByPlaceholder(label, { exact: false })),
        p(page.getByRole("textbox", { name: label })),
    ];
    for (const t of tries) {
        if (await t.count() === 0) continue;
        try {
            if (!(await t.isVisible())) continue;
            // GERÇEK TUŞ VURUŞU — fill() bazı formlarda React state'ini
            // güncellemiyor (değer DOM'a girer, onChange tetiklenmez).
            // İnsan da tuşla yazar; harness insanı taklit eder.
            await t.click({ timeout: 8000 });
            await t.press("ControlOrMeta+a").catch(() => null);
            await t.press("Delete").catch(() => null);
            if (value) await t.pressSequentially(value, { delay: 12, timeout: 15000 });
            await page.waitForTimeout(300);
            return afterAction(page, `"${label}" alanına "${value}" yazdım`);
        } catch { /* sıradaki */ }
    }
    return notFound("doldurulacak alan", label, await visibleFieldLabels(page));
}

export async function sec(page: Page, label: string, value: string): Promise<string> {
    const t = page.getByLabel(label, { exact: false }).first();
    if (await t.count() === 0) return notFound("seçim alanı", label, await visibleFieldLabels(page));
    try {
        await t.selectOption({ label: value }, { timeout: 6000 });
    } catch {
        try { await t.selectOption(value, { timeout: 6000 }); }
        catch {
            const opts = await t.evaluate((e: HTMLSelectElement) =>
                Array.from(e.options ?? []).map(o => o.textContent?.trim() ?? "")).catch(() => [] as string[]);
            return notFound(`"${label}" içinde seçenek`, value, opts);
        }
    }
    await page.waitForTimeout(300);
    return afterAction(page, `"${label}" alanında "${value}" seçtim`);
}

export async function isaretle(page: Page, label: string): Promise<string> {
    const modal = await modalScope(page);
    const base = page.getByLabel(label, { exact: false });
    const t = modal ? base.last() : base.first();
    if (await t.count() === 0) return notFound("kutucuk", label, await visibleFieldLabels(page));
    await t.click({ timeout: 6000 });
    return afterAction(page, `"${label}" kutucuğunu değiştirdim`);
}

export async function ara(page: Page, text: string): Promise<string> {
    const t = page.locator('input[type="search"], input[placeholder*="ra" i], input[placeholder*="Filtre" i]').first();
    if (await t.count() === 0) return notFound("arama kutusu", "arama", await visibleFieldLabels(page));
    await t.fill(text);
    await page.waitForTimeout(800);
    await settle(page);
    return afterAction(page, `"${text}" diye arattım`);
}

export async function geri(page: Page): Promise<string> {
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
    await settle(page);
    return afterAction(page, "bir önceki sayfaya döndüm");
}

export async function bekle(page: Page, sec = 3): Promise<string> {
    await page.waitForTimeout(Math.min(sec, 15) * 1000);
    return afterAction(page, `${sec} saniye bekledim`);
}

export async function ekran(page: Page, file: string): Promise<string> {
    await page.screenshot({ path: file, fullPage: true });
    return `📷 Ekran görüntüsü alındı: ${file}`;
}

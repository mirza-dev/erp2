/**
 * Sayfayı İNSAN DİLİNE çevirir.
 *
 * Bu dosyanın tek kuralı var: çıktıda **selector, DOM, sınıf adı, kod
 * görünmez**. Ajan ekranda ne varsa onu görür — bir çalışanın gördüğünü.
 *
 * Etiketiyle bulunamayan kontrol "(etiketsiz)" diye raporlanır; bu bir
 * telafi değil, KAYIT — kullanılabilirlik bulgusunun ta kendisi.
 */
import type { Page } from "@playwright/test";

export interface Snapshot {
    url: string;
    pageTitle: string;
    headings: string[];
    screenText: string;
    tables: { caption: string; headers: string[]; rows: string[][]; total: number }[];
    fields: { label: string; kind: string; value: string; options?: string[]; required: boolean }[];
    buttons: string[];
    links: string[];
    menu: string[];
    notices: string[];
}

const MAX_ROWS = 25;
const MAX_TEXT = 4000;

/** Tarayıcı içinde koşar — sayfadan ham yapıyı toplar. */
async function grab(page: Page): Promise<Snapshot> {
    return page.evaluate(({ maxRows }) => {
        const vis = (el: Element): boolean => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
        };
        const txt = (el: Element | null): string =>
            (el?.textContent ?? "").replace(/\s+/g, " ").trim();

        // ── Bildirimler: toast'lar ve modallar (fixed + yüksek z-index) ──────
        const notices: string[] = [];
        for (const el of Array.from(document.querySelectorAll("body *"))) {
            const s = getComputedStyle(el);
            if (s.position !== "fixed") continue;
            if ((parseInt(s.zIndex, 10) || 0) < 100) continue;
            if (!vis(el)) continue;
            // en dıştaki fixed kapsayıcıyı al, iç içe tekrarı önle
            if (el.parentElement && el.parentElement.closest("body *") &&
                getComputedStyle(el.parentElement).position === "fixed") continue;
            const t = txt(el);
            if (t && t.length < 600 && !notices.includes(t)) notices.push(t);
        }

        // ── Menü (kenar çubuğu) ─────────────────────────────────────────────
        const navEls = Array.from(document.querySelectorAll("nav, aside"));
        const menu: string[] = [];
        for (const nav of navEls) {
            for (const a of Array.from(nav.querySelectorAll("a, button"))) {
                if (!vis(a)) continue;
                const t = txt(a);
                if (t && !menu.includes(t)) menu.push(t);
            }
        }
        const inNav = (el: Element) => navEls.some(n => n.contains(el));

        // ── Ana içerik alanı ────────────────────────────────────────────────
        const main = document.querySelector("main") ?? document.body;

        // ── Başlıklar ───────────────────────────────────────────────────────
        const headings = Array.from(main.querySelectorAll("h1,h2,h3,h4"))
            .filter(vis).map(txt).filter(Boolean).slice(0, 25);

        // ── Tablolar ────────────────────────────────────────────────────────
        const tables: Snapshot["tables"] = [];
        for (const tb of Array.from(main.querySelectorAll("table"))) {
            if (!vis(tb)) continue;
            const headers = Array.from(tb.querySelectorAll("thead th, thead td"))
                .map(txt).filter(Boolean);
            const trs = Array.from(tb.querySelectorAll("tbody tr")).filter(vis);
            const rows = trs.slice(0, maxRows).map(tr =>
                Array.from(tr.querySelectorAll("td, th")).map(txt));
            let caption = txt(tb.querySelector("caption"));
            if (!caption) {
                // en yakın önceki başlık tabloyu adlandırır
                let n: Element | null = tb;
                while (n && !caption) {
                    const prev: Element | null = n.previousElementSibling;
                    if (prev) {
                        const h = prev.matches("h1,h2,h3,h4") ? prev : prev.querySelector("h1,h2,h3,h4");
                        if (h) caption = txt(h);
                    }
                    n = n.parentElement;
                    if (n === main) break;
                }
            }
            tables.push({ caption, headers, rows, total: trs.length });
        }

        // ── Form alanları ───────────────────────────────────────────────────
        const labelFor = (el: Element): string => {
            const id = el.getAttribute("id");
            if (id) {
                const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
                if (l) return txt(l);
            }
            const wrap = el.closest("label");
            if (wrap) return txt(wrap).replace(txt(el), "").trim();
            const aria = el.getAttribute("aria-label");
            if (aria) return aria.trim();
            const lb = el.getAttribute("aria-labelledby");
            if (lb) {
                const t = lb.split(/\s+/).map(i => txt(document.getElementById(i))).join(" ").trim();
                if (t) return t;
            }
            const ph = el.getAttribute("placeholder");
            if (ph) return `${ph} (yer tutucu)`;
            // önceki kardeş metni
            const prev = el.previousElementSibling;
            if (prev) { const t = txt(prev); if (t && t.length < 60) return t; }
            return "";
        };

        const fields: Snapshot["fields"] = [];
        for (const el of Array.from(main.querySelectorAll("input, select, textarea"))) {
            if (!vis(el) || inNav(el)) continue;
            const type = el.getAttribute("type") ?? el.tagName.toLowerCase();
            if (type === "hidden") continue;
            const tag = el.tagName.toLowerCase();
            let kind = tag === "select" ? "seçim" : tag === "textarea" ? "uzun metin" : type;
            if (type === "checkbox") kind = "kutucuk";
            if (type === "radio") kind = "seçenek";
            let value = "";
            let options: string[] | undefined;
            if (tag === "select") {
                const s = el as HTMLSelectElement;
                value = s.selectedOptions[0]?.textContent?.trim() ?? "";
                options = Array.from(s.options).map(o => o.textContent?.trim() ?? "").filter(Boolean).slice(0, 30);
            } else if (type === "checkbox" || type === "radio") {
                value = (el as HTMLInputElement).checked ? "işaretli" : "boş";
            } else {
                value = (el as HTMLInputElement).value ?? "";
            }
            fields.push({
                label: labelFor(el) || "(etiketsiz)",
                kind,
                value,
                options,
                required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
            });
        }

        // ── Tıklanabilirler (menü hariç) ────────────────────────────────────
        const buttons: string[] = [];
        for (const b of Array.from(main.querySelectorAll('button, [role="button"], input[type="submit"]'))) {
            if (!vis(b) || inNav(b)) continue;
            const t = txt(b) || b.getAttribute("aria-label") || b.getAttribute("title") || "";
            const disabled = (b as HTMLButtonElement).disabled || b.getAttribute("aria-disabled") === "true";
            const short = t.trim().length > 55 ? t.trim().slice(0, 55) + "…" : t.trim();
            const label = (short || "(etiketsiz düğme)") + (disabled ? " [pasif]" : "");
            if (!buttons.includes(label)) buttons.push(label);
        }
        const links: string[] = [];
        for (const a of Array.from(main.querySelectorAll("a"))) {
            if (!vis(a) || inNav(a)) continue;
            const raw = txt(a) || a.getAttribute("aria-label") || "";
            const t = raw.length > 55 ? raw.slice(0, 55) + "…" : raw;
            if (t && !links.includes(t)) links.push(t);
        }

        // ── Ekran metni ─────────────────────────────────────────────────────
        // innerText CANLI elemandan okunmalı: kopyalanmış (detached) düğümde
        // düzen hesaplanmaz ve satır sonları kaybolur — her şey tek satıra yapışır.
        // Tabloları geçici gizleyip okuyoruz; içerikleri zaten TABLO bölümünde.
        const hidden: { el: HTMLElement; prev: string }[] = [];
        for (const t of Array.from(main.querySelectorAll("table"))) {
            const el = t as HTMLElement;
            hidden.push({ el, prev: el.style.display });
            el.style.display = "none";
        }
        const screenText = (main as HTMLElement).innerText ?? main.textContent ?? "";
        for (const h of hidden) h.el.style.display = h.prev;

        return {
            url: location.pathname + location.search,
            pageTitle: document.title,
            headings, screenText, tables, fields, buttons, links, menu, notices,
        };
    }, { maxRows: MAX_ROWS });
}

/** Ham yapıyı çalışanın okuyacağı metne çevirir. */
export function render(s: Snapshot, opts: { menu?: boolean } = {}): string {
    const L: string[] = [];
    L.push(`SAYFA: ${s.pageTitle || "(başlıksız)"}`);
    L.push(`ADRES: ${s.url}`);

    if (s.notices.length) {
        L.push("");
        L.push("⚑ BİLDİRİM / AÇILAN PENCERE:");
        for (const n of s.notices.slice(0, 5)) L.push(`   ${n}`);
    }

    const clean = s.screenText
        .split("\n").map(l => l.trim()).filter(Boolean)
        .filter((l, i, a) => l !== a[i - 1])
        .join("\n");
    if (clean) {
        L.push("");
        L.push("EKRANDA YAZANLAR:");
        const body = clean.length > MAX_TEXT ? clean.slice(0, MAX_TEXT) + "\n… (metin kesildi)" : clean;
        for (const l of body.split("\n")) L.push(`   ${l}`);
    }

    for (const t of s.tables) {
        L.push("");
        L.push(`TABLO${t.caption ? ` — ${t.caption}` : ""} (${t.total} satır):`);
        if (t.headers.length) L.push(`   ${t.headers.join(" | ")}`);
        if (t.rows.length === 0) L.push("   (boş)");
        for (const r of t.rows) L.push(`   ${r.join(" | ")}`);
        if (t.total > t.rows.length) L.push(`   … ve ${t.total - t.rows.length} satır daha`);
    }

    if (s.fields.length) {
        L.push("");
        L.push("DOLDURULACAK ALANLAR:");
        for (const f of s.fields) {
            const req = f.required ? " *zorunlu" : "";
            const val = f.value ? ` = "${f.value}"` : " = (boş)";
            const opt = f.options?.length ? `  → seçenekler: ${f.options.join(", ")}` : "";
            L.push(`   [${f.kind}] ${f.label}${req}${val}${opt}`);
        }
    }

    if (s.buttons.length) {
        L.push("");
        L.push(`DÜĞMELER: ${s.buttons.join(" · ")}`);
    }
    if (s.links.length) {
        L.push(`BAĞLANTILAR: ${s.links.slice(0, 40).join(" · ")}`);
    }
    if (opts.menu !== false && s.menu.length) {
        L.push("");
        L.push(`SOL MENÜ: ${s.menu.join(" · ")}`);
    }
    return L.join("\n");
}

export async function perceive(page: Page, opts: { menu?: boolean } = {}): Promise<string> {
    const s = await grab(page);
    return render(s, opts);
}

/** Yalnız bildirimleri oku — eylem sonrası "ne oldu" için. */
export async function readNotices(page: Page): Promise<string[]> {
    const s = await grab(page);
    return s.notices;
}

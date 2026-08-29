/**
 * Simülasyon daemon'u — dört çalışanın tarayıcısını AÇIK TUTAR.
 *
 * Neden daemon: her `simctl` çağrısı yeni bir tarayıcı açsaydı oturum ve
 * sayfa durumu kaybolurdu; yarım doldurulmuş form, açık sekme, giriş çerezi
 * komutlar arasında yaşamalı — gerçek bir çalışanın masasındaki gibi.
 *
 * Şifre: YALNIZ `SIM_PASSWORD` env'inden okunur. Loga, ekrana, diske YAZILMAZ.
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createServer } from "http";
import { mkdirSync, appendFileSync, readFileSync } from "fs";
import { join } from "path";
import { SIM_ROLES, DAEMON_PORT, APP_URL, type SimRole } from "./roles";
import * as act from "./act";
import { perceive } from "./perceive";

// .env.local elle yüklenir (tsx dotenv çalıştırmaz) — check-chain-integrity.ts kalıbı
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const ROOT = process.cwd();
const PROFILES = join(ROOT, ".sim", "profiles");
const LOGDIR = join(ROOT, "docs", "sim", "log");
const SHOTDIR = join(ROOT, "docs", "sim", "ekran");
for (const d of [PROFILES, LOGDIR, SHOTDIR]) mkdirSync(d, { recursive: true });

interface Desk { role: SimRole; ctx: BrowserContext; page: Page }
const desks = new Map<string, Desk>();

function log(role: string, line: string): void {
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    appendFileSync(join(LOGDIR, `${role}.log`), `[${stamp}] ${line}\n`);
}

/** Girişi yapar. Şifre env'den okunur ve HİÇBİR YERE yazılmaz. */
async function signIn(page: Page, role: SimRole, password: string): Promise<void> {
    // Kalıcı profil oturumu taşır: ikinci açılışta zaten girişli oluruz ve
    // /login → /dashboard'a atar (giriş alanı yoktur). Önce bunu yokla.
    await page.goto(`${APP_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    if (page.url().includes("/dashboard")) return;

    await page.goto(`${APP_URL}/login`, { waitUntil: "domcontentloaded" });
    // fill() yerine GERÇEK TUŞ VURUŞU: bu formda fill() React state'ini
    // güncellemiyor (değer DOM'a yazılıyor ama onChange tetiklenmiyor) →
    // "E-posta adresi gerekli." hatasıyla dönüyor. Bir insan da tuşla yazar.
    const em = page.getByLabel(/e-posta/i).first();
    await em.click();
    await em.pressSequentially(role.email, { delay: 12 });
    const pw = page.getByLabel(/şifre/i).first();
    await pw.click();
    await pw.pressSequentially(password, { delay: 8 });
    await page.getByRole("button", { name: /giriş/i }).click();
    await page.waitForURL("**/dashboard**", { timeout: 20_000 });
}

async function openDesk(role: SimRole, password: string): Promise<Desk> {
    const ctx = await chromium.launchPersistentContext(join(PROFILES, role.key), {
        headless: process.env.SIM_HEADED !== "1",
        viewport: { width: 1440, height: 900 },
        locale: "tr-TR",
        timezoneId: "Europe/Istanbul",
    });
    // tsx/esbuild `keepNames` ile derlerken page.evaluate'e giren fonksiyonlara
    // `__name(...)` sarmalayıcısı ekleniyor; bu yardımcı tarayıcıda yok →
    // "ReferenceError: __name is not defined". Sayfa scriptlerinden ÖNCE tanımla.
    await ctx.addInitScript(() => {
        (globalThis as unknown as { __name?: unknown }).__name ??= (f: unknown) => f;
    });
    const page = ctx.pages()[0] ?? await ctx.newPage();
    page.setDefaultTimeout(15_000);
    await signIn(page, role, password);
    log(role.key, `OTURUM AÇILDI — ${role.person} (${role.title})`);
    return { role, ctx, page };
}

async function run(role: SimRole, verb: string, args: string[]): Promise<string> {
    const desk = desks.get(role.key);
    if (!desk) return "✖ Bu çalışanın tarayıcısı açık değil.";
    const { page } = desk;
    switch (verb) {
        case "git":       return act.git(page, args[0] ?? "/dashboard");
        case "bak":       return act.bak(page);
        case "tikla":     return act.tikla(page, args[0] ?? "");
        case "satir":     return act.satir(page, args[0] ?? "");
        case "yaz":       return act.yaz(page, args[0] ?? "", args[1] ?? "");
        case "sec":       return act.sec(page, args[0] ?? "", args[1] ?? "");
        case "isaretle":  return act.isaretle(page, args[0] ?? "");
        case "ara":       return act.ara(page, args[0] ?? "");
        case "geri":      return act.geri(page);
        case "bekle":     return act.bekle(page, Number(args[0] ?? 3));
        case "ekran": {
            const f = join(SHOTDIR, `${role.key}-${Date.now()}.png`);
            return act.ekran(page, f);
        }
        case "neredeyim": return perceive(page, { menu: false });
        default:
            return `✖ "${verb}" diye bir şey yapamam. Yapabildiklerim: git · bak · tikla · satir · yaz · sec · isaretle · ara · geri · bekle · ekran`;
    }
}

async function main(): Promise<void> {
    const password = process.env.SIM_PASSWORD;
    if (!password) {
        console.error("SIM_PASSWORD env yok — .env.local dosyasına ekleyin.");
        process.exit(2);
    }
    const only = process.env.SIM_ONLY?.split(",").map(s => s.trim()).filter(Boolean);
    const roles = only?.length ? SIM_ROLES.filter(r => only.includes(r.key)) : SIM_ROLES;

    for (const role of roles) {
        try {
            desks.set(role.key, await openDesk(role, password));
            console.log(`✅ ${role.person} (${role.key}) masasına oturdu`);
        } catch (err) {
            console.error(`❌ ${role.person} (${role.key}) giremedi: ${String(err).slice(0, 300)}`);
        }
    }
    if (desks.size === 0) { console.error("Hiçbir çalışan giremedi — daemon kapanıyor."); process.exit(1); }

    const server = createServer((req, res) => {
        if (req.url === "/health") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: true, desks: [...desks.keys()] }));
            return;
        }
        if (req.method !== "POST" || req.url !== "/act") { res.writeHead(404).end(); return; }
        let body = "";
        req.on("data", c => { body += c; });
        req.on("end", async () => {
            let out = "";
            try {
                const { role: key, verb, args } = JSON.parse(body) as { role: string; verb: string; args: string[] };
                const role = SIM_ROLES.find(r => r.key === key);
                if (!role) out = `✖ "${key}" diye bir çalışan yok.`;
                else {
                    log(key, `> ${verb} ${args.map(a => JSON.stringify(a)).join(" ")}`);
                    out = await run(role, verb, args ?? []);
                    log(key, out.split("\n").slice(0, 3).join(" ⏎ "));
                }
            } catch (err) {
                out = `✖ Beklenmedik bir şey oldu: ${String(err).slice(0, 400)}`;
            }
            res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
            res.end(out);
        });
    });
    server.listen(DAEMON_PORT, "127.0.0.1", () => {
        console.log(`🟢 Sim daemon hazır — ${desks.size} çalışan, port ${DAEMON_PORT}`);
    });

    const shutdown = async () => {
        for (const d of desks.values()) await d.ctx.close().catch(() => null);
        server.close();
        process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
}

main();

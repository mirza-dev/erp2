#!/usr/bin/env node
/**
 * simctl — çalışanın ERP'yi kullandığı TEK arayüz.
 *
 * Düz JS (tsx değil): ajan yüzlerce komut çalıştıracak, her seferinde TypeScript
 * derlemesi beklemesin. Ağır iş daemon'da.
 *
 * Kullanım:
 *   node scripts/sim/simctl.mjs <kim> <ne> [değer...]
 *   node scripts/sim/simctl.mjs start|stop|durum
 */
import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync, openSync } from "fs";
import { join } from "path";

const PORT = 9713;
const URL = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();
const PIDFILE = join(ROOT, ".sim", "daemon.pid");
const ACTIVE = join(ROOT, ".sim", "ACTIVE");
const OUTLOG = join(ROOT, ".sim", "daemon.out");

const KISILER = {
    kerem: "Kerem Aydın — Makine Mühendisi",
    sibel: "Sibel Toprak — Mali İşler",
    hasan: "Hasan Çelik — Üretim Vardiya Sorumlusu",
    deniz: "Deniz Arslan — Satış ve Satın Alma",
};

const YARDIM = `
simctl — ERP'yi kullanmak için

  node scripts/sim/simctl.mjs <kim> <ne> [değer] [değer2]

KİMLER:  ${Object.keys(KISILER).join(" · ")}

NE YAPABİLİRSİN:
  git "<menü adı>"         sol menüden bir bölüme gir  (ör. git "Teklifler")
  git "/dashboard/orders"  doğrudan bir adrese git
  bak                      şu an ekranda ne varsa oku
  tikla "<etiket>"         bir düğmeye/bağlantıya bas
  satir "<metin>"          tabloda o metni içeren satırı aç
  yaz "<alan>" "<değer>"   bir alanı doldur
  sec "<alan>" "<değer>"   açılır listeden seç
  isaretle "<alan>"        kutucuğu işaretle/kaldır
  ara "<metin>"            arama kutusuna yaz
  geri                     bir önceki sayfaya dön
  bekle [saniye]           sayfanın yüklenmesini bekle
  ekran                    ekran görüntüsü al
`;

async function post(role, verb, args) {
    const res = await fetch(`${URL}/act`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, verb, args }),
    });
    return res.text();
}

async function health() {
    try {
        const r = await fetch(`${URL}/health`, { signal: AbortSignal.timeout(2000) });
        return r.ok ? await r.json() : null;
    } catch { return null; }
}

async function start() {
    if (await health()) { console.log("Zaten açık."); return; }
    mkdirSync(join(ROOT, ".sim"), { recursive: true });
    const out = openSync(OUTLOG, "a");
    const child = spawn("npx", ["tsx", "scripts/sim/daemon.ts"], {
        cwd: ROOT, detached: true, stdio: ["ignore", out, out],
        env: { ...process.env },
    });
    child.unref();
    writeFileSync(PIDFILE, String(child.pid));
    process.stdout.write("Çalışanlar masalarına oturuyor");
    for (let i = 0; i < 90; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const h = await health();
        if (h) {
            writeFileSync(ACTIVE, new Date().toISOString());
            console.log(`\n🟢 Hazır — masada olanlar: ${h.desks.join(", ")}`);
            return;
        }
        process.stdout.write(".");
    }
    console.log(`\n❌ Açılamadı. Günlük: ${OUTLOG}`);
    try { console.log(readFileSync(OUTLOG, "utf8").split("\n").slice(-25).join("\n")); } catch {}
    process.exit(1);
}

function stop() {
    try {
        const pid = Number(readFileSync(PIDFILE, "utf8").trim());
        process.kill(pid, "SIGTERM");
        console.log("🔴 Çalışanlar paydos etti.");
    } catch { console.log("Zaten kapalı."); }
    for (const f of [PIDFILE, ACTIVE]) { try { unlinkSync(f); } catch {} }
}

const [, , a, b, ...rest] = process.argv;

if (!a || a === "yardim" || a === "--help" || a === "-h") { console.log(YARDIM); process.exit(0); }
if (a === "start") { await start(); process.exit(0); }
if (a === "stop")  { stop(); process.exit(0); }
if (a === "durum") {
    const h = await health();
    console.log(h ? `🟢 Açık — masada: ${h.desks.join(", ")}` : "🔴 Kapalı");
    process.exit(h ? 0 : 1);
}

if (!KISILER[a]) {
    console.log(`"${a}" diye bir çalışan yok.\nOlanlar: ${Object.keys(KISILER).join(" · ")}`);
    process.exit(1);
}
if (!b) { console.log(YARDIM); process.exit(1); }
if (!(await health())) {
    console.log("Sistem kapalı görünüyor. Patrona haber ver.");
    process.exit(1);
}
console.log(await post(a, b, rest));

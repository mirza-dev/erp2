/**
 * GATE: route hata yakalama kapsaması (2026-08 K2).
 *
 * BULGU: `instrumentation.ts`'in `onRequestError` kancası "kalan 33 route'u
 * yakalar" diye belgelenmişti. Yakalamıyordu — o route'ların **28'i kendi
 * `catch`'inde yanıt DÖNDÜRÜYORDU**, yutulan hata Next.js'in hata sınırına hiç
 * ulaşmıyor, dolayısıyla kanca tetiklenmiyordu. Gerçek kapsama 131/159'du;
 * import (10 route), parasut, alerts, inventory arızaları Hata Merkezi'nde HİÇ
 * görünmüyor, `computeOverallHealth` yine "healthy" diyordu — yanlış NEGATİF.
 *
 * KURAL: 5xx döndüren her `catch` bloğu ya `handleApiError` ya
 * `captureRouteError` çağırmalı. İkisi de aynı telemetri borusuna bağlı
 * (`api-error.ts` → `scheduleTelemetry(recordError)`).
 *
 * `handleApiError(err, label, { clientMessage })` route'a özel Türkçe mesajı
 * korur → çevrim yanıt sözleşmesini DEĞİŞTİRMEDEN yapıldı.
 * `captureRouteError` yalnız gövde şekli farklı olmak ZORUNDA olan yerler için
 * (503 upstream fallback, HTML hata sayfası, 502 upstream).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const API_DIR = join(process.cwd(), "src/app/api");

/**
 * Kasıtlı istisnalar: `<route yolu>` → gerekçe.
 * BOŞ TUTULMALI. Yeni kayıt eklemek, bir arızanın panelde görünmeyeceğini
 * kabul etmek demektir — önce `handleApiError`/`captureRouteError` denenmeli.
 */
const COVERAGE_BASELINE: Record<string, string> = {};

function routeFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) routeFiles(p, out);
        else if (entry === "route.ts") out.push(p);
    }
    return out;
}

/** `catch (...) { ... }` gövdelerini brace-eşleyerek çıkarır. */
function catchBodies(src: string): string[] {
    const bodies: string[] = [];
    const re = /catch\s*(?:\(\s*\w+\s*\))?\s*\{/g;
    while (re.exec(src) !== null) {
        let i = re.lastIndex - 1;
        let depth = 0;
        do {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            i++;
        } while (depth > 0 && i < src.length);
        bodies.push(src.slice(re.lastIndex, i - 1));
    }
    return bodies;
}

const files = routeFiles(API_DIR);

describe("GATE — route hata yakalama kapsaması", () => {
    it("api route dizini bulundu (tarama gerçekten koştu)", () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it("5xx döndüren her catch bloğu telemetri borusuna bağlı", () => {
        const violations: string[] = [];

        for (const file of files) {
            const rel = file.slice(process.cwd().length + 1);
            if (COVERAGE_BASELINE[rel]) continue;
            const src = readFileSync(file, "utf8");

            for (const body of catchBodies(src)) {
                // 5xx DÖNDÜRMEYEN catch'ler kapsam dışı: doğrulama reddi (4xx),
                // best-effort yan etki (yut ve devam et), sağlık probu alan yazımı.
                if (!/status:\s*5\d\d/.test(body)) continue;
                if (/handleApiError|captureRouteError/.test(body)) continue;
                violations.push(`${rel} → ${body.trim().split("\n")[0].slice(0, 80)}`);
            }
        }

        expect(
            violations,
            `Telemetriye bağlanmamış 5xx catch bloğu:\n  ${violations.join("\n  ")}\n` +
            "→ `return handleApiError(err, \"<METHOD /path>\", { clientMessage: \"<mevcut mesaj>\" });`\n" +
            "   Gövde şekli korunmak ZORUNDAYSA: `captureRouteError(err, \"<label>\", <status>);`\n" +
            "   Aksi hâlde bu route'un arızası Developer Console'da GÖRÜNMEZ (K2).",
        ).toEqual([]);
    });

    it("baseline stale değil (düzeltilen kayıt listeden düşer)", () => {
        const stale: string[] = [];
        for (const [rel, reason] of Object.entries(COVERAGE_BASELINE)) {
            const abs = join(process.cwd(), rel);
            let src: string;
            try {
                src = readFileSync(abs, "utf8");
            } catch {
                stale.push(`${rel} → dosya yok (${reason})`);
                continue;
            }
            const stillViolating = catchBodies(src).some(
                (b) => /status:\s*5\d\d/.test(b) && !/handleApiError|captureRouteError/.test(b),
            );
            if (!stillViolating) stale.push(`${rel} → artık kapsamda, baseline'dan silin`);
        }
        expect(stale, stale.join("\n")).toEqual([]);
    });

    it("kapsam iddiası gerçek: catch'siz route'lar onRequestError'a düşer", () => {
        // K2'nin ikinci yarısı: `handleApiError` çağırmayan route'lar hatayı
        // YUTMUYORSA Next'in kancası devreye girer. Bu testin işi, "yutan ama
        // bağlanmamış" bir route'un tekrar ortaya çıkmadığını kanıtlamak —
        // yukarıdaki iddia onu yapıyor. Burada yalnız borunun tek olduğu kilitli.
        const apiError = readFileSync(join(process.cwd(), "src/lib/api-error.ts"), "utf8");
        expect(apiError).toMatch(/export function captureRouteError/);
        expect(apiError).toMatch(/clientMessage/);
        // İki yol da AYNI kancadan geçer.
        expect(apiError).toMatch(/function capture\([\s\S]{0,200}scheduleTelemetry/);
    });
});

/**
 * KARDEŞ KURAL (2026-09-11, dış inceleme #7) — aynı sınıf, farklı boru.
 *
 * Yukarıdaki kural "hata YUTULMASIN" diyor. Bu kural bir adım öncesini kapatır:
 * hata FIRLATILMAZSA da kaybolabilir. Supabase/PostgREST bir sorgu hatasını
 * reject ETMEZ — sonuç nesnesinin `error` alanında döndürür. `audit_log`
 * insert'leri `await sb.from("audit_log").insert({...})` biçimindeydi ve
 * dönüş hiç okunmuyordu; çevredeki `try/catch` de bu yüzden hiçbir şey
 * görmüyordu.
 *
 * Ölçüldü: 28 insert'in 21'i böyleydi. Rapor yalnız ikisini (parola yolları)
 * işaret etmişti; sınıf olarak kapatıldı. Kayıtlar NON-FATAL kalır — mutasyon
 * gerçekten oldu — ama artık konsola düşer.
 */
describe("GATE — audit_log insert'i sessizce başarısız olamaz", () => {
    function walk(dir: string, out: string[] = []): string[] {
        for (const e of readdirSync(dir)) {
            if (e === "__tests__") continue;
            const full = join(dir, e);
            if (statSync(full).isDirectory()) walk(full, out);
            else if (/\.tsx?$/.test(e)) out.push(full);
        }
        return out;
    }

    const strip = (src: string) =>
        src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    /** `from("audit_log").insert(` çağrıları — dosya + çözülüyor mu. */
    const inserts: { file: string; resolved: boolean }[] = [];
    for (const f of walk(join(process.cwd(), "src"))) {
        const code = strip(readFileSync(f, "utf8"));
        for (const m of code.matchAll(/from\("audit_log"\)\s*\n?\s*\.insert\(/g)) {
            const pre = code.slice(Math.max(0, m.index! - 160), m.index!).replace(/\n/g, " ");
            inserts.push({
                file: f.replace(process.cwd() + "/", ""),
                resolved: /error[^}]*\}\s*=\s*await\s*[\w.]*\s*$/.test(pre),
            });
        }
    }

    it("tarama çalışıyor — audit insert'leri bulunuyor (anti-vakum)", () => {
        // Desen çökerse aşağıdaki iddia BOŞ KÜMEYİ denetler ve sahte-yeşil olur.
        expect(inserts.length, "hiç audit_log insert'i bulunamadı — ayrıştırıcı bozuk")
            .toBeGreaterThan(10);
    });

    it("hepsi `{ error }` çözüyor — muafiyet listesi YOK", () => {
        const unresolved = [...new Set(inserts.filter(i => !i.resolved).map(i => i.file))];
        expect(
            unresolved,
            "audit insert'inin dönüşü okunmuyor — PostgREST hatası sessizce kaybolur",
        ).toEqual([]);
    });
});

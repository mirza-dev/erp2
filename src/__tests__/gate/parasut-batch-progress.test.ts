/**
 * KAPI — Paraşüt toplu işlerinde İLERLEME garantisi (2026-09-11, dış inceleme #4 · #5).
 *
 * İki ayrı servis, TEK sınıf kusur: **toplu iş kuyruğu ilerlemiyordu.**
 *
 *   #4 — `serviceReconcileParasutStock` sabit `.limit(100)` ile okuyordu ve
 *        sorguda `.order()` YOKTU. PostgREST sırasız sorguda deterministik sıra
 *        vaat etmez ama pratikte aynı ilk 100 satırı döndürür → 100'den sonraki
 *        ürünler HİÇ kontrol edilmiyor, stok sapmaları kalıcı oluyordu.
 *
 *   #5 — `pollOne` adayları `parasut_payment_checked_at` sırasıyla (null'lar
 *        önce) 40'lık seçiyor, ama HATA KOLU bu damgayı yazmıyordu. Kalıcı
 *        hata veren 40 belge sonsuza dek `null` kalıp her koşumda yeniden
 *        seçiliyor, GERİDEKİ tüm faturalar bayatlıyordu.
 *
 * İkisi de bugün ÖLÜ (`PARASUT_ENABLED` boş) — ama go-live gününde, yani
 * kimsenin bakmadığı anda ısırırlar. Kapı o günü bekliyor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel: string) => strip(readFileSync(join(root, rel), "utf8"));

const STOCK = read("src/lib/services/parasut-stock-service.ts");
const PAYMENT = read("src/lib/services/parasut-payment-service.ts");

/** Bir fonksiyonun gövdesini brace eşlemesiyle çıkarır (mesafe değil YAPI). */
function body(src: string, signature: string): string {
    const start = src.indexOf(signature);
    expect(start, `\`${signature}\` bulunamadı — ayrıştırıcı bozuk, iddialar sahte-yeşil olurdu`)
        .toBeGreaterThan(-1);
    const open = src.indexOf("{", start);
    let depth = 0, i = open;
    for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") { depth--; if (depth === 0) break; }
    }
    return src.slice(open, i);
}

describe("GATE — Paraşüt stok mutabakatı kataloğun tamamını görür (#4)", () => {
    const fn = body(STOCK, "export async function serviceReconcileParasutStock");

    it("ürün okuması SIRALI — sırasız sayfalama satır kaçırır/yineler", () => {
        expect(fn, "`.order()` yok — sayfalama deterministik değil")
            .toMatch(/\.order\("sku"/);
    });

    it("sabit `.limit()` ile tek sayfa okunmuyor — sayfalama var", () => {
        expect(fn, "`.range()` yok — hâlâ tek sayfa okunuyor").toMatch(/\.range\(/);
        expect(fn, "sabit `.limit(...)` geri gelmiş — kalan ürünler yine görülmez")
            .not.toMatch(/\.limit\(RECONCILE_/);
    });

    it("tavan doldu mu SESSİZ KALMIYOR — rapora yazılıyor", () => {
        expect(fn, "tavan bayrağı hiç kurulmuyor").toMatch(/truncated = true/);
        expect(fn, "tavan bayrağı sonuca konmuyor").toMatch(/truncated \? \{ truncated: true \}/);
        expect(STOCK, "sonuç tipinde `truncated` yok").toMatch(/truncated\?:\s*boolean/);
    });
});

describe("GATE — Paraşüt tahsilat kuyruğu ilerler (#5)", () => {
    const fn = body(PAYMENT, "async function pollOne");

    it("adaylar en eski-kontrol sırasıyla seçiliyor (kuyruğun tanımı)", () => {
        expect(fn).toMatch(/\.order\("parasut_payment_checked_at"/);
        expect(fn).toMatch(/nullsFirst:\s*true/);
    });

    it("HATA kolu da `checked_at` damgalıyor — yoksa kuyruk kilitlenir", () => {
        // İddia dosyada damganın geçmesine DEĞİL, `catch` bloğunun İÇİNDE
        // geçmesine bağlı: başarı kolundaki `paymentPatch` zaten damgalıyor ve
        // kural ona tutunursa hata kolu silinse bile yeşil kalırdı.
        const catchAt = fn.indexOf("} catch (err) {");
        expect(catchAt, "`catch` kolu bulunamadı").toBeGreaterThan(-1);
        const catchBody = fn.slice(catchAt);
        expect(catchBody, "hata kolunda damga yok — bozuk belge kuyruğu sonsuza dek kilitler")
            .toMatch(/parasut_payment_checked_at:\s*new Date\(\)\.toISOString\(\)/);
    });

    it("hata kolunda DURUM alanları güncellenmiyor — bayat veri taze gösterilemez", () => {
        const catchBody = fn.slice(fn.indexOf("} catch (err) {"));
        expect(catchBody, "hata kolunda `paymentPatch` kullanılmış — bilinmeyen durum yazılıyor")
            .not.toMatch(/paymentPatch\(/);
        expect(catchBody).not.toMatch(/parasut_payment_status:/);
    });

    it("başarısızlık sayacı korunuyor — sessiz ilerleme değil", () => {
        const catchBody = fn.slice(fn.indexOf("} catch (err) {"));
        expect(catchBody).toMatch(/failed\+\+/);
        expect(catchBody).toMatch(/parasut_payment_poll_fail/);
    });
});

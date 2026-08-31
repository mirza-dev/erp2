/**
 * GATE: istemcinin ayağa kalkmasını SESSİZCE engelleyebilen `next.config.ts` ayarları.
 *
 * Bu dosyanın konusu tek bir arıza biçimi: **sayfa 200 döner, HTML gelir, ama React
 * hiç hidratlanmaz.** Kullanıcı bunu "giriş yapamıyorum" diye görür; hata kutusu
 * çıkmaz, tıklamalar hiçbir şey yapmaz, sunucu log'u tertemizdir. Teşhis pahalıdır
 * çünkü her şey çalışıyor GÖRÜNÜR.
 *
 * İki ayar bunu yapabilir ve ikisi de burada kilitli:
 *   1. `allowedDevOrigins` — dev bundle'ına çapraz-origin erişim (asıl fail)
 *   2. `script-src` — CSP
 *
 * Bu kural iki farklı biçimde sessizce bozulabilir ve ikisi de pahalı:
 *
 *  1. **Üretime `unsafe-eval` sızması.** CSP'nin XSS'e karşı asıl değeri burada;
 *     bir kez gevşetilirse kimse fark etmez.
 *  2. **Development'ın kilitlenmesi.** Next'in dev sunucusu (React Refresh / HMR)
 *     modülleri `eval` ile sarar. Kural yoksa `next dev` sayfası CSP'ye takılır,
 *     React HİÇ hidratlanmaz ve sayfa SESSİZCE ölür: hata kutusu çıkmaz, konsolda
 *     tek satır uyarı vardır, tıklamalar hiçbir şey yapmaz. 2026-08-31'de tam
 *     olarak bu yaşandı — kullanıcı "giriş yapamıyorum" dedi; ölçüldüğünde tema
 *     düğmesi de ölüydü ve Supabase'e hiç istek gitmiyordu. Teşhis, giriş kodunda
 *     yarım saat aramaya mal oldu.
 *
 * Bu yüzden burada hem "üretimde ASLA" hem de "dev'de MUTLAKA" iddiası var.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");

/** `script-src` içeren tüm string literal'leri çıkarır. */
const scriptSrcLines = nextConfig
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes("script-src"));

describe("GATE — dev sunucusuna LAN'dan erişim", () => {
    it("`allowedDevOrigins` makinenin KENDİ IPv4 adreslerinden türetiliyor", () => {
        // Next 16'da dev kaynaklarına çapraz-origin erişim VARSAYILAN OLARAK KAPALI:
        // yalnız `localhost` geçer. Telefondan `http://192.168.x.x:3000` açıldığında
        // dev bundle'ı bloklanır ve sayfa sessizce ölür. 2026-08-31'de ölçüldü:
        // localhost ✓ / 127.0.0.1 ✗ / LAN IP ✗ — aynı sunucu, aynı anda.
        expect(nextConfig).toMatch(/allowedDevOrigins: devOrigins/);
        expect(nextConfig).toMatch(/from "node:os"/);
        expect(nextConfig).toMatch(/networkInterfaces\(\)/);
        // IP SABİT YAZILMAMALI — DHCP adresi değiştirdiğinde sessizce bozulurdu.
        expect(nextConfig).not.toMatch(/allowedDevOrigins:\s*\[\s*"\d+\.\d+\.\d+\.\d+"/);
        // Yalnız development: üretim derlemesinde boş dizi olmalı.
        expect(nextConfig).toMatch(/const devOrigins = isDev/);
        // Dış dünyaya açılmasın: yalnız internal OLMAYAN kendi arayüzleri.
        expect(nextConfig).toMatch(/!i\.internal/);
    });
});

describe("GATE — CSP", () => {
    it("script-src satırları bulunabiliyor (çıkarım boşsa aşağısı sahte-yeşil olurdu)", () => {
        expect(scriptSrcLines.length).toBeGreaterThanOrEqual(2); // dev + prod kolu
    });

    it("ÜRETİM script-src'inde 'unsafe-eval' YOK", () => {
        const prod = scriptSrcLines.filter((l) => !l.includes("unsafe-eval"));
        expect(prod.length).toBeGreaterThan(0);
        // Üretim kolu birebir bu olmalı — genişletilirse bilinçli olsun.
        expect(prod.some((l) => l.includes(`"script-src 'self' 'unsafe-inline'"`))).toBe(true);
    });

    it("DEV kolu 'unsafe-eval' içeriyor ve NODE_ENV'e bağlı", () => {
        // Koşulsuz bir 'unsafe-eval' üretime de sızardı; bağ mutlaka isDev olmalı.
        expect(nextConfig).toMatch(/const isDev = process\.env\.NODE_ENV !== "production"/);
        expect(nextConfig).toMatch(/isDev\s*\n?\s*\?\s*"script-src 'self' 'unsafe-inline' 'unsafe-eval'"/);
    });

    it("diğer CSP direktifleri yerinde", () => {
        for (const d of [
            "default-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "frame-ancestors 'none'",
            "worker-src 'self'",
            "manifest-src 'self'",
        ]) {
            expect(nextConfig).toContain(d);
        }
        // Supabase'e bağlanamazsa giriş ÇALIŞMAZ — connect-src daraltılırsa yakala.
        expect(nextConfig).toMatch(/connect-src[^"]*https:\/\/\*\.supabase\.co/);
    });
});

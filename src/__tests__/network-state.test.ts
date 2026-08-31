/**
 * Ağ durumu (madde #10).
 *
 * 2026-08-31 denetimi: `navigator.onLine` repoda HİÇ geçmiyordu. Service worker
 * yalnız TAM GEZİNMEDE `/offline` döndürüyor — ama uygulama ilk yüklemeden sonra
 * bir SPA: gerçek hâl "sayfa açılmıyor" değil, "fetch reddedildi". Kullanıcı ya
 * genel bir hata mesajı görüyor ya da hiçbir şey; bayat sayılara bakıp çevrimdışı
 * olduğunu bilmiyordu. Telefon birincil araç olduğu için ölçülebilir bir kayıptı.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describeNetworkError, isBrowserOffline, isNetworkError } from "@/lib/network-status";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const FALLBACK = "Ürün kaydedilemedi.";

afterEach(() => {
    // navigator.onLine testler arasında sızmasın.
    if (typeof navigator !== "undefined") {
        Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    }
});

function setOnline(value: boolean) {
    Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

describe("ağ durumu", () => {
    it("çevrimdışıyken mesaj SEBEBİ söyler, çevrimiçiyken çağıranın metni korunur", () => {
        // "Ürün kaydedilemedi." kullanıcıyı veride hata aramaya iter; sebep
        // bağlantıysa bu yanlış eylem demektir.
        expect(describeNetworkError(new Error("x"), true, FALLBACK)).toMatch(/İnternet bağlantısı yok/);
        expect(describeNetworkError(new Error("x"), false, FALLBACK)).toBe(FALLBACK);
    });

    it("ağ kaynaklı fetch reddi ayırt edilir", () => {
        // fetch ağ hatasında TypeError atar — 4xx/5xx ile karıştırılmamalı.
        expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
        expect(isNetworkError(new Error("Load failed"))).toBe(true);
        expect(isNetworkError(new Error("Yetkisiz."))).toBe(false);
        expect(isNetworkError(null)).toBe(false);
        // Çevrimiçiyken bile ağ hatası olabilir (sunucu erişilemez).
        expect(describeNetworkError(new TypeError("Failed to fetch"), false, FALLBACK))
            .toMatch(/Sunucuya ulaşılamadı/);
    });

    it("`navigator.onLine` YALNIZ false yönünde sinyal sayılır", () => {
        // `true` güvenilir DEĞİL: captive portal / ADSL kopuk cihaz da true döner.
        // Bu yüzden kural yalnız `false` yönünde çalışır; mutasyonlar `true` diye
        // serbest bırakılmaz, `false` diye bloklanmaz.
        setOnline(false);
        expect(isBrowserOffline()).toBe(true);
        setOnline(true);
        expect(isBrowserOffline()).toBe(false);
    });

    it("bant panoya bağlı ve KAPATILAMAZ", () => {
        const banner = read("src/components/ui/OfflineBanner.tsx");
        // Kapatılabilseydi kullanıcı bandı kapatır, kopuk hâlde çalışmaya devam
        // eder ve kaydettiğini sandığı işi kaybederdi.
        expect(banner).not.toMatch(/dismiss|localStorage|sessionStorage/i);
        expect(banner).toMatch(/role="status"/);
        expect(read("src/app/dashboard/layout.tsx")).toMatch(/<OfflineBanner \/>/);
    });

    it("çevrimdışı notu TEK noktadan eklenir (53 çağrı yeri değil)", () => {
        // Her `catch` bloğunu tek tek düzeltmek hem 53 dokunuş hem de bir dahaki
        // `toast({type:"error"})` yazıldığında yeniden unutulacak bir kural demekti.
        const toast = read("src/components/ui/Toast.tsx");
        expect(toast).toMatch(/isBrowserOffline\(\)/);
        // Yalnız hata tonunda: başarı toast'ına çevrimdışı notu eklemek anlamsız.
        expect(toast).toMatch(/type === "error" && isBrowserOffline\(\)/);
    });
});

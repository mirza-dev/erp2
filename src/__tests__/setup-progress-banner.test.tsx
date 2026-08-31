// @vitest-environment jsdom
/**
 * Kurulum ilerleme bandı (madde #1).
 *
 * Rehberin kendisi (`SetupStatusPanel`) 2026-08-29'da yazılmıştı ve iyiydi —
 * eksik olan BULUNABİLİRLİĞİYDİ: yalnız Veri Aktarım Merkezi'nin içinde
 * duruyordu ve boş bir sisteme ilk giren kişiyi oraya yönlendiren hiçbir şey
 * yoktu. 5 günlük çalışan simülasyonunda dört kişiden hiçbiri o sayfayı açmadı.
 *
 * Bandın üç davranışı da sessizce bozulabilir, o yüzden üçü de test ediliyor:
 *   1. eksik varken görünür (yoksa hiç iş görmez),
 *   2. tamamlanınca KAYBOLUR (kalıcı bir uyarı gürültüye dönüşür ve öğrenilmiş
 *      körlük yaratır — asıl uyarılar da görünmez olur),
 *   3. 403'te SESSİZ (aktarımı yapamayacak role "kurulumu tamamla" demek anlamsız).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import SetupProgressBanner from "@/components/dashboard/SetupProgressBanner";
import type { ImportSetupStatus } from "@/lib/supabase/import-setup-status";

const EMPTY: ImportSetupStatus = {
    productTypes: { total: 0, withFields: 0 },
    products: { total: 0, withoutType: 0, withoutSku: 0 },
    customers: { total: 0 },
    vendors: { total: 0, productLinks: 0, productsWithPreferred: 0 },
    stock: { productsWithStock: 0 },
};

const COMPLETE: ImportSetupStatus = {
    productTypes: { total: 3, withFields: 3 },
    products: { total: 20, withoutType: 0, withoutSku: 0 },
    customers: { total: 5 },
    vendors: { total: 4, productLinks: 12, productsWithPreferred: 8 },
    stock: { productsWithStock: 18 },
};

function mockFetch(status: number, body?: unknown) {
    global.fetch = vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    }) as unknown as typeof fetch;
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("kurulum ilerleme bandı", () => {
    it("eksik adım varken görünür ve NE eksik olduğunu söyler", async () => {
        mockFetch(200, EMPTY);
        render(<SetupProgressBanner />);
        // "Kurulum 0/5" — sayı gerçek veriden, elle işaretlenen listeden değil.
        expect(await screen.findByText(/Kurulum 0\/5/)).toBeTruthy();
        // Genel bir uyarı değil, adı geçen eksikler: kullanıcı ne yapacağını bilmeli.
        expect(screen.getByText(/Ürünler/)).toBeTruthy();
        expect(screen.getByRole("link", { name: /Veri Aktarım Merkezi/ })).toBeTruthy();
    });

    it("kurulum tamamlanınca KENDİLİĞİNDEN kaybolur", async () => {
        mockFetch(200, COMPLETE);
        const { container } = render(<SetupProgressBanner />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        // Kimsenin "bitti" demesi gerekmemeli — sayılar gerçek veriden geliyor.
        expect(container.textContent).toBe("");
    });

    it("kısmen tamamlanmışsa yalnız EKSİK olanları sayar", async () => {
        mockFetch(200, { ...COMPLETE, stock: { productsWithStock: 0 }, customers: { total: 0 } });
        render(<SetupProgressBanner />);
        expect(await screen.findByText(/Kurulum 3\/5/)).toBeTruthy();
    });

    it("yetkisiz rolde (403) SESSİZ — hata göstermez", async () => {
        mockFetch(403, { error: "Yetkisiz." });
        const { container } = render(<SetupProgressBanner />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        expect(container.textContent).toBe("");
    });

    it("ağ hatasında panoyu bozmaz", async () => {
        global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
        const { container } = render(<SetupProgressBanner />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        expect(container.textContent).toBe("");
    });

    it("kapatıldıysa geri gelmez", async () => {
        localStorage.setItem("roven-setup-banner-dismissed", "1");
        mockFetch(200, EMPTY);
        const { container } = render(<SetupProgressBanner />);
        await waitFor(() => expect(container.textContent).toBe(""));
    });
});

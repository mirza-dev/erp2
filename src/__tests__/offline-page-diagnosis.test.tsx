// @vitest-environment jsdom
/**
 * Çevrimdışı yedek sayfasının TEŞHİSİ (2026-09-12).
 *
 * Sayfa 2026-09-12'ye kadar koşulsuz "Bağlantı yok — bağlantı gelince
 * sayfayı yenileyin" diyordu. Service worker onu bir GEZİNME fetch'i
 * reddedildiği HER durumda döndürüyor ve "reddedildi" iki apayrı sebebin
 * ortak sonucu: cihazın bağlantısı yok, ya da cihaz çevrimiçi ama
 * SUNUCU/ADRES yanıt vermiyor. İkinci durumda metin YANLIŞ TEŞHİSTİ —
 * ölçülen gerçek olay: telefonun PWA ikonu ölmüş bir `trycloudflare.com`
 * tüneline bakıyordu, sinyal dört çubuktu, kullanıcı Wi-Fi'sini kurcaladı.
 *
 * BURADAKİ ASIL İDDİA: **SSR'da basılan metin sebebi iddia etmez.**
 * Bu sayfa SW önbelleğinden servis edilir, yani ekranda sunucuda üretilmiş
 * HTML durur; hidratlanması için `/_next/static/` chunk'ının da önbellekte
 * olması gerekir ve olmayabilir. O hâlde `useEffect` hiç koşmaz ve ekranda
 * sonsuza dek ilk render kalır. `renderToStaticMarkup` tam bu durumu ölçer
 * (efekt koşmaz) — yani testteki "unknown" satırı bir yer tutucu değil,
 * telefona precache'lenen gerçek metnin kendisi.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { OFFLINE_TEXT, OfflineReason } from "@/app/offline/OfflineReason";

afterEach(() => {
    cleanup();
    setOnline(true);
});

function setOnline(value: boolean) {
    Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

/**
 * `renderToStaticMarkup` kesme işaretini `&#x27;` olarak kaçırır ("Roven'a" →
 * "Roven&#x27;a"). Bu DOĞRU HTML; iddiayı gevşetmek yerine çözüyoruz, yoksa
 * metni harfi harfine karşılaştırma imkânı kaybolurdu.
 */
const decode = (html: string) =>
    html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

describe("çevrimdışı sayfa teşhisi", () => {
    it("SSR çıktısı (hidratlama YOKKEN görülen metin) sebebi İDDİA ETMEZ", () => {
        // renderToStaticMarkup efekt koşturmaz = önbelleğe giren HTML.
        const title = decode(renderToStaticMarkup(<OfflineReason part="title" />));
        const detail = decode(renderToStaticMarkup(<OfflineReason part="detail" />));

        expect(title).toContain(OFFLINE_TEXT.unknown.title);
        expect(detail).toContain(OFFLINE_TEXT.unknown.detail);

        // Kusurun ta kendisi: koşulsuz "Bağlantı yok" iddiası geri gelmesin.
        expect(title, "SSR başlığı yine sebebi iddia ediyor").not.toContain("Bağlantı yok");
        expect(detail, "SSR metni cihazı suçluyor").not.toMatch(/bağlantısı yok\./);
    });

    it("iddia etmemek SUSMAK değil — ilk metin İKİ sebebi de sayar", () => {
        const { detail } = OFFLINE_TEXT.unknown;
        expect(detail, "cihaz bağlantısı olasılığı yazılmamış").toMatch(/bağlantı/i);
        expect(detail, "adresin ölmüş olma olasılığı yazılmamış").toMatch(/adres/i);
    });

    it("cihaz gerçekten çevrimdışıysa sebep söylenir", () => {
        setOnline(false);
        render(<OfflineReason part="title" />);
        expect(screen.getByText(OFFLINE_TEXT["device-offline"].title)).toBeTruthy();
        expect(OFFLINE_TEXT["device-offline"].detail).toMatch(/yenileyin/i);
    });

    it("cihaz çevrimiçiyken SUNUCU işaret edilir, cihaz SUÇLANMAZ", () => {
        setOnline(true);
        render(<OfflineReason part="title" />);
        expect(screen.getByText(OFFLINE_TEXT["server-unreachable"].title)).toBeTruthy();

        const { detail } = OFFLINE_TEXT["server-unreachable"];
        // Asıl kusur buydu: sinyali tam olan cihaza "bağlantın yok" demek.
        expect(detail, "çevrimiçi cihaza hâlâ bağlantısı yok deniyor").not.toMatch(
            /bağlantısı yok|bağlantı yok/i,
        );
        expect(detail, "sunucu/adres sebebi yazılmamış").toMatch(/adres|yanıt vermiyor/i);
    });

    it("bağlantı sayfa açıkken dönerse teşhis bayatlamaz", () => {
        setOnline(false);
        render(<OfflineReason part="title" />);
        expect(screen.getByText(OFFLINE_TEXT["device-offline"].title)).toBeTruthy();

        setOnline(true);
        // `act` ZORUNLU: olay dinleyicisi setState çağırır, React güncellemeyi
        // act dışında flush etmez ve ekranda bayat metin kalır (testi yazarken
        // tam bu tuzağa düşüldü).
        act(() => {
            window.dispatchEvent(new Event("online"));
        });
        expect(screen.getByText(OFFLINE_TEXT["server-unreachable"].title)).toBeTruthy();
    });

    it("üç durumun üçü de gerçek metin taşır (boş küme denetlenmesin)", () => {
        const keys = Object.keys(OFFLINE_TEXT).sort();
        expect(keys).toEqual(["device-offline", "server-unreachable", "unknown"]);
        for (const [durum, metin] of Object.entries(OFFLINE_TEXT)) {
            expect(metin.title.length, `${durum}: başlık boş`).toBeGreaterThan(5);
            expect(metin.detail.length, `${durum}: açıklama boş`).toBeGreaterThan(40);
        }
    });
});

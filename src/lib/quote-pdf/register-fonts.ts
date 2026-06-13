/**
 * Teklif PDF fontları — Montserrat (600/700/800) + Inter (400/500/600) TTF.
 *
 * Neden gömülü TTF: PDF standart 14 fontu (Helvetica vb.) WinAnsi kodlamalıdır;
 * Türkçe ğ/ş/İ glifleri YOKTUR — TTF embed zorunlu. Dosyalar fonts/ klasöründe
 * (OFL lisans — bkz. fonts/OFL.txt); standalone build'e kopyalanmaları
 * next.config.ts `outputFileTracingIncludes` ile garanti edilir (mupdf wasm kalıbı).
 *
 * NOT: italic varyant TTF'leri bilinçli gömülmedi (6 yerine 12 dosya olurdu);
 * fontStyle:italic istekleri aynı dik (roman) dosyaya bağlanır — react-pdf font
 * çözümlemesi "italic kayıtlı değil" hatasına düşmez, EN alt-etiketler eğiksiz
 * ama doğru ağırlıkta basılır (kabul edilen yakın-kopya sapması).
 */
import path from "node:path";
import { Font } from "@react-pdf/renderer";

const FONT_DIR = path.join(process.cwd(), "src", "lib", "quote-pdf", "fonts");

function weights(family: "Montserrat" | "Inter", entries: [number, string][]) {
    return {
        family,
        fonts: entries.flatMap(([fontWeight, file]) => {
            const src = path.join(FONT_DIR, file);
            return [
                { src, fontWeight },
                { src, fontWeight, fontStyle: "italic" as const },
            ];
        }),
    };
}

let registered = false;

/** Idempotent — render başına bir kez; Font.register global state'tir. */
export function registerQuotePdfFonts(): void {
    if (registered) return;
    registered = true;

    Font.register(weights("Montserrat", [
        [600, "Montserrat-SemiBold.ttf"],
        [700, "Montserrat-Bold.ttf"],
        [800, "Montserrat-ExtraBold.ttf"],
    ]));
    Font.register(weights("Inter", [
        [400, "Inter-Regular.ttf"],
        [500, "Inter-Medium.ttf"],
        [600, "Inter-SemiBold.ttf"],
    ]));

    // Türkçe kelimeler İngilizce heceleme tablosuyla yanlış bölünmesin —
    // kelime bütün kalır, satır sonu kelime sınırında kırılır. İstisna: uzun
    // tireli ürün kodları (FWBV-DN400-PN80) dar kolonda kırpılmasın diye tire
    // noktalarından bölünebilir. Tire SONRAKİ parçanın başında tutulur çünkü
    // textkit kelime-içi kırılmaya her zaman görsel tire ekler (insertGlyph
    // HYPHEN) — parça tireyle bitseydi satır sonunda "FWBV--" çift tire çıkardı;
    // bu biçimde satır sonu "FWBV-", devam satırı "-DN400-PN80" olur.
    Font.registerHyphenationCallback((word) => {
        if (word.length <= 12 || !word.includes("-")) return [word];
        return word.split(/(?=-)/);
    });
}

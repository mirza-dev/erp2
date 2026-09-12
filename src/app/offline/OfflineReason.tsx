"use client";

import { useEffect, useState } from "react";
import { isBrowserOffline } from "@/lib/network-status";

/**
 * Çevrimdışı yedek sayfasının METNİNİ seçen tek parça istemci mantığı.
 *
 * NİÇİN VAR: service worker bu sayfayı, bir GEZİNME fetch'i reddedildiği her
 * durumda döndürüyor (`public/sw.js`). Ama "reddedildi" iki apayrı sebebin ortak
 * sonucudur: (a) cihazın bağlantısı yok, (b) cihaz çevrimiçi ama SUNUCU/ADRES
 * yanıt vermiyor. Sayfa 2026-09-12'ye kadar koşulsuz *"Bağlantı yok — bağlantı
 * gelince sayfayı yenileyin"* diyordu; (b) durumunda bu bir YANLIŞ TEŞHİS:
 * kullanıcı dört çubuk sinyalle ekrana bakıp Wi-Fi'sini kurcalıyor, oysa sorun
 * adresin ölmüş olmasıdır. Ölçülen gerçek olay: `docs/yerel-gelistirme.md`deki
 * geçici `trycloudflare.com` tüneli kapandı, telefonun ana ekranındaki PWA ikonu
 * bu sayfayı gösterdi ve metin kullanıcıyı yanlış yere baktırdı.
 *
 * ÜÇ DURUM — ve `unknown` bir yer tutucu DEĞİL, kuralın kendisi:
 * bu sayfa SW önbelleğinden servis edilir, yani ekranda SUNUCUDA ÜRETİLMİŞ HTML
 * durur. Hidratlanması için `/_next/static/` chunk'ının da önbellekte olması
 * gerekir — olmayabilir (o chunk hiç istenmemişse ağ ölüyken getirilemez).
 * O hâlde `useEffect` HİÇ koşmaz ve ekranda sonsuza dek İLK RENDER kalır. Bu
 * yüzden ilk render'ın metni sebebi iddia etmemeli, ikisini de saymalı.
 *
 * `useOnlineStatus` burada KULLANILAMAZ: iki durumlu ve başlangıç değeri
 * "çevrimiçi". Hidratlanmayan bir cihazda gerçekten çevrimdışı olan kullanıcıya
 * "internetin çalışıyor" derdi — düzelttiğimiz kusurun aynası.
 *
 * `navigator.onLine` semantiği için bkz. `lib/network-status.ts`: yalnız `false`
 * kesin sinyaldir. Burada da öyle okunuyor — `true` "her şey yolunda" demek
 * değil, "sebep cihazın bağlantısı DEĞİL" demek. Teşhis tam olarak bu.
 */
type Diagnosis = "unknown" | "device-offline" | "server-unreachable";

export const OFFLINE_TEXT: Record<Diagnosis, { title: string; detail: string }> = {
    // SSR'da basılan ve önbelleğe giren metin: sebebi İDDİA ETMEZ, ikisini sayar.
    unknown: {
        title: "Roven'a ulaşılamıyor",
        detail:
            "Ya cihazın internet bağlantısı koptu ya da bu adres artık yayında değil. " +
            "Roven sunucudan okumak zorunda — sipariş, stok ve teklif verileri anlık okunur.",
    },
    "device-offline": {
        title: "Bağlantı yok",
        detail:
            "Cihazın internet bağlantısı yok. Roven sunucudan okumak zorunda — sipariş, " +
            "stok ve teklif verileri anlık okunur. Bağlantı gelince sayfayı yenileyin.",
    },
    "server-unreachable": {
        title: "Sunucuya ulaşılamıyor",
        detail:
            "Cihazın interneti çalışıyor ama Roven bu adreste yanıt vermiyor — adres artık " +
            "yayında olmayabilir. Yenilemek çözmezse güncel adresi kullanın.",
    },
};

export function OfflineReason({ part }: { part: "title" | "detail" }) {
    // Başlangıç `unknown`: SSR çıktısı ilk istemci render'ıyla birebir aynı olur
    // (hidratlama uyuşmazlığı yok) ve hidratlama hiç gerçekleşmezse ekranda
    // kalan metin de bu olur.
    const [diagnosis, setDiagnosis] = useState<Diagnosis>("unknown");

    useEffect(() => {
        const sync = () => setDiagnosis(isBrowserOffline() ? "device-offline" : "server-unreachable");
        sync();
        // Bağlantı sayfa açıkken geri gelirse teşhis bayatlamasın.
        window.addEventListener("online", sync);
        window.addEventListener("offline", sync);
        return () => {
            window.removeEventListener("online", sync);
            window.removeEventListener("offline", sync);
        };
    }, []);

    return <>{OFFLINE_TEXT[diagnosis][part]}</>;
}

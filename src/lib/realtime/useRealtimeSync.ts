"use client";

import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { createClient } from "@/lib/supabase/client";
import {
    REALTIME_CHANNEL,
    REALTIME_EVENT,
    parseDataChangePayload,
    keyMatchesDomains,
} from "./channel";

/**
 * Bu sekmenin kimliği — mutasyon isteklerinde başlık olarak gider, yayında geri
 * gelir. Kendi değişikliğimizi ikinci kez çekmemek için.
 *
 * `sessionStorage`: aynı sekmede yenilemede korunur, farklı sekmede farklıdır —
 * iki sekme açan bir kullanıcı da birbirini gerçek zamanlı görür.
 */
const TAB_ID_KEY = "roven-tab-id";

function readTabId(): string {
    if (typeof window === "undefined") return "";
    try {
        const mevcut = window.sessionStorage.getItem(TAB_ID_KEY);
        if (mevcut) return mevcut;
        const yeni = `t_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
        window.sessionStorage.setItem(TAB_ID_KEY, yeni);
        return yeni;
    } catch {
        // Gizli sekme / depolama kapalı → oturum boyu bellekte kalan kimlik.
        return `t_${Math.random().toString(36).slice(2, 12)}`;
    }
}

let bellekteki: string | null = null;

/** Bu sekmenin kimliği. Mutasyon fetch'lerinde `x-roven-tab` başlığına konur. */
export function tabId(): string {
    if (bellekteki) return bellekteki;
    bellekteki = readTabId();
    return bellekteki;
}

export type RealtimeStatus = "connecting" | "live" | "offline";

/**
 * Gerçek zamanlı senkron — başka kullanıcıların değişikliklerini bu sekmede
 * anında yansıtır.
 *
 * NASIL: Supabase yayınından gelen sinyal VERİ TAŞIMAZ, yalnız "şu alan
 * değişti" der; hook ilgili SWR anahtarlarını tazeler ve veri HER ZAMANKİ
 * korumalı API yolundan yeniden gelir. Yetki ve finansal maskeleme tek yerde
 * (API katmanı) kalır — ikinci bir authz yolu doğmaz.
 *
 * Bağlantı kurulamazsa uygulama ESKİSİ GİBİ çalışır (gezinmede tazelenir);
 * gerçek zamanlılık bir iyileştirmedir, çalışmanın ön koşulu değil.
 *
 * Dashboard yerleşiminde BİR KEZ çağrılır.
 */
export function useRealtimeSync(): RealtimeStatus {
    const { mutate } = useSWRConfig();
    const [status, setStatus] = useState<RealtimeStatus>("connecting");
    // mutate referansını efekt bağımlılığından uzak tut — yeniden abone olmayı tetiklemesin.
    const mutateRef = useRef(mutate);
    mutateRef.current = mutate;

    useEffect(() => {
        const benim = tabId();
        const supabase = createClient();
        const kanal = supabase.channel(REALTIME_CHANNEL);

        kanal.on("broadcast", { event: REALTIME_EVENT }, (mesaj) => {
            const payload = parseDataChangePayload(mesaj.payload);
            if (!payload) return;
            // Kendi değişikliğimiz: mutasyon yolu cache'i zaten güncelledi.
            if (payload.origin && payload.origin === benim) return;

            void mutateRef.current(
                key => keyMatchesDomains(key, payload.domains),
                undefined,
                { revalidate: true },
            );
        });

        kanal.subscribe(durum => {
            if (durum === "SUBSCRIBED") setStatus("live");
            else if (durum === "CHANNEL_ERROR" || durum === "TIMED_OUT" || durum === "CLOSED") {
                setStatus("offline");
            }
        });

        return () => {
            void supabase.removeChannel(kanal);
        };
    }, []);

    return status;
}

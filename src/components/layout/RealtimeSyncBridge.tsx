"use client";

/**
 * Gerçek zamanlı senkronu devreye alan köprü — hiçbir şey çizmez.
 *
 * `useRealtimeSync` SWR cache'ine erişmek için `SWRConfig` sınırının İÇİNDE
 * çalışmak zorunda; bu yüzden ayrı bir bileşen olarak `DataProvider` altına
 * yerleştirilir (layout'un kendisi sınırın dışındadır).
 *
 * Demo modunda ABONE OLMAZ: demo ziyaretçisinin göreceği başka bir kullanıcı
 * yok, boşuna websocket açılmasın.
 */
import { useIsDemo } from "@/lib/demo-utils";
import { useRealtimeSync } from "@/lib/realtime/useRealtimeSync";

function LiveSubscription() {
    useRealtimeSync();
    return null;
}

export default function RealtimeSyncBridge() {
    const isDemo = useIsDemo();
    if (isDemo) return null;
    return <LiveSubscription />;
}

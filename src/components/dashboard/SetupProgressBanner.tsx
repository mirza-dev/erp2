"use client";

/**
 * Kurulum ilerleme bandı — panoya konan onboarding sinyali (madde #1).
 *
 * NEDEN VAR: kurulum rehberi (`SetupStatusPanel`) 2026-08-29'da yazıldı ama YALNIZ
 * Veri Aktarım Merkezi'nin İÇİNDE duruyor. Boş bir sisteme ilk giren kişiyi oraya
 * yönlendiren hiçbir şey yoktu — 5 günlük çalışan simülasyonunda dört kişiden
 * hiçbiri o sayfayı açmamıştı. Rehberin kendisi iyiydi; bulunabilirliği yoktu.
 *
 * Adımlar `buildSetupSteps()` ile TÜRETİLİR — panelle aynı saf fonksiyon, kopya
 * yok. İki yüzey ayrışırsa kullanıcı iki farklı "kaç adım kaldı" görürdü.
 *
 * Sayılar gerçek veriden gelir (`/api/import/setup-status`, `head:true` + `count`,
 * 60 sn cache) — elle işaretlenen bir kontrol listesi DEĞİL. Bu yüzden kurulum
 * tamamlanınca bant kendiliğinden kaybolur; kimsenin "bitti" demesi gerekmez.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, X } from "lucide-react";
import { buildSetupSteps } from "@/components/import/SetupStatusPanel";
import { usePermissions } from "@/lib/auth/use-permissions";
import type { ImportSetupStatus } from "@/lib/supabase/import-setup-status";

const DISMISS_KEY = "roven-setup-banner-dismissed";

export default function SetupProgressBanner() {
    const [status, setStatus] = useState<ImportSetupStatus | null>(null);
    const [dismissed, setDismissed] = useState(true); // varsayılan gizli — yanıp sönmesin
    // Adımlar role göre süzülür (2026-09-16 "herkes görsün"): satışçı cariler /
    // ürünler / ilk teklif görür; hiç adımı olmayan rolde bant hiç çizilmez.
    const perms = usePermissions();

    useEffect(() => {
        try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { setDismissed(false); }
    }, []);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch("/api/import/setup-status");
                // Uç oturumu olan her role açık; yine de 403/5xx gelirse (demo
                // dışı anon, geçici hata) SESSİZCE hiçbir şey çizilmez — bant
                // bir bilgi katmanı, panoyu bozmamalı.
                if (!res.ok || cancelled) return;
                setStatus(await res.json() as ImportSetupStatus);
            } catch {
                /* ağ hatası: bant bir bilgi katmanı, panoyu bozmamalı */
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (dismissed || !status) return null;

    const steps = buildSetupSteps(status, perms);
    const done = steps.filter(s => s.done).length;
    if (done === steps.length) return null; // kurulum bitti (veya role adım yok) → bant gider

    const pending = steps.filter(s => !s.done);
    const missing = pending.map(s => s.title);
    // Kullanıcı ilk eksik adıma tek tıkla gitsin; hub linki yine durur.
    const next = pending[0];

    const handleDismiss = () => {
        setDismissed(true);
        try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* noop */ }
    };

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "7px 14px",
                background: "var(--accent-bg)",
                border: "var(--line-width) solid var(--accent-border)",
                borderRadius: "6px",
                marginBottom: "16px",
                fontSize: "12px",
                color: "var(--accent-text)",
                flexWrap: "wrap",
            }}
        >
            <ClipboardList size={14} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: "200px", lineHeight: 1.5 }}>
                <strong style={{ fontWeight: 600 }}>Kurulum {done}/{steps.length}</strong>
                {" — eksik: "}
                {missing.join(", ")}.
            </span>
            <Link
                href={next.href}
                className="tap-44-v"
                aria-label={`Sıradaki adım: ${next.title}`}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    color: "var(--accent-text)",
                    fontWeight: 600,
                    textDecoration: "underline",
                    flexShrink: 0,
                }}
            >
                Sıradaki: {next.title}
                <ArrowRight size={12} strokeWidth={2} aria-hidden="true" />
            </Link>
            <Link
                href="/dashboard/import"
                className="tap-44-v"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    color: "var(--accent-text)",
                    fontWeight: 500,
                    textDecoration: "underline",
                    flexShrink: 0,
                }}
            >
                Veri Aktarım Merkezi
                <ArrowRight size={12} strokeWidth={2} aria-hidden="true" />
            </Link>
            <button
                type="button"
                className="tap-44"
                aria-label="Kurulum bandını kapat"
                onClick={handleDismiss}
                style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent-text)",
                    cursor: "pointer",
                    padding: "0 2px",
                    opacity: 0.6,
                    flexShrink: 0,
                    display: "flex",
                    position: "relative",
                }}
            >
                <X size={14} strokeWidth={2} />
            </button>
        </div>
    );
}

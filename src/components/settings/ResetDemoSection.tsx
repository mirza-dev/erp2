"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { RotateCcw } from "lucide-react";

type SeedResponse = {
    ok: true;
    cleared: { load_orders: number; demo_tables: number };
    seeded: {
        products: number;
        customers: number;
        orders: number;
        quotes: number;
        ai_recommendations: number;
        import_batches: number;
        [k: string]: number;
    };
};

export default function ResetDemoSection() {
    const isDemo = useIsDemo();
    const { toast } = useToast();
    const [showConfirm, setShowConfirm] = useState(false);
    const [busy, setBusy] = useState(false);

    const handleClick = () => {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        setShowConfirm(true);
    };

    const handleConfirm = async () => {
        setBusy(true);
        try {
            const res = await fetch("/api/seed", { method: "POST" });
            if (!res.ok) {
                const errBody = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(errBody.error ?? `HTTP ${res.status}`);
            }
            const body = (await res.json()) as SeedResponse;
            toast({
                type: "success",
                message: `Veri sıfırlandı. ${body.seeded.products} ürün, ${body.seeded.orders} sipariş, ${body.seeded.quotes} teklif yüklendi.`,
            });
            setShowConfirm(false);
            setTimeout(() => window.location.reload(), 2000);
        } catch (err) {
            toast({
                type: "error",
                message: err instanceof Error ? err.message : "Sıfırlama başarısız.",
            });
            setBusy(false);
        }
    };

    return (
        <div
            style={{
                margin: "32px 24px",
                padding: "20px 22px",
                border: "0.5px solid var(--danger-border)",
                background: "var(--danger-bg)",
                borderRadius: "8px",
            }}
        >
            <div
                style={{
                    fontSize: "11px",
                    color: "var(--danger-text)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginBottom: "10px",
                    fontWeight: 600,
                }}
            >
                Tehlikeli Bölge
            </div>
            <div
                style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: "6px",
                }}
            >
                Demo Verisini Sıfırla
            </div>
            <div
                style={{
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                    marginBottom: "14px",
                    maxWidth: "560px",
                }}
            >
                Tüm sipariş, ürün, müşteri, teklif, AI öneri, import ve uyarı verilerini siler.
                Yerine sade demo seed (8 ürün, 4 müşteri, 7 sipariş, 3 teklif) yükler.
                <strong style={{ color: "var(--danger-text)" }}> Bu işlem geri alınamaz.</strong>
            </div>
            <Button
                variant="dangerSoft"
                leftIcon={<RotateCcw size={14} />}
                onClick={handleClick}
                disabled={isDemo || busy}
                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
            >
                Tüm Verileri Sıfırla ve Demo Yükle
            </Button>

            {showConfirm && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1000,
                        padding: "20px",
                    }}
                    onClick={() => !busy && setShowConfirm(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="reset-demo-confirm-title"
                        style={{
                            background: "var(--bg-secondary)",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "10px",
                            padding: "24px 26px",
                            maxWidth: "440px",
                            width: "100%",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            id="reset-demo-confirm-title"
                            style={{
                                fontSize: "15px",
                                fontWeight: 600,
                                color: "var(--text-primary)",
                                marginBottom: "10px",
                            }}
                        >
                            Emin misiniz?
                        </div>
                        <div
                            style={{
                                fontSize: "13px",
                                color: "var(--text-secondary)",
                                lineHeight: 1.6,
                                marginBottom: "20px",
                            }}
                        >
                            Bu işlem mevcut tüm operasyonel veriyi (sipariş, ürün, müşteri, teklif, AI öneri,
                            import, uyarı) silecek ve yerine demo seed yükleyecek. İş verisi kaybedilirse
                            geri getirilemez.
                            {busy && (
                                <div
                                    style={{
                                        marginTop: "14px",
                                        fontSize: "12px",
                                        color: "var(--accent-text)",
                                    }}
                                >
                                    Sıfırlanıyor… 10-30 saniye sürebilir.
                                </div>
                            )}
                        </div>
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                            <Button
                                variant="secondary"
                                onClick={() => setShowConfirm(false)}
                                disabled={busy}
                            >
                                İptal
                            </Button>
                            <Button
                                variant="danger"
                                leftIcon={<RotateCcw size={14} />}
                                onClick={handleConfirm}
                                disabled={busy}
                            >
                                {busy ? "Sıfırlanıyor…" : "Evet, sıfırla"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

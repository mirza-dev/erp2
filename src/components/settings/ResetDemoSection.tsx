"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { RotateCcw } from "lucide-react";

/**
 * Tehlikeli Bölge — tüm iş verisini siler, yerine demo seed yükler.
 *
 * 2026-08-29 — YAZILI ONAY. Bu bölüm eskiden tek "Emin misiniz?" diyaloğunun
 * arkasındaydı ve adı ("Demo Verisini Sıfırla") yaptığı işten çok daha masum
 * duruyordu. Kritik gerçek: **ayrı bir geliştirme veritabanı YOK** — yerel
 * `.env.local` da fabrikanın canlı Supabase projesine bakıyor. Yani buradaki
 * tek yanlış tık, gerçek sipariş/teklif/stok verisini götürür ve geri alınamaz.
 *
 * Bu yüzden ortam-bazlı gizleme (dev'de göster, prod'da gizle) burada anlamsız:
 * gizlenecek bir "prod" ayrımı yok. Bariyer eylemin kendisine kondu — admin
 * firma adını BİREBİR yazmadan buton açılmıyor ve aynı metin sunucuya da
 * gidiyor (`/api/seed` oturum yolunda `confirm` alanını `company_settings.name`
 * ile karşılaştırır). Böylece onay kozmetik değil, uygulanan bir kural.
 */

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
    const [companyName, setCompanyName] = useState<string | null>(null);
    const [typed, setTyped] = useState("");

    // Firma adı onay anahtarı — sunucu da aynı değerle karşılaştırır.
    useEffect(() => {
        const ctrl = new AbortController();
        fetch("/api/settings/company", { signal: ctrl.signal })
            .then(r => (r.ok ? r.json() : null))
            .then(s => {
                if (s && typeof s.name === "string") setCompanyName(s.name.trim());
            })
            .catch(() => {/* iptal veya ağ hatası — onay kilidi kapalı kalır */});
        return () => ctrl.abort();
    }, []);

    // Firma adı okunamadıysa buton AÇILMAZ (fail-closed): doğrulanamayan onay
    // onay değildir; sunucu da bu durumda 503 döner.
    const confirmed = companyName !== null && companyName.length > 0 && typed.trim() === companyName;

    const handleClick = () => {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        setTyped("");
        setShowConfirm(true);
    };

    const closeConfirm = () => {
        if (busy) return;
        setShowConfirm(false);
        setTyped("");
    };

    const handleConfirm = async () => {
        if (!confirmed) return;
        setBusy(true);
        try {
            const res = await fetch("/api/seed", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirm: typed.trim() }),
            });
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
                Tüm Veriyi Sil ve Demo Yükle
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
                Bu işlem <strong style={{ color: "var(--danger-text)" }}>canlı veritabanında</strong> çalışır:
                tüm sipariş, ürün, müşteri, teklif, AI öneri, import ve uyarı verilerini siler.
                Yerine sade demo seed (8 ürün, 4 müşteri, 7 sipariş, 3 teklif) yükler.
                <strong style={{ color: "var(--danger-text)" }}> Geri alınamaz.</strong> Onaylamak
                için firma adını elle yazmanız gerekir.
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
                // `dismissible={!busy}`: sıfırlama sürerken Escape/dış tıklama
                // kapatmaz — eski `onClick={() => !busy && ...}` guard'ının aynısı.
                <Modal
                    onClose={closeConfirm}
                    labelledBy="reset-demo-confirm-title"
                    width="min(440px, calc(100vw - 28px))"
                    dismissible={!busy}
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
                                marginBottom: "16px",
                            }}
                        >
                            Bu işlem mevcut tüm operasyonel veriyi (sipariş, ürün, müşteri, teklif, AI öneri,
                            import, uyarı) silecek ve yerine demo seed yükleyecek. İş verisi kaybedilirse
                            geri getirilemez.
                        </div>

                        <label
                            htmlFor="reset-demo-confirm-input"
                            style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}
                        >
                            {companyName
                                ? <>Onaylamak için firma adını yazın: <strong style={{ color: "var(--text-primary)" }}>{companyName}</strong></>
                                : "Firma adı okunamadı — sıfırlama onaylanamıyor."}
                        </label>
                        <input
                            id="reset-demo-confirm-input"
                            type="text"
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            disabled={busy || !companyName}
                            autoComplete="off"
                            placeholder={companyName ?? ""}
                            style={{
                                width: "100%",
                                boxSizing: "border-box",
                                fontSize: "13px",
                                padding: "8px 10px",
                                borderRadius: "6px",
                                border: `var(--line-width) solid ${confirmed ? "var(--success-border)" : "var(--border-secondary)"}`,
                                background: "var(--input-bg)",
                                color: "var(--text-primary)",
                            }}
                        />

                        {busy && (
                            <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--accent-text)" }}>
                                Sıfırlanıyor… 10-30 saniye sürebilir.
                            </div>
                        )}

                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" }}>
                            <Button
                                variant="secondary"
                                onClick={closeConfirm}
                                disabled={busy}
                            >
                                İptal
                            </Button>
                            <Button
                                variant="danger"
                                leftIcon={<RotateCcw size={14} />}
                                onClick={handleConfirm}
                                disabled={busy || !confirmed}
                                title={!confirmed ? "Firma adını birebir yazın." : undefined}
                            >
                                {busy ? "Sıfırlanıyor…" : "Evet, sıfırla"}
                            </Button>
                        </div>
                </Modal>
            )}
        </div>
    );
}

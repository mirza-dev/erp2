"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { getQuoteActions, isQuoteEditable, getQuoteConvertAction, getQuoteReviseEligible, type QuoteAction } from "../_utils/quote-display";
import QuoteForm from "../_components/QuoteForm";
import type { QuoteDetail } from "@/lib/mock-data";
import type { QuoteStatus } from "@/lib/database.types";

// ── Status config ────────────────────────────────────────────────────────────

const quoteStatusConfig: Record<QuoteStatus, { label: string; bg: string; color: string; border: string; description: string }> = {
    draft:    { label: "Taslak",       bg: "var(--bg-tertiary)",    color: "var(--text-secondary)", border: "var(--border-secondary)", description: "Henüz gönderilmedi" },
    sent:     { label: "Gönderildi",   bg: "var(--accent-bg)",      color: "var(--accent-text)",    border: "var(--accent-border)",    description: "Müşteri yanıtı bekleniyor" },
    accepted: { label: "Kabul Edildi", bg: "var(--success-bg)",     color: "var(--success-text)",   border: "var(--success-border)",   description: "Müşteri kabul etti" },
    rejected: { label: "Reddedildi",   bg: "var(--danger-bg)",      color: "var(--danger-text)",    border: "var(--danger-border)",    description: "Müşteri reddetti" },
    expired:  { label: "Süresi Doldu", bg: "var(--warning-bg)",     color: "var(--warning-text)",   border: "var(--warning-border)",   description: "Geçerlilik süresi geçti" },
    revised:  { label: "Revize Edildi", bg: "var(--bg-tertiary)",   color: "var(--text-secondary)", border: "var(--border-secondary)", description: "Yeni revizyonla değiştirildi" },
};

// Faz 8: GET /api/quotes/[id] bu alanları da döndürüyor
// Faz 5: revizyon zinciri bağları (revisedBy/revisionOf)
interface QuoteChainRef {
    id: string;
    quoteNumber: string;
}
interface QuoteDetailWithConversion extends QuoteDetail {
    convertedOrderId?: string;
    convertedOrderNumber?: string;
    revisedBy?: QuoteChainRef | null;
    revisionOf?: QuoteChainRef | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function QuoteDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [quote, setQuote] = useState<QuoteDetailWithConversion | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(true);
    const [status, setStatus] = useState<QuoteStatus>("draft");
    const [loading, setLoading] = useState<string | null>(null);
    const [converting, setConverting] = useState(false);
    const [revising, setRevising] = useState(false);
    const [archiveLoading, setArchiveLoading] = useState(false);
    const [convertedOrderId, setConvertedOrderId] = useState<string | null>(null);
    const [convertedOrderNumber, setConvertedOrderNumber] = useState<string | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{
        action: string;
        title: string;
        message: string;
        confirmLabel: string;
        variant: "primary" | "danger";
    } | null>(null);

    // ── Fetch quote ──────────────────────────────────────────────────────────

    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/quotes/${params.id}`, { signal: controller.signal })
            .then(r => {
                if (!r.ok) throw new Error("Not found");
                return r.json();
            })
            .then((data: QuoteDetailWithConversion) => {
                setQuote(data);
                setStatus(data.status);
                setConvertedOrderId(data.convertedOrderId ?? null);
                setConvertedOrderNumber(data.convertedOrderNumber ?? null);
            })
            .catch(err => {
                if (err.name !== "AbortError") {
                    console.error("Failed to load quote:", err);
                }
            })
            .finally(() => setQuoteLoading(false));
        return () => controller.abort();
    }, [params.id]);

    // ── Transition handlers ──────────────────────────────────────────────────

    const requestTransition = (action: QuoteAction) => {
        if (action.confirm) {
            setConfirmDialog({
                action: action.transition,
                title: action.confirm.title,
                message: action.confirm.message,
                confirmLabel: action.confirm.confirmLabel,
                variant: action.variant,
            });
        } else {
            handleTransition(action.transition);
        }
    };

    const handleTransition = async (transition: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setLoading(transition);
        try {
            const res = await fetch(`/api/quotes/${params.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transition }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast({ type: "error", message: data.error || "İşlem başarısız." });
                return;
            }
            setStatus(data.status);
            setQuote(data);

            // Faz 4: send başarılı ama arşiv üretilemediyse görünür uyarı (sessiz değil).
            if (transition === "sent" && data.archiveWarning) {
                toast({ type: "warning", message: "Teklif gönderildi ancak arşiv oluşturulamadı." });
            } else {
                const labels: Record<string, string> = {
                    sent: "Teklif gönderildi",
                    accepted: "Teklif kabul edildi",
                    rejected: "Teklif reddedildi",
                };
                toast({ type: transition === "rejected" ? "warning" : "success", message: labels[transition] || "Durum güncellendi" });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.";
            toast({ type: "error", message: msg });
        } finally {
            setLoading(null);
        }
    };

    // ── Accept + sipariş handler (Faz 6, atomik) ─────────────────────────────
    // Eski "Kabul Et" (PATCH transition) + "Siparişe Dönüştür" (/convert) iki
    // adımının yerine TEK atomik POST /accept (RPC 077). Hem sent (kabul+sipariş)
    // hem legacy accepted+siparişsiz (recover) durumunu kapsar.

    const handleAccept = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setConverting(true);
        try {
            const res = await fetch(`/api/quotes/${params.id}/accept`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) {
                toast({ type: "error", message: data.error || "İşlem başarısız." });
                return;
            }
            setStatus("accepted");
            setConvertedOrderId(data.orderId ?? null);
            setConvertedOrderNumber(data.orderNumber ?? null);
            if (data.already) {
                toast({ type: "info", message: `Bu teklif zaten siparişe dönüştürülmüş: ${data.orderNumber}` });
            } else {
                toast({ type: "success", message: `Teklif kabul edildi, sipariş oluşturuldu: ${data.orderNumber}` });
            }
            router.push(`/dashboard/orders/${data.orderId}`);
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu." });
        } finally {
            setConverting(false);
        }
    };

    // ── Revize handler (Faz 5) ───────────────────────────────────────────────

    const handleRevise = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setRevising(true);
        try {
            const res = await fetch(`/api/quotes/${params.id}/revise`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) {
                toast({ type: "error", message: data.error || "Revizyon oluşturulamadı." });
                return;
            }
            toast({ type: "success", message: `Revizyon oluşturuldu: ${data.newQuoteNumber}` });
            router.push(`/dashboard/quotes/${data.newQuoteId}`);
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu." });
        } finally {
            setRevising(false);
        }
    };

    // ── Arşiv görüntüle (Faz 4, V2-5 Mod B) ──────────────────────────────────
    // Gönderilmiş teklifin dondurulmuş HTML arşivinin signed URL'ini açar.
    // Read-only → demo modda izinli.

    const handleViewArchive = async () => {
        setArchiveLoading(true);
        try {
            const res = await fetch(`/api/quotes/${params.id}/archive`);
            const data = await res.json();
            if (!res.ok || !data.url) {
                toast({ type: "info", message: data.error || "Arşiv bulunamadı." });
                return;
            }
            window.open(data.url, "_blank", "noopener");
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Arşiv açılamadı." });
        } finally {
            setArchiveLoading(false);
        }
    };

    // ── Loading / Not Found ──────────────────────────────────────────────────

    if (quoteLoading) {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                Teklif yükleniyor...
            </div>
        );
    }

    if (!quote) {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                Teklif bulunamadı.{" "}
                <Link href="/dashboard/quotes" style={{ color: "var(--accent-text)" }}>
                    Geri dön
                </Link>
            </div>
        );
    }

    // ── Render ───────────────────────────────────────────────────────────────

    const statusCfg = quoteStatusConfig[status];
    const actions = getQuoteActions(status, quote.quoteNumber);
    const editable = isQuoteEditable(status);
    // UI hardening: herhangi bir mutasyon (transition/convert/revise) sürerken
    // tüm aksiyon butonları disable → eşzamanlı çift mutasyon kafa karışıklığı önlenir.
    const anyMutating = loading !== null || converting || revising;

    return (
        <div style={{ position: "relative" }}>
            {/* ── Status Header ── */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px 20px",
                borderBottom: "0.5px solid var(--border-tertiary)",
                background: "var(--bg-primary)",
                flexWrap: "wrap",
            }}>
                {/* Back + breadcrumb */}
                <Link href="/dashboard/quotes" style={{ color: "var(--text-tertiary)", textDecoration: "none", fontSize: "13px" }}>
                    ← Teklifler
                </Link>
                <span style={{ color: "var(--text-tertiary)", fontSize: "13px" }}>/</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--text-primary)", fontWeight: 500 }}>
                    {quote.quoteNumber}
                </span>

                {/* Status badge */}
                <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "2px 10px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    background: statusCfg.bg,
                    color: statusCfg.color,
                    border: `0.5px solid ${statusCfg.border}`,
                }}>
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "currentColor" }} />
                    {statusCfg.label}
                </span>

                {/* Status description */}
                <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                    {statusCfg.description}
                </span>

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Action buttons (status transitions) */}
                {actions.length > 0 && (
                    <div style={{ display: "flex", gap: "8px" }}>
                        {actions.map((action) => (
                            <Button
                                key={action.transition}
                                variant={action.variant}
                                onClick={() => requestTransition(action)}
                                disabled={isDemo || anyMutating}
                                loading={action.transition === "accepted" ? converting : loading === action.transition}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                            >
                                {action.transition === "accepted" && converting
                                    ? "Kabul ediliyor, sipariş oluşturuluyor..."
                                    : loading === action.transition
                                    ? (action.transition === "sent" ? "Gönderiliyor..." : "Reddediliyor...")
                                    : action.label}
                            </Button>
                        ))}
                    </div>
                )}

                {/* Siparişe Dönüştür — legacy accepted + henüz siparişi yok (Faz 6: iskonto
                    artık destekli; atomik /accept ile recover). */}
                {status === "accepted" && !convertedOrderId && (
                    <Button
                        variant="primary"
                        onClick={() => {
                            const info = getQuoteConvertAction(quote.quoteNumber);
                            setConfirmDialog({
                                action: "convert_to_order",
                                title: info.confirmTitle,
                                message: info.confirmMessage,
                                confirmLabel: info.confirmLabel,
                                variant: "primary",
                            });
                        }}
                        disabled={isDemo || anyMutating}
                        loading={converting}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                    >
                        {converting ? "Dönüştürülüyor..." : "Siparişe Dönüştür"}
                    </Button>
                )}

                {/* Zaten dönüştürüldü badge */}
                {status === "accepted" && convertedOrderId && (
                    <Link
                        href={`/dashboard/orders/${convertedOrderId}`}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 12px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: 500,
                            background: "var(--success-bg)",
                            color: "var(--success-text)",
                            border: "0.5px solid var(--success-border)",
                            textDecoration: "none",
                        }}
                    >
                        ✓ Sipariş oluşturuldu: {convertedOrderNumber}
                    </Link>
                )}

                {/* Faz 5: Revize Et — sent/rejected/expired */}
                {getQuoteReviseEligible(status) && (
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setConfirmDialog({
                                action: "revise_quote",
                                title: "Teklifi Revize Et",
                                message: `${quote.quoteNumber} numaralı teklifin düzenlenebilir bir kopyası oluşturulacak; bu teklif "Revize Edildi" olarak kilitlenecek. Devam edilsin mi?`,
                                confirmLabel: "Evet, Revize Et",
                                variant: "primary",
                            });
                        }}
                        disabled={isDemo || anyMutating}
                        loading={revising}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                    >
                        {revising ? "Revize ediliyor..." : "Revize Et"}
                    </Button>
                )}

                {/* Faz 4 (V2-5 Mod B): gönderilmiş teklifin dondurulmuş arşivi */}
                {status !== "draft" && (
                    <Button
                        variant="secondary"
                        leftIcon={<FileText size={14} />}
                        onClick={handleViewArchive}
                        loading={archiveLoading}
                        title="Gönderilen teklifin dondurulmuş (immutable) kopyası"
                    >
                        {archiveLoading ? "Açılıyor..." : "Arşivlenmiş Teklif"}
                    </Button>
                )}

                {/* Faz 5: revize edildi rozeti (kaynak → en yeni revizyon) */}
                {quote.revisedBy && (
                    <Link
                        href={`/dashboard/quotes/${quote.revisedBy.id}`}
                        role="status"
                        style={{
                            display: "inline-flex", alignItems: "center", gap: "6px",
                            padding: "4px 12px", borderRadius: "4px", fontSize: "12px", fontWeight: 500,
                            background: "var(--warning-bg)", color: "var(--warning-text)",
                            border: "0.5px solid var(--warning-border)", textDecoration: "none",
                        }}
                    >
                        ↻ Bu teklif revize edildi → {quote.revisedBy.quoteNumber}
                    </Link>
                )}

                {/* Faz 5: revizyon rozeti (kaynağa link) */}
                {quote.revisionOf && (
                    <Link
                        href={`/dashboard/quotes/${quote.revisionOf.id}`}
                        role="status"
                        style={{
                            display: "inline-flex", alignItems: "center", gap: "6px",
                            padding: "4px 12px", borderRadius: "4px", fontSize: "12px", fontWeight: 500,
                            background: "var(--accent-bg)", color: "var(--accent-text)",
                            border: "0.5px solid var(--accent-border)", textDecoration: "none",
                        }}
                    >
                        Revizyon {quote.revisionNo} — kaynak: {quote.revisionOf.quoteNumber}
                    </Link>
                )}
            </div>

            {/* ── Quote Form ── */}
            <QuoteForm initialData={quote} readOnly={!editable} status={status} />

            {/* ── Confirm Dialog ── */}
            {confirmDialog && (
                <>
                    <div
                        onClick={() => setConfirmDialog(null)}
                        style={{
                            position: "fixed",
                            inset: 0,
                            zIndex: 100,
                            background: "rgba(0,0,0,0.6)",
                        }}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="quote-confirm-dialog-title"
                        style={{
                            position: "fixed",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            zIndex: 101,
                            background: "var(--bg-primary)",
                            border: `0.5px solid ${confirmDialog.variant === "danger" ? "var(--danger-border)" : "var(--accent-border)"}`,
                            borderRadius: "8px",
                            padding: "20px 24px",
                            width: "380px",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                            <div
                                style={{
                                    width: "22px",
                                    height: "22px",
                                    borderRadius: "4px",
                                    background: confirmDialog.variant === "danger" ? "var(--danger-bg)" : "var(--warning-bg)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                }}
                            >
                                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                                    <path d="M5 1L9 9H1z" fill={confirmDialog.variant === "danger" ? "var(--danger-text)" : "var(--warning-text)"} />
                                </svg>
                            </div>
                            <div id="quote-confirm-dialog-title" style={{
                                fontSize: "13px",
                                fontWeight: 600,
                                color: confirmDialog.variant === "danger" ? "var(--danger-text)" : "var(--text-primary)",
                            }}>
                                {confirmDialog.title}
                            </div>
                        </div>

                        <div style={{
                            fontSize: "13px",
                            color: "var(--text-secondary)",
                            lineHeight: 1.6,
                            marginBottom: "16px",
                        }}>
                            {confirmDialog.message}
                        </div>

                        <div style={{ display: "flex", gap: "8px" }}>
                            <Button variant="secondary" onClick={() => setConfirmDialog(null)} style={{ flex: 1 }}>
                                Vazgeç
                            </Button>
                            <Button
                                variant={confirmDialog.variant}
                                onClick={() => {
                                    const action = confirmDialog.action;
                                    setConfirmDialog(null);
                                    // Faz 6: hem sent "accepted" hem legacy "convert_to_order"
                                    // → tek atomik /accept (handleAccept).
                                    if (action === "convert_to_order" || action === "accepted") {
                                        handleAccept();
                                    } else if (action === "revise_quote") {
                                        handleRevise();
                                    } else {
                                        handleTransition(action);
                                    }
                                }}
                                style={{ flex: 1 }}
                            >
                                {confirmDialog.confirmLabel}
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

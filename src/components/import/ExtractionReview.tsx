"use client";

/**
 * Faz 3b — Extraction review screen.
 *
 * AI ekstraksiyonu ile çıkarılan satırları gösterir; her satırda match
 * candidate dropdown'u + aksiyon butonları. PATCH /api/import/document-lines/[id]
 * ile review override yapılır. "Çıkar" CTA POST /api/import/documents/[id]/extract
 * ile satırları üretir/yeniler.
 *
 * Pure helpers live in @/lib/extraction-review-helpers.
 */
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
    ImportDocumentRow,
    ImportDocumentLineRow,
    ImportDocumentLineMatchAction,
    ImportDocumentLineCandidate,
    ProductTypeFieldRow,
    TechnicalExtractionEvidence,
} from "@/lib/database.types";
import { useIsDemo, DEMO_BLOCK_TOAST, DEMO_DISABLED_TOOLTIP } from "@/lib/demo-utils";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
    formatMatchAction,
    getMatchActionColor,
    isCertFlowDocumentType,
} from "@/lib/extraction-review-helpers";
import type { ApplyResultSummary } from "@/lib/extraction-review-helpers";
import { confidenceLabel } from "@/lib/technical-templates";

// ── Props ────────────────────────────────────────────────────────────────────

export interface QueuedSuggestedType {
    id: string;
    name: string;
    fields: ProductTypeFieldRow[];
}

export interface ExtractionReviewProps {
    document: ImportDocumentRow;
    initialLines: ImportDocumentLineRow[];
    productTypes: QueuedSuggestedType[];
}

export default function ExtractionReview({ document: doc, initialLines, productTypes }: ExtractionReviewProps) {
    const isDemo = useIsDemo();
    const { toast } = useToast();
    const router = useRouter();

    const isCertFlow = isCertFlowDocumentType(doc.classification?.document_type ?? null);

    const [lines, setLines] = useState<ImportDocumentLineRow[]>(initialLines);
    const [extracting, setExtracting] = useState(false);
    // Cert-flow'da suggested_product_type_id default'a aktarılmaz (anlamsız);
    // product-flow'da AI'nın önerdiği tipi başlangıç olarak gösterir.
    const [overrideTypeId, setOverrideTypeId] = useState<string>(
        isCertFlow ? "" : (doc.classification?.suggested_product_type_id ?? ""),
    );

    // Faz 3c — Apply pipeline state
    const [applying, setApplying] = useState(false);
    const [applyResult, setApplyResult] = useState<ApplyResultSummary | null>(null);
    const [docStatus, setDocStatus] = useState<typeof doc.status>(doc.status);
    const isDocApplied = docStatus === "applied";
    // Faz 3c Review 4.tur (P3): başka oturum apply'ı sürüyor veya post-commit
    // status fail sonrası takılı kalan durum — UI buton disable + net mesaj.
    const isDocApplying = docStatus === "applying";
    const hasApplicable = lines.some(l =>
        l.match_action === "matched" || l.match_action === "reviewed" || l.match_action === "new_product",
    );

    async function handleApply() {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        if (!hasApplicable) {
            toast({ type: "info", message: "Uygulanacak satır yok" });
            return;
        }
        setApplying(true);
        try {
            const res = await fetch(`/api/import/documents/${doc.id}/apply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            const body = await res.json().catch(() => ({}));
            // Faz 3c Review 4.tur (P3): 409 = başka oturum apply'ı sürüyor.
            // UI state'ini senkron tut → buton disable + "devam ediyor" mesajı.
            if (res.status === 409) {
                toast({ type: "info", message: body.error ?? "Belge şu anda uygulanıyor" });
                setDocStatus("applying");
                return;
            }
            if (!res.ok) {
                toast({ type: "error", message: body.error ?? "Uygulama başarısız" });
                return;
            }
            const result = body.result as ApplyResultSummary;
            setApplyResult(result);
            const successCount = result.products_created + result.products_updated + result.attachments_created;
            // Faz 3c Review 5.tur: post-commit status update fail → ürün/cert
            // yazıldı ama doc 'applying'de takılı. 'applied' setleme YAPMA
            // (yanıltıcı); UI 'applying' ile senkron + warning + admin recovery
            // mesajı. Duplicate engelleme service-side aktif (claim CAS).
            if (result.status_update_failed) {
                setDocStatus("applying");
                router.refresh();
                toast({
                    type: "warning",
                    message: `${successCount} işlem yazıldı ancak belge durumu güncellenemedi. Yönetici müdahalesi gerekiyor.`,
                });
                return;
            }
            // Faz 3c Review P2-2: all-fail durumunda doc 'classified' kalır —
            // button enabled kalmalı, retry mümkün olsun.
            if (successCount > 0) {
                setDocStatus("applied");
                router.refresh();
                toast({ type: "success", message: `${successCount} işlem uygulandı` });
            } else if (result.errors.length > 0) {
                toast({
                    type: "warning",
                    message: "Hiçbir satır uygulanamadı — hataları inceleyip tekrar deneyin",
                });
            }
            if (result.errors.length > 0 && successCount > 0) {
                toast({ type: "error", message: `${result.errors.length} satır hatayla atlandı` });
            }
        } catch (e) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Bilinmeyen hata" });
        } finally {
            setApplying(false);
        }
    }

    async function handleExtract() {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        setExtracting(true);
        try {
            const body: Record<string, unknown> = {};
            // Cert-flow'da productTypeId body'ye eklenmez (route zaten ignore
            // ediyor ama defansif olarak burada da temiz tutulur).
            if (overrideTypeId && !isCertFlow) body.productTypeId = overrideTypeId;
            const res = await fetch(`/api/import/documents/${doc.id}/extract`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            // Review 3b P2-C: 422 → AI hiç çıkaramadı, eski satırlar korundu
            if (res.status === 422) {
                const err = await res.json().catch(() => ({}));
                toast({ type: "info", message: err.error ?? "AI hiçbir satır çıkaramadı." });
                return;
            }
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast({ type: "error", message: err.error ?? "Ekstraksiyon başarısız" });
                return;
            }
            const data = await res.json() as { lines: ImportDocumentLineRow[] };
            setLines(data.lines);
            toast({ type: "success", message: `${data.lines.length} satır çıkarıldı` });
        } catch (e) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Bilinmeyen hata" });
        } finally {
            setExtracting(false);
        }
    }

    async function patchLine(lineId: string, payload: {
        match_action: ImportDocumentLineMatchAction;
        matched_product_id?: string | null;
        match_confidence?: number | null;
        product_type_id?: string | null;
        extracted_attributes?: Record<string, unknown>;
        extraction_evidence?: TechnicalExtractionEvidence;
    }) {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        try {
            const res = await fetch(`/api/import/document-lines/${lineId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast({ type: "error", message: err.error ?? "Güncelleme başarısız" });
                return;
            }
            const data = await res.json() as { line: ImportDocumentLineRow };
            setLines(prev => prev.map(l => l.id === lineId ? data.line : l));
        } catch (e) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Bilinmeyen hata" });
        }
    }

    function handleSelectCandidate(line: ImportDocumentLineRow, candidate: ImportDocumentLineCandidate) {
        void patchLine(line.id, {
            match_action: "matched",
            matched_product_id: candidate.id,
            match_confidence: candidate.score,
        });
    }

    function handleMarkNew(line: ImportDocumentLineRow) {
        void patchLine(line.id, { match_action: "new_product", matched_product_id: null });
    }

    function handleSkip(line: ImportDocumentLineRow) {
        void patchLine(line.id, { match_action: "skipped", matched_product_id: null });
    }

    async function handleTypeChange(line: ImportDocumentLineRow, newTypeId: string | null) {
        const nextType = newTypeId ? productTypes.find(t => t.id === newTypeId) : null;
        const allowedKeys = new Set(nextType?.fields.map(f => f.field_key) ?? []);
        const filteredAttributes = Object.fromEntries(
            Object.entries(line.extracted_attributes ?? {}).filter(([key]) => allowedKeys.has(key)),
        );
        const filteredEvidence = Object.fromEntries(
            Object.entries(line.extraction_evidence ?? {}).filter(([key]) => allowedKeys.has(key)),
        ) as TechnicalExtractionEvidence;
        await patchLine(line.id, {
            match_action: line.match_action,
            matched_product_id: line.matched_product_id,
            match_confidence: line.match_confidence,
            product_type_id: newTypeId,
            extracted_attributes: filteredAttributes,
            extraction_evidence: filteredEvidence,
        });
    }

    async function patchTechnicalAttribute(line: ImportDocumentLineRow, field: ProductTypeFieldRow, value: unknown) {
        const nextAttributes = { ...(line.extracted_attributes ?? {}) };
        if (value === "" || value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
            delete nextAttributes[field.field_key];
        } else {
            nextAttributes[field.field_key] = value;
        }
        const nextEvidence: TechnicalExtractionEvidence = {
            ...(line.extraction_evidence ?? {}),
            [field.field_key]: {
                confidence: "medium",
                evidence_text: line.extraction_evidence?.[field.field_key]?.evidence_text ?? null,
                normalization_note: "Kullanıcı onay ekranında düzenledi.",
            },
        };
        if (!(field.field_key in nextAttributes)) delete nextEvidence[field.field_key];
        await patchLine(line.id, {
            match_action: line.match_action,
            matched_product_id: line.matched_product_id,
            match_confidence: line.match_confidence,
            product_type_id: line.product_type_id,
            extracted_attributes: nextAttributes,
            extraction_evidence: nextEvidence,
        });
    }

    function getProductTypeForLine(line: ImportDocumentLineRow) {
        return line.product_type_id ? productTypes.find(t => t.id === line.product_type_id) ?? null : null;
    }

    function renderTechnicalEditor(line: ImportDocumentLineRow, field: ProductTypeFieldRow) {
        const disabled = isDemo || isDocApplied || isDocApplying;
        const value = (line.extracted_attributes ?? {})[field.field_key];

        if (field.field_type === "boolean") {
            return (
                <input
                    type="checkbox"
                    checked={value === true}
                    disabled={disabled}
                    onChange={event => void patchTechnicalAttribute(line, field, event.target.checked)}
                    aria-label={`${line.line_number}. satır ${field.label_tr}`}
                    style={{ width: "16px", height: "16px", accentColor: "var(--accent)" }}
                />
            );
        }

        if (field.field_type === "select") {
            return (
                <select
                    value={typeof value === "string" ? value : ""}
                    disabled={disabled}
                    onChange={event => void patchTechnicalAttribute(line, field, event.target.value)}
                    aria-label={`${line.line_number}. satır ${field.label_tr}`}
                    style={techInputStyle}
                >
                    <option value="">—</option>
                    {(field.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
                </select>
            );
        }

        if (field.field_type === "multiselect") {
            const selected = Array.isArray(value) ? value.map(String) : [];
            return (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                    {(field.options ?? []).map(option => {
                        const on = selected.includes(option);
                        return (
                            <button
                                key={option}
                                type="button"
                                disabled={disabled}
                                onClick={() => {
                                    const next = on ? selected.filter(item => item !== option) : [...selected, option];
                                    void patchTechnicalAttribute(line, field, next);
                                }}
                                style={{
                                    fontSize: "11px",
                                    padding: "3px 8px",
                                    borderRadius: "999px",
                                    border: `0.5px solid ${on ? "var(--accent-border)" : "var(--border-secondary)"}`,
                                    background: on ? "var(--accent-bg)" : "transparent",
                                    color: on ? "var(--accent-text)" : "var(--text-secondary)",
                                    cursor: disabled ? "not-allowed" : "pointer",
                                }}
                            >
                                {option}
                            </button>
                        );
                    })}
                </div>
            );
        }

        if (field.field_type === "longtext") {
            return (
                <textarea
                    defaultValue={typeof value === "string" ? value : value == null ? "" : String(value)}
                    disabled={disabled}
                    onBlur={event => void patchTechnicalAttribute(line, field, event.target.value)}
                    aria-label={`${line.line_number}. satır ${field.label_tr}`}
                    rows={2}
                    style={{ ...techInputStyle, resize: "vertical" }}
                />
            );
        }

        return (
            <input
                type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
                defaultValue={value == null ? "" : String(value)}
                disabled={disabled}
                onBlur={event => {
                    const raw = event.target.value;
                    void patchTechnicalAttribute(line, field, field.field_type === "number" && raw !== "" ? Number(raw) : raw);
                }}
                aria-label={`${line.line_number}. satır ${field.label_tr}`}
                style={techInputStyle}
            />
        );
    }

    function handleApproveAll() {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        // Tüm 'matched' önerileri 'reviewed' olarak kilitle
        const pending = lines.filter(l => l.match_action === "matched");
        if (pending.length === 0) {
            toast({ type: "info", message: "Onaylanacak satır yok" });
            return;
        }
        // Review 3b P2-E: res.ok kontrolü — 400/403/500 sessiz başarı olmasın
        Promise.all(pending.map(async l => {
            try {
                const res = await fetch(`/api/import/document-lines/${l.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        match_action: "reviewed",
                        matched_product_id: l.matched_product_id,
                        match_confidence: l.match_confidence,
                    }),
                });
                return { ok: res.ok, id: l.id };
            } catch {
                return { ok: false, id: l.id };
            }
        })).then(results => {
            const succeededIds = new Set(results.filter(r => r.ok).map(r => r.id));
            const okCount = succeededIds.size;
            const failedCount = results.length - okCount;
            // Review 3b 2.tur P3: optimistic local state — router.refresh()
            // Server Component'leri yeniler ama useState(initialLines) ilk
            // değerinde kalır; client state'i de açıkça güncelle.
            if (okCount > 0) {
                const nowIso = new Date().toISOString();
                setLines(prev => prev.map(l => succeededIds.has(l.id)
                    ? { ...l, match_action: "reviewed", reviewed_at: nowIso }
                    : l,
                ));
                router.refresh();
                toast({ type: "success", message: `${okCount} satır onaylandı` });
            }
            if (failedCount > 0) {
                toast({ type: "error", message: `${failedCount} satır onaylanamadı` });
            }
        });
    }

    const docType = doc.classification?.document_type ?? "unknown";
    const docConf = doc.classification?.confidence ?? 0;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                <div>
                    <Link href="/dashboard/import" style={{ fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none" }}>
                        ← İçeri Aktar
                    </Link>
                    <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: "8px 0 4px" }}>
                        {doc.file_name}
                    </h1>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                        Tip: <strong style={{ color: "var(--text-secondary)" }}>{docType}</strong>
                        {" · "}Güven: <strong>{Math.round(docConf * 100)}%</strong>
                        {doc.classification?.summary && (
                            <>{" · "}<span style={{ fontStyle: "italic" }}>{doc.classification.summary}</span></>
                        )}
                    </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {/* Multi-type filter — default "AI otomatik": tüm tipler context'e
                        geçirilir, AI her satırın tipini kendi seçer (PMT multi-type).
                        "Sadece X" seçilirse availableProductTypes tek tipe filtre olur.
                        Cert-flow'da gizlenir — sertifika product_type_id kullanmıyor. */}
                    {!isCertFlow && (
                        <select
                            value={overrideTypeId}
                            onChange={e => setOverrideTypeId(e.target.value)}
                            aria-label="Ürün tipi filtresi"
                            style={{
                                padding: "6px 10px", fontSize: "12px",
                                background: "var(--bg-secondary)", color: "var(--text-primary)",
                                border: "0.5px solid var(--border-secondary)", borderRadius: "5px",
                            }}
                        >
                            <option value="">— Otomatik (AI seçer) —</option>
                            {productTypes.map(t => <option key={t.id} value={t.id}>Sadece {t.name}</option>)}
                        </select>
                    )}
                    <Button
                        variant="primary"
                        onClick={handleExtract}
                        disabled={isDemo || extracting || isDocApplied || isDocApplying}
                        title={
                            isDemo
                                ? DEMO_DISABLED_TOOLTIP
                                : isDocApplied
                                    ? "Belge uygulandı, tekrar çıkarılamaz"
                                    : isDocApplying
                                        ? "Belge şu anda uygulanıyor, sayfayı yenileyin"
                                        : undefined
                        }
                    >
                        {extracting ? "Çıkarılıyor…" : lines.length > 0 ? "Yeniden Çıkar" : "Çıkar"}
                    </Button>
                </div>
            </div>

            {/* Empty state */}
            {lines.length === 0 && (
                <div style={{
                    padding: "32px", textAlign: "center",
                    background: "var(--bg-secondary)", border: "0.5px dashed var(--border-secondary)",
                    borderRadius: "8px", color: "var(--text-tertiary)",
                }}>
                    Bu belgeden henüz satır çıkarılmadı. &quot;Çıkar&quot; ile AI ekstraksiyonunu başlatın.
                </div>
            )}

            {/* Lines table */}
            {lines.length > 0 && (
                <>
                    {/* Bulk action */}
                    <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 12px", background: "var(--bg-secondary)",
                        border: "0.5px solid var(--border-tertiary)", borderRadius: "6px",
                    }}>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                            {lines.length} satır çıkarıldı · {lines.filter(l => l.match_action === "matched").length} otomatik eşleşti · {lines.filter(l => l.match_action === "pending").length} inceleme bekliyor
                        </span>
                        <Button
                            variant="secondary"
                            onClick={handleApproveAll}
                            disabled={isDemo}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                        >
                            Eşleşmeleri Onayla
                        </Button>
                    </div>

                    <div style={{ overflow: "auto", border: "0.5px solid var(--border-tertiary)", borderRadius: "6px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                            <thead>
                                <tr style={{ background: "var(--bg-secondary)" }}>
                                    <th style={th}>#</th>
                                    <th style={th}>Ad / SKU</th>
                                    {!isCertFlow && <th style={th}>Tip</th>}
                                    <th style={th}>Adaylar</th>
                                    <th style={th}>Skor</th>
                                    <th style={th}>Durum</th>
                                    <th style={th}>Aksiyon</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map(line => {
                                    const colors = getMatchActionColor(line.match_action);
                                    const lineType = getProductTypeForLine(line);
                                    const techFields = lineType?.fields ?? [];
                                    const detailColSpan = isCertFlow ? 6 : 7;
                                    return (
                                        <Fragment key={line.id}>
                                            <tr style={{ borderTop: "0.5px solid var(--border-tertiary)" }}>
                                                <td style={td}>{line.line_number}</td>
                                                <td style={td}>
                                                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{line.extracted_name ?? "—"}</div>
                                                    {line.extracted_sku && (
                                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "monospace" }}>{line.extracted_sku}</div>
                                                    )}
                                                </td>
                                                {/* Review 3b 3.tur: per-row tip override (multi-type).
                                                    Review 3b 6.tur: cert-flow'da gizli — sertifika satırı tip
                                                    kullanmıyor (3c'de hedef ürüne göre belirlenir). */}
                                                {!isCertFlow && (
                                                    <td style={td}>
                                                        <select
                                                            value={line.product_type_id ?? ""}
                                                            onChange={e => {
                                                                const v = e.target.value;
                                                                void handleTypeChange(line, v === "" ? null : v);
                                                            }}
                                                            disabled={isDemo || isDocApplied || isDocApplying}
                                                            aria-label={`Satır ${line.line_number} teknik şablon`}
                                                            style={{
                                                                padding: "4px 8px", fontSize: "11px",
                                                                background: "var(--bg-primary)", color: "var(--text-primary)",
                                                                border: "0.5px solid var(--border-secondary)", borderRadius: "4px",
                                                                minWidth: "120px",
                                                            }}
                                                        >
                                                            <option value="">— Yok —</option>
                                                            {productTypes.map(t => (
                                                                <option key={t.id} value={t.id}>{t.name}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                )}
                                                <td style={td}>
                                                    {line.candidate_matches.length === 0 ? (
                                                        <span style={{ color: "var(--text-tertiary)" }}>Aday yok</span>
                                                    ) : (
                                                        <select
                                                            value={line.matched_product_id ?? ""}
                                                            onChange={e => {
                                                                const candId = e.target.value;
                                                                const cand = line.candidate_matches.find(c => c.id === candId);
                                                                if (cand) handleSelectCandidate(line, cand);
                                                            }}
                                                            disabled={isDemo || isDocApplied || isDocApplying}
                                                            aria-label={`Satır ${line.line_number} aday seç`}
                                                            style={{
                                                                padding: "4px 8px", fontSize: "11px",
                                                                background: "var(--bg-primary)", color: "var(--text-primary)",
                                                                border: "0.5px solid var(--border-secondary)", borderRadius: "4px",
                                                                minWidth: "200px",
                                                            }}
                                                        >
                                                            <option value="">— Seçilmedi —</option>
                                                            {line.candidate_matches.map(c => (
                                                                <option key={c.id} value={c.id}>
                                                                    {c.sku} · {c.name} ({c.score})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </td>
                                                <td style={td}>
                                                    {line.match_confidence !== null ? `${line.match_confidence}` : "—"}
                                                </td>
                                                <td style={td}>
                                                    <span style={{
                                                        fontSize: "11px", padding: "2px 8px", borderRadius: "10px",
                                                        background: colors.bg, color: colors.text,
                                                        border: `0.5px solid ${colors.border}`, fontWeight: 600,
                                                    }}>
                                                        {formatMatchAction(line.match_action)}
                                                    </span>
                                                </td>
                                                <td style={td}>
                                                    <div style={{ display: "flex", gap: "4px" }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleMarkNew(line)}
                                                            disabled={isDemo || isDocApplied || isDocApplying}
                                                            aria-label={`Satır ${line.line_number} yeni ürün`}
                                                            style={btnSecondary}
                                                        >
                                                            Yeni
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSkip(line)}
                                                            disabled={isDemo || isDocApplied || isDocApplying}
                                                            aria-label={`Satır ${line.line_number} atla`}
                                                            style={btnSecondary}
                                                        >
                                                            Atla
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {!isCertFlow && techFields.length > 0 && (
                                                <tr key={`${line.id}-tech`}>
                                                    <td colSpan={detailColSpan} style={{ padding: "0 10px 12px", borderBottom: "0.5px solid var(--border-tertiary)", background: "var(--bg-primary)" }}>
                                                        <div style={{ border: "0.5px solid var(--border-tertiary)", borderRadius: "6px", padding: "10px", background: "var(--bg-secondary)" }}>
                                                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                                                                Teknik bilgiler · {lineType?.name}
                                                            </div>
                                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px" }}>
                                                                {techFields.map(field => {
                                                                    const evidence = line.extraction_evidence?.[field.field_key];
                                                                    return (
                                                                        <div key={field.id} style={{ border: "0.5px solid var(--border-tertiary)", borderRadius: "6px", padding: "8px", background: "var(--bg-primary)" }}>
                                                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                                                                                <span style={{ fontSize: "12px", fontWeight: 650, color: "var(--text-primary)" }}>{field.label_tr}{field.required ? " *" : ""}</span>
                                                                                <span style={{
                                                                                    fontSize: "10px",
                                                                                    padding: "2px 6px",
                                                                                    borderRadius: "999px",
                                                                                    background: evidence?.confidence === "high" ? "var(--success-bg)" : evidence?.confidence === "medium" ? "var(--accent-bg)" : "var(--warning-bg)",
                                                                                    color: evidence?.confidence === "high" ? "var(--success-text)" : evidence?.confidence === "medium" ? "var(--accent-text)" : "var(--warning-text)",
                                                                                }}>
                                                                                    {confidenceLabel(evidence?.confidence ?? "not_found")}
                                                                                </span>
                                                                            </div>
                                                                            {renderTechnicalEditor(line, field)}
                                                                            {evidence?.evidence_text && (
                                                                                <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.4 }}>
                                                                                    Kanıt: {evidence.evidence_text}
                                                                                </div>
                                                                            )}
                                                                            {evidence?.normalization_note && (
                                                                                <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.4 }}>
                                                                                    Not: {evidence.normalization_note}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Faz 3c — apply result paneli (apply başarılı sonrasında görünür) */}
                    {applyResult && (
                        <div
                            role="status"
                            aria-live="polite"
                            style={{
                                padding: "12px 14px",
                                background: "var(--bg-secondary)",
                                border: "0.5px solid var(--border-tertiary)",
                                borderRadius: "6px",
                                display: "flex", flexDirection: "column", gap: "8px",
                            }}
                        >
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                                Uygulama sonucu
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                {applyResult.products_created} yeni ürün · {applyResult.products_updated} güncelleme · {applyResult.attachments_created} sertifika · {applyResult.skipped} atlandı
                                {applyResult.attachments_superseded > 0 && (
                                    <> · {applyResult.attachments_superseded} eski sertifika önceki versiyona alındı</>
                                )}
                            </div>
                            {/* Faz 3c Review 5.tur: post-commit status fail → admin recovery */}
                            {applyResult.status_update_failed && (
                                <div
                                    role="alert"
                                    style={{
                                        fontSize: "11px", padding: "8px 10px",
                                        background: "var(--danger-bg)", color: "var(--danger-text)",
                                        border: "0.5px solid var(--danger-border)", borderRadius: "5px",
                                        lineHeight: 1.5,
                                    }}
                                >
                                    ⚠️ İşlemler başarıyla yazıldı ancak belge durumu &quot;applied&quot; olarak güncellenemedi
                                    (belge &quot;applying&quot;de takılı kaldı). Duplicate apply engellenmiş durumda.
                                    Yönetici müdahalesi gerekiyor — belgeyi manuel olarak &quot;applied&quot; durumuna alın.
                                </div>
                            )}
                            {applyResult.untyped_products > 0 && (
                                <div style={{
                                    fontSize: "11px", padding: "6px 10px",
                                    background: "var(--warning-bg)", color: "var(--warning-text)",
                                    border: "0.5px solid var(--warning-border)", borderRadius: "5px",
                                }}>
                                    {applyResult.untyped_products} ürün tipsiz oluşturuldu — ürün detayından tip atayın
                                </div>
                            )}
                            {applyResult.errors.length > 0 && (
                                <details style={{ fontSize: "11px" }}>
                                    <summary style={{ cursor: "pointer", color: "var(--danger-text)" }}>
                                        {applyResult.errors.length} satır hatayla atlandı (detay)
                                    </summary>
                                    <ul style={{ marginTop: "6px", paddingLeft: "16px", color: "var(--text-secondary)" }}>
                                        {applyResult.errors.map((e, i) => (
                                            <li key={i}>{e}</li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </div>
                    )}

                    {/* Apply footer (Faz 3c) */}
                    <div style={{
                        display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px",
                        padding: "12px 0", borderTop: "0.5px solid var(--border-tertiary)",
                    }}>
                        {isDocApplied && (
                            <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                                Belge uygulandı — yeni doküman yükleyerek devam edin
                            </span>
                        )}
                        {isDocApplying && (
                            <span style={{ fontSize: "12px", color: "var(--warning-text)" }}>
                                Belge uygulanıyor — başka bir oturumda devam ediyor olabilir
                            </span>
                        )}
                        <Button
                            variant="primary"
                            onClick={handleApply}
                            disabled={isDemo || applying || !hasApplicable || isDocApplied || isDocApplying}
                            title={
                                isDemo ? DEMO_DISABLED_TOOLTIP
                                : isDocApplied ? "Belge zaten uygulandı"
                                : isDocApplying ? "Belge şu anda uygulanıyor"
                                : !hasApplicable ? "Uygulanacak (matched/reviewed/new_product) satır yok"
                                : undefined
                            }
                        >
                            {applying ? "Uygulanıyor…" : "Uygula"}
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}

const th: React.CSSProperties = {
    padding: "8px 10px", textAlign: "left",
    color: "var(--text-secondary)", fontWeight: 600,
    fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px",
};

const td: React.CSSProperties = {
    padding: "10px", color: "var(--text-primary)", verticalAlign: "top",
};

const btnSecondary: React.CSSProperties = {
    padding: "4px 10px", fontSize: "11px",
    background: "transparent", color: "var(--text-secondary)",
    border: "0.5px solid var(--border-secondary)", borderRadius: "4px",
    cursor: "pointer",
};

const techInputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "5px 8px",
    fontSize: "12px",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "5px",
};

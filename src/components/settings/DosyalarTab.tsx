"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, Folder, Search, Trash2, UploadCloud } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_BLOCK_TOAST, DEMO_DISABLED_TOOLTIP } from "@/lib/demo-utils";
import type { CompanyFileRow, CompanyFileCategory } from "@/lib/database.types";
import {
    FILE_CATEGORIES,
    catLabel,
    splitName,
    formatFileSize,
    extTextColor,
    isAllowedCompanyFileExt,
    MAX_COMPANY_FILE_SIZE,
    ALLOWED_COMPANY_FILE_EXT_LABEL,
    ALLOWED_COMPANY_FILE_EXT_MIME,
    COMPANY_FILES_STORAGE_LIMIT_MB,
} from "@/lib/company-files";

/**
 * Ayarlar → Dosyalar: şirket dosya arşivi (handoff: design_handoff_settings_files_tab).
 * Yükleme isimlendirme onayıyla; pencere-geneli sürükle-bırak; kategori filtresi +
 * arama + sıralama; önizle/indir imzalı URL; soft-delete; depolama göstergesi.
 */

const ACCEPT_ATTR = Object.keys(ALLOWED_COMPANY_FILE_EXT_MIME).map(e => `.${e}`).join(",");

type SortKey = "name" | "size" | "date";
type CatFilter = "all" | CompanyFileCategory;

interface PendingFile {
    file: File;
    base: string;
    ext: string;
    size: number;
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Depolama etiketi: < 1 GB → "85 MB", üstü → "1,25 GB". */
function formatUsed(usedBytes: number): string {
    const usedMB = usedBytes / 1048576;
    return usedMB >= 1024
        ? (usedMB / 1024).toFixed(2).replace(".", ",") + " GB"
        : Math.round(usedMB) + " MB";
}

// ── Kurumsal belge ikonu: sade dosya silüeti + küçük uzantı etiketi ──────────
function DocIcon({ ext }: { ext: string }) {
    return (
        <span className="file-doc-icon">
            <svg width="22" height="28" viewBox="0 0 22 28" fill="none" aria-hidden="true">
                <path
                    d="M3 1.5h10.5L19 7v18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 25V3a1.5 1.5 0 0 1 1.5-1.5Z"
                    transform="translate(-1.5 0)"
                    fill="var(--surface-subtle)" stroke="currentColor" strokeWidth="1.2"
                />
                <path
                    d="M12 1.5V7h5.5"
                    transform="translate(-1.5 0)"
                    fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
                />
            </svg>
            <span className="ext-tag" style={{ color: extTextColor(ext) }}>{ext}</span>
        </span>
    );
}

// ── Kategori açılır filtresi ─────────────────────────────────────────────────
function CategoryDropdown({ cat, onSelect, counts }: {
    cat: CatFilter;
    onSelect: (c: CatFilter) => void;
    counts: Record<string, number>;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    const items: { key: CatFilter; label: string }[] = [
        { key: "all", label: "Tüm Kategoriler" },
        ...FILE_CATEGORIES,
    ];
    const current = cat === "all" ? "Tüm Kategoriler" : catLabel(cat);

    return (
        <div className="cat-dropdown" ref={ref}>
            <button
                type="button"
                className={`cat-trigger${cat !== "all" ? " is-filtered" : ""}`}
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-haspopup="menu"
            >
                <Folder size={14} aria-hidden="true" />
                {current}
                <span style={{ fontSize: "11px", opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
                    {counts[cat] ?? 0}
                </span>
                <span className="chev" aria-hidden="true">▼</span>
            </button>
            {open && (
                <div className="cat-menu" role="menu">
                    {items.map(c => (
                        <button
                            key={c.key}
                            type="button"
                            role="menuitem"
                            className={`cat-menu-item${cat === c.key ? " is-active" : ""}`}
                            onClick={() => { onSelect(c.key); setOpen(false); }}
                        >
                            <span>{c.label}</span>
                            <span className="count">{counts[c.key] ?? 0}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Yükleme öncesi isimlendirme penceresi ────────────────────────────────────
function UploadModal({ pending, onBaseChange, category, onCategoryChange, onCancel, onConfirm, saving }: {
    pending: PendingFile[];
    onBaseChange: (idx: number, base: string) => void;
    category: CompanyFileCategory;
    onCategoryChange: (c: CompanyFileCategory) => void;
    onCancel: () => void;
    onConfirm: () => void;
    saving: boolean;
}) {
    // Escape kapatır; açılışta ilk ad alanına odak; kapanışta tetikleyiciye dönüş.
    const firstInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const prevFocus = document.activeElement as HTMLElement | null;
        firstInputRef.current?.focus();
        firstInputRef.current?.select();
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
        window.addEventListener("keydown", handler);
        return () => { window.removeEventListener("keydown", handler); prevFocus?.focus?.(); };
    }, [onCancel]);

    const valid = pending.every(p => p.base.trim().length > 0);

    return (
        <>
            <div
                onClick={onCancel}
                style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", animation: "fade-in 0.2s ease-out" }}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={pending.length === 1 ? "Dosyayı yükle" : `${pending.length} dosyayı yükle`}
                style={{
                    position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                    zIndex: 201, width: "min(480px, calc(100vw - 32px))", maxHeight: "min(560px, calc(100vh - 48px))",
                    background: "var(--bg-primary)", border: "0.5px solid var(--border-secondary)",
                    borderRadius: "12px", boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
                    padding: "20px 22px", display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto",
                }}
            >
                <div>
                    <div style={{ fontSize: "15px", fontWeight: 650, color: "var(--text-primary)" }}>
                        {pending.length === 1 ? "Dosyayı Yükle" : `${pending.length} Dosyayı Yükle`}
                    </div>
                    <div style={{ fontSize: "11.5px", color: "var(--text-tertiary)", marginTop: "3px" }}>
                        Arşivde görünecek adı düzenleyin ve kategori seçin.
                    </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {pending.map((p, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <DocIcon ext={(p.ext.toUpperCase().slice(0, 4)) || "—"} />
                            <input
                                ref={idx === 0 ? firstInputRef : undefined}
                                type="text"
                                value={p.base}
                                maxLength={200}
                                placeholder="Dosya adı"
                                aria-label={`Dosya adı (${idx + 1})`}
                                onChange={(e) => onBaseChange(idx, e.target.value)}
                                disabled={saving}
                                style={modalInputStyle}
                            />
                            {p.ext && (
                                <span style={{ fontSize: "12px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                                    .{p.ext}
                                </span>
                            )}
                            <span style={{ fontSize: "11.5px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                                {formatFileSize(p.size)}
                            </span>
                        </div>
                    ))}
                </div>

                <div>
                    <label htmlFor="company-file-category" style={modalLabelStyle}>KATEGORİ</label>
                    <select
                        id="company-file-category"
                        value={category}
                        onChange={(e) => onCategoryChange(e.target.value as CompanyFileCategory)}
                        disabled={saving}
                        style={{ ...modalInputStyle, width: "100%" }}
                    >
                        {FILE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                </div>

                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                    <Button variant="secondary" size="md" fullWidth onClick={onCancel} disabled={saving}>İptal</Button>
                    <Button
                        variant="primary"
                        size="md"
                        fullWidth
                        onClick={onConfirm}
                        disabled={!valid || saving}
                        leftIcon={<UploadCloud size={15} aria-hidden="true" />}
                    >
                        {saving ? "Yükleniyor..." : "Yükle"}
                    </Button>
                </div>
            </div>
        </>
    );
}

const modalLabelStyle: React.CSSProperties = {
    fontSize: "10px", fontWeight: 700, color: "var(--text-tertiary)",
    letterSpacing: "0.04em", textTransform: "uppercase", display: "block", marginBottom: "4px",
};
const modalInputStyle: React.CSSProperties = {
    fontSize: "13px", padding: "7px 10px", flex: 1, minWidth: 0,
    border: "var(--line-width) solid var(--border-secondary)", borderRadius: "6px",
    background: "var(--input-bg)", color: "var(--text-primary)", boxSizing: "border-box",
};

// ── Ana sekme ────────────────────────────────────────────────────────────────
export default function DosyalarTab() {
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [files, setFiles] = useState<CompanyFileRow[]>([]);
    const [usedBytes, setUsedBytes] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [query, setQuery] = useState("");
    const [cat, setCat] = useState<CatFilter>("all");
    const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
    const [dragging, setDragging] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [pending, setPending] = useState<PendingFile[] | null>(null);
    const [pendingCat, setPendingCat] = useState<CompanyFileCategory>("diger");
    const [saving, setSaving] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const dragDepth = useRef(0);
    const catRef = useRef<CatFilter>("all");
    catRef.current = cat;

    const fetchFiles = useCallback(async () => {
        try {
            const res = await fetch("/api/settings/files");
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
            }
            const data = await res.json() as { files: CompanyFileRow[]; usedBytes: number };
            setFiles(data.files ?? []);
            setUsedBytes(data.usedBytes ?? 0);
            setLoadError(null);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : "Dosyalar yüklenemedi.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchFiles(); }, [fetchFiles]);

    // Seçilen dosyalar önce isimlendirme penceresine düşer (doğrudan yükleme yok).
    const stageFiles = useCallback((fileList: FileList | File[]) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        const staged: PendingFile[] = [];
        for (const f of Array.from(fileList)) {
            const { base, ext } = splitName(f.name);
            if (!isAllowedCompanyFileExt(ext)) {
                toast({ type: "error", message: `"${f.name}" desteklenmiyor. Kabul edilenler: ${ALLOWED_COMPANY_FILE_EXT_LABEL}.` });
                continue;
            }
            if (f.size <= 0) {
                toast({ type: "error", message: `"${f.name}" boş görünüyor.` });
                continue;
            }
            if (f.size > MAX_COMPANY_FILE_SIZE) {
                toast({ type: "error", message: `"${f.name}" ${MAX_COMPANY_FILE_SIZE / (1024 * 1024)} MB sınırını aşıyor.` });
                continue;
            }
            staged.push({ file: f, base, ext, size: f.size });
        }
        if (!staged.length) return;
        const activeCat = catRef.current;
        setPendingCat(activeCat === "all" ? "diger" : activeCat);
        setPending(staged);
    }, [isDemo, toast]);

    // Tüm pencere bırakma hedefi: dosya nereye bırakılırsa bırakılsın yakalanır ve
    // tarayıcının dosyayı açıp sayfadan ayrılması engellenir (kritik: preventDefault).
    // Sekme gizliyken (settings panel hidden) tepki verilmez — panel mount kalıyor.
    useEffect(() => {
        const panelHidden = () => rootRef.current?.closest("section[hidden]") !== null;
        const hasFiles = (e: DragEvent) =>
            !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");

        const onEnter = (e: DragEvent) => {
            if (!hasFiles(e) || panelHidden()) return;
            e.preventDefault();
            dragDepth.current++;
            setDragging(true);
        };
        const onOver = (e: DragEvent) => {
            if (!hasFiles(e) || panelHidden()) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        };
        const onLeave = (e: DragEvent) => {
            if (!hasFiles(e) || panelHidden()) return;
            dragDepth.current--;
            if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); }
        };
        const onDrop = (e: DragEvent) => {
            if (panelHidden()) return;
            e.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            if (e.dataTransfer?.files?.length) stageFiles(e.dataTransfer.files);
        };

        window.addEventListener("dragenter", onEnter);
        window.addEventListener("dragover", onOver);
        window.addEventListener("dragleave", onLeave);
        window.addEventListener("drop", onDrop);
        return () => {
            window.removeEventListener("dragenter", onEnter);
            window.removeEventListener("dragover", onOver);
            window.removeEventListener("dragleave", onLeave);
            window.removeEventListener("drop", onDrop);
        };
    }, [stageFiles]);

    const counts = useMemo(() => {
        const map: Record<string, number> = { all: files.length };
        for (const c of FILE_CATEGORIES) map[c.key] = files.filter(f => f.category === c.key).length;
        return map;
    }, [files]);

    const visible = useMemo(() => {
        let list = files;
        if (cat !== "all") list = list.filter(f => f.category === cat);
        const q = query.trim().toLocaleLowerCase("tr-TR");
        if (q) {
            list = list.filter(f =>
                f.display_name.toLocaleLowerCase("tr-TR").includes(q)
                || (f.description ?? "").toLocaleLowerCase("tr-TR").includes(q)
                || (f.uploaded_by ?? "").toLocaleLowerCase("tr-TR").includes(q),
            );
        }
        const dir = sort.dir === "asc" ? 1 : -1;
        return [...list].sort((a, b) => {
            if (sort.key === "name") return a.display_name.localeCompare(b.display_name, "tr-TR") * dir;
            if (sort.key === "size") return (a.file_size - b.file_size) * dir;
            return a.uploaded_at.localeCompare(b.uploaded_at) * dir;
        });
    }, [files, cat, query, sort]);

    const usedPct = Math.min(100, (usedBytes / 1048576 / COMPANY_FILES_STORAGE_LIMIT_MB) * 100);

    const toggleSort = (key: SortKey) => {
        setSort(s => s.key === key
            ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
            : { key, dir: key === "name" ? "asc" : "desc" });
    };

    const sortArrow = (key: SortKey) => sort.key === key
        ? <span className="sort-arrow" aria-hidden="true">{sort.dir === "asc" ? "▲" : "▼"}</span>
        : null;

    const handleConfirmUpload = async () => {
        if (!pending || saving || isDemo) return;
        setSaving(true);
        let ok = 0;
        let lastName = "";
        try {
            for (const p of pending) {
                const fd = new FormData();
                fd.append("file", p.file);
                fd.append("display_name", p.base.trim());
                fd.append("category", pendingCat);
                try {
                    const res = await fetch("/api/settings/files", { method: "POST", body: fd });
                    if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
                    }
                    ok++;
                    lastName = `${p.base.trim()}.${p.ext}`;
                } catch (e) {
                    toast({ type: "error", message: `"${p.base.trim()}.${p.ext}" yüklenemedi: ${e instanceof Error ? e.message : "bilinmeyen hata"}` });
                }
            }
            if (ok > 0) {
                await fetchFiles();
                toast({ type: "success", message: ok === 1 ? `"${lastName}" yüklendi.` : `${ok} dosya yüklendi.` });
            }
            if (ok === pending.length) setPending(null);
            else if (ok > 0) setPending(null); // kısmi başarı: hatalar toast'landı, modal kapanır
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (f: CompanyFileRow) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setConfirmId(null);
        try {
            const res = await fetch(`/api/settings/files/${f.id}`, { method: "DELETE" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
            }
            await fetchFiles();
            toast({ type: "success", message: `"${f.display_name}" silindi. 30 gün çöp kutusunda saklanır.` });
        } catch (e) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Dosya silinemedi." });
        }
    };

    // Önizle: popup-blocker'a takılmamak için sekme SENKRON açılır, URL sonra atanır
    // (teklif arşivi "Belgeyi Aç" dersi). SVG'de buton hiç gösterilmez (stored-XSS,
    // 046 precedent'i — sunucu da inline'ı reddeder).
    const handlePreview = async (f: CompanyFileRow) => {
        const win = window.open("", "_blank");
        try {
            const res = await fetch(`/api/settings/files/${f.id}/download`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const { url } = await res.json() as { url: string };
            if (win) win.location.href = url;
        } catch {
            win?.close();
            toast({ type: "error", message: "Önizleme bağlantısı alınamadı." });
        }
    };

    const handleDownload = async (f: CompanyFileRow) => {
        try {
            const res = await fetch(`/api/settings/files/${f.id}/download?download=1`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const { url } = await res.json() as { url: string };
            // attachment disposition → sayfa değişmeden indirme başlar
            window.location.assign(url);
        } catch {
            toast({ type: "error", message: "İndirme bağlantısı alınamadı." });
        }
    };

    const rowActions = (f: CompanyFileRow) => (
        <div className="file-row-actions">
            {f.mime_type !== "image/svg+xml" && (
                <button type="button" className="file-action-btn" title="Önizle" aria-label={`Önizle: ${f.display_name}`} onClick={() => void handlePreview(f)}>
                    <Eye size={14} aria-hidden="true" />
                </button>
            )}
            <button type="button" className="file-action-btn" title="İndir" aria-label={`İndir: ${f.display_name}`} onClick={() => void handleDownload(f)}>
                <Download size={14} aria-hidden="true" />
            </button>
            {confirmId === f.id ? (
                <Button variant="dangerSoft" size="xs" onClick={() => void handleDelete(f)} onMouseLeave={() => setConfirmId(null)}>
                    Sil?
                </Button>
            ) : (
                <button
                    type="button"
                    className="file-action-btn is-danger"
                    title={isDemo ? DEMO_DISABLED_TOOLTIP : "Sil"}
                    aria-label={`Sil: ${f.display_name}`}
                    onClick={() => {
                        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
                        setConfirmId(f.id);
                    }}
                >
                    <Trash2 size={14} aria-hidden="true" />
                </button>
            )}
        </div>
    );

    if (loading) {
        return <div style={{ fontSize: "13px", color: "var(--text-tertiary)", padding: "20px 0" }}>Yükleniyor…</div>;
    }
    if (loadError) {
        return (
            <div style={{ padding: "20px 0", display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start" }}>
                <div style={{ fontSize: "13px", color: "var(--danger-text)" }}>{loadError}</div>
                <Button variant="secondary" size="sm" onClick={() => { setLoading(true); void fetchFiles(); }}>
                    Yeniden Dene
                </Button>
            </div>
        );
    }

    return (
        <div ref={rootRef} className={`files-tab-root${dragging ? " is-dragging" : ""}`}>
            {dragging && (
                <div className="files-drop-overlay">
                    <span className="files-drop-overlay-inner">
                        <UploadCloud size={22} aria-hidden="true" />
                        Dosyaları buraya bırakın
                    </span>
                </div>
            )}

            <div className="files-toolbar">
                <div className="files-search">
                    <span className="files-search-icon"><Search size={14} aria-hidden="true" /></span>
                    <input
                        type="text"
                        placeholder="Dosya, açıklama veya yükleyen ara…"
                        aria-label="Dosya ara"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        style={searchInputStyle}
                    />
                </div>
                <CategoryDropdown cat={cat} onSelect={setCat} counts={counts} />
                <div style={{ flex: 1 }} />
                <span className="files-dnd-badge" title="Bu sayfaya dosya sürükleyip bırakabilirsiniz">
                    <span className="dnd-dot" aria-hidden="true" />
                    <UploadCloud size={14} aria-hidden="true" />
                    <span className="dnd-label">Sürükle &amp; bırak aktif</span>
                </span>
                <Button
                    variant="primary"
                    size="md"
                    onClick={() => inputRef.current?.click()}
                    disabled={isDemo}
                    title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                    leftIcon={<UploadCloud size={15} aria-hidden="true" />}
                >
                    Dosya Yükle
                </Button>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ACCEPT_ATTR}
                    style={{ display: "none" }}
                    onChange={(e) => {
                        if (e.target.files?.length) stageFiles(e.target.files);
                        e.target.value = "";
                    }}
                />
            </div>

            <div className="files-scroll">
                {visible.length === 0 ? (
                    <div className="files-empty" style={{ border: "none" }}>
                        {query.trim()
                            ? <>&ldquo;{query.trim()}&rdquo; ile eşleşen dosya bulunamadı.</>
                            : <>Bu kategoride henüz dosya yok. İlk dosyayı sağ üstten yükleyin.</>}
                    </div>
                ) : (
                    <table className="files-table">
                        <thead>
                            <tr>
                                <th onClick={() => toggleSort("name")}>Dosya{sortArrow("name")}</th>
                                <th className="no-sort">Kategori</th>
                                <th onClick={() => toggleSort("size")} style={{ textAlign: "right" }}>Boyut{sortArrow("size")}</th>
                                <th onClick={() => toggleSort("date")}>Yüklenme{sortArrow("date")}</th>
                                <th className="no-sort">Yükleyen</th>
                                <th className="no-sort" style={{ width: "120px" }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(f => (
                                <tr key={f.id}>
                                    <td style={{ maxWidth: "320px" }}>
                                        <div className="file-name-cell">
                                            <DocIcon ext={f.ext} />
                                            <span style={{ minWidth: 0 }}>
                                                <span className="fname" style={{ display: "block" }}>{f.display_name}</span>
                                                {f.description && <span className="fdesc" style={{ display: "block" }}>{f.description}</span>}
                                            </span>
                                        </div>
                                    </td>
                                    <td><span className="file-cat-pill">{catLabel(f.category)}</span></td>
                                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                                        {formatFileSize(f.file_size)}
                                    </td>
                                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(f.uploaded_at)}</td>
                                    <td style={{ whiteSpace: "nowrap" }}>{f.uploaded_by ?? "—"}</td>
                                    <td>{rowActions(f)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="files-footer">
                <div className="files-storage">
                    <div className="files-storage-label">
                        <span>Depolama</span>
                        <b>{formatUsed(usedBytes)} / {COMPANY_FILES_STORAGE_LIMIT_MB / 1024} GB</b>
                    </div>
                    <div className="files-storage-bar">
                        <div className="files-storage-fill" style={{ width: Math.max(usedPct, 1.5) + "%" }} />
                    </div>
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                    {visible.length} dosya görüntüleniyor · Silinen dosyalar 30 gün çöp kutusunda saklanır
                </div>
            </div>

            {pending && (
                <UploadModal
                    pending={pending}
                    onBaseChange={(idx, base) => setPending(list => list?.map((p, i) => i === idx ? { ...p, base } : p) ?? null)}
                    category={pendingCat}
                    onCategoryChange={setPendingCat}
                    onCancel={() => { if (!saving) setPending(null); }}
                    onConfirm={() => void handleConfirmUpload()}
                    saving={saving}
                />
            )}
        </div>
    );
}

const searchInputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "7px 10px 7px 32px",
    border: "var(--line-width) solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--input-bg)",
    color: "var(--text-primary)",
    fontWeight: "var(--font-ui-weight)" as React.CSSProperties["fontWeight"],
    width: "100%",
    boxSizing: "border-box",
};

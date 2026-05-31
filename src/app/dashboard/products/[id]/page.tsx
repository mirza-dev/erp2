"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency, maskCurrency, formatNumber } from "@/lib/utils";
import { usePermissions } from "@/lib/auth/use-permissions";
import { mapProduct } from "@/lib/api-mappers";
import type { Product, ProductAttachment, ProductAttachmentKind } from "@/lib/mock-data";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import type { ProductTypeRow, ProductTypeFieldRow } from "@/lib/database.types";
import { DynamicFieldEdit, FieldEdit } from "@/components/products/DynamicFieldEdit";

// Mirror of server-side ALLOWED_MIME — client-safe (no server module imports).
// Source of truth: src/lib/supabase/product-attachments.ts ALLOWED_MIME.
const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

type TabKey = "genel" | "teknik" | "stok" | "tedarik" | "ticari" | "ekler";

interface ProductTypeWithFields extends ProductTypeRow {
    fields: ProductTypeFieldRow[];
}

interface AlertItem {
    id: string;
    title: string;
    description: string | null;
    type: string;
    severity: "critical" | "warning" | "info";
}

interface CommitmentRow {
    id: string;
    quantity: number;
    expected_date: string;
    supplier_name: string | null;
    status: string;
}

interface QuotedItem {
    orderId: string;
    orderNumber: string;
    customerId: string;
    customerName: string;
    quantity: number;
    unitPrice: number | null; // RBAC: view_sales_prices yoksa API null döner
    currency: string;
    commercialStatus: "draft" | "pending_approval";
    orderCreatedAt: string;
    quoteValidUntil: string | null;
}

interface EditForm {
    name: string;
    category: string;
    subCategory: string;
    productFamily: string;
    productType: "manufactured" | "commercial";
    sectorCompatibility: string;
    industries: string;
    useCases: string;
    materialQuality: string;
    originCountry: string;
    productionSite: string;
    standards: string;
    certifications: string;
    unit: string;
    warehouse: string;
    preferredVendor: string;
    leadTimeDays: string;
    weightKg: string;
    price: string;
    currency: string;
    costPrice: string;
    productNotes: string;
    minStockLevel: string;
    dailyUsage: string;
    reorderQty: string;
    productTypeId: string;
    attributes: Record<string, unknown>;
}

function buildEditForm(p: Product): EditForm {
    return {
        name: p.name,
        category: p.category ?? "",
        subCategory: p.subCategory ?? "",
        productFamily: p.productFamily ?? "",
        productType: p.productType,
        sectorCompatibility: p.sectorCompatibility ?? "",
        industries: p.industries ?? "",
        useCases: p.useCases ?? "",
        materialQuality: p.materialQuality ?? "",
        originCountry: p.originCountry ?? "",
        productionSite: p.productionSite ?? "",
        standards: p.standards ?? "",
        certifications: p.certifications ?? "",
        unit: p.unit,
        warehouse: p.warehouse ?? "",
        preferredVendor: p.preferredVendor ?? "",
        leadTimeDays: p.leadTimeDays?.toString() ?? "",
        weightKg: p.weightKg?.toString() ?? "",
        price: p.price?.toString() ?? "",
        currency: p.currency ?? "USD",
        costPrice: p.costPrice?.toString() ?? "",
        productNotes: p.productNotes ?? "",
        minStockLevel: p.minStockLevel?.toString() ?? "0",
        dailyUsage: p.dailyUsage?.toString() ?? "",
        reorderQty: p.reorderQty?.toString() ?? "",
        productTypeId: p.productTypeId ?? "",
        attributes: { ...(p.attributes ?? {}) },
    };
}

// Pure helpers — exported for testing.

export function getMissingRequiredAttributes(
    fields: ProductTypeFieldRow[],
    attributes: Record<string, unknown>,
): string[] {
    return fields
        .filter(f => f.required)
        .filter(f => {
            const v = attributes[f.field_key];
            if (v === undefined || v === null || v === "") return true;
            if (Array.isArray(v) && v.length === 0) return true;
            return false;
        })
        .map(f => f.label_tr);
}

// Returns the set of attribute keys that will be lost if user switches from
// `oldFields` to `newFields`. A key is "lost" if it's present in current
// attributes and not in the new type's field schema.
export function computeLostAttributeKeys(
    currentAttributes: Record<string, unknown>,
    newFields: ProductTypeFieldRow[],
): string[] {
    const newKeys = new Set(newFields.map(f => f.field_key));
    return Object.keys(currentAttributes).filter(k => !newKeys.has(k));
}

const inputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "6px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "5px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    width: "100%",
};

const fieldRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "140px 1fr",
    alignItems: "center",
    gap: "10px",
    padding: "8px 0",
    borderBottom: "0.5px solid var(--border-tertiary)",
};

const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
};

const sectionTitleStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: "10px",
    paddingBottom: "6px",
    borderBottom: "0.5px solid var(--border-tertiary)",
};

const cardStyle: React.CSSProperties = {
    background: "var(--bg-secondary)",
    border: "0.5px solid var(--border-tertiary)",
    borderRadius: "6px",
    padding: "12px 14px",
};

// ── Faz 2d: Attachment helpers (exported for testing) ────────────────────────

export function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const KIND_LABELS_TR: Record<ProductAttachmentKind, string> = {
    image: "Görsel",
    datasheet: "Veri Sayfası",
    certificate: "Sertifika",
    manual: "Manuel",
    drawing: "Çizim",
    other: "Diğer",
};

export function getKindLabel(kind: ProductAttachmentKind): string {
    return KIND_LABELS_TR[kind] ?? "Diğer";
}

const KIND_ICONS: Record<ProductAttachmentKind, string> = {
    image: "🖼️",
    datasheet: "📄",
    certificate: "📜",
    manual: "📘",
    drawing: "📐",
    other: "📎",
};

export function getKindIcon(kind: ProductAttachmentKind): string {
    return KIND_ICONS[kind] ?? "📎";
}

export function pickInitialKind(mimeType: string): ProductAttachmentKind {
    if (typeof mimeType !== "string") return "other";
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType === "application/pdf") return "datasheet";
    return "other";
}

export function groupAttachments(list: ProductAttachment[]): {
    images: ProductAttachment[];
    documents: ProductAttachment[];
} {
    const images: ProductAttachment[] = [];
    const documents: ProductAttachment[] = [];
    for (const a of list) {
        if (a.kind === "image") images.push(a);
        else documents.push(a);
    }
    return { images, documents };
}

// Parses GET /attachments response (defensive shape handling for runtime drift).
export function parseAttachmentsResponse(data: unknown): ProductAttachment[] {
    if (!data || typeof data !== "object") return [];
    const items = (data as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];
    return items as ProductAttachment[];
}

// Faz 3c Review 2.tur: GET /attachments?includeSuperseded=1 response'unun
// "superseded" alanını parse eder (yoksa []). UI Ekler sekmesinde "Önceki
// Sertifika Versiyonları" collapsible bölümünü besler.
export function parseSupersededAttachmentsResponse(data: unknown): ProductAttachment[] {
    if (!data || typeof data !== "object") return [];
    const superseded = (data as { superseded?: unknown }).superseded;
    if (!Array.isArray(superseded)) return [];
    return superseded as ProductAttachment[];
}

// Returns the primary image that ALSO has a non-empty signedUrl (renderable).
export function findPrimaryImageWithUrl(list: ProductAttachment[]): ProductAttachment | undefined {
    return list.find(a => a.isPrimaryImage && a.kind === "image" && !!a.signedUrl);
}

// Builds the multipart body sent by handleUpload.
export function buildUploadFormData(file: File, kind: ProductAttachmentKind): FormData {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    return fd;
}

// Reads { error: "..." } from a non-ok Response body; falls back to a default message.
export async function parseAttachmentApiError(res: Response, fallback: string): Promise<string> {
    try {
        const body = await res.json() as { error?: unknown };
        if (typeof body?.error === "string" && body.error.length > 0) return body.error;
    } catch { /* not JSON */ }
    return fallback;
}

// Returns true on success; opens the URL in a new tab (caller passes a `windowOpen` fn for testability).
export function openSignedUrlInNewTab(
    url: string | null | undefined,
    windowOpen: (u: string, target: string, features: string) => unknown,
): boolean {
    if (typeof url !== "string" || url.length === 0) return false;
    windowOpen(url, "_blank", "noopener,noreferrer");
    return true;
}

// Format an attribute value for read-only display
export function formatAttributeValue(field: ProductTypeFieldRow, value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (field.field_type === "boolean") return value ? "Evet" : "Hayır";
    if (field.field_type === "multiselect") {
        const arr = Array.isArray(value) ? value : [];
        if (arr.length === 0) return "—";
        return arr.map(String).join(", ");
    }
    if (field.field_type === "number") {
        const n = typeof value === "number" ? value : Number(value);
        if (Number.isNaN(n)) return String(value);
        const formatted = n.toLocaleString("tr-TR");
        return field.unit ? `${formatted} ${field.unit}` : formatted;
    }
    return String(value);
}

function FieldView({ label, value }: { label: string; value: string | number | null | undefined }) {
    const display = value === null || value === undefined || value === "" ? "—" : String(value);
    return (
        <div style={fieldRowStyle}>
            <span style={labelStyle}>{label}</span>
            <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>{display}</span>
        </div>
    );
}

export default function ProductDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const { canViewSalesPrices, canViewPurchaseCosts } = usePermissions();

    const productId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const [activeTab, setActiveTab] = useState<TabKey>("genel");
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState<EditForm | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmDeactivate, setConfirmDeactivate] = useState(false);
    const [deactivating, setDeactivating] = useState(false);

    // Product types (for type selector + dynamic Teknik tab)
    const [productTypes, setProductTypes] = useState<ProductTypeRow[]>([]);
    const [activeTypeFields, setActiveTypeFields] = useState<ProductTypeFieldRow[]>([]);
    const [typeFieldsLoading, setTypeFieldsLoading] = useState(false);
    const [pendingTypeChange, setPendingTypeChange] = useState<{ newTypeId: string; newFields: ProductTypeFieldRow[]; lostKeys: string[] } | null>(null);

    // Contextual sections
    const [alerts, setAlerts] = useState<AlertItem[]>([]);
    const [commitments, setCommitments] = useState<CommitmentRow[]>([]);
    const [quotes, setQuotes] = useState<QuotedItem[]>([]);

    // Faz 2d — attachments + upload + lightbox
    const [attachments, setAttachments] = useState<ProductAttachment[]>([]);
    // Faz 3c Review 2.tur — sertifika geçmiş (superseded) listesi + collapsible state
    const [supersededAttachments, setSupersededAttachments] = useState<ProductAttachment[]>([]);
    const [showSuperseded, setShowSuperseded] = useState(false);
    const [attachmentsLoading, setAttachmentsLoading] = useState(false);
    const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
    const [uploadKind, setUploadKind] = useState<ProductAttachmentKind>("image");
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [lightboxAttachment, setLightboxAttachment] = useState<ProductAttachment | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const lightboxCloseBtnRef = useRef<HTMLButtonElement | null>(null);
    const uploadInputRef = useRef<HTMLInputElement | null>(null);

    const fetchProduct = useCallback(async () => {
        if (!productId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/products/${productId}`);
            if (res.status === 404) {
                setNotFound(true);
                setProduct(null);
                return;
            }
            if (!res.ok) {
                setNotFound(true);
                setProduct(null);
                return;
            }
            const data = await res.json();
            setProduct(mapProduct(data));
            setNotFound(false);
        } catch {
            setNotFound(true);
            setProduct(null);
        } finally {
            setLoading(false);
        }
    }, [productId]);

    useEffect(() => {
        fetchProduct();
    }, [fetchProduct]);

    // Load product types list once on mount
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/product-types");
                if (!cancelled && res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) setProductTypes(data);
                }
            } catch { /* graceful */ }
        })();
        return () => { cancelled = true; };
    }, []);

    // Load active type's fields whenever product.productTypeId (or edited type) changes
    const activeTypeId: string | null =
        editMode && editForm
            ? (editForm.productTypeId || null)
            : (product?.productTypeId ?? null);

    useEffect(() => {
        if (!activeTypeId) { setActiveTypeFields([]); return; }
        let cancelled = false;
        setTypeFieldsLoading(true);
        (async () => {
            try {
                const res = await fetch(`/api/product-types/${activeTypeId}?withFields=1`);
                if (!cancelled && res.ok) {
                    const data: ProductTypeWithFields = await res.json();
                    setActiveTypeFields(Array.isArray(data.fields) ? data.fields : []);
                } else if (!cancelled) {
                    setActiveTypeFields([]);
                }
            } catch {
                if (!cancelled) setActiveTypeFields([]);
            } finally {
                if (!cancelled) setTypeFieldsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [activeTypeId]);

    // Fetch contextual sections (alerts/commitments/quotes) once product is loaded
    useEffect(() => {
        if (!product) return;
        const controller = new AbortController();
        (async () => {
            try {
                const [aRes, cRes, qRes] = await Promise.all([
                    fetch(`/api/alerts?entity_type=product&entity_id=${product.id}&status=open`, { signal: controller.signal }).catch(() => null),
                    fetch(`/api/purchase-commitments?product_id=${product.id}&status=pending`, { signal: controller.signal }).catch(() => null),
                    fetch(`/api/products/${product.id}/quotes`, { signal: controller.signal }).catch(() => null),
                ]);
                if (aRes && aRes.ok) {
                    const aJson = await aRes.json();
                    const list = Array.isArray(aJson) ? aJson : (aJson.items ?? []);
                    setAlerts(list.filter((a: { resolved_at?: string | null }) => !a.resolved_at).map((a: {
                        id: string;
                        title: string;
                        description: string | null;
                        type: string;
                        severity: "critical" | "warning" | "info";
                    }) => ({
                        id: a.id,
                        title: a.title,
                        description: a.description,
                        type: a.type,
                        severity: a.severity,
                    })));
                }
                if (cRes && cRes.ok) {
                    const cJson = await cRes.json();
                    const list = Array.isArray(cJson) ? cJson : (cJson.items ?? []);
                    setCommitments(list);
                }
                if (qRes && qRes.ok) {
                    const qJson = await qRes.json();
                    setQuotes(Array.isArray(qJson.items) ? qJson.items : []);
                }
            } catch {
                /* swallow — non-critical contextual sections */
            }
        })();
        return () => controller.abort();
    }, [product]);

    // Handle type selection — if changing to a different type, check if any
    // attribute keys would be lost. If so, open confirm modal; otherwise apply.
    const handleTypeChange = async (newTypeId: string) => {
        if (!editForm) return;
        const currentTypeId = editForm.productTypeId;
        if (newTypeId === currentTypeId) return;
        // Clearing the type: if attributes exist, warn before dropping them
        if (!newTypeId) {
            const lostKeys = Object.keys(editForm.attributes ?? {});
            if (lostKeys.length > 0) {
                setPendingTypeChange({ newTypeId: "", newFields: [], lostKeys });
            } else {
                setEditForm(f => f && ({ ...f, productTypeId: "" }));
            }
            return;
        }
        try {
            const res = await fetch(`/api/product-types/${newTypeId}?withFields=1`);
            if (!res.ok) {
                toast({ type: "error", message: "Tip alanları yüklenemedi." });
                return;
            }
            const data: ProductTypeWithFields = await res.json();
            const newFields = Array.isArray(data.fields) ? data.fields : [];
            const lostKeys = computeLostAttributeKeys(editForm.attributes ?? {}, newFields);
            if (lostKeys.length === 0) {
                setEditForm(f => f && ({ ...f, productTypeId: newTypeId }));
            } else {
                setPendingTypeChange({ newTypeId, newFields, lostKeys });
            }
        } catch {
            toast({ type: "error", message: "Tip değişimi başarısız." });
        }
    };

    const confirmTypeChange = () => {
        if (!pendingTypeChange || !editForm) return;
        const { newTypeId, newFields } = pendingTypeChange;
        const newKeys = new Set(newFields.map(f => f.field_key));
        const filtered: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(editForm.attributes ?? {})) {
            if (newKeys.has(k)) filtered[k] = v;
        }
        setEditForm(f => f && ({ ...f, productTypeId: newTypeId, attributes: filtered }));
        setPendingTypeChange(null);
    };

    const cancelTypeChange = () => setPendingTypeChange(null);

    // Set a single attribute value (for Teknik tab)
    const setAttribute = (key: string, value: unknown) => {
        setEditForm(f => {
            if (!f) return f;
            const next = { ...(f.attributes ?? {}) };
            if (value === "" || value === null || value === undefined) {
                delete next[key];
            } else {
                next[key] = value;
            }
            return { ...f, attributes: next };
        });
    };

    const handleEditClick = () => {
        if (!product) return;
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setEditForm(buildEditForm(product));
        setEditMode(true);
    };

    // Faz 2d — Attachments fetch + handlers
    // Faz 3c Review 2.tur: ?includeSuperseded=1 — response { items, superseded }
    // ile aktif + önceki sertifika versiyonları aynı round-trip'te döner.
    const fetchAttachments = useCallback(async () => {
        if (!productId) return;
        setAttachmentsLoading(true);
        try {
            const res = await fetch(`/api/products/${productId}/attachments?includeSuperseded=1`);
            if (!res.ok) {
                setAttachmentsError("Ekler yüklenemedi. Lütfen tekrar deneyin.");
                return;
            }
            const data = await res.json();
            setAttachments(parseAttachmentsResponse(data));
            setSupersededAttachments(parseSupersededAttachmentsResponse(data));
            setAttachmentsError(null);
        } catch {
            setAttachmentsError("Ekler yüklenemedi. Lütfen tekrar deneyin.");
        } finally {
            setAttachmentsLoading(false);
        }
    }, [productId]);

    // Faz 2d Review P3-001: signed URL TTL=1h; uzun açık kalan sayfada
    // expire olursa img onError ile tek bir attachment için fresh URL çek.
    const refreshSignedUrl = useCallback(async (attId: string) => {
        if (!productId) return;
        try {
            const res = await fetch(`/api/products/${productId}/attachments/${attId}/url`);
            if (!res.ok) return;
            const data = await res.json() as { url?: string };
            if (typeof data.url !== "string" || !data.url) return;
            const fresh = data.url;
            setAttachments(prev => prev.map(a => a.id === attId ? { ...a, signedUrl: fresh } : a));
            setLightboxAttachment(prev => prev && prev.id === attId ? { ...prev, signedUrl: fresh } : prev);
        } catch { /* swallow */ }
    }, [productId]);

    useEffect(() => {
        if (!product) return;
        fetchAttachments();
    }, [product, fetchAttachments]);

    const handleUpload = async () => {
        if (!product) return;
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!uploadFile) return;
        setUploading(true);
        try {
            const res = await fetch(`/api/products/${product.id}/attachments`, {
                method: "POST",
                body: buildUploadFormData(uploadFile, uploadKind),
            });
            if (!res.ok) {
                toast({ type: "error", message: await parseAttachmentApiError(res, "Dosya yüklenemedi.") });
                return;
            }
            toast({ type: "success", message: "Dosya yüklendi." });
            setUploadFile(null);
            if (uploadInputRef.current) uploadInputRef.current.value = "";
            await fetchAttachments();
        } finally {
            setUploading(false);
        }
    };

    const handleSetPrimary = async (attId: string) => {
        if (!product) return;
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        try {
            const res = await fetch(`/api/products/${product.id}/attachments/${attId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_primary_image: true }),
            });
            if (!res.ok) {
                toast({ type: "error", message: await parseAttachmentApiError(res, "Ana görsel ayarlanamadı.") });
                return;
            }
            toast({ type: "success", message: "Ana görsel güncellendi." });
            await fetchAttachments();
        } catch {
            toast({ type: "error", message: "Ana görsel ayarlanamadı." });
        }
    };

    const handleDeleteAttachment = async (attId: string, fileName: string) => {
        if (!product) return;
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!window.confirm(`"${fileName}" dosyası silinecek. Onaylıyor musun?`)) return;
        try {
            const res = await fetch(`/api/products/${product.id}/attachments/${attId}`, {
                method: "DELETE",
            });
            if (!res.ok && res.status !== 204) {
                toast({ type: "error", message: await parseAttachmentApiError(res, "Dosya silinemedi.") });
                return;
            }
            toast({ type: "success", message: "Dosya silindi." });
            await fetchAttachments();
        } catch {
            toast({ type: "error", message: "Dosya silinemedi." });
        }
    };

    // Faz 2d Review P3-006: belge "İndir" linki click time'da /url endpoint'ten
    // fresh signed URL alır → 1h TTL aşılsa bile çalışır.
    const handleDownloadDocument = async (attId: string) => {
        if (!product) return;
        try {
            const res = await fetch(`/api/products/${product.id}/attachments/${attId}/url`);
            if (!res.ok) {
                toast({ type: "error", message: "İndirme bağlantısı alınamadı." });
                return;
            }
            const data = await res.json() as { url?: string };
            if (!openSignedUrlInNewTab(data.url, window.open.bind(window))) {
                toast({ type: "error", message: "İndirme bağlantısı geçersiz." });
                return;
            }
            // Liste state'ini de tazeleyelim ki sonraki tıklama da geçerli URL'i gösterir.
            if (typeof data.url === "string") {
                const fresh = data.url;
                setAttachments(prev => prev.map(a => a.id === attId ? { ...a, signedUrl: fresh } : a));
            }
        } catch {
            toast({ type: "error", message: "İndirme bağlantısı alınamadı." });
        }
    };

    // Lightbox focus management + ESC
    useEffect(() => {
        if (!lightboxAttachment) return;
        previousFocusRef.current = (document.activeElement as HTMLElement) ?? null;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        lightboxCloseBtnRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setLightboxAttachment(null);
        };
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
            previousFocusRef.current?.focus();
        };
    }, [lightboxAttachment]);

    const handleCancelEdit = () => {
        setEditMode(false);
        setEditForm(null);
    };

    const handleSave = async () => {
        if (!editForm || !product) return;
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        const missingRequired = getMissingRequiredAttributes(activeTypeFields, editForm.attributes ?? {});
        if (missingRequired.length > 0) {
            toast({ type: "error", message: `Zorunlu alanlar eksik: ${missingRequired.join(", ")}` });
            return;
        }
        setSaving(true);
        try {
            const body: Record<string, unknown> = {
                name: editForm.name || undefined,
                category: editForm.category || null,
                sub_category: editForm.subCategory || null,
                product_family: editForm.productFamily || null,
                product_type: editForm.productType,
                sector_compatibility: editForm.sectorCompatibility || null,
                industries: editForm.industries || null,
                use_cases: editForm.useCases || null,
                material_quality: editForm.materialQuality || null,
                origin_country: editForm.originCountry || null,
                production_site: editForm.productionSite || null,
                standards: editForm.standards || null,
                certifications: editForm.certifications || null,
                unit: editForm.unit || undefined,
                warehouse: editForm.warehouse || null,
                preferred_vendor: editForm.preferredVendor || null,
                lead_time_days: editForm.leadTimeDays ? Number(editForm.leadTimeDays) : null,
                weight_kg: editForm.weightKg ? Number(editForm.weightKg) : null,
                price: editForm.price ? Number(editForm.price) : null,
                currency: editForm.currency || undefined,
                cost_price: editForm.costPrice ? Number(editForm.costPrice) : null,
                product_notes: editForm.productNotes || null,
                min_stock_level: editForm.minStockLevel !== "" ? Number(editForm.minStockLevel) : 0,
                daily_usage: editForm.dailyUsage ? Number(editForm.dailyUsage) : null,
                reorder_qty: editForm.reorderQty ? Number(editForm.reorderQty) : null,
                product_type_id: editForm.productTypeId || null,
                attributes: editForm.attributes ?? {},
            };
            const res = await fetch(`/api/products/${product.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error("PATCH başarısız");
            await fetchProduct();
            setEditMode(false);
            setEditForm(null);
            toast({ type: "success", message: "Ürün bilgileri güncellendi." });
        } catch {
            toast({ type: "error", message: "Güncelleme başarısız." });
        } finally {
            setSaving(false);
        }
    };

    const handleDeactivate = async () => {
        if (!product) return;
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setDeactivating(true);
        try {
            const res = await fetch(`/api/products/${product.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: false }),
            });
            if (!res.ok) throw new Error("PATCH başarısız");
            toast({ type: "success", message: "Ürün devre dışı bırakıldı." });
            router.push("/dashboard/products");
        } catch {
            toast({ type: "error", message: "İşlem başarısız." });
        } finally {
            setDeactivating(false);
            setConfirmDeactivate(false);
        }
    };

    if (loading) {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                Ürün yükleniyor...
            </div>
        );
    }

    if (notFound || !product) {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                Ürün bulunamadı.{" "}
                <Link href="/dashboard/products" style={{ color: "var(--accent-text)" }}>
                    Geri dön
                </Link>
            </div>
        );
    }

    const form = editForm;

    const tabs: { key: TabKey; label: string; locked: boolean; lockedNote?: string }[] = [
        { key: "genel", label: "Genel", locked: false },
        { key: "teknik", label: "Teknik", locked: false },
        { key: "stok", label: "Stok", locked: false },
        { key: "tedarik", label: "Tedarik", locked: false },
        { key: "ticari", label: "Ticari", locked: false },
        { key: "ekler", label: "Ekler", locked: false },
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Back breadcrumb */}
            <div>
                <Link href="/dashboard/products" style={{ fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none" }}>
                    ← Ürünler
                </Link>
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                {/* Primary image (Faz 2d) */}
                {(() => {
                    const primary = findPrimaryImageWithUrl(attachments);
                    if (primary?.signedUrl) {
                        return (
                            <button
                                type="button"
                                onClick={() => setLightboxAttachment(primary)}
                                aria-label={`${primary.fileName} — büyük göster`}
                                style={{
                                    width: "80px",
                                    height: "80px",
                                    flexShrink: 0,
                                    padding: 0,
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "6px",
                                    overflow: "hidden",
                                    cursor: "pointer",
                                    background: "var(--bg-tertiary)",
                                }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={primary.signedUrl}
                                    alt={product.name}
                                    onError={() => refreshSignedUrl(primary.id)}
                                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />
                            </button>
                        );
                    }
                    return (
                        <div
                            aria-label="Ana görsel yok"
                            style={{
                                width: "80px",
                                height: "80px",
                                flexShrink: 0,
                                background: "var(--bg-tertiary)",
                                border: "0.5px dashed var(--border-secondary)",
                                borderRadius: "6px",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "var(--text-tertiary)",
                                fontSize: "9px",
                                fontWeight: 600,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                            }}
                        >
                            <span style={{ fontSize: "16px" }}>🖼️</span>
                            <span style={{ marginTop: "3px" }}>Görsel yok</span>
                        </div>
                    );
                })()}

                {/* Title + meta */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "var(--text-primary)" }}>
                            {product.name}
                        </h1>
                        <span
                            style={{
                                fontSize: "10px",
                                fontWeight: 600,
                                padding: "2px 7px",
                                borderRadius: "4px",
                                background: product.productType === "manufactured" ? "var(--accent-bg)" : "var(--success-bg)",
                                color: product.productType === "manufactured" ? "var(--accent-text)" : "var(--success-text)",
                                border: `0.5px solid ${product.productType === "manufactured" ? "var(--accent-border)" : "var(--success-border)"}`,
                            }}
                        >
                            {product.productType === "manufactured" ? "İmalat" : "Ticari"}
                        </span>
                        <span
                            style={{
                                fontSize: "10px",
                                fontWeight: 600,
                                padding: "2px 7px",
                                borderRadius: "4px",
                                background: product.isActive ? "var(--success-bg)" : "var(--bg-tertiary)",
                                color: product.isActive ? "var(--success-text)" : "var(--text-tertiary)",
                                border: `0.5px solid ${product.isActive ? "var(--success-border)" : "var(--border-secondary)"}`,
                            }}
                        >
                            {product.isActive ? "Aktif" : "Pasif"}
                        </span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-tertiary)" }}>
                        {product.sku}
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                    {!editMode ? (
                        <>
                            <Button
                                variant="secondary"
                                onClick={handleEditClick}
                                disabled={isDemo}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                            >
                                Düzenle
                            </Button>
                            {product.isActive && (
                                <Button
                                    variant="danger"
                                    onClick={() => setConfirmDeactivate(true)}
                                    disabled={isDemo}
                                    title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                >
                                    Devre Dışı Bırak
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            <Button variant="secondary" onClick={handleCancelEdit} disabled={saving}>
                                İptal
                            </Button>
                            <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving}>
                                Kaydet
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Active alerts banner — visible in any tab */}
            {alerts.length > 0 && (
                <div
                    role="region"
                    aria-label="Aktif Uyarılar"
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        padding: "10px 12px",
                        background: "var(--warning-bg)",
                        border: "0.5px solid var(--warning-border)",
                        borderRadius: "6px",
                    }}
                >
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--warning-text)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Aktif Uyarılar ({alerts.length})
                    </div>
                    {alerts.slice(0, 3).map(a => (
                        <div key={a.id} style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                            <strong>{a.title}</strong>{a.description ? ` — ${a.description}` : null}
                        </div>
                    ))}
                </div>
            )}

            {/* Tab nav */}
            <div role="tablist" aria-label="Ürün sekmeleri" style={{ display: "flex", gap: "0", borderBottom: "0.5px solid var(--border-tertiary)", overflowX: "auto" }}>
                {tabs.map(t => {
                    const isActive = activeTab === t.key;
                    return (
                        <button
                            key={t.key}
                            role="tab"
                            aria-selected={isActive}
                            aria-controls={`tab-panel-${t.key}`}
                            id={`tab-${t.key}`}
                            onClick={() => setActiveTab(t.key)}
                            title={t.locked ? t.lockedNote : undefined}
                            style={{
                                padding: "10px 14px",
                                background: "transparent",
                                border: "none",
                                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                                color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                                fontSize: "13px",
                                fontWeight: isActive ? 600 : 500,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                            }}
                        >
                            {t.label}
                            {t.locked && <span style={{ fontSize: "10px", opacity: 0.6 }}>🔒</span>}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            <div
                role="tabpanel"
                id={`tab-panel-${activeTab}`}
                aria-labelledby={`tab-${activeTab}`}
                style={{ minHeight: "200px" }}
            >
                {activeTab === "genel" && (
                    <div style={cardStyle}>
                        <div style={sectionTitleStyle}>Genel Bilgiler</div>
                        <FieldView label="SKU" value={product.sku} />
                        {editMode && form ? (
                            <>
                                <FieldEdit label="Ürün Adı">
                                    <input value={form.name} onChange={e => setEditForm(f => f && ({ ...f, name: e.target.value }))} style={inputStyle} aria-label="Ürün adı" />
                                </FieldEdit>
                                <FieldEdit label="Ürün Tipi">
                                    <select value={form.productType} onChange={e => setEditForm(f => f && ({ ...f, productType: e.target.value as "manufactured" | "commercial" }))} style={inputStyle} aria-label="Ürün tipi">
                                        <option value="manufactured">İmalat</option>
                                        <option value="commercial">Ticari</option>
                                    </select>
                                </FieldEdit>
                                <FieldEdit label="Tip Şablonu">
                                    <select
                                        value={form.productTypeId}
                                        onChange={e => handleTypeChange(e.target.value)}
                                        style={inputStyle}
                                        aria-label="Tip şablonu"
                                    >
                                        <option value="">— Tip seçili değil —</option>
                                        {productTypes.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </FieldEdit>
                                <FieldEdit label="Kategori">
                                    <input value={form.category} onChange={e => setEditForm(f => f && ({ ...f, category: e.target.value }))} style={inputStyle} aria-label="Kategori" />
                                </FieldEdit>
                                <FieldEdit label="Alt Kategori">
                                    <input value={form.subCategory} onChange={e => setEditForm(f => f && ({ ...f, subCategory: e.target.value }))} style={inputStyle} aria-label="Alt kategori" />
                                </FieldEdit>
                                <FieldEdit label="Ürün Ailesi">
                                    <input value={form.productFamily} onChange={e => setEditForm(f => f && ({ ...f, productFamily: e.target.value }))} style={inputStyle} aria-label="Ürün ailesi" />
                                </FieldEdit>
                                <FieldEdit label="Sektör Uygunluğu">
                                    <input value={form.sectorCompatibility} onChange={e => setEditForm(f => f && ({ ...f, sectorCompatibility: e.target.value }))} style={inputStyle} aria-label="Sektör uygunluğu" />
                                </FieldEdit>
                                <FieldEdit label="Sektörler">
                                    <input value={form.industries} onChange={e => setEditForm(f => f && ({ ...f, industries: e.target.value }))} style={inputStyle} aria-label="Sektörler" />
                                </FieldEdit>
                                <FieldEdit label="Kullanım">
                                    <input value={form.useCases} onChange={e => setEditForm(f => f && ({ ...f, useCases: e.target.value }))} style={inputStyle} aria-label="Kullanım alanları" />
                                </FieldEdit>
                                <FieldEdit label="Malzeme">
                                    <input value={form.materialQuality} onChange={e => setEditForm(f => f && ({ ...f, materialQuality: e.target.value }))} style={inputStyle} aria-label="Malzeme" />
                                </FieldEdit>
                                <FieldEdit label="Menşei">
                                    <input value={form.originCountry} onChange={e => setEditForm(f => f && ({ ...f, originCountry: e.target.value }))} style={inputStyle} aria-label="Menşei" />
                                </FieldEdit>
                                <FieldEdit label="Üretim Tesisi">
                                    <input value={form.productionSite} onChange={e => setEditForm(f => f && ({ ...f, productionSite: e.target.value }))} style={inputStyle} aria-label="Üretim tesisi" />
                                </FieldEdit>
                                <FieldEdit label="Standartlar">
                                    <input value={form.standards} onChange={e => setEditForm(f => f && ({ ...f, standards: e.target.value }))} style={inputStyle} aria-label="Standartlar" />
                                </FieldEdit>
                                <FieldEdit label="Sertifikalar">
                                    <input value={form.certifications} onChange={e => setEditForm(f => f && ({ ...f, certifications: e.target.value }))} style={inputStyle} aria-label="Sertifikalar" />
                                </FieldEdit>
                                <FieldEdit label="Birim">
                                    <input value={form.unit} onChange={e => setEditForm(f => f && ({ ...f, unit: e.target.value }))} style={inputStyle} aria-label="Birim" />
                                </FieldEdit>
                                <FieldEdit label="Ağırlık (kg)">
                                    <input type="number" value={form.weightKg} onChange={e => setEditForm(f => f && ({ ...f, weightKg: e.target.value }))} style={inputStyle} aria-label="Ağırlık kg" />
                                </FieldEdit>
                            </>
                        ) : (
                            <>
                                <FieldView label="Ürün Adı" value={product.name} />
                                <FieldView label="Ürün Tipi" value={product.productType === "manufactured" ? "İmalat" : "Ticari"} />
                                <FieldView label="Tip Şablonu" value={productTypes.find(t => t.id === product.productTypeId)?.name ?? null} />
                                <FieldView label="Kategori" value={product.category} />
                                <FieldView label="Alt Kategori" value={product.subCategory} />
                                <FieldView label="Ürün Ailesi" value={product.productFamily} />
                                <FieldView label="Sektör Uygunluğu" value={product.sectorCompatibility} />
                                <FieldView label="Sektörler" value={product.industries} />
                                <FieldView label="Kullanım" value={product.useCases} />
                                <FieldView label="Malzeme" value={product.materialQuality} />
                                <FieldView label="Menşei" value={product.originCountry} />
                                <FieldView label="Üretim Tesisi" value={product.productionSite} />
                                <FieldView label="Standartlar" value={product.standards} />
                                <FieldView label="Sertifikalar" value={product.certifications} />
                                <FieldView label="Birim" value={product.unit} />
                                <FieldView label="Ağırlık (kg)" value={product.weightKg ?? null} />
                            </>
                        )}
                    </div>
                )}

                {activeTab === "teknik" && (
                    <div style={cardStyle}>
                        <div style={sectionTitleStyle}>Teknik Özellikler</div>
                        {!activeTypeId ? (
                            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                                Bu ürün için tip şablonu seçilmemiş. Genel sekmesinden bir tip seç ki tipin teknik alanları burada görünsün.
                            </div>
                        ) : typeFieldsLoading ? (
                            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                                Alanlar yükleniyor…
                            </div>
                        ) : activeTypeFields.length === 0 ? (
                            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                                Bu tip için tanımlı alan yok.{" "}
                                <Link href={`/dashboard/settings/product-types/${activeTypeId}`} style={{ color: "var(--accent-text)" }}>
                                    Tip ayarlarından alan ekle →
                                </Link>
                            </div>
                        ) : editMode && form ? (
                            <>
                                {activeTypeFields.map(f => (
                                    <DynamicFieldEdit
                                        key={f.id}
                                        field={f}
                                        value={(form.attributes ?? {})[f.field_key]}
                                        onChange={v => setAttribute(f.field_key, v)}
                                    />
                                ))}
                            </>
                        ) : (
                            <>
                                {activeTypeFields.map(f => (
                                    <FieldView
                                        key={f.id}
                                        label={f.label_tr}
                                        value={formatAttributeValue(f, (product.attributes ?? {})[f.field_key])}
                                    />
                                ))}
                            </>
                        )}
                    </div>
                )}

                {activeTab === "stok" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {/* Operational cards */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
                            <div style={cardStyle}>
                                <div style={labelStyle}>Stokta</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                                    {formatNumber(product.on_hand)}
                                </div>
                            </div>
                            <div style={cardStyle}>
                                <div style={labelStyle}>Satılabilir</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: product.promisable <= product.minStockLevel ? "var(--danger-text)" : "var(--success-text)", marginTop: "4px" }}>
                                    {formatNumber(product.promisable)}
                                </div>
                            </div>
                            <div style={cardStyle}>
                                <div style={labelStyle}>Rezerve</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                                    {formatNumber(product.reserved)}
                                </div>
                            </div>
                            <div style={cardStyle}>
                                <div style={labelStyle}>Min Stok</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                                    {formatNumber(product.minStockLevel)}
                                </div>
                            </div>
                            <div style={cardStyle}>
                                <div style={labelStyle}>Teklifte</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                                    {formatNumber(product.quoted)}
                                </div>
                            </div>
                            <div style={cardStyle}>
                                <div style={labelStyle}>Bekleniyor</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--success-text)", marginTop: "4px" }}>
                                    {formatNumber(product.incoming)}
                                </div>
                            </div>
                        </div>

                        {/* Stock edit fields */}
                        <div style={cardStyle}>
                            <div style={sectionTitleStyle}>Stok Yönetimi</div>
                            {editMode && form ? (
                                <>
                                    <FieldEdit label="Min Stok Seviyesi">
                                        <input type="number" value={form.minStockLevel} onChange={e => setEditForm(f => f && ({ ...f, minStockLevel: e.target.value }))} style={inputStyle} aria-label="Min stok seviyesi" />
                                    </FieldEdit>
                                    <FieldEdit label="Günlük Tüketim">
                                        <input type="number" value={form.dailyUsage} onChange={e => setEditForm(f => f && ({ ...f, dailyUsage: e.target.value }))} style={inputStyle} aria-label="Günlük tüketim" />
                                    </FieldEdit>
                                    <FieldEdit label="Yeniden Sip. Adedi">
                                        <input type="number" value={form.reorderQty} onChange={e => setEditForm(f => f && ({ ...f, reorderQty: e.target.value }))} style={inputStyle} aria-label="Yeniden sipariş adedi" />
                                    </FieldEdit>
                                    <FieldEdit label="Depo">
                                        <input value={form.warehouse} onChange={e => setEditForm(f => f && ({ ...f, warehouse: e.target.value }))} style={inputStyle} aria-label="Depo" />
                                    </FieldEdit>
                                </>
                            ) : (
                                <>
                                    <FieldView label="Min Stok Seviyesi" value={product.minStockLevel} />
                                    <FieldView label="Günlük Tüketim" value={product.dailyUsage ?? null} />
                                    <FieldView label="Yeniden Sip. Adedi" value={product.reorderQty ?? null} />
                                    <FieldView label="Depo" value={product.warehouse} />
                                </>
                            )}
                        </div>

                        {/* Pending commitments */}
                        <div style={cardStyle}>
                            <div style={sectionTitleStyle}>Bekleyen Teslimatlar ({commitments.length})</div>
                            {commitments.length === 0 ? (
                                <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Bekleyen teslimat yok.</div>
                            ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Miktar</th>
                                            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Beklenen</th>
                                            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Tedarikçi</th>
                                            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Durum</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {commitments.map(c => (
                                            <tr key={c.id}>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)" }}>{formatNumber(c.quantity)}</td>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)" }}>{c.expected_date}</td>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)" }}>{c.supplier_name ?? "—"}</td>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)", color: "var(--text-secondary)" }}>{c.status}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "tedarik" && (
                    <div style={cardStyle}>
                        <div style={sectionTitleStyle}>Tedarik Bilgileri</div>
                        {editMode && form ? (
                            <>
                                <FieldEdit label="Tercihli Tedarikçi">
                                    <input value={form.preferredVendor} onChange={e => setEditForm(f => f && ({ ...f, preferredVendor: e.target.value }))} style={inputStyle} aria-label="Tercihli tedarikçi" />
                                </FieldEdit>
                                <FieldEdit label="Tedarik Süresi (gün)">
                                    <input type="number" value={form.leadTimeDays} onChange={e => setEditForm(f => f && ({ ...f, leadTimeDays: e.target.value }))} style={inputStyle} aria-label="Tedarik süresi" />
                                </FieldEdit>
                                <FieldEdit label="Maliyet Fiyatı">
                                    <input type="number" value={form.costPrice} onChange={e => setEditForm(f => f && ({ ...f, costPrice: e.target.value }))} style={inputStyle} aria-label="Maliyet fiyatı" />
                                </FieldEdit>
                                <FieldEdit label="Para Birimi">
                                    <select value={form.currency} onChange={e => setEditForm(f => f && ({ ...f, currency: e.target.value }))} style={inputStyle} aria-label="Para birimi">
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                        <option value="TRY">TRY</option>
                                    </select>
                                </FieldEdit>
                            </>
                        ) : (
                            <>
                                <FieldView label="Tercihli Tedarikçi" value={product.preferredVendor} />
                                <FieldView label="Tedarik Süresi (gün)" value={product.leadTimeDays ?? null} />
                                <FieldView label="Maliyet Fiyatı" value={canViewPurchaseCosts && product.costPrice != null ? formatCurrency(product.costPrice, product.currency) : null} />
                                <FieldView label="Para Birimi" value={product.currency} />
                            </>
                        )}
                    </div>
                )}

                {activeTab === "ticari" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div style={cardStyle}>
                            <div style={sectionTitleStyle}>Ticari Bilgiler</div>
                            {editMode && form ? (
                                <>
                                    <FieldEdit label="Satış Fiyatı">
                                        <input type="number" value={form.price} onChange={e => setEditForm(f => f && ({ ...f, price: e.target.value }))} style={inputStyle} aria-label="Satış fiyatı" />
                                    </FieldEdit>
                                    <FieldEdit label="Para Birimi">
                                        <select value={form.currency} onChange={e => setEditForm(f => f && ({ ...f, currency: e.target.value }))} style={inputStyle} aria-label="Para birimi (ticari)">
                                            <option value="USD">USD</option>
                                            <option value="EUR">EUR</option>
                                            <option value="TRY">TRY</option>
                                        </select>
                                    </FieldEdit>
                                    <FieldEdit label="Ürün Notları">
                                        <textarea value={form.productNotes} onChange={e => setEditForm(f => f && ({ ...f, productNotes: e.target.value }))} style={{ ...inputStyle, minHeight: "80px", fontFamily: "inherit" }} aria-label="Ürün notları" />
                                    </FieldEdit>
                                </>
                            ) : (
                                <>
                                    <FieldView label="Satış Fiyatı" value={canViewSalesPrices && product.price != null ? formatCurrency(product.price, product.currency) : null} />
                                    <FieldView label="Para Birimi" value={product.currency} />
                                    <FieldView label="Ürün Notları" value={product.productNotes} />
                                </>
                            )}
                        </div>

                        {/* Active quotes */}
                        <div style={cardStyle}>
                            <div style={sectionTitleStyle}>Aktif Teklifler ({quotes.length})</div>
                            {quotes.length === 0 ? (
                                <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Bu ürün için aktif teklif yok.</div>
                            ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Sipariş</th>
                                            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Müşteri</th>
                                            <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Miktar</th>
                                            <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Tutar</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {quotes.map(q => (
                                            <tr key={q.orderId}>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                                    <Link href={`/dashboard/orders/${q.orderId}`} style={{ color: "var(--accent-text)" }}>
                                                        {q.orderNumber}
                                                    </Link>
                                                </td>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)" }}>{q.customerName}</td>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)", textAlign: "right" }}>{formatNumber(q.quantity)}</td>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)", textAlign: "right" }}>
                                                    {maskCurrency(q.quantity * (q.unitPrice ?? 0), q.currency, canViewSalesPrices)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "ekler" && (
                    <div style={cardStyle}>
                        <div style={sectionTitleStyle}>Ekler</div>

                        {/* Faz 2d Review P3-002: load error banner */}
                        {attachmentsError && (
                            <div
                                role="alert"
                                style={{
                                    marginBottom: "12px",
                                    padding: "8px 12px",
                                    background: "var(--danger-bg)",
                                    border: "0.5px solid var(--danger-border)",
                                    borderRadius: "5px",
                                    color: "var(--danger-text)",
                                    fontSize: "12px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: "8px",
                                }}
                            >
                                <span>⚠ {attachmentsError}</span>
                                <button
                                    type="button"
                                    onClick={() => fetchAttachments()}
                                    style={{
                                        fontSize: "12px",
                                        padding: "4px 10px",
                                        background: "transparent",
                                        color: "var(--danger-text)",
                                        border: "0.5px solid var(--danger-border)",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                    }}
                                >
                                    Yeniden dene
                                </button>
                            </div>
                        )}

                        {/* Upload bar */}
                        <div
                            style={{
                                display: "flex",
                                gap: "8px",
                                alignItems: "center",
                                marginBottom: "16px",
                                padding: "12px",
                                background: "var(--bg-tertiary)",
                                borderRadius: "6px",
                                flexWrap: "wrap",
                            }}
                        >
                            <select
                                value={uploadKind}
                                onChange={e => setUploadKind(e.target.value as ProductAttachmentKind)}
                                aria-label="Dosya kategorisi"
                                disabled={isDemo || uploading}
                                style={{ ...inputStyle, width: "auto", minWidth: "160px" }}
                            >
                                {(["image", "datasheet", "certificate", "manual", "drawing", "other"] as const).map(k => (
                                    <option key={k} value={k}>{getKindIcon(k)} {getKindLabel(k)}</option>
                                ))}
                            </select>
                            <input
                                ref={uploadInputRef}
                                type="file"
                                accept={ATTACHMENT_ACCEPT}
                                onChange={e => {
                                    const f = e.target.files?.[0] ?? null;
                                    setUploadFile(f);
                                    if (f) setUploadKind(pickInitialKind(f.type));
                                }}
                                aria-label="Dosya seç"
                                disabled={isDemo || uploading}
                                style={{ fontSize: "12px", color: "var(--text-secondary)", flex: 1, minWidth: "200px" }}
                            />
                            <Button
                                variant="primary"
                                onClick={handleUpload}
                                loading={uploading}
                                disabled={!uploadFile || uploading || isDemo}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                            >
                                {uploading ? "Yükleniyor…" : "Yükle"}
                            </Button>
                        </div>

                        {/* Attachments groups */}
                        {(() => {
                            const { images, documents } = groupAttachments(attachments);
                            if (attachments.length === 0 && !attachmentsLoading && !attachmentsError) {
                                return (
                                    <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                                        Henüz ek dosya yok. Yukarıdan görsel veya belge yükleyin.
                                    </div>
                                );
                            }
                            return (
                                <>
                                    {images.length > 0 && (
                                        <div style={{ marginBottom: "20px" }}>
                                            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>
                                                Görseller ({images.length})
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px" }}>
                                                {images.map(img => (
                                                    <div
                                                        key={img.id}
                                                        style={{
                                                            position: "relative",
                                                            border: "0.5px solid var(--border-tertiary)",
                                                            borderRadius: "6px",
                                                            overflow: "hidden",
                                                            background: "var(--bg-tertiary)",
                                                        }}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => img.signedUrl && setLightboxAttachment(img)}
                                                            aria-label={`${img.fileName} — büyük göster`}
                                                            style={{
                                                                width: "100%", height: "140px", padding: 0, border: "none",
                                                                background: "transparent", cursor: img.signedUrl ? "pointer" : "default",
                                                                display: "block",
                                                            }}
                                                        >
                                                            {img.signedUrl ? (
                                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                                <img
                                                                    src={img.signedUrl}
                                                                    alt={img.fileName}
                                                                    onError={() => refreshSignedUrl(img.id)}
                                                                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                                                />
                                                            ) : (
                                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-tertiary)", fontSize: "11px" }}>
                                                                    Görsel yüklenemedi
                                                                </div>
                                                            )}
                                                        </button>
                                                        <div style={{
                                                            position: "absolute", top: "4px", left: "4px", right: "4px",
                                                            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                                                        }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSetPrimary(img.id)}
                                                                aria-label={img.isPrimaryImage ? "Ana görsel" : "Ana görsel yap"}
                                                                title={img.isPrimaryImage ? "Ana görsel" : "Ana görsel yap"}
                                                                disabled={isDemo || img.isPrimaryImage}
                                                                style={{
                                                                    background: "rgba(0,0,0,0.6)", border: "none",
                                                                    color: img.isPrimaryImage ? "#FFD700" : "#FFF",
                                                                    padding: "3px 6px", borderRadius: "4px", cursor: img.isPrimaryImage || isDemo ? "default" : "pointer",
                                                                    fontSize: "13px",
                                                                }}
                                                            >
                                                                {img.isPrimaryImage ? "★" : "☆"}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteAttachment(img.id, img.fileName)}
                                                                aria-label={`${img.fileName} dosyasını sil`}
                                                                title={isDemo ? DEMO_DISABLED_TOOLTIP : "Sil"}
                                                                disabled={isDemo}
                                                                style={{
                                                                    background: "rgba(0,0,0,0.6)", border: "none",
                                                                    color: "#FFF", padding: "3px 6px", borderRadius: "4px",
                                                                    cursor: isDemo ? "not-allowed" : "pointer", fontSize: "13px", lineHeight: 1,
                                                                }}
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                        <div style={{ padding: "6px 8px", fontSize: "11px", color: "var(--text-secondary)", borderTop: "0.5px solid var(--border-tertiary)" }}>
                                                            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={img.fileName}>
                                                                {img.fileName}
                                                            </div>
                                                            <div style={{ color: "var(--text-tertiary)", marginTop: "2px" }}>
                                                                {formatFileSize(img.fileSize)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {documents.length > 0 && (
                                        <div>
                                            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>
                                                Belgeler ({documents.length})
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                                {documents.map(doc => (
                                                    <div
                                                        key={doc.id}
                                                        style={{
                                                            display: "flex", alignItems: "center", gap: "10px",
                                                            padding: "8px 10px",
                                                            background: "var(--bg-tertiary)",
                                                            border: "0.5px solid var(--border-tertiary)",
                                                            borderRadius: "5px",
                                                        }}
                                                    >
                                                        <span aria-hidden style={{ fontSize: "16px" }}>{getKindIcon(doc.kind)}</span>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: "13px", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={doc.fileName}>
                                                                {doc.fileName}
                                                            </div>
                                                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                                                {getKindLabel(doc.kind)} · {formatFileSize(doc.fileSize)}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDownloadDocument(doc.id)}
                                                            aria-label={`${doc.fileName} indir`}
                                                            style={{
                                                                fontSize: "12px", color: "var(--accent-text)",
                                                                background: "transparent",
                                                                padding: "4px 8px",
                                                                border: "0.5px solid var(--accent-border)", borderRadius: "4px",
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            İndir
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteAttachment(doc.id, doc.fileName)}
                                                            aria-label={`${doc.fileName} dosyasını sil`}
                                                            title={isDemo ? DEMO_DISABLED_TOOLTIP : "Sil"}
                                                            disabled={isDemo}
                                                            style={{
                                                                fontSize: "13px", padding: "4px 8px",
                                                                background: "transparent",
                                                                color: "var(--danger-text)",
                                                                border: "0.5px solid var(--danger-border)",
                                                                borderRadius: "4px",
                                                                cursor: isDemo ? "not-allowed" : "pointer",
                                                            }}
                                                        >
                                                            Sil
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Faz 3c Review 2.tur — Önceki Sertifika Versiyonları (supersede edilenler) */}
                                    {supersededAttachments.length > 0 && (
                                        <div style={{ marginTop: "12px" }}>
                                            <button
                                                type="button"
                                                onClick={() => setShowSuperseded(s => !s)}
                                                aria-expanded={showSuperseded}
                                                aria-label="Önceki Sertifika Versiyonları"
                                                style={{
                                                    fontSize: "12px",
                                                    color: "var(--text-secondary)",
                                                    background: "transparent",
                                                    border: "none",
                                                    cursor: "pointer",
                                                    padding: "4px 0",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "6px",
                                                }}
                                            >
                                                <span aria-hidden>{showSuperseded ? "▾" : "▸"}</span>
                                                <span>Önceki Sertifika Versiyonları ({supersededAttachments.length})</span>
                                            </button>
                                            {showSuperseded && (
                                                <div style={{
                                                    marginTop: "8px",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: "4px",
                                                    opacity: 0.7,
                                                }}>
                                                    {supersededAttachments.map(doc => (
                                                        <div
                                                            key={doc.id}
                                                            style={{
                                                                display: "flex", alignItems: "center", gap: "10px",
                                                                padding: "6px 10px",
                                                                background: "var(--bg-tertiary)",
                                                                border: "0.5px solid var(--border-tertiary)",
                                                                borderRadius: "5px",
                                                            }}
                                                        >
                                                            <span aria-hidden style={{ fontSize: "14px" }}>{getKindIcon(doc.kind)}</span>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={doc.fileName}>
                                                                    {doc.fileName}
                                                                </div>
                                                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                                                    Önceki versiyon · {formatFileSize(doc.fileSize)}
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDownloadDocument(doc.id)}
                                                                aria-label={`${doc.fileName} indir (önceki versiyon)`}
                                                                style={{
                                                                    fontSize: "11px", color: "var(--accent-text)",
                                                                    background: "transparent",
                                                                    padding: "3px 8px",
                                                                    border: "0.5px solid var(--accent-border)", borderRadius: "4px",
                                                                    cursor: "pointer",
                                                                }}
                                                            >
                                                                İndir
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                )}

            </div>

            {/* Type change confirm modal */}
            {pendingTypeChange && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Tip değişimi onayı"
                    style={{
                        position: "fixed", inset: 0, zIndex: 300,
                        background: "rgba(0,0,0,0.45)",
                        display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
                    }}
                    onClick={cancelTypeChange}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: "var(--bg-primary)",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "8px",
                            padding: "20px",
                            maxWidth: "440px",
                            width: "100%",
                        }}
                    >
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                            Tip değiştiriliyor — bazı alanlar kaybolacak
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px" }}>
                            Yeni tipte bulunmayan {pendingTypeChange.lostKeys.length} alan değeri silinecek:
                        </div>
                        <div style={{
                            fontSize: "12px",
                            background: "var(--warning-bg)",
                            border: "0.5px solid var(--warning-border)",
                            borderRadius: "6px",
                            padding: "8px 10px",
                            marginBottom: "16px",
                            color: "var(--warning-text)",
                            fontFamily: "var(--font-mono)",
                            maxHeight: "120px",
                            overflowY: "auto",
                        }}>
                            {pendingTypeChange.lostKeys.join(", ")}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                            <Button variant="secondary" onClick={cancelTypeChange}>Vazgeç</Button>
                            <Button variant="danger" onClick={confirmTypeChange}>Tipi Değiştir</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Faz 2d — Lightbox modal (image preview) */}
            {lightboxAttachment?.signedUrl && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`${lightboxAttachment.fileName} büyük görünüm`}
                    onClick={() => setLightboxAttachment(null)}
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 400,
                        background: "rgba(0,0,0,0.85)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "24px",
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={lightboxAttachment.signedUrl}
                        alt={lightboxAttachment.fileName}
                        onClick={e => e.stopPropagation()}
                        onError={() => refreshSignedUrl(lightboxAttachment.id)}
                        style={{
                            maxWidth: "92vw",
                            maxHeight: "92vh",
                            objectFit: "contain",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                            borderRadius: "4px",
                        }}
                    />
                    <button
                        ref={lightboxCloseBtnRef}
                        type="button"
                        onClick={() => setLightboxAttachment(null)}
                        aria-label="Kapat"
                        style={{
                            position: "absolute",
                            top: "16px",
                            right: "16px",
                            padding: "6px 12px",
                            background: "rgba(255,255,255,0.92)",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "#000",
                        }}
                    >
                        ✕ Kapat
                    </button>
                </div>
            )}

            {/* Deactivate confirm modal */}
            {confirmDeactivate && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Ürünü devre dışı bırak"
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 300,
                        background: "rgba(0,0,0,0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "20px",
                    }}
                    onClick={() => !deactivating && setConfirmDeactivate(false)}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: "var(--bg-primary)",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "8px",
                            padding: "20px",
                            maxWidth: "400px",
                            width: "100%",
                        }}
                    >
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                            Ürünü devre dışı bırak?
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
                            <strong>{product.name}</strong> ürünü pasif duruma alınacak. Aktif uyarıları ve satın alma önerileri kapatılacak.
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                            <Button variant="secondary" onClick={() => setConfirmDeactivate(false)} disabled={deactivating}>
                                Vazgeç
                            </Button>
                            <Button variant="danger" onClick={handleDeactivate} loading={deactivating} disabled={deactivating}>
                                Devre Dışı Bırak
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

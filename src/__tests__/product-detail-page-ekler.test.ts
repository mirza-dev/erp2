/**
 * Faz 2d — Ürün detay sayfası "Ekler" sekmesi UI source-regex regression locks.
 *
 * Coverage:
 *   - attachments / lightboxAttachment state mevcut
 *   - fetchAttachments useCallback + useEffect
 *   - Header: primary image conditional render (img src={signedUrl})
 *   - Upload form: kind select + file input + Yükle button
 *   - Images grid + Belgeler list
 *   - Lightbox modal: role="dialog" aria-modal aria-label
 *   - Demo guard: 3 handler (handleUpload / handleSetPrimary / handleDeleteAttachment)
 *   - "Faz 2d" yazısı header'dan kaldırıldı
 *   - Pure helper export'ları mevcut
 *   - ATTACHMENT_ACCEPT MIME whitelist sabit
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/app/dashboard/products/[id]/page.tsx"),
    "utf8",
);

describe("Faz 2d — Ekler tab source regression locks", () => {
    it("imports ProductAttachment + ProductAttachmentKind from mock-data", () => {
        expect(SOURCE).toMatch(/ProductAttachment\b.*ProductAttachmentKind|ProductAttachmentKind.*ProductAttachment/s);
        expect(SOURCE).toMatch(/from "@\/lib\/mock-data"/);
    });

    it("does NOT import server-only ALLOWED_MIME (uses client-safe ATTACHMENT_ACCEPT constant)", () => {
        expect(SOURCE).not.toMatch(/import.*ALLOWED_MIME.*from "@\/lib\/supabase\/product-attachments"/);
        expect(SOURCE).toMatch(/ATTACHMENT_ACCEPT\s*=/);
        expect(SOURCE).toMatch(/image\/png,image\/jpeg,image\/webp,application\/pdf/);
    });

    it("declares attachments + lightboxAttachment + upload state", () => {
        expect(SOURCE).toMatch(/const \[attachments, setAttachments\] = useState<ProductAttachment\[\]>/);
        expect(SOURCE).toMatch(/const \[lightboxAttachment, setLightboxAttachment\] = useState<ProductAttachment \| null>/);
        expect(SOURCE).toMatch(/const \[uploadKind, setUploadKind\] = useState<ProductAttachmentKind>/);
        expect(SOURCE).toMatch(/const \[uploadFile, setUploadFile\] = useState<File \| null>/);
    });

    it("defines fetchAttachments useCallback and a useEffect that triggers it on product change", () => {
        expect(SOURCE).toMatch(/const fetchAttachments = useCallback\(/);
        expect(SOURCE).toMatch(/fetchAttachments\(\)/);
        expect(SOURCE).toMatch(/\[product, fetchAttachments\]/);
    });

    it("removes the old 'Faz 2d' placeholder text from the header image slot", () => {
        // "Faz 2d" header placeholder kaldırıldı — sadece header'da yokluğunu kontrol etmek için
        // genel olarak SOURCE'ta 'Faz 2d' geçmesi tab labellarda (Partiler placeholder) hâlâ olabilir.
        // Burada specific 80×80 placeholder span tabloyu kontrol ediyoruz:
        expect(SOURCE).not.toMatch(/aria-label="Ana görsel \(Faz 2d'de eklenecek\)"/);
        expect(SOURCE).toMatch(/aria-label="Ana görsel yok"/);
    });

    it("header renders primary image via signedUrl when present (uses helper)", () => {
        expect(SOURCE).toMatch(/findPrimaryImageWithUrl\(attachments\)/);
        expect(SOURCE).toMatch(/setLightboxAttachment\(primary\)/);
    });

    it("renders upload form: kind select + file input with accept + Yükle button", () => {
        expect(SOURCE).toMatch(/aria-label="Dosya kategorisi"/);
        expect(SOURCE).toMatch(/aria-label="Dosya seç"/);
        expect(SOURCE).toMatch(/accept=\{ATTACHMENT_ACCEPT\}/);
        expect(SOURCE).toMatch(/setUploadKind\(pickInitialKind\(f\.type\)\)/);
        expect(SOURCE).toMatch(/Yükleniyor…|Yükle/);
    });

    it("renders images grid via groupAttachments + documents list", () => {
        expect(SOURCE).toMatch(/groupAttachments\(attachments\)/);
        expect(SOURCE).toMatch(/Görseller \(/);
        expect(SOURCE).toMatch(/Belgeler \(/);
    });

    it("documents list opens via handleDownloadDocument with noopener,noreferrer features", () => {
        // P3-006 refactor: <a href={doc.signedUrl}> kaldırıldı → click time fresh URL.
        // openSignedUrlInNewTab helper'ı "noopener,noreferrer" feature string'ini geçer.
        expect(SOURCE).toMatch(/onClick=\{\(\) => handleDownloadDocument\(doc\.id\)\}/);
        expect(SOURCE).toMatch(/"noopener,noreferrer"/);
    });

    it("renders lightbox modal with role=dialog + aria-modal + aria-label", () => {
        expect(SOURCE).toMatch(/lightboxAttachment\?\.signedUrl &&/);
        expect(SOURCE).toMatch(/role="dialog"\s+aria-modal/s);
        expect(SOURCE).toMatch(/aria-label=\{`\$\{lightboxAttachment\.fileName\} büyük görünüm`\}/);
    });

    it("lightbox useEffect adds Escape keyboard listener and body overflow lock", () => {
        expect(SOURCE).toMatch(/window\.addEventListener\("keydown"/);
        expect(SOURCE).toMatch(/document\.body\.style\.overflow = "hidden"/);
        expect(SOURCE).toMatch(/e\.key === "Escape"/);
    });

    it("all 3 mutation handlers check isDemo and use DEMO_BLOCK_TOAST", () => {
        // handleUpload
        expect(SOURCE).toMatch(/const handleUpload = async \(\) => \{[\s\S]*?if \(isDemo\)/);
        // handleSetPrimary
        expect(SOURCE).toMatch(/const handleSetPrimary = async \(attId/);
        expect(SOURCE).toMatch(/handleSetPrimary[\s\S]{0,400}?if \(isDemo\)/);
        // handleDeleteAttachment
        expect(SOURCE).toMatch(/const handleDeleteAttachment = async \(attId/);
        expect(SOURCE).toMatch(/handleDeleteAttachment[\s\S]{0,400}?if \(isDemo\)/);
    });

    it("exports pure helpers used by tests", () => {
        expect(SOURCE).toMatch(/export function formatFileSize/);
        expect(SOURCE).toMatch(/export function getKindLabel/);
        expect(SOURCE).toMatch(/export function getKindIcon/);
        expect(SOURCE).toMatch(/export function pickInitialKind/);
        expect(SOURCE).toMatch(/export function groupAttachments/);
    });

    it("upload POST sends multipart FormData (via buildUploadFormData helper) to attachments endpoint", () => {
        expect(SOURCE).toMatch(/method: "POST"/);
        expect(SOURCE).toMatch(/buildUploadFormData\(uploadFile,\s*uploadKind\)/);
        // FormData construction lives in the pure helper now; behavior covered in
        // product-attachment-helpers.test.ts (buildUploadFormData describe block).
    });
});

// ── P3-001: signed URL onError refresh ───────────────────────────────────────

describe("Faz 2d Review P3-001 — signed URL refresh on img onError", () => {
    it("defines refreshSignedUrl callback that hits /url endpoint", () => {
        expect(SOURCE).toMatch(/const refreshSignedUrl = useCallback/);
        expect(SOURCE).toMatch(/\/api\/products\/\$\{productId\}\/attachments\/\$\{attId\}\/url/);
    });

    it("refreshSignedUrl updates attachments state AND active lightbox", () => {
        expect(SOURCE).toMatch(/setAttachments\(prev => prev\.map/);
        expect(SOURCE).toMatch(/setLightboxAttachment\(prev =>/);
    });

    it("header img has onError handler wired to refreshSignedUrl", () => {
        expect(SOURCE).toMatch(/onError=\{\(\) => refreshSignedUrl\(primary\.id\)\}/);
    });

    it("grid img has onError handler wired to refreshSignedUrl", () => {
        expect(SOURCE).toMatch(/onError=\{\(\) => refreshSignedUrl\(img\.id\)\}/);
    });

    it("lightbox img has onError handler wired to refreshSignedUrl", () => {
        expect(SOURCE).toMatch(/onError=\{\(\) => refreshSignedUrl\(lightboxAttachment\.id\)\}/);
    });
});

// ── P3-002: fetch error banner ───────────────────────────────────────────────

describe("Faz 2d Review P3-002 — attachments load error banner", () => {
    it("declares attachmentsError state", () => {
        expect(SOURCE).toMatch(/const \[attachmentsError, setAttachmentsError\] = useState<string \| null>/);
    });

    it("fetchAttachments sets error on !res.ok and on catch", () => {
        expect(SOURCE).toMatch(/setAttachmentsError\("Ekler yüklenemedi/);
        expect(SOURCE).toMatch(/setAttachmentsError\(null\)/);
    });

    it("renders error banner with role=alert + 'Yeniden dene' button", () => {
        expect(SOURCE).toMatch(/attachmentsError &&/);
        expect(SOURCE).toMatch(/role="alert"/);
        expect(SOURCE).toMatch(/Yeniden dene/);
    });

    it("empty state is hidden when an error is active (no false 'no files' message)", () => {
        expect(SOURCE).toMatch(/attachments\.length === 0 && !attachmentsLoading && !attachmentsError/);
    });

    it("uses parseAttachmentsResponse helper (defensive shape handling)", () => {
        expect(SOURCE).toMatch(/parseAttachmentsResponse\(data\)/);
    });
});

// ── P3-004: pure helper exports ──────────────────────────────────────────────

describe("Faz 2d Review P3-004 — new pure helpers exported for testing", () => {
    it("exports parseAttachmentsResponse and findPrimaryImageWithUrl", () => {
        expect(SOURCE).toMatch(/export function parseAttachmentsResponse/);
        expect(SOURCE).toMatch(/export function findPrimaryImageWithUrl/);
    });

    it("exports handler-logic helpers (buildUploadFormData / parseAttachmentApiError / openSignedUrlInNewTab)", () => {
        expect(SOURCE).toMatch(/export function buildUploadFormData/);
        expect(SOURCE).toMatch(/export async function parseAttachmentApiError/);
        expect(SOURCE).toMatch(/export function openSignedUrlInNewTab/);
    });

    it("header uses findPrimaryImageWithUrl helper instead of inline find", () => {
        expect(SOURCE).toMatch(/const primary = findPrimaryImageWithUrl\(attachments\)/);
        expect(SOURCE).not.toMatch(/attachments\.find\(a => a\.isPrimaryImage && a\.signedUrl\)/);
    });

    it("handleUpload uses buildUploadFormData helper (no inline FormData mutation)", () => {
        expect(SOURCE).toMatch(/body:\s*buildUploadFormData\(uploadFile,\s*uploadKind\)/);
    });

    it("error toasts call parseAttachmentApiError with a fallback message", () => {
        expect(SOURCE).toMatch(/parseAttachmentApiError\(res,\s*"Dosya yüklenemedi\."\)/);
        expect(SOURCE).toMatch(/parseAttachmentApiError\(res,\s*"Ana görsel ayarlanamadı\."\)/);
        expect(SOURCE).toMatch(/parseAttachmentApiError\(res,\s*"Dosya silinemedi\."\)/);
    });
});

// ── P3-006: document download refresh via /url ───────────────────────────────

describe("Faz 2d Review P3-006 — document download uses /url endpoint", () => {
    it("defines handleDownloadDocument handler", () => {
        expect(SOURCE).toMatch(/const handleDownloadDocument = async \(attId/);
    });

    it("handler fetches the /url endpoint before opening the link", () => {
        expect(SOURCE).toMatch(/handleDownloadDocument[\s\S]{0,400}?\/api\/products\/\$\{product\.id\}\/attachments\/\$\{attId\}\/url/);
    });

    it("handler routes through openSignedUrlInNewTab (which sets noopener,noreferrer)", () => {
        expect(SOURCE).toMatch(/openSignedUrlInNewTab\(data\.url,\s*window\.open\.bind\(window\)\)/);
    });

    it("documents list renders a BUTTON (not <a href={doc.signedUrl}>)", () => {
        // 1h TTL sonrası direkt href çalışmıyor; click-time refresh için button gerekli.
        expect(SOURCE).not.toMatch(/href=\{doc\.signedUrl\}/);
        expect(SOURCE).toMatch(/onClick=\{\(\) => handleDownloadDocument\(doc\.id\)\}/);
    });

    it("handler updates attachment signedUrl in state so subsequent clicks reuse fresh URL", () => {
        expect(SOURCE).toMatch(/handleDownloadDocument[\s\S]{0,800}?setAttachments\(prev => prev\.map/);
    });
});

// ── Faz 3c Review 2.tur: Önceki Sertifika Versiyonları collapsible ────────────

describe("Faz 3c Review 2.tur — sertifika geçmiş görünümü", () => {
    it("exports parseSupersededAttachmentsResponse helper", () => {
        expect(SOURCE).toMatch(/export function parseSupersededAttachmentsResponse/);
    });

    it("fetchAttachments uses ?includeSuperseded=1 query (single round-trip)", () => {
        expect(SOURCE).toMatch(/attachments\?includeSuperseded=1/);
    });

    it("state holds superseded list + collapsible toggle", () => {
        expect(SOURCE).toMatch(/setSupersededAttachments/);
        expect(SOURCE).toMatch(/setShowSuperseded/);
    });

    it("fetchAttachments parses both items + superseded from response", () => {
        expect(SOURCE).toMatch(/setSupersededAttachments\(parseSupersededAttachmentsResponse\(data\)\)/);
    });

    it("renders 'Önceki Sertifika Versiyonları' header (count + toggle) when superseded > 0", () => {
        expect(SOURCE).toMatch(/supersededAttachments\.length > 0 &&/);
        expect(SOURCE).toMatch(/Önceki Sertifika Versiyonları/);
        expect(SOURCE).toMatch(/aria-expanded=\{showSuperseded\}/);
    });

    it("superseded list 'İndir' butonu handleDownloadDocument'a bağlı (kart audit forensic erişim)", () => {
        expect(SOURCE).toMatch(/aria-label=\{`\$\{doc\.fileName\} indir \(önceki versiyon\)`\}/);
    });
});

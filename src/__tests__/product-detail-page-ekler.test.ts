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

    it("header renders primary image via signedUrl when present (conditional)", () => {
        expect(SOURCE).toMatch(/attachments\.find\(a => a\.isPrimaryImage && a\.signedUrl\)/);
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

    it("documents list opens signed URL in new tab with rel noopener", () => {
        expect(SOURCE).toMatch(/target="_blank"/);
        expect(SOURCE).toMatch(/rel="noopener noreferrer"/);
        expect(SOURCE).toMatch(/href=\{doc\.signedUrl\}/);
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

    it("upload POST sends multipart FormData with file + kind to attachments endpoint", () => {
        expect(SOURCE).toMatch(/new FormData\(\)/);
        expect(SOURCE).toMatch(/fd\.append\("file", uploadFile\)/);
        expect(SOURCE).toMatch(/fd\.append\("kind", uploadKind\)/);
        expect(SOURCE).toMatch(/method: "POST"/);
    });
});

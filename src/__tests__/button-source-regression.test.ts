import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

const PRIMARY_CTA_FILES = [
    "src/app/dashboard/page.tsx",
    "src/app/dashboard/vendors/page.tsx",
    "src/app/dashboard/customers/page.tsx",
    "src/app/dashboard/products/page.tsx",
    "src/app/dashboard/orders/page.tsx",
    "src/app/dashboard/quotes/page.tsx",
    "src/app/dashboard/purchase/orders/page.tsx",
    "src/app/dashboard/settings/product-types/page.tsx",
    "src/app/dashboard/settings/note-templates/page.tsx",
    "src/app/dashboard/settings/users/page.tsx",
];

const FULL_CTA_FILES = PRIMARY_CTA_FILES.filter(file => file !== "src/app/dashboard/page.tsx");

const DETAIL_BUTTON_FILES = {
    quoteForm: "src/app/dashboard/quotes/_components/QuoteForm.tsx",
    quotePreview: "src/app/dashboard/quotes/preview/page.tsx",
    quoteDetail: "src/app/dashboard/quotes/[id]/page.tsx",
    orderForm: "src/app/dashboard/orders/OrderForm.tsx",
    orderDetail: "src/app/dashboard/orders/[id]/page.tsx",
    productDetail: "src/app/dashboard/products/[id]/page.tsx",
    customerPanel: "src/components/customers/CustomerDetailPanel.tsx",
} as const;

describe("premium button source regression", () => {
    it("ana CTA'larda literal '+ Yeni' metni kullanılmaz", () => {
        for (const file of PRIMARY_CTA_FILES) {
            const source = readFileSync(join(projectRoot, file), "utf8");
            expect(source, file).not.toMatch(/\+\s*Yeni\s+(Sipariş|Teklif|Müşteri|Tedarikçi|Ürün|Şablon|Kullanıcı)/);
        }
    });

    it("ana CTA'lar Lucide Plus icon pattern'ine bağlıdır", () => {
        for (const file of PRIMARY_CTA_FILES) {
            const source = readFileSync(join(projectRoot, file), "utf8");
            expect(source, file).toContain("leftIcon=");
            expect(source, file).toContain("<Plus");
        }
    });

    it("dashboard harici ana CTA'lar cta size pattern'ine bağlıdır", () => {
        for (const file of FULL_CTA_FILES) {
            const source = readFileSync(join(projectRoot, file), "utf8");
            expect(source, file).toContain('size="cta"');
        }
    });

    it("cta Plus ikonları yeni 15px ölçüye bağlıdır", () => {
        for (const file of FULL_CTA_FILES) {
            const source = readFileSync(join(projectRoot, file), "utf8");
            if (!source.includes("<Plus")) continue;
            expect(source, file).toContain("<Plus size={15}");
            expect(source, file).not.toContain("<Plus size={16}");
        }
    });

    it("detay/form Faz 2 aksiyonları Button/ButtonLink sisteminden render edilir", () => {
        const quoteForm = readFileSync(join(projectRoot, DETAIL_BUTTON_FILES.quoteForm), "utf8");
        expect(quoteForm).toContain('from "@/components/ui/Button"');
        expect(quoteForm).toContain("leftIcon={<FileText");
        expect(quoteForm).toContain("leftIcon={<Save");
        expect(quoteForm).not.toMatch(/className="q-btn/);
        expect(quoteForm).not.toMatch(/\.q-add-btn:hover/);
        expect(quoteForm).not.toMatch(/>↻<\/button>/);

        const quotePreview = readFileSync(join(projectRoot, DETAIL_BUTTON_FILES.quotePreview), "utf8");
        expect(quotePreview).toContain('from "@/components/ui/Button"');
        expect(quotePreview).not.toMatch(/btnPrimary|btnSecondary/);
        expect(quotePreview).not.toMatch(/<button/);

        const quoteDetail = readFileSync(join(projectRoot, DETAIL_BUTTON_FILES.quoteDetail), "utf8");
        expect(quoteDetail).toContain("leftIcon={<FileText");
        expect(quoteDetail).not.toContain("📄 Arşivlenmiş Teklif");

        const orderForm = readFileSync(join(projectRoot, DETAIL_BUTTON_FILES.orderForm), "utf8");
        expect(orderForm).toContain("Button, { ButtonLink }");
        expect(orderForm).toContain("leftIcon={<ArrowLeft");
        expect(orderForm).toContain("leftIcon={<Trash2");
        expect(orderForm).not.toMatch(/<Link href=\{backHref\}>/);

        const orderDetail = readFileSync(join(projectRoot, DETAIL_BUTTON_FILES.orderDetail), "utf8");
        expect(orderDetail).toContain("Button, { ButtonLink }");
        expect(orderDetail).toContain("leftIcon={<Trash2");
        expect(orderDetail).not.toContain("📄 Belgeyi Aç");

        const customerPanel = readFileSync(join(projectRoot, DETAIL_BUTTON_FILES.customerPanel), "utf8");
        expect(customerPanel).toContain('from "@/components/ui/Button"');
        expect(customerPanel).toContain("leftIcon={<Plus");
        expect(customerPanel).not.toMatch(/<button/);

        const productDetail = readFileSync(join(projectRoot, DETAIL_BUTTON_FILES.productDetail), "utf8");
        expect(productDetail).toContain("leftIcon={<Download");
        expect(productDetail).toContain("ref={lightboxCloseBtnRef}");
        expect(productDetail).not.toContain("✕ Kapat");
    });
});

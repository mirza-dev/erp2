import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

// NOT: Genel Bakış (dashboard/page.tsx) tasarıma sadık SALT-BAKIŞ ekranıdır —
// "Yeni Sipariş" CTA'sı yok (segment + Rapor indir header'ı); ana-CTA listesinden çıkarıldı.
const PRIMARY_CTA_FILES = [
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

const ACTION_BUTTON_FILES = {
    products: "src/app/dashboard/products/page.tsx",
    productDetail: "src/app/dashboard/products/[id]/page.tsx",
    customers: "src/app/dashboard/customers/page.tsx",
    vendors: "src/app/dashboard/vendors/page.tsx",
    orders: "src/app/dashboard/orders/page.tsx",
    orderDetail: "src/app/dashboard/orders/[id]/page.tsx",
    purchaseOrders: "src/app/dashboard/purchase/orders/page.tsx",
    purchaseOrderDetail: "src/app/dashboard/purchase/orders/[id]/page.tsx",
    purchaseSuggested: "src/app/dashboard/purchase/suggested/page.tsx",
    noteTemplates: "src/app/dashboard/settings/note-templates/page.tsx",
    productTypeDetail: "src/app/dashboard/settings/product-types/[id]/page.tsx",
    users: "src/app/dashboard/settings/users/page.tsx",
    resetDemo: "src/components/settings/ResetDemoSection.tsx",
    quotes: "src/app/dashboard/quotes/page.tsx",
    production: "src/app/dashboard/production/page.tsx",
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

    it("normal ekran yıkıcı aksiyonları dangerSoft, final onaylar güçlü danger kullanır", () => {
        for (const [name, file] of Object.entries(ACTION_BUTTON_FILES)) {
            const source = readFileSync(join(projectRoot, file), "utf8");
            expect(source, name).toContain("dangerSoft");
        }

        const productDetail = readFileSync(join(projectRoot, ACTION_BUTTON_FILES.productDetail), "utf8");
        expect(productDetail).toMatch(/variant="dangerSoft"[\s\S]{0,700}Devre Dışı Bırak/);
        expect(productDetail).toMatch(/variant="danger"[\s\S]{0,700}Devre Dışı Bırak/);

        const orderDetail = readFileSync(join(projectRoot, ACTION_BUTTON_FILES.orderDetail), "utf8");
        expect(orderDetail).toContain('variant="dangerSoft"');
        expect(orderDetail).toMatch(/variant="danger"[\s\S]{0,300}Evet, kalıcı sil/);

        const resetDemo = readFileSync(join(projectRoot, ACTION_BUTTON_FILES.resetDemo), "utf8");
        expect(resetDemo).toContain('variant="dangerSoft"');
        expect(resetDemo).toMatch(/variant="danger"[\s\S]{0,420}Evet, sıfırla/);
    });

    it("düzenleme aksiyonları secondary + Lucide Pencil standardını kullanır", () => {
        for (const file of [
            ACTION_BUTTON_FILES.productDetail,
            ACTION_BUTTON_FILES.vendors,
            ACTION_BUTTON_FILES.purchaseOrderDetail,
            ACTION_BUTTON_FILES.noteTemplates,
            ACTION_BUTTON_FILES.users,
        ]) {
            const source = readFileSync(join(projectRoot, file), "utf8");
            expect(source, file).toContain("<Pencil");
            expect(source, file).toContain('variant="secondary"');
        }
    });

    it("satın alma siparişi detayındaki eski style helper aksiyonları Button sistemine taşınır", () => {
        const source = readFileSync(join(projectRoot, ACTION_BUTTON_FILES.purchaseOrderDetail), "utf8");
        expect(source).toContain('from "@/components/ui/Button"');
        expect(source).toContain("ButtonLink");
        expect(source).not.toMatch(/btnPrimary|btnSecondary|btnDanger/);
        expect(source).not.toContain("📄 Yazdır / PDF");
    });
});

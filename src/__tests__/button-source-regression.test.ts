import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

// NOT: Genel Bakış (dashboard/page.tsx) tasarıma sadık SALT-BAKIŞ ekranıdır —
// "Yeni Sipariş" CTA'sı yok (segment + Rapor indir header'ı); ana-CTA listesinden çıkarıldı.
const PRIMARY_CTA_FILES = [
    "src/app/dashboard/vendors/VendorsClient.tsx",
    "src/app/dashboard/customers/CustomersClient.tsx",
    "src/app/dashboard/products/page.tsx",
    "src/app/dashboard/orders/OrdersClient.tsx",
    "src/app/dashboard/quotes/QuotesClient.tsx",
    "src/app/dashboard/purchase/orders/PurchaseOrdersClient.tsx",
    "src/app/dashboard/settings/product-types/page.tsx",
    "src/components/settings/NoteTemplatesTab.tsx",
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
    customers: "src/app/dashboard/customers/CustomersClient.tsx",
    vendors: "src/app/dashboard/vendors/VendorsClient.tsx",
    orders: "src/app/dashboard/orders/OrdersClient.tsx",
    orderDetail: "src/app/dashboard/orders/[id]/page.tsx",
    purchaseOrders: "src/app/dashboard/purchase/orders/PurchaseOrdersClient.tsx",
    purchaseOrderDetail: "src/app/dashboard/purchase/orders/[id]/page.tsx",
    purchaseSuggested: "src/app/dashboard/purchase/suggested/page.tsx",
    noteTemplates: "src/components/settings/NoteTemplatesTab.tsx",
    productTypeDetail: "src/app/dashboard/settings/product-types/[id]/page.tsx",
    users: "src/app/dashboard/settings/users/page.tsx",
    resetDemo: "src/components/settings/ResetDemoSection.tsx",
    quotes: "src/app/dashboard/quotes/QuotesClient.tsx",
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

    // ── Veri Aktarım sihirbazı (2026-09-04) ─────────────────────────────────
    //
    // Kural POZİTİF: "dosya Button'ı kullanıyor + ölü lehçe geri gelmemiş".
    // Depo geneline "buton şekli" araması BİLEREK yapılmıyor — 2026-08-31'de o
    // yaklaşım 5 yanlış pozitif üretip (dropzone dragOver, tercih toggle'ı,
    // kategori onay kutuları, Paraşüt'ün dikey listesi) kuralın geri
    // alınmasına yol açtı.
    //
    // stripComments ZORUNLU: aşağıda aranan `tabBtnStyle`/`btnSecondary`
    // adları, o helper'ları silerken bıraktığım GEREKÇE YORUMLARINDA geçiyor.
    // Yorum soyulmazsa kural kendi açıklamasına takılıp hep kırmızı yanar —
    // bu tuzağa depoda dört kez düşüldü.
    it("Veri Aktarım sihirbazı tek buton diline bağlı, ölü çip lehçesi geri gelmiyor", () => {
        const stripComments = (src: string) =>
            src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        const readCode = (file: string) =>
            stripComments(readFileSync(join(projectRoot, file), "utf8"));

        const WIZARD_FILES = [
            "src/app/dashboard/import/excel/page.tsx",
            "src/components/import/ExtractionReview.tsx",
            "src/components/import/ClassifierQueue.tsx",
            "src/components/import/SetupStatusPanel.tsx",
        ];

        for (const file of WIZARD_FILES) {
            const source = readCode(file);
            expect(source, file).toContain('from "@/components/ui/Button"');
            // Silinen iki yerel stil helper'ı: sihirbazın kendi çip/buton lehçesi.
            expect(source, file).not.toMatch(/\btabBtnStyle\b|\bbtnSecondary\b/);
        }

        const wizard = readCode(WIZARD_FILES[0]);

        // Kurulum akışının ana aksiyonları: eskiden `--accent-bg` (%10 tint) ile
        // çiziliyorlardı — ne mavi ne beyaz. Artık login'deki mavi `primary`.
        //
        // Kural MESAFEYE değil YAPIYA bağlı: varyant ile etiket AYNI <Button>
        // elemanının içinde olmalı. İlk hâli "en fazla 320 karakter" diyordu ve
        // derin girinti onu aştı — karakter sayısı, prop eklendikçe kayan
        // kırılgan bir ölçüdür.
        const withinElement = (tag: string, attr: string, label: string) =>
            new RegExp(`<${tag}(?:(?!</${tag}>)[\\s\\S])*?${attr}(?:(?!</${tag}>)[\\s\\S])*?${label}`);

        for (const label of ["Kolon Eşleştirmeye Geç", "Eşleştirmeyi Uygula", "Onayla ve İçe Aktar", "Dosya Seç"]) {
            expect(wizard, label).toMatch(withinElement("Button", 'variant="primary"', label));
        }

        // Sheet + kayıt-türü sekmeleri ortak çip diline geçti (dördüncü lehçe öldü).
        expect(wizard).toContain('from "@/components/ui/FilterChips"');
        expect(wizard.match(/<FilterChips/g) ?? []).toHaveLength(2);

        // Bitiş ekranındaki beş buton-görünümlü <Link> ButtonLink oldu; ikisi
        // zemin renginde (`--bg-secondary` == `--app-bg`), üçü tint'teydi.
        expect(wizard).toMatch(withinElement("ButtonLink", 'variant="secondary"', "Rapor XLSX"));
        expect(wizard.match(/<ButtonLink/g) ?? []).toHaveLength(5);
    });

    // ── Dilim 2·3·4 (2026-09-04) ────────────────────────────────────────────
    //
    // Aynı pozitif-benimseme kalıbı. `stripComments` yine ZORUNLU: silinen
    // helper'ların adları (`btn`, `iconButtonStyle`) gerekçe yorumlarında geçiyor.
    it("satınalma · ayarlar · dağınık yüzeyler tek buton diline bağlı", () => {
        const stripComments = (src: string) =>
            src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        const readCode = (file: string) =>
            stripComments(readFileSync(join(projectRoot, file), "utf8"));

        const ADOPTED = [
            "src/app/dashboard/purchase/rfqs/[id]/page.tsx",
            "src/app/dashboard/purchase/rfqs/new/page.tsx",
            "src/app/dashboard/purchase/orders/new/page.tsx",
            "src/components/purchase/PurchaseOrderModal.tsx",
            "src/app/dashboard/settings/product-types/[id]/page.tsx",
            "src/components/settings/NoteTemplatesTab.tsx",
            "src/app/dashboard/page.tsx",
            "src/components/dashboard/AISummaryCard.tsx",
            "src/components/ai/AiUnavailableBanner.tsx",
            "src/app/dashboard/production/page.tsx",
        ];
        for (const file of ADOPTED) {
            expect(readCode(file), file).toContain('from "@/components/ui/Button"');
        }

        // Silinen iki yerel lehçe geri gelmemeli.
        // `btn(` yerine BİLDİRİMİ aranıyor: `Button(` gibi masum eşleşmeler olmasın.
        expect(readCode(ADOPTED[0])).not.toMatch(/const btn\s*=/);
        expect(readCode("src/app/dashboard/settings/product-types/[id]/page.tsx"))
            .not.toMatch(/\biconButtonStyle\b/);

        // Kurulum/oluşturma akışlarının ana aksiyonu mavi (eskiden düz --accent).
        const withinElement = (tag: string, attr: string, label: string) =>
            new RegExp(`<${tag}(?:(?!</${tag}>)[\\s\\S])*?${attr}(?:(?!</${tag}>)[\\s\\S])*?${label}`);
        expect(readCode("src/app/dashboard/purchase/rfqs/new/page.tsx"))
            .toMatch(withinElement("Button", 'variant="primary"', "Talep Oluştur"));
        expect(readCode("src/app/dashboard/purchase/orders/new/page.tsx"))
            .toMatch(withinElement("Button", 'variant="primary"', "Sipariş Oluştur"));
        expect(readCode("src/app/dashboard/page.tsx"))
            .toMatch(withinElement("Button", 'variant="primary"', "Raporu yazdır"));

        // Çip lehçeleri: eskime filtresi FilterChips'e, RFQ panel sekmeleri de.
        for (const file of [
            "src/app/dashboard/products/aging/page.tsx",
            "src/app/dashboard/purchase/rfqs/[id]/page.tsx",
        ]) {
            expect(readCode(file), file).toContain('from "@/components/ui/FilterChips"');
        }

        // Developer log filtreleri ÇOK SEÇİMLİ → FilterChips DEĞİL ama palet aynı.
        const logs = readCode("src/app/dashboard/developer/logs/page.tsx");
        expect(logs).toMatch(/variant=\{active \? "primary" : "secondary"\}/);
        expect(logs).toMatch(/aria-pressed=\{active\}/);
        expect(logs).not.toContain('from "@/components/ui/FilterChips"');
    });

    // ── ghost-danger (2026-09-04, ikinci tur) ───────────────────────────────
    //
    // Dilim 3'ün TEK bilinçli istisnası kapandı. `.file-action-btn.is-danger`
    // depodaki tek `--danger` hover kuralıydı: dinlenirken sessiz, hover'da
    // kırmızı — yani "yıkıcı" sinyali. `Button`da karşılığı olmadığı için o
    // kontrol elle örülmüş kalmıştı; artık varyant var, sınıf yok.
    it("satır içi yıkıcı ikon `ghostDanger` varyantından gelir, yerel sınıf geri gelmez", () => {
        const stripComments = (src: string) =>
            src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        const readCode = (file: string) =>
            stripComments(readFileSync(join(projectRoot, file), "utf8"));
        const withinElement = (tag: string, attr: string, label: string) =>
            new RegExp(`<${tag}(?:(?!</${tag}>)[\\s\\S])*?${attr}(?:(?!</${tag}>)[\\s\\S])*?${label}`);

        // 1) Varyant var ve YIKICI: dinlenmesi şeffaf, hover'ı danger token'ları.
        //    Dinlenme rengi `ghost` ile aynı olmalı — satırdaki üç ikon eşit
        //    ağırlıkta durur (eski sınıf `--text-tertiary` ile soluk kalıyordu).
        const button = readCode("src/components/ui/Button.tsx");
        expect(button).toMatch(/ghostDanger:\s*\{[\s\S]*?bg:\s*"transparent"/);
        expect(button).toMatch(/ghostDanger:\s*\{[\s\S]*?color:\s*"var\(--text-secondary\)"/);
        expect(button).toMatch(/ghostDanger:\s*\{[\s\S]*?hoverBg:\s*"var\(--danger-bg\)"/);
        expect(button).toMatch(/ghostDanger:\s*\{[\s\S]*?hoverColor:\s*"var\(--danger-text\)"/);
        expect(button).toMatch(/hoverBorder:\s*"var\(--danger-border\)"/);

        // 2) Tüketici gerçekten bağlı — varyant yazılıp kullanılmamış olmasın.
        const dosyalar = readCode("src/components/settings/DosyalarTab.tsx");
        expect(dosyalar).toMatch(withinElement("Button", 'variant="ghostDanger"', "Sil: \\$\\{f.display_name\\}"));
        expect(dosyalar).not.toContain("file-action-btn");

        // 3) Silinen sınıf ailesi CSS'e geri gelemez. `stripComments` ZORUNLU:
        //    adı, onu silerken bıraktığım gerekçe yorumunda geçiyor (depoda bu
        //    tuzağa dört kez düşüldü).
        const css = stripComments(readFileSync(join(projectRoot, "src/app/globals.css"), "utf8"));
        expect(css).not.toContain("file-action-btn");
    });
});

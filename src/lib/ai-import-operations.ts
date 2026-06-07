export type AiImportOperationPhase = 1 | 2 | 3;

export type AiImportOperationStatus = "active" | "planned";

export type AiImportOperationScope =
    | "product"
    | "product_document"
    | "product_type"
    | "stock"
    | "customer"
    | "vendor";

export interface AiImportOperationDefinition {
    id: string;
    phase: AiImportOperationPhase;
    status: AiImportOperationStatus;
    scope: AiImportOperationScope;
    title: string;
    shortTitle: string;
    description: string;
    evidenceHint: string;
    safetyNote: string;
    promptContext: string;
}

export const AI_IMPORT_OPERATIONS = [
    {
        id: "product_create",
        phase: 1,
        status: "active",
        scope: "product",
        title: "Yeni ürün oluştur",
        shortTitle: "Yeni ürün",
        description: "Katalog, datasheet veya Excel'den yeni ürün adayları çıkarır. Katalog PDF'lerinde ürünün sayfadaki görseli de otomatik render edilip ürün kartına kapak (primary) olarak eklenir.",
        evidenceHint: "Ad, SKU, ürün tipi ve teknik alanlar için sayfa/satır kanıtı aranır; PDF katalogda ürün görselinin sayfası da işaretlenir.",
        safetyNote: "Fiyat ve maliyet pasif raporlanır; ürün finansal alanlarına yazılmaz. Görsel render başarısızsa ürün verisi yine de yazılır (görsel atlanır).",
        promptContext: "Kullanıcı yeni ürün oluşturmak istiyor. Dosyada ürün adı, SKU veya teknik bilgi arayarak yeni ürün adayları çıkar. Fiyat ve maliyet alanlarını uygulama alanı olarak önerme.",
    },
    {
        id: "product_update",
        phase: 1,
        status: "active",
        scope: "product",
        title: "Mevcut ürünü güncelle",
        shortTitle: "Ürün güncelle",
        description: "Mevcut ürünlerle eşleştirir ve sadece bulunan alanları güncelleme adayı yapar.",
        evidenceHint: "SKU + ad benzerliği, teknik anahtar ve belge kanıtı birlikte değerlendirilir.",
        safetyNote: "Boş alanlar mevcut veriyi silmez; fiyat ve maliyet uygulanmaz; şüpheli eşleşmeler toplu uygulanmaz.",
        promptContext: "Kullanıcı mevcut ürünleri güncellemek istiyor. Eşleşme için SKU ile ürün adını birlikte dikkate al. Dosyada olmayan alanları silme veya doldurulmuş gibi gösterme. Fiyat ve maliyet alanlarını uygulama adayı yapma.",
    },
    {
        id: "product_technical_update",
        phase: 1,
        status: "active",
        scope: "product",
        title: "Teknik bilgileri güncelle",
        shortTitle: "Teknik bilgi",
        description: "Ürün tipi teknik anahtarlarına göre ölçü, kapasite, malzeme gibi alanları çıkarır.",
        evidenceHint: "Ürün tipi şablonundaki teknik anahtarlar ve alias'lar önceliklidir.",
        safetyNote: "Sadece kullanıcının onayladığı teknik alanlar uygulanır.",
        promptContext: "Kullanıcı ürün teknik bilgilerini güncellemek istiyor. Ürün tipi teknik şablonlarına odaklan; teknik değerleri kanıtıyla çıkar; fiyat, maliyet ve stok alanlarını uygulama adayı yapma.",
    },
    {
        id: "product_documents",
        phase: 1,
        status: "active",
        scope: "product_document",
        title: "Görsel, doküman veya sertifika ekle",
        shortTitle: "Görsel/doküman ekle",
        description: "Ürün görseli, sertifika, uygunluk belgesi, test raporu veya datasheet'i ilgili ürüne eşleştirir. Birden çok dosya aynı anda yüklenebilir; yüklenen ilk görsel ürün kapak görseli olur.",
        evidenceHint: "Hedef ürün adı/SKU ve belge/görsel tipi kanıtı aranır. Katalogdaki ürün görsellerini kaydedip buraya yükleyebilirsiniz.",
        safetyNote: "İlk görsel otomatik kapak görseli (primary) olur; mevcut kapak varsa korunur. Sertifika/standart eksikleri bloklayıcı değildir.",
        promptContext: "Kullanıcı ürün görseli, dokümanı veya sertifikası eklemek istiyor. Dosyanın gerçek belge türünü belirle ve hedef ürünü bulmaya yarayan ad/SKU sinyallerine odaklan. Sertifika/standartları zorunlu kural olarak dayatma.",
    },
    {
        id: "product_type_template",
        phase: 1,
        status: "planned",
        scope: "product_type",
        title: "Ürün tipi şablonu geliştir",
        shortTitle: "Tip şablonu",
        description: "Teknik anahtar, veri tipi, birim, seçenek ve alias önerileri üretir.",
        evidenceHint: "Öneriler PDF sayfası, DOCX paragrafı veya Excel satırıyla kanıtlanır.",
        safetyNote: "Onaylanan öneriler mevcut ürünlere otomatik uygulanmaz.",
        promptContext: "Kullanıcı ürün tipi teknik şablonunu geliştirmek istiyor. Teknik anahtar, alias, veri tipi, birim ve seçim listesi önerileri çıkar; mevcut ürün verisini değiştirme.",
    },
    {
        id: "stock_count",
        phase: 2,
        status: "active",
        scope: "stock",
        title: "Stok sayımı",
        shortTitle: "Stok sayımı",
        description: "Dosyadaki miktarları sayım modu olarak yorumlar.",
        evidenceHint: "Ürün eşleşmesi, depo/konum ve miktar kanıtı gösterilir.",
        safetyNote: "Maliyet, değerleme veya satış fiyatı yazılmaz.",
        promptContext: "Kullanıcı stok sayımı yapmak istiyor. Miktar ve depo/konum bilgisine odaklan; maliyet ve fiyat bilgilerini pasif raporla.",
    },
    {
        id: "stock_movement",
        phase: 2,
        status: "active",
        scope: "stock",
        title: "Stok hareketi",
        shortTitle: "Stok hareketi",
        description: "Dosyadaki miktarları giriş/çıkış hareketi olarak yorumlar.",
        evidenceHint: "Ürün, yön, miktar, depo/konum ve hareket notu kanıtı gösterilir.",
        safetyNote: "Finansal stok değerlemesi yapılmaz.",
        promptContext: "Kullanıcı stok hareketi girmek istiyor. Miktar, yön ve operasyonel notlara odaklan; maliyet/fiyat uygulama önerme.",
    },
    {
        id: "customer_upsert",
        phase: 2,
        status: "active",
        scope: "customer",
        title: "Müşteri içe aktar/güncelle",
        shortTitle: "Müşteri",
        description: "Müşterileri e-posta öncelikli eşleştirir ve alan bazlı güncelleme önerir.",
        evidenceHint: "E-posta, kod, vergi no, telefon ve ad benzerliği ayrı sinyaller olarak gösterilir.",
        safetyNote: "Şüpheli isim benzerliği tek başına kesin eşleşme sayılmaz.",
        promptContext: "Kullanıcı müşteri içe aktarmak veya güncellemek istiyor. E-posta exact match en güçlü sinyaldir; vergi no opsiyonel sinyaldir; şüpheli ad benzerliğini inceleme gerektirir.",
    },
    {
        id: "vendor_upsert",
        phase: 2,
        status: "active",
        scope: "vendor",
        title: "Tedarikçi içe aktar/güncelle",
        shortTitle: "Tedarikçi",
        description: "Tedarikçileri e-posta/kod öncelikli eşleştirir.",
        evidenceHint: "E-posta, kod, vergi no, telefon ve isim sinyalleri ayrıştırılır.",
        safetyNote: "Finansal fiyat/maliyet uygulaması yapılmaz.",
        promptContext: "Kullanıcı tedarikçi içe aktarmak veya güncellemek istiyor. E-posta ve tedarikçi kodunu önceliklendir; fiyat/maliyet uygulama önerme.",
    },
    {
        id: "vendor_product_relation",
        phase: 2,
        status: "active",
        scope: "vendor",
        title: "Tedarikçi ürün ilişkisi güncelle",
        shortTitle: "Tedarikçi ürün",
        description: "Tedarikçi ürün kodu, lead time ve MOQ gibi operasyonel bilgileri çıkarır.",
        evidenceHint: "Ürün, tedarikçi ve operasyonel ilişki alanları kanıtlanır.",
        safetyNote: "Fiyat ve maliyet pasif bilgi olarak kalır.",
        promptContext: "Kullanıcı tedarikçi-ürün ilişkisini güncellemek istiyor. Tedarikçi ürün kodu, lead time ve MOQ gibi operasyonel alanlara odaklan; fiyat/maliyet uygulama önerme.",
    },
] as const satisfies readonly AiImportOperationDefinition[];

export type AiImportOperation = typeof AI_IMPORT_OPERATIONS[number];
export type AiImportOperationType = typeof AI_IMPORT_OPERATIONS[number]["id"];

export const DEFAULT_AI_IMPORT_OPERATION: AiImportOperationType = "product_update";

const OPERATION_BY_ID = new Map<AiImportOperationType, AiImportOperationDefinition>(
    AI_IMPORT_OPERATIONS.map(op => [op.id, op]),
);

export function isAiImportOperationType(value: unknown): value is AiImportOperationType {
    return typeof value === "string" && OPERATION_BY_ID.has(value as AiImportOperationType);
}

export function getAiImportOperation(value: unknown): AiImportOperationDefinition {
    if (isAiImportOperationType(value)) {
        return OPERATION_BY_ID.get(value)!;
    }
    return OPERATION_BY_ID.get(DEFAULT_AI_IMPORT_OPERATION)!;
}

export function getActiveAiImportOperations(): AiImportOperation[] {
    return AI_IMPORT_OPERATIONS.filter(op => op.status === "active");
}

export function getPlannedAiImportOperations(): AiImportOperation[] {
    return AI_IMPORT_OPERATIONS.filter(op => op.status === "planned");
}

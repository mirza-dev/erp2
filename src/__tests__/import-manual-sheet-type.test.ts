/**
 * Sheet türünün elle atanması — otomatik tespitin emniyet supabı.
 *
 * NEDEN VAR: tespit sheet ADINA, tutmazsa kolon başlıklarına bakıyor. İkisi de
 * tutmazsa sheet "aktarılamaz" damgası yiyordu ve kullanıcının HİÇBİR çıkışı
 * yoktu — muhasebeciden gelen "Sayfa1" adlı dosya duvara toslardı (2026-08-29).
 *
 * Tespitin kendisi iyi çalışıyor (6 gerçekçi senaryonun 6'sında doğru tip), o
 * yüzden bu düşük öncelikli bir emniyet supabı; ama tek tanınmayan dosyada
 * kurulum durur.
 */
import { describe, it, expect } from "vitest";
import {
    applyManualSheetEntityType,
    CLASSIC_IMPORT_ENTITY_LABELS,
    EXCEL_IMPORT_ENTITY_TYPES,
    detectSheetEntityType,
    type ClassicImportEntityType,
} from "@/lib/import-center";

/** Sihirbazın SheetInfo satırının test karşılığı. */
function sheet(over: Partial<{
    name: string; displayName: string; entity: string;
    entityType: string | null; status: string; selected: boolean;
}> = {}) {
    return {
        name: "Sayfa1",
        displayName: "Sayfa1",
        entity: "Sayfa1",
        entityType: null as string | null,
        status: "unsupported",
        selected: false,
        ...over,
    };
}

describe("tanınmayan sheet elle aktarılabilir hâle gelmeli", () => {
    it('"Sayfa1" ürün listesi olarak işaretlenebilir', () => {
        // Tam senaryo: muhasebeciden gelen dosya, sheet adı anlamsız,
        // başlıklar da tespiti taşımıyor.
        const tanima = detectSheetEntityType("Sayfa1", ["Kolon A", "Kolon B"]);
        expect(tanima.entityType).toBeNull(); // otomatik tespit çuvallıyor

        const sonuc = applyManualSheetEntityType(sheet(), "product");
        expect(sonuc.entityType).toBe("product");
        expect(sonuc.status).toBe("importable");
        expect(sonuc.selected).toBe(true);
    });

    it("elle atama görünen adı da düzeltir", () => {
        const sonuc = applyManualSheetEntityType(sheet(), "customer");
        expect(sonuc.displayName).toBe("Müşteriler");
        expect(sonuc.entity).toBe("Müşteriler");
    });

    it("dört klasik tipin hepsi atanabilir", () => {
        for (const t of EXCEL_IMPORT_ENTITY_TYPES) {
            const sonuc = applyManualSheetEntityType(sheet(), t);
            expect(sonuc.entityType).toBe(t);
            expect(sonuc.status).toBe("importable");
            expect(sonuc.displayName).toBe(CLASSIC_IMPORT_ENTITY_LABELS[t]);
        }
    });
});

describe("yanlış tespit düzeltilebilmeli", () => {
    it("otomatik bulunan tip elle değiştirilince satır tamamen güncellenir", () => {
        // Tespit "Ürünler" demiş ama dosya aslında tedarikçi listesi.
        const otomatik = sheet({
            entityType: "product", displayName: "Ürünler", entity: "Ürünler",
            status: "importable", selected: true,
        });
        const sonuc = applyManualSheetEntityType(otomatik, "vendor");
        expect(sonuc.entityType).toBe("vendor");
        expect(sonuc.displayName).toBe("Tedarikçiler");
        expect(sonuc.entity).toBe("Tedarikçiler");
    });

    it("orijinal sheet adı korunur (dosyadaki gerçek ad kaybolmamalı)", () => {
        const sonuc = applyManualSheetEntityType(sheet({ name: "FİYAT LİSTESİ" }), "product");
        expect(sonuc.name).toBe("FİYAT LİSTESİ");
    });
});

describe('"Aktarma" seçimi', () => {
    it("null atanınca sheet devre dışı kalır", () => {
        // Kapak/açıklama sayfaları — kullanıcı bilinçli olarak dışarıda bırakır.
        const secili = sheet({
            entityType: "product", status: "importable", selected: true,
            displayName: "Ürünler", entity: "Ürünler",
        });
        const sonuc = applyManualSheetEntityType(secili, null);
        expect(sonuc.entityType).toBeNull();
        expect(sonuc.status).toBe("unsupported");
        expect(sonuc.selected).toBe(false);
    });
});

describe("saflık — girdi mutasyona uğramamalı", () => {
    it("orijinal nesne değişmez", () => {
        const orijinal = sheet();
        const kopya = { ...orijinal };
        applyManualSheetEntityType(orijinal, "stock" as ClassicImportEntityType);
        expect(orijinal).toEqual(kopya);
    });
});

describe("etiketler tek kaynaktan gelmeli", () => {
    it("her klasik tipin etiketi tanımlı", () => {
        for (const t of EXCEL_IMPORT_ENTITY_TYPES) {
            expect(CLASSIC_IMPORT_ENTITY_LABELS[t]).toBeTruthy();
        }
    });
});

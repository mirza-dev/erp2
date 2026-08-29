/**
 * Excel içe aktarım eşleştirme katmanının AI'SIZ doğruluğu.
 *
 * NEDEN VAR: 2026-08-29'da ölçüldü ki sistemin KENDİ indirdiği şablonun 56
 * kolonundan 10'u (%18) kendi alanına geri dönmüyordu — biri zorunlu ("Ürün
 * SKU"), yani Tedarikçi-Ürün İlişkisi şablonu elle müdahale olmadan hiç
 * çalışmıyordu. Kusur görünmüyordu çünkü eşleşmeyen her başlık AI'ya düşüyor,
 * AI da onları doğru eşleştiriyordu. ANTHROPIC_API_KEY geçersizleşince
 * (HTTP 401) örtü kalktı.
 *
 * Bu dosya "anahtar gelince eksiksiz çalışsın" isteğinin garantisidir:
 * eşleştirme katmanı ANAHTARSIZ yeşil olmak zorunda. AI yalnız gerçekten
 * tanınmayan başlıklar için devreye girmeli — bilinen başlıklar için değil.
 *
 * Saf yardımcılar test edilir; Supabase/Anthropic çağrısı yok.
 */
import { describe, it, expect } from "vitest";
import {
    EXCEL_IMPORT_TEMPLATES,
    detectSheetEntityType,
    normalizeImportToken,
    type ExcelImportTemplateKind,
    type ClassicImportEntityType,
} from "@/lib/import-center";
import { normalizeColumnName } from "@/lib/supabase/column-mappings";
import { FALLBACK_FIELD_MAP } from "@/lib/services/ai-service";
import { REQUIRED_FIELDS, IMPORT_FIELD_SET } from "@/lib/import-fields";

/** Şablon türü → sihirbazın o sheet için kullandığı entity tipi. */
const KIND_ENTITY: Record<ExcelImportTemplateKind, string> = {
    product: "product",
    customer: "customer",
    vendor: "vendor",
    stock_count: "stock",
    stock_movement: "stock",
    // Tedarikçi-ürün ilişkisi ürün satırı olarak akar (SHEET_ENTITY_MAP:
    // "Tedarikci_Urunleri" → entityType "product"); SKU eşleşen mevcut ürüne
    // tedarikçi bağı kurulur.
    vendor_product_relation: "product",
    // Kurulum günü kararı (2026-08-29): açık siparişlerin taşınması için şablon.
    // import-service bu tipleri zaten işliyordu; eksik olan şablon + elle
    // tür seçimiydi.
    order: "order",
    order_line: "order_line",
};

describe("tek normalizer — normalizeColumnName ile normalizeImportToken ayrışmamalı", () => {
    // Ayrışmanın kendisi buguydu: alias anahtarları normalizeImportToken ile
    // yazılmış, arama normalizeColumnName ile yapılıyordu.
    const ornekler = [
        "Tedarik Süresi (gün)",
        "Ödeme Vadesi (gün)",
        "Birim Fiyat ($)",
        "Ağırlık (kg)",
        "Min. Stok",
        "Br.",
        "V.D.",
        "Min. Sip.",
        "  Boşluklu  Başlık  ",
        "ÜRÜN KODU",
        "Depo/Lokasyon",
    ];
    for (const h of ornekler) {
        it(`"${h}" iki normalizer'da aynı sonucu vermeli`, () => {
            expect(normalizeColumnName(h)).toBe(normalizeImportToken(h));
        });
    }

    it("ardışık ve kenar alt çizgileri sadeleştirmeli", () => {
        expect(normalizeColumnName("Tedarik Süresi (gün)")).toBe("tedarik_suresi_gun");
        expect(normalizeColumnName("Birim Fiyat ($)")).toBe("birim_fiyat");
        expect(normalizeColumnName("Br.")).toBe("br");
    });

    it("canlı column_mappings hafızasındaki anahtarları bozmamalı", () => {
        // Normalizer değiştiğinde tabloda duran `normalized` değerleri yetim
        // kalabilirdi. Değişim anında canlıda bu 3 satır vardı; üçü de her iki
        // gövdede aynı sonucu verdiği için migration gerekmedi.
        expect(normalizeColumnName("Ürün Kodu")).toBe("urun_kodu");
        expect(normalizeColumnName("Stok Adedi")).toBe("stok_adedi");
        expect(normalizeColumnName("Vergi No")).toBe("vergi_no");
    });
});

describe("şablon round-trip — indirilen şablon elle eşleştirme gerektirmemeli", () => {
    const kinds = Object.keys(EXCEL_IMPORT_TEMPLATES) as ExcelImportTemplateKind[];

    for (const kind of kinds) {
        const tpl = EXCEL_IMPORT_TEMPLATES[kind];
        const entity = KIND_ENTITY[kind];

        describe(`${tpl.title} (${kind})`, () => {
            for (const col of tpl.columns) {
                it(`"${col.label}" → ${col.field}`, () => {
                    const norm = normalizeColumnName(col.label);
                    const hit = FALLBACK_FIELD_MAP[entity]?.[norm];
                    // Mesaj kasıtlı olarak ayrıntılı: kırıldığında hangi
                    // başlığın hangi anahtara düştüğü doğrudan görünsün.
                    expect(
                        hit,
                        `"${col.label}" → "${norm}" alias tablosunda yok (beklenen alan: ${col.field})`,
                    ).toBe(col.field);
                });
            }
        });
    }

    it("hiçbir şablon kolonu eşleşmeden kalmamalı (toplam)", () => {
        const kacaklar: string[] = [];
        for (const kind of kinds) {
            const tpl = EXCEL_IMPORT_TEMPLATES[kind];
            const map = FALLBACK_FIELD_MAP[KIND_ENTITY[kind]] ?? {};
            for (const col of tpl.columns) {
                if (map[normalizeColumnName(col.label)] !== col.field) {
                    kacaklar.push(`${kind}:"${col.label}"`);
                }
            }
        }
        expect(kacaklar).toEqual([]);
    });

    it("her şablonun ZORUNLU alanları eşleşmeli", () => {
        for (const kind of kinds) {
            const tpl = EXCEL_IMPORT_TEMPLATES[kind];
            const entity = KIND_ENTITY[kind];
            const map = FALLBACK_FIELD_MAP[entity] ?? {};
            const eslesen = new Set(
                tpl.columns.map(c => map[normalizeColumnName(c.label)]).filter(Boolean),
            );
            for (const col of tpl.columns.filter(c => c.required)) {
                expect(eslesen.has(col.field), `${kind}: zorunlu ${col.field} eşleşmiyor`).toBe(true);
            }
        }
    });
});

describe("tedarikçi-ürün ilişkisi şablonu — SKU olmadan hiçbir ürüne bağlanamaz", () => {
    // Bu şablonda `name`/`unit` kolonu YOK; import-service SKU eşleşen mevcut
    // ürün için erken çıkış yapıp tedarikçi bağını kurar (name/unit aranmaz).
    // O yolun ön koşulu SKU'nun eşleşmesi — kırılırsa şablon tamamen ölür.
    const tpl = EXCEL_IMPORT_TEMPLATES.vendor_product_relation;

    it('"Ürün SKU" başlığı sku alanına eşleşmeli', () => {
        expect(FALLBACK_FIELD_MAP.product[normalizeColumnName("Ürün SKU")]).toBe("sku");
    });

    it("tedarikçi bağı için gereken alanların hepsi eşleşmeli", () => {
        const bulunan = new Set(
            tpl.columns.map(c => FALLBACK_FIELD_MAP.product[normalizeColumnName(c.label)]),
        );
        for (const alan of ["sku", "vendor_name", "vendor_sku", "moq", "is_preferred", "notes"]) {
            expect(bulunan.has(alan), `${alan} eşleşmiyor`).toBe(true);
        }
    });

    it("ilişki notu ürünün kendi notundan ayrı kalmalı", () => {
        // Aynı başlık iki farklı alana gidemez; şablon etiketi bu yüzden
        // "Tedarikçi Notu". "Not" ürünün kendi notuna gider.
        expect(FALLBACK_FIELD_MAP.product[normalizeColumnName("Tedarikçi Notu")]).toBe("notes");
        expect(FALLBACK_FIELD_MAP.product[normalizeColumnName("Not")]).toBe("product_notes");
    });

    it("ilişki notu apply-mappings whitelist'inden geçmeli", () => {
        // `notes` IMPORT_FIELDS.product'ta yoksa apply-mappings sütunu sessizce
        // düşürür ve not hiçbir zaman yazılmaz (2026-08-29 kusuru).
        expect(IMPORT_FIELD_SET.product.has("notes")).toBe(true);
    });
});

describe("gerçek dünya dosyaları — müşteriden/tedarikçiden gelen biçimler", () => {
    /**
     * Bu senaryolar uydurma değil: PMT'nin fiilî iş akışında karşılaşılan
     * dosya biçimleri (muhasebeciden gelen "Sayfa1", tedarikçi fiyat listesi,
     * kısaltmalı cari listesi, teknik alanlı çok-tipli katalog).
     */
    interface Senaryo {
        sheet: string;
        basliklar: string[];
        beklenenTip: ClassicImportEntityType;
        /** Bu alanların eşleşmesi şart (aktarımın çalışması buna bağlı). */
        beklenenAlanlar: string[];
    }

    const senaryolar: Senaryo[] = [
        {
            sheet: "Sayfa1",
            basliklar: ["ÜRÜN KODU", "ÜRÜN ADI", "BİRİM", "ADET", "BİRİM FİYAT ($)", "TEDARİKÇİ"],
            beklenenTip: "product",
            beklenenAlanlar: ["sku", "name", "unit", "price", "vendor_name"],
        },
        {
            sheet: "FİYAT LİSTESİ 2026",
            basliklar: ["Stok Kodu", "Ürün Adı", "Br.", "Fiyat", "Döviz", "Tedarik Süresi (gün)"],
            beklenenTip: "product",
            beklenenAlanlar: ["sku", "name", "unit", "price", "currency", "lead_time_days"],
        },
        {
            sheet: "MÜŞTERİLER",
            basliklar: ["UNVAN", "V.D.", "VKN", "TELEFON", "E-Mail", "ADRES", "Vade"],
            beklenenTip: "customer",
            beklenenAlanlar: ["name", "tax_office", "tax_number", "phone", "email", "address", "payment_terms_days"],
        },
        {
            sheet: "Ürün Listesi",
            basliklar: ["Malzeme Kodu", "Malzeme Adı", "Birim", "Kategori", "Menşei"],
            beklenenTip: "product",
            beklenenAlanlar: ["sku", "name", "unit", "category", "origin_country"],
        },
        {
            sheet: "SAYIM",
            basliklar: ["Stok Kodu", "Sayılan", "Depo/Lokasyon"],
            beklenenTip: "stock",
            beklenenAlanlar: ["sku", "on_hand", "warehouse"],
        },
        {
            sheet: "Tedarikçi Listesi",
            basliklar: ["Firma Ünvanı", "İlgili Kişi", "GSM", "E-Mail", "Vade", "Vergi No"],
            beklenenTip: "vendor",
            beklenenAlanlar: ["name", "contact_person", "contact_phone", "contact_email", "payment_terms_days", "tax_number"],
        },
    ];

    for (const s of senaryolar) {
        describe(`[${s.sheet}]`, () => {
            it(`entity tipi ${s.beklenenTip} olarak tespit edilmeli`, () => {
                const d = detectSheetEntityType(s.sheet, s.basliklar);
                expect(d.entityType, `sebep: ${d.reason}`).toBe(s.beklenenTip);
            });

            it("aktarım için gereken alanlar eşleşmeli", () => {
                const map = FALLBACK_FIELD_MAP[s.beklenenTip] ?? {};
                const bulunan = new Set(
                    s.basliklar.map(h => map[normalizeColumnName(h)]).filter(Boolean),
                );
                for (const alan of s.beklenenAlanlar) {
                    expect(bulunan.has(alan), `"${alan}" eşleşmiyor`).toBe(true);
                }
            });

            it("zorunlu alanların hiçbiri eksik kalmamalı", () => {
                const map = FALLBACK_FIELD_MAP[s.beklenenTip] ?? {};
                const bulunan = new Set(
                    s.basliklar.map(h => map[normalizeColumnName(h)]).filter(Boolean),
                );
                const eksik = (REQUIRED_FIELDS[s.beklenenTip] ?? []).filter(f => !bulunan.has(f));
                expect(eksik).toEqual([]);
            });
        });
    }
});

describe("bilinçli eşleşmeyenler — yanlış eşleştirmek eşleştirmemekten kötü", () => {
    // Bunlar unutulmuş değil, kasıtlı. Biri "düzeltmek" isterse önce bu testi
    // silmesi gerekir — ve o an gerekçeyi okur.
    it('"Ölçü" ölçü birimine eşleşmemeli (vana kataloğunda DN/ebat demek)', () => {
        expect(FALLBACK_FIELD_MAP.product[normalizeColumnName("Ölçü")]).toBeUndefined();
    });

    it('"Açıklama" ürün adına eşleşmemeli (fiyat listesinde ad, ürün kartında not)', () => {
        expect(FALLBACK_FIELD_MAP.product[normalizeColumnName("Açıklama")]).toBeUndefined();
    });

    it("finansal alanlar alias'la gelse bile ayrı onay kapısında kalır", () => {
        // Alias eşleşmesi yazma yetkisi vermez — apply tarafı FINANCIAL_IMPORT_FIELDS
        // ile ayrı süzer. Burada yalnız eşleşmenin var olduğunu doğruluyoruz.
        expect(FALLBACK_FIELD_MAP.product[normalizeColumnName("Fiyat")]).toBe("price");
        expect(FALLBACK_FIELD_MAP.product[normalizeColumnName("Maliyet")]).toBe("cost_price");
    });
});

describe("alias eklemeleri tip tespitini bozmamalı", () => {
    // detectSheetEntityType aynı alias tablosunu skorlama için kullanıyor;
    // aşırı alias eklemek eşit skor → null (ambiguous) üretebilir.
    it("cari ve tedarikçi listeleri hâlâ ayırt edilebilmeli", () => {
        const cari = detectSheetEntityType("Liste", ["Unvan", "VKN", "Müşteri Kodu", "Vade"]);
        expect(cari.entityType).toBe("customer");

        const tedarikci = detectSheetEntityType("Liste", ["Unvan", "VKN", "Yetkili", "Tedarik Süresi (gün)"]);
        expect(tedarikci.entityType).toBe("vendor");
    });

    it("sinyal yoksa null dönmeli (uydurma tip üretmemeli)", () => {
        const d = detectSheetEntityType("Kapak", ["Hazırlayan", "Tarih", "Revizyon"]);
        expect(d.entityType).toBeNull();
    });
});

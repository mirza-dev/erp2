/**
 * Blok 2 — Ayarlar dürüstlük düzeltmeleri.
 *
 * Üç bulgu, ortak payda: ekranın gerçeği yanlış anlatması.
 *   5 · API Anahtarları paneli "tanımlı" ile "çalışıyor"u ayırmıyordu
 *   4 · Teknik anahtar rename'i: çelişkili iki uyarı + UI'ya yaslanan bütünlük
 *   7 · Teklif numara biçimi UI'sız, hatta GET bile döndürmüyordu
 *
 * Kaynak-kilidi iddiaları yorum-ayıklamalı (`code()`): bu kusurların hepsi
 * "kod vardı ama bağlı değildi" sınıfındaydı, korunması gereken şey BAĞ. Ayrıca
 * aynı turda öğrenilen ders (product-types-field-key-guard: yeşil test aslında
 * bir YORUMA eşleşiyormuş) burada baştan uygulanıyor.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Yorumları düşürür — iddia açıklamaya değil koda bakmalı. */
function code(src: string): string {
    // Satır yorumları ÖNCE ayıklanır: bir `//` yorumunun içindeki `/**`
    // (ör. "// /dashboard/** erişimi") aksi hâlde blok yorum başlangıcı
    // sanılıp sonraki `*/`e kadar GERÇEK KODU yutuyordu (2026-08).
    return src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const SETTINGS = code(read("src/app/dashboard/settings/page.tsx"));
const COMPANY_ROUTE = code(read("src/app/api/settings/company/route.ts"));
const TYPES_DB = code(read("src/lib/supabase/product-types.ts"));
const FIELD_ROUTE = code(read("src/app/api/product-types/[id]/fields/[fieldId]/route.ts"));

// ── Bulgu 5 — API anahtarı durumu ────────────────────────────────────────────

describe("Bulgu 5 — API Anahtarları paneli 'tanımlı' ile 'çalışıyor'u ayırır", () => {
    it("ApiTab canlı sağlık ucunu çağırır (/api/ai/health)", () => {
        expect(SETTINGS).toContain('fetch("/api/ai/health")');
        expect(SETTINGS).toMatch(/setAiHealth\(data as AiHealth\)/);
    });

    it("üç durum ayrı: ok / no_key / auth_failed", () => {
        expect(SETTINGS).toMatch(/reason === "ok".*tone: "ok"/s);
        expect(SETTINGS).toMatch(/reason === "no_key".*tone: "warning"/s);
        // auth_failed → danger + HTTP kodu + ne yapılacağı
        expect(SETTINGS).toMatch(/tone: "danger"/);
        expect(SETTINGS).toMatch(/Anahtar geçersiz/);
        expect(SETTINGS).toMatch(/ANTHROPIC_API_KEY yenilenmeli/);
    });

    it("'Yapılandırıldı' kalktı — varlık bilgisi artık 'Tanımlı' der", () => {
        // Eski etiket çalıştığını ima ediyordu; Paraşüt/Vercel için elimizde
        // yalnız varlık bilgisi var.
        expect(SETTINGS).not.toMatch(/Yapılandırıldı/);
        expect(SETTINGS).toMatch(/label: "Tanımlı"/);
    });

    it("sağlık yüklenmezse varlık bilgisine düşer (fail-soft)", () => {
        expect(SETTINGS).toMatch(/if \(id === "claude" && aiHealth\)/);
        expect(SETTINGS).toMatch(/if \(configured === null\) return \{ tone: "unknown", label: "—" \}/);
    });

    it("/api/settings/api-keys-status sözleşmesi DEĞİŞMEDİ (boolean-only kilidi korunur)", () => {
        const keysRoute = code(read("src/app/api/settings/api-keys-status/route.ts"));
        expect(keysRoute).toMatch(/parasut: !!process\.env\.PARASUT_CLIENT_SECRET/);
        expect(keysRoute).toMatch(/claude: !!process\.env\.ANTHROPIC_API_KEY/);
        // ai-service o route'a bağlanmadı → probe maliyeti/mock'u oraya sızmaz
        expect(keysRoute).not.toMatch(/ai-service|probeAIKey/);
    });
});

// ── Bulgu 4 — rename reddi ───────────────────────────────────────────────────

describe("Bulgu 4 — teknik anahtar rename'i sunucuda kapalı", () => {
    it("field_key değişimi fırlatır ve güvenli alternatifi söyler", () => {
        expect(TYPES_DB).toMatch(/Teknik anahtar değiştirilemez/);
        expect(TYPES_DB).toMatch(/pasifleştirip yeni anahtarla/);
    });

    it("guard, korunan rename gövdesinden ÖNCE gelir", () => {
        const guardAt = TYPES_DB.indexOf("Teknik anahtar değiştirilemez");
        const bodyAt = TYPES_DB.indexOf("affectedProducts");
        expect(guardAt).toBeGreaterThan(-1);
        expect(bodyAt).toBeGreaterThan(guardAt);
    });

    it("rename gövdesi SİLİNMEDİ — atomik RPC'ye taşınmak üzere duruyor", () => {
        // feedback_no_silent_deletes: kod silinmez, erişilemez hâle getirilir.
        expect(TYPES_DB).toMatch(/affectedProducts/);
        expect(TYPES_DB).toMatch(/Bu alan anahtarı bu tipte zaten var/);
    });

    it("route mesajı 400'e eşler (yoksa 500'e düşerdi)", () => {
        expect(FIELD_ROUTE).toMatch(/err\.message\.includes\("değiştirilemez"\)/);
    });
});

describe("Bulgu 4 — davranış: rename denemesi ürün verisine DOKUNMAZ", () => {
    const from = vi.fn();
    beforeEach(() => {
        vi.resetModules();
        from.mockReset();
    });

    /** Guard'a ulaşana kadarki iki okumayı karşılayan asgari Supabase mock'u. */
    function mockSupabase(existingKey: string) {
        vi.doMock("@/lib/supabase/service", () => ({
            createServiceClient: () => ({
                from: (table: string) => {
                    from(table);
                    if (table === "product_type_fields") {
                        const row = {
                            data: {
                                id: "f-1",
                                product_type_id: "t-1",
                                field_key: existingKey,
                                label_tr: "Basınç",
                                is_active: true,
                            },
                            error: null,
                        };
                        return {
                            select: () => ({
                                eq: () => ({
                                    single: async () => row,
                                    maybeSingle: async () => row,
                                }),
                            }),
                        };
                    }
                    // Guard'dan ÖNCE okunan parent tip (is_system kilidi için).
                    if (table === "product_types") {
                        return {
                            select: () => ({
                                eq: () => ({
                                    single: async () => ({ data: { id: "t-1", is_system: false }, error: null }),
                                }),
                            }),
                        };
                    }
                    throw new Error(`beklenmeyen tablo erişimi: ${table}`);
                },
            }),
        }));
    }

    it("farklı field_key gönderilirse fırlatır — products tablosuna hiç gidilmez", async () => {
        mockSupabase("basinc");
        const { dbUpdateProductTypeField } = await import("@/lib/supabase/product-types");
        await expect(
            dbUpdateProductTypeField("f-1", { field_key: "yeni_anahtar" }),
        ).rejects.toThrow(/değiştirilemez/);
        // Kısmi rename tehlikesinin kökü buydu: N ürün UPDATE'i.
        expect(from).not.toHaveBeenCalledWith("products");
    });

    it("aynı field_key gönderilirse guard tetiklenmez (edit modu bugünkü davranış)", async () => {
        mockSupabase("basinc");
        const { dbUpdateProductTypeField } = await import("@/lib/supabase/product-types");
        // Guard geçilir; sonrasında mock'lanmamış update yolunda patlar —
        // önemli olan hatanın "değiştirilemez" OLMAMASI.
        await expect(
            dbUpdateProductTypeField("f-1", { field_key: "basinc", label_tr: "Basınç" }),
        ).rejects.not.toThrow(/değiştirilemez/);
    });
});

// ── Bulgu 7 — teklif numara biçimi ───────────────────────────────────────────

describe("Bulgu 7 — teklif numara biçimi Ayarlar'dan yönetilir", () => {
    it("GET artık iki alanı döndürür (yoksa form değerleri yükleyemez)", () => {
        expect(COMPANY_ROUTE).toMatch(/"quote_number_prefix"/);
        expect(COMPANY_ROUTE).toMatch(/"quote_number_separator"/);
        const safeBlock = COMPANY_ROUTE.slice(
            COMPANY_ROUTE.indexOf("SAFE_COMPANY_FIELDS"),
            COMPANY_ROUTE.indexOf("] as const"),
        );
        expect(safeBlock).toContain("quote_number_prefix");
        expect(safeBlock).toContain("quote_number_separator");
    });

    it("doğrulama sunucuda otoriter — istemciyle birebir aynı kural", () => {
        expect(COMPANY_ROUTE).toMatch(/QUOTE_PREFIX_RE = \/\^\[A-Za-z0-9\]\{1,8\}\$\//);
        expect(COMPANY_ROUTE).toMatch(/QUOTE_SEPARATORS.*\["-", "\.", "_", "\/"\]/s);
        expect(SETTINGS).toMatch(/\/\^\[A-Za-z0-9\]\{1,8\}\$\/\.test\(form\.quoteNumberPrefix\.trim\(\)\)/);
        expect(SETTINGS).toMatch(/QUOTE_SEPARATOR_OPTIONS = \["-", "\.", "_", "\/"\]/);
    });

    it("form alanları etiketli ve kaydedilen paylaşta yer alır", () => {
        expect(SETTINGS).toMatch(/htmlFor="quote-number-prefix"/);
        expect(SETTINGS).toMatch(/htmlFor="quote-number-separator"/);
        expect(SETTINGS).toMatch(/quote_number_prefix: form\.quoteNumberPrefix\.trim\(\)/);
        expect(SETTINGS).toMatch(/quote_number_separator: form\.quoteNumberSeparator/);
    });

    it("mevcut numaraların değişmediği kullanıcıya söylenir", () => {
        expect(SETTINGS).toMatch(/mevcut numaralar değişmez/);
    });
});

describe("Bulgu 7 — önizleme next_quote_number() biçiminin aynası", () => {
    it("prefix + sep + YYYY + sep + 001", async () => {
        const { previewQuoteNumber } = await import("@/app/dashboard/settings/page");
        expect(previewQuoteNumber("TKL", "-", 2026)).toBe("TKL-2026-001");
        expect(previewQuoteNumber("OFR", "/", 2027)).toBe("OFR/2027/001");
        expect(previewQuoteNumber("A", ".", 2026)).toBe("A.2026.001");
    });

    it("boş değerlerde RPC'nin coalesce davranışını aynalar (TKL / -)", () => {
        // next_quote_number: coalesce(nullif(prefix,''),'TKL') + coalesce(nullif(sep,''),'-')
        expect(SETTINGS).toMatch(/prefix\.trim\(\) \|\| "TKL"/);
        expect(SETTINGS).toMatch(/separator \|\| "-"/);
    });
});

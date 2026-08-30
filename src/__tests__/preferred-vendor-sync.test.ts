/**
 * Tercihli tedarikçinin iki temsili senkron kalmalı.
 *
 * NEDEN VAR (2026-08-29 canlı bulgusu): tercihli tedarikçi iki yerde tutuluyor —
 *   `product_vendor_links.is_preferred`  → ilişki tablosu, GERÇEK kayıt
 *   `products.preferred_vendor_id`       → denormalize kopya, ÖNERİ BUNU OKUR
 *
 * `dbUpsertProductVendorLink` ikisini birlikte yazar. Ama seed alt tabloya
 * DOĞRUDAN insert ediyordu → senkronu atlıyordu. Canlıda sonuç: 6 üründe
 * `is_preferred=true` bağ var, `preferred_vendor_id` NULL.
 *
 * Bu kusurun sinsiliği: seed `preferred_vendor` METNİNİ yazıyordu, o yüzden
 * ürün kartında tedarikçi adı DOĞRU görünüyordu. Yalnız ID boştu — ve satın
 * alma önerisi ID'ye göre grupladığı için her kalem "tedarikçisiz" kovasına
 * düşüyordu. UI doğru, otomasyon kör.
 */
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";
import { SEED_VENDOR_LINKS, SEED_VENDORS } from "@/lib/seed/seed-data";

/** Yorumları düşürür — iddia açıklama metnine değil KODA bakmalı. */
function code(src: string): string {
    // Satır yorumları ÖNCE ayıklanır: bir `//` yorumunun içindeki `/**`
    // (ör. "// /dashboard/** erişimi") aksi hâlde blok yorum başlangıcı
    // sanılıp sonraki `*/`e kadar GERÇEK KODU yutuyordu (2026-08).
    return src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("seed — tercihli bağ products.preferred_vendor_id'yi de yazmalı", () => {
    it("vendor link insert'ünden sonra products senkronu var", async () => {
        const src = code(
            await readFile(join(process.cwd(), "src/lib/seed/seed-runner.ts"), "utf-8"),
        );
        const linkInsert = src.indexOf('from("product_vendor_links").insert');
        expect(linkInsert, "vendor link insert bulunamadı").toBeGreaterThan(-1);

        const after = src.slice(linkInsert);
        // Senkron insert'ten SONRA gelmeli — vendorMap ve ürün id'leri o noktada hazır.
        expect(after).toMatch(/preferred_vendor_id/);
        expect(after).toMatch(/SEED_VENDOR_LINKS\.filter\([^)]*preferred/);
    });

    it("tedarikçi çözülemezse seed PATLAR (sessizce atlamaz)", async () => {
        const src = code(
            await readFile(join(process.cwd(), "src/lib/seed/seed-runner.ts"), "utf-8"),
        );
        // Sessiz atlama bu kusurun ta kendisiydi; bir daha sessiz kalmamalı.
        expect(src).toMatch(/Tercihli tedarikçi çözülemedi/);
        expect(src).toMatch(/Tercihli tedarikçi senkronu/);
    });
});

describe("seed verisi — tercihli bağların tutarlılığı", () => {
    it("her tercihli bağın tedarikçisi SEED_VENDORS'ta var", () => {
        const adlar = new Set(SEED_VENDORS.map(v => v.name));
        for (const l of SEED_VENDOR_LINKS.filter(x => x.preferred)) {
            expect(adlar.has(l.vendor), `${l.sku} → "${l.vendor}" tedarikçisi seed'de yok`).toBe(true);
        }
    });

    it("bir üründe en fazla BİR tercihli bağ olmalı", () => {
        // Birden çok tercihli → hangisinin products'a yazılacağı belirsiz;
        // onarım aracı da bu durumda bilinçli olarak ATLAR.
        const sayac = new Map<string, number>();
        for (const l of SEED_VENDOR_LINKS.filter(x => x.preferred)) {
            sayac.set(l.sku, (sayac.get(l.sku) ?? 0) + 1);
        }
        const cakisan = [...sayac.entries()].filter(([, n]) => n > 1);
        expect(cakisan).toEqual([]);
    });

    it("en az bir ürünün tercihli tedarikçisi var (öneri gruplaması denenebilsin)", () => {
        expect(SEED_VENDOR_LINKS.filter(l => l.preferred).length).toBeGreaterThan(0);
    });
});

describe("onarım araçları — yön ve güvenlik", () => {
    it("tercihli tedarikçi onarımı TEK YÖNLÜ: bağ tablosu → products", async () => {
        const src = code(
            await readFile(join(process.cwd(), "scripts/repair-preferred-vendor.ts"), "utf-8"),
        );
        // Kaynak ilişki tablosu; products'a YAZAR. Tersi olursa gerçek kayıt bozulur.
        expect(src).toMatch(/from\("product_vendor_links"\)[\s\S]*?\.eq\("is_preferred", true\)/);
        expect(src).toMatch(/from\("products"\)[\s\S]*?\.update\(/);
        expect(src).not.toMatch(/from\("product_vendor_links"\)[\s\S]{0,200}\.update\(/);
    });

    it("varsayılan KURU ÇALIŞMA — --uygula olmadan yazmaz", async () => {
        for (const f of ["scripts/repair-preferred-vendor.ts", "scripts/repair-orphan-commitments.ts"]) {
            const src = code(await readFile(join(process.cwd(), f), "utf-8"));
            expect(src, `${f}: --uygula bayrağı yok`).toMatch(/argv\.includes\("--uygula"\)/);
            expect(src, `${f}: kuru çalışma erken dönüşü yok`).toMatch(/if \(!UYGULA\)/);
        }
    });

    it("yetim taahhüt onarımı belirsizlikte ATLAR (yanlış satıra bağlamaz)", async () => {
        const src = code(
            await readFile(join(process.cwd(), "scripts/repair-orphan-commitments.ts"), "utf-8"),
        );
        // Yanlış PO satırına bağlamak, bağlamamaktan kötü: mal kabul yanlış
        // taahhüdü kapatır ve kimse fark etmez.
        expect(src).toMatch(/adaylar\.length > 1/);
        expect(src).toMatch(/belirsiz/);
    });

    it("yetim onarımı yarış korumalı (bu arada bağlandıysa dokunmaz)", async () => {
        const src = code(
            await readFile(join(process.cwd(), "scripts/repair-orphan-commitments.ts"), "utf-8"),
        );
        expect(src).toMatch(/\.is\("po_line_id", null\)/);
    });
});

describe("zincir denetçisi — ayrışmayı yakalamalı", () => {
    it("check:chains 5. zincir tercihli tedarikçi senkronunu kontrol ediyor", async () => {
        const src = code(
            await readFile(join(process.cwd(), "scripts/check-chain-integrity.ts"), "utf-8"),
        );
        expect(src).toMatch(/is_preferred/);
        expect(src).toMatch(/preferred_vendor_id/);
        // Kopukluk halinde onarım yolunu söylemeli — kullanıcı ne yapacağını bilsin.
        expect(src).toMatch(/repair-preferred-vendor/);
    });
});

/**
 * Blok 1 — Ayarlar / Teknik Şablonlar / Not Şablonları kritik kusur kilitleri.
 *
 * Dört bulgu, dört sözleşme:
 *   8 · Tehlikeli Bölge yazılı onay ister (UI + SUNUCU)
 *   2 · Teknik Şablonlar UI'ı yetkiye göre kilitlenir; sayfa izni `view_product_types`
 *   1 · Pasif not şablonu geri getirilebilir (soft-delete gerçekten soft)
 *   3 · Şablonsuz ürün sayısı görünür (stats'ın kör noktası)
 *
 * Çoğu iddia kaynak-kilidi: bu kusurların hepsi "kod vardı ama bağlı değildi"
 * sınıfındaydı, o yüzden asıl korunması gereken şey BAĞIN kendisi.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { requiredPermissionForPath, canAccessPath } from "@/lib/auth/page-access";
import { ROLE_PERMISSIONS, permissionsForRoles } from "@/lib/auth/permissions";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Yorumları düşürür — iddia açıklamaya değil koda bakmalı. */
function code(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const SEED_ROUTE = code(read("src/app/api/seed/route.ts"));
const RESET_UI = code(read("src/components/settings/ResetDemoSection.tsx"));
const TYPES_LIST = code(read("src/app/dashboard/settings/product-types/page.tsx"));
const TYPES_DETAIL = code(read("src/app/dashboard/settings/product-types/[id]/page.tsx"));
const NOTE_TAB = code(read("src/components/settings/NoteTemplatesTab.tsx"));
const NOTE_ROUTE = code(read("src/app/api/note-templates/route.ts"));
const NOTE_ID_ROUTE = code(read("src/app/api/note-templates/[id]/route.ts"));
const NOTE_DB = code(read("src/lib/supabase/note-templates.ts"));
const COVERAGE_ROUTE = code(read("src/app/api/product-types/coverage/route.ts"));
const TYPES_DB = code(read("src/lib/supabase/product-types.ts"));

// ── Bulgu 8 — Tehlikeli Bölge yazılı onay ────────────────────────────────────

describe("Bulgu 8 — /api/seed yazılı onay ister (oturum yolunda)", () => {
    it("oturum ile cron ayrı ele alınır — cron sırrı zaten kanıt", () => {
        expect(SEED_ROUTE).toMatch(/type AuthKind = "cron" \| "session" \| null/);
        expect(SEED_ROUTE).toMatch(/return "cron"/);
        expect(SEED_ROUTE).toMatch(/\? "session" : null/);
    });

    it("POST ve DELETE oturum yolunda onay guard'ından geçer", () => {
        const guard = /if \(kind === "session"\) \{\s*const blocked = await requireWrittenConfirmation\(request\);\s*if \(blocked\) return blocked;\s*\}/g;
        expect(SEED_ROUTE.match(guard)?.length).toBe(2);
    });

    it("onay firma adıyla BİREBİR karşılaştırılır ve firma adı okunamazsa fail-closed", () => {
        expect(SEED_ROUTE).toContain("dbGetCompanySettings");
        expect(SEED_ROUTE).toMatch(/if \(!expected\) \{/);
        expect(SEED_ROUTE).toMatch(/status: 503/);
        expect(SEED_ROUTE).toMatch(/if \(typed !== expected\)/);
        expect(SEED_ROUTE).toMatch(/status: 400/);
    });

    it("UI onayı sunucuya gönderir — kozmetik değil", () => {
        expect(RESET_UI).toMatch(/body: JSON\.stringify\(\{ confirm: typed\.trim\(\) \}\)/);
        // Firma adı okunamadıysa buton açılmaz (sunucudaki 503 ile aynı yön).
        expect(RESET_UI).toMatch(/companyName !== null && companyName\.length > 0 && typed\.trim\(\) === companyName/);
        expect(RESET_UI).toMatch(/disabled=\{busy \|\| !confirmed\}/);
    });

    it("onay modalının a11y kimliği korunur (Blok 4'te ortak Modal'a taşındı)", () => {
        // Çerçeve attribute'ları artık `ui/Modal`'da; burada BAĞ doğrulanır.
        expect(RESET_UI).toMatch(/labelledBy="reset-demo-confirm-title"/);
        expect(RESET_UI).toMatch(/id="reset-demo-confirm-title"/);
        // Onay girişi etiketli
        expect(RESET_UI).toMatch(/htmlFor="reset-demo-confirm-input"/);
        expect(RESET_UI).toMatch(/id="reset-demo-confirm-input"/);
    });
});

// ── Bulgu 2 — Teknik Şablonlar yetkisi ───────────────────────────────────────

describe("Bulgu 2 — Teknik Şablonlar: gören = yapabilen", () => {
    it("sayfa izni artık view_product_types (ölü izin canlandı)", () => {
        expect(requiredPermissionForPath("/dashboard/settings/product-types")).toBe("view_product_types");
        expect(requiredPermissionForPath("/dashboard/settings/product-types/abc")).toBe("view_product_types");
    });

    it("sayfayı görebilen her rol onu yönetebiliyor da", () => {
        for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
            const set = new Set(perms);
            if (!set.has("view_product_types")) continue;
            const canManage = set.has("manage_product_types") || set.has("manage_product_master");
            expect(canManage, `${role} şablonu görüyor ama yönetemiyor`).toBe(true);
        }
    });

    it("satış / üretim / viewer sayfayı artık göremez (her butonu 403 yiyorlardı)", () => {
        for (const role of ["sales", "production", "viewer"] as const) {
            expect(
                canAccessPath("/dashboard/settings/product-types", permissionsForRoles([role])),
                `${role} hâlâ erişebiliyor`,
            ).toBe(false);
        }
        expect(canAccessPath("/dashboard/settings/product-types", permissionsForRoles(["purchasing"]))).toBe(true);
    });

    it("her iki sayfa da izni sunucu guard'ıyla BİREBİR aynı çiftten türetir", () => {
        for (const src of [TYPES_LIST, TYPES_DETAIL]) {
            expect(src).toContain('has("manage_product_types") || has("manage_product_master")');
            expect(src).toMatch(/const blocked = isDemo \|\| !canManage;/);
        }
    });

    it("mutasyon butonları artık yalnız isDemo'ya değil blocked'a bakar", () => {
        // Liste: tek mutasyon butonu (Yeni Şablon)
        expect(TYPES_LIST).toMatch(/onClick=\{openCreate\}\s*\n\s*disabled=\{blocked\}/);
        // Detay: hiçbir disabled prop'u çıplak isDemo taşımamalı
        expect(TYPES_DETAIL).not.toMatch(/disabled=\{isDemo\}/);
        expect(TYPES_DETAIL.match(/disabled=\{blocked\}|\|\| blocked\}/g)?.length).toBeGreaterThanOrEqual(6);
    });

    it("handler'lar da kapalı — buton disabled'ı tek savunma değil", () => {
        // Detayda 7 demo guard'ının hepsine yetki guard'ı eşlik eder
        const demoGuards = TYPES_DETAIL.match(/message: DEMO_BLOCK_TOAST/g)?.length ?? 0;
        const permGuards = TYPES_DETAIL.match(/message: NO_MANAGE_TOOLTIP/g)?.length ?? 0;
        expect(demoGuards).toBeGreaterThan(0);
        expect(permGuards).toBe(demoGuards);
        expect(TYPES_LIST).toContain("message: NO_MANAGE_TOOLTIP");
    });
});

// ── Bulgu 1 — Pasif not şablonu geri getirilebilir ───────────────────────────

describe("Bulgu 1 — not şablonu soft-delete'i gerçekten geri alınabilir", () => {
    it("GET includeInactive parametresini sunucuya geçirir (eskiden yutuluyordu)", () => {
        expect(NOTE_ROUTE).toMatch(/const includeInactive = searchParams\.get\("includeInactive"\) === "1"/);
        expect(NOTE_ROUTE).toMatch(/dbListNoteTemplates\(\{ kind, includeInactive \}\)/);
    });

    it("varsayılan hâlâ yalnız aktif — QuoteForm picker'ına pasif şablon sızmaz", () => {
        expect(NOTE_DB).toMatch(/if \(!opts\.includeInactive\) query = query\.eq\("is_active", true\)/);
        // Picker parametresiz çağırır
        const quoteForm = code(read("src/app/dashboard/quotes/_components/QuoteForm.tsx"));
        expect(quoteForm).toContain('fetch("/api/note-templates")');
    });

    it("PATCH is_active kabul eder ve DB katmanı yazar", () => {
        expect(NOTE_ID_ROUTE).toMatch(/is_active: typeof body\.is_active === "boolean" \? body\.is_active : undefined/);
        expect(NOTE_DB).toMatch(/if \(patch\.is_active !== undefined\) updatePayload\.is_active = patch\.is_active/);
        expect(NOTE_DB).toMatch(/is_active\?: boolean/);
    });

    it("hard delete hâlâ YOK — geri alma yolu silme yolunu açmadı", () => {
        expect(NOTE_DB).not.toMatch(/\.delete\(\)/);
        expect(NOTE_ID_ROUTE).toContain("dbDeactivateNoteTemplate");
    });

    it("UI'da pasifleri göster + aktifleştir var", () => {
        expect(NOTE_TAB).toMatch(/showInactive \? "\?includeInactive=1" : ""/);
        expect(NOTE_TAB).toMatch(/aria-pressed=\{showInactive\}/);
        expect(NOTE_TAB).toMatch(/JSON\.stringify\(\{ is_active: true \}\)/);
        expect(NOTE_TAB).toMatch(/Aktifleştir/);
        // Pasif satır soluk + rozetli
        expect(NOTE_TAB).toMatch(/t\.isActive \? rowStyle : \{ \.\.\.rowStyle, opacity: 0\.55 \}/);
    });
});

// ── Bulgu 3 — Şablonsuz ürün metriği ─────────────────────────────────────────

describe("Bulgu 3 — şablonsuz ürünler artık görünür", () => {
    it("stats hesabı şablonsuz ürünü hâlâ atlıyor — kör nokta gerçek", () => {
        // Bu satır KALMALI (per-type sayım doğru); kör noktayı ayrı uç kapatır.
        expect(TYPES_DB).toMatch(/if \(!typeId\) continue;/);
    });

    it("coverage helper aktif ürünleri head+count ile sayar, satır taşımaz", () => {
        expect(TYPES_DB).toContain("export async function dbGetProductTypeCoverage");
        expect(TYPES_DB).toMatch(/count: "exact", head: true/);
        expect(TYPES_DB).toMatch(/\.is\("product_type_id", null\)/);
        expect(TYPES_DB).toMatch(/\.eq\("is_active", true\)/);
    });

    it("coverage ucu sayfayla aynı izinle korunur", () => {
        expect(COVERAGE_ROUTE).toMatch(/requirePermission\(req, "view_product_types"\)/);
    });

    it("liste sayfası 5. metriği çizer ve /api/product-types dizi sözleşmesi bozulmadı", () => {
        expect(TYPES_LIST).toContain('fetch("/api/product-types/coverage"');
        expect(TYPES_LIST).toMatch(/label="Şablonsuz Ürün"/);
        expect(TYPES_LIST).toMatch(/repeat\(5, minmax\(0, 1fr\)\)/);
        const listRoute = code(read("src/app/api/product-types/route.ts"));
        expect(listRoute).toMatch(/return NextResponse\.json\(types\)/);
    });
});

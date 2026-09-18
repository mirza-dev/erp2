/**
 * Landing anlatısının kilitleri (2026-09-19 yeniden kurgu).
 *
 * Vitrin İKİ dosyanın bileşimi: yerleşim `src/app/page.tsx`, metin
 * `src/lib/marketing/landing-content.ts`. Metin iddiaları ikisini birlikte
 * okur — bir cümle hangisine yazılırsa yazılsın kurala tabi olmalı.
 *
 * Yorumlar SOYULUR: kuralların gerekçesi yorumlarda yasak kelimeleri
 * anıyor ("asla otomatik akış vaadi"); soyulmazsa kural kendi açıklamasına
 * takılırdı (depoda bu tuzağın sekiz tekrarı var).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { containsForbiddenName, FORBIDDEN_REAL_NAMES } from "@/lib/marketing/forbidden-names";
import { proof, hero, featuresBig, reservationShot } from "@/lib/marketing/landing-content";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function stripComments(src: string): string {
    return src
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

const PAGE = stripComments(read("src/app/page.tsx"));
const CONTENT = stripComments(read("src/lib/marketing/landing-content.ts"));
const VITRIN = `${PAGE}\n${CONTENT}`;
const SHOT_SCRIPT = read("scripts/build-product-shots.ts");

/** Vitrindeki düz metin cümleleri (dize değişmezlerinin içinden). */
function sentences(src: string): string[] {
    const literals = [...src.matchAll(/"([^"\n]{12,})"/g)].map((m) => m[1]);
    const jsxText = [...src.matchAll(/>([^<>{}\n][^<>{}]{12,})</g)].map((m) => m[1]);
    // Parçalar AYRI bölünür: bir başlık ile üstündeki etiketi birleştirmek,
    // ikisinden birinde olmayan bir "cümle" uydururdu.
    return [...literals, ...jsxText]
        .flatMap((part) => part.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/))
        .map((s) => s.trim())
        .filter(Boolean);
}

describe("landing — anlatı bütünlüğü", () => {
    it("bölümler planlanan sırada: vaka → vurucu an → özellikler → … → iletişim", () => {
        const ids = [...PAGE.matchAll(/<section id="([a-z]+)"/g)].map((m) => m[1]);
        expect(ids).toEqual([
            "referans",
            "rezervasyon",
            "ozellikler",
            "yapayzeka",
            "nasil",
            "kimler",
            "excel",
            "neden",
            "fiyat",
            "sinirlar",
            "sss",
            "iletisim",
        ]);
    });

    it("hero başlığı ürünün tekil mekanizmasını söyler — rezervasyon teklifte", () => {
        expect(`${hero.titleLead} ${hero.titleAccent}`.replace(/ /g, " ")).toBe(
            "Teklifi gönderdiğin an, stok ayrılır.",
        );
    });
});

describe("landing — vaat ≤ canlı (marka rehberi §1.5)", () => {
    it('Paraşüt geçen hiçbir cümle "otomatik" ya da "kendiliğinden" demez', () => {
        const bad = sentences(VITRIN).filter(
            (s) => /Paraşüt/.test(s) && /otomatik|kendiliğinden/i.test(s),
        );
        expect(bad).toEqual([]);
    });

    it('yapay zekanın belge okuma/bulgu vaadi "anahtar" koşulu olmadan kurulmaz', () => {
        const bad = sentences(VITRIN).filter(
            (s) =>
                /yapay zeka/i.test(s) &&
                /\b(okur|çıkarır|bulgu)/i.test(s) &&
                !/anahtar/i.test(s),
        );
        expect(bad).toEqual([]);
    });

    it("rezervasyon anı teklif GÖNDERİLDİĞİNDE — kabulde değil (mig.088)", () => {
        // Eski özellik metni "kabul edilince … rezervasyonu otomatik oluşur"
        // diyordu; 088'den beri rezervasyon gönderimde. Geri dönmesin.
        expect(VITRIN).not.toMatch(/[Kk]abul edilince[^.]*rezervasyon/);
    });
});

describe("landing — rakip ve gerçek firma adı", () => {
    it("rakip ERP firma adı geçmez — asıl rakip Excel, firma değil", () => {
        expect(VITRIN).not.toMatch(/Netsis|Wolvox|\bMikro\b|Logo (Tiger|Yazılım|Go|İşbaşı)|\bNebim\b/);
    });

    it("gerçek firma adı ne sayfa metninde ne görsel dosya adlarında geçer", () => {
        expect(containsForbiddenName(VITRIN)).toBe(false);
        const shots = readdirSync(join(root, "public/shots"));
        expect(shots.filter(containsForbiddenName)).toEqual([]);
        // Liste boş kalamaz — boş liste her şeyi "temiz" sayar.
        expect(FORBIDDEN_REAL_NAMES.length).toBeGreaterThan(5);
    });
});

describe("landing — eylem hiyerarşisi ve görseller", () => {
    it("birincil eylem görüşme: #iletisim bağlantısı demo bağlantısından fazla", () => {
        const talk = PAGE.match(/href="#iletisim"/g)?.length ?? 0;
        const demo = PAGE.match(/href="\/api\/auth\/demo"/g)?.length ?? 0;
        expect(demo).toBeGreaterThan(0); // demo kaldırılmadı, ikincil
        expect(talk).toBeGreaterThan(demo);
    });

    it("başvurulan her /shots/*.png diskte var", () => {
        const refs = new Set(
            [...VITRIN.matchAll(/"\/shots\/([a-z0-9-]+\.png)"/g)].map((m) => m[1]),
        );
        expect(refs.size).toBeGreaterThanOrEqual(4);
        for (const f of refs) expect(existsSync(join(root, "public/shots", f)), f).toBe(true);
        // Sayfa gerçekten kullanıyor mu (veri modülünde yazılı olmak yetmez)
        expect(PAGE).toMatch(/hero\.shot\.src/);
        expect(PAGE).toMatch(/reservationShot\.src/);
        expect(featuresBig.every((f) => f.shot.src.startsWith("/shots/"))).toBe(true);
        expect(reservationShot.src).toBe("/shots/stok.png");
    });

    it("her görselin alt metni var ve boyutu önceden ayrılıyor (zıplama yok)", () => {
        expect(PAGE).toMatch(/<img[\s\S]*?alt=\{alt\}[\s\S]*?width=\{1440\}[\s\S]*?height=\{900\}/);
    });
});

describe("landing — vaka bloğu kapısı", () => {
    it("proof.named false iken firma adı ve rakam taşınmaz", () => {
        if (!proof.named) {
            expect(proof.company).toBeNull();
            expect(proof.stats).toEqual([]);
        }
    });

    it("sayfa firma adını YALNIZ named kapısının arkasında basar", () => {
        const uses = [...PAGE.matchAll(/proof\.company/g)].length;
        const gated = [...PAGE.matchAll(/proof\.named && proof\.company/g)].length;
        expect(uses).toBeGreaterThan(0);
        // Her `proof.company` okuması kapı ifadesinin içinde olmalı: kapının
        // kendisi 1 okuma, gövdedeki basım 1 okuma.
        expect(uses).toBe(gated * 2);
        expect(PAGE).toMatch(/proof\.named && proof\.stats\.length > 0 \? proof\.stats : productFacts/);
    });
});

describe("çekim scripti — yayın kapıları", () => {
    it("yalnız loopback Supabase'e yazar; ALLOW_PROD_TARGET okunmaz", () => {
        expect(SHOT_SCRIPT).toMatch(
            /function isLocalSupabase[\s\S]{0,120}127\\\.0\\\.0\\\.1\|localhost\|\\\[::1\\\]/,
        );
        expect(SHOT_SCRIPT).toMatch(/if \(!isLocalSupabase\(SUPABASE_URL\)\)/);
        expect(SHOT_SCRIPT).not.toMatch(/process\.env\.ALLOW_PROD_TARGET/);
    });

    it("ekranda GÖRÜNEN metni tarar ve bulursa görseli yazmadan durur", () => {
        const gate = SHOT_SCRIPT.indexOf("containsForbiddenName(visible)");
        const shot = SHOT_SCRIPT.indexOf("page.screenshot(");
        expect(gate).toBeGreaterThan(0);
        expect(shot).toBeGreaterThan(gate);
        expect(SHOT_SCRIPT).toMatch(/document\.body\.innerText/);
    });
});

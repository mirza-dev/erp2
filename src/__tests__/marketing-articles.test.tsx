/**
 * Rehber yazıları — içerik bütünlüğü, işaretleme sınırı ve SEO bağlantıları.
 *
 * En önemli kural §"işaretleme sınırı": içerik dosyası bir VERİ dosyasıdır,
 * şablon değil. Oraya yazılan bir dize HTML üretebiliyorsa, "içerik" ile "kod"
 * arasındaki sınır kalkar ve yarın bir yazıya yapıştırılan metin sayfayı
 * bozabilir. `ArticleBody` bu yüzden `dangerouslySetInnerHTML` kullanmaz.
 */
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ArticleBody from "@/components/marketing/ArticleBody";
import { ARTICLES, getArticle } from "@/lib/marketing/articles";
import sitemap from "@/app/sitemap";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** Bir yazının bütün metinlerini tek listede toplar. */
function allText(): string[] {
    const out: string[] = [];
    for (const a of ARTICLES) {
        out.push(a.title, a.description, a.teaser);
        for (const s of a.sections) {
            out.push(s.h);
            for (const b of s.blocks) {
                if (b.t === "table") out.push(...b.head, ...b.rows.flat());
                else if (Array.isArray(b.v)) out.push(...b.v);
                else out.push(b.v);
            }
        }
    }
    return out;
}

describe("içerik bütünlüğü", () => {
    it("en az üç yazı var ve slug'lar tekil", () => {
        expect(ARTICLES.length).toBeGreaterThanOrEqual(3);
        expect(new Set(ARTICLES.map((a) => a.slug)).size).toBe(ARTICLES.length);
    });

    it.each(ARTICLES.map((a) => [a.slug, a] as const))("%s — alanları dolu", (_slug, a) => {
        expect(a.title.length).toBeGreaterThan(20);
        expect(a.sections.length).toBeGreaterThanOrEqual(4);
        expect(a.minutes).toBeGreaterThan(0);
        // Her bölümün en az bir bloğu olmalı — boş başlık SEO'da "ince içerik".
        for (const s of a.sections) expect(s.blocks.length).toBeGreaterThan(0);
    });

    it.each(ARTICLES.map((a) => [a.slug, a.description] as const))(
        "%s — açıklama arama sonucuna sığar",
        (_slug, d) => {
            // Google ~155 karakterde kesiyor; 120'nin altı da fırsat kaybı.
            expect(d.length).toBeGreaterThan(90);
            expect(d.length).toBeLessThanOrEqual(175);
        },
    );

    it("slug arama çalışır, bilinmeyen slug undefined döner", () => {
        expect(getArticle(ARTICLES[0].slug)?.title).toBe(ARTICLES[0].title);
        expect(getArticle("olmayan-yazi")).toBeUndefined();
    });
});

describe("işaretleme sınırı — içerik kod üretemez", () => {
    it("hiçbir metin HTML etiketi içermez", () => {
        const withTags = allText().filter((t) => /<\/?[a-zA-Z][^>]*>/.test(t));
        expect(
            withTags,
            "İçerik dosyasına HTML etiketi yazılmış. Vurgu için ** kullanın; " +
                "etiket gerekiyorsa Block birliğine yeni bir tip ekleyin.",
        ).toEqual([]);
    });

    it("render eden bileşen ham HTML basmaz", () => {
        const src = read("src/components/marketing/ArticleBody.tsx");
        expect(src).not.toContain("dangerouslySetInnerHTML");
    });

    it("`**vurgu**` <strong> elemanına çevrilir, yıldızlar ekranda kalmaz", () => {
        render(
            <ArticleBody
                sections={[{ h: "Başlık", blocks: [{ t: "p", v: "önce **vurgu** sonra" }] }]}
            />,
        );
        const strong = screen.getByText("vurgu");
        expect(strong.tagName).toBe("STRONG");
        expect(document.body.textContent).not.toContain("**");
    });

    it("metindeki HTML benzeri dize METİN olarak basılır, eleman olarak değil", () => {
        const { container } = render(
            <ArticleBody
                sections={[{ h: "B", blocks: [{ t: "p", v: "<script>alert(1)</script>" }] }]}
            />,
        );
        expect(container.querySelector("script")).toBeNull();
        expect(container.textContent).toContain("<script>alert(1)</script>");
    });

    it("her blok tipi render edilir", () => {
        const { container } = render(
            <ArticleBody
                sections={[
                    {
                        h: "Hepsi",
                        blocks: [
                            { t: "p", v: "paragraf" },
                            { t: "ul", v: ["a", "b"] },
                            { t: "ol", v: ["c"] },
                            { t: "note", v: "not" },
                            { t: "table", head: ["K1"], rows: [["v1"]] },
                        ],
                    },
                ]}
            />,
        );
        expect(container.querySelector("h2")?.textContent).toBe("Hepsi");
        expect(container.querySelectorAll(".rv-art-ul li")).toHaveLength(2);
        expect(container.querySelectorAll(".rv-art-ol li")).toHaveLength(1);
        expect(container.querySelector(".rv-art-note")?.textContent).toBe("not");
        expect(container.querySelector("th")?.textContent).toBe("K1");
        expect(container.querySelector("td")?.textContent).toBe("v1");
    });
});

describe("SEO bağlantıları", () => {
    it("site haritası her yazıyı içerir ve yazının kendi tarihini kullanır", () => {
        const urls = sitemap();
        for (const a of ARTICLES) {
            const entry = urls.find((u) => u.url.endsWith(`/rehber/${a.slug}`));
            expect(entry, `${a.slug} site haritasında yok`).toBeTruthy();
            // Build tarihi DEĞİL yazının `updated` tarihi — aksi hâlde her deploy
            // tüm yazıları "güncellendi" diye bildirir ve sinyal değersizleşir.
            expect((entry!.lastModified as Date).toISOString().slice(0, 10)).toBe(a.updated);
        }
        expect(urls.some((u) => u.url.endsWith("/rehber"))).toBe(true);
    });

    it("`/rehber` oturum kapısının DIŞINDA — yoksa crawler /login'e düşer", () => {
        expect(read("src/proxy.ts")).toMatch(/ALWAYS_PUBLIC\s*=\s*\[[^\]]*"\/rehber"/s);
    });

    it("robots.txt rehberi engellemiyor", () => {
        const src = read("src/app/robots.ts");
        expect(src).not.toMatch(/disallow[\s\S]{0,120}rehber/i);
    });

    it("yazı sayfası Article yapılandırılmış verisi basar", () => {
        const src = read("src/app/rehber/[slug]/page.tsx");
        expect(src).toContain('"@type": "Article"');
        expect(src).toContain("datePublished");
        // `<` kaçırılmazsa metindeki bir `</script>` etiketi erken kapatır.
        expect(src).toMatch(/replace\(\/<\/g, "\\\\u003c"\)/);
    });

    it("her yazı sayfası kanonik adres bildirir", () => {
        expect(read("src/app/rehber/[slug]/page.tsx")).toContain("alternates: { canonical:");
        expect(read("src/app/rehber/page.tsx")).toContain('alternates: { canonical: "/rehber" }');
    });
});

describe("pazarlama kabuğu tek stil kaynağından beslenir", () => {
    it("açılış sayfası ve rehber aynı CSS modülünü kullanır", () => {
        expect(read("src/app/page.tsx")).toContain("MARKETING_CSS");
        expect(read("src/components/marketing/MarketingShell.tsx")).toContain("MARKETING_CSS");
    });

    it("token bloğu ikinci kez YAZILMAZ — ayrışmayı yapısal olarak engeller", () => {
        // `--accent:#58a6ff` yalnız ortak modülde geçmeli; kopyalanırsa iki yüzey
        // zamanla farklı maviye kayar ve kimse fark etmez.
        const copies = [
            "src/app/page.tsx",
            "src/lib/marketing/article-css.ts",
            "src/components/marketing/MarketingShell.tsx",
        ].filter((f) => read(f).includes("--accent:#58a6ff"));
        expect(copies).toEqual([]);
        expect(read("src/lib/marketing/marketing-css.ts")).toContain("--accent:#58a6ff");
    });

    it("rehber gezinmesi açılış bölümlerine MUTLAK yolla gider", () => {
        const src = read("src/components/marketing/MarketingShell.tsx");
        // `#fiyat` rehber sayfasında hiçbir yere denk gelmez — sessizce ölü bağlantı.
        expect(src).toContain('href="/#fiyat"');
        expect(src).not.toMatch(/href="#[a-z]/);
    });
});

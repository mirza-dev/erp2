import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import MarketingShell from "@/components/marketing/MarketingShell";
import ArticleBody from "@/components/marketing/ArticleBody";
import { ARTICLES, getArticle } from "@/lib/marketing/articles";
import { SITE_URL } from "@/lib/marketing/site";

/** Yazılar statik veri — build'de önceden üretilir, çalışma zamanı maliyeti yok. */
export function generateStaticParams() {
    return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const a = getArticle(slug);
    if (!a) return { title: "Bulunamadı — Roven" };
    return {
        title: `${a.title} | Roven`,
        description: a.description,
        alternates: { canonical: `/rehber/${a.slug}` },
        openGraph: {
            type: "article",
            title: a.title,
            description: a.description,
            publishedTime: a.published,
            modifiedTime: a.updated,
        },
    };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const article = getArticle(slug);
    if (!article) notFound();

    const others = ARTICLES.filter((a) => a.slug !== article.slug);

    // Article yapılandırılmış verisi — yazının kendi alanlarından türetilir.
    // `<` kaçırılır: bir metin `</script>` içerse etiketi erken kapatırdı.
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: article.title,
        description: article.description,
        datePublished: article.published,
        dateModified: article.updated,
        inLanguage: "tr-TR",
        mainEntityOfPage: `${SITE_URL}/rehber/${article.slug}`,
        author: { "@type": "Organization", name: "Roven", url: SITE_URL },
        publisher: {
            "@type": "Organization",
            name: "Roven",
            logo: { "@type": "ImageObject", url: `${SITE_URL}/icons/icon-512.png` },
        },
    };

    return (
        <MarketingShell>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
                }}
            />
            <main className="rv-art-wrap">
                <article>
                    <div className="rv-art-head">
                        <Link href="/rehber" className="rv-art-back tap-44-v">
                            <ArrowLeft size={13} aria-hidden /> Rehber
                        </Link>
                        <h1 className="rv-art-h1">{article.title}</h1>
                        <p className="rv-art-lede">{article.description}</p>
                        <div className="rv-art-meta">
                            <span>{article.minutes} dakikalık okuma</span>
                            <span>
                                Güncellendi:{" "}
                                <time dateTime={article.updated}>
                                    {new Date(article.updated).toLocaleDateString("tr-TR", {
                                        day: "numeric",
                                        month: "long",
                                        year: "numeric",
                                    })}
                                </time>
                            </span>
                        </div>
                    </div>

                    <div className="rv-art-body">
                        <ArticleBody sections={article.sections} />
                    </div>
                </article>

                <div className="rv-art-cta">
                    <div>
                        <p className="rv-art-cta-t">Bu soruları kendi rakamlarınızla konuşalım</p>
                        <p className="rv-art-cta-d">
                            30 dakikalık kurulum görüşmesinde kendi ürün listenizi yükleyip
                            sistemi çalışırken gösteriyoruz. Uymuyorsa uymuyor diyoruz.
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <Link href="/#iletisim" className="rv-btn rv-btn-primary">
                            Görüşme iste <ArrowRight size={16} />
                        </Link>
                        <a href="/api/auth/demo" className="rv-btn rv-btn-ghost">
                            Demoyu gez
                        </a>
                    </div>
                </div>

                {others.length > 0 && (
                    <div className="rv-art-list">
                        {others.map((a) => (
                            <Link key={a.slug} href={`/rehber/${a.slug}`} className="rv-art-card">
                                <h2 className="rv-art-card-t">{a.title}</h2>
                                <p className="rv-art-card-d">{a.teaser}</p>
                                <span className="rv-art-card-m">{a.minutes} dakikalık okuma</span>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </MarketingShell>
    );
}

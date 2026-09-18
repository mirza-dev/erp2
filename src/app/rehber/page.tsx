import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import MarketingShell from "@/components/marketing/MarketingShell";
import { ARTICLES } from "@/lib/marketing/articles";

export const metadata: Metadata = {
    title: "Rehber — KOBİ'ler için ERP yazıları | Roven",
    description:
        "ERP fiyatları, Excel'den geçiş ve stok rezervasyonu üzerine Türkçe rehber yazıları. Satış metni değil, karar vermenize yarayacak bilgi.",
    alternates: { canonical: "/rehber" },
};

export default function RehberPage() {
    return (
        <MarketingShell>
            <main className="rv-art-wrap">
                <div className="rv-art-head">
                    <span className="rv-kicker">Rehber</span>
                    {/* Tek h1 — `gate/surface-consistency` herkese açık her yüzeyde arıyor. */}
                    <h1 className="rv-art-h1">ERP kararı vermeden önce okunacaklar</h1>
                    <p className="rv-art-lede">
                        Ürün tanıtımı değil. Bir işletme sahibinin ERP araştırırken gerçekten
                        sorduğu soruların cevapları — fiyatın nasıl hesaplandığı, geçişin
                        hangi sırayla yapıldığı, stoğun neden tek bir sayıyla yönetilemediği.
                    </p>
                </div>

                <div className="rv-art-list">
                    {ARTICLES.map((a) => (
                        <Link key={a.slug} href={`/rehber/${a.slug}`} className="rv-art-card">
                            <h2 className="rv-art-card-t">{a.title}</h2>
                            <p className="rv-art-card-d">{a.teaser}</p>
                            <span className="rv-art-card-m">{a.minutes} dakikalık okuma</span>
                        </Link>
                    ))}
                </div>

                <div className="rv-art-cta">
                    <div>
                        <p className="rv-art-cta-t">Okumak yerine görmek isterseniz</p>
                        <p className="rv-art-cta-d">
                            Canlı demo kayıt istemez. Kendi ürün listenizle kurulum görüşmesi
                            de yapabiliriz — 30 dakika, satış baskısı yok.
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <a href="/api/auth/demo" className="rv-btn rv-btn-primary">
                            Demoyu gez <ArrowRight size={16} />
                        </a>
                        <Link href="/#iletisim" className="rv-btn rv-btn-ghost">
                            Görüşme iste
                        </Link>
                    </div>
                </div>
            </main>
        </MarketingShell>
    );
}

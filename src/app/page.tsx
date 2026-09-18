import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check, ShieldCheck, X, Minus } from "lucide-react";
import RovenLogo, { RovenMark } from "@/components/layout/RovenLogo";
import ContactForm from "@/components/marketing/ContactForm";
import { SITE_URL } from "@/lib/marketing/site";
import { MARKETING_CSS } from "@/lib/marketing/marketing-css";
import {
    modules,
    hero,
    proof,
    productFacts,
    reservationChain,
    reservationShot,
    featuresBig,
    featuresSmall,
    steps,
    sectors,
    excelRows,
    whyPoints,
    limits,
    faqs,
    plans,
    buildJsonLd,
    carePlans,
} from "@/lib/marketing/landing-content";

// Marka metinleri: docs/brand/roven-marka-rehberi.md §1.3 (vaat ≤ canlı, §1.5).
export const metadata: Metadata = {
    title: "Roven — Yapay Zeka Destekli ERP",
    description:
        "Teklif, sipariş, stok, üretim ve muhasebe tek akışta. Küçük ve orta ölçekli işletmeler için yapay zeka destekli ERP — kurulumu bir öğleden sonra.",
    // Kanonik adres: aynı sayfaya `?utm_*` ile gelen bağlantılar ayrı sayfa
    // sayılmasın (Google sıralamayı böler ve hangisini göstereceğini şaşırır).
    alternates: { canonical: "/" },
};

/**
 * Ürün ekran görüntüsü çerçevesi.
 *
 * Görseller `npm run shots` ile yerel veritabanından, kurgusal adlarla çekilir
 * (scripts/build-product-shots.ts). Dosyalar 2880×1800 (@2x); `width`/`height`
 * 1440×900 verilir ki tarayıcı yeri önceden ayırsın, sayfa yüklenirken zıplamasın.
 * `next/image` kullanılmıyor: proje genelinde hiç kullanılmıyor, tek sayfa için
 * görüntü optimizasyon hattı açmaya değmez.
 */
function Shot({
    src,
    alt,
    url,
    priority = false,
}: {
    src: string;
    alt: string;
    url: string;
    priority?: boolean;
}) {
    return (
        <figure className="rv-shot">
            <div className="rv-win-bar" aria-hidden>
                <i />
                <i />
                <i />
                <span className="rv-win-url">{url}</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt={alt}
                width={1440}
                height={900}
                loading={priority ? "eager" : "lazy"}
                fetchPriority={priority ? "high" : "auto"}
                decoding="async"
                className="rv-shot-img"
            />
        </figure>
    );
}

export default function LandingPage() {
    return (
        <div className="rv-root">
            <style>{MARKETING_CSS}</style>
            {/* Yapılandırılmış veri — içerik sayfanın kendi dizilerinden türetilir,
                kullanıcı girdisi YOKTUR; `JSON.stringify` çıktısı script bağlamına
                girdiği için `<` kaçırılır (aksi hâlde bir metin `</script>` içerse
                etiketi erkenden kapatırdı). */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(buildJsonLd(SITE_URL)).replace(/</g, "\\u003c"),
                }}
            />

            {/* atmosfer katmanları */}
            <div className="rv-bg-mesh" aria-hidden />
            <div className="rv-bg-grid" aria-hidden />
            <div className="rv-bg-grain" aria-hidden />

            {/* NAV — 5 bağlantı; birincil eylem görüşme (bu fiyat bandında satış
                görüşmeyle kapanır), demo hero'da ikincil. */}
            <header className="rv-nav">
                <span className="rv-brand">
                    <RovenLogo size={19} wordmarkSize={17} />
                </span>
                <nav className="rv-nav-links">
                    <a href="#ozellikler">Özellikler</a>
                    <a href="#fiyat">Fiyat</a>
                    <Link href="/rehber">Rehber</Link>
                    <a href="#sss">SSS</a>
                    <a href="#iletisim">İletişim</a>
                </nav>
                <div className="rv-nav-cta">
                    {/* 2026-09-10 ölçümü: "Giriş Yap" 55.5×20.3 — 44px tabanının
                        altındaydı. `tap-44` görsel boyutu değiştirmeden hit alanını
                        büyütür. */}
                    <Link href="/login" className="rv-link-quiet tap-44">
                        Giriş Yap
                    </Link>
                    <a href="#iletisim" className="rv-btn rv-btn-primary rv-btn-sm tap-44">
                        Görüşme iste <ArrowRight size={14} />
                    </a>
                </div>
            </header>

            {/* HERO — başlık ürünün tekil mekanizması: teklifte rezervasyon */}
            <section className="rv-hero">
                <div className="rv-hero-copy">
                    <div className="rv-eyebrow rv-rise" style={{ animationDelay: "0ms" }}>
                        <span className="rv-dot" /> {hero.eyebrow}
                    </div>
                    <h1 className="rv-h1 rv-rise" style={{ animationDelay: "60ms" }}>
                        {hero.titleLead}
                        <br />
                        <span className="rv-h1-accent">{hero.titleAccent}</span>
                    </h1>
                    <p className="rv-sub rv-rise" style={{ animationDelay: "120ms" }}>
                        {hero.sub}
                    </p>
                    <div className="rv-hero-cta rv-rise" style={{ animationDelay: "180ms" }}>
                        <a href="#iletisim" className="rv-btn rv-btn-primary">
                            Kurulum görüşmesi iste <ArrowRight size={16} />
                        </a>
                        <a href="/api/auth/demo" className="rv-btn rv-btn-ghost">
                            Canlı demoyu gez
                        </a>
                    </div>
                    <div className="rv-trust rv-rise" style={{ animationDelay: "240ms" }}>
                        {hero.trust.map((t, i) => (
                            <span key={t}>
                                {i === 2 ? <ShieldCheck size={13} /> : <Check size={13} />} {t}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="rv-hero-art rv-rise" style={{ animationDelay: "200ms" }}>
                    <div className="rv-hero-frame">
                        <Shot src={hero.shot.src} alt={hero.shot.alt} url="Genel Bakış" priority />
                    </div>
                    <div className="rv-art-glow" aria-hidden />
                </div>
            </section>

            {/* GÜVEN ŞERİDİ / VAKA — isimli sürüm yalnız yazılı izinle
                (landing-content.ts `proof.named`). */}
            <section id="referans" className="rv-proof">
                <div className="rv-proof-quote">
                    <span className="rv-kicker">Sahada doğdu</span>
                    <p className="rv-proof-text">{proof.statement}</p>
                    {proof.named && proof.company && (
                        <p className="rv-proof-by">— {proof.company}</p>
                    )}
                </div>
                <dl className="rv-proof-facts">
                    {(proof.named && proof.stats.length > 0 ? proof.stats : productFacts).map((f) => (
                        <div key={f.label} className="rv-proof-fact">
                            <dt className="rv-proof-num">{f.value}</dt>
                            <dd className="rv-proof-lbl">{f.label}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            {/* PROBLEM → ÇÖZÜM */}
            <section className="rv-band">
                <p className="rv-band-strike">
                    Excel’de teklif. Whatsapp’ta sipariş. Deftere stok.
                    Muhasebeye ayrı giriş.
                </p>
                <p className="rv-band-fix">
                    Roven hepsini <span>tek akışa</span> bağlar.
                </p>
            </section>

            {/* ★ VURUCU AN — sayfanın kalbi */}
            <section id="rezervasyon" className="rv-section rv-killer">
                <div className="rv-sec-head">
                    <span className="rv-kicker">Tek fark</span>
                    <h2 className="rv-h2">Aynı malı iki müşteriye satmak artık mümkün değil.</h2>
                    <p className="rv-sec-p">
                        Çoğu sistem stoğu sipariş onaylanınca düşer. O ana kadar aynı mal
                        iki teklifte birden “var” görünür. Roven rezervasyonu teklif
                        gönderildiği an yapar.
                    </p>
                </div>
                <ol className="rv-killer-chain">
                    {reservationChain.map((c) => (
                        <li key={c.no} className="rv-killer-step">
                            <span className="rv-killer-no">{c.no}</span>
                            <h3 className="rv-killer-t">{c.title}</h3>
                            <p className="rv-killer-d">{c.desc}</p>
                        </li>
                    ))}
                </ol>
                <div className="rv-killer-shot">
                    <Shot src={reservationShot.src} alt={reservationShot.alt} url="Stok & Ürünler" />
                    <p className="rv-shot-cap">{reservationShot.caption}</p>
                </div>
            </section>

            {/* ÖZELLİKLER — 2 büyük (gerçek ekran) + 3 küçük */}
            <section id="ozellikler" className="rv-section rv-section-alt">
                <div className="rv-sec-head">
                    <span className="rv-kicker">Özellikler</span>
                    <h2 className="rv-h2">Operasyonu yöneten değil, hızlandıran sistem</h2>
                </div>
                <div className="rv-feat-big">
                    {featuresBig.map((f, i) => {
                        const Icon = f.icon;
                        return (
                            <article key={f.title} className={i % 2 ? "rv-feat-row rv-feat-flip" : "rv-feat-row"}>
                                <div className="rv-feat-copy">
                                    <span className="rv-card-ico">
                                        <Icon size={18} strokeWidth={1.8} />
                                    </span>
                                    <span className="rv-feat-kicker">{f.kicker}</span>
                                    <h3 className="rv-feat-t">{f.title}</h3>
                                    <p className="rv-feat-d">{f.desc}</p>
                                </div>
                                <div className="rv-feat-shot">
                                    <Shot src={f.shot.src} alt={f.shot.alt} url={f.kicker} />
                                </div>
                            </article>
                        );
                    })}
                </div>
                <div className="rv-grid">
                    {featuresSmall.map((f) => {
                        const Icon = f.icon;
                        return (
                            <article key={f.title} className="rv-card">
                                <span className="rv-card-ico">
                                    <Icon size={18} strokeWidth={1.8} />
                                </span>
                                <h3 className="rv-card-t">{f.title}</h3>
                                <p className="rv-card-d">{f.desc}</p>
                            </article>
                        );
                    })}
                </div>
                <div className="rv-strip-chips rv-feat-mods" aria-label="Modüller">
                    {modules.map((m) => (
                        <span key={m} className="rv-chip">
                            <RovenMark size={11} decorative />
                            {m}
                        </span>
                    ))}
                </div>
            </section>

            {/* YAPAY ZEKA — küçültüldü: kendi CTA'sı ve nav bağlantısı kalktı.
                Silinmedi çünkü "yapay zeka destekli" marka başlığında ve OG'de. */}
            <section id="yapayzeka" className="rv-ai">
                <div className="rv-ai-inner">
                    <span className="rv-kicker">Yapay zeka, gösteriş için değil</span>
                    <h2 className="rv-h2 rv-ai-h">Belgeyi okur. Riski söyler. Öneriyi getirir.</h2>
                    <p className="rv-ai-p">
                        Yapay zeka anahtarı tanımlıyken Roven tedarikçi listelerini ve
                        müşteri belgelerini okur, stok riskleri için bulgu çıkarır. Anahtar
                        yoksa aynı akış kural tabanlı sürer; hiçbir ekran yapay zekaya
                        bağımlı değildir.
                    </p>
                </div>
            </section>

            {/* NASIL ÇALIŞIR */}
            <section id="nasil" className="rv-section">
                <div className="rv-sec-head">
                    <span className="rv-kicker">Nasıl çalışır</span>
                    <h2 className="rv-h2">Üç adımda kontrol</h2>
                </div>
                <div className="rv-steps">
                    {steps.map((s) => (
                        <div key={s.no} className="rv-step">
                            <span className="rv-step-no">{s.no}</span>
                            <h3 className="rv-step-t">{s.title}</h3>
                            <p className="rv-step-d">{s.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* KİMLER İÇİN — sektör-nötr; her satır ürünün gerçek bir akışına bağlı */}
            <section id="kimler" className="rv-section rv-section-alt">
                <div className="rv-sec-head">
                    <span className="rv-kicker">Kimler için</span>
                    <h2 className="rv-h2">Ürün satan, üreten ya da tedarik eden her KOBİ</h2>
                </div>
                <div className="rv-sectors">
                    {sectors.map((s) => (
                        <div key={s.title} className="rv-sector">
                            <h3 className="rv-sector-t">{s.title}</h3>
                            <p className="rv-sector-d">{s.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* EXCEL'E KARŞI — asıl rakip tablo dosyası; rakip firma adı geçmez */}
            <section id="excel" className="rv-section">
                <div className="rv-sec-head">
                    <span className="rv-kicker">Excel’e karşı</span>
                    <h2 className="rv-h2">Excel iyi bir hesap makinesi. Kötü bir stok defteri.</h2>
                </div>
                <div className="rv-excel" role="table" aria-label="Excel ile Roven karşılaştırması">
                    <div className="rv-excel-row rv-excel-head" role="row">
                        <span role="columnheader">Excel’de</span>
                        <span role="columnheader">Roven’da</span>
                    </div>
                    {excelRows.map((r) => (
                        <div key={r.excel} className="rv-excel-row" role="row">
                            <span role="cell" className="rv-excel-bad">
                                <X size={14} aria-hidden /> {r.excel}
                            </span>
                            <span role="cell" className="rv-excel-good">
                                <Check size={14} aria-hidden /> {r.roven}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            {/* NEDEN ROVEN — üç yapısal fark (model, özellik değil) */}
            <section id="neden" className="rv-section rv-section-alt">
                <div className="rv-sec-head">
                    <span className="rv-kicker">Neden Roven</span>
                    <h2 className="rv-h2">Özellik listesi değil, iş modeli farkı</h2>
                </div>
                <div className="rv-why">
                    {whyPoints.map((w, i) => (
                        <div key={w.title} className="rv-why-item">
                            <span className="rv-why-no">{String(i + 1).padStart(2, "0")}</span>
                            <h3 className="rv-why-t">{w.title}</h3>
                            <p className="rv-why-d">{w.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* FİYAT — rakam gösterilir, "teklif alın" arkasına saklanmaz.
                Gerekçe: docs/brand/fiyatlandirma-modeli.md §8 — bu segmentteki alıcı
                bayiden fiyat alamamanın yorgunluğuyla geliyor; saklamak güven kaybettirir. */}
            <section id="fiyat" className="rv-section">
                <div className="rv-sec-head">
                    <span className="rv-kicker">Fiyat</span>
                    <h2 className="rv-h2">Bir kez kurulur, yılda bir yenilenir.</h2>
                    <p className="rv-sec-p">
                        Kullanıcı başına ücret yok. Modül başına ücret yok. Barındırma dahil.
                        Ne ödeyeceğinizi ilk gün bilirsiniz.
                    </p>
                </div>

                <div className="rv-plans">
                    {plans.map((p) => (
                        <div key={p.name} className={p.featured ? "rv-plan rv-plan-hi" : "rv-plan"}>
                            {p.featured && <span className="rv-plan-tag">En çok tercih edilen</span>}
                            <h3 className="rv-plan-n">{p.name}</h3>
                            <p className="rv-plan-for">{p.forWho}</p>
                            <p className="rv-plan-p">
                                <span className="rv-plan-num">{p.price}</span>
                                <span className="rv-plan-cur">TL{p.priceSuffix ?? ""}</span>
                            </p>
                            <p className="rv-plan-once">tek seferlik · KDV hariç</p>
                            <ul className="rv-plan-list">
                                {p.items.map((i) => (
                                    <li key={i}><Check size={14} /> <span>{i}</span></li>
                                ))}
                            </ul>
                            <a
                                href="#iletisim"
                                className={p.featured ? "rv-btn rv-btn-primary rv-plan-cta" : "rv-btn rv-btn-ghost rv-plan-cta"}
                            >
                                Görüşme iste
                            </a>
                        </div>
                    ))}
                </div>

                <div className="rv-care">
                    <div className="rv-care-head">
                        <h3 className="rv-care-h">Yıllık bakım</h3>
                        <p className="rv-care-p">
                            Barındırma, günlük yedek, sürüm güncellemeleri ve destek.
                            <strong> İlk yıl kurulum bedeline dahildir</strong>, 13. aydan itibaren başlar.
                        </p>
                    </div>
                    <div className="rv-care-grid">
                        {carePlans.map((c) => (
                            <div key={c.name} className="rv-care-item">
                                <span className="rv-care-n">{c.name}</span>
                                <span className="rv-care-price">{c.price} TL<span className="rv-care-per">/yıl</span></span>
                                <span className="rv-care-d">{c.desc}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="rv-price-foot">
                    Dönüşüm paketi projeye göre fiyatlanır. Tüm bedeller KDV hariçtir.
                    İki ayrı firması olan işletmeler için ikinci kurulumda %50 indirim uygulanır.
                </p>
            </section>

            {/* SINIRLAR — ne yapmadığını söylemek, yaptığını inandırır.
                Her madde dengeli: "yapmaz" + "ama şu var". */}
            <section id="sinirlar" className="rv-section rv-section-alt">
                <div className="rv-sec-head">
                    <span className="rv-kicker">Açık konuşalım</span>
                    <h2 className="rv-h2">Roven ne yapmaz</h2>
                    <p className="rv-sec-p">
                        Görüşmede sürpriz olmasın diye sınırları baştan yazıyoruz.
                    </p>
                </div>
                <ul className="rv-limits">
                    {limits.map((l) => (
                        <li key={l.no} className="rv-limit">
                            <span className="rv-limit-ico" aria-hidden><Minus size={14} /></span>
                            <div>
                                <p className="rv-limit-no">{l.no}</p>
                                <p className="rv-limit-but">{l.but}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            {/* SSS — yerel <details>: JS'siz açılır, ekran okuyucu ve klavye hazır */}
            <section id="sss" className="rv-section">
                <div className="rv-sec-head">
                    <span className="rv-kicker">Sık sorulanlar</span>
                    <h2 className="rv-h2">Karar vermeden önce bilmek istediklerin</h2>
                </div>
                <div className="rv-faq">
                    {faqs.map((f) => (
                        <details key={f.q} className="rv-faq-item">
                            <summary className="rv-faq-q tap-44-v">{f.q}</summary>
                            <p className="rv-faq-a">{f.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            {/* SON CTA — İLETİŞİM. Ziyaretçi buraya kadar okuduysa eksik olan
                bilgi değil, KONUŞMA — o yüzden son blok formdur. */}
            <section id="iletisim" className="rv-final">
                <div className="rv-final-inner">
                    <div className="rv-final-copy">
                        <span className="rv-kicker">İletişim</span>
                        <h2 className="rv-final-h">
                            Önce sizi dinleyelim,<br />sonra ekranı gösterelim.
                        </h2>
                        <p className="rv-final-p">
                            Kurulum görüşmesi 30 dakikadır ve ücretsizdir. Bugün neyi hangi
                            dosyada tuttuğunuzu anlatırsınız; biz aynı işin Roven’da nasıl
                            yürüdüğünü canlı sistemde gösteririz. Uymuyorsa açıkça söyleriz.
                        </p>
                        <ul className="rv-final-list">
                            <li><Check size={14} /> <span>Sunum yok — doğrudan çalışan sistem</span></li>
                            <li><Check size={14} /> <span>Kendi verinizle örnek bir akış kurarız</span></li>
                            <li><Check size={14} /> <span>Fiyat ve süre görüşmede netleşir</span></li>
                        </ul>
                        <p className="rv-final-alt">
                            Önce kendiniz bakmak isterseniz{" "}
                            <a href="/api/auth/demo" className="rv-final-link">canlı demoyu gezin</a> —
                            kayıt gerekmez.
                        </p>
                    </div>
                    <div className="rv-final-form">
                        <ContactForm fallbackEmail={process.env.NEXT_PUBLIC_CONTACT_EMAIL} />
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="rv-footer">
                <span className="rv-brand">
                    <RovenLogo size={16} wordmarkSize={14} />
                </span>
                <span className="rv-foot-tag">Yapay zeka destekli ERP — küçük ve orta ölçekli işletmeler için</span>
                <Link href="/rehber" className="rv-foot-tag tap-44-v" style={{ color: "inherit", textDecoration: "underline" }}>
                    Rehber
                </Link>
                <Link href="/gizlilik" className="rv-foot-tag tap-44-v" style={{ color: "inherit", textDecoration: "underline" }}>
                    Gizlilik ve Aydınlatma Metni
                </Link>
                <span className="rv-foot-copy">© {new Date().getFullYear()} Roven</span>
            </footer>
        </div>
    );
}

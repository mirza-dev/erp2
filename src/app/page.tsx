import Link from "next/link";
import type { Metadata } from "next";
import {
    ScanLine,
    FileText,
    Bell,
    Boxes,
    RefreshCw,
    Sparkles,
    ArrowRight,
    Check,
    ShieldCheck,
} from "lucide-react";
import RovenLogo, { RovenMark } from "@/components/layout/RovenLogo";
import ContactForm from "@/components/marketing/ContactForm";
import { SITE_URL } from "@/lib/marketing/site";
import { MARKETING_CSS } from "@/lib/marketing/marketing-css";

// Marka metinleri: docs/brand/roven-marka-rehberi.md §1.3 (vaat ≤ canlı, §1.5).
export const metadata: Metadata = {
    title: "Roven — Yapay Zeka Destekli ERP",
    description:
        "Teklif, sipariş, stok, üretim ve muhasebe tek akışta. Küçük ve orta ölçekli işletmeler için yapay zeka destekli ERP — kurulumu bir öğleden sonra.",
    // Kanonik adres: aynı sayfaya `?utm_*` ile gelen bağlantılar ayrı sayfa
    // sayılmasın (Google sıralamayı böler ve hangisini göstereceğini şaşırır).
    alternates: { canonical: "/" },
};

const modules = [
    "Teklif",
    "Sipariş",
    "Stok",
    "Üretim",
    "Satın Alma",
    "Muhasebe",
    "Uyarılar",
];

const features = [
    {
        icon: ScanLine,
        title: "Excel’ini Bırak, Sistem Eşleştirsin",
        desc: "Ürün, cari ve stok listeni sürükle bırak — kolonlar otomatik eşleşir, eşleşmeyi bir kez onaylarsın, sistem hatırlar. Yapay zeka anahtarı tanımlıysa PDF ve görsel belgeleri de okur.",
    },
    {
        icon: FileText,
        title: "Teklif → PDF → E-posta",
        desc: "Profesyonel teklifi tek tıkla hazırla, müşteriye PDF olarak gönder. Kabul edilince sipariş ve stok rezervasyonu otomatik oluşur.",
    },
    {
        icon: Boxes,
        title: "Gerçek Zamanlı Stok",
        desc: "Fiziksel stok, rezerve, satılabilir ve yoldaki mal tek bakışta. Aynı stoğu iki kez satma riski yok — sistem rezervasyonu yönetir.",
    },
    {
        icon: Bell,
        title: "Uyarı Takvimi",
        desc: "Kritik stok, geciken sevkiyat, süresi dolan teklif, vadesi gelen satın alma — dokuz uyarı tipi takvimde, sen fark etmeden önce. Kendi notunu ve hatırlatmanı da aynı takvime yazarsın.",
    },
    {
        icon: RefreshCw,
        title: "Paraşüt’e Hazır",
        desc: "Sevk edilen sipariş faturaya, mal kabul alış faturasına, tahsilat durumu panoya — Paraşüt bağlantısı hazır, tek ayarla açılır. Çift veri girişi biter.",
    },
    {
        icon: Sparkles,
        title: "Satın Alma Önerileri",
        desc: "Tüketim hızı, tedarik süresi ve açık siparişlerden neyi ne zaman sipariş etmen gerektiği hesaplanır; tedarikçilerden fiyat toplar, kazananı tek tıkla siparişe çevirirsin.",
    },
];

const steps = [
    {
        no: "01",
        title: "Belgeni bırak",
        desc: "Ürün listeni, cari listeni ya da açılış stoğunu Excel olarak bırak. Kolonlar eşleşir, sistem geri kalanını halleder.",
    },
    {
        no: "02",
        title: "Sistem işler",
        desc: "Teklif çıkar, stok rezerve et, üretimi planla, faturayı muhasebeye gönder — hepsi tek akışta.",
    },
    {
        no: "03",
        title: "Önde kal",
        desc: "Panel sana ciroyu, riskleri ve fırsatları gösterir. Tahmin etme — gör.",
    },
];

// Hero ürün-mock'unda kullanılan veriler tamamen kurgusaldır (gerçek müşteri DEĞİL).
const mockOrders = [
    { no: "ORD-2041", name: "Anadolu Makine A.Ş.", status: "Onaylı", tone: "success" },
    { no: "ORD-2040", name: "Ege Mobilya Sanayi", status: "Rezerve", tone: "warning" },
    { no: "ORD-2039", name: "Marmara Gıda Dağıtım", status: "Sevk", tone: "accent" },
    { no: "ORD-2038", name: "Toros Ambalaj Ltd.", status: "Bekliyor", tone: "muted" },
];

const mockBars = [38, 54, 41, 67, 49, 72, 60, 84];

// Geniş KOBİ konumlandırması (marka rehberi §0/§1.2): sektör örnekleri
// vana/endüstri vurgusundan çıkarıldı; her satır ürünün gerçekten kapsadığı bir
// akışa bağlanır — uydurma vaat yok.
const sectors = [
    { title: "Üretim atölyeleri", desc: "Reçeteli üretim, hurda/fire kaydı, bileşen stoğu ve eksik listesi." },
    { title: "Toptan ve dağıtım", desc: "Çok para birimli teklif, rezervasyonlu sipariş, sevkiyat ve cari takibi." },
    { title: "İthalat ve tedarik", desc: "Tedarikçi fiyat talepleri, karşılaştırma, satın alma siparişi ve mal kabul." },
    { title: "Proje bazlı iş", desc: "Revizyonlu teklifler, PDF arşiv, teklif geçerlilik takibi ve kabulde otomatik sipariş." },
];

const faqs = [
    {
        q: "Kurulum ne kadar sürer?",
        a: "Elinizdeki Excel listeleriyle bir öğleden sonra. Kurulum paneli beş adımı sırayla gösterir: ürün tipleri, ürünler, cariler, tedarikçiler, açılış stoğu. Her adımda şablon indirir, doldurur, yüklersiniz.",
    },
    {
        q: "Verilerimiz nerede tutuluyor?",
        a: "Her müşteri için ayrı bir veritabanı kurulur; başka bir işletmeyle aynı tabloyu paylaşmazsınız. Yeni kurulumlar Avrupa Birliği bölgesinde (Frankfurt) açılır; yedekleme ve geri yükleme yordamı prova edilmiştir ve verinizin tam yedeği her zaman alınabilir.",
    },
    {
        q: "Muhasebe programımızla çalışır mı?",
        a: "Paraşüt bağlantısı hazırdır ve tek ayarla açılır: satış faturası, alış faturası, tahsilat durumu ve stok mutabakatı. Başka bir muhasebe programı için hazır bağlantı yoktur.",
    },
    {
        q: "Yapay zeka olmadan çalışır mı?",
        a: "Evet. Kolon eşleştirme, uyarılar ve satın alma önerileri kural tabanlıdır; yapay zeka anahtarı tanımlı değilse sistem sade modda aynı işi yapar. Anahtar tanımlanınca PDF okuma ve yapay zeka bulguları devreye girer.",
    },
    {
        q: "Telefondan kullanılır mı?",
        a: "Evet. Ana ekrana eklenen uygulama gibi açılır; koyu ve aydınlık tema, dokunmaya uygun kontroller ve çevrimdışı uyarısı vardır. Sevkiyat, mal kabul ve üretim kaydı sahadan girilebilir.",
    },
    {
        q: "Kim neyi görür?",
        a: "Altı rol: yönetici, satış, satın alma, üretim, muhasebe, izleyici. Fiyat ve maliyet alanları yetkisi olmayana hiç gönderilmez; her değişiklik kimin yaptığıyla birlikte kayıt altındadır.",
    },
];

/* Fiyat modeli: docs/brand/fiyatlandirma-modeli.md §4. Rakamlar oradan gelir —
   değişirse İKİ yerde birden değişmeli (belge iç kullanım, burası vitrin). */
const plans = [
    {
        name: "Hızlı Kurulum",
        price: "45.000",
        forWho: "Verisi düzenli, hemen başlamak isteyen",
        featured: false,
        items: [
            "Sistem kurulumu ve devreye alma",
            "Ürün + cari aktarımı (1 Excel)",
            "Logo ve antet",
            "3 saat uzaktan eğitim",
            "30 gün yakın destek",
        ],
    },
    {
        name: "Anahtar Teslim",
        price: "85.000",
        forWho: "Çoğu işletme için doğru başlangıç",
        featured: true,
        items: [
            "Tüm verilerin aktarımı — ürün, cari, tedarikçi, tedarikçi fiyatları, açılış stoğu",
            "Ürün tipleri ve teknik alanlar kurulumu",
            "Teklif ve PDF şablonu firmanıza göre",
            "Rol ve yetki haritası çıkarımı",
            "1 gün yerinde eğitim",
            "90 gün yakın destek",
        ],
    },
    {
        name: "Dönüşüm",
        price: "150.000",
        priceSuffix: "’den",
        forWho: "Mevcut ERP’den geçen, süreci karmaşık",
        featured: false,
        items: [
            "Anahtar Teslim’in tamamı",
            "Mevcut sistemden geçmiş veri göçü",
            "Süreç analizi atölyesi",
            "Özel alan ve rapor tasarımı",
            "2 gün yerinde eğitim",
            "6 ay yakın destek",
        ],
    },
];

/**
 * Yapılandırılmış veri (JSON-LD).
 *
 * Google'ın sayfayı "bir yazılım ürünü" olarak tanıması ve SSS'lerin arama
 * sonucunda açılır madde olarak çıkması için. İçerik SAYFANIN KENDİ
 * dizilerinden türetilir (`faqs`, `plans`) — ikinci bir metin kopyası tutulsaydı
 * sayfa değişince yapılandırılmış veri sessizce yalan söylemeye başlardı ve
 * Google bunu "uyumsuz içerik" olarak cezalandırır.
 *
 * Fiyat `lowPrice` olarak veriliyor: paketler hizmet kapsamına göre değişiyor,
 * tek bir fiyat iddiası yanlış olurdu.
 */
function buildJsonLd(siteUrl: string) {
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "SoftwareApplication",
                "@id": `${siteUrl}/#software`,
                name: "Roven",
                applicationCategory: "BusinessApplication",
                applicationSubCategory: "ERP",
                operatingSystem: "Web",
                inLanguage: "tr-TR",
                description:
                    "Küçük ve orta ölçekli işletmeler için yapay zeka destekli ERP. " +
                    "Teklif, sipariş, stok, üretim ve satın alma tek akışta.",
                url: siteUrl,
                offers: {
                    "@type": "AggregateOffer",
                    priceCurrency: "TRY",
                    lowPrice: plans[0].price.replace(".", ""),
                    offerCount: plans.length,
                },
                featureList: modules,
            },
            {
                "@type": "Organization",
                "@id": `${siteUrl}/#org`,
                name: "Roven",
                url: siteUrl,
                logo: `${siteUrl}/icons/icon-512.png`,
            },
            {
                "@type": "FAQPage",
                "@id": `${siteUrl}/#faq`,
                mainEntity: faqs.map((f) => ({
                    "@type": "Question",
                    name: f.q,
                    acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
            },
        ],
    };
}

const carePlans = [
    { name: "Temel", price: "24.000", desc: "Barındırma, günlük yedek, güncellemeler, e-posta desteği (2 iş günü)." },
    { name: "Öncelikli", price: "42.000", desc: "Telefon ve WhatsApp desteği, aynı iş günü yanıt, aylık 4 saat uzaktan destek, çeyreklik sağlık kontrolü." },
    { name: "Ortak", price: "72.000", desc: "4 saat yanıt, aylık 8 saat geliştirme kotası, yeni özelliklerde öncelik." },
];

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

            {/* NAV */}
            <header className="rv-nav">
                <span className="rv-brand">
                    <RovenLogo size={19} wordmarkSize={17} />
                </span>
                <nav className="rv-nav-links">
                    <a href="#ozellikler">Özellikler</a>
                    <a href="#kimler">Kimler için</a>
                    <a href="#nasil">Nasıl çalışır</a>
                    <a href="#yapayzeka">Yapay zeka</a>
                    <a href="#fiyat">Fiyat</a>
                    <Link href="/rehber">Rehber</Link>
                    <a href="#sss">SSS</a>
                    <a href="#iletisim">İletişim</a>
                </nav>
                <div className="rv-nav-cta">
                    {/* 2026-09-10 ölçümü: "Giriş Yap" 55.5×20.3, "Demo Gez"
                        116.2×35.5 — açılış sayfasının İKİ birincil eylemi de 44px
                        tabanının altındaydı. Sayfa kendi stil dilini (`rv-*`)
                        taşıyor ama `tap-44` mekanizmasını zaten kullanıyor
                        (alt bilgideki gizlilik bağlantısı). Görsel boyut değişmez. */}
                    <Link href="/login" className="rv-link-quiet tap-44">
                        Giriş Yap
                    </Link>
                    <a href="/api/auth/demo" className="rv-btn rv-btn-primary rv-btn-sm tap-44">
                        Demo Gez <ArrowRight size={14} />
                    </a>
                </div>
            </header>

            {/* HERO */}
            <section className="rv-hero">
                <div className="rv-hero-copy">
                    <div className="rv-eyebrow rv-rise" style={{ animationDelay: "0ms" }}>
                        <span className="rv-dot" /> Yapay zeka destekli ERP
                    </div>
                    <h1 className="rv-h1 rv-rise" style={{ animationDelay: "60ms" }}>
                        İşletmenin tamamı,
                        <br />
                        <span className="rv-h1-accent">tek ekranda.</span>
                    </h1>
                    <p className="rv-sub rv-rise" style={{ animationDelay: "120ms" }}>
                        Teklif, sipariş, stok, üretim ve muhasebe artık dağınık tablolarda
                        değil. Roven hepsini birleştirir; yapay zeka belgelerini okur,
                        riskleri sen fark etmeden önce söyler.
                    </p>
                    <div className="rv-hero-cta rv-rise" style={{ animationDelay: "180ms" }}>
                        <a href="/api/auth/demo" className="rv-btn rv-btn-primary">
                            Canlı demoyu gez <ArrowRight size={16} />
                        </a>
                        <Link href="/login" className="rv-btn rv-btn-ghost">
                            Giriş Yap
                        </Link>
                    </div>
                    <div className="rv-trust rv-rise" style={{ animationDelay: "240ms" }}>
                        <span><Check size={13} /> Kredi kartı gerekmez</span>
                        <span><ShieldCheck size={13} /> Verileriniz sizde kalır</span>
                        <span><Check size={13} /> Türkçe, KDV ve Paraşüt uyumlu</span>
                    </div>
                </div>

                {/* ÜRÜN MOCK — kurgusal veri */}
                <div className="rv-hero-art rv-rise" style={{ animationDelay: "200ms" }}>
                    <div className="rv-window">
                        <div className="rv-win-bar">
                            <i /><i /><i />
                            <span className="rv-win-url">rovenerp.com/dashboard · Genel Bakış</span>
                        </div>
                        <div className="rv-win-body">
                            <aside className="rv-mock-side">
                                <span className="rv-mock-logo">
                                    <RovenLogo size={14} wordmarkSize={12} />
                                </span>
                                {["Genel Bakış", "Teklifler", "Siparişler", "Stok", "Üretim", "Uyarılar"].map(
                                    (it, i) => (
                                        <span key={it} className={`rv-mock-nav${i === 0 ? " on" : ""}`}>
                                            {it}
                                        </span>
                                    )
                                )}
                            </aside>
                            <div className="rv-mock-main">
                                <div className="rv-mock-kpis">
                                    {[
                                        { l: "Açık Sipariş", v: "18", d: "+3" },
                                        { l: "Teklif Hattı", v: "₺2,4M", d: "+12%" },
                                        { l: "Stok Değeri", v: "₺8,1M", d: "" },
                                        { l: "Bu Ay Üretim", v: "69", d: "↑" },
                                    ].map((k) => (
                                        <div key={k.l} className="rv-kpi">
                                            <span className="rv-kpi-l">{k.l}</span>
                                            <span className="rv-kpi-v">{k.v}</span>
                                            {k.d && <span className="rv-kpi-d">{k.d}</span>}
                                        </div>
                                    ))}
                                </div>
                                <div className="rv-mock-chart">
                                    <span className="rv-mock-cap">Ciro · son 8 ay</span>
                                    <div className="rv-bars">
                                        {mockBars.map((h, i) => (
                                            <span key={i} style={{ height: `${h}%` }} />
                                        ))}
                                    </div>
                                </div>
                                <div className="rv-mock-table">
                                    {mockOrders.map((o) => (
                                        <div key={o.no} className="rv-row">
                                            <span className="rv-row-no">{o.no}</span>
                                            <span className="rv-row-name">{o.name}</span>
                                            <span className={`rv-pill rv-${o.tone}`}>{o.status}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="rv-art-glow" aria-hidden />
                </div>
            </section>

            {/* MODULE STRIP */}
            <section className="rv-strip">
                <span className="rv-strip-label">Tek sistem, tüm operasyon</span>
                <div className="rv-strip-chips">
                    {modules.map((m) => (
                        <span key={m} className="rv-chip">
                            <RovenMark size={11} decorative />
                            {m}
                        </span>
                    ))}
                </div>
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

            {/* ÖZELLİKLER */}
            <section id="ozellikler" className="rv-section">
                <div className="rv-sec-head">
                    <span className="rv-kicker">Özellikler</span>
                    <h2 className="rv-h2">Operasyonu yöneten değil, hızlandıran sistem</h2>
                </div>
                <div className="rv-grid">
                    {features.map((f) => {
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

            {/* NASIL ÇALIŞIR */}
            <section id="nasil" className="rv-section rv-section-alt">
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

            {/* YAPAY ZEKA */}
            <section id="yapayzeka" className="rv-ai">
                <div className="rv-ai-inner">
                    <span className="rv-kicker">Yapay zeka, gösteriş için değil</span>
                    <h2 className="rv-h2">Belgeyi okur. Riski söyler. Öneriyi getirir.</h2>
                    <p className="rv-ai-p">
                        Yapay zeka anahtarı tanımlıyken Roven tedarikçi listelerini ve
                        müşteri belgelerini okur, stok riskleri için bulgu çıkarır ve satın
                        alma önerisini zenginleştirir. Her öneri kaydedilir ve izlenebilir —
                        kara kutu değil, çalışan bir asistan. Anahtar yoksa aynı akış kural
                        tabanlı sürer; hiçbir ekran yapay zekaya bağımlı değildir.
                    </p>
                    <a href="/api/auth/demo" className="rv-btn rv-btn-primary">
                        Yapay zekayı demoda dene <ArrowRight size={16} />
                    </a>
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

            {/* SSS — yerel <details>: JS'siz açılır, ekran okuyucu ve klavye hazır */}
            <section id="sss" className="rv-section rv-section-alt">
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

            {/* SON CTA — İLETİŞİM.
                Eskiden burada üçüncü bir "Demoyu gez" bloğu vardı; demo bağlantısı
                sayfada zaten dört kez geçiyor. Ziyaretçi buraya kadar okuduysa
                eksik olan bilgi değil, KONUŞMA — o yüzden son blok formdur. */}
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
                <Link href="/gizlilik" className="rv-foot-tag tap-44-v" style={{ color: "inherit", textDecoration: "underline" }}>
                    Gizlilik ve Aydınlatma Metni
                </Link>
                <span className="rv-foot-copy">© {new Date().getFullYear()} Roven</span>
            </footer>
        </div>
    );
}


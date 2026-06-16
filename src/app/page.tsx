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
import RovenLogo from "@/components/layout/RovenLogo";

export const metadata: Metadata = {
    title: "Roven — Yapay Zeka Destekli ERP",
    description:
        "Teklif, sipariş, stok, üretim ve muhasebe tek ekranda. Yapay zeka belgelerinizi okur, riskleri önceden söyler. Endüstriyel ve B2B işletmeler için modern ERP.",
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
        title: "Yapay Zeka ile İçe Aktarma",
        desc: "PDF veya Excel’i sürükle bırak — yapay zeka satırları, ürünleri ve fiyatları otomatik çıkarır. Saatlerce süren veri girişi saniyelere iner.",
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
        title: "Akıllı Uyarı Motoru",
        desc: "Kritik stok, geciken sevkiyat, süresi dolan teklif, vadesi yaklaşan iş — yapay zeka riskleri sen fark etmeden önce söyler.",
    },
    {
        icon: RefreshCw,
        title: "Muhasebe Entegrasyonu",
        desc: "Faturalar otomatik muhasebeye akar. Mutabakat, hata yönetimi ve yeniden deneme dahil — çift veri girişi tarih oluyor.",
    },
    {
        icon: Sparkles,
        title: "Satın Alma Önerileri",
        desc: "Yapay zeka tüketim hızını ve tedarik süresini okur, neyi ne zaman sipariş etmen gerektiğini önerir. Ne stoksuz kal ne fazla bağla.",
    },
];

const steps = [
    {
        no: "01",
        title: "Belgeni bırak",
        desc: "Tedarikçi listesini, müşteri siparişini ya da Excel’i sisteme bırak. Yapay zeka geri kalanını halleder.",
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
    { no: "ORD-2040", name: "Ege Vana Sanayi", status: "Rezerve", tone: "warning" },
    { no: "ORD-2039", name: "Marmara Endüstri", status: "Sevk", tone: "accent" },
    { no: "ORD-2038", name: "Toros Akışkan Ltd.", status: "Bekliyor", tone: "muted" },
];

const mockBars = [38, 54, 41, 67, 49, 72, 60, 84];

export default function LandingPage() {
    return (
        <div className="rv-root">
            <style>{css}</style>

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
                    <a href="#nasil">Nasıl çalışır</a>
                    <a href="#yapayzeka">Yapay zeka</a>
                </nav>
                <div className="rv-nav-cta">
                    <Link href="/login" className="rv-link-quiet">
                        Giriş Yap
                    </Link>
                    <a href="/api/auth/demo" className="rv-btn rv-btn-primary rv-btn-sm">
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
                            <span className="rv-win-url">app.roven · Genel Bakış</span>
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
                            <svg width="9" height="10" viewBox="0 0 24 24" aria-hidden>
                                <polygon
                                    points="12,2.8 19.97,7.4 19.97,16.6 12,21.2 4.03,16.6 4.03,7.4"
                                    fill="currentColor"
                                />
                            </svg>
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
                        Roven’in yapay zekası tedarikçi listelerini ve müşteri belgelerini
                        anlar, kritik stok ve gecikmeleri önceden işaretler, ne zaman ne
                        sipariş edeceğini önerir. Her öneri kaydedilir ve izlenebilir —
                        kara kutu değil, çalışan bir asistan.
                    </p>
                    <a href="/api/auth/demo" className="rv-btn rv-btn-primary">
                        Yapay zekayı demoda dene <ArrowRight size={16} />
                    </a>
                </div>
            </section>

            {/* SON CTA */}
            <section className="rv-final">
                <h2 className="rv-final-h">
                    İşletmeni tek ekrandan yönetmeye<br />bugün başla.
                </h2>
                <div className="rv-hero-cta" style={{ justifyContent: "center" }}>
                    <a href="/api/auth/demo" className="rv-btn rv-btn-primary rv-btn-lg">
                        Demoyu gez <ArrowRight size={16} />
                    </a>
                    <Link href="/login" className="rv-btn rv-btn-ghost rv-btn-lg">
                        Giriş Yap
                    </Link>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="rv-footer">
                <span className="rv-brand">
                    <RovenLogo size={16} wordmarkSize={14} />
                </span>
                <span className="rv-foot-tag">Yapay zeka destekli ERP — endüstriyel ve B2B işletmeler için</span>
                <span className="rv-foot-copy">© {new Date().getFullYear()} Roven</span>
            </footer>
        </div>
    );
}

const css = `
.rv-root{
  /* Pazarlama sayfası imza koyu temaya pinli — ziyaretçinin OS temasından bağımsız.
     Yalnız bu sayfada kullanılan token'lar override edilir (globals.css koyu paleti). */
  --bg-primary:#1a1d23;--bg-secondary:#131518;--bg-tertiary:#22252c;
  --text-primary:#e6edf3;--text-secondary:#aeb7c4;--text-tertiary:#7a8493;
  --border-primary:#505a66;--border-secondary:#424b57;--border-tertiary:#343d49;
  --accent:#58a6ff;--accent-bg:rgba(56,139,253,0.15);--accent-glow:rgba(56,139,253,0.35);
  --accent-border:#388bfd;--accent-text:#58a6ff;
  --success-text:#3fb950;--success-bg:rgba(63,185,80,0.15);--success-border:#2ea043;
  --warning-text:#d29922;--warning-bg:rgba(210,153,34,0.15);--warning-border:#bb8009;
  --danger-border:#da3633;--surface-border:#444d58;
  --nav-active-bg:rgba(56,139,253,0.15);--nav-active-border:rgba(56,139,253,0.32);
  color-scheme:dark;
  position:relative;min-height:100vh;overflow-x:clip;
  background:var(--bg-secondary);color:var(--text-primary);
  font-family:var(--font-geist-sans),system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.rv-root a{color:inherit;text-decoration:none}

/* atmosfer */
.rv-bg-mesh{position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(60% 50% at 72% -8%, rgba(56,139,253,0.22), transparent 70%),
    radial-gradient(45% 40% at 8% 0%, rgba(56,139,253,0.10), transparent 70%),
    radial-gradient(70% 60% at 50% 120%, rgba(56,139,253,0.07), transparent 70%);}
.rv-bg-grid{position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.5;
  -webkit-mask-image:linear-gradient(180deg,#000,transparent 60%);
  mask-image:linear-gradient(180deg,#000,transparent 60%);
  background-image:
    linear-gradient(rgba(255,255,255,0.035) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,0.035) 1px,transparent 1px);
  background-size:64px 64px;}
.rv-bg-grain{position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.05;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}

.rv-nav,.rv-hero,.rv-strip,.rv-band,.rv-section,.rv-ai,.rv-final,.rv-footer{position:relative;z-index:1}

/* NAV */
.rv-nav{max-width:1140px;margin:0 auto;padding:18px 28px;display:flex;align-items:center;gap:28px}
.rv-brand{display:inline-flex;color:var(--text-primary)}
.rv-nav-links{display:flex;gap:22px;margin-left:14px}
.rv-nav-links a{font-size:13.5px;color:var(--text-tertiary);transition:color .15s}
.rv-nav-links a:hover{color:var(--text-primary)}
.rv-nav-cta{margin-left:auto;display:flex;align-items:center;gap:14px}
.rv-link-quiet{font-size:13.5px;color:var(--text-secondary);transition:color .15s}
.rv-link-quiet:hover{color:var(--text-primary)}

/* buttons */
.rv-btn{display:inline-flex;align-items:center;gap:7px;font-size:14px;font-weight:550;
  padding:11px 20px;border-radius:9px;cursor:pointer;transition:transform .15s,box-shadow .2s,background .2s,border-color .2s;
  border:1px solid transparent;white-space:nowrap}
.rv-btn-sm{padding:7px 14px;font-size:13px;border-radius:8px}
.rv-btn-lg{padding:14px 26px;font-size:15px}
.rv-btn-primary{color:#06121f;background:linear-gradient(180deg,#79c0ff,#388bfd);
  border-color:rgba(121,192,255,.55);box-shadow:0 10px 30px -8px rgba(56,139,253,.55),inset 0 1px 0 rgba(255,255,255,.35);font-weight:650}
.rv-btn-primary:hover{transform:translateY(-2px);box-shadow:0 16px 40px -8px rgba(56,139,253,.7),inset 0 1px 0 rgba(255,255,255,.4)}
.rv-btn-ghost{color:var(--text-primary);background:rgba(255,255,255,.04);border-color:var(--border-secondary)}
.rv-btn-ghost:hover{background:rgba(255,255,255,.08);border-color:var(--border-primary);transform:translateY(-2px)}

/* HERO */
.rv-hero{max-width:1140px;margin:0 auto;padding:64px 28px 40px;display:grid;
  grid-template-columns:1.02fr .98fr;gap:48px;align-items:center}
.rv-hero-copy{min-width:0}
.rv-eyebrow{display:inline-flex;align-items:center;gap:8px;font-family:var(--font-geist-mono),monospace;
  font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-text);
  background:var(--accent-bg);border:1px solid var(--accent-border);padding:6px 13px;border-radius:999px}
.rv-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}
.rv-h1{font-size:60px;line-height:1.02;letter-spacing:-.035em;font-weight:680;margin:22px 0 0}
.rv-h1-accent{background:linear-gradient(110deg,#79c0ff,#58a6ff 55%,#9fd0ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.rv-sub{font-size:17px;line-height:1.6;color:var(--text-secondary);max-width:30em;margin:22px 0 0}
.rv-hero-cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}
.rv-trust{display:flex;gap:18px;flex-wrap:wrap;margin-top:24px;font-size:12.5px;color:var(--text-tertiary)}
.rv-trust span{display:inline-flex;align-items:center;gap:6px}
.rv-trust svg{color:var(--success-text)}

/* HERO ART */
.rv-hero-art{position:relative;min-width:0}
.rv-art-glow{position:absolute;inset:-12% -8% -18% -8%;z-index:-1;border-radius:50%;
  background:radial-gradient(closest-side,rgba(56,139,253,.30),transparent 75%);filter:blur(28px)}
.rv-window{border:1px solid var(--surface-border);border-radius:14px;overflow:hidden;max-width:100%;
  background:var(--bg-primary);box-shadow:0 40px 80px -30px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.02);
  transform:perspective(1600px) rotateY(-9deg) rotateX(3deg);transform-origin:left center}
.rv-win-bar{display:flex;align-items:center;gap:7px;padding:10px 14px;border-bottom:1px solid var(--border-tertiary);background:var(--bg-secondary)}
.rv-win-bar i{width:9px;height:9px;border-radius:50%;background:var(--border-primary)}
.rv-win-url{margin-left:10px;font-family:var(--font-geist-mono),monospace;font-size:11px;color:var(--text-tertiary)}
.rv-win-body{display:grid;grid-template-columns:118px 1fr;min-height:300px}
.rv-mock-side{border-right:1px solid var(--border-tertiary);padding:12px 9px;display:flex;flex-direction:column;gap:3px;background:var(--bg-secondary)}
.rv-mock-logo{display:inline-flex;color:var(--text-primary);padding:2px 6px 10px}
.rv-mock-nav{font-size:11.5px;color:var(--text-tertiary);padding:6px 8px;border-radius:6px}
.rv-mock-nav.on{color:var(--text-primary);background:var(--nav-active-bg);border:1px solid var(--nav-active-border)}
.rv-mock-main{padding:14px;display:flex;flex-direction:column;gap:11px;min-width:0}
.rv-mock-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.rv-kpi{border:1px solid var(--border-tertiary);border-radius:8px;padding:9px 10px;display:flex;flex-direction:column;gap:3px;background:var(--bg-secondary)}
.rv-kpi-l{font-size:9.5px;color:var(--text-tertiary)}
.rv-kpi-v{font-size:16px;font-weight:680;letter-spacing:-.02em}
.rv-kpi-d{font-size:9.5px;color:var(--success-text);font-family:var(--font-geist-mono),monospace}
.rv-mock-chart{border:1px solid var(--border-tertiary);border-radius:8px;padding:11px 12px;background:var(--bg-secondary)}
.rv-mock-cap{font-size:10px;color:var(--text-tertiary)}
.rv-bars{display:flex;align-items:flex-end;gap:7px;height:64px;margin-top:9px}
.rv-bars span{flex:1;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#58a6ff,rgba(56,139,253,.25));min-height:6px}
.rv-mock-table{display:flex;flex-direction:column;gap:1px}
.rv-row{display:grid;grid-template-columns:64px 1fr auto;align-items:center;gap:8px;padding:7px 4px;border-top:1px solid var(--border-tertiary);font-size:11px}
.rv-row-no{font-family:var(--font-geist-mono),monospace;color:var(--text-tertiary);font-size:10px}
.rv-row-name{color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rv-pill{font-size:9.5px;padding:2px 8px;border-radius:999px;border:1px solid}
.rv-pill.rv-success{color:var(--success-text);background:var(--success-bg);border-color:var(--success-border)}
.rv-pill.rv-warning{color:var(--warning-text);background:var(--warning-bg);border-color:var(--warning-border)}
.rv-pill.rv-accent{color:var(--accent-text);background:var(--accent-bg);border-color:var(--accent-border)}
.rv-pill.rv-muted{color:var(--text-tertiary);background:var(--bg-tertiary);border-color:var(--border-tertiary)}

/* STRIP */
.rv-strip{max-width:1140px;margin:0 auto;padding:26px 28px;display:flex;align-items:center;gap:26px;flex-wrap:wrap;
  border-top:1px solid var(--border-tertiary);border-bottom:1px solid var(--border-tertiary)}
.rv-strip-label{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-tertiary)}
.rv-strip-chips{display:flex;gap:9px;flex-wrap:wrap}
.rv-chip{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--text-secondary);
  padding:7px 14px;border:1px solid var(--border-tertiary);border-radius:999px;background:var(--bg-primary)}
.rv-chip svg{color:var(--accent)}

/* BAND */
.rv-band{max-width:900px;margin:0 auto;padding:74px 28px;text-align:center}
.rv-band-strike{font-size:21px;color:var(--text-tertiary);text-decoration:line-through;text-decoration-color:var(--danger-border);line-height:1.5;margin:0}
.rv-band-fix{font-size:30px;font-weight:650;letter-spacing:-.02em;margin:16px 0 0}
.rv-band-fix span{color:var(--accent-text)}

/* SECTIONS */
.rv-section{max-width:1140px;margin:0 auto;padding:36px 28px 56px}
.rv-section-alt{background:linear-gradient(180deg,rgba(255,255,255,.012),transparent);border-top:1px solid var(--border-tertiary)}
.rv-sec-head{max-width:640px;margin-bottom:36px}
.rv-kicker{font-family:var(--font-geist-mono),monospace;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-text)}
.rv-h2{font-size:34px;line-height:1.12;letter-spacing:-.025em;font-weight:660;margin:14px 0 0}
.rv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.rv-card{padding:24px 22px;border:1px solid var(--border-tertiary);border-radius:14px;background:var(--bg-primary);
  transition:transform .2s,border-color .2s,box-shadow .2s}
.rv-card:hover{transform:translateY(-4px);border-color:var(--accent-border);box-shadow:0 24px 50px -24px rgba(56,139,253,.4)}
.rv-card-ico{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;
  color:var(--accent-text);background:var(--accent-bg);border:1px solid var(--accent-border);margin-bottom:16px}
.rv-card-t{font-size:16.5px;font-weight:620;margin:0 0 8px}
.rv-card-d{font-size:13.5px;line-height:1.6;color:var(--text-secondary);margin:0}

/* STEPS */
.rv-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.rv-step{padding:26px 22px;border:1px solid var(--border-tertiary);border-radius:14px;background:var(--bg-primary);position:relative;overflow:hidden}
.rv-step-no{font-family:var(--font-geist-mono),monospace;font-size:34px;font-weight:700;color:transparent;-webkit-text-stroke:1px var(--accent-border);opacity:.65}
.rv-step-t{font-size:17px;font-weight:620;margin:10px 0 8px}
.rv-step-d{font-size:13.5px;line-height:1.6;color:var(--text-secondary);margin:0}

/* AI */
.rv-ai{padding:84px 28px}
.rv-ai-inner{max-width:760px;margin:0 auto;text-align:center;
  border:1px solid var(--accent-border);border-radius:22px;padding:52px 40px;
  background:radial-gradient(120% 140% at 50% -20%,rgba(56,139,253,.16),transparent 60%),var(--bg-primary)}
.rv-ai-p{font-size:16px;line-height:1.65;color:var(--text-secondary);margin:16px auto 28px;max-width:46em}

/* FINAL */
.rv-final{max-width:1140px;margin:0 auto;padding:40px 28px 92px;text-align:center}
.rv-final-h{font-size:40px;line-height:1.12;letter-spacing:-.03em;font-weight:680;margin:0 0 30px}

/* FOOTER */
.rv-footer{max-width:1140px;margin:0 auto;padding:26px 28px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;
  border-top:1px solid var(--border-tertiary)}
.rv-foot-tag{font-size:12.5px;color:var(--text-tertiary)}
.rv-foot-copy{margin-left:auto;font-size:12px;color:var(--text-tertiary);font-family:var(--font-geist-mono),monospace}

/* entrance */
@keyframes rvRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.rv-rise{opacity:0;animation:rvRise .7s cubic-bezier(.2,.7,.2,1) forwards}

@media (max-width:900px){
  .rv-nav-links{display:none}
  .rv-hero{grid-template-columns:1fr;padding:40px 22px;gap:34px}
  .rv-hero-art{order:2}
  .rv-window{transform:none}
  .rv-h1{font-size:38px}
  .rv-sub{font-size:15.5px;max-width:none}
  .rv-h2{font-size:27px}
  .rv-grid,.rv-steps{grid-template-columns:1fr}
  .rv-band-fix{font-size:24px}
  .rv-final-h{font-size:30px}
  .rv-foot-copy{margin-left:0}
}
@media (max-width:460px){
  .rv-h1{font-size:31px}
  .rv-nav{padding:16px 20px;gap:12px}
  .rv-strip,.rv-section,.rv-final,.rv-footer{padding-left:20px;padding-right:20px}
  .rv-ai-inner{padding:38px 24px}
}
.rv-h1,.rv-h2,.rv-sub,.rv-band-fix,.rv-final-h{overflow-wrap:break-word}
@media (prefers-reduced-motion:reduce){.rv-rise{animation:none;opacity:1}}
`;

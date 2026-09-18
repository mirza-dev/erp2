/**
 * Pazarlama yüzeylerinin ortak stil dizesi.
 *
 * `page.tsx`ten buraya TAŞINDI (içerik birebir aynı): rehber sayfaları da aynı
 * `rv-*` dilini kullanıyor ve token bloğunu ikinci kez yazmak, iki yüzeyin
 * zamanla sessizce ayrışması demekti. Next'in route-segment kuralı bir
 * `page.tsx`ten rastgele sabit export edilmesine izin vermediği için ortak modül.
 */
export const MARKETING_CSS = `
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

/* SECTORS */
.rv-sectors{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--border-tertiary);border-radius:14px;overflow:hidden;background:var(--bg-primary)}
.rv-sector{padding:22px 20px;border-left:1px solid var(--border-tertiary);min-width:0}
.rv-sector:first-child{border-left:0}
.rv-sector-t{font-size:15px;font-weight:620;margin:0 0 8px;color:var(--text-primary)}
.rv-sector-d{font-size:13px;line-height:1.6;color:var(--text-secondary);margin:0}

/* FAQ */
.rv-faq{max-width:760px;display:flex;flex-direction:column;border-top:1px solid var(--border-tertiary)}
.rv-faq-item{border-bottom:1px solid var(--border-tertiary)}
.rv-faq-q{position:relative;list-style:none;cursor:pointer;padding:16px 36px 16px 0;font-size:16px;font-weight:600;color:var(--text-primary);line-height:1.4}
.rv-faq-q::-webkit-details-marker{display:none}
.rv-faq-q::before{content:"";position:absolute;right:6px;top:50%;width:9px;height:9px;border-right:1.5px solid var(--text-tertiary);border-bottom:1.5px solid var(--text-tertiary);transform:translateY(-70%) rotate(45deg);transition:transform .2s}
.rv-faq-item[open] .rv-faq-q::before{transform:translateY(-30%) rotate(225deg)}
.rv-faq-q:focus-visible{outline:2px solid var(--accent-border);outline-offset:2px;border-radius:6px}
.rv-faq-a{font-size:14.5px;line-height:1.65;color:var(--text-secondary);margin:0;padding:0 36px 18px 0}

/* AI */
.rv-ai{padding:84px 28px}
.rv-ai-inner{max-width:760px;margin:0 auto;text-align:center;
  border:1px solid var(--accent-border);border-radius:22px;padding:52px 40px;
  background:radial-gradient(120% 140% at 50% -20%,rgba(56,139,253,.16),transparent 60%),var(--bg-primary)}
.rv-ai-p{font-size:16px;line-height:1.65;color:var(--text-secondary);margin:16px auto 28px;max-width:46em}

/* FINAL */
/* FİYAT */
.rv-sec-p{font-size:15.5px;line-height:1.65;color:var(--text-secondary);margin:14px 0 0}
.rv-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:stretch}
.rv-plan{display:flex;flex-direction:column;position:relative;padding:24px 22px;border-radius:14px;
  border:1px solid var(--border-tertiary);background:var(--bg-primary)}
.rv-plan-hi{border-color:var(--accent-border);box-shadow:0 0 0 1px var(--accent-border),0 14px 40px -22px var(--accent-glow)}
.rv-plan-tag{position:absolute;top:-10px;left:22px;padding:3px 10px;border-radius:999px;
  background:var(--accent-border);color:#fff;font-size:11px;font-weight:650;letter-spacing:.01em}
.rv-plan-n{font-size:17px;font-weight:650;margin:0;color:var(--text-primary)}
.rv-plan-for{font-size:13px;color:var(--text-tertiary);margin:5px 0 0;min-height:34px}
.rv-plan-p{margin:14px 0 0;display:flex;align-items:baseline;gap:6px}
.rv-plan-num{font-size:34px;font-weight:700;letter-spacing:-.02em;color:var(--text-primary);font-variant-numeric:tabular-nums}
.rv-plan-cur{font-size:15px;font-weight:600;color:var(--text-secondary)}
.rv-plan-once{font-size:12px;color:var(--text-tertiary);margin:3px 0 0}
.rv-plan-list{list-style:none;padding:0;margin:18px 0 22px;display:flex;flex-direction:column;gap:9px;flex:1}
.rv-plan-list li{display:flex;gap:9px;font-size:13.5px;line-height:1.5;color:var(--text-secondary)}
.rv-plan-list svg{flex-shrink:0;margin-top:3px;color:var(--success-text)}
.rv-plan-cta{width:100%;justify-content:center}

.rv-care{margin-top:26px;padding:22px;border-radius:14px;border:1px solid var(--border-tertiary);background:var(--bg-primary)}
.rv-care-head{max-width:620px}
.rv-care-h{font-size:16px;font-weight:650;margin:0;color:var(--text-primary)}
.rv-care-p{font-size:13.5px;line-height:1.6;color:var(--text-secondary);margin:6px 0 0}
.rv-care-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px}
.rv-care-item{display:flex;flex-direction:column;gap:5px;padding:14px 16px;border-radius:11px;background:var(--bg-tertiary)}
.rv-care-n{font-size:13px;font-weight:650;color:var(--text-primary)}
.rv-care-price{font-size:19px;font-weight:700;color:var(--accent-text);font-variant-numeric:tabular-nums}
.rv-care-per{font-size:12px;font-weight:500;color:var(--text-tertiary)}
.rv-care-d{font-size:12.5px;line-height:1.55;color:var(--text-secondary)}
.rv-price-foot{font-size:12.5px;line-height:1.6;color:var(--text-tertiary);margin:18px 0 0;max-width:760px}

/* SON CTA — İLETİŞİM */
.rv-final{max-width:1140px;margin:0 auto;padding:40px 28px 92px}
.rv-final-inner{display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:start;
  border-top:1px solid var(--border-tertiary);padding-top:44px}
.rv-final-h{font-size:34px;line-height:1.14;letter-spacing:-.028em;font-weight:680;margin:14px 0 0}
.rv-final-p{font-size:15px;line-height:1.7;color:var(--text-secondary);margin:16px 0 0}
.rv-final-list{list-style:none;padding:0;margin:18px 0 0;display:flex;flex-direction:column;gap:8px}
.rv-final-list li{display:flex;gap:9px;font-size:13.5px;color:var(--text-secondary)}
.rv-final-list svg{flex-shrink:0;margin-top:3px;color:var(--success-text)}
.rv-final-alt{font-size:13px;color:var(--text-tertiary);margin:20px 0 0}
.rv-final-link{color:var(--accent-text);text-decoration:underline}
.rv-final-form{padding:24px;border-radius:14px;border:1px solid var(--border-tertiary);background:var(--bg-primary)}

/* FORM */
.rv-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.rv-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.rv-field-wide{grid-column:1/-1}
.rv-lbl{font-size:11px;font-weight:600;letter-spacing:.02em;color:var(--text-secondary)}
.rv-input{width:100%;padding:9px 11px;border-radius:9px;font-size:14px;font-family:inherit;
  background:var(--bg-tertiary);border:1px solid var(--border-tertiary);color:var(--text-primary)}
.rv-input:focus{outline:none;border-color:var(--accent-border);box-shadow:0 0 0 3px var(--accent-bg)}
.rv-input[aria-invalid="true"]{border-color:var(--danger-border)}
.rv-textarea{resize:vertical;min-height:88px;line-height:1.55}
/* Bal küpü: ekranda yok ama display:none DEĞİL — bazı botlar gizli alanı atlar.
   (Bu blok bir template literal içindedir: ters tırnak KULLANMA.) */
.rv-honey{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.rv-form-err{margin:12px 0 0;padding:9px 12px;border-radius:9px;font-size:13px;
  background:var(--danger-bg,rgba(218,54,51,.13));border:1px solid var(--danger-border);color:var(--text-primary)}
.rv-form-foot{margin-top:16px;display:flex;flex-direction:column;gap:10px}
.rv-form-foot .rv-btn{width:100%;justify-content:center}
.rv-form-note{font-size:12px;line-height:1.55;color:var(--text-tertiary)}
.rv-form-note a{color:var(--accent-text);text-decoration:underline}
.rv-form-done{text-align:center;padding:12px 4px}
.rv-form-done-i{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;
  border-radius:50%;background:var(--success-bg);color:var(--success-text);border:1px solid var(--success-border)}
.rv-form-done-h{font-size:18px;font-weight:650;margin:14px 0 0;color:var(--text-primary)}
.rv-form-done-p{font-size:13.5px;line-height:1.6;color:var(--text-secondary);margin:8px 0 18px}

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
  .rv-sectors{grid-template-columns:1fr 1fr}
  .rv-sector{border-left:0;border-top:1px solid var(--border-tertiary)}
  .rv-sector:nth-child(-n+2){border-top:0}
  .rv-sector:nth-child(even){border-left:1px solid var(--border-tertiary)}
  .rv-band-fix{font-size:24px}
  .rv-final-h{font-size:30px}
  .rv-foot-copy{margin-left:0}
  .rv-plans{grid-template-columns:1fr}
  .rv-plan-for{min-height:0}
  .rv-care-grid{grid-template-columns:1fr}
  .rv-final-inner{grid-template-columns:1fr;gap:32px}
}
@media (max-width:460px){
  .rv-h1{font-size:31px}
  .rv-sectors{grid-template-columns:1fr}
  .rv-sector:nth-child(even){border-left:0}
  .rv-sector:nth-child(2){border-top:1px solid var(--border-tertiary)}
  .rv-nav{padding:16px 20px;gap:12px}
  .rv-strip,.rv-section,.rv-final,.rv-footer{padding-left:20px;padding-right:20px}
  .rv-ai-inner{padding:38px 24px}
  .rv-form-grid{grid-template-columns:1fr}
  .rv-final-form{padding:18px}
  .rv-plan{padding:20px 18px}
  .rv-plan-num{font-size:30px}
}
.rv-h1,.rv-h2,.rv-sub,.rv-band-fix,.rv-final-h{overflow-wrap:break-word}
@media (prefers-reduced-motion:reduce){.rv-rise{animation:none;opacity:1}}
`;

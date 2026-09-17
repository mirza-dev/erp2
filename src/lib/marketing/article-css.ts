/**
 * Rehber sayfalarına özel stiller — `MARKETING_CSS`in ÜSTÜNE biner.
 *
 * Token, buton, gezinme ve alt bilgi ortak dosyadan gelir; burada yalnız
 * okuma tipografisi tanımlanır. Ölçü kararı: gövde 17px ve satır 1.75 —
 * açılış sayfasından (15px) bilerek daha iri, çünkü burada işi okumak,
 * orada taramaktır.
 */
export const ARTICLE_CSS = `
.rv-art-wrap{max-width:1140px;margin:0 auto;padding:28px 28px 80px}
.rv-art-head{max-width:720px;padding:18px 0 30px;border-bottom:1px solid var(--border-tertiary)}
.rv-art-h1{font-size:38px;line-height:1.15;letter-spacing:-.028em;font-weight:680;margin:14px 0 0}
.rv-art-meta{display:flex;gap:14px;flex-wrap:wrap;margin:16px 0 0;font-size:12.5px;color:var(--text-tertiary)}
.rv-art-lede{font-size:17px;line-height:1.7;color:var(--text-secondary);margin:16px 0 0}
.rv-art-body{max-width:720px;padding-top:12px}
.rv-art-sec{padding-top:30px}
.rv-art-h2{font-size:24px;line-height:1.25;letter-spacing:-.018em;font-weight:660;margin:0 0 6px;color:var(--text-primary)}
.rv-art-p{font-size:17px;line-height:1.75;color:var(--text-secondary);margin:14px 0 0}
.rv-art-p strong,.rv-art-ul strong,.rv-art-ol strong,.rv-art-note strong{color:var(--text-primary);font-weight:640}
.rv-art-ul,.rv-art-ol{margin:14px 0 0;padding-left:22px;display:flex;flex-direction:column;gap:9px}
.rv-art-ul li,.rv-art-ol li{font-size:16.5px;line-height:1.7;color:var(--text-secondary)}
.rv-art-ul li::marker{color:var(--accent-text)}
.rv-art-ol li::marker{color:var(--accent-text);font-weight:650}
.rv-art-note{font-size:15.5px;line-height:1.65;color:var(--text-secondary);margin:18px 0 0;padding:13px 16px;
  border-left:3px solid var(--accent-border);background:var(--accent-bg);border-radius:0 10px 10px 0}
.rv-art-tw{margin:18px 0 0;overflow-x:auto;border:1px solid var(--border-tertiary);border-radius:12px}
.rv-art-table{width:100%;border-collapse:collapse;min-width:460px;font-size:14.5px}
.rv-art-table th{text-align:left;padding:11px 14px;font-weight:640;color:var(--text-primary);
  background:var(--bg-tertiary);border-bottom:1px solid var(--border-tertiary);white-space:nowrap}
.rv-art-table td{padding:11px 14px;color:var(--text-secondary);border-bottom:1px solid var(--border-tertiary);line-height:1.55}
.rv-art-table tr:last-child td{border-bottom:0}

.rv-art-list{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:34px}
.rv-art-card{display:flex;flex-direction:column;padding:22px 20px;border-radius:14px;
  border:1px solid var(--border-tertiary);background:var(--bg-primary);transition:border-color .2s,transform .15s}
.rv-art-card:hover{border-color:var(--accent-border);transform:translateY(-2px)}
.rv-art-card-t{font-size:17px;font-weight:650;line-height:1.3;margin:0;color:var(--text-primary)}
.rv-art-card-d{font-size:13.5px;line-height:1.6;color:var(--text-secondary);margin:9px 0 14px;flex:1}
.rv-art-card-m{font-size:12px;color:var(--text-tertiary)}

.rv-art-cta{margin-top:44px;padding:26px;border-radius:14px;border:1px solid var(--border-tertiary);
  background:var(--bg-primary);display:flex;gap:20px;align-items:center;flex-wrap:wrap;justify-content:space-between}
.rv-art-cta-t{font-size:18px;font-weight:650;margin:0 0 5px;color:var(--text-primary)}
.rv-art-cta-d{font-size:14px;line-height:1.6;color:var(--text-secondary);margin:0;max-width:520px}
.rv-art-back{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--text-tertiary)}
.rv-art-back:hover{color:var(--accent-text)}

@media (max-width:900px){
  .rv-art-h1{font-size:30px}
  .rv-art-h2{font-size:21px}
  .rv-art-p,.rv-art-lede{font-size:16px}
  .rv-art-list{grid-template-columns:1fr}
}
@media (max-width:460px){
  .rv-art-wrap{padding-left:20px;padding-right:20px}
  .rv-art-h1{font-size:26px}
  .rv-art-cta{padding:20px}
}
`;

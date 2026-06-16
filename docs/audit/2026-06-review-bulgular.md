# İnceleme — Bulgular (2026-06-16)

> **Kapsam:** TAM denetim — `src/` (route + service + lib + supabase + components) +
> `supabase/migrations/` (102 migration). Odak: önceki denetim (`2026-06-guvenlik-dogruluk-bulgulari.md`)
> sonrası eklenen yüzeyler — **RFQ modülü** (mig.100–102, ~9 yeni route, redaction, RPC'ler),
> tedarikçi fiyat geçmişi, son alış-fiyatı ipucu.
> **Araçlar:** semgrep (p/typescript·react·nextjs·owasp-top-ten + `.semgrep/erp-rules.yml`; 88 ham hit, 3 parser-uyarısı [Türkçe sekme etiketleri — bulgu değil]) · gitleaks (`--no-git` working-tree + git-history) · npm audit.
> **Özet:** K:0 Y:0 O:2 D:2 Nit:3
>
> **En kritik 3 madde:**
> 1. **O1** — RFQ `rfq_response_due` vade karşılaştırması `toISOString().slice(0,10)` kullanıyor (Y6 sınıfının yeni-kod regresyonu; İstanbul 00:00–03:00'te bir gün kayar) — `src/lib/supabase/supplier-rfqs.ts:320`.
> 2. **O2** — RFQ "karara bağla" (award) PO'yu istemci-gönderdiği `unit_price`/`quantity` ile açar; tedarikçinin kayıtlı teklif fiyatına/satırına karşı doğrulamaz (audit-izi bütünlüğü) — `supabase/migrations/100_supplier_rfq.sql:383` + `src/lib/rfq-validation.ts:67`.
> 3. **D1** — `orders/expire-quotes` ve `email/retry-failed` CRON_PATHS'te ama route-içi `requireCronSecret` yok (D4 yarım kapanmış; derinlemesine savunma boşluğu) — `src/app/api/orders/expire-quotes/route.ts:8`.
>
> **Mekanik katman sonucu (yanlış-pozitif elenmesi):** Tailwind className (9) = proje CSS sınıfları (`dashboard-grid`/`stats-cards-grid` — "grid" alt-dizesi tetikledi, Tailwind değil) · dangerouslySetInnerHTML (7) = yalnız statik CSS/tema-bootstrap sabitleri (kullanıcı girdisi yok, XSS yok) · hardcoded-renk (33) = belge/PDF/print/error/lightbox (tema-muaf) veya accent-üstü `#fff` (tema turunda kabul) · UTC-date (32) = test fixture'ları + noon/Z-anchored hesaplar (güvenli) + O1'deki gerçek hit · gitleaks (2) = settings placeholder yanlış-pozitifi + test fixture · npm audit high (4: esbuild/picomatch/tsx/vite) = yalnız build/test araçları, runtime değil — yeni runtime advisory yok.

---

## KRİTİK

Yok.

## YÜKSEK

Yok. (Önceki denetimin K1–K5/Y1–Y8 bulguları düzeltilmiş; gate baseline'ları [route-guard-matrix, sql-lint, deps-gate] tutuyor. Yeni RFQ modülü doğru guard + redaction kalıbını izliyor.)

## ORTA

### O1 — RFQ vade karşılaştırması UTC dilimleme (Y6 sınıfının yeni-kod regresyonu)
- **Kanıt:** `src/lib/supabase/supplier-rfqs.ts:320` — `const today = new Date().toISOString().slice(0, 10);` ardından `due_date < today` ile "yanıt bekleyen" RFQ taraması (`dbListRfqsAwaitingResponse`, `rfq_response_due` uyarısı). Aynı kalıp istemcide: `src/app/dashboard/purchase/rfqs/page.tsx:67` (`isOverdue` rozeti). Doğru kalıp repo'da mevcut: `src/lib/stock-utils.ts:289 localISODate()` — önceki denetim Y6 kapsamında 10 noktayı buna çevirdi; RFQ kodu Y6 fix'inden SONRA eklendiği için bu kalıbı kaçırdı.
- **Etki:** İstanbul (UTC+3) 00:00–03:00 penceresinde `today` UTC'de DÜN'ü döner → bugün dolan bir RFQ vadesi taramada bir gün geç "geçmiş" sayılır (uyarı bir gün gecikir); aksi yönde de gün sınırı kayar. Operasyonel görünürlük; veri bozulmaz.
- **Düzeltme:** İki çağrıyı `localISODate(Date.now())` ile değiştir (mekanik; Y6 turunun emsali). Saat-mock'lu bir davranış testi ekle (`date-boundary-locks.test.ts` kalıbı).
- **Efor:** Küçük.

### O2 — RFQ award PO'yu istemci fiyatıyla açar; kayıtlı tedarikçi teklifine karşı doğrulamaz
- **Kanıt:** `supabase/migrations/100_supplier_rfq.sql:383 award_rfq_create_pos` — `p_awards`'tan gelen `unit_price`/`quantity`'i doğrudan `create_purchase_order_with_lines`'a geçirir (satır 415–423); `supplier_rfq_prices`'taki tedarikçinin GERÇEK teklif fiyatına ya da o tedarikçinin o satırı teklif edip etmediğine bakmaz. `src/lib/rfq-validation.ts:67 validateRfqAwards` yalnız şekil/pozitiflik doğrular (`unit_price ≥ 0`, `quantity > 0`), kayıtlı teklifle eşleşme aramaz.
- **Etki:** `manage_rfqs` + `manage_purchase_orders` yetkili bir kullanıcı (veya XSS/CSRF ile oturumu), RFQ'da kayıtlı tedarikçi teklifinden KOPUK bir fiyat/miktarla PO oluşturabilir → RFQ'nun temel değer önermesi ("kim ne kadar teklif verdi → kazanan fiyatıyla PO") audit-izi açısından zedelenir; `is_awarded` işareti gerçek teklif fiyatını yansıtmayabilir. **Hafifletici:** PO satır/başlık toplamları `recompute_pol_line_total`/`recompute_po_totals` trigger'larıyla SUNUCUDA yeniden hesaplanır (049) → toplam matematiği tutarlı (K2 sınıfı değil); yalnız fiyat/satır kaynağı doğrulanmıyor. Yetki gerektirdiğinden Orta.
- **Düzeltme:** Award RPC'sinde her `(rfq_line_id, vendor_id)` için `supplier_rfq_prices`'tan `unit_price`'ı OKU ve PO satırında onu kullan (istemci fiyatını yok say veya tolerans/eşitlik kontrolü uygula); o tedarikçinin o satırı teklif ettiğini doğrula (yoksa RAISE). Alternatif: servis katmanında `dbAwardRfq` öncesi kayıtlı fiyatla karşılaştırma.
- **Efor:** Orta (1 migration + validation/test).

## DÜŞÜK

### D1 — İki CRON route'unda route-içi `requireCronSecret` eksik (D4 yarım kapanmış)
- **Kanıt:** `src/proxy.ts:24 CRON_PATHS` 8 yol listeler; `requireCronSecret` yalnız 6'sında var (parasut/poll-e-documents, parasut/sync-all, quotes/expire, alerts/ai-suggest, orders/check-shipments, email/outbox/process). **Eksik:** `src/app/api/orders/expire-quotes/route.ts:8` (`export async function POST()` — `req` bile almıyor, %100 proxy'ye bağımlı) ve `src/app/api/email/retry-failed/route.ts`. Ayrıca tutarsızlık: hardened `quotes/expire` (requireCronSecret'li) CRON_PATHS'te DEĞİL; CRON_PATHS legacy `orders/expire-quotes`'i (hardening'siz) listeliyor — iki paralel `serviceExpireQuotes` (order-service vs quote-service); cron olarak hangisinin tetiklendiği netleştirilmeli.
- **Etki:** Proxy CRON_SECRET kontrolü baypas edilirse (Next middleware-bypass advisory geçmişi — bu yüzden route-içi kontrol İLK değil DERİNLEMESINE savunma olmalı) bu iki route guard'sız tetiklenir. Düşük; proxy bugün tek hat olarak çalışıyor.
- **Düzeltme:** İki route'a `requireCronSecret(req)` ekle (quotes/expire emsali, `req` opsiyonel imza); CRON_PATHS ile hardened route eşleşmesini düzelt / legacy duplikatı sil.
- **Efor:** Küçük.

### D2 — RFQ award terminal/tekrar-award korumasının kapsamı dar
- **Kanıt:** `award_rfq_create_pos` (`100_supplier_rfq.sql:401`) `status <> 'sent'` ise RAISE eder (iyi: awarded/cancelled tekrar award edilemez). Ancak tek çağrıda aynı `rfq_line_id` birden çok kez/birden çok vendor'a gönderilirse (satır 410 `FOR v_vid IN SELECT DISTINCT vendor_id`) her vendor için ayrı PO açılır; bir satırın yalnız tek vendor'a award edildiğine dair kontrol yok.
- **Etki:** İstemci hatalı payload'da aynı kalemi iki tedarikçiye award ederse iki PO satırı oluşur (çift satın alma). Yetki + UI matrisi pratikte engelliyor; veri bütünlüğü kuralı RPC'de yok. Düşük.
- **Düzeltme:** `p_awards` içinde `rfq_line_id` tekilliğini RPC başında doğrula (DISTINCT count == count) veya validation'a ekle.
- **Efor:** Küçük.

## Nitler (3)

1. `src/components/purchase/PurchaseOrderDocument.tsx:93` — `background: "#eee"` hardcoded; belge/print yüzeyi olduğu için tema-muaf kapsamında ama diğer belge sabitleri gibi `var(--*)` veya açıkça yorumlanmış sabit tercih edilebilir.
2. `src/app/dashboard/purchase/rfqs/page.tsx:67` — O1 ile aynı kalıbın istemci kopyası; O1 düzeltilirken birlikte `localISODate`'e çevrilmeli (tek kaynak).
3. `redactRfqDetailForPerms` (`src/lib/auth/redact.ts:169`) prices ve price_history'de `unit_price`'ı null'lıyor ama `lead_time_days`/`moq`/`valid_until` gibi tedarikçi-takip alanlarına bilinçli dokunmuyor (yorumda belgeli) — fiyat olmadığından sızıntı değil; sınıflandırma kararı netse sorun yok.

---

### Tekrar edilmeyenler (gate/önceki denetim kapsamında)
- Önceki denetimin K1–K5, Y1–Y8, O1–O11, D1–D6 bulguları (`2026-06-guvenlik-dogruluk-bulgulari.md` §8'de ✅ işaretli) — kod doğrulandı, regresyon yok.
- `route-guard-baseline.ts`'teki gerekçeli guard'sız uçlar (alerts/counters/finance/auth/exchange-rates/products-aging/products-quotes/attachments-url/convert) — baseline'da izleniyor.
- AI uçları (`ai/parse`/`ai/score`/`ai/ops-summary`) yalnız `guardAiRoute` (IP rate-limit) — DB mutasyonu YOK (Y2 stock-risk zaten guard'lı); tasarım, yeni bulgu değil.
- npm audit high (esbuild/picomatch/tsx/vite) — yalnız build/test araçları; deps-gate kapsamı; runtime riski yok.
- ESLint/TS, `.next/`, uygulanmış migration'lar, lock dosyaları, test fixture'ları (REVIEW.md "Do not report").

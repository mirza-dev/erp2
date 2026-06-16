# Roven ERP — Kapsamlı İnceleme & Güvenlik Denetimi Bulguları

_Tarih: 2026-06-17 · Ajan: `erp2-reviewer` · Mod: tam denetim (`src/` + `supabase/migrations/`)_

> Önceki tur `2026-06-review-bulgular.md` (2026-06-16) bulguları **kapatılmıştı** (`01501ff` — O1 UTC/O2 award-fiyat/D1 cron-secret/D2 award-tekillik). Bu tur, o düzeltmelerin SONRASINDAKİ kod üzerinde yeni bir tarama; aşağıdaki bulgular farklı noktalardır.

## Özet

| Seviye | Adet | Durum |
|--------|------|-------|
| Kritik (K) | 0 | — |
| Yüksek (Y) | 0 | — |
| Orta (O) | 2 | ✅ O1+O2 düzeltildi (2026-06-17) |
| Düşük (D) | 1 | ✅ D1 düzeltildi (2026-06-17) |
| Nit | 2 | ✅ N1+N2 temizlendi (2026-06-17) |

> **Düzeltme turu (2026-06-17):** O1 (`rfq-service.ts` escapeHtml), O2 (`supplier-rfqs.ts` `buildRfqSearchOrFilter` çift-tırnak escape), D1 (`rfq-archives.ts` upload-önce + `upsert onConflict`) uygulandı. +7 regresyon testi (`src/__tests__/rfq-review-fixes.test.ts`). **Migration GEREKMEZ** (yalnız uygulama kodu).
>
> **Nit temizlik turu (2026-06-17):** N1 — `orders/[id]/page.tsx` teklif-vade karşılaştırması `localISODate(Date.now())`'e çevrildi (tek UTC-slice kalıbı). N2 — `validateRfqAwards` ölü `quantity`/`unit_price` zorunluluğu kaldırıldı (yalnız `{rfq_line_id, vendor_id}` UUID); `RfqAward` tipi daraltıldı; UI `handleAward` gereksiz fiyat/qty payload'ını göndermeyi bıraktı (fiyatsız-kalem UX guard'ı korundu). `rfq-validation.test.ts` award blokları yeni sözleşmeye güncellendi. tsc 0 · lint 0 · **5478 test**.

**Bloklayan bulgu yok.** Etkin yüzey yine **RFQ modülü** (mig.100–103, `src/lib/rfq-*`, `rfq-service.ts`, `supplier-rfqs.ts`, `rfq-archives.ts`, `src/app/api/rfqs/**`).

### RFQ modülü güvenlik temeli — SAĞLAM
- Tüm route'lar `requirePermissionFor` guard'lı.
- Redaction simetrik: `redactRfqDetailForPerms`/`redactPriceHistoryForPerms` + `view_purchase_costs`.
- **mig.103** award fiyat/qty'yi sunucu-otoriter yapmış (önceki turun O2'sini kapatan iyi örnek).
- 7 RFQ tablosunda RLS açık; mig.100/103 fonksiyonları INVOKER (DEFINER-hijyen sınıfı dışı).
- `localISODate` doğru kullanılmış (`supplier-rfqs.ts:322` — önceki O1 kapanmış).
- `award_rfq_create_pos`: status guard + `FOR UPDATE` + mükerrer-satır kontrolü.

### ⚠️ Araç kapsama notu (ÖNEMLİ)
- **semgrep + gitleaks bu oturumda ÇALIŞTIRILAMADI** — sandbox `Bash` iznini bu iki ikili için reddetti (`dangerouslyDisableSandbox` dahil). Mekanik SAST/secret katmanı **atlandı**.
- Bulgular elle (LLM) inceleme + hedefli `grep` (Y6 UTC, `NEXT_PUBLIC` secret, `dangerouslySetInnerHTML`, Tailwind/framer/hardcoded-renk, `revalidateTag`) kontrollerine dayanıyor.
- `npm audit` → deps-gate'te (allowlist boş) zaten CI'da.
- **Tam kapsama için semgrep + gitleaks izinli bir ortamda koşturulmalı** (önceki tur 2026-06-16 koşturabilmişti — bu turda izin reddi yaşandı).

---

## ORTA

### O2 — RFQ liste arama: PostgREST `.or()` filtre enjeksiyonu
- **Kanıt:** `src/lib/supabase/supplier-rfqs.ts:65-67` —
  `const s = \`%${filter.search.trim()}%\`; query = query.or(\`rfq_number.ilike.${s},title.ilike.${s}\`)`.
  Kullanıcı `search` (route `src/app/api/rfqs/route.ts:18`'den, doğrulamasız) doğrudan `.or()` filtre string'ine giriyor.
- **Etki:** Arama terimindeki virgül/PostgREST operatörleri (`,`, `.eq.`, parantez) hedeflenen iki ILIKE koşulundan çıkıp ek OR koşulu enjekte edebilir (örn. `search=x,status.eq.cancelled` → niyet edilmemiş satırlar) veya sorguyu kırıp 500 üretebilir. Sorgu service-role ile koştuğundan RLS savunması yok. Projede free-text aramayı `.or()`'a ham geçiren **tek** yer burası — `vendors.ts:73`/`email-maintenance.ts:199` parametrik `.ilike()` (güvenli) kullanıyor.
- **Düzeltme:** Ortak `escapeOrFilter` helper'ı ile `,`/`(`/`)`/`.` ve `%`/`_` LIKE wildcard'larını escape et; veya iki ayrı parametrik `.ilike()` koşulunu `.or()` yerine güvenli biçimde birleştir.
- **Efor:** Küçük.

### O1 — RFQ tedarikçi e-postası gövdesi escape'siz interpolasyon (HTML enjeksiyonu / konvansiyon sapması)
- **Kanıt:** `src/lib/services/rfq-service.ts:85` —
  `html: \`<p>Sayın ${vendor.vendor_name},</p>...<strong>${detail.rfq_number}</strong>...Yanıt son tarihi: <strong>${detail.due_date}</strong>...\`` — `escapeHtml` YOK.
  Karşı-örnek (proje konvansiyonu): `src/lib/email/templates.ts:422` (`renderQuoteToCustomer`) `${escapeHtml(ctx.customerName)}` kullanıyor.
- **Etki:** `vendor_name` (vendors.name; satın alma personeli girer) `<`/`&` içeriyorsa e-posta HTML'i bozulur; genel olarak escape'siz interpolasyon latent stored-XSS sınıfıdır (alıcı tedarikçinin e-posta istemcisinde). Kurum-içi-kontrollü veri → istismar düşük → Orta. Arşiv HTML belgesi (`rfq-archive-html.ts`) React `renderToStaticMarkup` ile üretildiğinden ZATEN güvenli; sorun yalnız bu inline e-posta gövdesi.
- **Düzeltme:** `vendor_name`, `rfq_number`, `due_date`, `title`'ı `templates.ts`'teki `escapeHtml` ile sarmala.
- **Efor:** Küçük.

---

## DÜŞÜK

### D1 — RFQ yeniden gönderiminde arşiv INSERT'i idempotent değil
- **Kanıt:** `mark_rfq_sent` (mig.100:300) `sent→sent` geçişine izin veriyor. `src/lib/supabase/rfq-archives.ts:40-52` her gönderimde `supplier_rfq_archives`'a INSERT yapıyor; tablo `UNIQUE (rfq_id, vendor_id)` (mig.100:140). İkinci gönderimde insert 23505'e çarpar → `dbCreateRfqArchive` throw → `rfq-service.ts:59-61` non-fatal warning. Storage upload `upsert:true` ama DB insert değil.
- **Etki:** Yeniden gönderim her tedarikçi için yanıltıcı "belge arşivlenemedi" uyarısı üretir; e-posta yine gider. Veri kaybı yok.
- **Düzeltme:** INSERT'i `upsert` (`onConflict: "rfq_id,vendor_id"`) yap.
- **Efor:** Küçük.

---

## Nitler (2)

- **N1** — `src/app/dashboard/orders/[id]/page.tsx:517` istemci-tarafı teklif-vade karşılaştırması `order.quoteValidUntil < new Date().toISOString().slice(0, 10)` Y6 UTC-kayma desenini taşıyor. Yalnız UI gösterimi (sunucu `serviceExpireQuotes` otoriter); `domain-rules.md §Teklif Süresi` bu string-karşılaştırmayı reçete ediyor → bilinçli olabilir. Tutarlılık için `localISODate()` önerilir.
- **N2** — `src/lib/rfq-validation.ts:78-83` `validateRfqAwards` `quantity`/`unit_price` zorunlu kılıyor, ancak mig.103 bu alanları yok sayıp sunucudan türetiyor (`103:16-17`). Ölü/yanıltıcı sözleşme; istemciye gereksiz alan dayatıyor. Validasyonu `{rfq_line_id, vendor_id}` UUID kontrolüne indir.

---

## Tekrar EDİLMEYEN (gate / önceki audit)
- Gate-baseline guard'sız route'ları; deps-gate; önceki audit K1–O11; önceki tur (2026-06-16) O1/O2/D1/D2 (kapatıldı `01501ff`); RLS-missing (tüm RFQ tablolarında açık); DEFINER-hijyen (mig.100/103 INVOKER).

## İlgili dosyalar
- `src/lib/supabase/supplier-rfqs.ts` (O2) · `src/lib/services/rfq-service.ts` (O1) · `src/lib/supabase/rfq-archives.ts` (D1) · `src/app/dashboard/orders/[id]/page.tsx` (N1) · `src/lib/rfq-validation.ts` (N2) · `supabase/migrations/103_rfq_award_integrity.sql` (referans)

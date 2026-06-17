# Ertelenen Büyük İşler (Backlog) — yeni oturumda devam

_Son güncelleme: 2026-06-17. Kullanıcı isteğiyle "sonraki tura bıraktığımız büyük işler" buraya çıkarıldı. Detaylı açık-yükümlülük + smoke listesi `CLAUDE.md` §Açık yükümlülükler'de._

## A. Ertelenmiş büyük teknik turlar (kod)
- **A1. Tam server-side pagination** — ✅ **TAMAMLANDI 6/6** (2026-06-17). orders (pilot) + quotes + purchase/orders + customers + vendors RSC + `loading.tsx` + `db*Paged`/count + `<X>Client.tsx` URL-driven (shared `useListUrlState`/`useDebouncedSearch` + `lib/list-query.orIlikeFilter`). **products** (son liste) farklı çözüldü: sayfa `"use client"` KALDI (risk/alert overlay AI/POST → RSC'ye taşınamaz) ama mega-fetch öldü → `dbListProductsPaged` (arama/çoklu-kategori/tip + **sinyal `id.in`** tam sadakat) + `GET /api/products/counts` (tüm-katalog total/kategori/kritik); sinyal sekmeleri overlay ID seti sunucuya geçer. **Kalan: yalnız manuel smoke** (kod tamamlandı).
- **A2. Upstash rate-limit (denetim O5)** — birçok turda "sonraki tur adayı" denip hiç yapılmadı. Auth/AI/public uçlarda gerçek rate-limit yok.
- **A3. Gate guard-matrix method-seviye tespiti** — orders O1 turunun açık follow-up'ı. `src/__tests__/gate/route-guard-matrix.test.ts:62` dosya-seviye `src.includes` → method-seviye; aynı dosyadaki POST guard'ı GET'i de "korunmuş" sayıyor (kör nokta). 100+ route reclass (büyük/riskli). Tüm repodaki guard'sız GET'leri yakalar.

## B. Devam eden inceleme kampanyası (`erp2-reviewer`, modül modül)
- Tamamlanan derin incelemeler: **RFQ ✅** (`docs/audit/2026-06-17-review-bulgular.md`), **Orders ✅** (`docs/audit/2026-06-17-orders-review-bulgular.md`).
- **Kalan modüller** (henüz derin taranmadı): **quotes · parasut · import/AI · production · customers/products · alerts · settings**.
- Önerilen sıra: **quotes** (orders'la en sıkı bağlı; finansal + rezervasyon kesişimi) ya da **parasut** (dış entegrasyon, en riskli).
- `/erp-review <modül-yolu>` ile veya `erp2-reviewer` ajanını kapsam vererek çağır. Detay [[reference_review_agent]].

## C. Deploy / altyapı doğrulamaları (kod tek başına yetmez)
- **C1. Login "Monolith" canlı tur** — ⚠️ **brick riski**: prod admin `app_metadata.roles` taşımalı VEYA `ADMIN_EMAILS` her iki Coolify env'inde set olmalı; Supabase "Allow new signups = OFF"; Google OAuth redirect-URL allowlist `…/auth/callback` + tarayıcı smoke. (Testler mock'lu, canlı doğrulanmadı.)
- **C2. Paraşüt Faz 12 — Sandbox GATE** — gerçek Paraşüt API ile OAuth + list filtreleri + e-doc trackable_job + stok invariant testleri (`PARASUT_PLAN.md §Faz 12`). Paraşüt şu an MOCK; canlıya geçişin tek büyük bloğu. **Hiç başlanmadı.**

## D. Migration APPLY + smoke (kullanıcı tarafı; yeşil testler kapsamaz)
- ⚠️ **Liste bayat olabilir** — CLAUDE.md §Açık yükümlülükler mig.088 (BLOKER) + mig.091 "APPLY bekliyor" diyor, ama önceki `check-migrations` koşusu "088/090/091/092 CANLIDA UYGULANMIŞ" demişti. **İlk iş: `npx tsx scripts/check-migrations.ts` ile durumu kesinleştir.**
- Smoke listeleri: orders Y1/O2 (PO mal kabul→otomatik allocated + "Yeniden Rezerve Et"; allocated olmadan Sevket disabled) · teklif gönder rezervasyon (088) · teklif e-posta Aşama 1/2 · mig.099 birim smoke.

---
**Sıradaki tur kararı (kullanıcıya sorulacak):** A1 (server-side pagination, en büyük UX etkisi) mi, yoksa B (sıradaki modül derin incelemesi — quotes) mi?

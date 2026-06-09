---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---

> Bu dosya yalnız **güncel odak + açık yükümlülükleri** tutar. Tam oturum geçmişi git log'unda. Aşağıdaki indeks geçmiş oturumlara hızlı bakış içindir.

## Son Tamamlanan İş — 2026-06-10 (**Teklif gönderilince stok rezervasyonu (bekleyen sipariş) — GREEN, PUSH/APPLY BEKLİYOR**)

**Senaryo:** aynı 10 stoğu iki satışçı iki müşteriye teklif → ikisi de kabul → -10 oversell. **Kullanıcı kararı:** rezervasyon teklif GÖNDERİLİNCE (accept'te değil); kabul→sipariş Onaylı. **Strateji A:** `draft→sent`'te accept'in teklif→sipariş dönüşümünü öne çek ama `pending_approval`+`allocate_order_lines` ile rezerve et (sipariş-merkezli motoru reuse). **Yaşam döngüsü:** sent→pending+rezerve · accepted→approve_order · rejected/expired/revised→cancel_order (release). **Migration 088:** `send_quote_and_create_pending_order` (pending+allocate, **zero-stock lenient** kısmi+shortage, arşiv NULL OK, idempotent) + `accept_quote_and_create_order` revize (bağlı pending→approve, yoksa legacy draft) + `cancel_quote_linked_order`. **Servis/route/UI:** sent sonucu reservationWarning/shortages/reservedOrderNumber; reject/expire/revise→cancel (best-effort); gönder onayında rezerve notu + shortage toast. Stok modeli değişmedi (pending zaten reserved). **+16 test · tsc 0 · lint 0 · 5021 test · build 0.** **Sıradaki:** push + **migration 088 APPLY (Supabase)** + smoke (gönder→available_now düşer→ikinci kısmi→reddet→geri→kabul→Onaylı). Edge: pending'i orders'tan elle iptal → rezerv gider teklif sent kalır (kabul).

## Önceki — 2026-06-09 (**Arşiv belgesi render fix + demo e-posta nötrleştirme — PUSH `d9ef1c3`**)

**(A) Arşiv "Belgeyi Aç" bug:** belge yeni sekmede ham HTML kaynağı + UTF-8 mojibake gösteriyordu. Kök neden: Supabase storage signed URL'i donmuş arşiv HTML'ini `text/html` render etmiyor (stored-XSS koruması → metin). Çözüm: arşiv route'una **`?view=1` modu** (`dbDownloadArchiveHtml` → `Content-Type: text/html; charset=utf-8` ile stream) + buton **senkron `window.open`** (popup-blocker de elendi). Eksik arşiv/403 → dostça HTML hata sayfası. JSON modu geriye uyumlu. `orders/[id]`+`quotes/[id]` butonlarından `archiveLoading` kaldırıldı. Commit `6ea6045`.

**(B) Demo e-posta mayını:** seed + mock-data'daki 4 müşteri gerçek firma domain'lerine işaret ediyordu; smoke'ta yanlışlıkla `procurement@abdibrahim.com.tr`'ye gerçek teklif gitti (Resend Sent, bounce yok → muhtemelen spam; özür gereksiz). Fix: tüm müşteri e-postaları `@*.example.com` (RFC 2606); `info@pmt.com.tr` satıcı, dokunulmadı. Commit `fe96937`.

**+6 test · tsc 0 · lint 0 · 5004 test · build 0.** Bounce yok = EMAIL_FROM+Resend+`.html` pipeline çalışıyor (smoke Aşama 1 fiilen yeşil). **Sıradaki:** (1) arşiv fix deploy sonrası görsel doğrula (render + doğru Türkçe); (2) `.html` smoke Aşama 2 (kendi Gmail+Outlook, müşteri e-postasını kendine çevir).

## Önceki — 2026-06-09 (**Teklif "Gönder" → müşteriye HTML ekli e-posta — PUSH `5ecc104`**)

**Kullanıcı isteği:** Teklif detay sayfasında "Gönder"e basınca müşteriye teklif belgesi e-posta ile gitsin (kullanıcı isterse). **Kararlar:** ek = **HTML eki** (binary PDF yok; dondurulmuş arşiv HTML — gerçek PDF chromium/dış-API gerektirir, reddedildi); tetik = **"Gönder" onayına checkbox** (varsayılan işaretli, transition'a bağlı tek-sefer).

**Yapılanlar (6 kod + 6 test):** (1) `sendDirectEmail` attachment primitifi (`email-service.ts`); (2) `renderQuoteToCustomer` müşteri şablonu (`templates.ts`, `shell()`+`hideManageFooter` → müşteriye giden e-postada dashboard footer'ı gizli, XSS escape); (3) `serviceSendQuoteToCustomer` (`quote-service.ts`, arşivle birebir HTML pipeline reuse, `no_email` guard, `email_logs` entity_type='quote'); (4) **`POST /api/quotes/[id]/send-email`** (`manage_quotes` RBAC; 404/400/503/502 map); (5) `dbListFailedEmailsForRetry` NULL-safe `.or("entity_type.is.null,entity_type.neq.quote")` (quote retry exclusion); (6) frontend `[id]/page.tsx`+`quote-display.ts` (draft Gönder confirm + checkbox + post-transition `/send-email`).

**ADVISOR (bug yok, 4 not):** #1 done=kod-complete+green AMA uçtan uca DOĞRULANMADI (EMAIL_FROM altyapısı; kullanıcı düzeltti); #2 **`.html` eki Exchange/Outlook strip/karantina riski** → kullanıcı kararı **önce smoke ile ölç** (Gmail+Outlook), sorunsa PDF-API; #3 RBAC temiz (manage_quotes=admin+sales, ikisi view_sales_prices tutar); #4 frozen arşiv yerine re-render (gelecek "Tekrar Gönder" frozen ekle — kod yorumu). tsc 0 · lint 0 · **4999 test** · build 0 (`ƒ /api/quotes/[id]/send-email`). Migration YOK.

**DURUM: PUSH EDİLDİ** (drift fix `458c14b` + bu iş; mirror main==codex-experiment). **Sıradaki smoke:** Aşama 1 `/api/email/test` EMAIL_FROM doğrula → Aşama 2 gerçek teklif → kendi Gmail+Outlook → `.html` eki geliyor mu/spam mı.

---

## Açık yükümlülükler (kullanıcı doğrulamalı)
- **Teklif e-posta smoke:** Aşama 1 — `EMAIL_FROM`'u `/api/email/test` ile doğrula; Aşama 2 — gerçek teklif "Gönder" → kendi Gmail + Outlook/Exchange → `.html` eki sağlam mı / spam'e düşüyor mu. Sorunluysa PDF-API yoluna geç.
- **Login "Monolith" deploy ön koşulları** (push `27733c6`; canlı tur doğrulanmadı): (1) Supabase "Allow new users to sign up" = OFF (birincil kilit); (2) ⚠️ BRICK RİSKİ — prod admin `app_metadata.roles` VEYA `ADMIN_EMAILS` her iki Coolify env'inde set olmalı (yoksa `isProvisionedUser` guard herkesi kilitler); (3) canlı Google OAuth turu (Supabase provider + `…/auth/callback` allowlist + tarayıcı smoke).
- **Paraşüt Faz 12 — Sandbox GATE:** gerçek API ile OAuth + list filtreleri + e-doc trackable_job + stok invariant doğrulamaları (`PARASUT_PLAN.md` §Faz 12).

## Geçmiş oturum indeksi (en yeniden eskiye — detay git log'unda)
- Önceki — (**Genel Bakış (Executive Dashboard) — TAM-SADIK yeniden kurulum (GREEN, PUSH BEKLİYOR)**)
- Son Tamamlanan İş — (**Login "Monolith" (F) redesign — TR/EN + tema + Google OAuth + reset**)
- Son Tamamlanan İş — (**Veri Aktarım Merkezi — rehber + şeffaflık katmanı**)
- Son Tamamlanan İş — (**Teklif formu ürün açılır-listesi kırpılma fix'i**)
- Son Tamamlanan İş — (**Görsel QA (codex) + iki-branch hizalama + PUSH**)
- Son Tamamlanan İş — (**Branch hizalama audit'i — son commitlerin detaylı kod incelemesi + 3 bulgu düzeltme**)
- Son Tamamlanan İş — (**İki branch'i hizalama — codex ↔ main merge + main hardening re-apply**)
- Önceki — (**Ürün Tipleri sayfası — final ürün [alan düzenleme UI + N+1 fix + a11y modal]**) — ⚠️ product-types değişiklikleri `56ecbd1` merge'inde codex rewrite'ı ile superseded; field_key guard codex yapısına re-apply edildi
- Önceki — (**Satın Alma Siparişi (Yeni) — ürün seçilince birim fiyat + KDV otomatik gelmiyor [FONKSİYONEL bug]**)
- Önceki İş — (**Ayarlar sayfası — final ürün (modal a11y + tablist a11y + entity render bug + hata mesajı paritesi)** — COMMIT+PUSH `b37764a`)
- Önceki İş — (**Cariler (Müşteriler) sayfası — final ürün (toplu-silme bayat satır + hover antipattern + modal a11y + validation parity)** — COMMIT+PUSH `c8057e5`)
- Önceki — (**Üretim Girişi sayfası — final ürün (BOM eksik-bileşen şeffaflığı + silme onayı + a11y)**)
- Önceki — (**Tedarikçiler sayfası — final ürün (a11y modal + görünür yükleme hatası + toplu-seçim kapsamı)**)
- Önceki — (**Satın Alma Siparişleri sayfası — final ürün 2. tur (sessiz yükleme hatası + tarih tutarlılığı)**)
- Önceki — (**Paraşüt Sync sayfası — final ürün (kritik: kırık manuel sync + dürüst durum)**)
- Önceki — (**Satın Alma Siparişleri sayfası — final ürün (eksik kapatma + salt-okuma canlı E2E)**)
- Önceki — (**Öneriler (Satın Alma Önerileri) sayfası — eksik kapatma + canlı E2E**)
- Önceki — (**Stok & Ürünler sayfası — eksik kapatma + canlı E2E**)
- Önceki — (**Satış Siparişleri Faz 3 — HARD rezervasyonu "Bekliyor"a (pending_approval) taşı**)
- Önceki — (**Satış Siparişleri Faz 1+2 — migration 081 APPLY EDİLDİ ✅ + canlı doğrulama**)
- Önceki — (**Teklif V7 Faz 8 Bulgular 1. tur — Paraşüt reconcile retry-bypass + doc/P3**, 2 commit, 4215 test)
- Önceki — (**RBAC Faz 4 TAMAMLANDI — quotes + PO redaction + archive gate**, commit `1db5865`, 4197 test)
- Önceki — (**RBAC Faz 4 (R1-R5) MAIN'E MERGE + PUSH** — merge commit `234d8d9`, 4174 test, build OK)
- Önceki — (Teklif V7 **Faz 8 — Ertelenen Borçlar Kapanışı** — 5 alt-faz/5 commit, 4098 test, COMMIT+PUSH EDİLDİ · **migration 080 APPLY EDİLDİ ✅**)
- Önceki — (Teklif V7 **Faz 7 — Not Şablonları (note_templates)** + Bulgular 1.+2.tur — migration 079, 4098 test, COMMIT+PUSH EDİLDİ · **079 APPLY EDİLDİ ✅**)
- Önceki — (Teklif V7 **Faz 6 Bulgular 3. tur — 3 P3 bulgu** + 2. tur, 4043 test, COMMIT+PUSH EDİLDİ + 077/078 APPLY EDİLDİ ✅)
- Önceki — (Teklif V7 **Faz 6 Bulgular 2. tur — 5 bulgu**, 4043 test, COMMIT+PUSH EDİLDİ `9a57d66` + 077/078 APPLY EDİLDİ ✅)
- Lint sinyali düzeltmesi — (npm run lint artık güvenilir + 0 sorun)
- Son Tamamlanan İş — (Teklif V7 **Faz 6 Bulgular — 5 bulgu review tur**, 4034 test, COMMIT+PUSH EDİLDİ + migration 077 APPLY EDİLDİ ✅ / 078 APPLY BEKLİYOR)
- Önceki — (Teklif V7 **Faz 6 — Accept → Sipariş (atomik)**, 4021 test, COMMIT+PUSH EDİLDİ + migration 077 APPLY EDİLDİ ✅)
- Önceki — (Teklif V7 Faz 4 — Bulgular 4. review tur, COMMIT+PUSH `6c9c317` + migration 075/076 APPLY EDİLDİ ✅)
- Önceki — (Teklif V7 Faz 4 — Bulgular 3. review tur, COMMIT+PUSH `da09dce`)
- Önceki — (Teklif V7 Faz 4 — Bulgular 2. review tur, COMMIT+PUSH `bb3b3f2` + migration 075/076 APPLY BEKLİYOR)
- Önceki — (Teklif V7 Faz 4 — PDF Arşiv: dondurulmuş HTML snapshot + Bulgular 1. review tur, 3951 test, COMMIT+PUSH b8c1613 + migration 075/076 APPLY BEKLİYOR)
- Önceki — (Teklif V7 Revizyon Zinciri — Faz 5'ten ertelenen, 3837 test, COMMIT+PUSH 1d96211 + migration 074 APPLY EDİLDİ + review pass)
- Önceki — (Teklif V7 Faz 5 infra dilim — numara katmanı, 3821 test, COMMIT+PUSH 942ee0d + migration 073 APPLY EDİLDİ)
- Önceki — (Teklif V7 Faz 3 REVIEW DÜZELTMELERİ — Bulgular P1-P3, 2 tur, 3815 test, COMMIT+PUSH 6366cbd+11c5079 + migration 070-072 APPLY EDİLDİ)
- Önceki — (Teklif V7 Faz 3 IMPLEMENT EDİLDİ — header iskonto, 3799 test, COMMIT+PUSH c5d8267 + migration APPLY EDİLDİ)
- Önceki — (Teklif V7 Faz 2 IMPLEMENT EDİLDİ — validasyon katmanı, 3778 test, COMMIT+PUSH afe936b)
- Önceki — (Teklif V7 Faz 1b IMPLEMENT EDİLDİ — QuoteForm entegrasyon, 3729 test, COMMIT+PUSH+APPLY EDİLDİ)
- Önceki — (6. tur: bekleyen UI fix commit/push + V7 bulgu doğrulama)
- Önceki — Teklif Modülü V6 Master Plan (5. tur review, 2026-05-29)
- Önceki — Teklif Modülü V5 Master Plan (4. tur review, 2026-05-29)
- Önceki — Teklif Modülü V4 Master Plan (3. tur review, 2026-05-29)
- Önceki — Teklif Modülü V3 Master Plan (2. tur review, 2026-05-29)
- Önceki — Teklif Modülü V2 Master Plan (1. tur review, 2026-05-29)
- Önceki — Teklifler modülü UI/UX eksiksiz düzeltme (3682 test, 2026-05-28)
- Önceki — SMTP smoke endpoint + deploy runbook (3667 test, 2026-05-28)
- Önceki — Sesli giriş V3 (3657 test, 2026-05-28)
- Önceki — React Doctor only-export-components ×22 fix (3637 test, 2026-05-28)
- Önceki — React Doctor Bölüm 4 (3636 test, 2026-05-28)
- Önceki — React Doctor temizlik (3636 test, 2026-05-27)
- Önceki — UX iyileştirme (3636 test, 2026-05-27)
- Önceki — AI rate limit advisor refinement (3614 test, 2026-05-26)
- Önceki — Route-level AI rate limit (3606 test, 2026-05-26)
- Önceki — M-3 Resilience fix (3581 test, 2026-05-26)
- Önceki — M-3 Review 2 (3575 test, 2026-05-25)
- Önceki — M-3 Review 1 (3569 test)
- Önceki — M-3 ilk implementasyon (3565 test)
- Önceki — Faz 4c (3534 test)
- Önceki — Faz 4b Review 1 (3516 test)
- Önceki — Faz 4b (3512 test)
- Önceki — Import E2E (3493 test)
- Önceki — Faz 4a Review (3491 test)
- Önceki — Faz 4a (3480 test)
- Önceki — Aging E2E 2 fail kapatma (3460 test)
- Önceki — Faz 3d Review 2.tur (3457 test)
- Önceki — Faz 3d Review 1.tur (3455 test)
- Önceki — Faz 3d (3452 test)
- Önceki — Faz 3c Review 5.tur (3441 test)
- Önceki — Faz 3c Review 4.tur (3439 test)
- Önceki — Faz 3c Review 3.tur (3432 test, 2 commit)
- Önceki — Faz 3c Review 2.tur (3419 test, 2 commit)
- Önceki — Faz 3c Review 1.tur (2026-05-22; 3401 test, commit `14a7253`)
- Önceki — Faz 3c (3387 test)
- Önceki — Faz 3b Review 6.tur (3360 test)
- Önceki — Faz 3b Review 5.tur (3350 test)
- Önceki — Faz 3b Review 4.tur (3348 test)
- Önceki — Faz 3b Review 3.tur (3345 test)
- Önceki — Faz 3b Review 2.tur (3329 test)
- Önceki — Faz 3b Review (3326 test)
- Önceki — Faz 3b (3305 test)
- Önceki — Faz 3a Review 3.e (3200 test)
- Önceki — Faz 3a Review 3.d (3200 test)
- Önceki — Faz 3a Review 3.c (3199 test)
- Önceki — Faz 3a Review 3.b (3192 test)
- Önceki — Faz 3a Review 3. tur (3190 test, commit `444dced`)
- Önceki — Faz 3a Review 2. tur (3188 test)
- Önceki — Faz 3a — AI Import drop-anywhere UI + multimodal classifier (3175 test, commit `3757e48`)
- Önceki — Faz 2e İPTAL (3098 test, commit `4401d66`)
- Önceki — Faz 2d Review P3-007 (3119 test, commit `05cc81e`)
- Önceki — Faz 2d Review 2. tur (3109 test, commit `6272759`)
- Önceki — Faz 2d Review 1. tur (3084 test, commit `2b4dd0a`)
- Önceki — Faz 2d (3059 test, commit `99f3027`)
- Önceki — Faz 2c Review P3 (3015 test)
- Önceki — Faz 2c — Teknik sekmesi dinamik alan rendering + tip seçici (2974 test) · commit `6846584`
- Önceki — Toplu Seçme ve Silme — Tüm 6 Liste Sayfası (2954 test) · commit `c043636`
- Önceki — Faz 2b Review — 3 bulgu kapatma (2935 test)
- Önceki — Faz 2b — Tam ekran ürün detay sayfası + drawer kaldırma (2930 test)
- Önceki — Faz 2a Review — Tüm Bulgular Kapandı (2026-05-19; 2911 test)
- Önceki — Faz 2a — Batches + Attachments DB Foundation (2903 test)
- Önceki — Faz 1 Review P2 Tam Kapanış (2026-05-19; 2874 test)
- Önceki — Faz 1 Review — 3 bulgu kapatma (2026-05-19; 2873 test)
- Önceki — Modül Revize Faz 1 (2026-05-19; 2855 test)
- Sıradaki İş
- 35 Soruluk Q&A — Ana Kararlar Özeti
- Önceki İşler (kısa kronoloji)

# Memory Index

## User
- [user_review_workflow.md](user_review_workflow.md) — "Bulgular" raporuyla review yapar; önce doğrula, sonra düzelt; REVIEW.md = formal review kuralları

## Project
- [project_stack.md](project_stack.md) — Stack, inline style kuralları, klasör yapısı, veri modelleri, seed/demo hazırlık; Claude Code skills: `~/.claude/skills/erp2-*` (6 skill aktif)
- [project_domain.md](project_domain.md) — Sipariş çift ekseni, stok modeli, KDV, import kontratı, alert tipleri, tamamlanan fazlar (0–13)
- [project_pmt_multi_type.md](project_pmt_multi_type.md) — PMT multi-product-type firma; tek-tip assumption YAPMA; multi-type karışık katalog/sipariş/teklif zorunlu
- [project_security.md](project_security.md) — RLS, middleware, demo mode, TÜM audit bulguları kapatıldı (C1-C3,H1-H4,M1-M4,L1,L3,B04 ✅)
- [project_integrations.md](project_integrations.md) — Paraşüt Faz 1-10 ✅ (1914 test), Faz 11 sırada; AI kolon eşleştirme, Sentry ✅, k6, smoke 24
- [project_auth.md](project_auth.md) — Login, kullanıcı yönetimi, admin API, landing page
- [project_products_page.md](project_products_page.md) — Veri akışı, drawer edit modu, dinamik kategori, scan lock, mount scan davranışı, perf pattern
- [current_focus.md](current_focus.md) — Son: Teklif V7 **Faz 4 PDF Arşiv** (dondurulmuş HTML snapshot) **+ Bulgular 1.+2.+3. review tur**. 3. tur: P2-A toplu silme regresyonu (yalnız başarılı id düşür `pickSucceededIds` + seçim sadece draft), P2-B accepted-arşivsiz kabul edilen boşluk (Faz 6 kapatır), P3 stale doc. 2. tur: adres resmi belgeye, sent silme→draft-only, honest toast. 3969 test, **COMMIT+PUSH BEKLİYOR (1.+2. push edildi `bb3b3f2`) + 075/076 APPLY BEKLİYOR**; önceki: Revizyon Zinciri (074 ✅)

## Roadmap
- [project_voice_input.md](project_voice_input.md) — Sesli üretim girişi V1-V3 ✅ 3657 test; V3: fireNotes→notlar entegrasyonu + Ctrl+M shortcut (input/processing/demo/repeat guard'lı); pure helper voice-note-helpers.ts (client/server boundary korunur)
- [yuksek_etki_plan.md](yuksek_etki_plan.md) — 4 yüksek etkili stok özelliği: 3/4 tamamlandı; kalan: Tedarikçi Performansı (düşük öncelik)
- [project_quotes.md](project_quotes.md) — Teklif modülü: V7 master plan; Faz 1a/1b/2/3 ✅ + Faz 5 numara (073) ✅ + Revizyon zinciri (074) ✅ + **Faz 4 PDF Arşiv** (075-076, dondurulmuş HTML snapshot) + **Bulgular 1.+2.+3. review tur** (3. tur: toplu silme regresyonu pickSucceededIds + seçim draft-only, accepted-arşivsiz kabul; 3969 test, COMMIT+PUSH (1.+2. `bb3b3f2`)+075/076 APPLY BEKLİYOR); ERTELENEN: sig rename, **quotes audit katmanı** (modül-geneli), Puppeteer/binary-PDF (frozen HTML seçildi); sıradaki Faz 6 (accept→sipariş, 077)
- [project_frontend_renewal.md](project_frontend_renewal.md) — Frontend yenileme planı (frontend-renewal.md): DOM mutation fix, component lib, a11y — PLAN HAZIR, uygulama başlamadı

## Feedback
- [feedback_no_silent_deletes.md](feedback_no_silent_deletes.md) — Kod silmeden önce onay veya net gerekçe gerekiyor
- [feedback_memory_updates.md](feedback_memory_updates.md) — MEMORY.md ve memory dosyaları düzenli güncel tutulmalı
- [feedback_auto_context_update.md](feedback_auto_context_update.md) — current_focus.md ve CLAUDE.md Mevcut Durum her iş sonunda otomatik güncellenmeli
- [feedback_plan_domain_check.md](feedback_plan_domain_check.md) — Plan yazmadan önce domain-rules.md okunmalı; projeden kopuk özellik planlanmamalı

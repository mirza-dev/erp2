# Memory Index

## User
- [user_review_workflow.md](user_review_workflow.md) — "Bulgular" raporuyla review yapar; önce doğrula, sonra düzelt; REVIEW.md = formal review kuralları

## Project
- [project_stack.md](project_stack.md) — Stack, inline style kuralları, klasör yapısı, veri modelleri, seed/demo hazırlık
- [project_domain.md](project_domain.md) — Sipariş çift ekseni, stok modeli, KDV, import kontratı, alert tipleri, tamamlanan fazlar (0–13)
- [project_security.md](project_security.md) — RLS, middleware, demo mode, TÜM audit bulguları kapatıldı (C1-C3,H1-H4,M1-M4,L1,L3,B04 ✅)
- [project_integrations.md](project_integrations.md) — Paraşüt Faz 1-6 ✅ (1810 test), Faz 7 sırada; AI kolon eşleştirme, Sentry ✅, k6, smoke 24
- [project_auth.md](project_auth.md) — Login, kullanıcı yönetimi, admin API, landing page
- [project_products_page.md](project_products_page.md) — Veri akışı, drawer edit modu, dinamik kategori, scan lock, mount scan davranışı, perf pattern
- [current_focus.md](current_focus.md) — Son: Paraşüt Faz 6 tamamlandı (1810 test); Faz 7 sırada

## Roadmap
- [project_voice_input.md](project_voice_input.md) — Sesli üretim girişi: tüm turlar ✅ 1638 test; satır bazlı not, guard, _voiceHint, prompt final
- [yuksek_etki_plan.md](yuksek_etki_plan.md) — 4 yüksek etkili stok özelliği: 3/4 tamamlandı; kalan: Tedarikçi Performansı (düşük öncelik)
- [project_quotes.md](project_quotes.md) — Teklif modülü: Faz 1-8 TAMAMEN tamamlandı (sipariş dönüşümü, race condition fix dahil)
- [project_frontend_renewal.md](project_frontend_renewal.md) — Frontend yenileme planı (frontend-renewal.md): DOM mutation fix, component lib, a11y — PLAN HAZIR, uygulama başlamadı

## Feedback
- [feedback_no_silent_deletes.md](feedback_no_silent_deletes.md) — Kod silmeden önce onay veya net gerekçe gerekiyor
- [feedback_memory_updates.md](feedback_memory_updates.md) — MEMORY.md ve memory dosyaları düzenli güncel tutulmalı
- [feedback_auto_context_update.md](feedback_auto_context_update.md) — current_focus.md ve CLAUDE.md Mevcut Durum her iş sonunda otomatik güncellenmeli
- [feedback_plan_domain_check.md](feedback_plan_domain_check.md) — Plan yazmadan önce domain-rules.md okunmalı; projeden kopuk özellik planlanmamalı

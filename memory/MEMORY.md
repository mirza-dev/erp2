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
- [current_focus.md](current_focus.md) — Son: Teklif V7 **Faz 6 Bulgular (5 bulgu)** — #1 phantom recover accept'te kapatıldı (`dbArchiveObjectExists`+`dbDeleteQuoteArchive` regenerate), #2 sipariş detay iskonto+dinamik KDV, #3 accept route `requirePermission(manage_quotes)`, #4 RPC qty `<=0` pre-check (078) + 23514 yanlış-map kaldırıldı, #5 doc drift. **4034 test, COMMIT+PUSH BEKLİYOR + 077 APPLY EDİLDİ ✅ / 078 BEKLİYOR**; önceki: Faz 6 atomik accept (`d4988ca`)

## Roadmap
- [project_voice_input.md](project_voice_input.md) — Sesli üretim girişi V1-V3 ✅ 3657 test; V3: fireNotes→notlar entegrasyonu + Ctrl+M shortcut (input/processing/demo/repeat guard'lı); pure helper voice-note-helpers.ts (client/server boundary korunur)
- [yuksek_etki_plan.md](yuksek_etki_plan.md) — 4 yüksek etkili stok özelliği: 3/4 tamamlandı; kalan: Tedarikçi Performansı (düşük öncelik)
- [project_quotes.md](project_quotes.md) — Teklif modülü: V7 master plan; Faz 1a/1b/2/3 ✅ + Faz 5 numara (073) ✅ + Revizyon (074) ✅ + Faz 4 PDF Arşiv (075-076) ✅ + **Faz 6 Accept→Sipariş (077 atomik + 078 qty-fix; tek `/accept`; eski 2 yol→410; donmuş totaller; V7-A5 recover/A4 Paraşüt guard/A8-A11) + Bulgular 5 fix** (phantom recover accept'te, sipariş iskonto+KDV UI, accept RBAC manage_quotes, RPC qty<=0/23514-map, doc) — 4034 test, COMMIT+PUSH BEKLİYOR + 077 ✅/078 BEKLİYOR; ERTELENEN: Paraşüt iskonto aktarım, order_line_description, serviceConvert temizlik, quotes audit katmanı; sıradaki Faz 7 (note_templates 079-080)
- [project_frontend_renewal.md](project_frontend_renewal.md) — Frontend yenileme planı (frontend-renewal.md): DOM mutation fix, component lib, a11y — PLAN HAZIR, uygulama başlamadı

## Feedback
- [feedback_no_silent_deletes.md](feedback_no_silent_deletes.md) — Kod silmeden önce onay veya net gerekçe gerekiyor
- [feedback_memory_updates.md](feedback_memory_updates.md) — MEMORY.md ve memory dosyaları düzenli güncel tutulmalı
- [feedback_auto_context_update.md](feedback_auto_context_update.md) — current_focus.md ve CLAUDE.md Mevcut Durum her iş sonunda otomatik güncellenmeli
- [feedback_plan_domain_check.md](feedback_plan_domain_check.md) — Plan yazmadan önce domain-rules.md okunmalı; projeden kopuk özellik planlanmamalı

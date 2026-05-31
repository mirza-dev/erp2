# Memory Index

## User
- [user_review_workflow.md](user_review_workflow.md) — "Bulgular" raporuyla review yapar; önce doğrula, sonra düzelt; REVIEW.md = formal review kuralları

## Project
- [project_stack.md](project_stack.md) — Stack, inline style kuralları, klasör yapısı, veri modelleri, seed/demo hazırlık; Claude Code skills: `~/.claude/skills/erp2-*` (6 skill aktif)
- [project_domain.md](project_domain.md) — Sipariş çift ekseni, stok modeli, KDV, import kontratı, alert tipleri, tamamlanan fazlar (0–13)
- [project_pmt_multi_type.md](project_pmt_multi_type.md) — PMT multi-product-type firma; tek-tip assumption YAPMA; multi-type karışık katalog/sipariş/teklif zorunlu
- [project_security.md](project_security.md) — RLS, middleware, demo mode, TÜM audit bulguları kapatıldı (C1-C3,H1-H4,M1-M4,L1,L3,B04 ✅)
- [project_rbac.md](project_rbac.md) — Rol bazlı erişim (6 rol, app_metadata.roles): Faz 1+2+4+5 MAIN'DE (merge `234d8d9`); R3 finansal redaction + R1/R2 guard'lar; quotes RBAC main'in Faz 8a'sı (delete_quotes/410-convert); Faz 6/7 ertelendi
- [project_integrations.md](project_integrations.md) — Paraşüt Faz 1-10 ✅ (1914 test), Faz 11 sırada; AI kolon eşleştirme, Sentry ✅, k6, smoke 24
- [project_auth.md](project_auth.md) — Login, kullanıcı yönetimi, admin API, landing page
- [project_products_page.md](project_products_page.md) — Veri akışı, drawer edit modu, dinamik kategori, scan lock, mount scan davranışı, perf pattern
- [current_focus.md](current_focus.md) — Son: Teklif V7 **Faz 8 — Ertelenen Borçlar Kapanışı** (5 alt-faz/commit): 8a RBAC yazma uçları (`4935e88`), 8b convert ölü kod temizliği (`71a22cd`), 8c quotes audit katmanı helper-seviyesi (`034f8ea`), 8d order_line_description migration 080 (`4218d3e`, APPLY BEKLİYOR), 8e Paraşüt iskonto orantılı guard→reconciliation (`4b9c938`). Kullanıcı: sig rename ATLA, drag-reorder ERTELE. **4098 test, COMMIT+PUSH EDİLDİ · 080 APPLY BEKLİYOR**; **V7 + tüm ertelenen borçlar TAMAMLANDI**; önceki: Faz 7 note_templates (079 APPLY EDİLDİ ✅, 4098 test)

## Roadmap
- [project_voice_input.md](project_voice_input.md) — Sesli üretim girişi V1-V3 ✅ 3657 test; V3: fireNotes→notlar entegrasyonu + Ctrl+M shortcut (input/processing/demo/repeat guard'lı); pure helper voice-note-helpers.ts (client/server boundary korunur)
- [yuksek_etki_plan.md](yuksek_etki_plan.md) — 4 yüksek etkili stok özelliği: 3/4 tamamlandı; kalan: Tedarikçi Performansı (düşük öncelik)
- [project_quotes.md](project_quotes.md) — Teklif modülü: V7 master plan; Faz 1a/1b/2/3 ✅ + Faz 5 numara (073) ✅ + Revizyon (074) ✅ + Faz 4 PDF Arşiv (075-076) ✅ + **Faz 6 Accept→Sipariş (077 atomik + 078 qty-fix; tek `/accept`; eski 2 yol→410; donmuş totaller; V7-A5 recover/A4 Paraşüt guard/A8-A11) + Bulgular 1.+2. tur** (1.tur: phantom recover/iskonto+KDV UI/accept RBAC/RPC qty 078/doc; 2.tur: arşiv create-race obje-doğrulama [tri-state]/accept fail-closed unknown→502/order arşiv PDF linki/doc/lint; 3.tur 3×P3: doc drift/archive route stale yorum/emoji kalsın) — 4043 test, `9b9ecde` 077/078 APPLY EDİLDİ ✅ + **Faz 7 Not Şablonları (note_templates, migration 079 — 080 KALICI DÜŞÜRÜLDÜ: position zaten var; CRUD GET-açık/mutation-admin/soft-delete + settings sayfası + QuoteForm 3-alan picker + PMT seed) 4098 test, 079 APPLY EDİLDİ ✅ — V7 master-plan TAMAMLANDI** + **Faz 8 Ertelenen Borçlar Kapanışı** (8a RBAC / 8b convert-cleanup / 8c audit helper-seviyesi / 8d order_line_description mig.080 / 8e Paraşüt iskonto orantılı reconciliation; sig-rename ATLA + drag-reorder ERTELE) 4098 test, COMMIT+PUSH EDİLDİ · 080 APPLY BEKLİYOR; KALAN (quotes borcu DEĞİL): audit actor (trigger), GET view_quotes RBAC, Paraşüt Sandbox GATE
- [project_frontend_renewal.md](project_frontend_renewal.md) — Frontend yenileme planı (frontend-renewal.md): DOM mutation fix, component lib, a11y — PLAN HAZIR, uygulama başlamadı

## Feedback
- [feedback_no_silent_deletes.md](feedback_no_silent_deletes.md) — Kod silmeden önce onay veya net gerekçe gerekiyor
- [feedback_memory_updates.md](feedback_memory_updates.md) — MEMORY.md ve memory dosyaları düzenli güncel tutulmalı
- [feedback_auto_context_update.md](feedback_auto_context_update.md) — current_focus.md ve CLAUDE.md Mevcut Durum her iş sonunda otomatik güncellenmeli
- [feedback_plan_domain_check.md](feedback_plan_domain_check.md) — Plan yazmadan önce domain-rules.md okunmalı; projeden kopuk özellik planlanmamalı

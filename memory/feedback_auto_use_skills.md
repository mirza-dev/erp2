---
name: feedback_auto_use_skills
description: "Proje kapsamındaki erp2-* skill'leri kullanıcı söylemeden otomatik kullan"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 14992303-287a-4b73-b0e6-d62dbec7425c
---

Kullanıcı: "Projeyi her şeyi hatırla ve proje kapsamında kullanmak gereken skilleri otomatik kullan, benim belirtmemi veya söylememi bekleme."

**Why:** Kullanıcı her seferinde "şu skill'i kullan" demek istemiyor; skill'lerin doğru tetikleyiciye göre kendiliğinden devreye girmesini bekliyor.

**How to apply:** ERP2 işlerinde ilgili `erp2-*` skill'i tetikleyici eşleştiğinde KENDİLİĞİNDEN çağır — açık talimat bekleme:
- API route ekleme/değiştirme (`src/app/api/**/route.ts`) → `erp2-api-route-builder`
- Dashboard UI / component / data-context → `erp2-dashboard-ui-builder`
- İş kuralı / servis / RPC / domain invariant → `erp2-domain-guard`
- Migration / RPC / RLS / schema → `erp2-supabase-rpc-migration`
- Faz/sprint planlama, scope decompose → `erp2-phase-planner`
- İş bitişi / "hazır mı" / commit öncesi doğrulama → `erp2-test-review-lock`
- Review/güvenlik denetimi → `/erp-review` ([[reference_review_agent]])

Skill'ler oturum başında yüklenir; gerekiyorsa restart. İlgili [[feedback_ask_scope_decisions]] (kapsam kararları AskUserQuestion ile sor, sonra ilerle).

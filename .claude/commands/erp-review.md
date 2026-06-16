---
description: Roven ERP kapsamlı kod incelemesi + güvenlik denetimi (erp2-reviewer subagent'ını başlatır)
---

`erp2-reviewer` subagent'ını başlat ve şu kapsamla kapsamlı inceleme + güvenlik denetimi yaptır.

Argüman ($ARGUMENTS):
- boş veya `full` → tam denetim (`src/` + `supabase/migrations/`)
- `diff` → yalnız `git diff --name-only origin/main...HEAD` dosyaları (PR/feature modu)
- bir yol/glob verildiyse → o kapsam

Subagent:
1. Önce `REVIEW.md`, `domain-rules.md`, `permissions.ts`, gate baseline'ları + denetim raporunu okur.
2. Semgrep (p/typescript+p/react+p/nextjs+p/owasp-top-ten + `.semgrep/erp-rules.yml`) + gitleaks +
   npm audit çalıştırır, sonuçları elle doğrular.
3. Güvenlik + semantik kontrol listelerini uygular.
4. Bulguları `docs/audit/<YYYY-AA>-review-bulgular.md` dosyasına **K/Y/O/D + Kanıt/Etki/Düzeltme/Efor**
   formatında yazar ve özetini döndürür.

Subagent yalnız RAPOR üretir — düzeltmeleri UYGULAMAZ (uygulama ayrı bir tur + kullanıcı onayı).

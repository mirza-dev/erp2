---
name: reference_review_agent
description: "erp2-reviewer inceleme/güvenlik subagent'ı + Semgrep/gitleaks katmanı — nasıl çalışır, nasıl çağrılır"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 3db100be-70e2-404d-9834-ee5b61f72929
---

**Kapsamlı kod-inceleme + güvenlik-denetim ajanı** (2026-06-16, PUSH `efab85c`). Projeyi tanıyan
bespoke subagent; bug/semantik hata/güvenlik açığı tarar, çıktıyı projenin **Bulgular** formatında verir.

**Çağırma:** Claude Code'da `/erp-review` (tam denetim `src/`+migrations) veya `/erp-review diff`
(yalnız `git diff origin/main...HEAD`). Komut `erp2-reviewer` subagent'ını başlatır.
⚠️ **Subagent dosyaları oturum BAŞINDA yüklenir** — yeni eklendiğinde Task/Agent ile çağırmak için
**restart** gerekir.

**Bileşenler:**
- `.claude/agents/erp2-reviewer.md` — subagent (tools: Read/Grep/Glob/Bash, model: opus). Akış:
  (0) önce oku: `REVIEW.md` (sözleşme, Nit≤5, "do not report", "always flag"), `domain-rules.md`,
  `src/lib/auth/permissions.ts`, `src/__tests__/gate/*baseline.ts` (gate-kapsadığını TEKRAR etme),
  `docs/audit/2026-06-guvenlik-dogruluk-bulgulari.md` (taksonomi); (1) semgrep+gitleaks+npm audit
  çalıştır+elle doğrula; (2) güvenlik checklist (RLS, service-role/anon sınırı, NEXT_PUBLIC secret,
  route guard, redaction simetrisi snake/camel, demo-mode, DEFINER, SSRF, server/client sınır, PII);
  (3) semantik checklist (istemci toplamları K2, iki-eksen statü, KDV, UTC tarih Y6, para yuvarlama D1,
  FOR UPDATE/CAS yarış, idempotency, API sözleşmesi, stok); (4) çıktı `docs/audit/<YYYY-AA>-review-
  bulgular.md` K/Y/O/D + Kanıt(file:line)/Etki/Düzeltme/Efor. **Yalnız RAPOR, düzeltme uygulamaz.**
- `.semgrep/erp-rules.yml` — 7 projeye özel kural: roven-next-public-secret (anon key + publishable
  hariç), roven-utc-date-slice (Y6), roven-inline-money-rounding (D1), roven-tailwind-classname,
  roven-framer-motion-import, roven-hardcoded-color (tema-muaf yüzeyler yanlış-pozitif olabilir),
  roven-dangerously-set-inner-html. Doğrula: `semgrep --validate --config .semgrep/erp-rules.yml`.
- `.claude/commands/erp-review.md` — launcher.

**Mekanik araçlar (yerel, brew):** `brew install semgrep gitleaks` (semgrep 1.166, gitleaks 8.30).
Subagent komutu: `semgrep scan --config p/typescript --config p/react --config p/nextjs --config
p/owasp-top-ten --config .semgrep/erp-rules.yml --json src` + `gitleaks detect` + `npm audit`.
Araç yoksa subagent mekanik katmanı atlar, LLM ile devam eder.

**Tasarım kararı (AskUserQuestion):** subagent (skill değil — izole bağlam); Semgrep+gitleaks (LLM-only
değil); yerel-istek-üzerine (CI Action değil — zaten `/code-review ultra` var); bespoke (wshobson/
VoltAgent/anthropics-skills yapısından beslenip projeye özel — jenerik pack kurulmadı, `erp2-*` skill
ailesiyle çakışmaz). Mevcut altyapıyla ilişki: Gate testleri = mekanik CI guardrail, `erp2-domain-guard`
= pre-commit checklist, **erp2-reviewer = post-hoc derin semantik+güvenlik tarama**. İlişkili:
[[project_security.md]] [[reference_worktree_branches]].

---
name: roven-worktree-i-ki-branch-memory-symlink-mekanizmas
description: erp2=main + proje-codex=codex-experiment birebir-ayna; push akışı; ~/.claude memory symlink — her iki ajanın senkron çalışması için
metadata: 
  node_type: memory
  type: reference
  originSessionId: 14992303-287a-4b73-b0e6-d62dbec7425c
---

Proje iki git worktree ile çalışır; ikisi `.git`'i paylaşır. Birebir-ayna politikası ile her iki branch (ve iki Coolify ortamı) aynı kodu çalıştırır.

## Worktree'ler

- **`/Users/mirzasaribiyik/Projects/erp2`** → `main` branch (prod referansı).
- **`/Users/mirzasaribiyik/Projects/proje-codex`** → `codex-experiment` branch.
- Ek worktree branch'leri (`worktree-rbac-bulgular-kapatma`, `worktree-satis-siparisleri-tamamlama`) main'in atası = tamamen merge edilmiş, benzersiz iş yok.

## Birebir-ayna politikası

**`origin/main == origin/codex-experiment`** her zaman aynı SHA + tree olmalı. Her ikisi ayrı Coolify prod ortamına deploy olur ama kod birebir aynıdır.

## Push akışı (her iş sonunda)

Genelde proje-codex'te (codex-experiment) çalışılıp commit atılır, sonra:
1. `git -C /Users/mirzasaribiyik/Projects/erp2 merge --ff-only <yeni-sha>` — main'i aynı commit'e ilerlet (erp2 worktree içinde ff). Önce erp2 working tree temiz olmalı (gerekirse dirty dosyayı `checkout --` ile geri al — commit'li sürüm ff'te döner).
2. `git push origin codex-experiment` + `git push origin main`.
3. **Doğrula:** `git diff --stat origin/main origin/codex-experiment` → BOŞ (özdeş tree). `git rev-parse origin/main origin/codex-experiment` → aynı SHA.

**⚠️ TEKRARLAYAN TUZAK — ff'yi proje-codex cwd'sinde çalıştırma (bu oturumda 3 kez yaşandı):** commit proje-codex'te (codex-experiment) atılır; eğer ff komutunu `cd erp2` OLMADAN, çıplak `git merge --ff-only <sha>` olarak proje-codex cwd'sinde çalıştırırsan → HEAD zaten o sha'da olduğu için **"Already up to date"** der, **main HİÇ ilerlemez**, sessizce ayrışır (codex önde, main geride). Ardından `git push origin main` de proje-codex'ten "Everything up-to-date" der → push'lanmış sanırsın ama main eski SHA'da kalır. **Kural:** ff + push main MUTLAKA ya `git -C /Users/mirzasaribiyik/Projects/erp2 merge --ff-only <sha>` (`-C` ile, cwd değiştirmeden) ya da ayrı `cd /Users/mirzasaribiyik/Projects/erp2 && git merge --ff-only <sha> && git push origin main` bloğunda. Push sonrası 3. adım doğrulaması (diff BOŞ) bu sapmayı yakalar — atlanmamalı.

**React Doctor** pre-commit advisory uyarı verir ama **commit'i BLOKLAMAZ** (advisory).

## ⚠️ codex-experiment ıraksaması (remote'ta benzersiz commit) — entegrasyon + re-mirror

Bazen codex-experiment remote'ta **main'de olmayan gerçek bir commit** taşır (kullanıcı doğrudan o branch'e iş push'lar — örn. 2026-06-20 `2b7e7ec premium light theme surfaces`). Bu mirror'ı bozar ve push akışını kırar (`git push origin codex-experiment` → "non-fast-forward" reddi). Kör force-push YAPMA (gerçek iş silinir) — **kullanıcıya sor** (AskUserQuestion: temayı/işi main'e entegre et / main'i onun üstüne kur / ayrı bırak). Önceki örnek: kullanıcı "main'e entegre et" dedi → `git cherry-pick -n <codex-sha>` + çakışma çözümü (HEAD=main işin korunur, getiri token/component'leri oto-merge) + ek test fix + commit → main artık codex-sha içeriğini KAPSAR.
- **Re-mirror:** entegrasyon sonrası codex-experiment'i main'e almak `git push --force-with-lease=codex-experiment:<eski-codex-sha>` gerektirir (non-ff, eski SHA düşer ama içeriği main'de yaşar → kayıpsız). **Bu force-push otomatik mod sınıflandırıcısı tarafından ENGELLENİR** (yıkıcı sayılır) → kullanıcı yetkisi/elle koşması gerekir. main push'u (ff) engellenmez.

## Memory symlink (KRİTİK — her iki ajan senkronu)

- `~/.claude/projects/-Users-mirzasaribiyik-Projects/memory` = **SYMLINK → `/Users/mirzasaribiyik/Projects/erp2/memory`** (hardlink DEĞİL). Yani **auto-memory** (her oturumda yüklenen) = erp2/memory.
- `proje-codex/memory` = **ayrı kopya** (farklı inode), git-tracked.
- **Sonuç:** tracked memory'i **proje-codex'te** düzenle → commit (codex-experiment) → **ff main** (erp2/memory = ~/.claude auto-memory güncellenir) → push both. ff main adımı atlanırsa auto-memory bayat kalır.
- `~/.claude` yoluyla doğrudan Write yaparsan erp2/memory'ye (main working tree, commit'siz) yazarsın — proje-codex'le ayrışır; tercih edilmez.

## İlgili
[[reference_theming]], [[feedback_auto_context_update]] (current_focus.md + CLAUDE.md güncelle), [[feedback_memory_updates]].

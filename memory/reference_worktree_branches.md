---
name: KokpitERP — Worktree / İki-Branch / Memory Symlink Mekanizması
description: erp2=main + proje-codex=codex-experiment birebir-ayna; push akışı; ~/.claude memory symlink — her iki ajanın senkron çalışması için
metadata:
  type: reference
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

**React Doctor** pre-commit advisory uyarı verir ama **commit'i BLOKLAMAZ** (advisory).

## Memory symlink (KRİTİK — her iki ajan senkronu)

- `~/.claude/projects/-Users-mirzasaribiyik-Projects/memory` = **SYMLINK → `/Users/mirzasaribiyik/Projects/erp2/memory`** (hardlink DEĞİL). Yani **auto-memory** (her oturumda yüklenen) = erp2/memory.
- `proje-codex/memory` = **ayrı kopya** (farklı inode), git-tracked.
- **Sonuç:** tracked memory'i **proje-codex'te** düzenle → commit (codex-experiment) → **ff main** (erp2/memory = ~/.claude auto-memory güncellenir) → push both. ff main adımı atlanırsa auto-memory bayat kalır.
- `~/.claude` yoluyla doğrudan Write yaparsan erp2/memory'ye (main working tree, commit'siz) yazarsın — proje-codex'le ayrışır; tercih edilmez.

## İlgili
[[reference_theming]], [[feedback_auto_context_update]] (current_focus.md + CLAUDE.md güncelle), [[feedback_memory_updates]].

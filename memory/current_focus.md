---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** — (sprint boş, bir sonraki kullanıcı isteğine göre belirlenecek)

---

**Son tamamlanan (2026-04-23 — Audit TÜM BULGULAR KAPALI):**

3 commit, 43 dosya, 1609 test yeşil.

| Commit | İçerik |
|--------|--------|
| `483b3d3` | C1-C3, H1-H4, M1-M2, M4, L1, L3 — 40 dosya |
| `f44a47e` | H-4 nested array string check + products numeric guard |
| `2864c97` | B-04: health endpoint anonim=sade, ?detail+CRON_SECRET=tam |

**Tamamlanan bulgular:** C-1..C-3 · H-1..H-4 · M-1 · M-2 · M-4 · L-1 · L-3 · B-04

**Ertelenen:**
- M-3: Rate limiting — Vercel KV / upstash, altyapı kararı gerekiyor
- `purchase_commitments` + `column_mappings` RLS migration eksik
- `seed-large.ts --clean` 1000 limit bug (düşük öncelik)

---

**Referans — önceki önemli iş (2026-04-22):**
- Faz 8 bulgular fix (race condition, valid_until, notes) — commit `3634b1c`
- Migration 037: `sales_orders.quote_id` partial UNIQUE index

**Why:** Yeni session'da Claude aktif konuyu bilsin.
**How to apply:** Sonraki konuşmada sprint boş — kullanıcı ne istediğine göre yön belirle.

---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** — (sprint boş, bir sonraki kullanıcı isteğine göre belirlenecek)

---

**Son tamamlanan (2026-04-24 — Sesli Üretim Girişi V1 Bug Fix):**

7 bulgу düzeltildi. 1628/1628 test yeşil.

| Bulgu | Dosya | Fix |
|-------|-------|-----|
| H-1: onResult hatası yakalanmıyor | `useVoiceRecorder.ts` | catch bloğu eklendi |
| M-1: MediaRecorder varlığı kontrol edilmiyor | `useVoiceRecorder.ts` | typeof MediaRecorder check |
| M-2: MIME type doğrulaması yok | `transcribe/route.ts` | audio/* whitelist |
| M-3: productId whitelist yok + sanitize eksik | `voice-service.ts` | knownIds.has() + sanitizeAiInput |
| L-1: 503 mesajı yanıltıcı | `transcribe/route.ts` | generik mesaj |
| L-2: _lowConfidence + setTimeout race | `production/page.tsx` | setLineField + transcriptTimerRef |
| L-3: database.types.ts AiFeature eksik | `database.types.ts` | production_voice eklendi |

---

**Son tamamlanan (2026-04-24 — Sesli Üretim Girişi):**

8 dosya, 1626 test yeşil.

| Dosya | İçerik |
|-------|--------|
| `src/hooks/useVoiceRecorder.ts` | YENİ — MediaRecorder hook, 90sn max, toggle |
| `src/lib/services/voice-service.ts` | YENİ — Whisper + Claude Haiku pipeline |
| `src/app/api/production/transcribe/route.ts` | YENİ — POST endpoint |
| `src/__tests__/voice-service.test.ts` | YENİ — 11 test |
| `src/__tests__/transcribe-route.test.ts` | YENİ — 6 test |
| `src/app/dashboard/production/page.tsx` | DEĞİŞTİR — placeholder → gerçek voice UI |
| `src/app/api/production/route.ts` | DEĞİŞTİR — entered_by session'dan (bug fix) |
| `src/lib/supabase/ai-runs.ts` | DEĞİŞTİR — "production_voice" AiFeature |

**Detay:** `memory/project_voice_input.md`

**Playwright CI (2026-04-24):**
- GitHub Secrets eklendi ✅

**Son tamamlanan (2026-04-23 — Audit TÜM BULGULAR KAPALI):**

3 commit, 43 dosya, 1609 test yeşil.

| Commit | İçerik |
|--------|--------|
| `483b3d3` | C1-C3, H1-H4, M1-M2, M4, L1, L3 — 40 dosya |
| `f44a47e` | H-4 nested array string check + products numeric guard |
| `2864c97` | B-04: health endpoint anonim=sade, ?detail+CRON_SECRET=tam |

**Ertelenen:**
- M-3: Rate limiting — Upstash Redis önerildi, altyapı kararı bekliyor
- `purchase_commitments` + `column_mappings` RLS migration eksik
- `seed-large.ts --clean` 1000 limit bug (düşük öncelik)

---

**Why:** Yeni session'da Claude aktif konuyu bilsin.
**How to apply:** Sesli giriş uygulamasına başlanacak — `project_voice_input.md` tam detay içeriyor.

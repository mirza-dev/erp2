---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
---

**Aktif:** — (sprint boş, bir sonraki kullanıcı isteğine göre belirlenecek)

---

## Son Tamamlanan İşler — Sesli Üretim Girişi (2026-04-24, tüm turlar)

### Tur 5 — setLineField yan etki fix (1638 test)

`_lowConfidence` not/adet değişiminde de sıfırlanıyordu. Fix: sadece `productId` değişince temizle.

```typescript
// DOĞRU:
_lowConfidence: field === "productId" ? false : l._lowConfidence,
_voiceHint: field === "productId" ? undefined : l._voiceHint,
```

---

### Tur 4 — Guard + _voiceHint (1638 test)

**Post-process guard (`voice-service.ts`):** Claude prompt'u ihlal edip aynı SKU için çoklu null entry döndürürse → tek entry'e collapse et (quantity topla, confidence min al). Farklı SKU'lar collapse edilmez.

**`_voiceHint` (`production/page.tsx`):** `FormLine`'a `_voiceHint?: string` eklendi. Belirsiz sesli girişte `entry.productName` → hint olarak saklanır. Dropdown altında gösterilir: *Sesli: "DN50 vana" — listeden ürün seçin*. Ürün seçilince hint temizlenir.

2 yeni guard testi eklendi.

---

### Tur 3 — Notlar satır bazlı (1638 test)

`batchNote` (global tek not) kaldırıldı. `FormLine`'a `notlar: string` eklendi. Her satır kendi notunu tutuyor. Sesli girişte `sessionNote` → her yeni satırın `notlar` alanına pre-fill. Kayıt: `notlar: line.notlar` (satır başına farklı not).

---

### Tur 2 — Prompt iyileştirmesi + category (1636 test)

**SYSTEM_PROMPT yeniden yazıldı:** Belirsiz girişte (ör. "DN50") TEK null entry — 5 entry değil. Açık çoklu ürün girişinde çoklu entry. Confidence tablosu eklendi. Türkçe ses tanıma düzeltmeleri eklendi.

**`category` Claude'a gönderiliyor:** `ProductRef`'e `category: string | null` eklendi. Ürün listesi `SKU — Ad [Kategori] (id: ...)` formatında. Route'ta `productRefs` map'ine `category` eklendi.

5 yeni test: category assertion, prompt assertion, belirsiz eşleşme testi, route veri geçiş testi.

---

### Tur 1 — V2 Bug Fix (1631 test)

| Bulgu | Fix |
|-------|-----|
| H-1: Eşleşmeyen satırlar kayboluyor | unresolved ayrı hesaplanır, formda bırakılır + warning toast |
| M-2: fireNotes batchNote'a karışıyor | fireNotes batchNote'a dahil edilmez (sadece sessionNote) |
| M-3: batchNote overwrite | merge pattern: `prev ? prev + '; ' + new : new` |
| L-1: sanitizeAiOutput eksik | 4 string alana uygulandı |
| L-2: transcriptTimerRef leak | useEffect cleanup eklendi |
| L-3: volume 60fps setState | prevVolRef + >8 birim threshold |

---

### Önceki (2026-04-24 — V1 + V2 başlangıç)

V1: 8 dosya, MediaRecorder → Whisper → Claude Haiku → form (1626 test)
V1 bug fix: 7 bulgu, 1628 test
V2: çoklu ürün entries[], ses dalgası AudioContext, sessionNote → batchNote, 1631 test

---

**Ertelenen:**
- M-3: Rate limiting — Upstash Redis, altyapı kararı bekliyor
- `purchase_commitments` + `column_mappings` RLS migration
- fireNotes UI entegrasyonu (scrap_qty) — V3 scope
- Ctrl+M klavye kısayolu — V3 scope
- Sessizlik algılama — EKLENMEYECEK (üretim ortamı riski)

---

**Why:** Yeni session'da Claude aktif konuyu eksiksiz bilsin.
**How to apply:** Sesli giriş tamamlandı. Yeni iş gelene kadar sprint boş. Detay için `project_voice_input.md`.

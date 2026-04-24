---
name: KokpitERP — Sesli Uretim Girisi
description: Uretim sayfasinda sesli giris — tüm turlar tamamlandı. Final durum, interface, tasarım kararları.
type: project
---

## Durum

**✅ TÜM TURLAR TAMAMLANDI — 2026-04-24**
Test: 1638/1638 yeşil · TS: 0 hata · Build: temiz

| Tur | İçerik | Test |
|-----|--------|------|
| V1 | MediaRecorder + Whisper + Claude Haiku + form | 1626 |
| V1 bug fix | 7 bulgu | 1628 |
| V2 | Çoklu ürün, ses dalgası, sessionNote | 1631 |
| V2 bug fix | 6 bulgu | 1631 |
| Prompt + category | SYSTEM_PROMPT yeniden yazımı, category Claude'a gönderiliyor | 1636 |
| Guard + _voiceHint | Collapse guard, hint UI | 1638 |
| setLineField fix | _lowConfidence yan etki fix | 1638 |
| Notlar satır bazlı | batchNote → line.notlar | 1638 |

---

## Seçilen Yaklaşım (Final)

```
🎤 buton → MediaRecorder API → POST /api/production/transcribe
  → OpenAI Whisper (language: 'tr', prompt: ürün SKU+isim listesi)
  → Claude Haiku (entries[] çıkarım; belirsiz → null productId)
  → Form satırları oluşur (her biri kendi notu ile)
  → Kullanıcı gözden geçirir, belirsiz satırlarda dropdown seçer → "Kaydet"
  → POST /api/production (her satır ayrı kayıt, kendi notu ile)
```

---

## Final Interface

```typescript
// voice-service.ts
interface ProductRef {
    id: string;
    name: string;
    sku: string;
    category: string | null;  // Claude'a gönderiliyor
}

export interface VoiceProductionEntry {
    productId: string | null;  // null = belirsiz veya eşleşmedi
    productName: string;       // ham metin (belirsizde _voiceHint olarak kullanılır)
    productSku: string;
    quantity: number;
    note: string;              // bu ürüne özel not — "" = yok; page.tsx: entry.note || sessionNote
    fireNotes: string;         // "fire: N adet" — UI'da kullanılmıyor (V3 scope)
    confidence: number;        // 0-1
}

export interface VoiceExtractionResult {
    entries: VoiceProductionEntry[];
    sessionNote: string;  // ürüne bağlı olmayan genel not; entry.note yoksa fallback
    rawText: string;
}

// production/page.tsx
interface FormLine {
    id: string;
    productId: string;
    adet: string;
    notlar: string;            // satır bazlı not — her satır farklı not tutabilir
    _lowConfidence?: boolean;  // confidence < 0.7 → sarı vurgu + uyarı
    _voiceHint?: string;       // belirsiz satırda ham metin gösterimi
}
```

---

## Kritik Tasarım Kararları (Final)

| Karar | Detay |
|-------|-------|
| Belirsiz girişte `productId: null` | "ilk eşleşeni seç, düşük confidence" değil — null döner, form satırı unresolved olur, kayıt gitmez |
| Collapse guard | Claude aynı SKU için çoklu null entry döndürürse → tek entry (quantity topla, confidence min al); farklı SKU'lar korunur |
| `_lowConfidence` sadece productId seçiminde temizlenir | Not veya adet değişimi uyarıyı silmez — kullanıcı hâlâ belirsiz olabilir |
| `_voiceHint` → dropdown altında görünür | `entry.productName` hint olarak saklanır, ürün seçilince temizlenir |
| `notlar` satır bazlı | `batchNote` (global) kaldırıldı; `entry.note` (ürüne özel) → o satıra pre-fill; `sessionNote` (genel) → `entry.note` yoksa fallback |
| `fireNotes` batchNote'a gitmez | Sadece transcript gösteriminde; DB'ye `scrap_qty` olarak yazılmıyor (V3 scope) |
| `productId` whitelist | `knownIds.has()` ile doğrulama; Claude'un hallüsine karşı koruma |
| Volume throttle | `prevVolRef` + >8 birim threshold — 60fps re-render önlenir |
| `category` Claude'a gönderiliyor | `[Kategori]` formatında ürün listesinde — belirsiz eşleşmede daha iyi bağlam |

---

## Confidence Tierleri (Prompt'tan)

| Durum | Confidence | productId |
|-------|-----------|-----------|
| SKU tam eşleşme + miktar açık | 0.90–1.00 | eşleşen UUID |
| SKU eşleşme, miktar çıkarım | 0.70–0.89 | eşleşen UUID |
| Kısmi eşleşme (birden fazla aday) | 0.30–0.50 | null |
| Çok belirsiz (sadece "vana") | 0.10–0.29 | null |
| Hiç eşleşme yok | 0.05–0.15 | null |

`_lowConfidence` UI flagı: confidence < 0.7 → sarı satır + uyarı metni.

---

## Dosyalar (Final)

| Dosya | Durum |
|-------|-------|
| `src/hooks/useVoiceRecorder.ts` | ✅ MediaRecorder, 90sn, toggle, AudioContext volume |
| `src/lib/services/voice-service.ts` | ✅ Whisper + Claude Haiku + guard + sanitize |
| `src/app/api/production/transcribe/route.ts` | ✅ Auth, MIME, boyut, category pass-through |
| `src/__tests__/voice-service.test.ts` | ✅ 20+ test (guard, category, collapse, prompt assertion) |
| `src/__tests__/transcribe-route.test.ts` | ✅ 7 test (auth, MIME, category route geçişi) |
| `src/app/dashboard/production/page.tsx` | ✅ Satır bazlı not, _voiceHint, guard-ready UI |
| `src/app/api/production/route.ts` | ✅ entered_by session'dan |
| `src/lib/supabase/ai-runs.ts` | ✅ "production_voice" AiFeature |

---

## Env

| Key | Durum |
|-----|-------|
| `OPENAI_API_KEY` | ✅ .env.local + Vercel env |
| `ANTHROPIC_API_KEY` | ✅ Zaten mevcut |

---

## Kapsam Dışı (V3)

- `fireNotes` → `scrap_qty` DB alanı ve UI input
- Ctrl+M klavye kısayolu
- Sessizlik algılama — EKLENMEYECEK (üretim ortamı riski)

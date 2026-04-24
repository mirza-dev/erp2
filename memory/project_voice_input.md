---
name: KokpitERP — Sesli Uretim Girisi
description: Uretim sayfasinda sesli giris — MediaRecorder, Whisper, Claude Haiku, form otomatik doldurma. Plan Rev2 onaylı (2026-04-24).
type: project
---

## Durum

**✅ V1 TAMAMLANDI — 2026-04-24**
Test: 1626/1626 yesil · TS: 0 hata · 8 dosya

**Siradaki is:** V2 ozellikleri (asagida) — henuz baslamadi

---

## Secilen Yaklasim

```
🎤 buton → MediaRecorder API → POST /api/production/transcribe
  → OpenAI Whisper (language: 'tr', prompt: urun SKU listesi)
  → Claude Haiku (tek urun cikarim; fire → notes)
  → Form otomatik dolar
  → Kullanici gozden gecirir → "Kaydet"
  → POST /api/production (normal akis, entered_by session'dan)
```

---

## V1 Scope (Net Sinirlar)

| Kapsam | V1 | V2 |
|--------|----|----|
| Tek urun + adet + opsiyonel not | EVET | — |
| "fire" algılanırsa notes'a yaz | EVET | — |
| Dusuk confidence satir vurgusu | EVET | — |
| entered_by session'dan (bug fix) | EVET | — |
| dbListAllActiveProducts() (limit yok) | EVET | — |
| production_voice AiFeature tipi | EVET | — |
| Coklu urun tek seste | ❌ V2 bekliyor | V2 |
| scrap form alani | ❌ V2 bekliyor | V2 |
| Sessizlik algilama | ❌ karar verilmedi | V2? |

**Coklu urun notu:** Claude'dan max 1 entry istenir. Birden fazla urun algılanırsa ilk alinir, geri kalanlar notes'a eklenir.

**scrap V1 karari:** VoiceProductionEntry.scrap YOK. "fire: N adet" notes'a yazilir. Form scrap_qty gostermediginden veri modeli degisikligi gerekmez.

---

## Kayit Davranisi

- **Max sure:** 90 saniye → otomatik durdur + toast
- **Sessizlik algilama:** YOK — toggle (tikla baslat / tikla durdur)
- **Format:** audio/webm;codecs=opus (Chrome/Edge/Firefox), fallback audio/mp4 (Safari)

---

## Kritik Kararlar (Review Bulgularindan)

| Bulgu | Karar |
|-------|-------|
| scrap veri modeli uyumsuzlugu | notes'a yaz, form alani V2'ye etelendi |
| entered_by session'dan gelmeli | production/route.ts'e session check eklenir (bug fix) |
| Test stratejisi: auth middleware mi route mi | Route icinde explicit session check → route testi 401 dogruluyor |
| Coklu urun scope celiskisi | V1 = tek urun, V2 = coklu |
| dbListProducts() 100 limit sorunu | dbListAllActiveProducts() kullanilacak |
| AiFeature tipinde "production_voice" yok | ai-runs.ts tipine ekleniyor |

---

## Dosyalar

| Dosya | Islem | Durum |
|-------|-------|-------|
| `src/hooks/useVoiceRecorder.ts` | YENI | ✅ |
| `src/lib/services/voice-service.ts` | YENI | ✅ |
| `src/app/api/production/transcribe/route.ts` | YENI | ✅ |
| `src/__tests__/voice-service.test.ts` | YENI | ✅ |
| `src/__tests__/transcribe-route.test.ts` | YENI | ✅ |
| `src/app/dashboard/production/page.tsx` | DEGISTIR — placeholder → gercek UI | ✅ |
| `src/app/api/production/route.ts` | DEGISTIR — entered_by session'dan | ✅ |
| `src/lib/supabase/ai-runs.ts` | DEGISTIR — "production_voice" AiFeature | ✅ |

**Test sonucu:** 1626/1626 yesil (17 yeni test eklendi)

---

## Interface (VoiceProductionEntry — V1)

```typescript
interface VoiceProductionEntry {
  productId: string | null;  // null = eslesmedi
  productName: string;
  productSku: string;
  quantity: number;
  notes: string;             // fire varsa: "fire: 2 adet" eklenir
  confidence: number;        // 0-1, clampConfidence() ile
}
```

---

## Mevcut Kullanilan Kod

| Kaynak | Ne icin |
|--------|---------|
| `ai-service.ts` client + MODEL | Anthropic SDK |
| `ai-guards.ts` sanitizeAiInput, clampConfidence | Guardrail |
| `ai-runs.ts` logAiRun, hashInput | AI audit |
| `products.ts` dbListAllActiveProducts() | Urun listesi (limit yok) |
| `supabase/server.ts` createClient() | Session kontrolu |
| `api-error.ts` handleApiError() | Hata saralama |

---

## Env

| Key | Durum |
|-----|-------|
| `OPENAI_API_KEY` | ⚠ GEREKLI — henuz .env.local + Vercel env'e eklenmedi (kullanici ekleyecek) |
| `ANTHROPIC_API_KEY` | ✅ Zaten mevcut |

---

## V2 Is Listesi (Baslamadi)

- [ ] Coklu urun tek seste: "30 DN50, 20 DN65" → coklu form satiri
- [ ] scrap form alani: VoiceProductionEntry.scrap + UI adet input
- [ ] Ses dalgasi gorsellestirmesi (recording sirasinda)
- [ ] Klavye kisayolu (Ctrl+M toggle)
- [ ] Sessizlik algilama (3sn — tartismalı, uretim ortami icin riskli)

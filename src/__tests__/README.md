# AI Test Katmanı — Geliştirici Rehberi

## Hızlı Başlangıç

```bash
# Tüm testleri çalıştır
npm test

# Sadece eval suite
npx vitest run src/__tests__/eval/

# Coverage raporu
npm run test:coverage
```

---

## Test Matrix

| Dosya | Kategori | Test Konusu | Mock Seviyesi |
|---|---|---|---|
| `ai-parse-response.test.ts` | Unit/Pure | `parseAIResponse()` | Yok |
| `ai-score-parse.test.ts` | Unit/Pure | `parseScoreResponse()` | Yok |
| `ai-fallback.test.ts` | Unit/Pure | `fallbackParseRow()` | Yok |
| `stock-risk.test.ts` | Unit/Pure | `computeStockRiskLevel()` | Yok |
| `stock-utils.test.ts` | Unit/Pure | coverage/target/urgency hesapları | Yok |
| `api-mappers.test.ts` | Unit/Pure | DB→frontend mapping | Yok |
| `ai-batch-parse.test.ts` | Unit/Servis | `aiBatchParse()` | SDK (vi.hoisted) |
| `ai-ops-summary.test.ts` | Unit/Servis | `aiGenerateOpsSummary()` | SDK (vi.hoisted) |
| `ai-stock-risk.test.ts` | Unit/Servis | `aiAssessStockRisk()` | SDK (vi.hoisted) |
| `ai-score-order.test.ts` | Unit/Servis | `aiScoreOrder()` | SDK + DB mock |
| `ai-purchase-copilot.test.ts` | Unit/Servis | `aiEnrichPurchaseSuggestions()` | SDK (vi.hoisted) |
| `ai-stock-risk-route.test.ts` | Integration/Route | `POST /api/ai/stock-risk` | Servis mock |
| `ai-ops-summary-route.test.ts` | Integration/Route | `POST /api/ai/ops-summary` | Servis mock |
| `ai-purchase-copilot-route.test.ts` | Integration/Route | `POST /api/ai/purchase-copilot` | Servis mock |
| `import-parse-route.test.ts` | Integration/Route | `POST /api/import/[batchId]/parse` | Servis mock |
| `import-confirm.test.ts` | Integration/Servis | `serviceConfirmBatch()` | DB mock |
| `stock-risk-boundary.test.ts` | Boundary | Deterministik vs AI firewall | Servis mock |
| `ai-cross-capability.test.ts` | Contract | `ai_available`/`generatedAt`/degradation | Servis mock |
| `recommendations.test.ts` | Unit/Servis | Recommendation lifecycle + PATCH | Builder mock |
| `eval/eval-runner.test.ts` | Eval | Golden response regresyon testi | SDK (vi.hoisted) |

---

## Mock Stratejisi

Mock seviyeleri üçe ayrılmıştır. Bu ayrım kasıtlıdır:

### Level 1 — SDK Mock (servis testleri)
`vi.hoisted` ile Anthropic SDK constructor'ı mock'lanır. Gerçek servis kodu çalışır; sadece API çağrısı sahte yanıt döner.

**Neden:** Parsing/fallback mantığının doğruluğunu test ederken gerçek API maliyeti olmadan çalışır.

**Kullanıldığı dosyalar:** `ai-batch-parse`, `ai-ops-summary`, `ai-stock-risk`, `ai-score-order`, `ai-purchase-copilot`, `eval/eval-runner`

### Level 2 — Servis Mock (route testleri)
`vi.mock("@/lib/services/ai-service")` ile servis katmanının tamamı mock'lanır. Route handler'ın HTTP orchestration mantığı test edilir.

**Neden:** Route testlerinde servis implementasyonu değil, `Request → Response` dönüşümü test edilmek istenir.

**Kullanıldığı dosyalar:** `ai-stock-risk-route`, `ai-ops-summary-route`, `ai-purchase-copilot-route`, `ai-cross-capability`

### Level 3 — Kombine (eval + cross-capability)
SDK mock + seçili DB mock birlikte kullanılır. Hem servis davranışı hem de cross-cutting kontrakt doğrulanır.

**Kullanıldığı dosyalar:** `eval/eval-runner`, `ai-cross-capability`

---

## Ortak Helper'lar

`src/__tests__/test-helpers.ts` — tek kaynak:

```typescript
makeTextResponse(text)  // Anthropic SDK mockCreate yanıtı üretir
isValidISO(dateString)  // ISO 8601 datetime doğrular
```

> `eval/eval-helpers.ts` farklı bir sorumluluk alanıdır (structural scoring fonksiyonları). `test-helpers.ts`'ten bağımsızdır.

---

## Bilinen Bug'lar

Bug'lar `[KNOWN BUG #<id>]` prefix'iyle grep'lenebilir:

```bash
grep -r "\[KNOWN BUG" src/__tests__/
```

### `[KNOWN BUG #fallback-1]`
**Dosya:** `ai-fallback.test.ts`
**Açıklama:** `FALLBACK_FIELD_MAP`'te `"ülke"` anahtarı normalizasyon sonrası `"_lke"`'ye dönüşür ve hiçbir zaman eşleşmez. Çalışan anahtar `"ulke"` (ASCII). `ülke` anahtarı dead code.

### `[KNOWN BUG #import-1]`
**Dosya:** `import-confirm.test.ts`
**Açıklama:** Import akışı `serviceCreateOrder`'a `lines: []` iletir; ancak `serviceCreateOrder` `lines.length > 0` doğrulaması yapar. Sonuç: import'tan gelen order draft'ları her zaman validation hatasıyla başarısız olur.

---

## Davranış Asimetrisi — ops-summary AI Hatası

**Kritik fark:** AI servis hatası davranışı route'lar arasında kasıtlı olarak asimetriktir.

| Route | AI hata durumu | HTTP yanıtı |
|---|---|---|
| `POST /api/ai/stock-risk` | graceful degradation | **200** |
| `POST /api/ai/purchase-copilot` | graceful degradation | **200** |
| `POST /api/ai/ops-summary` | hata fırlatır | **500** |

**Neden:** `ops-summary`'nin deterministik fallback'i yoktur — metrikleri toplayabilir ama AI olmadan bir "özet" üretemez. Diğer iki route deterministik hesaplarını AI olmadan da yapabilir.

Bu davranış `ai-cross-capability.test.ts` ve `ai-ops-summary-route.test.ts`'te test edilir.

---

## Eval Suite

`src/__tests__/eval/` dizinine bakın.

Golden response regresyon testleri, fixture'lara dayalı parametrik testler ve Universal Degradation suite (tüm AI servisleri bozuk yanıt altında test edilir) bu dizinde yer alır.

```bash
npx vitest run src/__tests__/eval/
```

---

## Yeni Test Eklerken

1. **Mock seviyesi seç:** Servis mantığı mı test ediyorsun → Level 1. Route HTTP orchestration'ı mı → Level 2.
2. **Helper kullan:** `makeTextResponse` ve `isValidISO` için `./test-helpers`'tan import et. Yeniden tanımlama.
3. **Bilinen bug ise:** Test adını `[KNOWN BUG #<id>]` prefix'iyle başlat.
4. **Fixture ekle:** Yeni senaryo için `fixtures/` klasörüne ekle.
5. **Doğrula:** `npm test` çalıştır, tüm testler yeşil olmalı.

---

## Kapsam Dışı (Bilerek Yok)

- Gerçek API çağrısı içeren testler (CI'da `ANTHROPIC_API_KEY` sahte key)
- `/api/import/[batchId]/confirm` route handler testi (sadece servis seviyesi var)
- Pagination / concurrency / RLS testi
- Snapshot testi

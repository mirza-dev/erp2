# Sprint C — Satın Alma Önerileri Sayfası: İmplementasyon Planı

> **Önemli:** Mevcut sayfa tasarımı korunur. 3 özet kart, filtreler, tablo sütunları (TÜR/ÜRÜN ADI/SKU/DEPO/STOK/AÇIK/ÖNERİLEN-TÜKENME/KARAR), "AI zenginleştirme aktif" rozeti, "Yenile" butonu **dokunulmaz**. Sadece eksik işlevsellik, bilgi katmanı ve bug fix'ler eklenir.

## Sayfa Özeti

- **Yol:** `/dashboard/purchase/suggested` (`src/app/dashboard/purchase/suggested/page.tsx`)
- **Bağlı backend:**
  - `src/app/api/ai/purchase-copilot/route.ts`
  - `src/lib/services/purchase-service.ts`
  - `src/app/api/recommendations/[id]/route.ts`
- **Tablolar:** `recommendations`, `purchase_commitments`, `products`

## Mevcut Tasarım (Görsellerden Tespit)

**Sayfa üstü:**
- Başlık: "Satın Alma Önerileri" + alt: *"Minimum stok seviyesinin altına düşen ürünler · Öncelik sırasına göre"*
- Üstte rozet: "AI zenginleştirme aktif" (yeşil)
- Sağ üst: "Yenile" butonu

**3 özet kart:**
- TOPLAM KRİTİK: 1 (0 imalat · 1 ticari)
- EN ACİL: ürün adı + chip "7 gün kaldı" + altta "Stok, tedarik süresinden 45 gün önce tükenecek"
- TOPLAM SİPARİŞ TUTARI: ₺126.000,00 (1 ürün · ₺0,00 kabul edildi)

**Filtreler:** Search "Ürün adı veya SKU..." + sekmeler: Tümü (1) / İmalat (0) / Ticari (1)

**Tablo sütunları:** TÜR / ÜRÜN ADI / SKU / DEPO / STOK (progress bar + min) / AÇIK / ÖNERİLEN - TÜKENME / KARAR

**Tablo satır örneği:**
- TÜR: Ticari (turuncu rozet)
- ÜRÜN ADI: Albrecht-Automatik Shut-Off Vana DN80 PN40 + kırmızı chip "2 günde tükenebilir" + altta "Stok, tedarik süresinden 45 gün önce tükenecek"
- SKU: AA-SOV-DN80-PN40
- DEPO: Sevkiyat Deposu
- STOK: 7 (progress bar) min 5
- AÇIK: —
- ÖNERİLEN - TÜKENME: 45 adet · LT: 1×45=5 · 7 gün (Tükeniyor: 4 May · Sipariş: Geçti (13 Mar))
- KARAR: —

**Bu yapı zaten iyi — yeni komponent eklenmeyecek; sadece davranış ve bilgi katmanı.**

## Müşteri Perspektifi (Eksik Olan)

1. **"AI önerisi oluşturulamadı"** kırmızı toast düşebiliyor (Üretim & Stok Uyarıları'nda görüldü; bu sayfada da olabilir) → handle yok.
2. **costPrice/price NULL olan ürün → "Tahmini Tutar" yanlış hesaplanıyor** (silently 0 oluyor, toplama eksik veri ekleniyor).
3. **"Açık" sütunu boş ("—")** + anlamı belirsiz (Sprint A G4 ile aynı sorun).
4. **KARAR sütunu "—"** — kullanıcı buton görmüyor; aksiyon nasıl yapılır belirsiz. (Mevcut handleAccept/handleReject kodu var — UI'da nasıl tetikleniyor doğrulanmalı.)
5. **Karar verildikten sonra satır görsel state değişmiyor** (yarı şeffaf + "Karar verildi · az önce" + "Geri al" yok).
6. **Demo modda AI POST sessiz 403 yutuyor** — kullanıcı bilgilendirilmiyor.
7. **Karar sonrası context/recMap stale** — özet kartlar güncellenmiyor (refetch yok).
8. **Silinmiş ürün önerileri olabilir** — Sprint A G1 ile lifecycle paralel.

## Görev Listesi

### G1 — Silinmiş Ürün Önerileri Lifecycle (Sprint A G1 ile Paralel)

**Sorun:** Ürün silindiğinde aktif `recommendations` (suggestion_type='purchase_suggestion') ve aktif `purchase_recommended` alert resolve edilmiyor.

**Fix:** Sprint A G1 kapsamında — `dbDeleteProduct`/`is_active=false` hook'unda:
- İlgili recommendations `status='superseded'` set et.
- İlgili purchase_recommended alerts resolve.

**Dosya:** Sprint A G1 ile aynı yerde implementasyon.

**Test:** `purchase-suggestions-on-product-delete.test.ts` — ürün silinince öneri/alert temizlenir.

### G2 — "AI önerisi oluşturulamadı" Handle (Sprint A G3 ile Paylaşımlı)

**Sorun:** AI çağrısı başarısız → kırmızı toast (Sprint A'daki ile aynı pattern).

**Fix:** Sprint A G3'te oluşturulan `<AiUnavailableBanner>` paylaşımlı komponentini bu sayfada da kullan.

**Backend:** `src/app/api/ai/purchase-copilot/route.ts:92-98` — try/catch'in catch dalında:
```ts
catch (err) {
    aiAvailable = false;
    aiError = String((err as Error).message);
}
// response: { aiAvailable, aiError, items, recommendations, ... }
```

**Frontend:** `aiData.aiAvailable === false` ise sayfa üstünde `<AiUnavailableBanner onRetry={loadAiData} />`.

**Test:** `purchase-suggested-ai-banner.test.ts` — fail → banner; success → kaybolur.

### G3 — "Açık" Sütunu Anlamlandırma (Sprint A G4 ile Paralel)

**Sorun:** Bu sayfadaki "AÇIK" sütunu da boş ("—") + anlamı belirsiz.

**Fix:** Sprint A G4 ile aynı yaklaşım:
- Header: "Açık Sipariş"
- Tooltip: *"Bu üründe açık (onaylı + sevk edilmemiş) sipariş sayısı"*
- Boş cell `0` göster (— değil)

**Dosya:** `src/app/dashboard/purchase/suggested/page.tsx` (tablo header + cell)

**Test:** `purchase-suggested-acik-column.test.ts`.

### G4 — costPrice/price NULL → "—" + "Fiyat Eksik" Sayacı

**Sorun:** Mevcut hesap (page.tsx:641-642):
```ts
const lineCost = qty * (p.costPrice ?? p.price ?? 0);
```
costPrice ve price NULL ise silently `0` → toplam tutar yanlış (etkilenen ürünler 0₺ olarak toplama girer).

**Fix:**
```ts
const unit = p.costPrice ?? p.price ?? null;
const lineCost = unit !== null ? qty * unit : null;
// satır gösterimi:
{lineCost !== null ? formatTL(lineCost) : <Tooltip text="Fiyat tanımlı değil">—</Tooltip>}
// toplam hesabı:
const total = items.reduce((s, i) => s + (i.lineCost ?? 0), 0);
const missingPriceCount = items.filter(i => i.lineCost === null).length;
```

**UI:** TOPLAM SİPARİŞ TUTARI kartının altına (mevcut "(1 ürün · ₺0,00 kabul edildi)" satırının altına) küçük not:
> *"X üründe fiyat eksik — toplam tutar bu ürünleri içermez."*

**Dosya:** `src/app/dashboard/purchase/suggested/page.tsx:641-642` + özet kart render

**Test:** `purchase-suggested-cost-fallback.test.ts` — 2 ürünün biri NULL fiyatlı → satır "—", toplam doğru hesap, sayaç "1 üründe fiyat eksik".

### G5 — KARAR Sütununda Görünür Aksiyon

**Sorun:** Görselde KARAR=— görünüyor; kullanıcı aksiyonu nereden tetikleyecek belirsiz. (Kod inceleme gerekli — handleAccept/handleReject mevcut, ama UI'da nasıl tetikleniyor?)

**Yapılacak:**
1. Mevcut KARAR sütunu render kodunu oku.
2. Eğer butonlar drawer'da veya başka bir yerde ise, **mevcut yapıyı koruyarak** KARAR cell'inde küçük chip-buton seti ekle:
   - Pending: **[✓ Onayla]** + **[✕ Reddet]** + **[✏ Değiştir]**
   - Accepted: ✓ "Onaylandı · {relativeTime}" + **[Geri Al]**
   - Rejected: ✕ "Reddedildi · {relativeTime}" + **[Geri Al]**
   - Edited: ✏ "Düzeltildi: {qty} adet" + **[Geri Al]**
3. "Reddet" → küçük inline modal: *"Neden reddediyorsunuz?"* (text alan, 200 karakter max).
4. "Değiştir" → inline input + Onayla / Vazgeç.
5. Toast metinleri:
   - Onayla → *"Öneri onaylandı. Karar kaydedildi."* (Not: PO oluşumu Faz 13 — bu plan dışı.)
   - Reddet → *"Geribildirim kaydedildi."*
   - Geri Al → *"Karar geri alındı."*

**Dosya:** `src/app/dashboard/purchase/suggested/page.tsx` KARAR cell render

**Test:** `purchase-suggested-action-feedback.test.ts` — onayla/reddet/değiştir/geri al → toast + state + tablo render.

### G6 — Karar Sonrası Refetch

**Sorun:** Mutation başarılı dönerse `recMap` güncel, ama özet kartlar (TOPLAM KRİTİK, TOPLAM SİPARİŞ TUTARI) `aiData` üzerinden hesaplanıyor → stale.

**Fix:** `handleAccept` / `handleReject` / `handleEdit` / `handleUndo` başarılı response sonrası:
```ts
setTimeout(() => loadAiData(), 300); // debounce
```

**Dosya:** `src/app/dashboard/purchase/suggested/page.tsx:516-569`

**Test:** `purchase-suggested-refetch-after-mutation.test.ts` — mutation success → loadAiData 300ms sonra çağrılır.

### G7 — Demo Modda AI POST Kapatma + Bilgi Notu

**Sorun:** Demo modda `loadAiData` POST `/api/ai/purchase-copilot` → middleware 403 sessiz yutuyor; kullanıcı bilgilendirilmiyor.

**Fix:**
```ts
const loadAiData = useCallback(async (signal?: AbortSignal) => {
    if (isDemo) {
        setAiData(null);
        return;
    }
    // ... mevcut akış
}, [isDemo]);
```

UI: `isDemo===true` ise sayfa üstünde mavi info banner:
> *"Demo modunda AI önerileri devre dışı. Aşağıda standart hesaplamalara dayalı öneriler gösteriliyor."*

(Bu banner G2'deki AI fail banner'ından farklı — paylaşımlı `<DemoModeNotice>` veya inline.)

**Test:** `purchase-suggested-demo-mode.test.ts` — `isDemo=true` → POST yok + banner görünüyor.

### G8 — TOPLAM SİPARİŞ TUTARI Para Birimi Ayrışması

**Sorun:** Görselde "TL" (₺126.000,00) tek değer; ürünler farklı para birimlerinde ise (USD/TL) toplama yanlış.

**Fix:** Toplam hesaplaması para birimine göre grupla; kart içinde her para birimi ayrı satır:
- Eğer hepsi tek currency → tek satır (mevcut görünüm)
- Karışıksa: ₺X.XXX,XX + $Y.YY (alt alta veya yan yana küçük)

**Dosya:** `src/app/dashboard/purchase/suggested/page.tsx` özet kart render

**Test:** `purchase-suggested-multi-currency.test.ts` — TL + USD karışık → kart iki satır.

## Test Listesi

| Test dosyası | Senaryo |
|---|---|
| `purchase-suggestions-on-product-delete.test.ts` | Ürün silinince öneri/alert temizleniyor |
| `purchase-suggested-ai-banner.test.ts` | AI fail → banner + retry |
| `purchase-suggested-acik-column.test.ts` | Header "Açık Sipariş" + tooltip + 0 |
| `purchase-suggested-cost-fallback.test.ts` | NULL fiyat → "—" + sayaç |
| `purchase-suggested-action-feedback.test.ts` | Onayla/reddet/değiştir/geri al → toast + state |
| `purchase-suggested-refetch-after-mutation.test.ts` | Karar sonrası loadAiData tetiklenir |
| `purchase-suggested-demo-mode.test.ts` | Demo modda POST yok + banner |
| `purchase-suggested-multi-currency.test.ts` | Karışık currency → kartta iki satır |

## Risk

- **G1 lifecycle:** Sprint A G1 ile birlikte yapılır; ayrı yapılırsa sayfada hayalet öneriler kalır. **Sprint A önce.**
- **G5 KARAR sütununda buton:** Mevcut tablo darsa butonların yan yana sığması zor. Çözüm: küçük icon buton seti (`✓ ✕ ✏`) tooltip ile.
- **G5 "Reddet" inline modal:** Tablo satırına modal sığmıyorsa drawer veya popover kullanılır — mevcut tasarım kapsamında.
- **G7 demo banner sırası:** Demo banner ve AI fail banner aynı anda olamaz (demo modda zaten AI yok); önce demo kontrolü.
- **G8 multi-currency:** Backend response zaten currency taşıyor mu? Yoksa kontrat genişletilir.

## Doğrulama

```bash
npx vitest run src/__tests__/purchase-suggestions-on-product-delete.test.ts \
              src/__tests__/purchase-suggested-ai-banner.test.ts \
              src/__tests__/purchase-suggested-acik-column.test.ts \
              src/__tests__/purchase-suggested-cost-fallback.test.ts \
              src/__tests__/purchase-suggested-action-feedback.test.ts \
              src/__tests__/purchase-suggested-refetch-after-mutation.test.ts \
              src/__tests__/purchase-suggested-demo-mode.test.ts \
              src/__tests__/purchase-suggested-multi-currency.test.ts
npx vitest run
npx tsc --noEmit
```

**Manuel kontrol:**
1. Dev server'da `/dashboard/purchase/suggested` aç
2. **G1:** Bir ürünü sil → Satın Alma Önerilerinden çıkıyor mu?
3. **G2:** AI çağrısı başarısız (örn. ANTHROPIC_API_KEY=invalid) → banner + Yeniden dene
4. **G3:** "Açık" sütunu hover → tooltip; boş cell `0` görünüyor mu?
5. **G4:** costPrice ve price NULL ürün → "—"; üst kart altında "X üründe fiyat eksik"
6. **G5:** Pending satır → Onayla butonu görünüyor mu? Tıkla → toast + satır state + Geri Al linki
7. **G6:** Onayla sonrası TOPLAM KRİTİK kartı güncelleniyor mu (300ms sonra)?
8. **G7:** Demo modu aç → AI banner görünüyor mu? Network tab → AI POST yok
9. **G8:** Farklı currency'de iki ürün → TOPLAM SİPARİŞ TUTARI iki satır mı?

## Tamamlama Kriterleri

- [ ] G1-G8 tüm görevler implement edildi
- [ ] Sprint A G1 ile lifecycle bağı kuruldu (ürün silinince öneri+alert paralel temizleniyor)
- [ ] `<AiUnavailableBanner>` ortak komponent kullanıldı (Sprint A'da oluşturuldu)
- [ ] Yeni 8 test yeşil
- [ ] Tam suite vitest yeşil
- [ ] `npx tsc --noEmit` clean
- [ ] Commit + push
- [ ] CLAUDE.md "Mevcut Durum" güncel
- [ ] `memory/current_focus.md` güncel
- [ ] **Görsel doğrulama:** Sayfa boş hal, dolu liste, AI fail, demo mode, costPrice eksik, multi-currency senaryolarında manuel test edildi.

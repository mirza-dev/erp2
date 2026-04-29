# Sprint A — Üretim & Stok Uyarıları Sayfası: İmplementasyon Planı

> **Önemli:** Mevcut sayfa tasarımı korunur. Layout, sekmeler, kartlar, tablo sütunları, drawer yapısı **dokunulmaz**. Sadece eksik işlevsellik, bilgi katmanı ve veri lifecycle bug'ları düzeltilir.

## Sayfa Özeti

- **Yol:** `/dashboard/alerts` (`src/app/dashboard/alerts/page.tsx`)
- **Bağlı backend:**
  - `src/lib/services/alert-service.ts`
  - `src/lib/supabase/alerts.ts`
  - CRON: `/api/alerts/scan`, `/api/alerts/ai-suggest`, `/api/orders/check-shipments`

## Mevcut Tasarım (Görsellerden Tespit)

**Sayfa üstü:**
- Başlık: "Üretim & Stok Uyarıları" + alt: "Son tarama: AI taraması"
- Sağ üst: "AI Analiz" + "Tara" butonları
- Sekmeler: Tümü (191) / Kritik (191) / Uyarı / Sipariş Eksik / Teklif Süresi / Geciken Sevkiyat (172)
- Search: "Ürün adı veya SKU..." + "Ürünleri göster" filtresi

**Tablo sütunları:** ÜRÜN / NEDEN / ETKİ / ÖNERİLEN AKSİYON

**Drawer (sağ panel):** KRİTİK/UYARI rozet + ürün adı + SKU → UYARI ÖZETİ → NEDEN (3 mini istatistik kartı: Mevcut/Minimum/Açık) → ETKİ → ÖNERİLEN AKSİYON (kırmızı buton "Satın alma planla") → İLGİLİ KAYITLAR ("Ürün kartına git" + "Satın alma önerisine git") → UYARI DURUMU (`order_deadline` raw enum + zaman + Gördüm/Yoksay butonları)

**Bu yapı zaten çok iyi — yeni komponent eklenmeyecek.**

## Müşteri Perspektifi (Görsellerdeki Gerçek Sorunlar)

1. **191 uyarının %95'i "UYARI Silinmiş Ürün — Ürün silindi, uyarı geçersiz"** → liste çöp dolu, gerçek uyarılar boğuluyor.
2. **Drawer "UYARI DURUMU" alanında ham `order_deadline` enum** görünüyor — Türkçe karşılığı yok.
3. **Sağ üstte sürekli kırmızı toast: "AI önerisi oluşturulamadı"** — kullanıcı kapatamıyor, neden bilmiyor.
4. **"Açık" sütunu çoğunda "—"** — kullanıcı bu sütunun ne demek olduğunu bilmiyor.
5. **"1000 Uyarı" topbar sayacı şişkin** (silinmiş ürün kaynaklı).
6. **"Yoksay" sonrası kullanıcı geri gelir mi bilmiyor**.
7. **Quote_expired uyarısında "Süreyi uzat" gibi inline aksiyon yok** — drawer'da sadece "İLGİLİ KAYITLAR" linkleri var.
8. **AI source uyarılarda "neden öneriliyor" şeffaflığı yok** — `ai_inputs_summary` JSON DB'de var ama drawer'da gözükmüyor.

## Görev Listesi

### G1 — Silinmiş Ürün Uyarılarını Otomatik Temizle (KRİTİK)

**Sorun:** Ürün silindiğinde (`is_active=false` veya hard delete) ona bağlı aktif uyarılar resolve edilmiyor → liste çöp dolu.

**İki katmanlı fix:**

1. **İleriye dönük (yeni silmelerde):**
   - **Dosya:** `src/lib/services/product-service.ts` (veya `dbDeleteProduct`/`dbUpdateProduct` hook)
   - **İş:** Ürün silindiğinde / `is_active=false` yapıldığında ilgili `entity_id=productId` aktif uyarıları `dbBatchResolveAlerts` ile `reason='product_deleted'` resolve et.

2. **Geriye dönük (mevcut çöpü temizle):**
   - **Dosya:** `src/lib/services/alert-service.ts` `serviceScanStockAlerts` başında
   - **İş:** Aktif `entity_type='product'` uyarıları için ürünü `dbGetProductById` ile kontrol et; yoksa veya `is_active=false` ise `auto_cleanup_orphaned` reason ile resolve et.

**Etki:** Sayfa cleanup sonrası gerçek aktif uyarıları gösterir; topbar "1000 Uyarı" gerçek sayıya iner.

**Testler:**
- `alerts-cleanup-deleted-products.test.ts` — scan'de silinmiş ürün uyarısı auto-resolve
- `product-delete-resolves-alerts.test.ts` — ürün silinince ilgili uyarılar resolve

### G2 — `ALERT_TYPE_LABEL` Türkçe Etiketleri Tamamla

**Sorun:** Drawer "UYARI DURUMU" alanında `order_deadline` ham enum görünüyor.

**Dosya:** `src/app/dashboard/alerts/page.tsx:65-70`

**Fix:** Map'e ekle:
```ts
quote_expired:    "Teklif süresi geçti",
overdue_shipment: "Geciken sevkiyat",
order_deadline:   "Sipariş teslim riski",
```

Drawer'da `ALERT_TYPE_LABEL[alert.type] ?? alert.type` fallback olduğu için ham enum bir daha görünmez.

**Test:** `alerts-page-labels.test.ts` — table-driven, tüm 9 tip için Türkçe karşılık.

### G3 — "AI önerisi oluşturulamadı" Handle (Toast → Banner)

**Sorun:** AI çağrısı her başarısız olduğunda sağ üstte kırmızı toast düşüyor; kullanıcı kapatamıyor, neden bilmiyor, retry edemiyor.

**Fix:**
1. AI hatası yakalandığında toast yerine sayfa üstünde sarı `<AiUnavailableBanner>` (yeni ortak komponent — Sprint C ile paylaşılır):
   > *"AI analizi şu an oluşturulamadı. Stok ve sipariş uyarıları gösterilmeye devam ediyor."* + **[Yeniden dene]** linki.
2. "Analiz Başlat" / "AI Analiz" butonuna tıkladığında AI çağrısı 1× tetikleniyor (auto-retry yok); kullanıcı kontrol eder.
3. Backend response'a `aiAvailable: boolean, aiError?: string` ekle.

**Dosya:** `src/app/api/alerts/ai-suggest/route.ts` + `src/components/ai/AiUnavailableBanner.tsx` (yeni, paylaşımlı)

**Test:** `alerts-ai-banner.test.ts` — fail → banner; başarı → banner kayboluyor.

### G4 — "Açık" Sütununun Anlamlandırılması

**Sorun:** Tablo sütunlarından "AÇIK" çoğu satırda "—" gösteriyor; kullanıcı ne demek bilmiyor.

**Fix:** Sütun başlığını **"Açık Sipariş"** yap; başlığa hover tooltip: *"Bu üründe açık (onaylı + sevk edilmemiş) sipariş sayısı"*. Boş olduğunda `0` göster, `—` değil.

**Dosya:** `src/app/dashboard/alerts/page.tsx` (tablo başlık + cell render)

**Test:** `alerts-acik-column.test.ts` — header text + tooltip + 0 görünüm.

### G5 — "Yoksay" Sonrası Açıklayıcı Toast

**Sorun:** Yoksay'a tıklandığında uyarı kaybolur; kullanıcı geri gelir mi bilmiyor.

**Fix:** Mevcut yoksay handler'ında toast metni güncelle:
> *"Uyarı yoksayıldı. 24 saat içinde durum kötüleşmezse yeniden açılmaz."*

**Dosya:** `src/app/dashboard/alerts/page.tsx` (yoksay handler)

### G6 — Quote_expired İçin Drawer İçi Süre Uzat

**Sorun:** Drawer'da "ÖNERİLEN AKSİYON" altında sadece "Satın alma planla" var; quote_expired tipi için "Süreyi uzat" yok. Kullanıcı her seferinde alerts → orders/[id] gidiyor.

**Fix:** Drawer'da `alert.type==='quote_expired'` ise "ÖNERİLEN AKSİYON" alanına inline form:
- Tarih input (`type="date"`, default: bugün+30)
- Buton: **"Süreyi Uzat"** → backend `serviceUpdateQuoteDeadline`
- "İLGİLİ KAYITLAR" altına da "Sipariş detayına git →" linki eklenir.

**Test:** `alerts-quote-extend.test.ts`.

### G7 — AI Uyarısı Drawer'ında "AI Analizi" Detayı

**Sorun:** AI source uyarılarda `ai_inputs_summary` JSONB DB'de var, drawer'da gizli. Kullanıcı "neden öneriliyor" göremiyor.

**Fix:** Drawer'da `alert.source==='ai'` ise "İLGİLİ KAYITLAR"dan önce kapanabilir mini accordion **"AI ANALİZİ"** → `ai_inputs_summary` key'lerini Türkçe etiketle listele.

**Helper:** `src/lib/ai-summary-labels.ts`:
```ts
export const AI_SUMMARY_LABELS: Record<string, string> = {
  criticalCount:   "Kritik ürün sayısı",
  warningCount:    "Uyarı seviyesi ürün sayısı",
  coverageDaysAvg: "Ortalama gün karşılığı",
  riskOrders:      "Risk altındaki sipariş sayısı",
  // ...
};
```

**Test:** `alerts-ai-summary.test.ts` — accordion render + Türkçe etiket.

### G8 — Manuel Dismissed 24 Saat Dedup

**Sorun:** Yoksay'a tıklanan uyarı 5 dakikada bir CRON ile yeniden açılıyor → frustrating.

**Migration:** `041_alerts_dismissed_at.sql` — `alerts.dismissed_at timestamptz` ekle (yoksa). PATCH dismiss handler bu alanı doldurur.

**Fix:**
- `serviceScanStockAlerts` dedup setine `dbListRecentlyDismissed(hours=24)` ekle.
- **Severity escalation bypass:** `dismissed_severity='warning'` iken yeni alert `severity='critical'` ise yine create.
- `purchase_recommended` için bypass yok (AI yeniden değerlendirebilir).

**Test:** `alert-scan-respect-dismissed.test.ts`.

### G9 — Dead Code: `import_review_required`

**Dosya:** `src/lib/database.types.ts:17`

**Fix:** AlertType union'undan çıkar. Hiç create edilmiyor; kafa karıştırıcı.

**Test:** Yeni test gerekmiyor — `npx tsc --noEmit` clean yeterli.

## Test Listesi

| Test dosyası | Senaryo |
|---|---|
| `alerts-cleanup-deleted-products.test.ts` | Scan'de silinmiş ürün uyarısı auto-resolve |
| `product-delete-resolves-alerts.test.ts` | Ürün silinince ilgili uyarılar resolve |
| `alerts-page-labels.test.ts` | `ALERT_TYPE_LABEL` table-driven, 9 tip |
| `alerts-ai-banner.test.ts` | AI fail → banner; success → banner kaybolur |
| `alerts-acik-column.test.ts` | Header "Açık Sipariş" + tooltip + 0 değer |
| `alerts-quote-extend.test.ts` | Drawer içi süre uzatma akışı |
| `alerts-ai-summary.test.ts` | AI source → accordion + Türkçe etiketler |
| `alert-scan-respect-dismissed.test.ts` | 24h dedup + severity escalation bypass |

## Risk

- **G1 cleanup geri dönüşsüz:** Auto-resolved uyarıların geri yüklenmesi gerekmez (silinmiş ürün için anlamsız), ama dikkatli `reason='auto_cleanup_orphaned'` ile loglanır → audit izlenir.
- **G3 banner hatalı yer:** Sayfanın hangi pozisyonda banner gösterileceği UX kararı; öneri: başlık altı, sekmelerin üstü.
- **G6 süre uzatma input validation:** Tarih bugünden küçük olamaz — frontend + backend kontrolü.
- **G8 severity escalation:** bypass mantığı yanlışsa kullanıcı "yoksaydım, geldi yine" şikayeti alır. Test bunu net yapar.
- **G9 enum migration:** Eğer DB enum/check'inde `import_review_required` varsa migration'la kaldır; yoksa sadece TS değişikliği.

## Doğrulama

```bash
npx vitest run src/__tests__/alerts-cleanup-deleted-products.test.ts \
              src/__tests__/product-delete-resolves-alerts.test.ts \
              src/__tests__/alerts-page-labels.test.ts \
              src/__tests__/alerts-ai-banner.test.ts \
              src/__tests__/alerts-acik-column.test.ts \
              src/__tests__/alerts-quote-extend.test.ts \
              src/__tests__/alerts-ai-summary.test.ts \
              src/__tests__/alert-scan-respect-dismissed.test.ts
npx vitest run
npx tsc --noEmit
```

**Manuel kontrol:**
1. Dev server'da `/dashboard/alerts` aç
2. **G1:** "Tara" → "Silinmiş Ürün" satırları kayboluyor mu? Tab sayaçları gerçek değere indi mi?
3. **G2:** Drawer aç → UYARI DURUMU alanında ham enum yerine Türkçe etiket var mı?
4. **G3:** AI çağrısı başarısız olduğunda kırmızı toast yerine sarı banner görünüyor mu?
5. **G4:** "Açık" sütunu hover → tooltip görünüyor mu? Boş cell `0` gösteriyor mu?
6. **G5:** "Yoksay" → toast 24h mesajı gösteriyor mu?
7. **G6:** quote_expired drawer → "Süreyi Uzat" inline form çalışıyor mu?
8. **G7:** AI source uyarı drawer → "AI Analizi" accordion açılıyor mu?
9. **G8:** Yoksay → 5 dk sonra "Tara" → uyarı yeniden açılmadı mı?

## Tamamlama Kriterleri

- [ ] G1-G9 tüm görevler implement edildi
- [ ] Migration `041_alerts_dismissed_at.sql` uygulandı
- [ ] Yeni 8 test yeşil
- [ ] Tam suite vitest yeşil
- [ ] `npx tsc --noEmit` clean
- [ ] `<AiUnavailableBanner>` ortak komponent oluşturuldu (Sprint C ile paylaşımlı)
- [ ] Commit + push
- [ ] CLAUDE.md "Mevcut Durum" güncel
- [ ] `memory/current_focus.md` güncel
- [ ] **Görsel doğrulama:** Sayfa cleanup öncesi ve sonrası ekran görüntüleri karşılaştırıldı (silinmiş ürün satırları yok)

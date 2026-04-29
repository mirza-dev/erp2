# Sprint B — AI İçeri Aktar Sayfası: İmplementasyon Planı

> **Önemli:** Mevcut wizard tasarımı korunur. Adım layout'u, progress göstergesi, intro kartlar, kolon eşleştirme tab'ları, "Hafıza" chip'leri, "Toplu doldur", required field yıldızları **dokunulmaz**. Sadece eksik bilgi notları, bug fix'ler ve veri bütünlüğü iyileştirmeleri yapılır.

## Sayfa Özeti

- **Yol:** `/dashboard/import` (`src/app/dashboard/import/page.tsx`)
- **Bağlı backend:**
  - `src/lib/services/import-service.ts` (`serviceConfirmBatch`)
  - `src/lib/services/ai-service.ts` (`aiDetectColumns`)
  - API: `/api/import/**`
- **Tablolar:** `import_batches`, `import_drafts`, `column_mappings`, `ai_entity_aliases`

## Mevcut Tasarım (Görsellerden Tespit)

**Sayfa üstü:** "Veri İçe Aktarım" + alt: *"Excel dosyanızı yükle — kolon eşleştirme, önizleme ve içe aktarım"*

**Adım progress (sticky üst):**
✓ Dosya Okuma → ▶ Sheet Seçimi → Kolon Eşleştirme → İnceleme → İçe Aktarım → Tamamlandı (6 adım, ✓ ile geçilen adımlar tick'li)

**Adım 1 — Upload zone:**
- Drag-drop alanı + "Dosya Seç" butonu
- Format chip'leri: XLSX / XLS / CSV + "çok-sheet desteklenir" notu
- 3 yardım kartı (intro): Çok-Sheet Desteği / Akıllı Kolon Eşleştirme / Seçici İçe Aktarım

**Adım 2 — Sheet Seçimi:**
- "Dosyada X sheet bulundu · Y içe aktarılabilir · Z seçili"
- Her sheet kartı: ad + kolon listesi + satır sayısı + "İçe Aktarılabilir" yeşil chip
- Footer: Geri / Kolon Eşleştirmeye Geç →

**Adım 3 — Kolon Eşleştirme:**
- 8 entity tab'ı (Ürünler / Müşteriler / Teklifler / ...)
- Her satır: Excel Kolonu | ERP Alanı (dropdown) | Kaynak chip ("Hafıza" yeşil)
- "Bu eşleştirmeyi hatırla" checkbox
- Footer: Geri / Eşleştirmeyi Uygula →

**Adım 4 — İnceleme:**
- 8 entity tab'ı (satır sayıları görünür)
- Hint: *"Toplam: X satır · Hücreye tıkla → düzelt"*
- Required field yıldızla işaretli: `sku *`, `name *`, `unit *`
- "Toplu doldur: Alan seç + Değer + Kopyala Uygula" özelliği
- Footer: Geri / Onayla ve İçe Aktar →

**Adım 5-6 — İçe Aktarım & Tamamlandı:** (Görselsiz; `confirmResult` döndüğü ekran)

**Bu yapı zaten çok iyi — yeni komponent eklenmeyecek.**

## Müşteri Perspektifi (Eksik Olan)

1. **Upload zone'da max dosya boyutu yazmıyor** + kod-level kontrol yok → 100 MB+ dosya browser'ı patlatabilir.
2. **Adım 4'te hücre düzeltmesi sessiz fail edebiliyor** — sunucu hata verirse kullanıcı "düzelttim" sanır ama confirm sırasında orijinal data merge'lenir.
3. **`serviceConfirmBatch` race condition** — aynı batch iki kez confirm edilirse ürün/müşteri/sipariş duplicate insert.
4. **Sonuç ekranında entity-bazlı özet eksik** — kullanıcı "X eklendi" ne olduğunu bilmiyor (ürün mü, sipariş mi?).
5. **Order line `sort_order` collision** — aynı siparişe birden fazla satır draft'ı varsa hepsine aynı `sort_order` atanıyor.
6. **AI source chip'inde yüzde gösterimi belirsiz** — görselde sadece "Hafıza" chip'leri var (dosya hafızada olduğu için doğal); AI source çıktığında "AI %X" yüzdesi görünüyor mu doğrulanmalı.

## Görev Listesi

### G1 — Upload Zone'a Max Boyut Notu + Kontrol

**Mevcut metin:** *"XLSX/XLS/CSV · çok-sheet desteklenir"*

**Fix:**
1. Notu güncelle: *"XLSX/XLS/CSV · çok-sheet desteklenir · max 25 MB"*
2. **Dosya:** `src/app/dashboard/import/page.tsx:176-184` (`handleFileSelect`)
   ```ts
   const MAX_FILE_SIZE = 25 * 1024 * 1024;
   if (file.size > MAX_FILE_SIZE) {
       toast({ type: "error", message: "Dosya 25 MB'tan büyük. Lütfen daha küçük bir dosya seçin." });
       return;
   }
   ```

**Test:** `import-file-size-limit.test.ts` — 26 MB dosya → toast + reject; 24 MB → kabul.

### G2 — Inline Edit Silent Fail → Toast + Rollback

**Sorun:** `commitEdit` (page.tsx:309-323) `try{...}catch{/* ignore */}` siliyor → server hata verirse local state yine güncellendi sayılır → kullanıcı confirm'de orijinal data merge edildiğini fark etmez.

**Dosya:** `src/app/dashboard/import/page.tsx:309-323`

**Fix:** Yutmayı kaldır:
```ts
const commitEdit = async (draftId: string, field: string) => {
    setEditingCell(null);
    const prev = draftEdits[draftId] ?? {};
    const newEdits = { ...prev, [field]: editingValue };
    setDraftEdits(d => ({ ...d, [draftId]: newEdits })); // optimistic

    try {
        const res = await fetch(`/api/import/drafts/${draftId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_corrections: newEdits }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
        setDraftEdits(d => ({ ...d, [draftId]: prev })); // rollback
        toast({ type: "error", message: "Düzeltme kaydedilemedi — tekrar deneyin." });
    }
};
```

**Test:** `import-inline-edit-rollback.test.ts` — fetch reject → state geri çekilir + toast.

### G3 — `serviceConfirmBatch` Race Condition (Atomik CAS)

**Sorun:** Read at line 88 + Write at line 588 arasında lock yok → aynı batch iki sekmeden confirm edilirse iki kez işlenir.

**Migration:** `041_import_batches_confirming_status.sql` — `import_batches.status` enum/check'ine `'confirming'` değeri ekle.

**Fix:**

1. Yeni helper `dbClaimBatchForConfirm(batchId)`:
```sql
UPDATE import_batches SET status='confirming', updated_at=now()
WHERE id=$1 AND status IN ('pending','partial')
RETURNING id
```

2. **Dosya:** `src/lib/services/import-service.ts:87-90`:
```ts
export async function serviceConfirmBatch(batchId: string): Promise<ConfirmResult> {
    const claimed = await dbClaimBatchForConfirm(batchId);
    if (!claimed) throw new Error("Batch zaten işleniyor veya onaylanmış.");
    
    try {
        // ... mevcut işlem ...
        await dbUpdateBatchStatus(batchId, "confirmed");
        return result;
    } catch (err) {
        await dbUpdateBatchStatus(batchId, "pending"); // hata → geri çek
        throw err;
    }
}
```

3. **Stuck `'confirming'` toparlama:** Opsiyonel — 30 dk eski `'confirming'` → `'pending'` CRON. (Şimdilik manuel SQL yeterli.)

**Test:** `import-confirm-race.test.ts` — paralel iki `serviceConfirmBatch(id)` → biri başarılı, diğeri throw; entity'ler 2× insert edilmemeli.

### G4 — Order Line `sort_order` Collision Fix

**Sorun:** `src/lib/services/import-service.ts:396-416` — aynı `order_id`'ye birden fazla satır draft'ı varsa hepsine aynı `sort_order = existingLines[0].sort_order + 1` atanıyor.

**Fix:** Loop dışında cache:
```ts
const nextSortByOrder = new Map<string, number>();
// ... her order_line draft için:
const cached = nextSortByOrder.get(orderId);
let nextSort: number;
if (cached !== undefined) {
    nextSort = cached;
} else {
    const { data: existing } = await supabase
        .from("order_line_items").select("sort_order")
        .eq("order_id", orderId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    nextSort = (existing?.sort_order ?? 0) + 1;
}
nextSortByOrder.set(orderId, nextSort + 1);
// insert with sort_order = nextSort
```

**Test:** `import-order-line-sort-order.test.ts` — aynı order'a 3 line → sort_order 1, 2, 3.

### G5 — AI Source Chip'inde Yüzde Gösterimi (Doğrulama + Fix)

**Sorun:** Görsellerde sadece "Hafıza" chip'i göründü. AI source çıktığında "AI %X" yüzdesi rendering'de var mı doğrulanmalı; yoksa eklenmeli.

**Yapılacak:**
1. Mevcut chip render kodunu oku (`src/app/dashboard/import/page.tsx` adım 3 / kolon eşleştirme tablosu).
2. AI source için `confidence` field var ise: `AI %{Math.round(confidence*100)}` chip metni.
3. Yoksa "AI" + tooltip "{Math.round(confidence*100)}% güven".

**Test:** `import-source-chips-ai-percent.test.ts` — AI source + confidence=0.85 → chip metni "AI %85".

### G6 — Sonuç Ekranında Entity-Bazlı Özet

**Sorun:** Mevcut sonuç ekranı `{added, updated, skipped, errors}` toplam — kullanıcı 15 eklendi ne demek bilmiyor (ürün mü, sipariş mi?).

**Dosya:** `src/lib/services/import-service.ts` (`ConfirmResult` tipi) + `src/app/dashboard/import/page.tsx:920-963` (sonuç ekranı render)

**Fix:**

1. `ConfirmResult` tipine ekle:
```ts
byEntity: Record<EntityType, { added: number; updated: number; skipped: number }>;
```

2. Service her entity dalında ilgili sayaca yaz (mevcut toplam sayaçlar korunur — geriye dönük).

3. UI: Türkçe başlıklı tablo ekle (mevcut sonuç kartlarını korur, altına tablo gelir):

| Tür | Eklendi | Güncellendi | Atlandı |
|-----|---------|-------------|---------|
| Ürün | 8 | 3 | 1 |
| Müşteri | 5 | 0 | 0 |
| Sipariş | 2 | 0 | 1 |
| Sipariş Satırı | 12 | 0 | 0 |
| Teklif | 0 | 0 | 0 |
| Sevkiyat | 0 | 0 | 0 |
| Fatura | 0 | 0 | 0 |
| Tahsilat | 0 | 0 | 0 |
| Stok Hareketi | 5 | 0 | 0 |

Hata listesi varsa: *"3 satır içe aktarılamadı:"* + her hata 1 cümle.

**Test:** `import-result-by-entity.test.ts` — entity başına özet doğru hesaplanıyor.

## Test Listesi

| Test dosyası | Senaryo |
|---|---|
| `import-file-size-limit.test.ts` | 26 MB dosya → toast + reject |
| `import-inline-edit-rollback.test.ts` | Fetch fail → state geri çekilir + toast |
| `import-confirm-race.test.ts` | Paralel iki confirm → biri başarılı, diğeri throw |
| `import-order-line-sort-order.test.ts` | Aynı order'a 3 line → sort_order 1,2,3 |
| `import-source-chips-ai-percent.test.ts` | AI source + confidence → "AI %X" |
| `import-result-by-entity.test.ts` | Entity başına özet doğru |
| `import-confirm.test.ts` (mevcut) | Regresyon — toplam sayaçlar değişmedi |

## Risk

- **G3 status enum migration:** Prod deploy sıralaması — kod ve schema birlikte deploy edilmeli. `'confirming'` mevcut data için yok → eski batch'ler etkilenmez.
- **G3 stuck `'confirming'`:** Worker crash olursa batch sonsuza kalabilir. Kurtarma: manuel `UPDATE import_batches SET status='pending' WHERE status='confirming' AND updated_at < now() - interval '30 minutes'`.
- **G2 optimistic state:** Kullanıcı başarılı düzeltmeyi gördükten sonra hücre 1s flash'lı yeşil; başarısızsa kırmızı flash + rollback. UX karmaşası yaratmamak için flash sadece ilgili hücreye uygulanır.
- **G6 service değişikliği:** `byEntity` ekleme geriye dönük (mevcut sayaçlar korunur). Mevcut testler etkilenmez.

## Doğrulama

```bash
npx vitest run src/__tests__/import-file-size-limit.test.ts \
              src/__tests__/import-inline-edit-rollback.test.ts \
              src/__tests__/import-confirm-race.test.ts \
              src/__tests__/import-order-line-sort-order.test.ts \
              src/__tests__/import-source-chips-ai-percent.test.ts \
              src/__tests__/import-result-by-entity.test.ts \
              src/__tests__/import-confirm.test.ts
npx vitest run
npx tsc --noEmit
```

**Manuel kontrol:**
1. Dev server'da `/dashboard/import` aç
2. **G1:** 26 MB dosya seç → toast hata + dosya kabul edilmedi mi?
3. **G2:** Adım 4'te hücreyi düzelt + sunucuyu kapat → toast + eski değer geri geldi mi?
4. **G3:** Aynı batch'i iki sekmeden aynı anda confirm et → biri başarılı, diğeri "zaten işleniyor" hatası mı?
5. **G4:** Aynı order'a 3 satır draft içeren dosyayı confirm et → DB'de sort_order 1,2,3 mi?
6. **G5:** AI source chip'inde "AI %85" gibi yüzde görünüyor mu?
7. **G6:** Sonuç ekranında entity-bazlı tablo görünüyor mu?

## Tamamlama Kriterleri

- [ ] G1-G6 tüm görevler implement edildi
- [ ] Migration `041_import_batches_confirming_status.sql` uygulandı
- [ ] Yeni 6 test + regresyon yeşil
- [ ] Tam suite vitest yeşil
- [ ] `npx tsc --noEmit` clean
- [ ] Commit + push
- [ ] CLAUDE.md "Mevcut Durum" güncel
- [ ] `memory/current_focus.md` güncel
- [ ] **Görsel doğrulama:** Wizard'ın 6 adımı manuel olarak gezildi, tüm fix'ler çalışıyor.

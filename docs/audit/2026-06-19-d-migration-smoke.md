# D — Migration Durumu + MANUAL Doğrulama SQL'leri + Birikmiş Smoke Checklist

**Tarih:** 2026-06-19
**Tetikleyen:** `deferred_backlog` D — "migration APPLY + smoke (kullanıcı tarafı; yeşil testler kapsamaz)". Liste bayat olabileceği uyarısıyla ilk iş migration durumunu kesinleştirmekti.
**Sınır (dürüst rapor):** Otomatik kısım (OpenAPI probe + gate hygiene) bu turda **AI tarafında kapandı**. Kalan iki iş — fonksiyon-gövdeli MANUAL doğrulama ve tarayıcı smoke'ları — kaçınılmaz **kullanıcı tarafıdır** (ortamda `DATABASE_URL`/psql yok → arbitrary SQL koşulamaz; tarayıcı sürülemez).

---

## §1 — Otomatik probe sonucu (✅ GREEN)

`npx tsx scripts/check-migrations.ts` (tek READ-ONLY istek, PostgREST OpenAPI):

```
[mig-gate] lokal migration: 104 dosya · probe: 17 · manuel: 8
  ✅ 073 · 075 · 079 · 080 · 084 · 085 · 086 · 087 · 088 · 090 ·
     091 · 092 · 096 · 097 · 098 · 099 · 100   (17/17)
[mig-gate] OK — problanan tüm migration'lar canlıda mevcut.
```

**Sonuç:** Auto-probe edilen tüm tablo/kolon/RPC nesneleri canlıda **mevcut** — CLAUDE.md'deki eski "088 BLOKER / 091 APPLY bekliyor" notları **bayat**, gerçek durum GREEN.

**Gate hygiene (bu tur):** `scripts/check-migrations.ts` MANUAL map'ine **mig.104** eklendi. Önceden `reverse_production` REDEFINE (production O1 fix'i) hiç izlenmiyordu → script doktrini gereği artık `⚠️ 104 … elle doğrula` satırı olarak raporlanır (sessiz untracked kapandı).

---

## §2 — MANUAL redefine doğrulama SQL'leri (Studio SQL editor, kullanıcı)

Bu migration'lar fonksiyon gövdesi / CHECK constraint olduğundan OpenAPI'de **görünmez**. Supabase Studio → SQL editor'de çalıştır; beklenen sonuç yanında.

| Mig | SQL | Beklenen |
|---|---|---|
| **089** po_overdue alert | `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='alerts'::regclass AND contype='c';` | CHECK metni `'po_overdue'` içermeli |
| **093** finansal recompute | `SELECT prosrc LIKE '%v_line_total%' FROM pg_proc WHERE proname='create_order_with_lines';` | `true` |
| **094** quote send fix | `SELECT prosrc LIKE '%qli.description%' FROM pg_proc WHERE proname='send_quote_and_create_pending_order';` <br> `SELECT indexdef FROM pg_indexes WHERE indexname='uq_sales_orders_quote_id';` | `true` <br> index `WHERE status <> 'cancelled'` (iptal hariç) içermeli |
| **095** lock hijyeni | `SELECT proname, proconfig FROM pg_proc WHERE proname LIKE '%scan_lock%';` | proconfig'te `search_path=...` set olmalı |
| **101** rfq_response_due alert | `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='alerts'::regclass AND contype='c';` | CHECK metni `'rfq_response_due'` içermeli |
| **102** create_rfq ambiguity | `SELECT prosrc NOT LIKE '%ON CONFLICT (rfq_id%' FROM pg_proc WHERE proname='create_rfq_with_lines';` | `true` (DISTINCT'li, ON CONFLICT'siz sürüm) |
| **103** award integrity | `SELECT prosrc LIKE '%fiyat vermedi%' FROM pg_proc WHERE proname='award_rfq_create_pos';` | `true` (O2 sunucu-otoriter fiyat + D2 mükerrer satır guard) |
| **104** reverse_production O1 | `SELECT prosrc LIKE '%for update%' FROM pg_proc WHERE proname='reverse_production';` | `true` (entry select satır kilidi — eşzamanlı çift-DELETE → stok 2× düşme fix) |

> **Not:** 101/102/103 RFQ turunda APPLY + uçtan-uca smoke ile zaten ✅ doğrulanmıştı (RFQ-2026-0001→PO-2026-0007); buradaki doğrulama formalitedir. 104 production turunda "APPLY ✅" işaretliydi — bu SQL onu da teyit eder.

---

## §3 — Birikmiş smoke checklist (kullanıcı, tarayıcı)

Son turların `Kalan: smoke` borçları tek listede. Her madde tek bir gözlem.

### RBAC guard'ları (A3 + kampanya B)
- [ ] **production** ve **purchasing** rolleri → `GET /api/quotes` ve `GET /api/quotes/[id]` → **403**.
- [ ] **accounting** → `GET /api/inventory/movements` → **403**; `GET /api/products/[id]/quotes` → **403**; `GET /api/alerts/[id]` → **403**.
- [ ] **production** → `GET /api/customers` → **403**.
- [ ] **sales / accounting / viewer + demo(viewer)** → `GET /api/quotes` → **200**.
- [ ] Tüm rollerde **dashboard** normal: Teklif Hattı KPI (view_quotes yoksa fail-soft, hata yok), StockPanel, AlertsPanel görüntülenir.

### production O1 (mig.104 — eşzamanlılık)
- [ ] Aynı üretim kaydını 2 sekmede aç → ikisinden de "Geri Al" → stok **1×** geri alınır (2× DEĞİL); ikinci işlem temiz hata/no-op döner.

### orders Y1/O2
- [ ] `approved` + `partially_allocated` sipariş → ilgili PO mal kabul → sipariş otomatik **`allocated`** + "Sevket" butonu açılır.
- [ ] "Yeniden Rezerve Et" → aynı sonuç (açık shortage çözülür).
- [ ] `allocated` değilken "Sevket" **disabled**.

### mig.099 — teklif satır birimi
- [ ] Teklifte ürün seç → **birim otomatik dolar**; elle "kg" yaz → kaydet → yenile → korunur.
- [ ] Önizle/PDF → miktar+birim birleşik ("12 metre"); birim boşsa yalnız sayı.
- [ ] Teklifi **Kabul et** → siparişte birim teklifle aynı (COALESCE).

### quote send / e-posta
- [ ] Taslak Gönder → mailde **`Teklif-<no>.pdf`** eki açılır (Türkçe karakter + logo); gövdede paylaşım linki **yok**.
- [ ] Kaydet → Gönder onayında **güncel** e-posta adresi (stale değil).

### Genel
- [ ] Koyu + aydınlık tema her ekranda tutarlı.
- [ ] **Demo modda** tüm mutasyon yüzeyleri bloklu (gezinti/okuma çalışır).

---

## Özet
- AI tarafı: ✅ auto-probe GREEN (17/17) + mig.104 gate'e eklendi (untracked kapandı).
- Kullanıcı tarafı: §2 (8 MANUAL SQL — Studio) + §3 (browser smoke checklist).

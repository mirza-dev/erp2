---
name: reference_rfq_module
description: "Tedarikçi Fiyat Talebi (RFQ) modülü — mimari, veri modeli, akış, bilinçli ertelemeler"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3db100be-70e2-404d-9834-ee5b61f72929
---

**Tedarikçi Fiyat Talebi (RFQ) modülü** (2026-06-16, mig.100). Satın alma tarafında fiyat
araştırması: talep oluştur → çok tedarikçiye gönder → her birinin fiyatını gir → yan yana
karşılaştır → kazananı satın alma siparişine (PO) çevir. Müşteri Teklif mimarisini aynalar,
uçta mevcut PO'ya bağlanır. UI: Satın Alma → "Fiyat Talepleri" (`/dashboard/purchase/rfqs`).

**Odoo modeli:** RFQ ≈ taslak PO. `award_rfq_create_pos` RPC kazanan kalemleri vendora göre
gruplar, her vendor için **mevcut `create_purchase_order_with_lines` (mig.049)** çağırır →
vendor başına 1 PO (PO numara/atomiklik/audit ücretsiz gelir).

**Veri modeli (mig.100, 6 tablo + sayaç):** `supplier_rfqs` (başlık; status
draft|sent|awarded|cancelled), `supplier_rfq_lines` (istenen kalemler, **fiyat YOK**),
`supplier_rfq_vendors` (davet+takip: invited|sent|responded|declined|no_response, UNIQUE
rfq+vendor), `supplier_rfq_prices` (matris hücreleri: rfq_vendor×rfq_line→unit_price[NULL=
teklif yok]+is_awarded), `supplier_price_history` (boylamsal "kimde ne kadar"),
`supplier_rfq_archives` (gönderim PDF/HTML snapshot, rfq+vendor UNIQUE). `rfq_counters`+
`generate_rfq_number` → `RFQ-YYYY-NNNN`. **`product_vendor_links` ALTER:** +last_unit_price/
last_price_currency/last_price_at — vendor yanıtı/award son fiyatı ürün-tedarikçi linkinde
kalır (PO formu fiyat önerisi + "kimde ne kadar" ürün kartında).

**RPC'ler:** create/update_rfq_with_lines (draft-only update, FOR UPDATE), mark_rfq_sent,
upsert_rfq_vendor_quote (idempotent replace; non-null fiyat → price_history + product_
vendor_links upsert), award_rfq_create_pos, cancel_rfq. Hepsi audit_log'a yazar, tek
migration'da tanımlı → REDEFINITION_CHAINS GEREKMEZ (sql-lint).

**Backend:** `lib/supabase/supplier-rfqs.ts` (DB client) + `rfq-archives.ts` (storage,
quote-pdf-archives deseni, rfq-pdfs bucket), `lib/rfq-validation.ts`, `lib/rfq-comparison.ts`
(saf bestVendorPerLine + exchange-rates cross-currency çeviri), `lib/services/rfq-service.ts`
(serviceSendRfq: arşiv+e-posta NON-FATAL, durum yine sent'e geçer). RBAC: `view_rfqs`/
`manage_rfqs` (permissions.ts; purchasing ikisi, accounting yalnız view); fiyat redaction =
mevcut `view_purchase_costs` (`redactRfqDetailForPerms`); page-access `/dashboard/purchase/
rfqs`→view_rfqs (FAIL-CLOSED matrise eklendi). Award route `manage_rfqs` **VE** `manage_
purchase_orders` ister. API: `/api/rfqs` (GET/POST), `[id]` (GET/PATCH/DELETE), `[id]/send`,
`[id]/vendors/[vendorId]/quote` (PATCH; vendorId = supplier_rfq_vendors.id), `[id]/award`,
`[id]/cancel`, `[id]/archive?vendor=&view=1`. Demo bloklama = RBAC (demo=viewer→manage yok).

**UI:** liste (durum sekmeleri + yanıt ilerleme rozeti), yeni (RfqForm: ürün satırları +
tedarikçi çoklu-seçim checkbox), detay-hub ([id]/page.tsx: vendor paneli + VendorQuoteModal
fiyat girişi + ComparisonMatrix [satır=kalem, sütun=tedarikçi, en ucuz YEŞİL, satır başına
kazanan seç] + "Seçilenlerden PO Oluştur"). Sidebar "Satın Alma" → "Fiyat Talepleri".

**Takip geliştirmeleri (2026-06-16, PUSH `1c89326` — v1 ertelemeleri KAPANDI):**
- **PDF eki ✅** `src/lib/rfq-pdf/` (RfqPdfDocument react-pdf, fiyatsız, quote fontları reuse);
  serviceSendRfq `Fiyat-Talebi-<no>.pdf` ekler, arşiv HTML in-app "Belge" view'da kalır.
- **PO son-fiyat önerisi ✅** `dbListVendorLinks`+`GET /api/product-vendor-links`
  (`redactVendorLinksForPerms`); `pickPurchaseUnitPrice(product, vendorLastPrice?)` öncelik
  tedarikçi>cost_price; ürün detay Tedarik sekmesi `SupplierPricesPanel` ("kimde ne kadar").
- **RFQ tedarikçi önerisi ✅** `rfq-suggest.suggestVendorsForProducts`; new formda "Önerilen"
  rozeti + son fiyat + "Önerilenleri seç".
- **`rfq_response_due` alert ✅** mig.101 (alerts type CHECK); `dbListRfqsAwaitingResponse`+
  `serviceCheckRfqResponseDue` (po_overdue aynası) + scan + Vadeler + takvim "Talebi Aç" link.
- **Tek kalan erteleme:** ayrı `[id]/print` sayfası yok — arşiv-view route yeterli.

**Durum:** modül + 4 takip bitti, tsc 0/lint 0/**5461 test**/build 0. mig.100 APPLY ✅;
**mig.101 APPLY BEKLİYOR** (kullanıcı Studio). İlişkili: [[project_domain]]
[[reference_quote_line_columns]] [[reference_worktree_branches]].

---
name: Yüksek Etki Stok Özellikleri Planı
description: 4 Odoo'dan ilham alınan stok özelliği — 3/4 tamamlandı, 4. (Tedarikçi Performansı) kullanıcı kararıyla KAPALI/yapılmayacak (2026-09-16)
type: project
---

4 özellik (öncelik sırasıyla):
1. ✅ **Sanal Stok** — quoted/promisable/incoming/forecasted (tamamlandı)
2. ✅ **Stok Eskime Raporu** — aging sayfası + API (tamamlandı)
3. ✅ **Sipariş Son Tarihi** — orderDeadline hesabı + alert + purchase sıralama (tamamlandı)
4. ⛔ **Tedarikçi Performansı — KAPALI, yapılmayacak (kullanıcı kararı 2026-09-16).** Veri hazır (`purchase_commitments.expected_date` vs `received_at`, mal kabul RPC'si yazar; `vendors` tablosu var) — istenirse migration'sız, saf yardımcı + `GET /api/vendors/[id]/detail` ile yapılabilir; şimdilik ürün kapsamı dışı.

**Detay:** `/Users/mirzasaribiyik/Projects/erp2/yuksek-etki.md` (gitignore'da, push edilmez)

**Why:** Odoo araştırmasından çıkan, mevcut sistemde eksik olan ve PMT için yüksek operasyonel değer taşıyan stok özellikleri.
**How to apply:** Her özellik için ayrı onay alınacak. Özellik 3 ve 4 birbirini besliyor — 4'teki tedarikçi lead_time, 3'teki deadline hesabını güçlendirir.

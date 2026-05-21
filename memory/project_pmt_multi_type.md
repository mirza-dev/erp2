---
name: PMT Multi-Product-Type Firma
description: PMT vana/conta/flans/fitting/bağlantı/enstrüman/sızdırmazlık + diğer tipler karışık tutan firma; sistem tasarımında tek-tip assumption YAPMA
type: project
originSessionId: f333769d-d857-4ff0-817c-ad65f28d62d5
---
PMT Endüstriyel **multi-product-type** firmadır. Katalogda, siparişte, teklifte,
import'ta **her ürün tipi karışık** bulunabilir:

- vana, conta, flans, fitting, bağlantı elemanı, enstrüman, sızdırmazlık
  malzemesi, diğer (8 hazır tip — `product_types` tablosu)
- Kullanıcı admin paneli üzerinden yeni tipler ekleyebilir

**Why:** Faz 3b 2.tur'da (commit `8a95a31`) AI extraction "tek tip katalog
varsayımı" ile ship edildi — kullanıcı net düzeltti: "pmt tek tip ürün
katoloğu olan bir firma değil çeşitli ürünler var ve her tip ürün de
girebilir sistemin bunlara hazır olması gerek". 3.tur'da multi-type
extraction'a refactor edildi.

**How to apply:**

- **Import / AI extraction:** Tüm aktif `product_types` + her tipin fields'ı
  AI context'inde olmalı. AI item başına `product_type_id` seçer; route
  AI'nın seçimini satıra persist eder. Tek tip filter opsiyoneldir.
- **Sipariş, teklif, kombinasyon listesi:** Aynı sipariş/teklif farklı tipte
  ürünleri içerebilir (vana + conta + bağlantı elemanı aynı PO'da).
- **Stok, alert, purchase suggestion:** Tip bazlı segmentasyon değil, ürün
  bazlı çalışmalı (mevcut davranış doğru).
- **UI tasarım:** "Tek tip seçici" default yerine "AI otomatik / tip filter
  opsiyonel" paterni tercih et. Tip override her zaman satır bazında
  mümkün olsun.

Yeni tasarımlarda "tek-tip per operation" assumption riski varsa, plan
yazarken bu memory'i hatırla ve multi-type'a hazır tasarla.

# Vendors Modülü — Derin Denetim Bulguları

**Tarih:** 2026-06-19
**Kapsam:** Tedarikçi — `/api/vendors` (+ `[id]` GET/PATCH/DELETE), `/api/product-vendor-links`,
`src/lib/supabase/vendors.ts` + `product-vendor-links.ts`, `VendorsClient` liste sayfası.
**Yöntem:** REVIEW.md + domain-rules §13 (auditability) ile, kaynak koda karşı doğrulanarak.
**Not:** Backlog'da denetlenmemiş **son modül**; bununla tüm modül denetim kampanyası kapandı.

## Özet

**K:0 Y:0 O:0 — tek bulgu D1 (Düşük), düzeltildi.** Modül çok olgun.

## Doğrulanan sağlamlık (bulgu DEĞİL)

- **Tüm route'lar guard'lı:** GET `view_vendors`; POST/PATCH `manage_vendors`; DELETE
  `delete_vendors`; product-vendor-links GET `requirePermissionFor(["view_products","view_vendors"])`.
  product-vendor-links'te yazma route'u **YOK** (upsert yalnız import/RFQ servis yolundan —
  `dbUpsertProductVendorLink` actor yazar).
- **DELETE = soft-delete + FK koruması:** `dbDeactivateVendor` aktif PO guard'ı
  (`draft/sent/confirmed/partially_received` → 409 "aktif PO'su var"); `is_active=false` (hard
  delete değil); **actor yazılır** (RBAC F6, server-authoritative `getCurrentUserId()`).
- **Validasyon:** `validateVendorInput` — ad zorunlu, e-posta/vergi-no format, currency whitelist
  (TRY/USD/EUR), lead_time/payment_terms non-negatif tam sayı. Create+update ortak.
- **Redaction:** `redactVendorLinksForPerms` — `last_unit_price` `view_purchase_costs` yoksa null.
- **RLS:** `product_vendor_links` RLS açık (mig 084:65) — REVIEW.md "RLS-missing" gap'i değil.
- **Server-authoritative actor:** DELETE route `getCurrentUserId()` kullanıyor (purchase O1'in
  tersine — vendors zaten doğruydu).

## Bulgu

### D1 — vendor create/update audit kayıtları `actor` taşımıyor (attribution eksik) (DÜZELTİLDİ)

- **Kanıt (düzeltme öncesi):** `src/lib/supabase/vendors.ts`
  - `dbCreateVendor` → `audit_log` insert `action:'vendor_created'`, **`actor` alanı YOK** (→ null).
  - `dbUpdateVendor` → `audit_log` insert `action:'vendor_updated'`, **`actor` alanı YOK** (→ null).
  - Karşıt: aynı dosyadaki `dbDeactivateVendor` **actor yazar** (RBAC F6); `dbUpsertProductVendorLink`
    **actor yazar**. create/update bu modülün outlier'ıydı.
- **Etki:** Tedarikçi oluşturma/güncelleme audit satırları "kim yaptı" bilgisi taşımıyordu
  (actor=null). domain-rules §13.2 actor'ı minimum audit bilgisi sayar. **Güvenlik açığı DEĞİL**
  (route'lar `manage_vendors`-gated); audit **bütünlüğü/tamlığı** eksiği → Düşük.
- **Düzeltme:** `dbCreateVendor(input, actor=null)` + `dbUpdateVendor(id, patch, actor=null)`
  opsiyonel parametre (deactivate emsali) + audit insert'e `actor` alanı. Route POST/PATCH
  `await getCurrentUserId()` geçirir; import-service vendor create/update `actorUserId` geçirir.
  Default null → geriye dönük uyumlu.
- **Test:** vendors.test.ts route POST/PATCH success testlerine "actor sunucudan helper'a geçer"
  (`getCurrentUserId` mock = "u-test") assertion'ı; import-confirm.test.ts'in 4 vendor
  create/update assertion'ına trailing `null` actor argümanı eklendi.
- **Efor:** 2 helper imza + 2 route + 2 import call + 6 test assertion; migration YOK.

## Doğrulama

- tsc 0 · lint 0 · vitest **5585** (+2) · build 0.
- Davranış: tedarikçi oluştur/güncelle → `audit_log.actor` = oturum kullanıcısı (import'ta
  actorUserId). Validasyon/soft-delete/redaction değişmedi.

## Kapanış

- Migration YOK → kullanıcı-tarafı APPLY yok.
- **vendors = backlog'daki son denetlenmemiş modül.** Tüm modüller (RFQ, orders, quotes, paraşüt,
  import/AI, production, customers/products, alerts, settings, inventory, purchase, vendors) derin
  tarandı → **erp2-reviewer modül denetim kampanyası TAMAMLANDI.**

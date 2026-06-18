# Customers/Products Modülü Derin Denetim — Bulgular

**Tarih:** 2026-06-19
**Kapsam:** Müşteri + Ürün modülleri — customers 2 route (`route`, `[id]`) + `supabase/customers.ts`; products 10 route (`route`, `[id]`, `counts`, `aging`, `[id]/quotes`, `[id]/shortages`, `[id]/supplier-prices`, `[id]/attachments` + `[attachmentId]` + `/url`) + `supabase/products.ts`/`product-attachments.ts` + `auth/redact.ts` + sayfalar.
**Yöntem:** REVIEW.md kurallarıyla read-only inceleme (erp2-reviewer checklist + manuel kanıtlama). Modül olgun (A1 server-side pagination, RBAC R3 redaction, denetim O11 attachments). Bu tur method-seviye guard kör noktalarını + redaction-PII sınırını hedefler.
**Özet:** **K:0 · Y:0 · O:1 · D:1 · Nit:1.** O1 (cross-role PII) + D1 (teklif pipeline) + Nit (cache parite) düzeltildi; kullanıcı kapsam kararı: O1 + D1 + Nit.

---

## O1 (Orta) — `GET /api/customers` `view_customers` guard'sız → cross-role müşteri PII sızıntısı

**Kanıt:** `customers/route.ts:15` GET hiçbir RBAC guard'ı içermiyordu; yalnız `redactCustomersForPerms` uyguluyordu. Ama bu redaction **yalnız `total_revenue`'yu** null'lar (`redact.ts:48`) — finansal alan. Müşteri **PII** (`name`/`email`/`phone`/`address`/`tax_number`/`tax_office`) redakte EDİLMEZ; PII koruması guard'a bırakılmış ama guard yoktu.

**Etki:** `view_customers` holder'ları = admin/sales/purchasing/accounting/viewer; **production'da YOK** (`permissions.ts:93-100`). `page-access.ts:42` `/dashboard/customers`'ı `view_customers`'a kapatır → production sayfayı açamaz ama **`GET /api/customers`'tan tüm müşteri PII'sini doğrudan okuyabiliyordu** (proxy yalnız session-or-demo kontrol eder, RBAC'i route'a bırakır). KVKK/GDPR-ilgili PII, modelin sayfa-seviyesinde açıkça esirgediği role + proxy-fail-open/anon'a açıktı.

**Tüketici-güvenliği:** `useCustomers` yalnız QuoteForm (manage_quotes), OrderForm (manage_sales_orders), CustomerDetailPanel + CustomersClient (view_customers sayfası) içinde — hepsi production'ın olmayan izinleri gerektirir; dashboard'dan customers ELENMİŞ (`dashboard/page.tsx:41`). Demo=viewer floor (`view_customers` taşır). Yani guard **yalnız production'ı + anon'u kapatır**, hiçbir erişilebilir UI'ı kırmaz.

**Düzeltme:** GET imzasına `req` + gövde başına `requirePermission(req, "view_customers")` (`requirePermission` zaten import'lu — POST kullanıyor). Redaction KORUNUR (guard önce, sonra cache+redact). *Not: products GET'ten FARKLI — products dashboard-tier (accounting StockPanel ister → guard edilemez), customers dashboard'dan elenmiş → güvenle guard edilir.*

---

## D1 (Düşük) — `GET /api/products/[id]/quotes` hiç guard'sız → teklif pipeline + satışçı e-postası sızıntısı

**Kanıt:** `[id]/quotes/route.ts:11` GET hiçbir permission guard'ı içermiyordu (yalnız sales-price redaction). Kardeş alt-route'lar guard'lı: `shortages` → `requirePermissionFor(view_products)`, `supplier-prices` → `requirePermissionFor(view_products)`. Bu route atlanmıştı (method/route-seviye kör nokta).

**Etki:** Aktif teklif kırılımı (müşteri adı + miktar + `createdByEmail` **satışçı e-postası**) döner; redaction yalnız `unitPrice`/`lineTotal`'ı `view_sales_prices`'a göre maskeler. Müşteri/miktar/satışçı-e-postası `view_products`'sız **accounting** + proxy-fail-open/anon'a açıktı. (Ürün detay "Tekliflerde" widget'ı `products/[id]/page.tsx:447`, `.catch→null` fail-soft, view_products-gated sayfada — production'ın view_products ile görmesi tasarımsal.)

**Düzeltme:** GET başına `resolveAuthContext` + `requirePermissionFor(view_products)` (kardeş kalıp birebir; `getCurrentUserPermissions` → tek `ctx.perms`, ekstra auth çağrısı yok). Sales-price redaction korunur. Gate `route-guard-baseline`'dan redaction kaydı düşürüldü (artık guard'lı).

---

## Nit (kapsamda) — `PATCH /api/customers/[id]` `revalidateTag("customers")` çağırmıyordu

POST + DELETE `customers` tag'ini tazeliyordu ama PATCH tazelemiyordu (`unstable_cache(... revalidate:30)`) → müşteri düzenlemesi ≤30s bayat görünüyordu. **Düzeltme:** `dbUpdateCustomer` sonrası `revalidateTag("customers", "max")` (POST/DELETE birebir).

---

## By-design (BULGU DEĞİL — gerekçeli)

- **`GET /api/products`, `/[id]`, `/aging`, `/counts`:** guard'sız ama **dashboard/view-tier**: ana dashboard tüm rollerde (accounting dahil — accounting `view_products`'ı YOK ama StockPanel ister) `useProducts` çağırır → `view_products` guard dashboard'ı accounting'de kırardı. Finansal alanlar `redactProductsForPerms` (price←view_sales_prices, cost_price←view_purchase_costs) ile per-request korunur; `counts` gate baseline public. (customers'tan asimetri kasıtlı — yukarıda.)
- **attachments GET + `/url` (signed-URL) GET:** proxy-only (denetim O11 default-flip: demo-anon `ATTACHMENTS_ALLOW_DEMO_ANON` dışında 401). Ürün collateral (datasheet/görsel), finansal değil; yazma (POST/PATCH/DELETE) `requireRoleFor(admin,purchaser)`.

## Temiz doğrulananlar (bulgu YOK)

- **Redaction katmanı (`redact.ts`):** kapsamlı + snake/camelCase ayrımı doğru (cache DIŞI per-request, `perms` cache key'e GİRMEZ → ilk-çağıran sızıntısı yok); products/orders/quotes/PO/vendor-links/price-history/RFQ finansal alanları null'lar.
- **Yazma yolları:** products POST/PATCH/DELETE → `manage_product_master`; customers POST/PATCH → `manage_customers`, DELETE → `delete_customers` (+ sipariş-var-ise 409 referans guard); attachments yazma → admin/purchaser.
- **supplier-prices:** `view_products` guard + `redactPriceHistoryForPerms` (unit_price←view_purchase_costs). **shortages:** `view_products` guard.
- **attachments:** UUID regex + `product_id` eşleşme kontrolü (cross-product erişim engeli) + `kind` whitelist (fail-open kapatılmış, P3-003) + signed-URL TTL 3600.
- **PATCH customers:** `PATCHABLE` whitelist + `validateStringLengths` (nested recursive) + country ISO-2 + name-boş guard.

---

## Düzeltme özeti
- Dosyalar: `customers/route.ts` (GET +view_customers), `customers/[id]/route.ts` (PATCH +revalidateTag), `products/[id]/quotes/route.ts` (GET +view_products).
- Gate: `route-guard-baseline.ts` (products/[id]/quotes redaction kaydı düşürüldü).
- Test: YENİ `customers-products-read-guards.test.ts` (+6: customers GET production→403/viewer→200 + perm-fact; quotes GET accounting→403/viewer→200 + perm-fact); `products-quotes-route.test.ts` + `aging-quotes-redaction.test.ts` auth mock'ları `resolveAuthContext`+`requirePermissionFor`'a güncellendi.
- **Migration YOK.** tsc 0 · lint 0 · **5551 test** · build 0.

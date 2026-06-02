---
name: reference_live_demo_redaction
description: "Canlı/demo'da fiyatların null gelmesi RBAC redaction'ı — bug DEĞİL; proxy.ts auth gate"
metadata: 
  node_type: memory
  type: reference
  originSessionId: fc51297d-dd2d-461f-a5f5-31e2c119a1ac
---

Canlı sistem `https://erp.getmedspace.com` üzerinde demo (`demo_mode=1` cookie, oturumsuz) gezildiğinde **tüm finansal alanlar null gelir** (`products.price`/`cost_price`, `orders.grand_total`/`subtotal`/`vat_total`, `order_lines.unit_price`/`line_total`, `quotes.grandTotal`/`subtotal`, `quote_lines.unitPrice`/`lineTotal`). **Bu bir bug DEĞİL — tasarım gereği:** demo = `viewer` rolü muamelesi (`proxy.ts:193 permissionsForRoles(["viewer"])`), viewer'da `view_sales_prices`/`view_purchase_costs` yok → `src/lib/auth/redact.ts` route katmanında null'lar (mapper'a dokunmadan, cache dışında, per-request). Gerçek (oturumlu sales/accounting) kullanıcıda fiyatlar görünür. Bir daha "fiyatlar null" diye bulgu açma.

Demo'da `/api/purchase-orders` ve `/api/recommendations` → 403 ("Yetkiniz yok.") da normal: viewer'da `view_purchase_orders`/`view_purchase_suggestions` yok.

**Auth gate dosyası `src/middleware.ts` DEĞİL `src/proxy.ts`** (Next 16 convention — `middleware.ts` + `runtime=nodejs` production'da invoke edilmiyordu, P0; `proxy.ts` rename çözdü, `middleware` alias geriye-uyum için export edilir). Sıra: health bypass → CRON_SECRET Bearer → rate-limit (IP, auth/demo-cookie hibrit policy) → ALWAYS_PUBLIC → CRON 401 → Supabase session → demo/anon dallanması → RBAC `pageGateRedirect`. Yetki kaynağı YALNIZ `app_metadata` (user_metadata asla). Roller: admin/sales/purchasing/production/accounting/viewer ([[project_rbac]]).

Not: bulduğum Vercel preview deploy (`aa0d9de`) prod DEĞİL — prod Coolify+Hetzner'da (`erp.getmedspace.com`), Vercel kullanılmıyor ([[project_stack]]).

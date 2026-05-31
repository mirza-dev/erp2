# ERP2 Role-Based Access Implement Plan

Date: 2026-05-30
Owner intent: Claude Code will implement in `/Users/mirzasaribiyik/Projects/erp2`.
Advisor workspace: `/Users/mirzasaribiyik/erp2 test document`.

## Non-Negotiable Context

- Codex/advisor must not edit `/Users/mirzasaribiyik/Projects/erp2`; this plan is the handoff document.
- ERP2 currently has a narrow role helper at `src/lib/auth/role-guard.ts`.
- Current secure role source is `user.app_metadata.role`; do not use `user_metadata.role` for authorization.
- New system must support multi-role users through `user.app_metadata.roles`.
- UI filtering is not security. API/page/server permission checks and API response redaction are mandatory.
- Demo mode remains a separate read-only layer and must not be broken.

## User Decisions

### Role Set

Use these roles:

- `admin`
- `sales`
- `purchasing`
- `production`
- `accounting`
- `viewer`

No `manager` role. The owner/patron is `admin`.

### Multi-Role Model

- A user can have multiple roles.
- Main metadata source: `app_metadata.roles: Role[]`.
- Backward compatibility: if old `app_metadata.role` exists, treat it as one role.
- If neither `roles` nor `role` exists, fallback must be `viewer`, not `purchaser`.
- If `admin` is present, all permissions are granted.
- Non-admin roles combine by union.

### Bootstrap Admin

- `app_metadata.roles` is the real source of truth.
- `ADMIN_EMAILS` remains only as bootstrap / emergency fallback.
- If user has `roles: ["admin"]`, they are admin.
- If metadata is absent but email is in `ADMIN_EMAILS`, treat as bootstrap admin.
- Admin UI must prevent lockout:
  - admin cannot accidentally remove the last admin
  - admin cannot remove their own last admin capability if that would leave no admin

### Delete Policy

- Each domain role can hard-delete records in its own domain.
- `viewer` cannot delete.
- `admin` can delete everything.
- Delete is real hard delete.
- Delete does not generate reverse stock, reverse accounting, or reverse domain operations.
- Delete is intended for records that are truly unnecessary/wrong/space-taking and consciously removed by the user.
- No automatic cascade deletes.
- If related records exist, API should return `409 Conflict`.
- Every hard delete must write an audit log with actor, entity, timestamp, and best-effort before snapshot.

## Role Meanings

### admin

- Full access.
- User, role, settings, product type schema, all operational data, all financial data.

### sales

Can:

- Manage customers/cariler in sales context.
- Manage quotes.
- Manage sales orders.
- View products and stock.
- Adjust stock for products involved in sales/quote context, without person-level ownership restriction.
- View and edit sales prices and sales totals.

Cannot:

- Ship sales orders / perform fulfillment shipment.
- Manage purchasing, vendors, PO, or product sourcing.
- Create or edit product master records.
- View purchase cost, margin/profit, total company financial assets, accounting summaries.
- Manage Parasut/accounting sync.

### purchasing

Can:

- Manage vendors.
- Create/edit product master records.
- Manage product technical/master info.
- Manage product attachments/certificates.
- Manage purchase suggestions.
- Create/send/confirm/revise/cancel/delete purchase orders.
- Receive goods / increase stock through purchasing flow.
- View cariler.
- View and edit purchase prices, vendor prices, PO totals, receiving cost information.

Cannot:

- Modify sales quotes/orders.
- Ship sales orders.
- Manage Parasut/accounting sync.
- View sales revenue/profit/margin/company-wide financial summary unless also accounting/admin.

### production

Can:

- Create/edit production entries.
- Perform manual stock movements: in, out, adjustment.
- View stock/products.
- View and act on stock/production alerts.
- View sales orders for fulfillment context.
- Ship/fulfill sales orders.
- Hard-delete production/stock-domain records where no related records block deletion.

Cannot:

- Create/edit product master records.
- Manage vendors/PO.
- Manage quote/customer sales process.
- Manage Parasut/accounting sync.
- View sales prices, purchase costs, margins, profit, financial summaries.

### accounting

Can:

- View sales and purchasing documents.
- View customers/cariler and vendors where needed for accounting.
- Manage Parasut sync/retry/OAuth/config flows.
- View invoices/payments/accounting records.
- View sales prices, purchase costs, totals, financial summaries.

Cannot:

- Modify operational sales quote/order content.
- Modify purchasing operational content.
- Perform production/stock movement.
- Ship orders.

### viewer

Can:

- Broad read-only access to operational pages.
- See non-sensitive operational information.

Cannot:

- Any mutation.
- View sensitive financial fields.
- Access system/user/admin settings.

## Sensitive Data Model

Split financial access by data class.

### Sales Financial Fields

Examples:

- quote unit price
- quote line total
- quote subtotal/vat/grand total
- sales order price/totals
- sales-facing PDF/preview totals

Allowed:

- `admin`
- `accounting`
- `sales`

Denied:

- `purchasing` unless also another allowed role
- `production`
- `viewer`

### Purchase Financial Fields

Examples:

- product cost price
- vendor price
- purchase order unit price
- purchase order line total
- purchase order subtotal/vat/grand total
- receiving cost information

Allowed:

- `admin`
- `accounting`
- `purchasing`

Denied:

- `sales` unless also another allowed role
- `production`
- `viewer`

### High Sensitivity Financial Fields

Examples:

- profit
- margin
- total company financial assets
- revenue summary
- accounting summary
- invoice/payment/Parasut sensitive details
- dashboard financial totals
- cari balance / receivable / payable if present

Allowed:

- `admin`
- `accounting`

Denied:

- `sales`
- `purchasing`
- `production`
- `viewer`

## Server/API Redaction Rule

Do not only hide sensitive fields in React.

API responses must redact sensitive fields based on current permissions:

- Prefer returning `null` for redacted fields, not deleting keys.
- UI should render `null` as `--` or `Yetki gerekli`.
- Where safe without breaking existing contracts, include response permissions metadata:

```json
{
  "items": [],
  "permissions": {
    "canViewSalesPrices": true,
    "canViewPurchaseCosts": false,
    "canViewFinancialSummary": false
  }
}
```

Compatibility note:

- Existing endpoints that currently return arrays may be risky to change to `{ items, permissions }` in one broad sweep.
- In those cases, first redact fields to `null`, then add endpoint-specific metadata only where UI change is deliberately included.

## Page Access Matrix

Initial matrix is accepted "for now"; keep it easy to adjust.

| Page | Allowed Roles |
| --- | --- |
| `/dashboard` | all roles |
| `/dashboard/quotes` and quote detail/new/preview | `admin`, `sales`, `accounting`, `viewer` |
| `/dashboard/orders` and order detail/new | `admin`, `sales`, `production`, `accounting`, `viewer` |
| `/dashboard/products` and product detail/aging | `admin`, `sales`, `purchasing`, `production`, `viewer` |
| `/dashboard/purchase/suggested` | `admin`, `purchasing` |
| `/dashboard/purchase/orders` and PO detail/new | `admin`, `purchasing`, `accounting` |
| `/dashboard/vendors` | `admin`, `purchasing`, `accounting` |
| `/dashboard/production` | `admin`, `production` |
| `/dashboard/import` | `admin`, `purchasing` |
| `/dashboard/alerts` | `admin`, `sales`, `purchasing`, `production`, `viewer` |
| `/dashboard/parasut` | `admin`, `accounting` |
| `/dashboard/customers` | `admin`, `sales`, `purchasing`, `accounting`, `viewer` |
| `/dashboard/settings` | `admin` |
| `/dashboard/settings/product-types` | `admin`, `purchasing` |
| `/dashboard/settings/users` | `admin` |

UX:

- Sidebar should hide pages the user cannot access.
- If user manually enters a forbidden URL, show a dashboard-level "Yetkiniz yok" screen.
- API must return `403`.
- Sensitive fields render as masked values, not as broken UI.

## Permission Names

Implement role logic through permissions, not scattered role checks.

Recommended permission IDs:

- `view_dashboard`
- `view_quotes`
- `manage_quotes`
- `delete_quotes`
- `view_customers`
- `manage_customers`
- `delete_customers`
- `view_sales_orders`
- `manage_sales_orders`
- `ship_sales_orders`
- `delete_sales_orders`
- `view_products`
- `manage_product_master`
- `manage_product_attachments`
- `stock_adjust_sales_context`
- `stock_adjust_general`
- `view_purchase_suggestions`
- `manage_purchase_suggestions`
- `view_purchase_orders`
- `manage_purchase_orders`
- `receive_purchase_orders`
- `delete_purchase_orders`
- `view_vendors`
- `manage_vendors`
- `delete_vendors`
- `view_production`
- `manage_production`
- `delete_production`
- `view_alerts`
- `manage_alerts`
- `view_import`
- `manage_import`
- `view_parasut`
- `manage_parasut`
- `view_settings`
- `manage_settings`
- `view_product_types`
- `manage_product_types`
- `view_users`
- `manage_users`
- `view_sales_prices`
- `view_purchase_costs`
- `view_financial_summary`

Recommended role-to-permission defaults:

- `admin`: all permissions
- `sales`:
  - view/manage quotes
  - view/manage customers
  - view/manage sales orders
  - delete sales-domain records
  - view products
  - `stock_adjust_sales_context`
  - view sales prices
  - view alerts
- `purchasing`:
  - view/manage vendors
  - view/manage product master
  - manage product attachments
  - view/manage purchase suggestions
  - view/manage/receive/delete purchase orders
  - view customers/cariler
  - view products
  - view purchase costs
  - view alerts
  - manage import
  - view/manage product types if product schema editing is in scope
- `production`:
  - view products
  - general stock adjustment
  - view/manage production
  - delete production/stock-domain records
  - view sales orders
  - ship sales orders
  - view/manage alerts
- `accounting`:
  - view quotes
  - view sales orders
  - view purchase orders
  - view customers/cariler
  - view vendors
  - view/manage Parasut
  - view sales prices
  - view purchase costs
  - view financial summary
- `viewer`:
  - read-only page permissions from matrix
  - no mutation permissions
  - no sensitive financial permissions

## Implementation Phases

### Phase 1 — Foundation: Roles and Permissions

Files likely involved:

- `src/lib/auth/role-guard.ts`
- new `src/lib/auth/permissions.ts` or similar
- tests around role parsing and permission resolution

Tasks:

1. Define `Role` union:
   - `admin | sales | purchasing | production | accounting | viewer`
2. Define `Permission` union.
3. Implement metadata parser:
   - read `app_metadata.roles`
   - fallback to `app_metadata.role`
   - bootstrap fallback via `ADMIN_EMAILS`
   - no metadata -> `viewer`
4. Add helpers:
   - `getCurrentUserRoles(req?): Promise<Role[]>`
   - `getCurrentUserPermissions(req?): Promise<Set<Permission>>`
   - `hasRole(roles, role)`
   - `hasPermission(permissions, permission)`
   - `requirePermission(req, permissions | permission)`
   - `requireAnyRole(req, roles)` only where role-specific wording is useful
5. Keep `requireRole` temporarily as compatibility wrapper or migrate call sites carefully.
6. Add tests:
   - `roles` array wins
   - old single `role` works
   - no role -> viewer
   - `user_metadata.role=admin` is ignored
   - `ADMIN_EMAILS` bootstrap grants admin only when metadata absent/appropriate
   - admin grants all permissions
   - multi-role union works

Acceptance:

- No authorization code reads `user_metadata.role`.
- No-role users no longer become purchaser.

### Phase 2 — Server-Side Page Access and Sidebar

Files likely involved:

- `src/app/dashboard/layout.tsx`
- `src/components/layout/Sidebar.tsx`
- possible new server/client bridge for current auth permissions
- possible `/api/auth/me` endpoint or server injected props

Tasks:

1. Create central route/page access map.
2. Sidebar filters items by page permission.
3. Dashboard routes show forbidden screen when URL is manually entered.
4. Avoid duplicating matrix inside Sidebar and page guard.
5. Keep demo mode behavior intact.

Implementation caution:

- Current `dashboard/layout.tsx` is client component.
- If server-side page guard is hard inside layout, may require splitting into server wrapper + client shell.
- If that refactor is too large, implement a first pass with:
  - API/page guard in route handlers and page-level fetches
  - client forbidden fallback
  - then tighten server-side in a second patch

Acceptance:

- Forbidden menu items are absent from sidebar.
- Direct URL entry renders "Yetkiniz yok".
- API still protects data even if URL/page is reached.

### Phase 3 — API Action Guards

Files likely involved:

- `src/app/api/**/route.ts`
- old admin helpers in:
  - `src/app/api/admin/users/route.ts`
  - `src/app/api/admin/users/[id]/route.ts`
  - `src/app/api/parasut/oauth/start/route.ts`
  - `src/app/api/parasut/oauth/refresh/route.ts`

Tasks:

1. Replace scattered role checks with permission checks.
2. Align existing `requireRole(["admin"])` routes with new permissions:
   - product type mutation -> `manage_product_types`
   - product attachment mutation -> probably `manage_product_attachments`
   - import classify/extract/apply -> `manage_import`
   - email test -> `manage_settings` or `manage_parasut` depending intended use
   - PO receive/cancel/etc -> PO permissions
3. Replace `ADMIN_EMAILS`-only admin endpoint checks with unified admin permission, retaining bootstrap fallback.
4. Add delete permission checks per domain.
5. Ensure `viewer` gets `403` for all mutations.
6. Preserve demo mode middleware behavior.

Acceptance:

- Every mutating endpoint has an explicit permission guard.
- Tests cover at least one allowed and one denied role per high-risk route group.

### Phase 4 — Sensitive Data Redaction

Files likely involved:

- `src/lib/api-mappers.ts`
- `src/lib/supabase/*.ts`
- API routes returning products, quotes, sales orders, purchase orders, vendors/customers, dashboard stats, Parasut stats/logs
- `src/lib/data-context.tsx`

Tasks:

1. Add redaction helpers:
   - `redactProductForPermissions`
   - `redactQuoteForPermissions`
   - `redactSalesOrderForPermissions`
   - `redactPurchaseOrderForPermissions`
   - `redactDashboardStatsForPermissions`
2. Redact to `null`.
3. Do not rely only on component masking.
4. Identify field classes:
   - sales financial
   - purchase financial
   - high-sensitivity financial
5. Add endpoint tests:
   - production/viewer cannot see sales price or purchase cost
   - sales can see sales totals but not cost/margin
   - purchasing can see purchase costs but not sales financial summary
   - accounting can see all financial fields but cannot mutate operational records
6. Ensure PDFs/preview/export do not leak financial values for unauthorized users.

Acceptance:

- Network response for unauthorized role contains `null` for sensitive fields.
- UI displays masked value consistently.

### Phase 5 — User Management UI and Role Assignment

Files likely involved:

- `src/app/dashboard/settings/users/page.tsx`
- `src/app/api/admin/users/route.ts`
- `src/app/api/admin/users/[id]/route.ts`
- possibly new PATCH endpoint for roles

Tasks:

1. User list includes roles.
2. Create user form can assign multiple roles.
3. Edit user roles with checkboxes.
4. Store roles through Supabase Admin API in `app_metadata.roles`.
5. Backfill/migrate UI display for old `app_metadata.role`.
6. Prevent last admin lockout.
7. Prevent viewer from being combined in a confusing way, or define semantics:
   - recommendation: if any operational role exists, `viewer` is redundant and can be omitted automatically.

Acceptance:

- Admin can assign `sales + purchasing` to same user.
- Newly created no-role user is not silently privileged.
- Last admin protection tested.

### Phase 6 — Delete Policy Implementation

Tasks:

1. Map delete permissions per domain.
2. Make delete endpoints check relationship blockers and return `409` if related records exist.
3. No automatic cascade.
4. No reverse stock/accounting operation.
5. Audit log before delete with snapshot.
6. Tests:
   - allowed domain role can delete independent record
   - unrelated role gets 403
   - related record gets 409
   - audit snapshot is written

Risk note:

- Hard delete in all statuses is intentionally user-approved, but it is still high-risk. Tests and audit are mandatory.

### Phase 7 — Dashboard and UI Masking

Tasks:

1. Dashboard cards filter by permission:
   - all roles: operational non-sensitive cards
   - `admin/accounting`: financial summary cards
   - `sales`: sales pipeline cards with sales prices/totals
   - `purchasing`: purchase suggestion/PO cards
   - `production`: production/stock alert cards
2. Components render `null` financials as `--` / `Yetki gerekli`.
3. Buttons/actions hide or disable according to permission.
4. Sidebar already filtered; keep it synced with central page map.

Acceptance:

- No broken `NaN`, `undefined`, or blank financial layout when fields are redacted.
- Unauthorized user sees clean UI, not stack traces.

### Phase 8 — Regression and Smoke

Run targeted tests first, then broader suite.

Recommended test groups:

- role parser / permission helper tests
- sidebar/page access tests
- API mutation guard tests
- API redaction tests
- user role assignment tests
- delete policy tests
- demo mode middleware tests

Build checks:

- `npm run test -- <targeted role/access test files>`
- `npm run test`
- `npx tsc --noEmit`
- `npm run build` when implementation changes app routing/layout/server-client boundary

Note:

- If lint has known baseline failures, report exact count and distinguish baseline from new errors.

## High-Risk Review Points for Claude

Claude should double-check these before marking done:

1. No role logic reads `user_metadata.role`.
2. No-role fallback is `viewer`.
3. Multi-role union works.
4. `admin` grants all permissions.
5. Sidebar filtering is not the only guard.
6. Manual URL access is forbidden.
7. API mutations return `403`.
8. Sensitive fields are redacted in JSON responses.
9. `sales` cannot see purchase cost or margin.
10. `purchasing` cannot see sales financial summaries.
11. `production` cannot see sales/purchase financials.
12. `viewer` has no mutation and no sensitive financial values.
13. `accounting` can view financial data and manage Parasut, but cannot mutate operations.
14. Delete does not cascade automatically.
15. Delete with related records returns `409`.
16. Delete writes audit snapshot.
17. Demo mode still behaves read-only.
18. Existing uncommitted work in `/Users/mirzasaribiyik/Projects/erp2` must not be reverted.

## Suggested Claude Prompt

Use this text to start implementation:

> ERP2 icin rol bazli sayfa, aksiyon ve hassas veri erisim sistemini fazli sekilde uygula. Bu plani kaynak kabul et: `/Users/mirzasaribiyik/erp2 test document/role-based-access-plan.md`.
>
> Onemli kararlar: roller `admin`, `sales`, `purchasing`, `production`, `accounting`, `viewer`; kullanici coklu role sahip olabilir; ana kaynak `app_metadata.roles`, eski `app_metadata.role` geriye uyumlu okunur; metadata yoksa fallback `viewer`; `user_metadata.role` asla auth icin kullanilmaz; `ADMIN_EMAILS` sadece bootstrap fallback.
>
> UI saklama guvenlik degildir. Her mutasyon endpoint'i server-side permission guard kullanmali. Hassas finansal alanlar API response seviyesinde role gore `null` redakte edilmeli; frontend sadece ikinci katman maskeleme yapmali.
>
> Once Foundation fazini uygula: role parser, permission helper, fallback viewer, bootstrap admin, multi-role union, tests. Sonra API/page/sidebar/redaction fazlarina gec. Mevcut uncommitted degisiklikleri revert etme.

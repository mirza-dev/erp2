# Review Instructions

## What "Important" means here

Reserve 🔴 Important for findings that would break production behavior or compromise data integrity:
- Incorrect business logic: order/stock state transitions, stock reservation/release, KDV calculation
- Security: RLS bypass, auth middleware holes, PII in logs, credentials in code
- Data loss: missing DB transactions for multi-step writes, cascade delete risks
- API contract violations: DB→frontend mapper (`api-mappers.ts`) returning wrong shape
- Missing `"use client"` on interactive components (causes silent hydration errors)

Style preferences, naming conventions, and refactoring suggestions are Nit at most.

## Cap the nits

Report at most 5 Nits per review. If you found more, mention the count in the summary instead of posting them inline. If all findings are Nits, lead the summary with "No blocking issues."

## Do not report

- ESLint/TypeScript errors — CI already catches these
- Files under `.next/`, `node_modules/`, `supabase/migrations/` (already applied)
- `*.lock` files, `package-lock.json`
- Test fixture data in `src/__tests__/` and `tests/`
- Anything in `scripts/` unless it writes to the DB

## Always flag (as Important)

- **Tailwind class usage**: any `className` containing Tailwind utility classes (e.g., `text-white`, `p-4`, `flex`, `grid`). This project uses inline styles + CSS variables only. Example violation: `<div className="text-white p-4">` instead of `<div style={{ color: "var(--text-primary)", padding: "16px" }}>`
- **Framer Motion imports**: `import { ... } from "framer-motion"` is prohibited in this project
- **Hardcoded color values**: hex/rgb colors in style props instead of CSS variables (`var(--accent)`, `var(--danger)`, etc.)
- **RLS-missing tables**: any new Supabase table in migrations that lacks a corresponding RLS policy (known gap: `purchase_commitments`, `column_mappings`)

## Domain-specific checks

- **Stock mutations**: any code that changes `reserved_quantity` or `quantity` should use a DB transaction or call the appropriate service function. Flag direct one-off updates.
- **Order status transitions**: the order model has two independent axes (commercial status + fulfillment status). Flag any code that conflates them or transitions directly between incompatible states.
- **KDV (VAT)**: prices are stored ex-VAT. Flag any calculation that applies VAT more than once or stores a VAT-inclusive price where ex-VAT is expected.
- **Demo mode**: `DEMO_MODE=true` disables writes. Flag any new write route that doesn't check `isDemoMode()` before mutating.

## Verification bar

For behavioral claims (e.g., "this function returns the wrong value"), cite the specific `file:line` in the source. Do not post a finding based on naming inference alone.

## Re-review convergence

After the first review, suppress new Nits unless the PR has grown significantly. Report Important findings only on re-reviews triggered by `@claude review`.

/**
 * Customer patch builder.
 * Extracted from data-context.tsx so the component file exports only the context
 * (React Fast Refresh requirement).
 */
import type { Customer } from "@/lib/mock-data";

/**
 * Builds the snake_case PATCH body from a camelCase Customer partial.
 * Only includes fields that are explicitly set (undefined = not included).
 * Export: regression test for taxNumber→tax_number, taxOffice→tax_office mapping.
 */
export function buildCustomerPatch(updates: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (updates.name !== undefined)      body.name = updates.name;
  if (updates.email !== undefined)     body.email = updates.email;
  if (updates.phone !== undefined)     body.phone = updates.phone;
  if (updates.address !== undefined)   body.address = updates.address;
  if (updates.taxNumber !== undefined) body.tax_number = updates.taxNumber;
  if (updates.taxOffice !== undefined) body.tax_office = updates.taxOffice;
  if (updates.country !== undefined)   body.country = updates.country;
  if (updates.currency !== undefined)  body.currency = updates.currency;
  if (updates.notes !== undefined)     body.notes = updates.notes;
  return body;
}

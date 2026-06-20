import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function src(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("ana operasyonlar — işlem sonrası tam route refresh kullanılmaz", () => {
  it("satış siparişleri iptal handler'ları local patch + background mutate kullanır", () => {
    const source = src("src/app/dashboard/orders/OrdersClient.tsx");
    const single = sliceBetween(source, "const handleDelete", "const { selectedIds");
    const bulk = sliceBetween(source, "const handleBulkDelete", "const totalPages");
    expect(single).not.toContain("router.refresh()");
    expect(bulk).not.toContain("router.refresh()");
    expect(source).toContain("applyCancelledOrders(succeededIds)");
    expect(source).toContain("void mutate(PRODUCTS_KEY)");
  });

  it("satış siparişleri bilinmeyen lojistik statüde ekranı düşürmez", () => {
    const source = src("src/app/dashboard/orders/OrdersClient.tsx");
    expect(source).toContain("function getFulfillmentMeta");
    expect(source).toContain("fulfillmentStatusConfig[status] ?? null");
    // DataTable kolon cell'i: fulfillment && order.fulfillment_status !== "unallocated" ? (...)
    expect(source).toContain('fulfillment && order.fulfillment_status !== "unallocated"');
  });

  it("teklif silme handler'ları başarılı id'leri local listeden düşürür", () => {
    const source = src("src/app/dashboard/quotes/QuotesClient.tsx");
    const single = sliceBetween(source, "const handleDelete", "const { selectedIds");
    const bulk = sliceBetween(source, "const handleBulkDelete", "const totalPages");
    expect(single).not.toContain("router.refresh()");
    expect(bulk).not.toContain("router.refresh()");
    expect(source).toContain("applyDeletedQuotes(succeededIds)");
    expect(source).toContain("successfulResponseIds(ids, results)");
  });

  it("cariler ve tedarikçiler route refresh yerine display state kullanır", () => {
    const customers = src("src/app/dashboard/customers/CustomersClient.tsx");
    const vendors = src("src/app/dashboard/vendors/VendorsClient.tsx");
    expect(customers).not.toContain("router.refresh()");
    expect(vendors).not.toContain("router.refresh()");
    expect(customers).toContain("displayCustomers");
    expect(vendors).toContain("displayVendors");
  });

  it("satın alma siparişleri toplu iptal local status patch yapar", () => {
    const source = src("src/app/dashboard/purchase/orders/PurchaseOrdersClient.tsx");
    const bulk = sliceBetween(source, "const handleBulkCancel", "const totalPages");
    expect(bulk).not.toContain("router.refresh()");
    expect(source).toContain("applyCancelledPurchaseOrders(succeededIds)");
    expect(source).toContain("void mutate(PRODUCTS_KEY)");
  });

  it("üretim mutation revalidation'ı kullanıcı akışını bekletmez", () => {
    const source = src("src/lib/data-context.tsx");
    const revalidate = sliceBetween(source, "const revalidateAfterMutation", "const addUretimKaydi");
    expect(revalidate).toContain("void Promise.allSettled");
    expect(revalidate).not.toContain("return refetchFailed");
    const add = sliceBetween(source, "const addUretimKaydi", "const deleteUretimKaydi");
    expect(add).toContain("revalidateAfterMutation();");
    expect(add).not.toContain("await revalidateAfterMutation()");
  });
});

import type { PurchaseOrderStatus } from "@/lib/database.types";

/** ISO tarih (YYYY-MM-DD) -> tr-TR (DD.MM.YYYY). null -> "—". UTC midnight gün kayması önlenir. */
export function formatExpectedDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso + "T00:00:00Z").toLocaleDateString("tr-TR");
}

/** PO iptal edilebilir mi? Toplu iptal seçimi yalnız bunları kapsar. */
export function isPoCancellable(po: { status: PurchaseOrderStatus }): boolean {
    return !["received", "cancelled"].includes(po.status);
}

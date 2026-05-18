import { notFound } from "next/navigation";
import { dbGetPurchaseOrderById } from "@/lib/supabase/purchase-orders";
import { dbGetVendorById } from "@/lib/supabase/vendors";
import { dbGetCompanySettings } from "@/lib/supabase/company-settings";
import { dbGetProductRefsByIds } from "@/lib/supabase/products";
import PurchaseOrderDocument from "@/components/purchase/PurchaseOrderDocument";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderPrintPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const po = await dbGetPurchaseOrderById(id);
    if (!po) return notFound();

    // Only fetch products referenced by this PO's lines, with minimal fields.
    // Avoids leaking the full active product catalog (with cost_price, parasut_*,
    // on_hand, reserved, product_notes, ...) into the print client payload.
    const productIds = Array.from(new Set(po.lines.map(l => l.product_id)));

    const [vendor, company, products] = await Promise.all([
        dbGetVendorById(po.vendor_id),
        dbGetCompanySettings(),
        dbGetProductRefsByIds(productIds),
    ]);

    return (
        <PurchaseOrderDocument
            po={po}
            vendor={vendor}
            company={company}
            products={products}
        />
    );
}

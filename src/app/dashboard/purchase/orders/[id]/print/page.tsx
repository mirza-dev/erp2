import { notFound } from "next/navigation";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { redactPurchaseOrderForPerms } from "@/lib/auth/redact";
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

    // 2026-09-16 (RBAC "named" artık — yapısal kapanış): bu sayfa veriyi route'tan değil
    // DOĞRUDAN DB'den çeker; route katmanının guard'ı ve redaksiyonu burada geçerli değildi.
    // Sızmıyordu, çünkü /dashboard/purchase/orders'a girebilen üç rol de view_purchase_costs
    // taşıyor — bir MATRİS tesadüfü, güvence değil. Guard + redaksiyon artık sayfanın kendisinde:
    // proxy/page-access değişse de belge yetkisiz gözden geçemez. Kapı DB okumasından ÖNCE
    // ve BİLEREK sıralı (React Doctor `server-sequential-independent-await` uyarısı kabul):
    // yetkisiz istek için PO satırı hiç okunmaz — authz-önce sıralaması bir tur bekleyişe değer.
    const ctx = await resolveAuthContext();
    if (!ctx.perms.has("view_purchase_orders")) return notFound();

    const po = await dbGetPurchaseOrderById(id);
    if (!po) return notFound();
    // view_purchase_costs yoksa maliyet alanları null → belge "—" basar (formatPoCurrency).
    const printable = redactPurchaseOrderForPerms(po, ctx.perms);

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
            po={printable}
            vendor={vendor}
            company={company}
            products={products}
        />
    );
}

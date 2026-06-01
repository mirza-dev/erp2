"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { mapOrderDetail } from "@/lib/api-mappers";
import type { OrderDetail } from "@/lib/mock-data";
import OrderForm, { type OrderFormInitial } from "../../OrderForm";

function buildInitial(order: OrderDetail): OrderFormInitial {
    return {
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        notes: order.notes ?? "",
        quoteValidUntil: order.quoteValidUntil ?? "",
        lines: order.lines.map(l => ({
            productId: l.productId,
            productName: l.productName,
            productSku: l.productSku,
            unit: l.unit,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountPct: l.discountPct,
        })),
    };
}

function EditOrderInner() {
    const params = useParams();
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        const run = async () => {
            setLoading(true);
            setOrder(null);
            try {
                const res = await fetch(`/api/orders/${params.id}`, { signal: controller.signal });
                if (res.ok) {
                    setOrder(mapOrderDetail(await res.json()));
                } else {
                    setOrder(null);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                setOrder(null);
            } finally {
                setLoading(false);
            }
        };
        if (params.id) run();
        return () => controller.abort();
    }, [params.id]);

    if (loading) {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                Sipariş yükleniyor...
            </div>
        );
    }

    if (!order) {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                Sipariş bulunamadı.{" "}
                <Link href="/dashboard/orders" style={{ color: "var(--accent-text)" }}>Geri dön</Link>
            </div>
        );
    }

    // Yalnızca taslak siparişler düzenlenebilir (backend RPC de garanti eder).
    if (order.commercial_status !== "draft") {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                Yalnızca taslak siparişler düzenlenebilir. Bu sipariş <strong>{order.orderNumber}</strong> taslak durumunda değil.{" "}
                <Link href={`/dashboard/orders/${order.id}`} style={{ color: "var(--accent-text)" }}>Sipariş detayına dön</Link>
            </div>
        );
    }

    return <OrderForm mode="edit" orderId={order.id} initial={buildInitial(order)} />;
}

export default function EditOrderPage() {
    return (
        <Suspense>
            <EditOrderInner />
        </Suspense>
    );
}

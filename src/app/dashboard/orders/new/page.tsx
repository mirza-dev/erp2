"use client";

import { Suspense } from "react";
import OrderForm from "../OrderForm";

// Yeni sipariş formu — paylaşılan OrderForm bileşeni (new + edit ortak).
// useSearchParams (müşteri prefill query-param) için Suspense wrapper.
export default function NewOrderPage() {
    return (
        <Suspense>
            <OrderForm mode="new" />
        </Suspense>
    );
}

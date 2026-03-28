import { createServiceClient } from "./service";
import type { ShipmentRow } from "@/lib/database.types";

export interface CreateShipmentInput {
    shipment_number: string;
    order_id?: string;
    order_number?: string;
    shipment_date: string;
    transport_type?: string;
    net_weight_kg?: number;
    gross_weight_kg?: number;
    notes?: string;
}

export async function dbCreateShipment(input: CreateShipmentInput): Promise<ShipmentRow> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("shipments")
        .insert({
            shipment_number: input.shipment_number,
            order_id: input.order_id ?? null,
            order_number: input.order_number ?? null,
            shipment_date: input.shipment_date,
            transport_type: input.transport_type ?? null,
            net_weight_kg: input.net_weight_kg ?? null,
            gross_weight_kg: input.gross_weight_kg ?? null,
            notes: input.notes ?? null,
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Shipment creation failed");
    return data;
}

export async function dbListShipments(orderId?: string): Promise<ShipmentRow[]> {
    const supabase = createServiceClient();
    let query = supabase.from("shipments").select("*").order("shipment_date", { ascending: false });
    if (orderId) query = query.eq("order_id", orderId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}

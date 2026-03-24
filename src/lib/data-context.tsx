"use client";

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

import type {
  Customer,
  Product,
  Order,
  OrderDetail,
  OrderLineItem,
  UretimKaydi,
} from "./mock-data";

import {
  mapProduct,
  mapCustomer,
  mapOrderSummary,
  mapProductionEntry,
} from "./api-mappers";

import type { CreateOrderInput } from "./supabase/orders";

// ── Exported types ──────────────────────────────────────────

export type CommercialStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "cancelled";

export type FulfillmentStatus =
  | "unallocated"
  | "partially_allocated"
  | "allocated"
  | "partially_shipped"
  | "shipped";

type OrderTransition = CommercialStatus | "shipped";

export interface OpenAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description?: string;
  type: string;
  source: "system" | "ai" | "ui";
  created_at: string;
  entity_id?: string;
}

export interface ConflictItem {
  productName: string;
  requested: number;
  available: number;
}

export interface UpdateStatusResult {
  ok: boolean;
  conflicts?: ConflictItem[];
  error?: string;
}

// ── Internal types ──────────────────────────────────────────

interface ImportPayload {
  customers?: Customer[];
  products?: Product[];
  orders?: Order[];
}

interface DataContextValue {
  customers: Customer[];
  products: Product[];
  orders: Order[];
  orderDetails: OrderDetail[];
  uretimKayitlari: UretimKaydi[];
  addImportedData: (payload: ImportPayload) => void;
  importedCount: { customers: number; products: number; orders: number } | null;
  addCustomer: (
    c: Omit<Customer, "id" | "totalOrders" | "totalRevenue" | "lastOrderDate" | "isActive">
  ) => Promise<void>;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => Promise<void>;
  addProduct: (
    p: Omit<Product, "id" | "reserved" | "available_now" | "isActive">
  ) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addUretimKaydi: (k: Omit<UretimKaydi, "id">) => Promise<{ refetchFailed?: boolean }>;
  deleteUretimKaydi: (id: string) => Promise<{ refetchFailed?: boolean }>;
  addOrder: (
    detail: Omit<OrderDetail, "id" | "orderNumber" | "itemCount">
  ) => Promise<string>;
  updateOrderStatus: (
    orderId: string,
    transition: OrderTransition
  ) => Promise<UpdateStatusResult>;
  reorderSuggestions: Product[];
  activeAlertCount: number;
  openAlerts: OpenAlert[];
  loading: boolean;
  loadError: string | null;
  refetchAll: () => Promise<void>;
}

// ── Context ─────────────────────────────────────────────────

const DataContext = createContext<DataContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────

export function DataProvider({ children }: { children: ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderDetails] = useState<OrderDetail[]>([]);
  const [uretimKayitlari, setUretimKayitlari] = useState<UretimKaydi[]>([]);
  const [importedCount, setImportedCount] =
    useState<DataContextValue["importedCount"]>(null);
  const [activeAlertCount, setActiveAlertCount] = useState(0);
  const [openAlerts, setOpenAlerts] = useState<OpenAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Fetch all lists from API ─────────────────────────────

  const refetchAll = useCallback(async () => {
    try {
      const [productsRes, customersRes, ordersRes, productionRes, alertsRes] =
        await Promise.all([
          fetch("/api/products"),
          fetch("/api/customers"),
          fetch("/api/orders"),
          fetch("/api/production"),
          fetch("/api/alerts"),
        ]);

      const failed = [productsRes, customersRes, ordersRes, productionRes].find(r => !r.ok);
      if (failed) {
        setLoadError(`Veriler yüklenemedi (HTTP ${failed.status}). Backend bağlantısını kontrol edin.`);
      }

      if (productsRes.ok) {
        const data = await productsRes.json();
        setProducts(Array.isArray(data) ? data.map(mapProduct) : []);
      }
      if (customersRes.ok) {
        const data = await customersRes.json();
        setCustomers(Array.isArray(data) ? data.map(mapCustomer) : []);
      }
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(Array.isArray(data) ? data.map(mapOrderSummary) : []);
      }
      if (productionRes.ok) {
        const data = await productionRes.json();
        setUretimKayitlari(
          Array.isArray(data) ? data.map(mapProductionEntry) : []
        );
      }
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        const open = (Array.isArray(data) ? data : []).filter(
          (a: { status: string }) => a.status === "open"
        ) as OpenAlert[];
        setActiveAlertCount(open.length);
        setOpenAlerts(open);
      }
    } catch (err) {
      setLoadError("Sunucuya bağlanamadı. Ağ bağlantınızı ve backend durumunu kontrol edin.");
      console.error("Failed to fetch initial data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Mount ──────────────────────────────────────────────
  useEffect(() => { refetchAll(); }, [refetchAll]);

  // ── Import ───────────────────────────────────────────────

  const addImportedData = (payload: ImportPayload) => {
    const newCustomers = payload.customers ?? [];
    const newProducts = payload.products ?? [];
    const newOrders = payload.orders ?? [];

    if (newCustomers.length > 0)
      setCustomers((prev) => [...prev, ...newCustomers]);
    if (newProducts.length > 0)
      setProducts((prev) => [...prev, ...newProducts]);
    if (newOrders.length > 0) setOrders((prev) => [...newOrders, ...prev]);

    setImportedCount({
      customers: newCustomers.length,
      products: newProducts.length,
      orders: newOrders.length,
    });
  };

  // ── Customers ────────────────────────────────────────────

  const addCustomer = async (
    fields: Omit<
      Customer,
      "id" | "totalOrders" | "totalRevenue" | "lastOrderDate" | "isActive"
    >
  ) => {
    try {
      const body = {
        name: fields.name,
        email: fields.email,
        phone: fields.phone,
        address: fields.address,
        tax_number: fields.taxNumber,
        tax_office: fields.taxOffice,
        country: fields.country,
        currency: fields.currency,
        notes: fields.notes,
      };
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setCustomers((prev) => [mapCustomer(data), ...prev]);
      } else {
        throw new Error(await res.text());
      }
    } catch (err) {
      console.error("addCustomer failed:", err);
      throw err;
    }
  };

  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const deleteCustomer = async (id: string) => {
    const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(errBody?.error ?? "Müşteri silinemedi.");
    }
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  };

  // ── Products ─────────────────────────────────────────────

  const addProduct = async (
    fields: Omit<Product, "id" | "reserved" | "available_now" | "isActive">
  ) => {
    try {
      const body = {
        name: fields.name,
        sku: fields.sku,
        category: fields.category,
        unit: fields.unit,
        price: fields.price,
        currency: fields.currency,
        on_hand: fields.on_hand,
        min_stock_level: fields.minStockLevel,
        product_type: fields.productType,
        warehouse: fields.warehouse,
        reorder_qty: fields.reorderQty,
        preferred_vendor: fields.preferredVendor,
        daily_usage: fields.dailyUsage,
      };
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setProducts((prev) => [mapProduct(data), ...prev]);
      } else {
        throw new Error(await res.text());
      }
    } catch (err) {
      console.error("addProduct failed:", err);
      throw err;
    }
  };

  const deleteProduct = async (id: string) => {
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(errBody?.error ?? "Ürün silinemedi.");
    }
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  // ── Production (Uretim) ──────────────────────────────────

  const addUretimKaydi = async (k: Omit<UretimKaydi, "id">): Promise<{ refetchFailed?: boolean }> => {
    try {
      const body = {
        product_id: k.productId,
        produced_qty: k.adet,
        production_date: k.tarih,
        notes: k.notlar,
      };
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? "Üretim kaydedilemedi.");
      }
      // POST succeeded — refetch production and products (stock has changed)
      let refetchFailed = false;
      const [prodRes, prodDataRes] = await Promise.all([
        fetch("/api/production"),
        fetch("/api/products"),
      ]);
      if (prodRes.ok) {
        const data = await prodRes.json();
        setUretimKayitlari(
          Array.isArray(data) ? data.map(mapProductionEntry) : []
        );
      } else {
        refetchFailed = true;
        console.error("addUretimKaydi: production refetch failed", prodRes.status);
      }
      if (prodDataRes.ok) {
        const data = await prodDataRes.json();
        setProducts(Array.isArray(data) ? data.map(mapProduct) : []);
      } else {
        refetchFailed = true;
        console.error("addUretimKaydi: products refetch failed", prodDataRes.status);
      }
      return { refetchFailed };
    } catch (err) {
      console.error("addUretimKaydi failed:", err);
      throw err;
    }
  };

  const deleteUretimKaydi = async (id: string): Promise<{ refetchFailed?: boolean }> => {
    try {
      const res = await fetch(`/api/production/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? "Üretim kaydı silinemedi.");
      }
      setUretimKayitlari((prev) => prev.filter((k) => k.id !== id));
      // Refetch products and production (stock has changed)
      let refetchFailed = false;
      const [productsRes, prodRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/production"),
      ]);
      if (productsRes.ok) {
        const data = await productsRes.json();
        setProducts(Array.isArray(data) ? data.map(mapProduct) : []);
      } else {
        refetchFailed = true;
        console.error("deleteUretimKaydi: products refetch failed", productsRes.status);
      }
      if (prodRes.ok) {
        const data = await prodRes.json();
        setUretimKayitlari(
          Array.isArray(data) ? data.map(mapProductionEntry) : []
        );
      } else {
        refetchFailed = true;
        console.error("deleteUretimKaydi: production refetch failed", prodRes.status);
      }
      return { refetchFailed };
    } catch (err) {
      console.error("deleteUretimKaydi failed:", err);
      throw err;
    }
  };

  // ── Orders ───────────────────────────────────────────────

  const addOrder = async (
    detail: Omit<OrderDetail, "id" | "orderNumber" | "itemCount">
  ): Promise<string> => {
    try {
      const body: CreateOrderInput = {
        customer_id: detail.customerId,
        customer_name: detail.customerName,
        customer_email: detail.customerEmail,
        customer_country: detail.customerCountry,
        customer_tax_office: detail.customerTaxOffice,
        customer_tax_number: detail.customerTaxNumber,
        commercial_status: detail.commercial_status,
        fulfillment_status: detail.fulfillment_status,
        currency: detail.currency,
        subtotal: detail.subtotal,
        vat_total: detail.vatTotal,
        grand_total: detail.grandTotal,
        notes: detail.notes,
        lines: detail.lines.map((l: OrderLineItem) => ({
          product_id: l.productId,
          product_name: l.productName,
          product_sku: l.productSku,
          unit: l.unit,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          discount_pct: l.discountPct,
          line_total: l.lineTotal,
        })),
      };
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const newId: string = (data.order ?? data).id;
        // Refetch full list so all fields are populated correctly
        const ordersRes = await fetch("/api/orders");
        if (ordersRes.ok) {
          const ordersData = await ordersRes.json();
          setOrders(Array.isArray(ordersData) ? ordersData.map(mapOrderSummary) : []);
        }
        return newId;
      }
      const errJson = await res.json().catch(() => null);
      const errMsg =
        errJson?.errors?.join(", ") ||
        errJson?.error ||
        "Sipariş oluşturulamadı.";
      throw new Error(errMsg);
    } catch (err) {
      console.error("addOrder failed:", err);
      throw err;
    }
  };

  const updateOrderStatus = async (
    orderId: string,
    transition: OrderTransition
  ): Promise<UpdateStatusResult> => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition }),
      });

      if (res.status === 409) {
        const data = await res.json();
        return { ok: false, conflicts: data.conflicts };
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { ok: false, error: errBody.error || `API error: ${res.status}` };
      }

      const updated = await res.json();
      const mapped = mapOrderSummary(updated);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? mapped : o))
      );

      // If shipped, refetch products (stock has changed)
      if (transition === "shipped") {
        const productsRes = await fetch("/api/products");
        if (productsRes.ok) {
          const data = await productsRes.json();
          setProducts(Array.isArray(data) ? data.map(mapProduct) : []);
        } else {
          console.error("updateOrderStatus: products refetch failed", productsRes.status);
        }
      }

      return { ok: true };
    } catch (err) {
      console.error("updateOrderStatus failed:", err);
      return { ok: false, error: err instanceof Error ? err.message : undefined };
    }
  };

  // ── Reorder suggestions ──────────────────────────────────

  const reorderSuggestions = useMemo(
    () =>
      products.filter(
        (p) => p.isActive && p.available_now < p.minStockLevel
      ),
    [products]
  );

  // ── Render ───────────────────────────────────────────────

  return (
    <DataContext.Provider
      value={{
        customers,
        products,
        orders,
        orderDetails,
        uretimKayitlari,
        addImportedData,
        importedCount,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        addProduct,
        deleteProduct,
        addUretimKaydi,
        deleteUretimKaydi,
        addOrder,
        updateOrderStatus,
        reorderSuggestions,
        activeAlertCount,
        openAlerts,
        loading,
        loadError,
        refetchAll,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

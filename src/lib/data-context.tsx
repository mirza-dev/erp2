"use client";

/**
 * Veri katmanı — SWR domain hook'ları (kalıcı performans turu Faz 3).
 *
 * ESKİ: DataProvider mount'ta 5 endpoint'i (products?all=1 ~5MB, orders?all=1
 * ~3.5MB, customers, production, alerts) Promise.all ile çekip context state'te
 * tutuyordu — her dashboard sayfası açılışında TÜM veri indiriliyordu.
 *
 * YENİ: veri YALNIZ tüketen komponent mount edince çekilir (useSWR per-domain);
 * SWR cache navigasyonlar arası paylaşılır + dedupingInterval eşzamanlı
 * istekleri tekiller. `useData()` geriye-uyumlu kompozisyon hook'u olarak
 * yaşar (dönüş şekli alan-alan aynı) — dar ihtiyaçlı sayfalar domain
 * hook'larını doğrudan kullanır.
 */

import { useCallback, useMemo, ReactNode } from "react";
import useSWR, { SWRConfig, useSWRConfig, mutate as globalMutate } from "swr";
import { jsonFetcher, FetchError, SWR_DEFAULTS } from "./swr-config";

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
import type { SalesOrderRow } from "./database.types";
import { isDemoMode as checkDemoMode } from "./demo-utils";
import { shouldSuggestReorder } from "./stock-utils";
import { buildCustomerPatch } from "./customer-helpers";
import { buildShortageMessage } from "./production-shortage-helpers";

// ── Exported types ─────────────────────────────────────────

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
  ai_confidence?: number | null;
  created_at: string;
  entity_id?: string;
}

export interface ShortageItem {
  product_name: string;
  requested: number;
  reserved: number;
  shortage: number;
}

export interface UpdateStatusResult {
  ok: boolean;
  error?: string;
  fulfillment_status?: FulfillmentStatus;
  shortages?: ShortageItem[];
}

// ── Internal types ──────────────────────────────────────────

interface DataContextValue {
  customers: Customer[];
  products: Product[];
  orders: Order[];
  uretimKayitlari: UretimKaydi[];
  addCustomer: (
    c: Omit<Customer, "id" | "totalOrders" | "totalRevenue" | "lastOrderDate" | "isActive">
  ) => Promise<void>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  addProduct: (
    p: Omit<Product, "id" | "reserved" | "available_now" | "isActive" | "quoted" | "promisable" | "incoming" | "forecasted">
  ) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addUretimKaydi: (k: Omit<UretimKaydi, "id">) => Promise<{ refetchFailed?: boolean }>;
  deleteUretimKaydi: (id: string) => Promise<{ refetchFailed?: boolean }>;
  addOrder: (
    detail: Omit<OrderDetail, "id" | "orderNumber" | "itemCount">
  ) => Promise<{ id: string; submitError?: string }>;
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

// ── SWR keys ────────────────────────────────────────────────

// Audit 4. tur Bulgu 3: ?all=1 → pagination'sız tüm aktif ürünler/siparişler.
// Önceden default page=1 (100 ürün / 50 sipariş) sessiz cap üretiyordu; tab
// sayaçları + müşteri cirosu (CustomerDetailPanel) eksik hesaplanıyordu.
export const PRODUCTS_KEY = "/api/products?all=1";
export const CUSTOMERS_KEY = "/api/customers";
export const ORDERS_KEY = "/api/orders?all=1";
export const ALERTS_KEY = "/api/alerts";
export const COUNTERS_KEY = "/api/dashboard/counters";

/**
 * Üretim fetch URL'i: son 120 günü pencereli + yüksek explicit limitle çeker.
 * Eski parametresiz çağrı default limit 50'ye düşüyordu → dashboard'ın
 * "Bu Ay/Çeyrek Üretim" KPI'ı ve 14 günlük seri yoğun dönemlerde sessizce
 * eksik sayıyordu. 120 gün = güncel çeyrek (≤92g) + 14g seri + 6g spark.
 */
export function productionFetchUrl(now: Date = new Date()): string {
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 120);
  const iso = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;
  return `/api/production?since=${iso}&limit=5000`;
}

// ── Saf yardımcılar (test edilebilir export'lar) ───────────

/**
 * Yük hata mesajı önceliği — eski refetchAll davranışıyla birebir:
 * core (products/customers/orders/production) hatası > alerts hatası;
 * HTTP hatası status'lu mesaj, ağ hatası bağlantı mesajı üretir.
 */
export function buildLoadError(coreErrors: unknown[], alertsError: unknown): string | null {
  const coreErr = coreErrors.find(e => e !== undefined && e !== null);
  if (coreErr !== undefined) {
    if (coreErr instanceof FetchError) {
      return `Veriler yüklenemedi (HTTP ${coreErr.status}). Backend bağlantısını kontrol edin.`;
    }
    return "Sunucuya bağlanamadı. Ağ bağlantınızı ve backend durumunu kontrol edin.";
  }
  if (alertsError !== undefined && alertsError !== null) {
    if (alertsError instanceof FetchError) {
      return `Uyarı servisi yanıt vermedi (HTTP ${alertsError.status}). Stok uyarıları güncel olmayabilir.`;
    }
    return "Sunucuya bağlanamadı. Ağ bağlantınızı ve backend durumunu kontrol edin.";
  }
  return null;
}

/**
 * Stok etkisi olan sipariş geçişleri — bu geçişlerden sonra products tazelenir
 * (approved: reserved artar, cancelled: reserved düşer, shipped: on_hand düşer).
 */
export function shouldRefetchProducts(transition: OrderTransition): boolean {
  return transition === "approved" || transition === "cancelled" || transition === "shipped";
}

// Demo guard — blocks mutation if in demo mode. Does NOT clear the cookie or
// redirect; page-level handlers surface the toast feedback. Server middleware
// is the real security gate (403).
function demoGuard(): boolean {
  return checkDemoMode();
}

// ── Mapped fetcher'lar (cache'te map'lenmiş veri tutulur) ──

async function listFetcher<T>(url: string, map: (raw: never) => T): Promise<T[]> {
  const data = await jsonFetcher<unknown>(url);
  return Array.isArray(data) ? (data as never[]).map(map) : [];
}

const productsFetcher = (url: string) => listFetcher(url, mapProduct);
const customersFetcher = (url: string) => listFetcher(url, mapCustomer);
const ordersFetcher = (url: string) => listFetcher(url, mapOrderSummary);
const productionFetcher = (url: string) => listFetcher(url, mapProductionEntry);

async function alertsFetcher(url: string): Promise<OpenAlert[]> {
  const data = await jsonFetcher<unknown>(url);
  // Aktif = open + acknowledged — Uyarılar sayfası istatistiğiyle aynı
  // tanım (ack'lenen uyarı görülmüştür ama koşul sürer; sayaçtan düşmez).
  return (Array.isArray(data) ? data : []).filter(
    (a: { status: string }) => a.status === "open" || a.status === "acknowledged"
  ) as OpenAlert[];
}

// ── Sidebar sayaçları (perf Faz 2) ──────────────────────────
// Sidebar 3 rozet için tam listeleri İNDİRMEZ — /api/dashboard/counters yalnız
// 3 sayı döner. SWR 60sn poll + mutasyon köprüleri mutate(COUNTERS_KEY) ile tazeler.

export interface DashboardCounters {
  pendingOrders: number;
  reorderCount: number;
  activeAlerts: number;
}

export function useDashboardCounters(): { counters: DashboardCounters | undefined } {
  const { data } = useSWR<DashboardCounters>(COUNTERS_KEY, jsonFetcher, {
    ...SWR_DEFAULTS,
    refreshInterval: 60_000,
  });
  return { counters: data };
}

// ── Domain hook'ları ────────────────────────────────────────

export function useCustomers() {
  const { data, isLoading, error } = useSWR<Customer[]>(CUSTOMERS_KEY, customersFetcher, SWR_DEFAULTS);
  const { mutate } = useSWRConfig();

  const addCustomer = useCallback(async (
    fields: Omit<Customer, "id" | "totalOrders" | "totalRevenue" | "lastOrderDate" | "isActive">
  ) => {
    if (demoGuard()) return;
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
        await mutate(CUSTOMERS_KEY,
          (prev: Customer[] | undefined) => [mapCustomer(data), ...(prev ?? [])],
          { revalidate: false });
      } else {
        // route { error } JSON döndürür — kullanıcıya ham {"error":...} stringi
        // değil mesajı göster (updateCustomer/deleteCustomer paterni).
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? "Müşteri eklenemedi.");
      }
    } catch (err) {
      console.error("addCustomer failed:", err);
      throw err;
    }
  }, [mutate]);

  const updateCustomer = useCallback(async (id: string, updates: Partial<Customer>): Promise<void> => {
    if (demoGuard()) return;
    const body = buildCustomerPatch(updates);
    const res = await fetch(`/api/customers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(errBody?.error ?? "Müşteri güncellenemedi.");
    }
    const data = await res.json();
    await mutate(CUSTOMERS_KEY,
      (prev: Customer[] | undefined) => (prev ?? []).map(c => (c.id === id ? mapCustomer(data) : c)),
      { revalidate: false });
  }, [mutate]);

  const deleteCustomer = useCallback(async (id: string) => {
    if (demoGuard()) return;
    const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(errBody?.error ?? "Müşteri silinemedi.");
    }
    await mutate(CUSTOMERS_KEY,
      (prev: Customer[] | undefined) => (prev ?? []).filter(c => c.id !== id),
      { revalidate: false });
  }, [mutate]);

  return {
    customers: data ?? [],
    customersLoading: isLoading,
    customersError: error as unknown,
    addCustomer,
    updateCustomer,
    deleteCustomer,
  };
}

export function useProducts() {
  const { data, isLoading, error } = useSWR<Product[]>(PRODUCTS_KEY, productsFetcher, SWR_DEFAULTS);
  const { mutate } = useSWRConfig();

  const addProduct = useCallback(async (
    fields: Omit<Product, "id" | "reserved" | "available_now" | "isActive" | "quoted" | "promisable" | "incoming" | "forecasted">
  ) => {
    if (demoGuard()) return;
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
        product_family: fields.productFamily,
        sub_category: fields.subCategory,
        sector_compatibility: fields.sectorCompatibility,
        cost_price: fields.costPrice,
        weight_kg: fields.weightKg,
        material_quality: fields.materialQuality || undefined,
        origin_country: fields.originCountry || undefined,
        production_site: fields.productionSite || undefined,
        use_cases: fields.useCases || undefined,
        industries: fields.industries || undefined,
        standards: fields.standards || undefined,
        certifications: fields.certifications || undefined,
        product_notes: fields.productNotes || undefined,
      };
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        await mutate(PRODUCTS_KEY,
          (prev: Product[] | undefined) => [mapProduct(data), ...(prev ?? [])],
          { revalidate: false });
      } else {
        throw new Error(await res.text());
      }
    } catch (err) {
      console.error("addProduct failed:", err);
      throw err;
    }
  }, [mutate]);

  const deleteProduct = useCallback(async (id: string) => {
    if (demoGuard()) return;
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(errBody?.error ?? "Ürün silinemedi.");
    }
    await mutate(PRODUCTS_KEY,
      (prev: Product[] | undefined) => (prev ?? []).filter(p => p.id !== id),
      { revalidate: false });
  }, [mutate]);

  return {
    products: data ?? [],
    productsLoading: isLoading,
    productsError: error as unknown,
    addProduct,
    deleteProduct,
  };
}

/**
 * Sipariş mutasyonları — SWR liste aboneliği BAŞLATMAZ (perf): detay sayfası /
 * OrderForm gibi yalnız yazma ihtiyacı olan tüketiciler tam listeyi indirmesin.
 * Cache'te liste varsa optimistik günceller; yoksa mutate no-op kalır ve liste
 * sayfası mount olduğunda taze çekilir.
 */
export function useOrderMutations() {
  const { mutate } = useSWRConfig();

  const addOrder = useCallback(async (
    detail: Omit<OrderDetail, "id" | "orderNumber" | "itemCount">
  ): Promise<{ id: string; submitError?: string }> => {
    if (demoGuard()) return { id: "" };
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
        quote_valid_until: detail.quoteValidUntil ?? undefined,
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
        const data: SalesOrderRow & { submitError?: string } = await res.json();
        await mutate(ORDERS_KEY,
          (prev: Order[] | undefined) => [mapOrderSummary(data), ...(prev ?? [])],
          { revalidate: false });
        void mutate(COUNTERS_KEY);
        // create-and-send: pending istendi ama allocation başarısızsa (stok yok)
        // sipariş DRAFT kaldı → submitError ile dürüst bildirim (route 201 döner).
        return { id: data.id, submitError: data.submitError };
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
  }, [mutate]);

  const updateOrderStatus = useCallback(async (
    orderId: string,
    transition: OrderTransition
  ): Promise<UpdateStatusResult> => {
    if (demoGuard()) return { ok: false };
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { ok: false, error: errBody.error || `API error: ${res.status}` };
      }

      const updated = await res.json();
      const mapped = mapOrderSummary(updated);
      await mutate(ORDERS_KEY,
        (prev: Order[] | undefined) => (prev ?? []).map(o => (o.id === orderId ? mapped : o)),
        { revalidate: false });
      void mutate(COUNTERS_KEY);

      // Stok etkisi olan geçişlerde products tazelenir (reserved/on_hand değişti).
      if (shouldRefetchProducts(transition)) {
        try {
          await mutate(PRODUCTS_KEY);
        } catch (err) {
          console.error("updateOrderStatus: products refetch failed", err);
        }
      }

      return {
        ok: true,
        fulfillment_status: updated.fulfillment_status as FulfillmentStatus | undefined,
        shortages: Array.isArray(updated.shortages) ? updated.shortages as ShortageItem[] : undefined,
      };
    } catch (err) {
      console.error("updateOrderStatus failed:", err);
      return { ok: false, error: err instanceof Error ? err.message : undefined };
    }
  }, [mutate]);

  return { addOrder, updateOrderStatus };
}

export function useOrders() {
  const { data, isLoading, error } = useSWR<Order[]>(ORDERS_KEY, ordersFetcher, SWR_DEFAULTS);
  const { addOrder, updateOrderStatus } = useOrderMutations();
  return {
    orders: data ?? [],
    ordersLoading: isLoading,
    ordersError: error as unknown,
    addOrder,
    updateOrderStatus,
  };
}

export function useProduction() {
  const productionKey = productionFetchUrl();
  const { data, isLoading, error } = useSWR<UretimKaydi[]>(productionKey, productionFetcher, SWR_DEFAULTS);
  const { mutate } = useSWRConfig();

  // POST/DELETE sonrası üretim + ürün listeleri tazelenir (stok değişti).
  // Revalidation hatası yutulmaz — { refetchFailed: true } sözleşmesi korunur
  // (çağıran sayfa "liste güncel olmayabilir" uyarısı gösterir).
  const revalidateAfterMutation = useCallback(async (): Promise<boolean> => {
    let refetchFailed = false;
    const results = await Promise.allSettled([
      mutate(productionKey),
      mutate(PRODUCTS_KEY),
    ]);
    for (const r of results) {
      if (r.status === "rejected") {
        refetchFailed = true;
        console.error("production mutation refetch failed", r.reason);
      }
    }
    return refetchFailed;
  }, [mutate, productionKey]);

  const addUretimKaydi = useCallback(async (k: Omit<UretimKaydi, "id">): Promise<{ refetchFailed?: boolean }> => {
    if (demoGuard()) return {};
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
        // 409 BOM eksik-bileşen payload'ı (errBody.shortages) varsa hangi
        // bileşenin ne kadar gerekli/mevcut olduğunu mesaja taşı — yoksa
        // jenerik "Yetersiz bileşen stoğu." kullanıcıya hangi hammaddeyi
        // tedarik edeceğini söylemiyordu.
        const fallback = errBody?.error ?? "Üretim kaydedilemedi.";
        throw new Error(buildShortageMessage(errBody?.shortages, fallback));
      }
      const refetchFailed = await revalidateAfterMutation();
      return { refetchFailed };
    } catch (err) {
      console.error("addUretimKaydi failed:", err);
      throw err;
    }
  }, [revalidateAfterMutation]);

  const deleteUretimKaydi = useCallback(async (id: string): Promise<{ refetchFailed?: boolean }> => {
    if (demoGuard()) return {};
    try {
      const res = await fetch(`/api/production/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? "Üretim kaydı silinemedi.");
      }
      await mutate(productionKey,
        (prev: UretimKaydi[] | undefined) => (prev ?? []).filter(x => x.id !== id),
        { revalidate: false });
      const refetchFailed = await revalidateAfterMutation();
      return { refetchFailed };
    } catch (err) {
      console.error("deleteUretimKaydi failed:", err);
      throw err;
    }
  }, [mutate, productionKey, revalidateAfterMutation]);

  return {
    uretimKayitlari: data ?? [],
    productionLoading: isLoading,
    productionError: error as unknown,
    addUretimKaydi,
    deleteUretimKaydi,
  };
}

export function useAlerts() {
  const { data, isLoading, error } = useSWR<OpenAlert[]>(ALERTS_KEY, alertsFetcher, SWR_DEFAULTS);
  const openAlerts = data ?? [];
  return {
    openAlerts,
    activeAlertCount: openAlerts.length,
    alertsLoading: isLoading,
    alertsError: error as unknown,
  };
}

/** Satın alma önerisi adayları — backend (purchase-copilot) ile aynı semantik. */
export function useReorderSuggestions(products: Product[]): Product[] {
  return useMemo(
    () =>
      products.filter((p) =>
        // Audit 5. tur Fix 1: filter promisable üzerinden — backend
        // (purchase-copilot route) ile aynı semantik. available_now=50,
        // quoted=40, min=20 → promisable=10 ≤ min, öneriye girer.
        shouldSuggestReorder({
          isActive: p.isActive,
          productType: p.productType,
          available: p.promisable ?? p.available_now,
          min: p.minStockLevel,
          orderDeadline: p.orderDeadline,
        })
      ),
    [products]
  );
}

/**
 * Tüm domain cache'lerini tazeler (import/excel sonrası global yenileme).
 * Komponent dışından da çağrılabilir (global mutate).
 */
export async function invalidateAllData(): Promise<void> {
  await globalMutate(
    (key) => typeof key === "string" && (
      key === CUSTOMERS_KEY ||
      key === ORDERS_KEY ||
      key === ALERTS_KEY ||
      key === COUNTERS_KEY ||
      key.startsWith("/api/products") ||
      key.startsWith("/api/production")
    ),
    undefined,
    { revalidate: true },
  );
}

// ── Provider (SWR cache sınırı) ─────────────────────────────
// Artık veri ÇEKMEZ — yalnız SWRConfig sağlar (fetcher + ERP varsayılanları).
// Dosya/komponent adları geriye-uyum için korunur (feedback_no_silent_deletes).

export function DataProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher: jsonFetcher, ...SWR_DEFAULTS }}>
      {children}
    </SWRConfig>
  );
}

// ── Geriye-uyumlu kompozisyon hook'u ────────────────────────
// Dönüş şekli eski DataContextValue ile alan-alan aynı. Dar ihtiyaçlı sayfalar
// domain hook'larını doğrudan kullanmalı — useData TÜM domain'leri çeker.

export function useData(): DataContextValue {
  const { customers, customersLoading, customersError, addCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const { products, productsLoading, productsError, addProduct, deleteProduct } = useProducts();
  const { orders, ordersLoading, ordersError, addOrder, updateOrderStatus } = useOrders();
  const { uretimKayitlari, productionLoading, productionError, addUretimKaydi, deleteUretimKaydi } = useProduction();
  const { openAlerts, activeAlertCount, alertsLoading, alertsError } = useAlerts();
  const reorderSuggestions = useReorderSuggestions(products);

  const loading = customersLoading || productsLoading || ordersLoading || productionLoading || alertsLoading;
  const loadError = useMemo(
    () => buildLoadError([productsError, customersError, ordersError, productionError], alertsError),
    [productsError, customersError, ordersError, productionError, alertsError]
  );

  const refetchAll = useCallback(async () => {
    await invalidateAllData();
  }, []);

  return useMemo(
    () => ({
      customers,
      products,
      orders,
      uretimKayitlari,
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
    }),
    [
      customers, products, orders, uretimKayitlari,
      addCustomer, updateCustomer, deleteCustomer,
      addProduct, deleteProduct,
      addUretimKaydi, deleteUretimKaydi,
      addOrder, updateOrderStatus,
      reorderSuggestions, activeAlertCount, openAlerts,
      loading, loadError, refetchAll,
    ]
  );
}

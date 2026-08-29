const ROUTE_TITLES: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/dashboard/quotes": "Teklifler",
    "/dashboard/quotes/new": "Yeni Teklif",
    "/dashboard/quotes/preview": "Teklif Önizleme",
    "/dashboard/orders": "Satış Siparişleri",
    "/dashboard/orders/new": "Yeni Sipariş",
    "/dashboard/products": "Stok & Ürünler",
    "/dashboard/products/aging": "Yaşlanan Stok",
    "/dashboard/customers": "Cariler",
    "/dashboard/purchase/suggested": "Öneriler",
    "/dashboard/purchase/orders": "Satın Alma Siparişleri",
    "/dashboard/purchase/orders/new": "Yeni Satın Alma",
    "/dashboard/purchase/rfqs": "Fiyat Talepleri",
    "/dashboard/purchase/rfqs/new": "Yeni Fiyat Talebi",
    "/dashboard/vendors": "Tedarikçiler",
    "/dashboard/production": "Üretim Girişi",
    "/dashboard/alerts": "Uyarılar",
    "/dashboard/import": "Veri Aktarım Merkezi",
    "/dashboard/import/excel": "Excel Aktarım Sihirbazı",
    "/dashboard/parasut": "Paraşüt Sync",
    "/dashboard/settings": "Ayarlar",
    "/dashboard/settings/product-types": "Teknik Şablonlar",
    "/dashboard/settings/note-templates": "Not Şablonları",
    "/dashboard/settings/users": "Kullanıcılar",
    "/dashboard/settings/email-deliveries": "E-posta Teslimatları",
    "/dashboard/developer": "Developer Console",
    "/dashboard/developer/errors": "Hatalar",
    "/dashboard/developer/logs": "Kayıtlar",
    "/dashboard/developer/bugs": "Bug Takibi",
    "/dashboard/developer/performance": "Performans",
    "/dashboard/developer/diagnostics": "Tanılama",
};

export function getTopbarTitle(pathname: string | null | undefined): string {
    const path = (pathname || "/dashboard").split("?")[0]?.replace(/\/$/, "") || "/dashboard";
    if (ROUTE_TITLES[path]) return ROUTE_TITLES[path];
    if (/^\/dashboard\/products\/[^/]+$/.test(path)) return "Ürün Detayı";
    if (/^\/dashboard\/quotes\/[^/]+$/.test(path)) return "Teklif Detayı";
    if (/^\/dashboard\/orders\/[^/]+\/edit$/.test(path)) return "Sipariş Düzenle";
    if (/^\/dashboard\/orders\/[^/]+$/.test(path)) return "Sipariş Detayı";
    if (/^\/dashboard\/purchase\/orders\/[^/]+\/print$/.test(path)) return "Satın Alma Yazdır";
    if (/^\/dashboard\/purchase\/orders\/[^/]+$/.test(path)) return "Satın Alma Detayı";
    if (/^\/dashboard\/purchase\/rfqs\/[^/]+$/.test(path)) return "Fiyat Talebi Detayı";
    if (/^\/dashboard\/settings\/product-types\/[^/]+$/.test(path)) return "Teknik Şablon Detayı";
    if (/^\/dashboard\/import\/extract\/[^/]+$/.test(path)) return "Veri İnceleme";
    if (/^\/dashboard\/developer\/errors\/[^/]+$/.test(path)) return "Hata Detayı";
    return "Roven";
}

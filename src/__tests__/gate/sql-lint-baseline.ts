/**
 * SQL/migration lint gate BASELINE.
 *
 * 1) DEFINER_GRANDFATHER: SECURITY DEFINER içerip `SET search_path` VEYA
 *    REVOKE/GRANT EXECUTE hijyeni EKSİK olan mevcut migration'lar. Yeni
 *    migration'lar bu listeye GİREMEZ — DEFINER fonksiyon yazıyorsanız 039/054/087
 *    kalıbını kullanın (search_path + REVOKE + GRANT service_role).
 *    Bulgu: Y7 (docs/audit/2026-06-guvenlik-dogruluk-bulgulari.md).
 *
 * 2) REDEFINITION_CHAINS: aynı fonksiyonu yeniden tanımlayan migration zincirleri.
 *    Yeni bir migration mevcut bir fonksiyonu redefine ederse zincir burada
 *    GÜNCELLENMEK zorunda → review'da "önceki sürümün davranışları korundu mu?"
 *    sorusu görünür olur (088'in 078 qty-guard'ı + 080 description'ı düşürmesi
 *    bu sınıf hatanın emsali — bulgu Y4).
 */

/** DEFINER hijyeni eksik mevcut migration dosyaları (yalnız küçülür).
 *  Not: 036/069/071/073/074 ilk listede vardı — yorum-ayıklama sonrası
 *  DEFINER'larının yalnız AÇIKLAMA satırlarında geçtiği görüldü (gerçek
 *  fonksiyonlar INVOKER). Gerçek DEFINER+hijyensiz yalnız 016 ve 019;
 *  ikisi de 095_lock_hygiene ile kapanacak (Tur C). */
export const DEFINER_GRANDFATHER: string[] = [
    "016_health_check_utils.sql",
    "019_concurrency_hardening.sql",
];

/** fonksiyon adı → tanımlandığı migration numaraları (sıralı, eksiksiz). */
export const REDEFINITION_CHAINS: Record<string, string[]> = {
    increment_reserved: ["002", "003"],
    generate_order_number: ["003", "007"],
    approve_order_with_allocation: ["003", "004", "007"],
    ship_order_full: ["003", "007", "011"],
    cancel_order: ["003", "004", "007"],
    record_stock_movement: ["004", "008"],
    complete_production: ["004", "008"],
    try_resolve_shortages: ["004", "008"],
    reverse_production: ["004", "008"],
    // 093 (K2): order RPC'leri toplamları SUNUCUDA hesaplar; quote RPC'leri
    // override'ı koruyup makul-sapma kontrolü yapar — önceki davranışlar
    // (071 NULLIF/COALESCE cast'leri, draft guard, 081 header recompute) KORUNDU.
    create_order_with_lines: ["018", "023", "093"],
    update_order_with_lines: ["081", "093"],
    receive_purchase_commitment: ["020", "021", "028"],
    next_quote_number: ["034", "073"],
    // 102: ON CONFLICT (rfq_id,...) kolon-çıkarımı OUT param rfq_id ile çakışıyordu
    // (42702) → DISTINCT + ON CONFLICT'siz INSERT; gövdenin geri kalanı 100 ile birebir.
    create_rfq_with_lines: ["100", "102"],
    // 103: award bütünlüğü (O2 sunucu-otoriter fiyat/qty + D2 mükerrer satır guard);
    // gövdenin geri kalanı 100 ile birebir.
    award_rfq_create_pos: ["100", "103"],
    // 098: satır note kolonu INSERT'e eklendi — gövdeler 093 ile birebir.
    // 099: satır unit kolonu INSERT'e eklendi — gövdeler 098 ile birebir.
    create_quote_with_lines: ["035", "036", "065", "069", "071", "093", "098", "099"],
    update_quote_with_lines: ["035", "036", "065", "069", "071", "093", "098", "099"],
    // 099: legacy draft yolunda order_lines.unit = COALESCE(qli.unit, p.unit)
    // (teklif birimi öncelikli); geri kalan 088 ile birebir.
    accept_quote_and_create_order: ["077", "078", "080", "088", "099"],
    // 094 (Y4): description kopyalama + qty<=0 pre-check geri geldi; index
    // cancelled'ı dışlar (iptal sonrası yeniden gönderim) — 088 davranışının
    // geri kalanı birebir korundu.
    // 099: order_lines.unit = COALESCE(qli.unit, p.unit); geri kalan 094 ile birebir.
    send_quote_and_create_pending_order: ["088", "094", "099"],
    // 095 (Y7): gövdeler birebir; yalnız SET search_path + REVOKE/GRANT eklendi.
    try_acquire_scan_lock: ["019", "095"],
    release_scan_lock: ["019", "095"],
    try_acquire_ai_suggest_lock: ["019", "095"],
    release_ai_suggest_lock: ["019", "095"],
    check_migration_011_applied: ["016", "095"],
};

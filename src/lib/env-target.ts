/**
 * Hedef Supabase projesinin PROD olup olmadığını söyleyen saf yardımcı.
 *
 * Neden var: bu projede ayrı bir geliştirme veritabanı YOKTU — `.env.local`
 * doğrudan canlı fabrika verisine bakıyordu, yani her `npm run dev` gerçek
 * müşteri kayıtlarının üstünde çalışıyordu. Dev projesine geçtikten sonra da
 * hiçbir şey geri dönmeyi engellemiyor: bir `.env.local` kopyalaması, bir
 * "şunu canlıda bir bakayım" yeter ve fark edilmez.
 *
 * Kapının kullanımı: scripts/check-env-target.ts (npm run preflight:env),
 * `predev` ve `pretest:e2e*` ile bağlı.
 */

/**
 * Canlı (prod) Supabase proje ref'i.
 *
 * SIR DEĞİL: `NEXT_PUBLIC_SUPABASE_URL`'in parçası, yani zaten tarayıcı
 * bundle'ında. Env yerine SABİT olması bilinçli — kapı hiçbir yapılandırma
 * gerektirmeden çalışır ve yeni bir `.env.local`'da unutulamaz.
 */
export const PROD_PROJECT_REF = "ryvxpolvhvsycuqyphoa";

/** `https://<ref>.supabase.co` → `<ref>`; ayrıştırılamazsa null. */
export function projectRefFromUrl(url: string | undefined | null): string | null {
    if (!url) return null;
    const m = url.trim().match(/^https?:\/\/([a-z0-9]{20})\.supabase\.(co|in)(\/|$)/i);
    return m ? m[1].toLowerCase() : null;
}

/**
 * Hedef canlı proje mi?
 *
 * FAIL-CLOSED DEĞİL, ve bu bilinçli: ayrıştırılamayan bir URL prod SAYILMAZ.
 * Kapının koruduğu risk "canlı projeye bağlanmak"tır ve o riskin koşulu ref
 * eşleşmesidir — eşleşmeyen ya da tanınmayan bir hedef tanımı gereği canlı
 * değildir (yerel Supabase, self-host, başka müşteri projesi). Bilinmeyeni
 * bloklamak kapıyı bir gürültü kaynağına çevirir ve kapatılmasına yol açar.
 */
export function isProdTarget(url: string | undefined | null): boolean {
    return projectRefFromUrl(url) === PROD_PROJECT_REF;
}

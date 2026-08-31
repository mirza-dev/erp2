/**
 * Parola kurtarma dönüş yolu — TEK kaynak.
 *
 * 2026-08-31 denetimi (madde #4): "Şifremi unuttum" e-postayı gönderiyordu ama
 * dönüş adresi `/login`'di. `@supabase/ssr` PKCE akışında link `?code=` ile döner
 * ve o kodun `exchangeCodeForSession` ile oturuma çevrilmesi gerekir — `/login`
 * bunu yapmıyordu, "yeni şifre" ekranı da yoktu. Sonuç: şifresini unutan herkes
 * (admin dâhil) kalıcı olarak kilitleniyordu.
 *
 * Yol üç yerde geçiyor: linki üreten `/login`, exchange'i yapan `/auth/callback`
 * ve ekranın kendisi. Üçü ayrışırsa zincir yine sessizce kopar — bu yüzden sabit
 * burada.
 */

/** Kurtarma sonrası kullanıcının bırakılacağı ekran. */
export const RECOVERY_PATH = "/sifre-yenile";

/**
 * `/auth/callback?next=…` için kabul edilen hedefler.
 *
 * AÇIK YÖNLENDİRME KORUMASI: serbest path kabul edilmez. `next` yalnız bu kümeyle
 * TAM eşleşirse kullanılır; aksi hâlde `/dashboard`. Bir saldırgan kendi
 * hazırladığı bir kurtarma linkiyle kullanıcıyı dış siteye taşıyamasın diye
 * "başlıyor mu" değil "kümede mi" sorusu soruluyor.
 */
const ALLOWED_NEXT: ReadonlySet<string> = new Set([RECOVERY_PATH]);

/** `next` parametresini güvenli bir hedefe çözer. Tanınmayan her değer → `/dashboard`. */
export function resolveNextPath(next: string | null | undefined): string {
    return typeof next === "string" && ALLOWED_NEXT.has(next) ? next : "/dashboard";
}

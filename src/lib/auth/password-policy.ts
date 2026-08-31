/**
 * Parola politikası — TEK kaynak.
 *
 * 2026-08-31 denetimi: kural dört yere kopyalanmıştı (`api/settings/user/password`,
 * `api/admin/users`, Ayarlar sayfası, Kullanıcılar sayfası) ve dördü de yalnız
 * `length >= 8` bakıyordu. Kopyalar ayrışır: biri sıkılaşır, diğeri geride kalır
 * ve zayıf olan kazanır. Bu yüzden kural tek dosyada.
 *
 * **Karmaşıklık kuralı (büyük harf + rakam + sembol) BİLEREK YOK.** NIST 800-63B
 * bunu önermiyor: kullanıcıları `Sifre123!` gibi tahmin edilebilir kalıplara itiyor
 * ve gerçek entropiyi artırmıyor. Bunun yerine **uzunluk** + **zayıf-liste** +
 * **bağlam reddi** (kendi e-postasını parola yapmak) kullanılıyor.
 *
 * Saf fonksiyon: DOM/ağ yok, hem sunucuda hem istemcide çalışır. Sunucu otoriter;
 * istemci aynı fonksiyonu UX için aynalar (repodaki `validateQuoteForSend` kalıbı).
 * Dönüş `string | null` — repodaki diğer doğrulayıcılarla aynı sözleşme.
 */

/** Alt sınır. 8'den 12'ye çıkarıldı (2026-08-31); kısa parola tek gerçek zayıflıktı. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * En yaygın/zayıf parolalar — TR ve EN. Kısa tutuldu bilerek: amaç kapsamlı bir
 * sızıntı veritabanı DEĞİL (o çevrimiçi sorgu ister), yalnız en bariz seçimleri
 * elemek. Türevler ayrıca yakalanıyor (aşağıdaki `stripTrailingNoise`).
 */
const WEAK_BASES = [
    "password", "parola", "sifre", "şifre", "qwerty", "asdasd", "qwertyui",
    "iloveyou", "admin", "administrator", "welcome", "letmein", "monkey",
    "dragon", "football", "baseball", "sunshine", "princess", "master",
    "istanbul", "ankara", "galatasaray", "fenerbahce", "besiktas", "trabzonspor",
    "deneme", "merhaba", "bilmiyorum", "hesabim", "kullanici", "roven",
] as const;

/** Türkçe karakterleri sadeleştirir — `ŞİFRE` ile `sifre` aynı sayılsın. */
function foldTurkish(s: string): string {
    return s
        .replace(/[İIı]/g, "i").replace(/[Şş]/g, "s").replace(/[Ğğ]/g, "g")
        .replace(/[Üü]/g, "u").replace(/[Öö]/g, "o").replace(/[Çç]/g, "c")
        .toLowerCase();
}

/** Sondaki rakam/ünlem/nokta gürültüsünü atar: `Sifre123!` → `sifre`. */
function stripTrailingNoise(s: string): string {
    return s.replace(/[0-9!.\-_*?]+$/u, "");
}

/** ≥6 uzunlukta aynı karakter tekrarı veya ardışık artan/azalan dizi. */
function hasTrivialRun(s: string): boolean {
    if (/(.)\1{5,}/u.test(s)) return true;
    let asc = 1, desc = 1;
    for (let i = 1; i < s.length; i++) {
        const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
        asc = d === 1 ? asc + 1 : 1;
        desc = d === -1 ? desc + 1 : 1;
        if (asc >= 6 || desc >= 6) return true;
    }
    return false;
}

/**
 * Parolayı politikaya göre denetler.
 *
 * @param password Ham parola.
 * @param context  Bağlam reddi için: kullanıcının e-postası (yerel adı parolada
 *                 geçemez). Verilmezse yalnız uzunluk + zayıf-liste + dizi bakılır.
 * @returns Hata mesajı (Türkçe, ne yapılacağını söyler) ya da `null` (geçerli).
 */
export function checkPasswordPolicy(
    password: string,
    context?: { email?: string | null },
): string | null {
    if (typeof password !== "string" || password.length === 0) {
        return "Şifre gerekli.";
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı. Uzun bir cümle, karışık kısa bir paroladan daha güvenli.`;
    }

    const folded = foldTurkish(password);
    const base = stripTrailingNoise(folded);

    for (const weak of WEAK_BASES) {
        const w = foldTurkish(weak);
        if (folded === w || base === w) {
            return "Bu şifre çok yaygın. Kimsenin tahmin edemeyeceği bir cümle seçin.";
        }
    }

    if (hasTrivialRun(folded)) {
        return "Şifre tekrar eden veya ardışık karakterlerden oluşamaz.";
    }

    // Bağlam reddi: kendi e-posta adını parola yapmak, parolayı yoksaymakla aynı şey.
    const local = foldTurkish((context?.email ?? "").split("@")[0] ?? "").trim();
    if (local.length >= 3 && folded.includes(local)) {
        return "Şifre e-posta adresinizi içeremez.";
    }

    return null;
}

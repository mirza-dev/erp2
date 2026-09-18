/**
 * `company_settings` şema uyumu — migration'ı henüz uygulanmamış bir kolona
 * yazma denemesini TANIR.
 *
 * Migration'lar canlıya Studio'dan elle uygulanıyor; kod ise önce gidiyor
 * (`dev:live` her gün canlı DB'ye karşı koşar). Bu arada yeni bir ayar alanı
 * kaydedilirse PostgREST PGRST204 ("column … not in schema cache") ile düşer ve
 * route bunu 500 "Beklenmeyen bir hata" diye basardı — kullanıcı neyin eksik
 * olduğunu hiç öğrenemezdi. Yardımcı bunu yazmadan ÖNCE yakalar (`select("*")`
 * o an var olan her kolonu döndürür → patch'teki anahtar satırda yoksa kolon
 * yok) ve route 409 + hangi migration'ın uygulanacağını söyleyen mesaj döner.
 */

export class CompanySettingsColumnMissingError extends Error {
    readonly columns: string[];

    constructor(columns: string[]) {
        super(`company_settings kolonu yok: ${columns.join(", ")}`);
        this.name = "CompanySettingsColumnMissingError";
        this.columns = columns;
    }
}

/** Kolon → onu ekleyen migration. Mesaj kullanıcıya uygulanacak dosyayı söyler. */
const COLUMN_MIGRATION: Record<string, string> = {
    quote_number_prefix: "073",
    quote_number_separator: "073",
    quote_validity_days: "106",
    document_accent_color: "112",
};

export function columnMissingMessage(columns: string[]): string {
    const migrations = [...new Set(columns.map((c) => COLUMN_MIGRATION[c]).filter(Boolean))].sort();
    const which = migrations.length > 0 ? `${migrations.join(", ")} numaralı migration` : "ilgili migration";
    return `Kaydedilemedi: veritabanına ${which} henüz uygulanmamış (${columns.join(", ")}). `
        + "Bu alanı eski hâline getirip diğer değişiklikleri kaydedebilirsiniz.";
}
